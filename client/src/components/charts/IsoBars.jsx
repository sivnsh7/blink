import React from 'react';

/**
 * Isometric bar field.
 *
 * Each sample is drawn as three faces — front, end cap, and right flank — so
 * the column reads as a solid object rather than a coloured rectangle. No
 * gridlines, no glow: depth comes only from the face shading.
 */
export default function IsoBars({
  data = [],
  width = 280,
  height = 112,
  max = 100,
  depth = 2.6,
  gap = 3.4,
  label = 'Activity over time',
  formatValue,
}) {
  const values = data.map((d) => (typeof d === 'number' ? d : Number(d?.value)));
  const usable = values.filter((n) => Number.isFinite(n));
  const upper = Math.max(1, max ?? 100, ...usable);
  const count = Math.max(1, usable.length);

  const pad = 4;
  const floor = height - pad;
  const maxHeight = height - pad - depth - 8;
  const slot = (width - pad * 2) / count;
  const barW = Math.max(2.5, Math.min(9, slot - gap));

  const bx = depth * 0.5;
  const by = -depth;

  return (
    <svg
      className="chart"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      <line x1={pad} x2={width - pad} y1={floor + 0.5} y2={floor + 0.5} stroke="var(--line)" strokeWidth="1" />
      {usable.map((value, i) => {
        const h = Math.max(2, (Math.max(0, value) / upper) * maxHeight);
        const x = pad + i * slot + gap / 2;
        const y = floor - h;
        const muted = i < usable.length - 1 ? false : false;
        return (
          <g key={i} opacity={muted ? 0.5 : 1}>
            {/* right flank */}
            <path
              d={`M${x + barW} ${y} l${bx} ${by} v${h} l${-bx} ${-by} Z`}
              fill="var(--bar-side)"
            />
            {/* end cap */}
            <path
              d={`M${x} ${y} l${bx} ${by} h${barW} l${-bx} ${-by} Z`}
              fill="var(--bar-top)"
            />
            {/* front face */}
            <rect x={x} y={y} width={barW} height={h} rx="1" fill="var(--bar-front)" />
          </g>
        );
      })}
      {usable.length === 0 && (
        <text x={width / 2} y={height / 2} textAnchor="middle" fill="var(--ink-4)" fontSize="10" fontFamily="var(--mono)">
          Awaiting samples
        </text>
      )}
      {formatValue && usable.length > 0 && (
        <title>{`${label}: ${formatValue(usable[usable.length - 1])}`}</title>
      )}
    </svg>
  );
}
