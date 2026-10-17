import React, { useEffect, useState } from 'react';
import Icon from './Icon';

export default function Topbar({ title, connected, darkMode, onToggleTheme, onRetry, onOpenNav }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const clock = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          type="button"
          className="icon-btn menu-btn"
          onClick={onOpenNav}
          aria-label="Open navigation"
        >
          <Icon name="menu" size={17} />
        </button>
        <div className="crumbs">
          <b>Host</b>
          <span aria-hidden="true">/</span>
          <strong>{title}</strong>
        </div>
      </div>

      <div className="topbar-right">
        <span className={`live-pill ${connected ? 'is-live' : ''}`} role="status">
          <span className="live-dot" aria-hidden="true" />
          {connected ? 'Live' : 'Offline'}
        </span>
        <span className="clock" aria-hidden="true">{clock}</span>
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleTheme}
          aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
          title={darkMode ? 'Light theme' : 'Dark theme'}
        >
          <Icon name={darkMode ? 'sun' : 'moon'} size={16} />
        </button>
        <button type="button" className="icon-btn" onClick={onRetry} aria-label="Refresh telemetry" title="Refresh telemetry">
          <Icon name="refresh" size={16} />
        </button>
      </div>
    </header>
  );
}
