import { readFileSync, readdirSync, realpathSync, existsSync, statfsSync } from 'fs';
import os from 'os';
import path from 'path';

// Cached hardware constants (read once safely without shell spawning)
const pageSize = (() => {
  try {
    return os.constants?.pageSize || 4096;
  } catch {
    return 4096;
  }
})();

// USER_HZ is standard 100 on Linux x86/ARM
const clkTck = 100;

// Module-level sampling baselines
let lastCpuMap = new Map();
let lastDiskStats = null;
let lastNetStats = null;
let lastProcessCpu = new Map();
let lastDiskAt = 0;
let lastNetAt = 0;

function elapsedSince(previous) {
  const delta = (Date.now() - previous) / 1000;
  return delta > 0 ? delta : 1;
}

// ─── STATIC SYSTEM METADATA (CACHED ONCE, ZERO SHELL) ───────────────────────

const staticSystemInfo = (() => {
  let kernel = os.release();
  let distro = '';
  try {
    if (existsSync('/etc/os-release')) {
      const osRelease = readFileSync('/etc/os-release', 'utf-8');
      const m = osRelease.match(/^PRETTY_NAME="?([^"\n]+)"?/m);
      if (m) distro = m[1];
    }
  } catch {}

  let cpuModel = '';
  try {
    if (existsSync('/proc/cpuinfo')) {
      const cpuinfo = readFileSync('/proc/cpuinfo', 'utf-8');
      const m = cpuinfo.match(/^model name\s*:\s*(.+)$/m);
      if (m) cpuModel = m[1].trim();
    }
  } catch {}

  if (!cpuModel) {
    const cpus = os.cpus();
    if (cpus && cpus[0]) cpuModel = cpus[0].model;
  }

  return { kernel, distro, cpuModel };
})();

// ─── CPU TELEMETRY ──────────────────────────────────────────────────────────

function parseProcStat() {
  try {
    const content = readFileSync('/proc/stat', 'utf-8');
    const lines = content.trim().split('\n');
    const cpus = [];

    for (const line of lines) {
      if (!line.startsWith('cpu')) continue;
      const parts = line.trim().split(/\s+/);
      const name = parts[0];
      const times = parts.slice(1).map(Number);
      const [user, nice, system, idle, iowait, irq, softirq, steal] = times;
      const total = user + nice + system + idle + (iowait || 0) + (irq || 0) + (softirq || 0) + (steal || 0);
      const idleTotal = idle + (iowait || 0);
      cpus.push({ name, total, idle: idleTotal, raw: times });
    }
    return cpus;
  } catch {
    return [];
  }
}

function calculateCpuUsage(current, previousMap) {
  if (!previousMap || previousMap.size === 0) return null;
  return current.map((curr) => {
    const prev = previousMap.get(curr.name);
    if (!prev) return { name: curr.name, usage: null };
    const totalDelta = curr.total - prev.total;
    const idleDelta = curr.idle - prev.idle;

    // Handle counter rollbacks / resets
    if (totalDelta <= 0 || idleDelta < 0) {
      return { name: curr.name, usage: null };
    }
    const usage = Math.max(0, Math.min(100, ((totalDelta - idleDelta) / totalDelta) * 100));
    return { name: curr.name, usage };
  });
}

function getCpuFrequency() {
  const freqs = [];
  try {
    const cpuDirs = readdirSync('/sys/devices/system/cpu').filter((d) => /^cpu\d+$/.test(d));
    for (const dir of cpuDirs) {
      const coreNum = Number(dir.replace('cpu', ''));
      try {
        const curPath = `/sys/devices/system/cpu/${dir}/cpufreq/scaling_cur_freq`;
        const minPath = `/sys/devices/system/cpu/${dir}/cpufreq/scaling_min_freq`;
        const maxPath = `/sys/devices/system/cpu/${dir}/cpufreq/scaling_max_freq`;

        const current = existsSync(curPath) ? parseInt(readFileSync(curPath, 'utf-8'), 10) : null;
        const min = existsSync(minPath) ? parseInt(readFileSync(minPath, 'utf-8'), 10) : null;
        const max = existsSync(maxPath) ? parseInt(readFileSync(maxPath, 'utf-8'), 10) : null;

        freqs.push({
          core: coreNum,
          current: Number.isFinite(current) && current > 0 ? current / 1000 : null,
          min: Number.isFinite(min) && min > 0 ? min / 1000 : null,
          max: Number.isFinite(max) && max > 0 ? max / 1000 : null,
        });
      } catch {
        freqs.push({ core: coreNum, current: null, min: null, max: null });
      }
    }
  } catch {}
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
        const rawTemp = parseInt(readFileSync(`/sys/class/thermal/${dir}/temp`, 'utf-8'), 10);
        if (Number.isFinite(rawTemp)) {
          zones.push({ type, temperature: rawTemp / 1000 });
        }
      } catch {}
    }
  } catch {}
  return zones;
}

