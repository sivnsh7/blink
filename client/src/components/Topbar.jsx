import React from 'react';
import Icon from './Icon';
import { useRedaction } from '../context/RedactionContext';

export default function Topbar({
  title, connected, darkMode, onToggleTheme, onRetry, onRefresh, onOpenNav,
  snapshotState = 'empty',
}) {
  const { redactionMode, toggleRedactionMode } = useRedaction();
  const statusLabel = connected ? 'Live stream' : snapshotState === 'fresh' ? 'Polling fallback' :
    snapshotState === 'stale' ? 'Data is stale' : snapshotState === 'unavailable' ? 'Agent unavailable' : 'Connecting';
  const statusClass = connected || snapshotState === 'fresh' ? 'stamp--live' :
    snapshotState === 'stale' ? 'stamp--wip' : snapshotState === 'unavailable' ? 'stamp--hypothesis' : 'stamp--idle';

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button type="button" className="icon-btn menu-btn" onClick={onOpenNav} aria-label="Open navigation menu">
          <Icon name="menu" size={18} />
        </button>
        <div className="crumbs">
          <span className="crumb-arch">BLINK / WORKSPACE</span>
          <span aria-hidden="true">/</span>
          <strong>{title}</strong>
        </div>
      </div>

      <div className="topbar-right">
        <span className={`stamp ${statusClass}`} role="status" aria-live="polite">
          <span className={`dot ${connected ? 'dot--live' : ''}`} aria-hidden="true" />
          {statusLabel}
        </span>
        <button type="button" className="btn btn--paper btn--sm" onClick={toggleRedactionMode}
          aria-pressed={redactionMode} title="Toggle visual masking">
          <Icon name={redactionMode ? 'eye-off' : 'eye'} size={15} />
          <span className="mask-label">{redactionMode ? 'Masked' : 'Visible'}</span>
        </button>
        <button type="button" className="icon-btn" onClick={onRefresh} aria-label="Refresh host snapshot" title="Refresh snapshot">
          <Icon name="refresh" size={16} />
        </button>
        <button type="button" className="icon-btn" onClick={onRetry} aria-label="Reconnect live telemetry" title="Reconnect live stream">
          <Icon name="wifi" size={16} />
        </button>
        <button type="button" className="icon-btn" onClick={onToggleTheme}
          aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'} aria-pressed={darkMode}>
          <Icon name={darkMode ? 'sun' : 'moon'} size={16} />
        </button>
      </div>
    </header>
  );
}
