import React from 'react';

/** Compact Blink signal mark shared by the app chrome and favicon. */
export default function BlinkMark({ size = 32, tile = true, className = '' }) {
  const artwork = (
    <>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="var(--mark-tile, #0b1220)" />
      <path
        d="M6 17h5l3-8 5 15 4-10 2 3h2"
        fill="none"
        stroke="var(--mark-signal, #78a9ff)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="27" cy="17" r="1.5" fill="var(--mark-dot, #e7f1ff)" />
    </>
  );

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      role="img"
      aria-label="Blink"
      focusable="false"
      style={tile ? {
        display: 'inline-block',
        flexShrink: 0,
        borderRadius: 9,
        border: '1px solid var(--line-strong)',
        background: 'var(--surface)',
      } : undefined}
    >
      {artwork}
    </svg>
  );
}
