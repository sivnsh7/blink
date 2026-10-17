# Blink — Linux host monitor

A local-first monitoring dashboard. React 19 and Vite on the front end, Node, Express and `ws` behind it, reading `/proc` and `/sys` directly. CPU, memory, storage, network, graphics, sensors, battery and a read-only process table.

## Design

Warm paper surfaces, a single cobalt accent, Instrument Sans for interface text and IBM Plex Mono for every number. No gradients, no glow, no decorative lines.

The shell is a floating rounded rail: traffic-light dots, a Blink mark, a host identity card that expands to kernel and architecture details, grouped nav rows with soft active pills and a live process count, and a pinned connection row that toggles the telemetry stream. The rail collapses to icons; state for the rail, theme and view all persists.

Analytics use two hand-built SVG components rather than a charting dependency: `IsoBars`, an isometric bar chart for time series, and `Ring3D`, a tilted ring gauge for single percentages. Both are pure SVG, so they stay sharp at any density and cost nothing at runtime.

Light is the default; dark follows the system preference and can be pinned from the top bar, resolved before first paint so a stored preference never flashes the wrong theme.

## Requirements



- Linux host for `/proc`, `/sys`, and filesystem telemetry.
- Node.js 20+ and npm.
- Optional vendor tooling/drivers for additional GPU fields.

## Development

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`; Vite proxies the API and WebSocket to the local backend on `127.0.0.1:3002`.

Root scripts: `npm run dev`, `npm run build`, `npm start`, `npm test`.

## Production

```bash
npm install
npm run build
npm start
```

Open `http://127.0.0.1:3002`. Run backend checks with `npm test`.

## Security and boundaries

The agent binds to loopback (`127.0.0.1`) by default. WebSocket connections require an exact allowed browser Origin; defaults cover Vite development and the local production origin. Override with comma-separated `ALLOWED_ORIGINS`; do not use wildcards. To change host/port, set `HOST` and `PORT`. Do not expose this unauthenticated host/process telemetry endpoint on an untrusted network; adding remote access requires authentication and TLS.

This build is read-only: process termination, priority changes, CPU affinity changes, shell execution, and privilege escalation are not exposed. The process table is sampled and may miss short-lived processes.

## Metric caveats

- Values depend on the Linux kernel, hardware, drivers, and permissions. Missing data is unavailable, not a measured zero.
- CPU, disk, and network rates require counter deltas; initial values may be blank.
- Process RSS can include shared pages and is not a precise per-process physical-memory attribution.
- Virtual interfaces and layered block devices can report overlapping traffic/activity.
- GPU, sensors, battery, and frequency readings are vendor/driver/firmware-dependent.
- No remote collection, persistent database, packet capture, alerting, or fleet management is included.

Validate actual sensor/GPU readings on the target Linux machine; sandbox build validation cannot verify device-specific telemetry.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Local service status and capabilities |
| GET | `/api/snapshot` | Latest host snapshot |
| WebSocket | `/ws` | Snapshot and periodic updates; exact Origin allowlist |

## Project layout

```text
client/src/App.jsx            Shell: views, theme, rail, hash routing
client/src/views/             Overview, Processes, and the per-subsystem detail views
client/src/components/        Sidebar, Topbar, Stat, Icon, BlinkMark
client/src/components/charts/ IsoBars and Ring3D (hand-written SVG)
client/src/hooks/useMetrics.js  WebSocket stream with polling fallback
client/src/tokens.css         Design tokens, light and dark palettes
client/src/components.css     Component styles
server/index.js               Loopback REST/WebSocket/static server
server/metrics.js             Linux /proc and /sys collectors
server/metrics.test.js        Node built-in smoke test
```

Polling defaults to 1200ms; set `POLL_INTERVAL_MS` (500–10000) to change it.
