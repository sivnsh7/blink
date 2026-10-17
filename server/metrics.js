import { readFileSync, readdirSync, realpathSync } from 'fs';
import { execSync } from 'child_process';
import os from 'os';
import path from 'path';

const clkTck = (() => {
  try { return parseInt(execSync('getconf CLK_TCK', { encoding: 'utf-8', timeout: 1000 }), 10) || 100; } catch { return 100; }
})();
const pageSize = (() => {
  try { return parseInt(execSync('getconf PAGESIZE', { encoding: 'utf-8' }), 10) || 4096; } catch { return 4096; }
})();
let lastCpuTimes = null;
let lastDiskStats = null;
let lastNetStats = null;
let lastProcessCpu = new Map();
let lastDiskAt = 0;
let lastNetAt = 0;

/**
 * Seconds since `previous` (a Date.now() stamp). Every /proc counter we expose
 * is cumulative, so a rate is only correct when divided by the real elapsed
 * time — the poll interval is configurable and never exactly 1s.
 */
function elapsedSince(previous) {
  const delta = (Date.now() - previous) / 1000;
  return delta > 0 ? delta : 1;
}

// ─── CPU ────────────────────────────────────────────────────────────────────

function parseProcStat() {
  const content = readFileSync('/proc/stat', 'utf-8');
  const lines = content.trim().split('\n');
  const cpus = [];

  for (const line of lines) {
    if (!line.startsWith('cpu')) continue;
    const parts = line.trim().split(/\s+/);
    const name = parts[0];
    const times = parts.slice(1).map(Number);
    const [user, nice, system, idle, iowait, irq, softirq, steal, guest, guestNice] = times;
    const total = user + nice + system + idle + iowait + irq + softirq + steal;
    const idleTotal = idle + iowait;
    cpus.push({ name, total, idle: idleTotal, raw: times });
  }
  return cpus;
}

function calculateCpuUsage(current, previous) {
  if (!previous) return null;
  return current.map((curr, i) => {
    const prev = previous[i];
    if (!prev) return { name: curr.name, usage: 0 };
    const totalDelta = curr.total - prev.total;
    const idleDelta = curr.idle - prev.idle;
    const usage = totalDelta > 0 ? ((totalDelta - idleDelta) / totalDelta) * 100 : 0;
    return { name: curr.name, usage: Math.max(0, Math.min(100, usage)) };
  });
}

function getCpuFrequency() {
  const freqs = [];
  const cpuDirs = readdirSync('/sys/devices/system/cpu').filter(d => /^cpu\d+$/.test(d));
  for (const dir of cpuDirs) {
    try {
      const current = parseInt(readFileSync(`/sys/devices/system/cpu/${dir}/cpufreq/scaling_cur_freq`, 'utf-8'), 10);
      const min = parseInt(readFileSync(`/sys/devices/system/cpu/${dir}/cpufreq/scaling_min_freq`, 'utf-8'), 10);
      const max = parseInt(readFileSync(`/sys/devices/system/cpu/${dir}/cpufreq/scaling_max_freq`, 'utf-8'), 10);
      freqs.push({ core: Number(dir.replace('cpu', '')), current: current / 1000, min: min / 1000, max: max / 1000 });
    } catch {
      try {
        const avg = parseInt(readFileSync(`/sys/devices/system/cpu/${dir}/cpuinfo/avg_freq`, 'utf-8'), 10);
        const num = parseInt(dir.replace('cpu', ''));
        freqs.push({ core: num, current: avg / 1000, min: 0, max: 0 });
      } catch {
        freqs.push({ core: Number(dir.replace('cpu', '')), current: 0, min: 0, max: 0 });
      }
    }
  }
  return freqs;
}