export function getCpuMetrics() {
  const current = parseProcStat();
  const usage = calculateCpuUsage(current, lastCpuMap);

  // Update CPU baseline Map keyed by CPU label
  const nextMap = new Map();
  for (const c of current) nextMap.set(c.name, c);
  lastCpuMap = nextMap;

  let overallUsage = null;
  let coreUsages = [];

  if (usage) {
    const overall = usage.find((c) => c.name === 'cpu');
    overallUsage = overall ? overall.usage : null;
    coreUsages = usage
      .filter((c) => c.name.startsWith('cpu') && c.name !== 'cpu')
      .map((c, i) => ({ ...c, core: i }));
  }

  let loadAvg = { l1: null, l5: null, l15: null };
  try {
    const parts = readFileSync('/proc/loadavg', 'utf-8').trim().split(/\s+/).map(Number);
    if (parts.length >= 3 && parts.every(Number.isFinite)) {
      loadAvg = { l1: parts[0], l5: parts[1], l15: parts[2] };
    }
  } catch {}

  let processCount = null;
  try {
    processCount = readdirSync('/proc').filter((n) => /^\d+$/.test(n)).length;
  } catch {}

  return {
    overall: { name: 'cpu', usage: overallUsage },
    cores: coreUsages,
    freqs: getCpuFrequency(),
    thermal: getThermalStatus(),
    threadCount: os.cpus().length,
    processCount,
    loadAvg,
  };
}

// ─── MEMORY TELEMETRY (TRUTHFUL DEFINITIONS IN BYTES) ───────────────────────

export function getMemoryMetrics() {
  try {
    const content = readFileSync('/proc/meminfo', 'utf-8');
    const meminfo = {};
    for (const line of content.trim().split('\n')) {
      const [key, value] = line.split(':').map((s) => s.trim());
      if (key && value) {
        meminfo[key] = parseInt(value.replace(' kB', ''), 10);
      }
    }

    const kbToBytes = (v) => (Number.isFinite(v) ? v * 1024 : 0);

    const total = kbToBytes(meminfo.MemTotal);
    const available = kbToBytes(meminfo.MemAvailable);
    const free = kbToBytes(meminfo.MemFree);
    const buffers = kbToBytes(meminfo.Buffers);
    const cached = kbToBytes(meminfo.Cached);
    const slab = kbToBytes(meminfo.Slab);
    const slabReclaimable = kbToBytes(meminfo.Slab_Reclaimable);
    const swapTotal = kbToBytes(meminfo.SwapTotal);
    const swapFree = kbToBytes(meminfo.SwapFree);
    const committedAs = kbToBytes(meminfo.Committed_AS);
    const commitLimit = kbToBytes(meminfo.CommitLimit);

    // True Linux definition: MemTotal - MemAvailable = Estimated RAM used
    const used = Math.max(0, total - available);
    const swapUsed = Math.max(0, swapTotal - swapFree);
    const reclaimable = buffers + cached + slabReclaimable;

    return {
      total,
      used, // Estimated RAM used (MemTotal - MemAvailable)
      available,
      free,
      buffers,
      cached,
      slab,
      slabReclaimable,
      swapTotal,
      swapUsed,
      swapFree,
      committedAs,
      commitLimit,
      reclaimable,
      usagePercent: total > 0 ? (used / total) * 100 : null,
      swapUsagePercent: swapTotal > 0 ? (swapUsed / swapTotal) * 100 : null,
    };
  } catch {
    return null;
  }
}

// ─── STORAGE & FILESYSTEMS (STRICT SEPARATION) ──────────────────────────────

function parseDiskStats() {
  try {
    const content = readFileSync('/proc/diskstats', 'utf-8');
    const stats = {};
    for (const line of content.trim().split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 14) continue;
      const name = parts[2];
      // Exclude loop and ram virtual disks
      if (/^(loop|ram)/.test(name)) continue;

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
  } catch {
    return {};
  }
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

    // Handle counter resets
    rates[name] = {
      readBytesPerSec: Math.max(0, readSectorsDelta * 512) / interval,
      writeBytesPerSec: Math.max(0, writeSectorsDelta * 512) / interval,
      readIops: Math.max(0, readOpsDelta) / interval,
      writeIops: Math.max(0, writeOpsDelta) / interval,
      readLatency: readOpsDelta > 0 ? Math.max(0, curr.readTime - prev.readTime) / readOpsDelta : 0,
      writeLatency: writeOpsDelta > 0 ? Math.max(0, curr.writeTime - prev.writeTime) / writeOpsDelta : 0,
    };
  }
  return rates;
}

