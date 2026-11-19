# Blink State Machine Inventory

This document records the application workflows that previously depended on
combinations of booleans, nullable values, timer handles, socket properties,
and callback order. The implementation lives in the adjacent client/server
stateMachines.js modules and in the components/services that dispatch events.

## Client workflows

### Telemetry transport and snapshot freshness

The transport lifecycle and data freshness are separate dimensions.

| Dimension | States | Main transitions |
|---|---|---|
| Transport | stopped, connecting, streaming, retrying, polling, unsupported, paused | START/RECONNECT -> connecting; SOCKET_OPEN/stream frame -> streaming; close -> retrying; HTTP snapshot while disconnected -> polling; missing WebSocket support -> unsupported; user pause -> paused |
| Snapshot | empty, fresh, stale, unavailable | first accepted frame -> fresh; failed disconnected poll -> stale or unavailable |

Invariants: a paused/stopped transport ignores late frames; only the current HTTP
request may commit a result; an older timestamp cannot replace a newer snapshot;
a successful HTTP fallback does not claim the WebSocket is live; unsupported
WebSocket remains explicit while HTTP polling works. Reconnect does not create a
second poll interval.

### Audit request

loading -> ready or error. A retry (if added) returns to loading. The reducer
retains the last successful audit while a later request is loading or fails,
so an error does not create a contradictory loading + error flag combination.
The current view loads once on mount and aborts the request on unmount.

### Process dossier and termination

closed -> inspecting -> confirming -> terminating -> succeeded or failed.
A failed termination can return to terminating for retry or to inspecting
when cancelled. Opening another process resets the signal and prior result.
Closing invalidates pending UI responses. A single in-flight guard prevents
double submissions; a stale success timer cannot close a subsequently opened
dossier. PID 1, non-positive PIDs, and kernel tasks cannot enter confirmation or
termination states. Server-side safety checks remain authoritative.

### Navigation and responsive drawer

The route is one of the declared view IDs, and drawer visibility is open or
closed. NAVIGATE updates the route and closes the drawer; LOCATION_CHANGED
synchronizes Back/Forward and direct hash navigation; ESCAPE closes the drawer.
Unknown hashes resolve to overview. The URL remains the navigation source for
browser history events.

### Ambient headline glitch

`idle -> scrambling -> holding -> idle`. The scramble interval, strike delay and hold timeout are all owned by the effect and cancelled on text change/unmount. Stale tick/complete events are ignored unless the machine is in the matching phase. Reduced-motion preference leaves the machine idle. Pointer parallax remains a requestAnimationFrame-throttled presentation effect rather than application workflow state.

### Redaction and local reveal

Global mode is masked or unmasked; local reveals are a set of item keys.
A local reveal is allowed only while masked. Re-enabling the global mask clears
all local exceptions. Forced masks remain component-level and cannot be
overridden by this state machine.

## Server workflows

### Server lifecycle

starting -> running -> stopping -> stopped, with starting or running -> failed.
Terminal states reject later lifecycle events. Repeated shutdown signals are
idempotent. The scheduler is not allowed to schedule another collection after
shutdown begins.

### WebSocket peer liveness

alive -> awaiting-pong -> alive; a second heartbeat while still awaiting a pong
moves to closed. CLOSE and ERROR also move to closed. Closed peers are removed
from the broadcast set.

### Metric sampling baselines

CPU, disk and network baselines move from uninitialized -> ready. A first
sample has no prior value and therefore cannot produce a rate. Each valid
subsequent sample carries the measured positive elapsed interval. A zero or
backwards clock delta replaces the baseline and suppresses that sample's rate.
Per-process CPU baselines explicitly mark each PID as uninitialized/ready and
are pruned when the process disappears.

## Deliberately simple local state

Theme, desktop rail collapse, the host identity disclosure, ticker pause,
process filter/sort controls, and the native PSI <details> disclosures remain
simple preference/disclosure controls. Browser-native disclosure widgets already
provide a well-defined open/closed lifecycle. They have two independent values,
no asynchronous work, no invalid transition combinations, and no cross-component
lifecycle. A reducer would add indirection without strengthening their
invariants.

## Verification

The pure reducers and sampling-baseline transitions are covered by Node's
built-in test runner. Run npm test and npm run build from the repository root.
These checks do not replace Linux-host integration testing or browser
accessibility testing.
