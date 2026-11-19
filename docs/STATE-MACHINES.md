# Blink state-machine inventory

This inventory describes the stateful workflows in the current host observability
console. It distinguishes workflows with phases and invariants from ordinary
preferences, filters and presentation state.

## Client workflows

### 1. Telemetry transport and snapshot freshness

These are two independent dimensions.

| Dimension | States | Events / transitions |
|---|---|---|
| Transport | stopped, connecting, streaming, retrying, polling, unsupported, paused | START / RECONNECT → connecting; SOCKET_OPEN → streaming; SOCKET_CLOSED → retrying; HTTP snapshot after disconnect → polling; unsupported browser transport → unsupported; PAUSE → paused; STOP → stopped |
| Snapshot | empty, fresh, stale, unavailable | accepted frame → fresh; SNAPSHOT_EXPIRED → stale; failed HTTP fallback → stale or unavailable; accepted newer sample → fresh |

Invariants:
- A paused or stopped transport ignores late network and timer events.
- Only the current HTTP request may commit a result; late responses from aborted requests are ignored.
- A sample older than the most recently accepted timestamp cannot roll telemetry backwards.
- Freshness expires after 8 seconds without an accepted sample, even if the WebSocket never emits a close event.
- A successful HTTP fallback does not claim that the WebSocket is streaming.
- The HTTP fallback interval is created once and polls only when the stream is unavailable and the page is visible.
- Reconnect clears the previous retry timer and invalidates any in-flight HTTP request.

### 2. Audit request

loading → ready | error. A new request retains the last successful result; failure does not erase useful previous data. Requests are aborted on unmount. The UI distinguishes “no recommendations” from a verified secure posture and shows evaluated-check coverage.

### 3. Process selection and termination

closed → inspecting → confirming → terminating → succeeded | failed. A failed request can be retried or cancelled. Opening a new process resets the previous result and signal selection.

Invariants:
- Missing, invalid, non-positive and PID 1 values cannot enter the destructive path.
- Kernel tasks cannot enter confirmation or termination.
- The UI prevents duplicate submissions and blocks closing the dialog while a termination request is in flight, avoiding a misleading cancelled state after the server may already have received the signal.
- A process start-time token is mandatory. The server re-reads `/proc/<pid>/stat` immediately before signaling and fails closed if the process cannot be verified or the token differs. This prevents the common recycled-PID mismatch; it is not an atomic pidfd operation, so a narrow kernel-level time-of-check/time-of-use window remains.
- Request IDs prevent stale completion events from changing a newer dialog.
- Only the active successful operation may schedule the confirmation-close timer.
- The server remains authoritative for privilege, PID, kernel-task and signal validation.

### 4. Navigation and mobile drawer

The route is one of overview, processes, performance, hardware or diagnostics. Drawer state is open or closed. NAVIGATE and LOCATION_CHANGED update the route and close the drawer; ESCAPE closes the drawer. Browser history remains synchronized. Old bookmarks map as follows: CPU/memory/storage/network → performance; graphics/sensors/battery → hardware; audit → diagnostics.

### 5. Redaction

Global mode is masked or unmasked; local reveal exceptions are a set of keys. A local reveal is allowed only while global masking is enabled. Turning global masking back on clears all local exceptions. Redaction is presentation-layer protection only and must never be described as a confidentiality or authorization boundary.

### 6. Remaining interaction state

Process search, deferred query, sort and filter are local derived/presentation state. Sidebar identity disclosure and rail collapse are simple preferences. Theme is a persisted preference. They do not have multi-phase asynchronous lifecycles, so a reducer would add ceremony without stronger invariants.

The previous ambient glitch and high-frequency ticker presentation were removed from the primary console. Their timer/animation lifecycles are no longer needed. Native disclosure state remains browser-managed where appropriate.

## Server workflows

### 1. Agent lifecycle

starting → running → stopping → stopped, with starting or running → failed. Terminal states reject later lifecycle events. Shutdown is idempotent; the collection scheduler cannot schedule another sample after shutdown begins.

### 2. WebSocket peer liveness

alive → awaiting-pong → alive. A second heartbeat without a pong, CLOSE or ERROR moves the peer to closed. Closed peers are removed from the broadcast set.

### 3. System sampling baselines

CPU, disk and network baselines move from uninitialized → ready. A first observation cannot produce a rate. Only positive elapsed time and monotonic counters produce a delta; invalid intervals reset the baseline and suppress the rate.

### 4. Per-process sampling identity

Each PID has an uninitialized or ready baseline tied to the Linux process start-time ticks. A new start-time value is a new process identity, not a continuation of the old process. Missing first-sample values, counter rollback or non-positive time produce null CPU percentages instead of fabricated zeroes. Baselines for processes no longer present are pruned.

### 5. Process signal operation

The HTTP endpoint validates origin, PID, signal and kernel-task protection. When a client supplies start-time ticks, the server re-reads the process stat file immediately before signaling. If the start time differs, the request returns HTTP 409 and sends no signal. This closes the PID-reuse gap between a sample and a delayed user confirmation.

## Verification

Pure client reducers are covered by the client state-machine test suite. Server lifecycle, WebSocket liveness and sampling baselines are covered by Node's built-in test runner. Run:

```
npm test
npm run build
```

These checks do not replace Linux-host integration testing, browser keyboard/screen-reader testing, or validation on a real host with representative sensors and devices.
