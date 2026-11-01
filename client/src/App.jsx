import React, { useEffect, useMemo, useState } from 'react';
import { useMetrics } from './hooks/useMetrics';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import TelemetryTicker from './components/TelemetryTicker';
import Redacted from './components/Redacted';
import { RedactionProvider } from './context/RedactionContext';
import Overview from './views/Overview';
import AuditView from './views/AuditView';
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
    label: 'Telemetry',
    items: [
      ['overview', 'Overview', 'overview'],
      ['audit', 'Security & PSI Audit', 'sensors'],
      ['processes', 'Process Registry', 'processes'],
    ],
  },
  {
    label: 'Hardware Subsystems',
    items: [
      ['cpu', 'Processor', 'cpu'],
      ['memory', 'Memory', 'memory'],
      ['storage', 'Storage', 'storage'],
      ['network', 'Network', 'network'],
    ],
  },
  {
    label: 'Board Interfaces',
    items: [
      ['graphics', 'Graphics', 'graphics'],
      ['sensors', 'Sensors', 'sensors'],
      ['battery', 'Battery', 'battery'],
    ],
  },
];

const VIEWS = {
  overview: {
    title: 'Host Overview',
    blurb: 'Direct procfs and sysfs hardware telemetry with brutalist precision.',
    render: (props) => <Overview {...props} />,
  },
  audit: {
    title: 'Security & PSI Audit',
    blurb: 'Kernel security posture, Linux Pressure Stall Information (PSI), and process hygiene evaluation.',
    render: (props) => <AuditView {...props} />,
  },
  processes: {
    title: 'Process Registry',
    blurb: 'Sampled task scheduler processes with classified redaction and privilege auditing.',
    render: (props) => <Processes metrics={props.metrics} onRefresh={props.onRefresh} />,
  },
  cpu: {
    title: 'Processor Dossier',
    blurb: 'Core-level scheduler deltas, hardware clock frequencies, and thermal registers.',
    render: (props) => <CpuView {...props} />,
  },
  memory: {
    title: 'Memory Subsystem',
    blurb: 'Physical page allocation, active cache buffers, and swap headroom.',
    render: (props) => <MemoryView {...props} />,
  },
  storage: {
    title: 'Storage Array',
    blurb: 'Block device throughput, partition capacities, and disk I/O latency.',
    render: (props) => <StorageView {...props} />,
  },
  network: {
    title: 'Network Fabric',
    blurb: 'Interface packet counters, RX/TX bandwidth rates, and link states.',
    render: (props) => <NetworkView {...props} />,
  },
  graphics: {
    title: 'Graphics Adapter',
    blurb: 'GPU compute utilisation, VRAM buffers, and thermal sensors.',
    render: (props) => <GraphicsView {...props} />,
  },
  sensors: {
    title: 'Hardware Sensors',
    blurb: 'Linux hwmon temperature channels and cooling fan RPM telemetry.',
    render: (props) => <SensorsView {...props} />,
  },
  battery: {
    title: 'Power & Battery',
    blurb: 'DC charge levels, power draw rates, and battery wear cycles.',
    render: (props) => <BatteryView {...props} />,
  },
};

const THEME_KEY = 'blink-theme';
const RAIL_KEY = 'blink-rail';

function initialTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY) || localStorage.getItem('theme');
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
    document.title = `${current.title} // Blink Field Dossier`;
  }, [current.title]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
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
    const syncView = () => setView(viewFromHash());

    window.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', syncView);
    window.addEventListener('popstate', syncView); // Full browser Back/Forward synchronization

    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', syncView);
      window.removeEventListener('popstate', syncView);
    };
  }, []);

  const system = metrics?.system || null;
  const processCount = metrics?.processes?.length ?? null;

  const meta = useMemo(
    () => [
      system?.kernel ? `KERNEL ${system.kernel}` : null,
      system?.cpus ? `${system.cpus} THREADS` : null,
      system?.uptime != null ? `UP ${uptime(system.uptime).toUpperCase()}` : null,
      system?.arch ? `ARCH ${system.arch.toUpperCase()}` : null,
    ].filter(Boolean),
    [system?.kernel, system?.cpus, system?.uptime, system?.arch]
  );

  const navigate = (next) => {
    if (!VIEWS[next]) return;
    setView(next);
    setMobileOpen(false);
    if (window.location.hash !== `#${next}`) {
      window.history.pushState(null, '', `#${next}`);
    }
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    window.scrollTo({ top: 0, behavior: prefersReduced ? 'instant' : 'smooth' });
  };

  return (
    <RedactionProvider>
      <a href="#main-content" className="sr-only" style={{ top: 8, left: 8, zIndex: 9999 }}>
        Skip to main content
      </a>
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
            aria-label="Close navigation drawer"
            onClick={() => setMobileOpen(false)}
          />
        )}

        <main id="main-content" className={`workspace ${collapsed ? 'is-collapsed' : ''}`}>
          <Topbar
            title={current.title}
            connected={connected}
            darkMode={dark}
            onToggleTheme={() => setTheme(dark ? 'light' : 'dark')}
            onRetry={reconnect}
            onOpenNav={() => setMobileOpen(true)}
            system={system}
          />

          <div className="page">
            <div className="page-head">
              <div>
                <div className="eyebrow">
                  <span>
                    <Redacted note="MASKED-HOST">{system?.hostname || 'LOCAL-NODE'}</Redacted>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{current.title}</span>
                </div>
                <h1>{current.title}</h1>
                <p>{current.blurb}</p>
              </div>

              <div className="head-meta">
                {meta.map((item) => (
                  <span className="chip" key={item}>
                    {item}
                  </span>
                ))}
              </div>
            </div>

            {/* Real-time Ticker Ribbon */}
            <TelemetryTicker metrics={metrics} connected={connected} />

            {error && (
              <div
                className="banner card card-pad"
                role="alert"
                style={{
                  border: 'var(--border-w) solid var(--red)',
                  background: 'var(--red-tint)',
                  color: 'var(--red-dark)',
                  marginBottom: '1.4rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                  <span className="stamp stamp--hypothesis">ALERT</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.84rem' }}>{error}</span>
                </div>
                <button type="button" className="btn btn--clay btn--sm" onClick={reconnect}>
                  RECONNECT
                </button>
              </div>
            )}

            {current.render({ metrics, history, onOpen: navigate, onRefresh: refresh })}

            <div className="page-foot">
              <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                <span className="stamp stamp--confirmed" style={{ fontSize: '.6rem' }}>BLINK FIELD DOSSIER</span>
                <span>LOCAL AGENT // SYSFS + PROCFS</span>
              </div>
              <span className="tabular">
                {metrics?.timestamp
                  ? `SAMPLE ${new Date(metrics.timestamp).toLocaleTimeString()}`
                  : 'AWAITING TELEMETRY FRAME'}
              </span>
            </div>
          </div>
        </main>
      </div>
    </RedactionProvider>
  );
}