function getBlockDeviceProps(name) {
  const props = { type: 'Block Device', rotational: null, model: '', size: null };
  if (name.startsWith('nvme')) props.type = 'NVMe SSD';
  else if (name.startsWith('sd')) props.type = 'SATA / SCSI';
  else if (name.startsWith('vd')) props.type = 'VirtIO Block';
  else if (name.startsWith('mmcblk')) props.type = 'eMMC / SD';
  else if (name.startsWith('dm-')) props.type = 'Device Mapper / LVM';
  else if (name.startsWith('md')) props.type = 'Software RAID';

  try {
    const rot = readFileSync(`/sys/block/${name}/queue/rotational`, 'utf-8').trim();
    props.rotational = rot === '1' ? 1 : 0;
  } catch {}

  try {
    props.model = readFileSync(`/sys/block/${name}/device/model`, 'utf-8').trim();
  } catch {}

  try {
    const sectors = parseInt(readFileSync(`/sys/block/${name}/size`, 'utf-8'), 10);
    if (Number.isFinite(sectors) && sectors > 0) props.size = sectors * 512;
  } catch {}

  return props;
}

function parseFilesystemMounts() {
  const filesystems = [];
  try {
    // Read /proc/mounts directly without child_process shell
    const content = readFileSync('/proc/mounts', 'utf-8');
    const seenMounts = new Set();

    for (const line of content.trim().split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 3) continue;
      const [source, mountpoint, fstype] = parts;

      // Skip pseudo filesystems
      if (/^(proc|sysfs|devpts|cgroup|tmpfs|overlay|mqueue|debugfs|securityfs|pstore|autofs|bpf|fusectl|tracefs|hugetlbfs|configfs|ramfs)/.test(fstype)) {
        continue;
      }
      if (seenMounts.has(mountpoint)) continue;
      seenMounts.add(mountpoint);

      let stat = null;
      try {
        if (typeof statfsSync === 'function') {
          stat = statfsSync(mountpoint);
        }
      } catch {}

      if (stat) {
        const bsize = Number(stat.bsize || 4096);
        const size = Number(stat.blocks) * bsize;
        const available = Number(stat.bavail) * bsize;
        const used = Math.max(0, size - Number(stat.bfree) * bsize);
        const usePercent = size > 0 ? (used / size) * 100 : null;
        filesystems.push({
          name: mountpoint === '/' ? 'rootfs' : path.basename(mountpoint) || source,
          source,
          mountpoint,
          fstype,
          size,
          used,
          available,
          usePercent,
          isRoot: mountpoint === '/',
        });
      } else {
        filesystems.push({
          name: mountpoint === '/' ? 'rootfs' : path.basename(mountpoint) || source,
          source,
          mountpoint,
          fstype,
          size: null,
          used: null,
          available: null,
          usePercent: null,
          isRoot: mountpoint === '/',
        });
      }
    }
  } catch {}
  return filesystems;
}

export function getDiskMetrics() {
  const current = parseDiskStats();
  const now = Date.now();
  const rates = calculateDiskRates(current, lastDiskStats, lastDiskStats ? elapsedSince(lastDiskAt) : 1);
  lastDiskStats = current;
  lastDiskAt = now;

  const filesystems = parseFilesystemMounts();
  const blockDevices = [];

  for (const [name, stat] of Object.entries(current)) {
    // Only whole block devices registered in /sys/block
    if (!existsSync(`/sys/block/${name}`)) continue;

    const rate = rates[name] || {
      readBytesPerSec: 0,
      writeBytesPerSec: 0,
      readIops: 0,
      writeIops: 0,
      readLatency: 0,
      writeLatency: 0,
    };
    const props = getBlockDeviceProps(name);

    blockDevices.push({
      name,
      type: props.type,
      rotational: props.rotational,
      model: props.model,
      size: props.size,
      readBytesPerSec: rate.readBytesPerSec,
      writeBytesPerSec: rate.writeBytesPerSec,
      readIops: rate.readIops,
      writeIops: rate.writeIops,
      readLatency: rate.readLatency,
      writeLatency: rate.writeLatency,
      ioTime: stat.ioTime,
    });
  }

  // Find primary root filesystem
  const rootFs = filesystems.find((f) => f.mountpoint === '/') || filesystems[0] || null;

  // Composite result maintaining backwards compatibility while strictly separating data models
  const composite = blockDevices.map((bd) => {
    const matchingFs = filesystems.find((fs) => fs.source.endsWith(bd.name) || fs.source === `/dev/${bd.name}`);
    return {
      ...bd,
      mountpoint: matchingFs ? matchingFs.mountpoint : '',
      used: matchingFs ? matchingFs.used : 0,
      available: matchingFs ? matchingFs.available : 0,
      usePercent: matchingFs ? matchingFs.usePercent : null,
    };
  });

  composite.blockDevices = blockDevices;
  composite.filesystems = filesystems;
  composite.rootFilesystem = rootFs;

  return composite;
}

