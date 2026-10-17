import React from 'react';

/**
 * A tilted progress ring.
 *
 * Rings only read as 3D when they have a visible wall, so the ring is drawn
 * as a stack: a shadowed under-ring offset down the Y axis, a sheen band
 * across the upper-left, and the value arc on top. The shell is slightly
 * tilted with a CSS transform; the arc geometry itself stays exact.
 */
export default function Ring3D({
  value = 0,
  size = 132,
  stroke = 11,
  label,
  sublabel,
  tone = 'accent',
}) {
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  const r = (size - stroke * 2) / 2 - 4;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = (clamped / 100) * circ;
  const toneColor = tone === 'warn' ? 'var(--warn)' : tone === 'danger' ? 'var(--danger)' : 'var(--accent)';

  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${clamped.toFixed(0)} percent`}>
      <svg className="ring-svg" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {/* wall */}
        <circle cx={cx} cy={cy + 4} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle cx={cx} cy={cy + 2} r={r} fill="none" stroke="var(--line-strong)" strokeWidth={stroke} />
        {/* track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        {/* value arc */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={toneColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        {/* sheen */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.34)"
          strokeWidth={stroke * 0.34}
          strokeDasharray={`${circ * 0.26} ${circ}`}
          transform={`rotate(-146 ${cx} ${cy})`}
          strokeLinecap="round"
          opacity="0.7"
        />
      </svg>
      <div className="ring-center">
        <span className="ring-value tabular">
          {clamped.toFixed(clamped < 10 ? 1 : 0)}
          <span style={{ fontSize: '0.6em', color: 'var(--ink-3)' }}>%</span>
        </span>
        {sublabel && <span className="ring-unit">{sublabel}</span>}
        {label && <span className="sr-only">{label}</span>}
      </div>
    </div>
  );
}
