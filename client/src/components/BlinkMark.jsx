import React from 'react';

/**
 * BlinkMark — Field Dossier Signature Hardware Mark
 * Combines brutalist structure, struck-brass geometric aperture,
 * and a glossy lacquer-red button core with live radar phosphor.
 */
export default function BlinkMark({ size = 32, tile = true, className = '' }) {
  if (!tile) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        className={className}
        role="img"
        aria-label="Blink Dossier Mark"
      >
        <path
          d="M16 6 L25 11 V21 L16 26 L7 21 V11 Z"
          fill="none"
          stroke="var(--ink)"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
        <circle cx="16" cy="16" r="4.5" fill="none" stroke="var(--clay)" strokeWidth="1.8" />
        <circle cx="16" cy="16" r="2.2" fill="var(--red-active)" />
        <circle cx="21" cy="11" r="1.3" fill="var(--matrix-red)" />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={`brand__mark ${className}`}
      role="img"
      aria-label="Blink Dossier Mark"
      style={{
        width: size,
        height: size,
        display: 'inline-block',
        flexShrink: 0,
        boxShadow: 'var(--sh-1)',
        borderRadius: 8,
        border: 'var(--border-w) solid var(--ink)',
        background: 'linear-gradient(180deg, var(--clay-btn-hi), var(--clay-btn-lo))',
      }}
    >
      <defs>
        <linearGradient id="mark-brass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--clay-tint)" />
          <stop offset="60%" stopColor="var(--clay-light)" />
          <stop offset="100%" stopColor="var(--clay-dark)" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="6" fill="var(--ink)" opacity="0.9" />
      <path
        d="M16 7.5 L23.5 11.8 V20.2 L16 24.5 L8.5 20.2 V11.8 Z"
        fill="none"
        stroke="url(#mark-brass)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="16" r="3.8" fill="none" stroke="var(--clay-light)" strokeWidth="1.5" strokeDasharray="3 1.5" />
      <circle cx="16" cy="16" r="1.9" fill="var(--green)" />
      <circle cx="20" cy="12" r="1.2" fill="#FFFFFF" opacity="0.8" />
    </svg>
  );
}