function getThermalStatus() {
  const zones = [];
  try {
    const thermalDirs = readdirSync('/sys/class/thermal');
    for (const dir of thermalDirs) {
      if (!dir.startsWith('thermal_zone')) continue;
      try {
        const type = readFileSync(`/sys/class/thermal/${dir}/type`, 'utf-8').trim();
        const temp = parseInt(readFileSync(`/sys/class/thermal/${dir}/temp`, 'utf-8'), 10) / 1000;
        zones.push({ type, temperature: temp });
      } catch {}
    }
  } catch {}
  return zones;
}

export function getCpuMetrics() {
  const current = parseProcStat();
  const usage = calculateCpuUsage(current, lastCpuTimes);
  lastCpuTimes = current;

  if (!usage) {
    return { overall: { name: 'cpu', usage: 0 }, cores: [], freqs: [], thermal: [] };
  }

  const overall = usage.find(c => c.name === 'cpu');
  const cores = usage.filter(c => c.name.startsWith('cpu') && c.name !== 'cpu');

  return {
    overall: overall || { name: 'cpu', usage: 0 },
    cores: cores.map((c, i) => ({ ...c, core: i })),
    freqs: getCpuFrequency(),
    thermal: getThermalStatus(),
    threadCount: os.cpus().length,
    processCount: readdirSync('/proc').filter(n => /^\d+$/.test(n)).length,
    loadAvg: (() => {
      try {
        const [l1, l5, l15] = readFileSync('/proc/loadavg', 'utf-8').trim().split(' ').map(Number);
        return { l1, l5, l15 };
      } catch { return { l1: 0, l5: 0, l15: 0 }; }
    })(),
  };
}

// ─── MEMORY ─────────────────────────────────────────────────────────────────

export function getMemoryMetrics() {
  const content = readFileSync('/proc/meminfo', 'utf-8');
  const meminfo = {};
  for (const line of content.trim().split('\n')) {
    const [key, value] = line.split(':').map(s => s.trim());
    if (key && value) meminfo[key] = parseInt(value.replace(' kB', ''), 10);
  }

  const total = meminfo.MemTotal || 0;
  const available = meminfo.MemAvailable || 0;
  const free = meminfo.MemFree || 0;
  const buffers = meminfo.Buffers || 0;
  const cached = meminfo.Cached || 0;
  // Slab already includes Slab_Reclaimable — adding it back double counts.
  const slab = meminfo.Slab || 0;
  const slabReclaimable = meminfo.Slab_Reclaimable || 0;
  const swapTotal = meminfo.SwapTotal || 0;
  const swapFree = meminfo.SwapFree || 0;
  const zswap = meminfo.Zswap || 0;
  const zram = meminfo.ZramSize || 0;
  const mapped = meminfo.Mapped || 0;
  const dirty = meminfo.Dirty || 0;
  const writeback = meminfo.Writeback || 0;
  const active = meminfo.Active || 0;
  const inactive = meminfo.Inactive || 0;

  const used = total - available;
  const swapUsed = swapTotal - swapFree;
  const reclaimable = buffers + cached + slabReclaimable;
  const nonReclaimable = meminfo.SUnreclaim ?? Math.max(0, slab - slabReclaimable);

  return {
    total, used, free, available, buffers, cached, slab, slabReclaimable,
    swapTotal, swapUsed, swapFree,
    zswap, zram, mapped, dirty, writeback, active, inactive,
    reclaimable, nonReclaimable,
    usagePercent: total > 0 ? (used / total) * 100 : 0,
    swapUsagePercent: swapTotal > 0 ? (swapUsed / swapTotal) * 100 : 0,
  };
}

// ─── DISK ───────────────────────────────────────────────────────────────────

