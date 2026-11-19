# Blink redesign plan and implementation contract

## Product direction

Blink is a local-first Linux host observability console for developers and
operators inspecting one host. It is not a hosted fleet-management service,
security certification product or remote command platform.

## Navigation model

The primary workspace contains five destinations:

1. **Overview** — host summary, current CPU/memory/storage/network measurements,
   recent sample trends, host metadata, top sampled processes and masked export.
2. **Processes** — bounded process inventory, filter/search/sort, details and
   explicitly confirmed signals.
3. **Performance** — CPU, memory, storage and network details grouped in a single
   resource workspace with in-page jump links.
4. **Hardware** — graphics adapters, thermal sensors, cooling fans and battery.
5. **Diagnostics** — kernel security observations, PSI and heuristic evaluation.

Old hashes are redirected into the new destinations to preserve bookmarks.

## Design tokens

The UI uses a quiet neutral canvas, white/dark-elevated surfaces, slate text,
blue primary action, and separate success/warning/danger semantic colors.
Typography uses Bricolage Grotesque for headings, Space Grotesk for interface
content, and IBM Plex Mono only for identifiers and numeric telemetry.
A 4/8/12/16/24/32 spacing rhythm, nested 6–20px radii, fine borders and restrained
shadows establish hierarchy. Data density is controlled by layout, not by
shrinking text. Utilization rings are flat and sample-aware; trend charts use
simple SVG area/line geometry and never plot unavailable samples as zero.

## Interaction and accessibility contract

- Semantic landmarks and heading order; a visible-on-focus skip link.
- Native links for navigation and native buttons for actions.
- Keyboard-visible focus with sufficient offset; no focus removal.
- Touch controls target at least 44px on narrow screens.
- No hover-only information; meaningful labels for icon actions.
- Loading, empty, unavailable, stale and failure states are distinct.
- Motion respects prefers-reduced-motion; decorative autoplay and the
  high-frequency ticker are removed.
- Process rows use an explicit Inspect button rather than a pseudo-button row.
  Destructive actions are confirmed and cannot race a recycled PID.
- Masked export is the default; full export is a separate, confirmed action.

## Deliberately removed

- Field Dossier paper/texture/brutalist styling and harsh shadow/border system.
- Glitching 3D headline and ambient ticker.
- Ten-way navigation split into CPU/memory/storage/network and graphics/sensor/
  battery pages.
- Repeated all-uppercase labels, redundant proof strips and status language that
  implied unavailable telemetry was healthy.
- “None detected” or “optimal” conclusions when source data is absent.

## Preserved capabilities

Linux procfs and sysfs collectors, bounded process inventory, PSI and security
observations, WebSocket + HTTP fallback, metric-history charts, visual masking,
sanitized exports, process signal controls and server-side guardrails remain.

## Further roadmap (not claimed as delivered)

- Playwright end-to-end keyboard and responsive viewport tests.
- Screen-reader pass with NVDA/Firefox and VoiceOver/Safari.
- Chart tooltips and CSV export for selected metrics.
- User-configurable alert thresholds and a persistent event timeline, after an
  explicit storage/API design.
- Authentication and host enrollment only if Blink moves beyond local-only use.
