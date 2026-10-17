import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * One telemetry stream, two transports. WebSocket is the source of truth;
 * a 5s poll keeps the view alive when the socket is down.
 *
 * History holds scalars only — percentage series for cpu/memory/storage,
 * aggregate bytes-per-second for disk/network. Charts can then treat every
 * series the same way.
 */

const LIMIT = 120;
const emptyHistory = () => ({ cpu: [], memory: [], storage: [], disk: [], network: [] });

const sum = (rows, pick) => rows.reduce((total, row) => total + (Number(pick(row)) || 0), 0);

export function useMetrics() {
  const [metrics, setMetrics] = useState(null);
  const [history, setHistory] = useState(emptyHistory);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);

  const socket = useRef(null);
  const retry = useRef(null);
  const poller = useRef(null);
  const stopped = useRef(true);
  const attempts = useRef(0);
  const lastStamp = useRef(null);
  const historyRef = useRef(emptyHistory());

  const ingest = useCallback((data) => {
    if (!data || typeof data !== 'object') return;
    const stamp = Number.isFinite(Number(data.timestamp)) ? Number(data.timestamp) : Date.now();

    if (stamp !== lastStamp.current) {
      lastStamp.current = stamp;
      const next = historyRef.current;
      const push = (key, value) => {
        if (value === null || value === undefined || !Number.isFinite(Number(value))) return;
        const arr = next[key];
        arr.push({ timestamp: stamp, value: Number(value) });
        if (arr.length > LIMIT) arr.splice(0, arr.length - LIMIT);
      };

      push('cpu', data.cpu?.overall?.usage);
      push('memory', data.memory?.usagePercent);

      if (Array.isArray(data.disk)) {
        const mounted = data.disk.filter((d) => d && d.mountpoint && !/^(loop|ram)/.test(d.name || ''));
        push('storage', mounted.reduce((high, d) => Math.max(high, Number(d.usePercent) || 0), 0));
        // Only mounted filesystems: counting a partition and its parent doubles I/O.
        push('disk', sum(mounted.length ? mounted : data.disk, (d) => (Number(d?.readBytesPerSec) || 0) + (Number(d?.writeBytesPerSec) || 0)));
      }
      if (Array.isArray(data.network)) {
        push('network', sum(data.network, (n) => (Number(n?.rxBytesPerSec) || 0) + (Number(n?.txBytesPerSec) || 0)));
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
    setError(null);
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/snapshot', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Local agent returned HTTP ${response.status}`);
      ingest(await response.json());
    } catch (cause) {
      if (!stopped.current) setError(cause?.message || 'Could not reach the local agent');
    }
  }, [ingest]);

  const connect = useCallback(
    (force = false) => {
      if (stopped.current) return;
      if (retry.current) {
        clearTimeout(retry.current);
        retry.current = null;
      }

      const previous = socket.current;
      if (previous) {
        socket.current = null;
        try {
          previous.close();
        } catch {
          /* already closing */
        }
      }

      if (!force && typeof WebSocket === 'undefined') {
        setError('This browser does not support WebSocket. Falling back to polling.');
        return;
      }

      let ws;
      try {
        const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${scheme}//${window.location.host}/ws`);
      } catch {
        setError('Could not open the telemetry stream.');
        return;
      }

      socket.current = ws;

      ws.onopen = () => {
        if (socket.current !== ws) return;
        attempts.current = 0;
        setConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const frame = JSON.parse(event.data);
          ingest(frame?.data ?? frame);
        } catch {
          setError('Received an unreadable telemetry update.');
        }
      };

      ws.onerror = () => {
        if (socket.current === ws) setConnected(false);
      };

      ws.onclose = () => {
        if (socket.current !== ws) return;
        socket.current = null;
        setConnected(false);
        if (stopped.current) return;
        const delay = Math.min(15000, 750 * 2 ** Math.min(attempts.current++, 5));
        retry.current = setTimeout(() => connect(false), delay);
      };
    },
    [ingest]
  );

  useEffect(() => {
    stopped.current = false;
    void load();
    connect(false);
    poller.current = setInterval(load, 5000);
    return () => {
      stopped.current = true;
      if (poller.current) clearInterval(poller.current);
      if (retry.current) clearTimeout(retry.current);
      const ws = socket.current;
      socket.current = null;
      try {
        ws?.close();
      } catch {
        /* already closing */
      }
    };
  }, [load, connect]);

  const reconnect = useCallback(() => {
    // An explicit reconnect must restart the stream even if it is already up.
    // Clear the old poller first: each call would otherwise stack another 5s
    // interval on top of the last one.
    if (poller.current) clearInterval(poller.current);
    stopped.current = false;
    void load();
    connect(true);
    poller.current = setInterval(load, 5000);
  }, [load, connect]);

  const disconnect = useCallback(() => {
    stopped.current = true;
    if (poller.current) clearInterval(poller.current);
    if (retry.current) {
      clearTimeout(retry.current);
      retry.current = null;
    }
    const ws = socket.current;
    socket.current = null;
    try {
      ws?.close();
    } catch {
      /* already closing */
    }
    setConnected(false);
  }, []);

  return { metrics, history, connected, error, reconnect, disconnect, refresh: load };
}
