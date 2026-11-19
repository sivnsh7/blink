import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createServerLifecycleState,
  serverLifecycleReducer,
  socketLivenessReducer,
} from './stateMachines.js';
import {
  getCpuMetrics,
  getMemoryMetrics,
  getDiskMetrics,
  getNetworkMetrics,
  getProcessMetrics,
  getGpuMetrics,
  getSensorMetrics,
  getBatteryMetrics,
  getSystemInfo,
  getPsiMetrics,
  getSecurityMetrics,
  getHostAudit,
  killHostProcess,
} from './metrics.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
let lifecycle = createServerLifecycleState();

function transitionLifecycle(event) {
  const next = serverLifecycleReducer(lifecycle, event);
  if (next === lifecycle) return false;
  lifecycle = next;
  return true;
}

const port = Number(process.env.PORT) || 3002;
const host = process.env.HOST || '127.0.0.1';

// Number('') is 0 and Number('fast') is NaN; neither should become a 1 ms spin.
const requestedInterval = Number(process.env.POLL_INTERVAL_MS);
const interval = Number.isFinite(requestedInterval)
  ? Math.max(500, Math.min(10000, requestedInterval))
  : 1200;

const defaultOrigins = [
  `http://localhost:5173`,
  `http://127.0.0.1:5173`,
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
];
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || defaultOrigins.join(','))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

const safe = (fn, fallback) => {
  try {
    return fn();
  } catch (error) {
    console.warn('Metric unavailable:', error.message);
    return fallback;
  }
};

const publicDir = path.join(here, 'public');

function collect() {
  const disk = safe(getDiskMetrics, []);
  const procs = safe(getProcessMetrics, []);

  return {
    cpu: safe(getCpuMetrics, null),
    memory: safe(getMemoryMetrics, null),
    disk,
    storage: {
      blockDevices: disk?.blockDevices || [],
      filesystems: disk?.filesystems || [],
      rootFilesystem: disk?.rootFilesystem || null,
    },
    processes: procs,
    processesInfo: {
      sampledCount: procs?.sampledCount ?? procs?.length ?? 0,
      totalSeen: procs?.totalSeen ?? procs?.length ?? 0,
    },
    network: safe(getNetworkMetrics, []),
    gpu: safe(getGpuMetrics, []),
    sensors: safe(getSensorMetrics, []),
    battery: safe(getBatteryMetrics, []),
    system: safe(getSystemInfo, null),
    psi: safe(getPsiMetrics, null),
    security: safe(getSecurityMetrics, null),
    timestamp: Date.now(),
  };
}

app.disable('x-powered-by');
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
  // Only API responses are uncacheable; hashed assets keep their ETag.
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});

app.get('/api/health', (req, res) =>
  res.json({
    ok: true,
    service: 'blink-host-agent',
    designSystem: 'blink-observability-v1',
    architecture: 'linux-procfs-sysfs-local-observability',
    schemaVersion: 3,
    host,
    port,
    isLoopback: host === '127.0.0.1' || host === 'localhost',
    intervalMs: interval,
    processControl: true,
    features: ['procfs', 'sysfs', 'psi', 'security-observations', 'host-audit', 'sanitized-export', 'process-termination'],
  })
);

