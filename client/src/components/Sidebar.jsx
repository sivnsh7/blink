import React, { useState } from 'react';
import Icon from './Icon';
import BlinkMark from './BlinkMark';
import Redacted from './Redacted';

function initials(name) {
  const clean = String(name || 'Blink').replace(/[^a-z0-9]/gi, '');
  return (clean.slice(0, 2) || 'BL').toUpperCase();
}

export default function Sidebar({
  groups, view, onNavigate, system, processCount, collapsed, mobileOpen,
  connected, onToggleCollapse, onDisconnect, onReconnect,
}) {
  const [identityOpen, setIdentityOpen] = useState(false);
  const hostname = system?.hostname || 'Local host';
  const compact = collapsed && !mobileOpen;

  return (
    <aside className={`rail ${compact ? 'is-collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`} aria-label="Main navigation">
      <div className="brand-section">
        <BlinkMark size={34} />
        <div className="brand-text">
          <div className="brand-title">Blink</div>
          <div className="brand-sub">HOST OBSERVABILITY</div>
        </div>
        <button type="button" className="rail-collapse" onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed}>
          <Icon name={collapsed ? 'expand' : 'collapse'} size={15} />
        </button>
      </div>

      <div className="identity">
        <button type="button" className="identity-main" onClick={() => setIdentityOpen(v => !v)}
          aria-expanded={identityOpen} aria-controls="identity-details">
          <span className="avatar" aria-hidden="true">{initials(hostname)}</span>
          <span className="identity-text">
            <span className="identity-name"><Redacted note="HOST NAME">{hostname}</Redacted></span>
            <span className="identity-sub">{system?.distro || 'Linux'} · {system?.arch || '—'}</span>
          </span>
          <Icon name="chevron" size={14} className="identity-chevron" />
        </button>
        {identityOpen && (
          <div className="identity-details" id="identity-details">
            <div><span>Kernel</span><b>{system?.kernel || '—'}</b></div>
            <div><span>Logical CPUs</span><b>{system?.cpus ?? '—'}</b></div>
            <div><span>Memory</span><b>{system?.totalMemory ? `${(system.totalMemory / 1024 ** 3).toFixed(1)} GiB` : '—'}</b></div>
            <div><span>Agent</span><b>{connected ? 'Connected' : 'Disconnected'}</b></div>
          </div>
        )}
      </div>

      <nav className="nav" aria-label="Workspace">
        {groups.map(group => (
          <div className="nav-group" key={group.label}>
            <div className="nav-caption">{group.label}</div>
            {group.items.map(([key, label, icon]) => {
              const active = view === key;
              return (
                <a href={`#/${key}`} key={key} className={`nav-item ${active ? 'is-active' : ''}`}
                  onClick={event => { event.preventDefault(); onNavigate(key); }}
                  aria-current={active ? 'page' : undefined} title={compact ? label : undefined}>
                  <Icon name={icon} size={17} />
                  <span>{label}</span>
                  {key === 'processes' && processCount != null && <i className="nav-count">{processCount}</i>}
                </a>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="rail-footer">
        {connected ? (
          <button type="button" className="foot-action" onClick={onDisconnect}>
            <Icon name="pause" size={16} /><span>Pause telemetry</span>
          </button>
        ) : (
          <button type="button" className="foot-action is-reconnect" onClick={onReconnect}>
            <Icon name="refresh" size={16} /><span>Reconnect agent</span>
          </button>
        )}
      </div>
    </aside>
  );
}
