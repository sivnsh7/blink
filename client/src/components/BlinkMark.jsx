import React from 'react';

/**
 * Blink — one geometric mark, drawn only with paths.
 * A rounded aperture holding a closing lens. The amber glint is the "blink".
 * Sizes cleanly from 20px to 64px because the geometry stays on a 32 grid.
 */
export default function BlinkMark({ size = 32, tile = true, className = '' }) {
  const body = (
    <>
      <path
        d="M20 11.4c-1.7 2.35-4.3 3.7-7.1 3.7S7.5 13.75 5.8 11.4"
        fill="none"
        stroke="var(--canvas)"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <circle cx="14.6" cy="15.4" r="1.55" fill="var(--canvas)" />
      <circle cx="22.4" cy="12.6" r="1.15" fill="var(--accent)" />
    </>
  );

  if (!tile) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        fill="none"
        className={className}
        role="img"
        aria-label="Blink"
      >
        <path d="M14 5.2c-4.6 0-8.4 3.4-10 8.8 1.6 5.4 5.4 8.8 10 8.8s8.4-3.4 10-8.8c-1.6-5.4-5.4-8.8-10-8.8Z" stroke="currentColor" strokeWidth="1.9" />
        <circle cx="14" cy="14" r="3.4" fill="currentColor" />
        <circle cx="19" cy="9.6" r="1.5" className="brand-glint" />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      className={className}
      role="img"
      aria-label="Blink"
    >
      <rect width="28" height="28" rx="8" fill="var(--ink)" />
      <g transform="translate(0,1.5)">{body}</g>
    </svg>
  );
}