app.get('/api/audit', (req, res) => {
  try {
    const audit = getHostAudit(latest);
    res.json({ ok: true, audit });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

let latest = collect();

app.get('/api/snapshot', (req, res) => res.json(latest));

app.post('/api/processes/:pid/kill', (req, res) => {
  const origin = req.headers.origin;
  if (origin !== undefined && !allowedOrigins.has(origin)) {
    return res.status(403).json({ ok: false, error: 'Cross-origin request rejected' });
  }

  const pid = req.params.pid;
  const signal = req.body?.signal || 'SIGTERM';
  const expectedStartTimeTicks = req.body?.startTimeTicks ?? null;

  try {
    const result = killHostProcess(pid, signal, expectedStartTimeTicks);
    latest = collect();
    res.json({ ok: true, result });
  } catch (err) {
    const identityUnverified = err.message.includes('Unable to verify process identity') ||
      err.message.includes('Unable to parse process identity');
    const missingIdentity = err.message.includes('start-time identity token is required');
    const isForbidden =
      err.message.includes('Permission denied') ||
      err.message.includes('kernel task') ||
      err.message.includes('Self-termination') ||
      err.message.includes('PID 1');
    const isNotFound = err.message.includes('does not exist') || err.message.includes('not found');
    const identityChanged = err.message.includes('Process identity changed');
    const statusCode = identityChanged || identityUnverified || missingIdentity ? 409 : isForbidden ? 403 : isNotFound ? 404 : 400;
    res.status(statusCode).json({ ok: false, error: err.message });
  }
});

app.use(express.static(publicDir, { fallthrough: true, etag: true, index: false }));

// SPA fallback: serve the shell for app routes only. Anything with a file
// extension (a missing bundle, a favicon) is a real 404, and /api never falls
// through — a typo must fail loudly instead of returning HTML.
app.get('*', (req, res, next) => {
  const requestPath = req.path;
  if (requestPath === '/api' || requestPath.startsWith('/api/')) {
    return res.status(404).json({ ok: false, error: 'Unknown API route' });
  }
  if (path.extname(requestPath)) return next();
  return res.sendFile(path.join(publicDir, 'index.html'), (error) => {
    if (error && !res.headersSent) next();
  });
});

app.use((req, res) => res.status(404).type('text/plain').send('Not found'));

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
const clients = new Set();
const MAX_BUFFERED = 4 * 1024 * 1024;

server.on('upgrade', (req, socket, head) => {
  let pathname = '';
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch {
    /* malformed URL falls through to the reject branch */
  }
  const origin = req.headers.origin;
  // A browser always sends Origin. A local script does not, and that is not a
  // cross-origin request — only enforce the allowlist when one is present.
  const rejected = pathname !== '/ws' || (origin !== undefined && !allowedOrigins.has(origin));
  if (rejected) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.livenessState = 'alive';
  ws.on('pong', () => {
    ws.livenessState = socketLivenessReducer(ws.livenessState, { type: 'PONG' });
  });
  ws.on('close', () => {
    ws.livenessState = socketLivenessReducer(ws.livenessState, { type: 'CLOSE' });
    clients.delete(ws);
  });
  ws.on('error', () => {
    ws.livenessState = socketLivenessReducer(ws.livenessState, { type: 'ERROR' });
    clients.delete(ws);
  });
  ws.send(JSON.stringify({ type: 'snapshot', data: latest }));
});

// A peer must answer each ping before the following heartbeat.
const heartbeat = setInterval(() => {
  for (const ws of clients) {
    if (ws.readyState !== 1) {
      ws.livenessState = socketLivenessReducer(ws.livenessState, { type: 'CLOSE' });
      clients.delete(ws);
      continue;
    }

    const nextState = socketLivenessReducer(ws.livenessState, { type: 'PING_SENT' });
    if (nextState === 'closed') {
      clients.delete(ws);
      ws.terminate();
      continue;
    }

    ws.livenessState = nextState;
    try {
      ws.ping();
    } catch {
      ws.livenessState = socketLivenessReducer(ws.livenessState, { type: 'ERROR' });
      clients.delete(ws);
    }
  }
}, 30000);

function broadcast(frame) {
  for (const ws of clients) {
    if (ws.readyState !== 1) continue;
    // Never let one stalled client grow an unbounded send buffer.
    if (ws.bufferedAmount > MAX_BUFFERED) {
      ws.livenessState = socketLivenessReducer(ws.livenessState, { type: 'CLOSE' });
      clients.delete(ws);
      ws.terminate();
      continue;
    }
    ws.send(frame, (error) => {
      if (error) {
        ws.livenessState = socketLivenessReducer(ws.livenessState, { type: 'ERROR' });
        clients.delete(ws);
      }
    });
  }
}

let timer = null;

function scheduleNext() {
  if (!['starting', 'running'].includes(lifecycle.phase)) return;
  timer = setTimeout(() => {
    timer = null;
    if (!['starting', 'running'].includes(lifecycle.phase)) return;
    latest = collect();
    broadcast(JSON.stringify({ type: 'update', data: latest }));
    scheduleNext();
  }, interval);
  timer.unref?.();
}

scheduleNext();

server.on('error', (error) => {
  console.error('HTTP server error:', error.message);
  if (!transitionLifecycle({ type: 'FAIL', code: 1 })) return;
  clearInterval(heartbeat);
  clearTimeout(timer);
  timer = null;
  for (const ws of clients) {
    ws.livenessState = socketLivenessReducer(ws.livenessState, { type: 'ERROR' });
    ws.terminate();
  }
  clients.clear();
  process.exit(1);
});

server.listen(port, host, () => {
  transitionLifecycle({ type: 'LISTENING' });
  console.log(`Blink local agent listening at http://${host}:${port}`);
  if (host !== '127.0.0.1' && host !== 'localhost') {
    console.warn(
      `[SECURITY WARNING] Blink is bound to '${host}'. Endpoints and WebSockets are exposed to external network clients without authentication.`
    );
  }
});

let shutdownTimer = null;

function stop(code = 0) {
  if (!transitionLifecycle({ type: 'STOP', code })) return;

  clearTimeout(timer);
  timer = null;
  clearInterval(heartbeat);

  for (const ws of clients) {
    ws.livenessState = socketLivenessReducer(ws.livenessState, { type: 'CLOSE' });
    ws.close();
  }
  clients.clear();

  const finish = () => {
    transitionLifecycle({ type: 'CLOSED' });
    if (shutdownTimer) clearTimeout(shutdownTimer);
    shutdownTimer = null;
    process.exit(code);
  };

  shutdownTimer = setTimeout(() => process.exit(code), 3000);
  shutdownTimer.unref?.();

  try {
    server.close(finish);
  } catch {
    finish();
  }
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
