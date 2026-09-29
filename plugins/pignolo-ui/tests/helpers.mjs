import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

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