// ─── NETWORK TELEMETRY ──────────────────────────────────────────────────────

function parseNetStats() {
  try {
    const content = readFileSync('/proc/net/dev', 'utf-8');
    const stats = {};
    for (const line of content.trim().split('\n').slice(2)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 17) continue;
      const name = parts[0].replace(':', '');
      stats[name] = {
        rxBytes: parseInt(parts[1], 10),
        rxPackets: parseInt(parts[2], 10),
        rxErrors: parseInt(parts[3], 10),
        rxDropped: parseInt(parts[4], 10),
        txBytes: parseInt(parts[9], 10),
        txPackets: parseInt(parts[10], 10),
        txErrors: parseInt(parts[11], 10),
        txDropped: parseInt(parts[12], 10),
      };
    }
    return stats;
  } catch {
    return {};
  }
}

function calculateNetRates(current, previous, intervalSeconds) {
  if (!previous) return {};
  const rates = {};
  const interval = intervalSeconds > 0 ? intervalSeconds : 1;

  for (const [name, curr] of Object.entries(current)) {
    const prev = previous[name];
    if (!prev) continue;

    const rxDelta = curr.rxBytes - prev.rxBytes;
    const txDelta = curr.txBytes - prev.txBytes;
    const rxPktDelta = curr.rxPackets - prev.rxPackets;
    const txPktDelta = curr.txPackets - prev.txPackets;

    rates[name] = {
      rxBytesPerSec: Math.max(0, rxDelta) / interval,
      txBytesPerSec: Math.max(0, txDelta) / interval,
      rxPacketsPerSec: Math.max(0, rxPktDelta) / interval,
      txPacketsPerSec: Math.max(0, txPktDelta) / interval,
      rxErrors: Math.max(0, curr.rxErrors - prev.rxErrors),
      txErrors: Math.max(0, curr.txErrors - prev.txErrors),
      rxDropped: Math.max(0, curr.rxDropped - prev.rxDropped),
      txDropped: Math.max(0, curr.txDropped - prev.txDropped),
    };
  }
  return rates;
}

function getNetworkInterfaceProps(iface) {
  let type = 'unknown';
  let speed = null;
  let operstate = 'unknown';

  try {
    const state = readFileSync(`/sys/class/net/${iface}/operstate`, 'utf-8').trim();
    if (state) operstate = state;
  } catch {}

  try {
    const rawSpeed = parseInt(readFileSync(`/sys/class/net/${iface}/speed`, 'utf-8'), 10);
    if (Number.isFinite(rawSpeed) && rawSpeed > 0) speed = rawSpeed;
  } catch {}

  if (/^(en|eth)/.test(iface)) type = 'ethernet';
  else if (/^(wl|wlan|wlp)/.test(iface)) type = 'wifi';
  else if (/^(tun|tap)/.test(iface)) type = 'vpn';
  else if (/^(br|virbr)/.test(iface)) type = 'bridge';
  else if (/^(wg|veth)/.test(iface)) type = 'virtual';
  else if (/^(lo)/.test(iface)) type = 'loopback';

  return { type, speed, operstate };
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
        operstate: props.operstate,
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

// ─── PROCESS INVENTORY & PRIVILEGE CLASSIFICATION ───────────────────────────

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
    const state = after[0];
    const ppid = parseInt(after[1], 10);

    let rss = 0;
    try {
      const statmParts = readFileSync(`/proc/${pid}/statm`, 'utf-8').trim().split(/\s+/);
      rss = parseInt(statmParts[1], 10) * pageSize;
    } catch {}

    let affinity = [];
    let uid = null;
    try {
      const status = readFileSync(`/proc/${pid}/status`, 'utf-8');
      const match = status.match(/^Cpus_allowed_list:\s*(.+)$/m);
      if (match) affinity = parseCpuList(match[1].trim());
      const uMatch = status.match(/^Uid:\s*(\d+)/m);
      if (uMatch) uid = parseInt(uMatch[1], 10);
    } catch {}

    const isKernel = ppid === 2 || parseInt(pid, 10) === 2;
    const isPrivileged = uid === 0;
    const privilegeClass = isKernel ? 'kernel-task' : isPrivileged ? 'root-sys' : 'user-space';

    return {
      pid: parseInt(pid, 10),
      comm,
      utime,
      stime,
      numThreads,
      state,
      ppid,
      rss,
      affinity,
      uid,
      isKernel,
      isPrivileged,
      privilegeClass,
    };
  } catch {
    return null;
  }
}

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
  const map = {
    R: 'running',
    S: 'sleeping',
    D: 'disk-sleep',
    Z: 'zombie',
    T: 'stopped',
    t: 'tracing',
    X: 'dead',
    I: 'idle',
  };
  return map[state] || 'unknown';
}

