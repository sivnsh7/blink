import React from 'react';

/*
 * One icon set for the whole product: 24 grid, 1.6 stroke, round joins.
 * Drawn to match at 16–20px; nothing here is emoji or a mixed pack.
 */

const ICONS = {
  overview: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" />
      <rect x="13.5" y="3.5" width="7" height="4.5" rx="1.8" />
      <rect x="13.5" y="11" width="7" height="9.5" rx="1.8" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.8" />
    </>
  ),
  cpu: (
    <>
      <rect x="7" y="7" width="10" height="10" rx="1.8" />
      <rect x="10" y="10" width="4" height="4" rx="0.8" />
      <path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" />
    </>
  ),
  memory: (
    <>
      <rect x="3.5" y="7.5" width="17" height="9" rx="2" />
      <path d="M7 10.5v3M10.5 10.5v3M14 10.5v3M17.5 10.5v3M6 16.5v2M18 16.5v2" />
    </>
  ),
  storage: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.2" />
      <path d="M7.5 9h9M7.5 12.5h9M7.5 16h4.5" />
    </>
  ),
  network: (
    <>
      <circle cx="6" cy="12" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <circle cx="18" cy="18" r="2.2" />
      <path d="m8 11 8-4m-8 6 8 4" />
    </>
  ),
  graphics: (
    <>
      <rect x="3.5" y="6" width="17" height="12" rx="2" />
      <path d="M7 10h5v4H7zM15.5 10.5h.01M15.5 13.5h.01M14.5 18v2.5M9.5 18v2.5" />
    </>
  ),
  processes: (
    <>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <circle cx="5" cy="6.5" r="1.1" />
      <circle cx="5" cy="12" r="1.1" />
      <circle cx="5" cy="17.5" r="1.1" />
    </>
  ),
  sensors: (
    <>
      <path d="M12 20.5v-6" />
      <path d="M9.3 17.4a4.6 4.6 0 1 1 5.4 0" />
      <circle cx="12" cy="14.5" r="1.6" />
      <path d="M12 3.5v2M18.5 6.2l-1.4 1.4M21 12.5h-2M3 12.5h2M6.9 7.6 5.5 6.2" />
    </>
  ),
  battery: (
    <>
      <rect x="3" y="8" width="15" height="8" rx="2" />
      <path d="M21 11v2" />
      <path d="M6 11v2M9 11v2M12 11v2" />
    </>
  ),
  disconnect: (
    <>
      <path d="M9 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H9" />
      <path d="M15.5 8.5 19 12l-3.5 3.5M19 12H9.5" />
    </>
  ),
  reconnect: (
    <>
      <path d="M20 12a8 8 0 1 1-2.4-5.7" />
      <path d="M20 4v4.5h-4.5" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="3.6" />
      <path d="M12 3v1.6M12 19.4V21M21 12h-1.6M4.6 12H3M18.4 5.6l-1.2 1.2M6.8 17.2l-1.2 1.2M18.4 18.4l-1.2-1.2M6.8 6.8 5.6 5.6" />
    </>
  ),
  moon: <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.2 8.2 0 1 0 10.2 10.2Z" />,
  refresh: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4.5V9H15" />
    </>
  ),
  collapse: <path d="M14.5 8 10 12l4.5 4M20 5v14" />,
  expand: <path d="M9.5 8 14 12l-4.5 4M4 5v14" />,
  chevron: <path d="m7 10 5 5 5-5" />,
  server: (
    <>
      <rect x="3.5" y="4" width="17" height="6.2" rx="1.8" />
      <rect x="3.5" y="13.8" width="17" height="6.2" rx="1.8" />
      <path d="M7 7.1h.01M7 16.9h.01M10.5 7.1H17M10.5 16.9H17" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.8V12l2.8 1.7" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m15.5 15.5 4 4" />
    </>
  ),
};

export default function Icon({ name, size = 18, className = '', strokeWidth = 1.6 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {ICONS[name] || ICONS.server}
    </svg>
  );
}
