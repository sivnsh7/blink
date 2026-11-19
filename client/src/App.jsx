import React, { useEffect, useMemo, useReducer, useState } from 'react';
import { useMetrics } from './hooks/useMetrics';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Redacted from './components/Redacted';
import { RedactionProvider } from './context/RedactionContext';
import Overview from './views/Overview';
import Processes from './views/Processes';
import Performance from './views/Performance';
import Hardware from './views/Hardware';
import Diagnostics from './views/Diagnostics';
import { uptime } from './lib/format';
import { createNavigationState, navigationReducer } from './lib/stateMachines.js';

const GROUPS = [{
  label: 'Workspace',
  items: [
    ['overview', 'Overview', 'overview'],
    ['processes', 'Processes', 'processes'],
    ['performance', 'Performance', 'cpu'],
    ['hardware', 'Hardware', 'graphics'],
    ['diagnostics', 'Diagnostics', 'sensors'],
  ],
}];

const VIEWS = {
  overview: {
    title: 'Overview',
    blurb: 'A live view of host activity, resource use and system state.',
    render: props => <Overview {...props} />,
  },
  processes: {
    title: 'Processes',
    blurb: 'Inspect sampled Linux tasks, compare resource use and manage eligible processes.',
    render: props => <Processes metrics={props.metrics} onRefresh={props.onRefresh} />,
  },
  performance: {
    title: 'Performance',
    blurb: 'Understand processor, memory, storage and network activity in one workspace.',
    render: props => <Performance metrics={props.metrics} history={props.history} />,
  },
  hardware: {
    title: 'Hardware',
    blurb: 'Explore graphics, thermal sensors, fans and battery telemetry exposed by Linux.',
    render: props => <Hardware metrics={props.metrics} />,
  },
  diagnostics: {
    title: 'Diagnostics',
    blurb: 'Review observed kernel settings, pressure-stall data and heuristic findings.',
    render: props => <Diagnostics metrics={props.metrics} />,
  },
};

const THEME_KEY = 'blink-theme';
const RAIL_KEY = 'blink-rail';

function initialTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY) || localStorage.getItem('theme');
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {}
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function initialCollapsed() {
  try { return localStorage.getItem(RAIL_KEY) === 'collapsed'; } catch { return false; }
}

export default function App() {
  const {
    metrics, history, connected, connectionState, snapshotState, error,
    reconnect, disconnect, refresh,
  } = useMetrics();
  const [navigation, dispatchNavigation] = useReducer(
    navigationReducer, window.location.hash, createNavigationState
  );
  const [theme, setTheme] = useState(initialTheme);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const view = navigation.route;
  const mobileOpen = navigation.drawer === 'open';
  const dark = theme === 'dark';
  const current = VIEWS[view] || VIEWS.overview;
  const system = metrics?.system || null;
  const processCount = metrics?.processesInfo?.sampledCount ?? metrics?.processes?.length ?? null;

  const meta = useMemo(() => [
    system?.kernel ? `Kernel ${system.kernel}` : null,
    system?.cpus != null ? `${system.cpus} logical CPUs` : null,
    system?.uptime != null ? `Up ${uptime(system.uptime)}` : null,
    system?.arch ? system.arch : null,
  ].filter(Boolean), [system?.kernel, system?.cpus, system?.uptime, system?.arch]);

  useEffect(() => {
    document.title = `${current.title} · Blink`;
  }, [current.title]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
  }, [dark, theme]);

  useEffect(() => {
    try { localStorage.setItem(RAIL_KEY, collapsed ? 'collapsed' : 'expanded'); } catch {}
  }, [collapsed]);

  useEffect(() => {
    const syncLocation = () => dispatchNavigation({
      type: 'LOCATION_CHANGED', hash: window.location.hash,
    });
    const onKeyDown = event => {
      if (event.key === 'Escape') dispatchNavigation({ type: 'ESCAPE' });
    };
    window.addEventListener('hashchange', syncLocation);
    window.addEventListener('popstate', syncLocation);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('hashchange', syncLocation);
      window.removeEventListener('popstate', syncLocation);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const navigate = next => {
    if (!VIEWS[next]) return;
    dispatchNavigation({ type: 'NAVIGATE', route: next });
    const destination = `#/${next}`;
    if (window.location.hash !== destination) window.history.pushState(null, '', destination);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  };

  return (
    <RedactionProvider>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <div className="shell">
        <Sidebar
          groups={GROUPS}
          view={view}
          onNavigate={navigate}
          system={system}
          processCount={processCount}
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          connected={connected}
          onToggleCollapse={() => setCollapsed(value => !value)}
          onDisconnect={disconnect}
          onReconnect={reconnect}
        />

        {mobileOpen && (
          <button type="button" className="scrim" aria-label="Close navigation menu"
            onClick={() => dispatchNavigation({ type: 'CLOSE_DRAWER' })} />
        )}

        <main id="main-content" className="workspace">
          <Topbar
            title={current.title}
            connected={connected}
            snapshotState={snapshotState}
            connectionState={connectionState}
            darkMode={dark}
            onToggleTheme={() => setTheme(dark ? 'light' : 'dark')}
            onRetry={reconnect}
            onRefresh={refresh}
            onOpenNav={() => dispatchNavigation({ type: 'OPEN_DRAWER' })}
          />

          <div className="page">
            <header className="page-head">
              <div>
                <div className="eyebrow">
                  <span><Redacted note="HOST NAME">{system?.hostname || 'Local host'}</Redacted></span>
                  <span aria-hidden="true">/</span>
                  <span>Linux host monitoring</span>
                </div>
                <h1>{current.title}</h1>
                <p>{current.blurb}</p>
              </div>
              <div className="head-meta">
                {meta.map(item => <span className="chip" key={item}>{item}</span>)}
              </div>
            </header>

            {error && (
              <div className="banner card card-pad" role="alert">
                <div><strong>Telemetry issue</strong><p>{error}</p></div>
                <button type="button" className="btn btn--clay btn--sm" onClick={reconnect}>Reconnect</button>
              </div>
            )}

            {current.render({ metrics, history, onOpen: navigate, onRefresh: refresh })}

            <footer className="page-foot">
              <span>Blink · Local Linux host telemetry</span>
              <span className="tabular">
                {metrics?.timestamp
                  ? `Last sample ${new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(metrics.timestamp))}`
                  : 'Waiting for the first sample'}
              </span>
            </footer>
          </div>
        </main>
      </div>
    </RedactionProvider>
  );
}
