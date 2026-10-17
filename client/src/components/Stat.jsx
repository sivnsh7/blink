import React from 'react';
import Sparkline from './charts/Sparkline';
import Icon from './Icon';

/**
 * Four-across headline metric. Value first, trend as quiet support.
 */
export default function Stat({ label, value, unit, sub, history, icon, tone = 'accent', min = 0, max = 100 }) {
  const color = tone === 'warn' ? 'var(--warn)' : tone === 'danger' ? 'var(--danger)' : tone === 'ok' ? 'var(--ok)' : 'var(--accent)';

  return (
    <article className="card stat">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <span className="card-icon" aria-hidden="true"><Icon name={icon} size={15} /></span>
      </div>
      <div className="stat-value tabular">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      <div style={{ marginTop: 12 }}>
        <Sparkline data={history} width={240} height={36} color={color} label={label} min={min} max={max} />
      </div>
      <div className="stat-foot">
        <span className="stat-sub">{sub}</span>
      </div>
    </article>
  );
}
