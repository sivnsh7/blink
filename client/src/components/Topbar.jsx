import React from 'react';
import Icon from './Icon';
import { telemetryStatusView } from '../lib/stateMachines.js';

export default function Topbar({
  title, connectionState, navOpen, darkMode, onToggleTheme, onRetry, onRefresh, onOpenNav,
  snapshotState = 'empty',
}) {
  const status = telemetryStatusView(connectionState, snapshotState);
  const statusClass = {
    live: 'stamp--live',
    warning: 'stamp--wip',
    danger: 'stamp--hypothesis',
    idle: 'stamp--idle',
  }[status.tone];

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button type="button" className="icon-btn menu-btn" onClick={onOpenNav} aria-label="Open navigation menu" aria-expanded={Boolean(navOpen)} aria-controls="main-navigation">
          <Icon name="menu" size={18} />
        </button>
        <div className="crumbs">
          <span className="crumb-arch">BLINK / WORKSPACE</span>
          <span aria-hidden="true">/</span>
          <strong>{title}</strong>
        </div>
      </div>

      <div className="topbar-right">
        <span className={`stamp ${statusClass}`} role="status" aria-live="polite" title={status.label}>
          <span className={`dot ${status.tone === 'live' ? 'dot--live' : ''}`} aria-hidden="true" />
          {status.label}
        </span>
        <button
          type="button"
          className="icon-btn"
          onClick={onRefresh}
          disabled={connectionState === 'paused'}
          aria-label="Refresh host snapshot"
          title={connectionState === 'paused' ? 'Resume telemetry to refresh the host snapshot' : 'Refresh snapshot'}
        >
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
