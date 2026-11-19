import React from 'react';

/** Flat, accessible utilization ring. Null values are intentionally not drawn as zero. */
export default function Ring3D({
  value = null,
  size = 132,
  stroke = 10,
  label = 'Utilization',
  sublabel,
  tone = 'accent',
}) {
  const valid = value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const amount = valid ? Math.max(0, Math.min(100, Number(value))) : null;
  const radius = (size - stroke * 2) / 2 - 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = amount == null ? 0 : (amount / 100) * circumference;
  const color = tone === 'warn'
    ? 'var(--warn)'
    : tone === 'danger'
      ? 'var(--danger)'
      : 'var(--accent)';

  return (
    <div
      className="ring"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label}: ${amount == null ? 'unavailable' : `${amount.toFixed(1)} percent`}`}
    >
      <svg className="ring-svg" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        {amount != null && (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            transform={`rotate(-90 ${center} ${center})`}
          />
        )}
      </svg>
      <div className="ring-center" aria-hidden="true">
        <span className="ring-value tabular">
          {amount == null ? '—' : amount.toFixed(amount < 10 ? 1 : 0)}
          {amount != null && <span className="ring-percent">%</span>}
        </span>
        <span className="ring-unit">{amount == null ? 'Unavailable' : (sublabel || 'Used')}</span>
      </div>
    </div>
  );
}