function parseDiskStats() {
  const content = readFileSync('/proc/diskstats', 'utf-8');
  const stats = {};
  for (const line of content.trim().split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 14) continue;
    const name = parts[2];
    if (!name.match(/^(sd|hd|vd|nvme|mmcblk|loop|ram)/)) continue;
    stats[name] = {
      readsCompleted: parseInt(parts[3], 10),
      readsMerged: parseInt(parts[4], 10),
      sectorsRead: parseInt(parts[5], 10),
      readTime: parseInt(parts[6], 10),
      writesCompleted: parseInt(parts[7], 10),
      writesMerged: parseInt(parts[8], 10),
      sectorsWritten: parseInt(parts[9], 10),
      writeTime: parseInt(parts[10], 10),
      ioInProgress: parseInt(parts[11], 10),
      ioTime: parseInt(parts[12], 10),
      weightedIoTime: parseInt(parts[13], 10),
    };
  }
  return stats;
}

function calculateDiskRates(current, previous, intervalSeconds) {
  if (!previous) return {};
  const rates = {};
  const interval = intervalSeconds > 0 ? intervalSeconds : 1;
  for (const [name, curr] of Object.entries(current)) {
    const prev = previous[name];
    if (!prev) continue;
    const readSectorsDelta = curr.sectorsRead - prev.sectorsRead;
    const writeSectorsDelta = curr.sectorsWritten - prev.sectorsWritten;
    const readOpsDelta = curr.readsCompleted - prev.readsCompleted;
    const writeOpsDelta = curr.writesCompleted - prev.writesCompleted;
    rates[name] = {
      readBytesPerSec: (readSectorsDelta * 512) / interval,
      writeBytesPerSec: (writeSectorsDelta * 512) / interval,
      readIops: readOpsDelta / interval,
      writeIops: writeOpsDelta / interval,
      readLatency: readOpsDelta > 0 ? (curr.readTime - prev.readTime) / readOpsDelta : 0,
      writeLatency: writeOpsDelta > 0 ? (curr.writeTime - prev.writeTime) / writeOpsDelta : 0,
    };
  }
  return rates;
}

function classifyDevice(name) {
  if (name.startsWith('nvme')) return { type: 'NVMe', rotational: 0 };
  if (name.startsWith('sd')) return { type: 'SATA', rotational: undefined };
  if (name.startsWith('vd')) return { type: 'Virtual', rotational: undefined };
  if (name.startsWith('mmcblk')) return { type: 'eMMC', rotational: 0 };
  if (name.startsWith('loop')) return { type: 'Loop', rotational: 0 };
  if (name.startsWith('ram')) return { type: 'RAM', rotational: 0 };
  return { type: 'Unknown', rotational: undefined };
}

function getDeviceProps(name) {
  const props = { ...classifyDevice(name) };
  try {
    const rotPath = `/sys/block/${name}/queue/rotational`;
    if (readFileSync(rotPath, 'utf-8').trim() === '0') props.rotational = 0;
    else props.rotational = 1;
  } catch {}
  try {
    props.model = readFileSync(`/sys/block/${name}/device/model`, 'utf-8').trim();
  } catch {}
  try {
    const size = parseInt(readFileSync(`/sys/block/${name}/size`, 'utf-8'), 10) * 512;
    props.size = size;
  } catch {}
  return props;
}