export function getProcessMetrics() {
  try {
    const pids = readdirSync('/proc').filter((name) => /^\d+$/.test(name));
    const totalSeen = pids.length;
    const entries = pids.map((pid) => parseProcessStat(pid)).filter(Boolean);
    const now = Date.now();

    const memTotal = (() => {
      try {
        const m = readFileSync('/proc/meminfo', 'utf-8').match(/MemTotal:\s+(\d+)/);
        return m ? parseInt(m[1], 10) * 1024 : 0;
      } catch {
        return 0;
      }
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
        const timeDelta = proc.utime + proc.stime - (last.utime + last.stime);
        const realTimeDelta = (now - last.time) / 1000;
        if (realTimeDelta > 0) cpuPercent = ((timeDelta / clkTck) / realTimeDelta) * 100;
      }
      lastProcessCpu.set(proc.pid, { utime: proc.utime, stime: proc.stime, time: now });
      const memPercent = memTotal > 0 ? (proc.rss / memTotal) * 100 : 0;

      processes.push({
        pid: proc.pid,
        ppid: proc.ppid,
        name: proc.comm,
        state: getStateName(proc.state),
        cpuPercent: Math.min(100 * (os.cpus()?.length || 1), Math.max(0, cpuPercent)),
        memPercent,
        rss: proc.rss,
        threads: proc.numThreads,
        affinity: proc.affinity || [],
        uid: proc.uid,
        isKernel: proc.isKernel,
        isPrivileged: proc.isPrivileged,
        privilegeClass: proc.privilegeClass,
        threatClassification: proc.privilegeClass, // Backward compatibility alias
      });
    }

    processes.sort((a, b) => b.cpuPercent - a.cpuPercent);
    const top100 = processes.slice(0, 100);
    top100.totalSeen = totalSeen;
    top100.sampledCount = top100.length;
    return top100;
  } catch {
    return [];
  }
}

// ─── GPU TELEMETRY (NORMALIZED IN BYTES) ─────────────────────────────────────

let hasNvidiaSmi = null;

export function getGpuMetrics() {
  // 1. Intel i915 / Xe
  try {
    if (existsSync('/sys/class/drm/card0/gt_cur_freq_mhz')) {
      const curFreq = parseInt(readFileSync('/sys/class/drm/card0/gt_cur_freq_mhz', 'utf-8').trim(), 10);
      const maxFreq = parseInt(readFileSync('/sys/class/drm/card0/gt_max_freq_mhz', 'utf-8').trim(), 10);
      return [
        {
          id: 0,
          name: 'Intel Integrated Graphics',
          vendor: 'intel',
          utilization: null, // Unsupported/unmeasured
          memoryUsedBytes: null,
          memoryTotalBytes: null,
          temperature: null,
          freq: Number.isFinite(curFreq) ? curFreq : null,
          maxFreq: Number.isFinite(maxFreq) ? maxFreq : null,
        },
      ];
    }
  } catch {}

  // 2. AMD GPU sysfs
  try {
    const cards = readdirSync('/sys/class/drm').filter(
      (d) => /^card\d+$/.test(d) && existsSync(`/sys/class/drm/${d}/device/gpu_busy_percent`)
    );
    if (cards.length > 0) {
      const gpus = [];
      for (const card of cards) {
        try {
          const busy = parseInt(readFileSync(`/sys/class/drm/${card}/device/gpu_busy_percent`, 'utf-8').trim(), 10);
          const vramUsed = parseInt(readFileSync(`/sys/class/drm/${card}/device/mem_info_vram_used`, 'utf-8').trim(), 10);
          const vramTotal = parseInt(readFileSync(`/sys/class/drm/${card}/device/mem_info_vram_total`, 'utf-8').trim(), 10);
          gpus.push({
            id: Number(card.replace('card', '')),
            name: `AMD GPU (${card})`,
            vendor: 'amd',
            utilization: Number.isFinite(busy) ? busy : null,
            memoryUsedBytes: Number.isFinite(vramUsed) ? vramUsed : null,
            memoryTotalBytes: Number.isFinite(vramTotal) ? vramTotal : null,
            temperature: null,
          });
        } catch {}
      }
      if (gpus.length > 0) return gpus;
    }
  } catch {}

  return [];
}

// ─── HARDWARE SENSORS ───────────────────────────────────────────────────────

