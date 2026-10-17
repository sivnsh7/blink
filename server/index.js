import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
} from './metrics.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
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
  return {
    cpu: safe(getCpuMetrics, null),
    memory: safe(getMemoryMetrics, null),
    disk: safe(getDiskMetrics, []),
    network: safe(getNetworkMetrics, []),
    processes: safe(getProcessMetrics, []),
    gpu: safe(getGpuMetrics, []),
    sensors: safe(getSensorMetrics, []),
    battery: safe(getBatteryMetrics, []),
    system: safe(getSystemInfo, null),
    timestamp: Date.now(),
  };
}

app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  // Only API responses are uncacheable; hashed assets keep their ETag.
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});

app.get('/api/health', (req, res) =>
  res.json({
    ok: true,
    service: 'blink-local-agent',
    schemaVersion: 1,
    host,
    port,
    intervalMs: interval,
    processControl: false,
  })
);

let latest = collect();

app.get('/api/snapshot', (req, res) => res.json(latest));

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

const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });
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
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
  ws.send(JSON.stringify({ type: 'snapshot', data: latest }));
});

// Drop half-open sockets instead of broadcasting to them forever.
const heartbeat = setInterval(() => {
  for (const ws of clients) {
    if (ws.isAlive === false) {
      clients.delete(ws);
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      clients.delete(ws);
    }
  }
}, 30000);

function broadcast(frame) {
  for (const ws of clients) {
    if (ws.readyState !== 1) continue;
    // Never let one stalled client grow an unbounded send buffer.
    if (ws.bufferedAmount > MAX_BUFFERED) {
      clients.delete(ws);
      ws.terminate();
      continue;
    }
    ws.send(frame, (error) => {
      if (error) clients.delete(ws);
    });
  }
}

let timer = null;

function scheduleNext() {
  timer = setTimeout(() => {
    latest = collect();
    broadcast(JSON.stringify({ type: 'update', data: latest }));
    scheduleNext();
  }, interval);
  timer.unref?.();
}

scheduleNext();

server.on('error', (error) => {
  console.error('HTTP server error:', error.message);
  clearInterval(heartbeat);
  clearTimeout(timer);
  process.exit(1);
});

server.listen(port, host, () =>
  console.log(`Blink local agent listening at http://${host}:${port}`)
);

let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearTimeout(timer);
  clearInterval(heartbeat);
  for (const ws of clients) ws.close();
  server.close(() => process.exit(code));
  setTimeout(() => process.exit(code), 3000).unref();
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