export function getDiskMetrics() {
  const current = parseDiskStats();
  const now = Date.now();
  const rates = calculateDiskRates(current, lastDiskStats, lastDiskStats ? elapsedSince(lastDiskAt) : 1);
  lastDiskStats = current;
  lastDiskAt = now;

  let dfOutput = '';
  try { dfOutput = execSync('df -B1 --output=source,size,used,avail,pcent,target', { encoding: 'utf-8', timeout: 2000 }); } catch {}
  const mounts = [];
  for (const line of dfOutput.trim().split('\n').slice(1)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 6) {
      mounts.push({
        source: parts[0],
        size: parseInt(parts[1], 10),
        used: parseInt(parts[2], 10),
        available: parseInt(parts[3], 10),
        usePercent: parseFloat(parts[4].replace('%', '')),
        mountpoint: parts.slice(5).join(' '),
      });
    }
  }

  // A mount belongs to a device when df's source resolves to /dev/<name>.
  // Matching on the mountpoint basename missed `/` entirely (basename "/" is "").
  const mountByDevice = new Map();
  for (const mount of mounts) {
    let resolved = mount.source;
    try {
      resolved = realpathSync(mount.source);
    } catch {
      /* keep the raw source */
    }
    const device = path.basename(resolved);
    if (!device || device === '/') continue;
    const existing = mountByDevice.get(device);
    // Prefer the shallowest mountpoint (the real filesystem over a bind mount).
    if (!existing || mount.mountpoint.length < existing.mountpoint.length) {
      mountByDevice.set(device, mount);
    }
  }

  const result = [];
  for (const [name, stat] of Object.entries(current)) {
    const rate = rates[name] || { readBytesPerSec: 0, writeBytesPerSec: 0, readIops: 0, writeIops: 0, readLatency: 0, writeLatency: 0 };
    const props = getDeviceProps(name);
    const mount = mountByDevice.get(name);

    result.push({
      name,
      type: props.type,
      rotational: props.rotational,
      model: props.model || '',
      readBytesPerSec: rate.readBytesPerSec,
      writeBytesPerSec: rate.writeBytesPerSec,
      readIops: rate.readIops,
      writeIops: rate.writeIops,
      readLatency: rate.readLatency,
      writeLatency: rate.writeLatency,
      size: mount?.size || props.size || 0,
      used: mount?.used || 0,
      available: mount?.available || 0,
      usePercent: mount?.usePercent || 0,
      mountpoint: mount?.mountpoint || '',
      ioTime: stat.ioTime,
    });
  }
  return result;
}

// ─── NETWORK ────────────────────────────────────────────────────────────────

function parseNetStats() {
  const content = readFileSync('/proc/net/dev', 'utf-8');
  const stats = {};
  for (const line of content.trim().split('\n').slice(2)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 17) continue;
    const name = parts[0].replace(':', '');
    stats[name] = {
      rxBytes: parseInt(parts[1], 10), rxPackets: parseInt(parts[2], 10),
      rxErrors: parseInt(parts[3], 10), rxDropped: parseInt(parts[4], 10),
      txBytes: parseInt(parts[9], 10), txPackets: parseInt(parts[10], 10),
      txErrors: parseInt(parts[11], 10), txDropped: parseInt(parts[12], 10),
    };
  }
  return stats;
}

function calculateNetRates(current, previous, intervalSeconds) {
  if (!previous) return {};
  const rates = {};
  const interval = intervalSeconds > 0 ? intervalSeconds : 1;
  for (const [name, curr] of Object.entries(current)) {
    const prev = previous[name];
    if (!prev) continue;
    rates[name] = {
      rxBytesPerSec: Math.max(0, curr.rxBytes - prev.rxBytes) / interval,
      txBytesPerSec: Math.max(0, curr.txBytes - prev.txBytes) / interval,
      rxPacketsPerSec: Math.max(0, curr.rxPackets - prev.rxPackets) / interval,
      txPacketsPerSec: Math.max(0, curr.txPackets - prev.txPackets) / interval,
      rxErrors: curr.rxErrors - prev.rxErrors,
      txErrors: curr.txErrors - prev.txErrors,
      rxDropped: curr.rxDropped - prev.rxDropped,
      txDropped: curr.txDropped - prev.txDropped,
    };
  }
  return rates;
}

function getNetworkInterfaceProps(iface) {
  const props = { type: 'unknown', speed: 0 };
  try {
    const speedPath = `/sys/class/net/${iface}/speed`;
    const raw = parseInt(readFileSync(speedPath, 'utf-8'), 10);
    if (Number.isFinite(raw) && raw > 0) props.speed = raw;
  } catch {}
  try {
    const addr = readFileSync(`/sys/class/net/${iface}/address`, 'utf-8').trim();
    props.mac = addr;
  } catch {}
  try {
    const type = readFileSync(`/sys/class/net/${iface}/type`, 'utf-8').trim();
    props.type = parseInt(type, 10);
  } catch {}
  if (/^(en|eth)/.test(iface)) props.type = 'ethernet';
  else if (/^(wl|wlan|wlp)/.test(iface)) props.type = 'wifi';
  else if (/^(tun|tap)/.test(iface)) props.type = 'vpn';
  else if (/^(br|virbr)/.test(iface)) props.type = 'bridge';
  else if (/^(wg|veth)/.test(iface)) props.type = 'virtual';
  else if (/^(lo)/.test(iface)) props.type = 'loopback';
  return props;
}

