import React, { useState } from 'react';
import Icon from './Icon';
import BlinkMark from './BlinkMark';

function initials(name) {
  if (!name) return 'BK';
  const clean = String(name).replace(/[^a-zA-Z0-9]/g, '');
  return (clean.slice(0, 2) || 'BK').toUpperCase();
}

export default function Sidebar({
  groups,
  view,
  onNavigate,
  system,
  processCount,
  collapsed,
  mobileOpen,
  connected,
  onToggleCollapse,
  onDisconnect,
  onReconnect,
}) {
  const [identityOpen, setIdentityOpen] = useState(false);
  const hostname = system?.hostname || 'Local host';

  return (
    <aside
      className={`rail ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}
      aria-label="Blink navigation"
    >
      <div className="rail-top">
        <div className="dots" aria-hidden="true">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
        </div>
        <button
          type="button"
          className="rail-collapse"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Icon name={collapsed ? 'expand' : 'collapse'} size={16} />
        </button>
      </div>

      <div className="brand">
        <BlinkMark size={32} />
        <div>
          <div className="brand-word">Blink</div>
          <div className="brand-sub">Host monitor</div>
        </div>
      </div>

      <div className="identity">
        <button
          type="button"
          className="identity-main"
          onClick={() => setIdentityOpen((v) => !v)}
          aria-expanded={identityOpen}
          aria-controls="identity-details"
          aria-label={`Host ${hostname}. ${identityOpen ? 'Hide' : 'Show'} host details`}
        >
          <span className="avatar" aria-hidden="true">{initials(hostname)}</span>
          <span className="identity-text">
            <span className="identity-name">{hostname}</span>
            <span className="identity-sub">{system?.distro || 'Linux'} · {system?.arch || '—'}</span>
          </span>
          <Icon
            name="chevron"
            size={15}
            className={`identity-chevron ${identityOpen ? 'is-open' : ''}`}
          />
        </button>
        {identityOpen && (
          <div className="identity-details" id="identity-details">
            <div><span>Kernel</span><b>{system?.kernel || '—'}</b></div>
            <div><span>Cores</span><b>{system?.cpus ?? '—'}</b></div>
            <div><span>Memory</span><b>{system?.totalMemory ? `${(system.totalMemory / 1024 ** 3).toFixed(1)} GiB` : '—'}</b></div>
            <div><span>Agent</span><b>{connected ? 'streaming' : 'offline'}</b></div>
          </div>
        )}
      </div>

      <nav className="nav" aria-label="Main">
        {groups.map((group) => (
          <div className="nav-group" key={group.label}>
            <div className="nav-caption" aria-hidden="true">{group.label}</div>
            {group.items.map(([key, label, icon]) => {
              const active = view === key;
              return (
                <button
                  type="button"
                  key={key}
                  className={`nav-item ${active ? 'is-active' : ''}`}
                  onClick={() => onNavigate(key)}
                  aria-current={active ? 'page' : undefined}
                  title={collapsed ? label : undefined}
                >
                  <Icon name={icon} size={18} />
                  <span>{label}</span>
                  {key === 'processes' && processCount != null && (
                    <i className="nav-count" aria-label={`${processCount} sampled processes`}>
                      {processCount}
                    </i>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="rail-footer">
        {connected ? (
          <button
            type="button"
            className="foot-action"
            onClick={onDisconnect}
            title={collapsed ? 'Disconnect stream' : undefined}
          >
            <Icon name="disconnect" size={18} />
            <span>Disconnect</span>
          </button>
        ) : (
          <button
            type="button"
            className="foot-action is-reconnect"
            onClick={onReconnect}
            title={collapsed ? 'Reconnect stream' : undefined}
          >
            <Icon name="reconnect" size={18} />
            <span>Reconnect</span>
          </button>
        )}
      </div>
    </aside>
  );
}
