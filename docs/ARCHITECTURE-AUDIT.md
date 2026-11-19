# Blink architecture audit: state, UX, DX and AX

**Review date:** 2026-11-19  
**Audited baseline:** `main` at `936e33dc88f3b2e03a5d58462218238fb41db495`  
**Scope:** React client, Node.js/Express/WebSocket agent, telemetry samplers, tests and project guidance.

## Executive result

Blink already contains explicit reducers for its principal multi-phase workflows. The audit did **not** find a database-backed account lifecycle, payment flow, webhook pipeline, persistent queue, background job worker or session/onboarding workflow. Those patterns from generic Node.js audit prompts do not exist in this repository and were not invented as findings.

The highest-value issues were at the boundaries between explicit state and presentation:

1. The top bar used a socket-connected boolean as if it proved the telemetry sample was fresh. An open but silent WebSocket could therefore look healthy after the sample freshness timer had marked data stale.
2. A paused telemetry session could be presented as an HTTP polling fallback because the view did not distinguish the `paused` connection state.
3. The mobile drawer was translated off-screen but remained available to keyboard and assistive-technology navigation. It also lacked a dedicated close control and focus containment/restoration.
4. Some detail panels converted missing metrics to numeric zero, and some process summaries silently summed unavailable measurements as zero.
5. The Processes sort control said `MEM %` while sorting resident-set-size bytes.
6. The favicon still represented the retired red/brass Field Dossier identity after the interface moved to the blue/neutral observability design system.
7. A render-time exception had no app-level React error boundary, so one component failure could leave an empty application shell.

These findings were addressed in the accompanying implementation branch. Automated unit tests and a production build are used as the merge gate; a real browser/device visual review is still a separate validation step.

## Audit method

The review followed each mutable state holder to its events, transitions, asynchronous work, side effects and user-visible output. Candidate state machines were classified as:

- **Workflow state:** multiple phases with ordering constraints, asynchronous completion or invariants. Model with a reducer or explicit transition function.
- **Independent presentation state:** a preference, filter, search value or disclosure that has no meaningful multi-step lifecycle. Keep it simple.
- **External resource state:** a WebSocket, timer or request controller whose lifetime must be cleaned up. Keep the handle in a ref and expose the meaningful lifecycle through explicit state.
- **Unknown or unavailable data:** a measurement that has not been supplied is not a measured zero and must stay distinguishable in the UI.

The audit used code inspection, existing reducer and sampler tests, and current framework/accessibility guidance. It did not treat an AI-generated list as proof of a bug: each finding was checked against the actual code and its invariants.

## Client workflow inventory

| Workflow | State model | Events and invariants | Disposition |
|---|---|---|---|
| Navigation | `navigationReducer`: five valid routes plus drawer `open/closed` | `NAVIGATE`, `LOCATION_CHANGED`, `OPEN_DRAWER`, `CLOSE_DRAWER`, `ESCAPE`. Routes are allowlisted; navigation closes the drawer. Legacy hashes map to current workspaces. | Already explicit. Mobile focus and inert behavior were strengthened. |
| Telemetry transport and freshness | `telemetryReducer`: connection and snapshot freshness are separate dimensions | Socket open/close/error, retry, HTTP/stream sample, expiry, pause and stop. Paused/stopped states reject late samples; timestamps prevent older HTTP data replacing newer stream data. | Already explicit. Status presentation now consumes both dimensions rather than a connected boolean. |
| Audit request | `auditReducer`: `loading`, `ready`, `error` | Request, success, failure. An `AbortController` cancels replaced/unmounted requests; an older response cannot overwrite a newer request. | Already explicit. |
| Process inspection and termination | `processDialogReducer`: `closed`, `inspecting`, `confirming`, `terminating`, `succeeded`, `failed` | Protected processes cannot enter confirmation or termination. Retry/cancel are constrained by phase. A request generation ID rejects late completions; the sampled process start-time token guards against PID reuse. | Already explicit. The in-flight controller and operation ID remain resource handles, not duplicate UI booleans. |
| Identifier presentation | No masking/reveal state exists. Hostnames, PIDs and process names are rendered as reported by the agent. | Identifier visibility is no longer a client-side toggle. JSON export has a single explicit confirmation. | Intentionally removed; presentation hiding is not an access-control boundary. |
| Theme and sidebar density | `light/dark` and `expanded/collapsed` preferences | One user preference is selected at a time and persisted in local storage. | Kept as simple state; a reducer or external machine would add ceremony without adding invariants. |
| Process search, sort and filter | Search text plus independent sort/filter selections | Values can be combined freely; no ordered workflow or illegal combination exists. | Kept as independent state. Derived rows and totals remain computed from the source sample. |
| Identity disclosure and PSI disclosures | Local open/closed disclosure state | Native button and `details/summary` interactions. | Kept as simple presentation state. |

### Telemetry presentation correction

Connection state and data freshness are orthogonal. In particular:

- `streaming + stale` means the socket is open but the last accepted sample is old.
- `paused + fresh` means the user intentionally stopped polling; it is not an HTTP fallback.
- `polling + fresh` means an HTTP snapshot is currently being received.
- `unsupported + fresh` means HTTP fallback is working while WebSocket is unavailable.
- `retrying + stale` means the UI is reconnecting and must not imply live telemetry.