export function getNetworkMetrics() {
  const current = parseNetStats();
  const now = Date.now();
  const rates = calculateNetRates(current, lastNetStats, lastNetStats ? elapsedSince(lastNetAt) : 1);
  lastNetStats = current;
  lastNetAt = now;

  return Object.entries(current)
    .filter(([name]) => name !== 'lo')
    .map(([name, stat]) => {
      const rate = rates[name] || {};
      const props = getNetworkInterfaceProps(name);
      return {
        name,
        type: props.type,
        speed: props.speed,
        mac: props.mac || '',
        rxBytes: stat.rxBytes,
        txBytes: stat.txBytes,
        rxBytesPerSec: rate.rxBytesPerSec || 0,
        txBytesPerSec: rate.txBytesPerSec || 0,
        rxPacketsPerSec: rate.rxPacketsPerSec || 0,
        txPacketsPerSec: rate.txPacketsPerSec || 0,
        rxErrors: rate.rxErrors || 0,
        txErrors: rate.txErrors || 0,
        rxDropped: rate.rxDropped || 0,
        txDropped: rate.txDropped || 0,
      };
    });
}

// ─── PROCESSES ──────────────────────────────────────────────────────────────

function parseProcessStat(pid) {
  try {
    const content = readFileSync(`/proc/${pid}/stat`, 'utf-8');
    const start = content.indexOf('(');
    const end = content.lastIndexOf(')');
    if (start === -1 || end === -1) return null;
    const comm = content.slice(start + 1, end);
    const after = content.slice(end + 1).trim().split(/\s+/);
    if (after.length < 23) return null;

    const utime = parseInt(after[11], 10);
    const stime = parseInt(after[12], 10);
    const numThreads = parseInt(after[17], 10);
    // Fields after `comm` start at /proc stat field 3 (state), so index 0.
    const state = after[0];
    const ppid = parseInt(after[1], 10);

    let rss = 0;
    try {
      const statmContent = readFileSync(`/proc/${pid}/statm`, 'utf-8');
      const statmParts = statmContent.trim().split(/\s+/);
      rss = parseInt(statmParts[1], 10) * pageSize;
    } catch {}

    // Allowed CPUs: /proc/<pid>/status reports the real affinity mask.
    let affinity = [];
    try {
      const status = readFileSync(`/proc/${pid}/status`, 'utf-8');
      const match = status.match(/^Cpus_allowed_list:\s*(.+)$/m);
      if (match) affinity = parseCpuList(match[1].trim());
    } catch {}

    return { pid: parseInt(pid, 10), comm, utime, stime, numThreads, state, ppid, rss, affinity };
  } catch { return null; }
}

/** "0-3,8,10-11" → [0,1,2,3,8,10,11] */
function parseCpuList(list) {
  if (!list || list === '-') return [];
  const cpus = [];
  for (const part of list.split(',')) {
    const [start, end] = part.split('-').map(Number);
    if (!Number.isFinite(start)) continue;
    const stop = Number.isFinite(end) ? end : start;
    for (let cpu = start; cpu <= stop && cpus.length < 4096; cpu += 1) cpus.push(cpu);
  }
  return cpus;
}

function getStateName(state) {
  const map = { 'R': 'running', 'S': 'sleeping', 'D': 'disk-sleep', 'Z': 'zombie', 'T': 'stopped', 't': 'tracing', 'X': 'dead', 'I': 'idle' };
  return map[state] || 'unknown';
}

