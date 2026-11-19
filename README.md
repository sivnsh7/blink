# Blink — Linux Host Observability

Blink is a local-first dashboard for monitoring one Linux host. It reads kernel
telemetry from procfs and sysfs, streams snapshots to a React interface, exposes
process inventory and guarded process signaling, and provides PSI and kernel
security observations.

## Product workspace

Blink is organized into five focused workspaces:

- **Overview** — current resource summary, short-lived in-session trends, host
  metadata, sampled processes and privacy-aware export.
- **Processes** — searchable process inventory, privilege classification,
  sorting, filtering, process details and confirmed signal controls.
- **Performance** — CPU, memory, swap, storage and network measurements.
- **Hardware** — graphics, thermal sensors, fans and battery information when
  exposed by the Linux drivers.
- **Diagnostics** — Linux Pressure Stall Information (PSI), kernel security
  observations and a heuristic assessment with evaluated-check coverage.

The interface includes light/dark themes, visual masking, responsive layouts and
legacy URL redirects for the previous hardware pages.

## Quick start

Requirements: Linux, Node.js 20 or newer, and npm.

```bash
git clone https://github.com/sivnsh7/blink.git
cd blink
npm install
npm run dev
```

The Vite client runs on `http://127.0.0.1:5173`; the local agent defaults to
`http://127.0.0.1:3002`.

For a production build:

```bash
npm test
npm run build
npm start
```

## Architecture

- **Client:** React 19 and Vite.
- **Agent:** Node.js, Express and WebSocket.
- **Telemetry:** direct reads of Linux virtual filesystems; no shell pipelines in
  the regular sampling path.
- **Transport:** WebSocket updates with HTTP snapshot fallback when the stream
  is unavailable.
- **Charts:** compact SVG components built in the repository, with no large
  charting dependency.
- **History:** recent telemetry samples are held in the active browser session;
  the application is not a persistent time-series database.

## Telemetry and diagnostics

The agent collects CPU counters and frequency, memory, block devices and mounted
filesystems, network throughput, process statistics, graphics data, hardware
sensors, battery data, PSI and selected kernel security settings. Unsupported or
unreadable metrics are reported as unavailable instead of being presented as
a measured zero.

The heuristic diagnostics score is an observation aid, not a security
certification. It reports evaluated-check coverage and recommendations derived
from the available snapshot.

## Process safety

Process signaling is a privileged, destructive operation. Blink:
- Rejects invalid/non-positive PIDs and PID 1.
- Blocks kernel-task termination and self-termination of the Blink agent.
- Allows only SIGTERM, SIGKILL and SIGINT.
- Requires explicit confirmation in the interface.
- Checks the sampled process start-time token before sending a signal, reducing
  the chance that a recycled PID is mistaken for the process the user inspected.
- Validates browser Origin for mutating requests when an Origin header is sent.

The start-time check is a second identity check before signaling, not an atomic
kernel pidfd operation; a narrow time-of-check/time-of-use window remains.

## Security boundary

> **Blink is intended for local workstation use.**

The server binds to `127.0.0.1` by default. It does not provide user
authentication or authorization for remote users. Overriding `HOST` to a
non-loopback address exposes telemetry and process-control endpoints without
enterprise authentication. Do not expose it to an untrusted network; use a
proper authenticated access layer and network isolation before any remote use.

Visual masking and masked export reduce accidental disclosure. They do not
replace authentication, authorization, encryption or operating-system access
controls.

## API

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Agent health and capability metadata |
| GET | `/api/snapshot` | Latest CPU, memory, storage, network, process and hardware snapshot |
| GET | `/api/audit` | Heuristic evaluation of the current snapshot |
| POST | `/api/processes/:pid/kill` | Confirmed process signal operation |
| WS | `/ws` | Live telemetry frames |

The process signal endpoint accepts a JSON body with `signal` and the sampled
`startTimeTicks` identity token. HTTP 409 means that the PID now refers to a
different process than the one inspected; refresh the process list before
retrying.

## Engineering documentation

- [Redesign plan and component contract](docs/REDESIGN-PLAN.md)
- [Client/server state-machine inventory](docs/STATE-MACHINES.md)
- [Architecture, implicit-state and UX audit](docs/ARCHITECTURE-AUDIT.md)

The CI workflow runs dependency installation, the automated test suite and the
production build on pushes to main and pull requests targeting main.

## License

MIT. See [LICENSE.txt](LICENSE.txt).