export function getSensorMetrics() {
  const sensors = [];
  try {
    const hwmonDirs = readdirSync('/sys/class/hwmon');
    for (const dir of hwmonDirs) {
      const hwmonPath = `/sys/class/hwmon/${dir}`;
      let name = dir;
      try {
        name = readFileSync(`${hwmonPath}/name`, 'utf-8').trim();
      } catch {}

      let files = [];
      try {
        files = readdirSync(hwmonPath);
      } catch {
        continue;
      }
      const tempInputs = files.filter((f) => f.startsWith('temp') && f.endsWith('_input'));
      const fanInputs = files.filter((f) => f.startsWith('fan') && f.endsWith('_input'));
      const powerInputs = files.filter((f) => f.startsWith('power') && f.endsWith('_input'));

      const temps = {};
      const fans = {};
      const powers = {};

      for (const input of tempInputs) {
        const num = input.replace('_input', '');
        let label = num;
        try {
          label = readFileSync(`${hwmonPath}/${input.replace('_input', '_label')}`, 'utf-8').trim();
        } catch {}
        try {
          const t = parseInt(readFileSync(`${hwmonPath}/${input}`, 'utf-8'), 10);
          if (Number.isFinite(t)) temps[label || num] = t / 1000;
        } catch {}
      }

      for (const input of fanInputs) {
        const num = input.replace('_input', '');
        let label = num;
        try {
          label = readFileSync(`${hwmonPath}/${input.replace('_input', '_label')}`, 'utf-8').trim();
        } catch {}
        try {
          const rpm = parseInt(readFileSync(`${hwmonPath}/${input}`, 'utf-8'), 10);
          if (Number.isFinite(rpm)) fans[label || num] = rpm;
        } catch {}
      }

      for (const input of powerInputs) {
        const num = input.replace('_input', '');
        try {
          const p = parseInt(readFileSync(`${hwmonPath}/${input}`, 'utf-8'), 10);
          if (Number.isFinite(p)) powers[num] = p / 1e6;
        } catch {}
      }

      if (Object.keys(temps).length > 0 || Object.keys(fans).length > 0 || Object.keys(powers).length > 0) {
        sensors.push({ name, temps, fans, powers });
      }
    }
  } catch {}
  return sensors;
}

// ─── BATTERY (ACCURATE NULL-SAFETY) ─────────────────────────────────────────

export function getBatteryMetrics() {
  try {
    if (!existsSync('/sys/class/power_supply')) return [];
    const batDirs = readdirSync('/sys/class/power_supply').filter((d) => d.startsWith('BAT'));
    const batteries = [];

    for (const dir of batDirs) {
      const batPath = `/sys/class/power_supply/${dir}`;
      let capacity = null;
      let online = false;
      let status = 'unknown';
      let powerNow = null;
      let voltageNow = null;

      try {
        const c = parseInt(readFileSync(`${batPath}/capacity`, 'utf-8'), 10);
        if (Number.isFinite(c) && c >= 0 && c <= 100) capacity = c;
      } catch {}

      try {
        online = readFileSync(`${batPath}/online`, 'utf-8').trim() === '1';
      } catch {}

      try {
        status = readFileSync(`${batPath}/status`, 'utf-8').trim();
      } catch {}

      try {
        const p = parseInt(readFileSync(`${batPath}/power_now`, 'utf-8'), 10);
        if (Number.isFinite(p)) powerNow = p / 1e6;
      } catch {}

      try {
        const v = parseInt(readFileSync(`${batPath}/voltage_now`, 'utf-8'), 10);
        if (Number.isFinite(v)) voltageNow = v / 1e6;
      } catch {}

      batteries.push({
        id: dir,
        capacity,
        online,
        status,
        powerNow,
        voltageNow,
      });
    }
    return batteries;
  } catch {
    return [];
  }
}

// ─── SYSTEM INFO (ZERO SHELL INVOCATION) ────────────────────────────────────

export function getSystemInfo() {
  let uptime = null;
  try {
    uptime = parseFloat(readFileSync('/proc/uptime', 'utf-8').split(' ')[0]);
  } catch {}

  return {
    hostname: os.hostname(),
    uptime,
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    totalMemory: os.totalmem(),
    kernel: staticSystemInfo.kernel,
    distro: staticSystemInfo.distro,
    cpuModel: staticSystemInfo.cpuModel,
  };
}

// ─── PRESSURE STALL INFORMATION (PSI) ───────────────────────────────────────

function parsePsiFile(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, 'utf-8');
    const result = {};
    for (const line of content.trim().split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 2) continue;
      const type = parts[0]; // 'some' or 'full'
      const metrics = {};
      for (const item of parts.slice(1)) {
        const [k, v] = item.split('=');
        if (k && v !== undefined) metrics[k] = parseFloat(v);
      }
      result[type] = metrics;
    }
    return result;
  } catch {
    return null;
  }
}

export function getPsiMetrics() {
  const hasPsi = existsSync('/proc/pressure/cpu') || existsSync('/proc/pressure/memory');
  if (!hasPsi) {
    return {
      supported: false,
      cpu: null,
      memory: null,
      io: null,
    };
  }

  return {
    supported: true,
    cpu: parsePsiFile('/proc/pressure/cpu'),
    memory: parsePsiFile('/proc/pressure/memory'),
    io: parsePsiFile('/proc/pressure/io'),
  };
}

