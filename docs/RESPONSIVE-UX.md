# Blink responsive UX and viewport quality guide

**Implementation:** `client/src/responsive.css` (loaded after the shared component stylesheet)  
**Review date:** 19 November 2026

## Layout principles

Blink uses fluid sizing and content-led layout changes rather than fixed layouts for individual phone models. The main page is capped at a readable maximum width; cards and grids shrink through fractional tracks; headings, metadata and technical values are allowed to wrap; and the main workspace uses container queries so the layout can respond to the width left after the sidebar is taken into account.

The implementation follows these current platform and accessibility recommendations:

- [MDN: Responsive design](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Responsive_Design) — fluid grids, relative sizing, flexible media and content-led breakpoints.
- [Chrome for Developers: Responsive design](https://developer.chrome.com/docs/modern-web-guidance/guides/css/responsive-design) — container queries, dynamic viewport units and fluid `min()`, `max()` and `clamp()` sizing.
- [web.dev: Responsive design basics](https://web.dev/articles/responsive-web-design-basics) — start with narrow layouts and let content determine breakpoints rather than targeting device brands.
- [W3C WCAG 2.2, SC 1.4.10 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow) — ordinary vertical content should reflow at 320 CSS pixels without two-dimensional page scrolling; data tables are a recognized exception where two-dimensional layout is needed.
- [W3C WCAG 2.2, SC 2.4.13 Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance) — a clear, high-contrast focus indicator.

## Responsive behavior

| Available width | Layout behavior |
|---|---|
| Wide desktop / ultrawide | Fixed navigation rail, capped readable page width, four-column resource overview where content fits, two-column detail sections |
| Desktop with a narrow workspace | Container queries reduce card grids before text or controls become crowded; detail sections collapse before individual cards become too narrow |
| Tablet / narrow window (up to 900px) | Off-canvas navigation drawer, scrollable nav list, sticky compact top bar and a single-column detail flow |
| Phone (up to 600px) | Compact top bar, two-column resource tiles when legible, two-column proof strips, stacked detail cards and full-width search/filter controls |
| Very narrow phone (up to 400px) | One-column metric cards and host metadata, compact status indicator, wrapping action buttons and reduced page/card gutters |
| Short landscape phone | Drawer content remains independently scrollable; drawer and body use dynamic viewport sizing and safe-area padding |

The container query thresholds (1160px, 820px, 520px) describe the **available page content width**, while the media query thresholds (900px, 600px, 400px) describe viewport-specific navigation and top-bar behavior. They are intentionally different because a 1024px viewport with a navigation rail does not give the content the same width as a 1024px workspace.

## Interaction and content rules

- The mobile drawer is inert and removed from the accessibility tree while closed. When open, it traps keyboard focus, restores focus on close, and locks background scrolling.
- The top bar keeps the active workspace title, connection state, refresh/reconnect and theme actions usable at narrow widths. On the smallest viewports, the connection label becomes a compact visual indicator while its live status remains available to assistive technology.
- Primary touch controls use a 44 CSS pixel minimum target. Controls remain keyboard-focusable with a visible outline.
- The application honors `prefers-reduced-motion`.
- Cards, metadata, process names, filesystem paths and numeric values wrap instead of forcing page-wide horizontal overflow.
- Long tabular datasets remain inside their own horizontal scroll container. This is deliberate: a process table needs aligned columns, but its scroll must not move the entire page sideways.
- There is no host/process identifier hiding switch. The dashboard displays identifiers directly. Export is a single JSON action with a confirmation explaining that identifiers are included.

## Manual viewport acceptance matrix

The following is the recommended browser/device validation matrix. It is a **test plan**, not a claim that screenshots or device labs have already been run.

| Class | Viewport examples | Checks |
|---|---|---|
| Minimum reflow | 320×568, 320×720 | No page-wide horizontal scroll; readable headings; cards fit; controls remain reachable |
| Compact phone | 360×800, 375×812 | Two-column tiles do not collide; top bar remains operable; drawer focus/scroll behavior |
| Large phone | 390×844, 430×932 | Hero actions wrap cleanly; no card overflow; tables scroll independently |
| Phone landscape | 844×390 | Drawer uses available height; modal remains scrollable; header does not crowd content |
| Tablet portrait | 768×1024, 820×1180 | Navigation drawer works; detail grids collapse at useful widths; process filters wrap/scroll |
| Tablet landscape / small laptop | 1024×768, 1180×820 | Navigation rail and content have adequate room; no squeezed columns |
| Desktop | 1280×800, 1440×900 | Sidebar alignment, four-card overview, detail section rhythm and modal sizing |
| Large / ultrawide | 1920×1080, 2560×1440 | Content remains centered and readable rather than stretching into long line lengths |

For each viewport, repeat in light and dark themes, at 200% zoom, with keyboard-only input, and with reduced motion enabled. Check every route (Overview, Processes, Performance, Hardware and Diagnostics), the process dossier modal, long host/process strings, missing hardware telemetry, and the table's independent scroll behavior.

## Verification

Run:

```bash
npm ci
npm test
npm run build
```

A successful production build validates the stylesheet and JSX pipeline, but it does not prove visual correctness at every breakpoint. Browser screenshots, keyboard review and screen-reader testing remain separate manual/automated acceptance steps. Add Playwright or equivalent screenshot coverage when the project has a browser-test runner and stable test fixtures.
