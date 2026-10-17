import React, { useEffect, useMemo, useState } from 'react';
import { useMetrics } from './hooks/useMetrics';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Overview from './views/Overview';
import Processes from './views/Processes';
import {
  CpuView,
  MemoryView,
  StorageView,
  NetworkView,
  GraphicsView,
  SensorsView,
  BatteryView,
} from './views/Details';
import { uptime } from './lib/format';

const GROUPS = [
  {
    label: 'Monitor',
    items: [
      ['overview', 'Overview', 'overview'],
      ['processes', 'Processes', 'processes'],
    ],
  },
  {
    label: 'Hardware',
    items: [
      ['cpu', 'Processor', 'cpu'],
      ['memory', 'Memory', 'memory'],
      ['storage', 'Storage', 'storage'],
      ['network', 'Network', 'network'],
    ],
  },
  {
    label: 'Board',
    items: [
      ['graphics', 'Graphics', 'graphics'],
      ['sensors', 'Sensors', 'sensors'],
      ['battery', 'Battery', 'battery'],
    ],
  },
];

const VIEWS = {
  overview: {
    title: 'Overview',
    blurb: 'Live utilisation, capacity and throughput for this host.',
    render: (props) => <Overview {...props} />,
  },
  processes: {
    title: 'Processes',
    blurb: 'Every sampled process, read-only. Sort and filter without touching the stream.',
    render: (props) => <Processes metrics={props.metrics} />,
  },
  cpu: {
    title: 'Processor',
    blurb: 'Core-level activity, clocks, load and thermal zones.',
    render: (props) => <CpuView {...props} />,
  },
  memory: {
    title: 'Memory',
    blurb: 'Physical and swap usage as the kernel reports it.',
    render: (props) => <MemoryView {...props} />,
  },
  storage: {
    title: 'Storage',
    blurb: 'Block devices, mount capacity and I/O throughput.',
    render: (props) => <StorageView {...props} />,
  },
  network: {
    title: 'Network',
    blurb: 'Per-interface counters and aggregate throughput.',
    render: (props) => <NetworkView {...props} />,
  },
  graphics: {
    title: 'Graphics',
    blurb: 'Adapter load, memory and thermals where drivers expose them.',
    render: (props) => <GraphicsView {...props} />,
  },
  sensors: {
    title: 'Sensors',
    blurb: 'Hwmon temperature and fan channels.',
    render: (props) => <SensorsView {...props} />,
  },
  battery: {
    title: 'Battery',
    blurb: 'Charge, draw and estimated runtime.',
    render: (props) => <BatteryView {...props} />,
  },
};

const THEME_KEY = 'blink-theme';
const RAIL_KEY = 'blink-rail';

function initialTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY) || localStorage.getItem('lattice-theme');
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    /* storage blocked */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function initialCollapsed() {
  try {
    return localStorage.getItem(RAIL_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

const viewFromHash = () => {
  const key = window.location.hash.replace(/^#\/?/, '');
  return VIEWS[key] ? key : 'overview';
};

export default function App() {
  const { metrics, history, connected, error, reconnect, disconnect, refresh } = useMetrics();
  const [view, setView] = useState(viewFromHash);
  const [theme, setTheme] = useState(initialTheme);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  const dark = theme === 'dark';

  const current = VIEWS[view] ?? VIEWS.overview;

  useEffect(() => {
    document.title = `${current.title} · Blink`;
  }, [current.title]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* storage blocked */
    }
  }, [dark, theme]);

  useEffect(() => {
    try {
      localStorage.setItem(RAIL_KEY, collapsed ? 'collapsed' : 'expanded');
    } catch {
      /* storage blocked */
    }
  }, [collapsed]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    const onHash = () => setView(viewFromHash());
    window.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', onHash);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', onHash);
    };
  }, []);

  const system = metrics?.system || null;
  const processCount = metrics?.processes?.length ?? null;

  const meta = useMemo(
    () => [
      system?.kernel ? `kernel ${system.kernel}` : null,
      system?.cpus ? `${system.cpus} cores` : null,
      system?.uptime != null ? `up ${uptime(system.uptime)}` : null,
    ].filter(Boolean),
    [system?.kernel, system?.cpus, system?.uptime]
  );

  const navigate = (next) => {
    if (!VIEWS[next]) return;
    setView(next);
    setMobileOpen(false);
    // The hash makes views linkable and gives back/forward something to do.
    if (window.location.hash !== `#${next}`) window.history.pushState(null, '', `#${next}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
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
        onToggleCollapse={() => setCollapsed((v) => !v)}
        onDisconnect={disconnect}
        onReconnect={reconnect}
      />

      {mobileOpen && (
        <button
          type="button"
          className="scrim is-open"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <main className={`workspace ${collapsed ? 'is-collapsed' : ''}`}>
        <Topbar
          title={current.title}
          connected={connected}
          darkMode={dark}
          onToggleTheme={() => setTheme(dark ? 'light' : 'dark')}
          onRetry={refresh}
          onOpenNav={() => setMobileOpen(true)}
        />

        <div className="page">
          <div className="page-head">
            <div>
              <div className="eyebrow">
                <span>{system?.hostname || 'Local host'}</span>
                <span aria-hidden="true">·</span>
                <span>{current.title}</span>
              </div>
              <h1>{current.title}</h1>
              <p>{current.blurb}</p>
            </div>
            <div className="head-meta">
              {meta.map((item) => (
                <span className="chip" key={item}>{item}</span>
              ))}
            </div>
          </div>

          {error && (
            <div className="banner" role="alert">
              <span>{error}</span>
              <button type="button" onClick={refresh}>Retry</button>
            </div>
          )}

          {current.render({ metrics, history, onOpen: navigate })}

          <div className="page-foot">
            <span>Blink · local agent</span>
            <span>
              {metrics?.timestamp ? `sample ${new Date(metrics.timestamp).toLocaleTimeString()}` : 'waiting for first sample'}
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