// ─── SECURITY & KERNEL POSTURE ──────────────────────────────────────────────

export function getSecurityMetrics() {
  let aslr = null;
  try {
    if (existsSync('/proc/sys/kernel/randomize_va_space')) {
      aslr = parseInt(readFileSync('/proc/sys/kernel/randomize_va_space', 'utf-8').trim(), 10);
    }
  } catch {}

  let entropy = null;
  try {
    if (existsSync('/proc/sys/kernel/random/entropy_avail')) {
      entropy = parseInt(readFileSync('/proc/sys/kernel/random/entropy_avail', 'utf-8').trim(), 10);
    }
  } catch {}

  let appArmor = false;
  try {
    appArmor = existsSync('/sys/kernel/security/apparmor');
  } catch {}

  let selinux = false;
  try {
    selinux = existsSync('/sys/fs/selinux');
  } catch {}

  let isContainer = null;
  try {
    if (existsSync('/.dockerenv') || existsSync('/run/.containerenv')) {
      isContainer = true;
    } else {
      isContainer = false;
    }
  } catch {}

  let lockdown = 'none';
  try {
    if (existsSync('/sys/kernel/security/lockdown')) {
      const l = readFileSync('/sys/kernel/security/lockdown', 'utf-8').trim();
      const match = l.match(/\[(.*?)\]/);
      lockdown = match ? match[1] : l;
    }
  } catch {}

  return {
    aslr,
    aslrLabel: aslr === 2 ? 'Full ASLR (v2)' : aslr === 1 ? 'Partial ASLR (v1)' : aslr === 0 ? 'Disabled' : 'Unsupported',
    entropy,
    entropyStatus: entropy != null ? (entropy >= 256 ? 'Nominal Entropy Available' : 'Low Entropy Pool') : 'Unsupported',
    appArmor,
    selinux,
    isContainer,
    lockdown,
    isolationProfile: isContainer === true ? 'Containerized Sandbox' : isContainer === false ? 'Baremetal / Non-Container Host' : 'Unknown',
  };
}

// ─── SYSTEM INVESTIGATIVE AUDIT (PURE FUNCTION OVER SNAPSHOT) ───────────────

/**
 * Pure evaluation function.
 * Evaluates the immutable telemetry snapshot without rescanning /proc
 * or mutating delta baselines.
 */
