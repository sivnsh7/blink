import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { createTelemetryState, telemetryReducer } from '../lib/stateMachines.js';

/**
 * One telemetry stream, two transports. WebSocket is preferred; HTTP polling
 * is the fallback. Connection state and snapshot freshness are intentionally
 * modelled separately.
 */
const LIMIT = 120;
const emptyHistory = () => ({ cpu: [], memory: [], storage: [], disk: [], network: [] });
const sum = (rows, pick) => rows.reduce((total, row) => total + (Number(pick(row)) || 0), 0);

export function useMetrics() {
  const [metrics, setMetrics] = useState(null);
  const [history, setHistory] = useState(emptyHistory);
  const [transport, dispatch] = useReducer(telemetryReducer, undefined, createTelemetryState);

  const socket = useRef(null);
  const retry = useRef(null);
  const poller = useRef(null);
  const stopped = useRef(true);
  const attempts = useRef(0);
  const lastStamp = useRef(null);
  const historyRef = useRef(emptyHistory());
  const requestId = useRef(0);
  const requestController = useRef(null);

  const ingest = useCallback((data, source = 'stream') => {
    if (!data || typeof data !== 'object') return;

    const stamp = Number.isFinite(Number(data.timestamp)) ? Number(data.timestamp) : Date.now();
    // A delayed HTTP response must never roll the dashboard back behind a
    // newer WebSocket frame.
    if (lastStamp.current !== null && stamp < lastStamp.current) return;

    if (lastStamp.current === null || stamp > lastStamp.current) {
      lastStamp.current = stamp;
      const next = historyRef.current;
      const push = (key, value) => {
        if (value === null || value === undefined || !Number.isFinite(Number(value))) return;
        const series = next[key];
        series.push({ timestamp: stamp, value: Number(value) });
        if (series.length > LIMIT) series.splice(0, series.length - LIMIT);
      };

      push('cpu', data.cpu?.overall?.usage);
      push('memory', data.memory?.usagePercent);

      if (Array.isArray(data.disk)) {
        const mounted = data.disk.filter(
          (disk) => disk && disk.mountpoint && !/^(loop|ram)/.test(disk.name || '')
        );
        push(
          'storage',
          mounted.reduce((high, disk) => Math.max(high, Number(disk.usePercent) || 0), 0)
        );
        // Only mounted filesystems: counting a partition and its parent doubles I/O.
        push(
          'disk',
          sum(mounted.length ? mounted : data.disk, (disk) =>
            (Number(disk?.readBytesPerSec) || 0) + (Number(disk?.writeBytesPerSec) || 0)
          )
        );
      }

      if (Array.isArray(data.network)) {
        push(
          'network',
          sum(data.network, (network) =>
            (Number(network?.rxBytesPerSec) || 0) + (Number(network?.txBytesPerSec) || 0)
          )
        );
      }

      setHistory({
        cpu: next.cpu.slice(),
        memory: next.memory.slice(),
        storage: next.storage.slice(),
        disk: next.disk.slice(),
        network: next.network.slice(),
      });
    }

    setMetrics(data);
    dispatch({
      type: 'SNAPSHOT_RECEIVED',
      source,
      timestamp: stamp,
    });
  }, []);

  const load = useCallback(async () => {
    if (stopped.current) return;

    const currentRequest = ++requestId.current;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;

    try {
      const response = await fetch('/api/snapshot', {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error('Local agent returned HTTP ' + response.status);
      }

      const data = await response.json();
      if (currentRequest !== requestId.current || stopped.current) return;
      ingest(data, 'http');
    } catch (cause) {
      if (
        cause?.name === 'AbortError' ||
        currentRequest !== requestId.current ||
        stopped.current
      ) {
        return;
      }
      dispatch({
        type: 'SNAPSHOT_FAILED',
        message: cause?.message || 'Could not reach the local agent',
      });
    } finally {
      if (requestController.current === controller) requestController.current = null;
    }
  }, [ingest]);

  const connect = useCallback(() => {
    if (stopped.current) return;

    if (retry.current) {
      clearTimeout(retry.current);
      retry.current = null;
    }

    if (typeof WebSocket === 'undefined') {
      dispatch({
        type: 'SOCKET_UNSUPPORTED',
        message: 'This browser does not support WebSocket. Falling back to HTTP polling.',
      });
      return;
    }

    const previous = socket.current;
    if (previous) {
      socket.current = null;
      try {
        previous.close();
      } catch {
        // The previous socket may already be closing.
      }
    }

    dispatch({ type: 'RETRY' });

    const scheduleRetry = () => {
      if (stopped.current || retry.current) return;
      const delay = Math.min(15000, 750 * 2 ** Math.min(attempts.current++, 5));
      retry.current = setTimeout(() => {
        retry.current = null;
        dispatch({ type: 'RETRY' });
        connect();
      }, delay);
    };

    let ws;
    try {
      const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(scheme + '//' + window.location.host + '/ws');
    } catch (cause) {
      dispatch({ type: 'SOCKET_ERROR', message: cause?.message || 'Could not open the telemetry stream.' });
      dispatch({ type: 'SOCKET_CLOSED' });
      scheduleRetry();
      return;
    }

    socket.current = ws;

    ws.onopen = () => {
      if (socket.current !== ws || stopped.current) return;
      attempts.current = 0;
      dispatch({ type: 'SOCKET_OPEN' });
    };

    ws.onmessage = (event) => {
      if (socket.current !== ws || stopped.current) return;
      try {
        const frame = JSON.parse(event.data);
        ingest(frame?.data ?? frame, 'stream');
      } catch {
        dispatch({ type: 'STREAM_ERROR', message: 'Received an unreadable telemetry update.' });
      }
    };

    ws.onerror = () => {
      if (socket.current === ws) {
        dispatch({ type: 'SOCKET_ERROR', message: 'The telemetry stream encountered an error.' });
      }
    };

    ws.onclose = () => {
      if (socket.current !== ws) return;
      socket.current = null;
      if (stopped.current) return;
      dispatch({ type: 'SOCKET_CLOSED' });
      scheduleRetry();
    };
  }, [ingest]);

  const ensurePoller = useCallback(() => {
    if (poller.current) return;
    poller.current = setInterval(() => {
      const current = socket.current;
      const socketUnavailable =
        typeof WebSocket === 'undefined' || !current || current.readyState !== WebSocket.OPEN;
      if (socketUnavailable && !document.hidden && !stopped.current) {
        void load();
      }
    }, 5000);
  }, [load]);

  useEffect(() => {
    stopped.current = false;
    dispatch({ type: 'START' });
    void load();
    connect();

    ensurePoller();

    const onVisibilityChange = () => {
      const current = socket.current;
      const socketUnavailable =
        typeof WebSocket === 'undefined' || !current || current.readyState !== WebSocket.OPEN;
      if (!document.hidden && socketUnavailable && !stopped.current) {
        void load();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      stopped.current = true;
      requestId.current += 1;
      requestController.current?.abort();
      requestController.current = null;
      if (poller.current) clearInterval(poller.current);
      poller.current = null;
      if (retry.current) clearTimeout(retry.current);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      const current = socket.current;
      socket.current = null;
      try {
        current?.close();
      } catch {
        // The socket may already be closed.
      }
      dispatch({ type: 'STOP' });
    };
  }, [connect, ensurePoller, load]);

  const reconnect = useCallback(() => {
    stopped.current = false;
    requestId.current += 1;
    requestController.current?.abort();
    requestController.current = null;

    if (retry.current) {
      clearTimeout(retry.current);
      retry.current = null;
    }

    const previous = socket.current;
    socket.current = null;
    try {
      previous?.close();
    } catch {
      // The previous socket may already be closed.
    }

    attempts.current = 0;
    dispatch({ type: 'RECONNECT' });
    void load();
    connect();
    ensurePoller();
  }, [connect, ensurePoller, load]);

  const disconnect = useCallback(() => {
    stopped.current = true;
    if (poller.current) clearInterval(poller.current);
    poller.current = null;
    requestId.current += 1;
    requestController.current?.abort();
    requestController.current = null;

    if (retry.current) {
      clearTimeout(retry.current);
      retry.current = null;
    }

    const previous = socket.current;
    socket.current = null;
    try {
      previous?.close();
    } catch {
      // The previous socket may already be closed.
    }

    dispatch({ type: 'PAUSE' });
  }, []);

  return {
    metrics,
    history,
    connected: transport.connection === 'streaming',
    connectionState: transport.connection,
    snapshotState: transport.snapshot,
    error: transport.error,
    reconnect,
    disconnect,
    refresh: load,
  };
}
