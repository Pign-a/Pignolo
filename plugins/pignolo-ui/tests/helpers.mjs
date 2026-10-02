import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import zlib from 'node:zlib';
import { findBrowser } from '../lib/browser-find.mjs';

export const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = path.join(TESTS_DIR, '..');
export const REPO_ROOT = path.join(PLUGIN_ROOT, '..', '..');
export const FIXTURES = path.join(TESTS_DIR, 'fixtures');

// Every temporary directory is registered and removed when the test process exits
// (node --test runs one process per file).
const CREATED = [];
process.on('exit', () => {
  for (const dir of CREATED.splice(0).reverse()) {
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 2, retryDelay: 50 }); } catch { /* best effort */ }
  }
});

export function makeTempDir(prefix = 'pignolo-ui-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  CREATED.push(dir);
  return dir;
}

// Writes a tree { 'a/b.css': 'text' } under dir and returns dir.
export function writeTree(dir, tree) {
  for (const [rel, content] of Object.entries(tree)) {
    const file = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return dir;
}

// Runs plugins/pignolo-ui/scripts/<script> with node and returns { status, stdout, stderr, json }.
export function runScript(script, args, opts = {}) {
  const res = spawnSync(process.execPath, [path.join(PLUGIN_ROOT, 'scripts', script), ...args], {
    encoding: 'utf8',
    timeout: 30000,
    ...opts,
  });
  let json = null;
  try { json = JSON.parse(res.stdout); } catch { /* not JSON */ }
  return { status: res.status, stdout: res.stdout, stderr: res.stderr, json };
}

// Serves routes on 127.0.0.1 (random port) for the tests of the development URL; never the
// network. routes = { '/path': { status, headers, body } | (req, res) => void }; others 404.
export async function serveRoutes(routes) {
  const server = http.createServer((req, res) => {
    const r = routes[req.url];
    if (typeof r === 'function') return r(req, res);
    if (!r) { res.writeHead(404); res.end(); return undefined; }
    res.writeHead(r.status ?? 200, r.headers ?? {});
    res.end(r.body ?? '');
    return undefined;
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const close = () => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); });
  return { base, close };
}

// A real PNG of width x height (RGBA, one flat color), built in memory: the plugin linter
// forbids binary fixtures, so tests that need a PNG make one.
export function makePng(width, height, rgba = [255, 255, 255, 255]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => rgba).flat())]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Browser tests (spec §16.1): without Chrome or Edge they are a visible skip, never a pass.
const FOUND_BROWSER = findBrowser();
export const BROWSER_SKIP = FOUND_BROWSER.path ? false : `sin navegador: ${FOUND_BROWSER.reason}`;
export const browserPath = () => FOUND_BROWSER.path;

// Process ids whose command line mentions the temporary profile (orphan check, spec §11.1).
// The oracle fails closed: if the listing itself did not run (PowerShell timed out or did not
// start, ps failed) it throws, so "no orphans" is never reported without having looked.
// run is injectable (spawnSync-shaped) for the test of that rule.
export function processesWith(profile, { run = spawnSync } = {}) {
  const marker = path.basename(profile);
  const win = process.platform === 'win32';
  const res = win
    ? run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*${marker}*' } | ForEach-Object { $_.ProcessId }`], { encoding: 'utf8', timeout: 30000, windowsHide: true })
    : run('ps', ['-eo', 'pid=,args='], { encoding: 'utf8', timeout: 10000 });
  if (res.error || res.status !== 0) {
    throw new Error(`the process listing did not run, so orphans were not measured (${res.error ? res.error.message : `exit ${res.status}`})`);
  }
  if (win) return res.stdout.split(/\s+/).filter(Boolean).map(Number);
  return res.stdout.split('\n').filter((l) => l.includes(marker)).map((l) => Number(l.trim().split(/\s+/)[0]));
}

// Processes of that profile still alive after timeoutMs (children exit a moment after the main
// process, longer under load): an orphan is one that stays.
export async function leftoverProcesses(profile, timeoutMs = 15000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const left = processesWith(profile);
    if (!left.length || Date.now() > until) return left;
    await new Promise((r) => setTimeout(r, 500));
  }
}

// A valid brief.md (hito 4f) for the tests that save an approval: `approve.mjs save` seals it.
export const BRIEF_TEXT = '## Screen\nAccount page of a synthetic shop.\n\n## First look\nThe order summary and the pay button, without scrolling.\n\n## Do not touch\nnothing\n';

// Writes BRIEF_TEXT in dir (a new temporary one by default) and returns the file path.
export function writeBrief(dir = makeTempDir(), name = 'brief.md', text = BRIEF_TEXT) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, text);
  return file;
}
