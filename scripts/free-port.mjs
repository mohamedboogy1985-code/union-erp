/**
 * Frees one or more TCP ports before starting the server.
 * Windows: netstat -ano + taskkill.   macOS/Linux: lsof, then ss, then /proc scan.
 * Usage: node scripts/free-port.mjs 3000 24678
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const isWin = process.platform === 'win32';

function run(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch {
    return '';
  }
}

export function parseWindowsNetstat(text, port) {
  const pids = new Set();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!/^TCP/i.test(line)) continue;
    const match = line.match(/^TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i);
    if (match && Number(match[1]) === port) pids.add(match[2]);
  }
  return [...pids];
}

export function parsePidList(text) {
  return [...new Set(text.split(/\s+/).filter((token) => /^\d+$/.test(token)))];
}

export function parseSs(text) {
  const pids = new Set();
  for (const match of text.matchAll(/pid=(\d+)/g)) pids.add(match[1]);
  return [...pids];
}

export function parseProcNetTcp(text, port) {
  const hexPort = port.toString(16).toUpperCase().padStart(4, '0');
  const inodes = new Set();
  for (const raw of text.split('\n')) {
    const parts = raw.trim().split(/\s+/);
    if (parts.length < 10) continue;
    const local = parts[1] ?? '';
    const state = parts[3] ?? '';
    if (!local.toUpperCase().endsWith(`:${hexPort}`)) continue;
    if (state !== '0A') continue;
    inodes.add(parts[9]);
  }
  return [...inodes];
}

function pidsFromProc(port) {
  const inodes = new Set([
    ...parseProcNetTcp(run('cat /proc/net/tcp'), port),
    ...parseProcNetTcp(run('cat /proc/net/tcp6'), port),
  ]);
  if (inodes.size === 0) return [];
  const pids = new Set();
  let entries = [];
  try {
    entries = fs.readdirSync('/proc').filter((name) => /^\d+$/.test(name));
  } catch {
    return [];
  }
  for (const pid of entries) {
    let fds = [];
    try {
      fds = fs.readdirSync(`/proc/${pid}/fd`);
    } catch {
      continue;
    }
    for (const fd of fds) {
      let link = '';
      try {
        link = fs.readlinkSync(`/proc/${pid}/fd/${fd}`);
      } catch {
        continue;
      }
      const match = link.match(/^socket:\[(\d+)\]$/);
      if (match && inodes.has(match[1])) {
        pids.add(pid);
        break;
      }
    }
  }
  return [...pids];
}

function pidsOnPort(port) {
  if (isWin) return parseWindowsNetstat(run('netstat -ano -p tcp'), port);
  const lsof = parsePidList(run(`lsof -ti tcp:${port} -sTCP:LISTEN`));
  if (lsof.length > 0) return lsof;
  const ss = parseSs(run(`ss -lptnH "sport = :${port}"`));
  if (ss.length > 0) return ss;
  return pidsFromProc(port);
}

function killPid(pid) {
  if (Number(pid) === process.pid) return false;
  if (isWin) return run(`taskkill /F /PID ${pid}`).length > 0;
  run(`kill -9 ${pid}`);
  return true;
}

const requested = process.argv.slice(2).map(Number).filter((value) => Number.isFinite(value) && value > 0);
const targets = requested.length > 0 ? requested : [Number(process.env.PORT || 3000)];

for (const port of targets) {
  const pids = pidsOnPort(port);
  if (pids.length === 0) {
    console.log(`[free-port] port ${port} is free.`);
    continue;
  }
  for (const pid of pids) {
    const done = killPid(pid);
    console.log(`[free-port] port ${port}: ${done ? 'stopped' : 'skipped'} process ${pid}.`);
  }
}