export function getProcessMetrics() {
  const entries = readdirSync('/proc').filter(name => /^\d+$/.test(name)).map(name => parseProcessStat(name)).filter(Boolean);
  const now = Date.now();
  const memTotal = (() => {
    try { const m = readFileSync('/proc/meminfo', 'utf-8').match(/MemTotal:\s+(\d+)/); return m ? parseInt(m[1], 10) * 1024 : 0; } catch { return 0; }
  })();

  const alive = new Set(entries.map((proc) => proc.pid));
  for (const pid of lastProcessCpu.keys()) {
    if (!alive.has(pid)) lastProcessCpu.delete(pid);
  }

  const processes = [];
  for (const proc of entries) {
    const last = lastProcessCpu.get(proc.pid);
    let cpuPercent = 0;
    if (last) {
      const timeDelta = (proc.utime + proc.stime) - (last.utime + last.stime);
      const realTimeDelta = (now - last.time) / 1000;
      if (realTimeDelta > 0) cpuPercent = (timeDelta / clkTck) / realTimeDelta * 100;
    }
    lastProcessCpu.set(proc.pid, { utime: proc.utime, stime: proc.stime, time: now });
    const memPercent = memTotal > 0 ? (proc.rss / memTotal) * 100 : 0;
    processes.push({
      pid: proc.pid, ppid: proc.ppid,
      name: proc.comm, state: getStateName(proc.state),
      cpuPercent: Math.min(100 * (os.cpus()?.length || 1), Math.max(0, cpuPercent)),
      memPercent, rss: proc.rss, threads: proc.numThreads,
      affinity: proc.affinity || [],
    });
  }
  processes.sort((a, b) => b.cpuPercent - a.cpuPercent);
  return processes.slice(0, 100);
}

// ─── GPU ────────────────────────────────────────────────────────────────────

export function getGpuMetrics() {
  try {
    const output = execSync('nvidia-smi --query-gpu=index,name,utilization.gpu,utilization.memory,temperature.gpu,power.draw,power.limit,memory.used,memory.total --format=csv,noheader,nounits', { encoding: 'utf-8', timeout: 5000 });
    return output.trim().split('\n').filter(Boolean).map(line => {
      const parts = line.split(',').map(p => p.trim());
      const numeric = (value, integer = false) => { const n = integer ? Number.parseInt(value, 10) : Number.parseFloat(value); return Number.isFinite(n) ? n : null; };
      return {
        id: numeric(parts[0], true), name: parts[1] || 'NVIDIA GPU',
        utilization: numeric(parts[2]), memoryUtilization: numeric(parts[3]),
        temperature: numeric(parts[4], true),
        powerDraw: numeric(parts[5]), powerLimit: numeric(parts[6]),
        memoryUsed: numeric(parts[7], true), memoryTotal: numeric(parts[8], true),
        vendor: 'nvidia',
      };
    });
  } catch {}

  // Intel fallback
  try {
    const intelFreq = readFileSync('/sys/class/drm/card0/gt_cur_freq_mhz', 'utf-8').trim();
    const intelMax = readFileSync('/sys/class/drm/card0/gt_max_freq_mhz', 'utf-8').trim();
    const intelMin = readFileSync('/sys/class/drm/card0/gt_min_freq_mhz', 'utf-8').trim();
    return [{ id: 0, name: 'Intel Integrated GPU', utilization: null, memoryUsed: null, memoryTotal: null, temperature: null, vendor: 'intel', freq: parseInt(intelFreq, 10), maxFreq: parseInt(intelMax, 10) }];
  } catch {}

  // AMD fallback
  try {
    const amdgpuPaths = readdirSync('/sys/class/drm').filter(d => d.startsWith('card'));
    for (const card of amdgpuPaths) {
      try {
        const busy = readFileSync(`/sys/class/drm/${card}/device/gpu_busy_percent`, 'utf-8').trim();
        const vramUsed = readFileSync(`/sys/class/drm/${card}/device/mem_info_vram_used`, 'utf-8').trim();
        const vramTotal = readFileSync(`/sys/class/drm/${card}/device/mem_info_vram_total`, 'utf-8').trim();
        return [{ id: 0, name: `AMD GPU (${card})`, utilization: parseInt(busy, 10), memoryUsed: parseInt(vramUsed, 10) / 1024 / 1024, memoryTotal: parseInt(vramTotal, 10) / 1024 / 1024, temperature: null, vendor: 'amd' }];
      } catch {}
    }
  } catch {}

  return [];
}

