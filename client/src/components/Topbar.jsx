import React, { useEffect, useState } from 'react';
import Icon from './Icon';
import { useRedaction } from '../context/RedactionContext';

export default function Topbar({
  title,
  connected,
  darkMode,
  onToggleTheme,
  onRetry,
  onOpenNav,
  system,
}) {
  const [now, setNow] = useState(() => new Date());
  const { redactionMode, toggleRedactionMode } = useRedaction();

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const clock = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const arch = system?.arch || 'X86_64';

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          type="button"
          className="icon-btn menu-btn"
          onClick={onOpenNav}
          aria-label="Open navigation drawer"
        >
          <Icon name="menu" size={17} />
        </button>
        <div className="crumbs">
          <span className="stamp stamp--idle" style={{ fontSize: '.62rem', padding: '.25em .6em' }}>
            DOSSIER
          </span>
          <b className="crumb-arch">NODE // {arch.toUpperCase()}</b>
          <span aria-hidden="true" style={{ color: 'var(--ink-mute)' }}>/</span>
          <strong>{title}</strong>
        </div>
      </div>

      <div className="topbar-right">
        {/* Visual Masking Toggle */}
        <button
          type="button"
          className={`btn btn--sm ${redactionMode ? 'btn--clay' : 'btn--paper'}`}
          onClick={toggleRedactionMode}
          title={
            redactionMode
              ? 'Visual Masking ACTIVE — Click to unmask identifiers'
              : 'Visual Masking OFF — Click to mask sensitive host data'
          }
          aria-pressed={redactionMode}
          style={{ height: 36, padding: '0 .85em', gap: '.4em' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ width: 14, height: 14 }}>
            {redactionMode ? (
              <>
                <rect x="3" y="11" width="18" height="10" rx="2" />
                <circle cx="12" cy="16" r="1.5" fill="currentColor" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </>
            ) : (
              <>
                <rect x="3" y="11" width="18" height="10" rx="2" />
                <circle cx="12" cy="16" r="1.5" fill="currentColor" />
                <path d="M7 11V7a5 5 0 0 1 9.9-1" />
              </>
            )}
          </svg>
          <span style={{ fontSize: '.68rem', letterSpacing: '.06em' }}>
            {redactionMode ? 'MASKED' : 'UNMASKED'}
          </span>
        </button>

        {/* Live Stream Status Stamp */}
        <span
          className={`stamp ${connected ? 'stamp--live' : 'stamp--hypothesis'}`}
          role="status"
          aria-label={`Stream state: ${connected ? 'Live' : 'Disconnected'}`}
          style={{ height: 36, padding: '0 .75em' }}
        >
          <span className={`dot ${connected ? 'dot--live' : ''}`} aria-hidden="true" />
          {connected ? 'STREAMING' : 'OFFLINE'}
        </span>

        {/* Real-time Hardware Clock */}
        <time
          className="clock tabular"
          dateTime={now.toISOString()}
          title="Local Host Clock"
          aria-label={`Current host time: ${clock}`}
        >
          {clock}
        </time>

        {/* Theme Toggle Button */}
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleTheme}
          aria-label={darkMode ? 'Switch to Ivory Linen light theme' : 'Switch to AMOLED dark theme'}
          aria-pressed={darkMode}
          title={darkMode ? 'Ivory Linen (Light)' : 'AMOLED Espionage (Dark)'}
        >
          <Icon name={darkMode ? 'sun' : 'moon'} size={16} />
        </button>

        {/* Reconnect / Refresh Telemetry Stream Button */}
        <button
          type="button"
          className="icon-btn"
          onClick={onRetry}
          aria-label="Reconnect or refresh telemetry stream"
          title="Sample immediate telemetry and reconnect stream"
        >
          <Icon name="refresh" size={16} />
        </button>
      </div>
    </header>
  );
}