The UI now derives its label, tone and dot from a single `telemetryStatusView(connection, snapshot)` function. Tests cover the important combinations so these states cannot collapse back into a misleading `connected ? live : fallback` expression.

## Node.js and kernel-agent inventory

| Workflow | State model | Events and invariants | Disposition |
|---|---|---|---|
| HTTP server lifecycle | `serverLifecycleReducer`: `starting`, `running`, `stopping`, `stopped`, `failed` | Listening, stop, closed and fail events. Terminal states cannot be overwritten by a later stop/listen event. | Already explicit and tested. |
| WebSocket liveness | `socketLivenessReducer`: `alive`, `awaiting-pong`, `closed` | One heartbeat may await a pong; a second unanswered heartbeat closes the peer. Closed is terminal. | Already explicit and tested. |
| CPU/disk/network sampling baselines | Sampling-state helpers | A first sample initializes a baseline; only valid monotonic counter deltas over a positive interval produce rates. Process CPU baselines also bind to a process start-time identity. | Already explicit and tested. |
| Process signal endpoint | One guarded request, not a multi-step persisted workflow | Validates the signal, browser Origin when present, protected PIDs/kernel tasks and the sampled `startTimeTicks` before signaling. It does not automatically retry destructive requests. | No extra job state or idempotency layer is justified. |

The server has periodic telemetry sampling and WebSocket heartbeat/broadcast timers, but no persistent job queue or webhook dispatcher. There are no database records with overlapping `isVerified/isSuspended/deletedAt` status flags, nor server-side auth sessions or onboarding stages in this codebase. Generic audit prompts should be adapted to the application that actually exists.

## UX, DX and agent-experience changes

### Fixed in this pass

- **Visual identity:** updated the SVG favicon and in-app brand mark to the current dark tile/blue signal identity; versioned the favicon URL to avoid stale browser cache.
- **Truthful connection feedback:** the top bar now differentiates live stream, fresh HTTP polling, WebSocket fallback, stale data, reconnecting, paused and unavailable states.
- **Mobile navigation:** the hidden drawer is inert and hidden from the accessibility tree while closed; the open drawer contains keyboard focus, has a close button, and returns focus to its opener when closed.
- **Render recovery:** an app-level React error boundary presents a usable recovery screen and keeps the exception in developer logs instead of leaving the user with a blank shell.
- **Metric truthfulness:** missing CPU load, memory capacity, swap/zram, non-reclaimable memory, disk latency, filesystem capacity and network rates are not coerced to measured zero.
- **Process controls:** missing process measurements sort after known values; aggregate totals are shown only when all contributing samples are known; the memory sort label now matches RSS sorting.
- **Accessibility foundation:** keyboard-visible focus, reduced-motion support, descriptive control names and 44px primary touch targets remain part of the shared interface rules.

### Deliberately not added

- **XState:** current workflows are small and local. Reducers plus transition tests express their invariants without introducing actors, parallel statecharts or a new runtime dependency.
- **TLA+ specifications:** Blink does not currently coordinate distributed transactions, persisted queues or multi-party protocols whose safety would justify formal model checking. State transition tests are proportionate for the present architecture.
- **Generic database status enums/idempotency keys:** there is no database-backed lifecycle or webhook/job retry system to apply them to.
- **A state machine for every boolean:** theme, sidebar density, sort, search, filters and native disclosures are independent values, not tangled multi-phase workflows.

## Verification and remaining work

Run these commands for each candidate merge:

```bash
npm ci
npm test
npm run build
```

GitHub Actions runs the same install, test and build sequence. The current pipeline does not include Playwright, screenshot baselines, a screen-reader pass or browser-level keyboard/focus tests. Those should be added as a separate quality phase rather than claimed as complete by a passing unit suite.

Recommended browser matrix for that phase: 320px, 360px, 768px, 1024px and 1440px; light and dark themes; keyboard-only navigation; drawer open/close and focus return; reduced-motion preference; stale WebSocket with HTTP fallback; pause/resume; and empty/unavailable hardware metrics.

## References

- React, [Managing State](https://react.dev/learn/managing-state) and [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure): avoid redundant state and consolidate meaningful transitions.
- React, [useEffect](https://react.dev/reference/react/useEffect): effects synchronize external systems and require mirrored cleanup.
- W3C, [WCAG 2.2](https://www.w3.org/TR/WCAG22/): focus visibility, focus not obscured and minimum target-size guidance.
- W3C WAI, [Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum): 24×24 CSS pixel minimum or an applicable spacing exception; larger targets improve touch usability.
- MDN, [`rel` attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel): browser favicon selection and the separate iOS `apple-touch-icon` convention.
- Chen et al., [Automated Finite State Machine Extraction](https://doi.org/10.1145/3338502.3359760), ACM 2019: static FSM extraction is a real program-analysis topic; an LLM checklist is a discovery aid, not a substitute for checking transitions against code and tests.
- Nicolai Parlog, [Make Illegal States Unrepresentable](https://inside.java/2024/06/03/dop-v1-1-illegal-states/): use data representations that encode domain invariants where the language permits it.