// ─── SENSORS ────────────────────────────────────────────────────────────────

export function getSensorMetrics() {
  const sensors = [];
  try {
    const hwmonDirs = readdirSync('/sys/class/hwmon');
    for (const dir of hwmonDirs) {
      const hwmonPath = `/sys/class/hwmon/${dir}`;
      let name = dir;
      try { name = readFileSync(`${hwmonPath}/name`, 'utf-8').trim(); } catch {}
      let files = [];
      try { files = readdirSync(hwmonPath); } catch { continue; }
      const tempInputs = files.filter(f => f.startsWith('temp') && f.endsWith('_input'));
      const fanInputs = files.filter(f => f.startsWith('fan') && f.endsWith('_input'));
      const powerInputs = files.filter(f => f.startsWith('power') && f.endsWith('_input'));

      const temps = {};
      const fans = {};
      const powers = {};

      for (const input of tempInputs) {
        const num = input.replace('_input', '');
        let label = num;
        try { label = readFileSync(`${hwmonPath}/${input.replace('_input', '_label')}`, 'utf-8').trim(); } catch {}
        try { temps[label || num] = parseInt(readFileSync(`${hwmonPath}/${input}`, 'utf-8'), 10) / 1000; } catch {}
      }
      for (const input of fanInputs) {
        const num = input.replace('_input', '');
        let label = num;
        try { label = readFileSync(`${hwmonPath}/${input.replace('_input', '_label')}`, 'utf-8').trim(); } catch {}
        try { fans[label || num] = parseInt(readFileSync(`${hwmonPath}/${input}`, 'utf-8'), 10); } catch {}
      }
      for (const input of powerInputs) {
        const num = input.replace('_input', '');
        try { powers[num] = parseInt(readFileSync(`${hwmonPath}/${input}`, 'utf-8'), 10) / 1e9; } catch {}
      }

      if (Object.keys(temps).length > 0 || Object.keys(fans).length > 0 || Object.keys(powers).length > 0) {
        sensors.push({ name, temps, fans, powers });
      }
    }
  } catch {}
  return sensors;
}

// ─── BATTERY ────────────────────────────────────────────────────────────────

