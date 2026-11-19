import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import BlinkMark from './BlinkMark';
import Redacted from './Redacted';

function initials(name) {
  const clean = String(name || 'Blink').replace(/[^a-z0-9]/gi, '');
  return (clean.slice(0, 2) || 'BL').toUpperCase();
}

export default function Sidebar({
  groups, view, onNavigate, system, processCount, collapsed, mobileOpen,
  connectionState = 'connecting', onToggleCollapse, onReconnect, onDisconnect, onClose,
}) {
  const [identityOpen, setIdentityOpen] = useState(false);
  const [mobileViewport, setMobileViewport] = useState(
    () => window.matchMedia?.('(max-width: 900px)').matches ?? false
  );
  const railRef = useRef(null);
  const returnFocusRef = useRef(null);
  const hostname = system?.hostname || 'Local host';
  const compact = collapsed && !mobileOpen;
  const paused = connectionState === 'paused';

  // A translated-offscreen drawer must also leave the tab order and accessibility tree.
  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const update = () => setMobileViewport(media.matches);
    update();
    if (media.addEventListener) media.addEventListener('change', update);
    else media.addListener(update);
    return () => {
      if (media.removeEventListener) media.removeEventListener('change', update);
      else media.removeListener(update);
    };
  }, []);

  // Keep keyboard focus inside the mobile drawer and return it to its opener on close.
  useEffect(() => {
    if (!mobileViewport) return undefined;

    if (!mobileOpen) {
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
      returnFocusRef.current = null;
      return undefined;
    }

    returnFocusRef.current = document.activeElement;
    const getFocusable = () => Array.from(
      railRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) || []
    ).filter((element) => element.getClientRects().length > 0);

    getFocusable()[0]?.focus();

    const trapFocus = (event) => {
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !railRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', trapFocus);
    return () => document.removeEventListener('keydown', trapFocus);
  }, [mobileOpen, mobileViewport]);

  return (
    <aside
      ref={railRef}
      id="main-navigation"
      className={`rail ${compact ? 'is-collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}
      aria-label="Main navigation"
      aria-hidden={mobileViewport && !mobileOpen ? true : undefined}
      inert={mobileViewport && !mobileOpen}
    >
      <div className="brand-section">
        <BlinkMark size={34} />
        <div className="brand-text">
          <div className="brand-title">Blink</div>
          <div className="brand-sub">HOST OBSERVABILITY</div>
        </div>
        <button
          type="button"
          className="rail-collapse"
          onClick={mobileViewport ? onClose : onToggleCollapse}
          aria-label={mobileViewport ? 'Close navigation menu' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={mobileViewport ? mobileOpen : !collapsed}
        >
          <Icon name={mobileViewport ? 'close' : collapsed ? 'expand' : 'collapse'} size={15} />
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
            <div><span>Agent</span><b>{connectionState === 'streaming' ? 'Live stream' : connectionState === 'paused' ? 'Paused' : connectionState === 'polling' ? 'HTTP polling' : 'Reconnecting'}</b></div>
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
                  aria-label={label}
                  aria-current={active ? 'page' : undefined}
                  title={compact ? label : undefined}>
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
        {paused ? (
          <button type="button" className="foot-action is-reconnect" onClick={onReconnect}>
            <Icon name="refresh" size={16} /><span>Resume telemetry</span>
          </button>
        ) : (
          <button type="button" className="foot-action" onClick={onDisconnect}>
            <Icon name="pause" size={16} /><span>Pause telemetry</span>
          </button>
        )}
      </div>
    </aside>
  );
}
