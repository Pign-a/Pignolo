import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import http from 'node:http';

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