export function getBatteryMetrics() {
  try {
    const batDirs = readdirSync('/sys/class/power_supply').filter(d => d.startsWith('BAT'));
    const batteries = [];
    for (const dir of batDirs) {
      const batPath = `/sys/class/power_supply/${dir}`;
      let capacity = 0, online = false, powerNow = 0, voltageNow = 0, energyFull = 0, energyNow = 0;
      let status = 'unknown', chargeCycle = 0;
      try { capacity = parseInt(readFileSync(`${batPath}/capacity`, 'utf-8'), 10); } catch {}
      try { online = readFileSync(`${batPath}/online`, 'utf-8').trim() === '1'; } catch {}
      try { status = readFileSync(`${batPath}/status`, 'utf-8').trim(); } catch {}
      try { powerNow = parseInt(readFileSync(`${batPath}/power_now`, 'utf-8'), 10) / 1e6; } catch {}
      try { voltageNow = parseInt(readFileSync(`${batPath}/voltage_now`, 'utf-8'), 10) / 1e6; } catch {}
      try { energyFull = parseInt(readFileSync(`${batPath}/energy_full`, 'utf-8'), 10); } catch {}
      try { energyNow = parseInt(readFileSync(`${batPath}/energy_now`, 'utf-8'), 10); } catch {}
      if (!energyFull || !energyNow) {
        // Charge counters are in µAh; multiply by voltage to get µWh.
        try {
          const chargeFull = parseInt(readFileSync(`${batPath}/charge_full`, 'utf-8'), 10);
          const chargeNow = parseInt(readFileSync(`${batPath}/charge_now`, 'utf-8'), 10);
          if (chargeFull > 0 && chargeNow > 0 && voltageNow > 0) {
            energyFull = chargeFull * voltageNow * 1000;
            energyNow = chargeNow * voltageNow * 1000;
          }
        } catch {}
      }
      try { chargeCycle = parseInt(readFileSync(`${batPath}/charge_cycle_count`, 'utf-8'), 10); } catch {}
      if (capacity >= 0) {
        const remaining = energyNow > 0 ? energyNow / 1e6 : 0;
        const full = energyFull > 0 ? energyFull / 1e6 : 0;
        const timeToEmpty = powerNow > 0 && remaining > 0 ? (remaining / powerNow) : null;
        const timeToFull = powerNow > 0 && status === 'Charging' ? ((full - remaining) / powerNow) : null;
        batteries.push({ id: dir, capacity, online, status, powerNow, voltageNow, energyFull: full, energyNow: remaining, chargeCycle, timeToEmpty, timeToFull });
      }
    }
    return batteries;
  } catch { return []; }
}

// ─── SYSTEM INFO ────────────────────────────────────────────────────────────

export function getSystemInfo() {
  let uptime = 0;
  try { uptime = parseFloat(readFileSync('/proc/uptime', 'utf-8').split(' ')[0]); } catch {}
  let kernel = '';
  try { kernel = execSync('uname -r', { encoding: 'utf-8' }).trim(); } catch {}
  let distro = '';
  try { distro = execSync('lsb_release -ds 2>/dev/null || cat /etc/os-release | grep PRETTY_NAME | cut -d"=" -f2 | tr -d "\\""', { encoding: 'utf-8' }).trim(); } catch {}

  return {
    hostname: os.hostname(), uptime, platform: os.platform(), arch: os.arch(),
    cpus: os.cpus().length, totalMemory: os.totalmem(), kernel, distro,
    cpuModel: (() => { try { return execSync('grep -m1 "model name" /proc/cpuinfo', { encoding: 'utf-8' }).split(':')[1]?.trim(); } catch { return ''; } })(),
  };
}

// ─── KILL / RENICE ──────────────────────────────────────────────────────────

const SIGNALS = new Set(['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGHUP', 'SIGSTOP', 'SIGCONT']);

export function killProcess(pid, signal = 'SIGTERM') {
  if (!Number.isInteger(pid) || pid <= 1) return { success: false, error: 'invalid pid' };
  if (!SIGNALS.has(signal)) return { success: false, error: 'unsupported signal' };
  try { process.kill(pid, signal); return { success: true }; }
  catch (e) { return { success: false, error: e.message }; }
}

export function reniceProcess(pid, priority) {
  if (!Number.isInteger(pid) || pid <= 1) return { success: false, error: 'invalid pid' };
  if (!Number.isInteger(priority) || priority < -20 || priority > 19) return { success: false, error: 'priority out of range' };
  try {
    execSync(`renice ${priority} -p ${pid}`, { encoding: 'utf-8', timeout: 2000 });
    return { success: true, priority };
  } catch (e) { return { success: false, error: e.message }; }
}

export function setCpuAffinity(pid, cores) {
  try {
    const hexMask = cores.map(i => '1'.padStart(64 - i * 64, '0')).join('');
    execSync(`taskset -p -c ${cores.join(',')} ${pid}`, { encoding: 'utf-8' });
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}

