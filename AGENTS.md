# Blink engineering guidance

## Product and visual direction
- Treat Blink as a local-first Linux host observability console, not a marketing site or remote fleet SaaS.
- Follow the shared tokens in client/src/tokens.css. Do not introduce raw component colors, arbitrary radii, hard-offset shadows or unreviewed font families.
- Preserve the five workspace destinations: Overview, Processes, Performance, Hardware and Diagnostics.
- Prefer clear hierarchy and measured density over decorative hero effects, redundant cards, uppercase metadata, auto-scrolling ribbons or ornamental animation.
- Do not claim a metric is zero, healthy, unsupported or absent when the source has not supplied enough data. Preserve null/unknown states.

## Accessibility and interaction
- Use semantic landmarks, correctly ordered headings, anchors for navigation and buttons for actions.
- Every interactive control needs a visible focus state and an accessible name. Do not make a table row act as a button; use an explicit action in the row.
- Maintain keyboard operation and correct dialog focus behavior. Destructive actions require explicit confirmation and clear progress/success/failure feedback.
- Target at least 44px controls on touch layouts; form inputs should be at least 16px on mobile.
- Respect prefers-reduced-motion. Avoid autoplay motion in operational views.
- Ensure loading, empty, unavailable, stale and error states remain distinct.

## React and state
- Keep derived values derived; avoid duplicate or contradictory state.
- Use reducers for multi-phase workflows with meaningful invariants, not simple preferences and form inputs.
- Abort or invalidate obsolete asynchronous requests and clean up timers, listeners, sockets and observers.
- Do not treat PID as a stable process identity; use the sampled start-time token when signaling.

## Security and operations
- Preserve the loopback default and server-side process guardrails.
- Visual masking is not authentication or access control.
- Never add public host binding, remote command access, credentials or deployment changes without explicit authorization.
- Do not trigger a production deployment during UI development.

## Verification
- Run npm test and npm run build before merge.
- Review keyboard access, focus, contrast, narrow viewport overflow and reduced-motion behavior.
- Document any test or live-host validation that could not be completed.