export function getHostAudit(snapshot = null) {
  let snap = snapshot;
  if (!snap || typeof snap !== 'object' || (!snap.system && !snap.cpu && !snap.memory)) {
    snap = {
      system: getSystemInfo(),
      memory: getMemoryMetrics(),
      cpu: getCpuMetrics(),
      psi: getPsiMetrics(),
      security: getSecurityMetrics(),
      processes: getProcessMetrics(),
    };
  }

  const sys = snap?.system || null;
  const mem = snap?.memory || null;
  const cpu = snap?.cpu || null;
  const psi = snap?.psi || null;
  const sec = snap?.security || null;
  const procs = snap?.processes || [];

  // If telemetry is not yet populated, return honest loading state
  if (!sys || !mem || !cpu) {
    return {
      score: null,
      postureGrade: 'Awaiting host data',
      stampClass: 'stamp--idle',
      timestamp: Date.now(),
      host: sys?.hostname || 'Unknown Host',
      kernel: sys?.kernel || 'Unknown Kernel',
      psi: {
        supported: Boolean(psi?.supported),
        cpuAvg10: null,
        memAvg10: null,
        ioAvg10: null,
        stallDetected: false,
      },
      processes: {
        totalSampled: 0,
        rootPrivileged: 0,
        userSpace: 0,
        zombies: 0,
      },
      security: sec,
      recommendations: [],
      coverage: { evaluatedChecks: 0, totalChecks: 6 },
    };
  }

  const memUsage = Number.isFinite(mem?.usagePercent) ? mem.usagePercent : null;
  const cpuUsage = Number.isFinite(cpu?.overall?.usage) ? cpu.overall.usage : null;
  const cpuPsi = Number.isFinite(psi?.cpu?.some?.avg10) ? psi.cpu.some.avg10 : null;
  const memPsi = Number.isFinite(psi?.memory?.some?.avg10) ? psi.memory.some.avg10 : null;
  const ioPsi = Number.isFinite(psi?.io?.some?.avg10) ? psi.io.some.avg10 : null;

  let rootCount = 0;
  let userCount = 0;
  let zombieCount = 0;
  for (const p of procs) {
    if (p.isPrivileged) rootCount++;
    else userCount++;
    if (p.state === 'zombie') zombieCount++;
  }

  // Pure heuristic scoring based on available data
  let score = 100;
  let checksRun = 0;
  const recommendations = [];

  if (cpuUsage != null) {
    checksRun++;
    if (cpuUsage > 85) {
      score -= 15;
      recommendations.push('High CPU utilization (>85%); evaluate runaway tasks.');
    }
  }

  if (memUsage != null) {
    checksRun++;
    if (memUsage > 90) {
      score -= 20;
      recommendations.push('High RAM utilization (>90%); available memory headroom low.');
    }
  }

  if (cpuPsi != null) {
    checksRun++;
    if (cpuPsi > 20) {
      score -= 15;
      recommendations.push('CPU scheduler pressure stall detected (>20%); tasks waiting for runnable core.');
    }
  }

  if (memPsi != null) {
    checksRun++;
    if (memPsi > 10) {
      score -= 20;
      recommendations.push('Memory pressure stall detected (>10%); system spending time in page reclaim.');
    }
  }

  if (sec) {
    checksRun++;
    if (sec.aslr != null && sec.aslr < 2) {
      score -= 10;
      recommendations.push('Kernel ASLR is not set to full randomization (mode 2).');
    }
    if (sec.entropy != null && sec.entropy < 128) {
      score -= 10;
      recommendations.push('Kernel entropy pool is low (<128 bits).');
    }
  }

  if (zombieCount > 0) {
    score -= Math.min(15, zombieCount * 5);
    recommendations.push(`${zombieCount} zombie process(es) awaiting reaping by init.`);
  }

  const finalScore = Math.max(0, Math.min(100, score));
  const postureGrade =
    finalScore >= 90
      ? 'Heuristic Posture: Good'
      : finalScore >= 70
      ? 'Heuristic Posture: Moderate'
      : finalScore >= 50
      ? 'Heuristic Posture: Degraded'
      : 'Heuristic Posture: High Contention';

  const stampClass =
    finalScore >= 90 ? 'stamp--confirmed' : finalScore >= 70 ? 'stamp--wip' : 'stamp--hypothesis';

  return {
    score: finalScore,
    postureGrade,
    stampClass,
    timestamp: Date.now(),
    host: sys.hostname,
    kernel: sys.kernel,
    psi: {
      supported: Boolean(psi?.supported),
      cpuAvg10: cpuPsi,
      memAvg10: memPsi,
      ioAvg10: ioPsi,
      stallDetected: (cpuPsi != null && cpuPsi > 15) || (memPsi != null && memPsi > 5),
    },
    processes: {
      totalSampled: procs.length,
      rootPrivileged: rootCount,
      userSpace: userCount,
      zombies: zombieCount,
    },
    security: sec,
    recommendations,
    coverage: { evaluatedChecks: checksRun, totalChecks: 6 },
  };
}

// ─── SAFE PROCESS TERMINATION CONTROL ───────────────────────────────────────

export function killHostProcess(pid, signal = 'SIGTERM') {
  const numericPid = Number(pid);
  if (!Number.isInteger(numericPid) || numericPid <= 1) {
    throw new Error(`Invalid process ID: ${pid}. Terminating PID 1 (init) or non-positive PIDs is strictly prohibited.`);
  }

  // Prevent self-termination of the telemetry agent server
  if (numericPid === process.pid) {
    throw new Error('Self-termination of the Blink telemetry agent server is disallowed.');
  }

  const allowedSignals = ['SIGTERM', 'SIGKILL', 'SIGINT'];
  if (!allowedSignals.includes(signal)) {
    throw new Error(`Unsupported signal: ${signal}. Allowed signals: ${allowedSignals.join(', ')}`);
  }

  // Disallow killing kernel tasks
  try {
    const statPath = `/proc/${numericPid}/stat`;
    if (existsSync(statPath)) {
      const content = readFileSync(statPath, 'utf-8');
      const end = content.lastIndexOf(')');
      if (end !== -1) {
        const after = content.slice(end + 1).trim().split(/\s+/);
        const ppid = parseInt(after[1], 10);
        const flags = parseInt(after[6], 10);
        const isKernel = (flags & 0x00200000) !== 0 || ppid === 2;
        if (isKernel) {
          throw new Error(`Process ${numericPid} is a Linux kernel task and cannot be terminated.`);
        }
      }
    }
  } catch (err) {
    if (err.message && err.message.includes('kernel task')) {
      throw err;
    }
  }

  try {
    process.kill(numericPid, signal);
    return { ok: true, pid: numericPid, signal };
  } catch (err) {
    if (err.code === 'ESRCH') {
      throw new Error(`Process ${numericPid} does not exist or has already terminated (ESRCH).`);
    }
    if (err.code === 'EPERM') {
      throw new Error(`Permission denied (EPERM) terminating PID ${numericPid}. Process is owned by another user or requires elevated root privileges.`);
    }
    throw err;
  }
}
