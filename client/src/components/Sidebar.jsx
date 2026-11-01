import React, { useState } from 'react';
import Icon from './Icon';
import BlinkMark from './BlinkMark';
import Redacted from './Redacted';

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
  const hostname = system?.hostname || 'LOCAL-NODE';

  // Desktop collapsed mode must not compress mobile drawer into an icon strip
  const isEffectiveCollapsed = collapsed && !mobileOpen;

  return (
    <aside
      className={`rail ${isEffectiveCollapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}
      aria-label="Field Dossier Navigation"
    >
      {/* Top Header Dots & Collapse Toggle */}
      <div className="rail-top">
        <div className="dots" aria-hidden="true" title="System Hardware Registers">
          <span className="dot-hw" />
          <span className="dot-hw" />
          <span className="dot-hw" />
        </div>
        <button
          type="button"
          className="rail-collapse"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand dossier rail' : 'Collapse dossier rail'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand dossier rail' : 'Collapse dossier rail'}
        >
          <Icon name={collapsed ? 'expand' : 'collapse'} size={15} />
        </button>
      </div>

      {/* Brand Section */}
      <div className="brand-section">
        <BlinkMark size={32} />
        <div className="brand-text">
          <div className="brand-title">BLINK</div>
          <div className="brand-sub">FIELD DOSSIER // HOST AGENT</div>
        </div>
      </div>

      {/* Host Identity Card */}
      <div className="identity">
        <button
          type="button"
          className="identity-main"
          onClick={() => setIdentityOpen((v) => !v)}
          aria-expanded={identityOpen}
          aria-controls="identity-details"
          aria-label={`Host ${hostname}. ${identityOpen ? 'Hide' : 'Show'} hardware registers`}
        >
          <span className="avatar" aria-hidden="true">
            {initials(hostname)}
          </span>
          <span className="identity-text">
            <span className="identity-name">
              <Redacted note="MASKED-HOST">{hostname}</Redacted>
            </span>
            <span className="identity-sub">
              {system?.distro || 'Linux'} · {system?.arch || '—'}
            </span>
          </span>
          <Icon
            name="chevron"
            size={14}
            className={`identity-chevron ${identityOpen ? 'is-open' : ''}`}
            style={{
              marginLeft: 'auto',
              transition: 'transform .2s ease',
              transform: identityOpen ? 'rotate(180deg)' : 'none',
            }}
          />
        </button>

        <div
          className="identity-details"
          id="identity-details"
          hidden={!identityOpen}
          style={{ display: identityOpen ? 'grid' : 'none' }}
        >
          <div>
            <span>KERNEL</span>
            <b>{system?.kernel || '—'}</b>
          </div>
          <div>
            <span>LOGICAL CPUS</span>
            <b>{system?.cpus ?? '—'} THREADS</b>
          </div>
          <div>
            <span>TOTAL RAM</span>
            <b>{system?.totalMemory ? `${(system.totalMemory / 1024 ** 3).toFixed(1)} GiB` : '—'}</b>
          </div>
          <div>
            <span>STREAM STATE</span>
            <b style={{ color: connected ? 'var(--green-dark)' : 'var(--red)' }}>
              {connected ? 'CONNECTED' : 'DISCONNECTED'}
            </b>
          </div>
          <div>
            <span>BINDING</span>
            <b style={{ color: 'var(--clay-dark)' }}>LOOPBACK LOCAL</b>
          </div>
        </div>
      </div>

      {/* Navigation Groupings with Semantic Anchor Links */}
      <nav className="nav" aria-label="Dossier Subsystems">
        {groups.map((group) => (
          <div className="nav-group" key={group.label}>
            <div className="nav-caption" aria-hidden="true">
              {group.label}
            </div>
            {group.items.map(([key, label, icon]) => {
              const active = view === key;
              return (
                <a
                  href={`#/${key}`}
                  key={key}
                  className={`nav-item ${active ? 'is-active' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate(key);
                  }}
                  aria-current={active ? 'page' : undefined}
                  title={isEffectiveCollapsed ? label : undefined}
                >
                  <Icon name={icon} size={16} />
                  <span>{label}</span>
                  {key === 'processes' && processCount != null && (
                    <i className="nav-count" aria-label={`${processCount} sampled processes`}>
                      {processCount}
                    </i>
                  )}
                  {key === 'audit' && (
                    <span
                      className="stamp stamp--live"
                      style={{ fontSize: '.58rem', padding: '.15em .45em', marginLeft: 'auto' }}
                    >
                      AUDIT
                    </span>
                  )}
                </a>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer Connection Control */}
      <div className="rail-footer">
        {connected ? (
          <button
            type="button"
            className="foot-action"
            onClick={onDisconnect}
            title={isEffectiveCollapsed ? 'Pause telemetry stream' : undefined}
          >
            <Icon name="disconnect" size={16} />
            <span>PAUSE STREAM</span>
          </button>
        ) : (
          <button
            type="button"
            className="foot-action is-reconnect"
            onClick={onReconnect}
            title={isEffectiveCollapsed ? 'Reconnect telemetry stream' : undefined}
          >
            <Icon name="reconnect" size={16} />
            <span>RESUME STREAM</span>
          </button>
        )}
      </div>
    </aside>
  );
}
