// What is said when the temporary profile cannot be removed, and what happens on Ctrl+C
// (scripts/browser.mjs, lib/browser-session.mjs; decision D-3-1: report, never prune).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { makeTempDir, writeTree, serveRoutes, BROWSER_SKIP, browserPath, leftoverProcesses } from './helpers.mjs';
import { openBrowser, BrowserUnavailable } from '../lib/browser-session.mjs';
import { main, watchSignals } from '../scripts/browser.mjs';

const skip = BROWSER_SKIP;
const HTML = { 'content-type': 'text/html; charset=utf-8' };
const GOOD = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Inicio</title></head><body><main><h1>Inicio</h1></main></body></html>';
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const never = async () => false; // a profile that cannot be removed: the stub reports it and leaves the folder
const rmQuiet = (dir) => fs.rmSync(dir, { recursive: true, force: true });

function project() {
  const root = writeTree(makeTempDir(), { 'index.html': GOOD });
  return { root, run: path.join(root, '.pignolo-ui', 'runs', 'r1') };
}
function capture() {
  let text = '';
  return { stream: { write: (s) => { text += s; } }, json: () => JSON.parse(text) };
}

test('a profile that cannot be removed is reported by the CLI (cleanup and leftoverProfile), never pruned', { skip }, async () => {
  const { root, run } = project();
  const site = await serveRoutes({ '/': { headers: HTML, body: GOOD } });
  const out = capture();
  try {
    const code = await main(['dom', '--project', root, '--run', run, '--url', `${site.base}/`, '--platform', 'desktop'], { env: { ...process.env, PIGNOLO_UI_BROWSER: browserPath() }, browserOptions: { removeProfile: never }, stdout: out.stream });
    assert.equal(code, 0);
    const printed = out.json();
    const dom = JSON.parse(fs.readFileSync(path.join(run, 'dom.json'), 'utf8'));
    assert.equal(dom.cleanup.profileRemoved, false);
    assert.equal(printed.leftoverProfile, dom.cleanup.profile, 'the path of what is left is printed');
    assert.ok(fs.existsSync(printed.leftoverProfile), 'nothing was pruned behind the user\'s back');
    rmQuiet(printed.leftoverProfile);
  } finally {
    await site.close();
  }
});

test('a browser that does not start still reports its profile when it cannot be removed', async () => {
  await assert.rejects(openBrowser({ executable: 'Z:/no/such/browser.exe', startTimeoutMs: 5000, removeProfile: never }), (e) => {
    assert.ok(e instanceof BrowserUnavailable, e.message);
    assert.deepEqual(e.cleanup, { graceful: false, killed: false, profileRemoved: false });
    assert.ok(fs.existsSync(e.profile));
    rmQuiet(e.profile);
    return true;
  });
  // Through the CLI: an executable that exists but is not a browser (node) never answers over the pipe.
  const { root, run } = project();
  const out = capture();
  const code = await main(['dom', '--project', root, '--run', run, '--file', path.join(root, 'index.html')], { env: { ...process.env, PIGNOLO_UI_BROWSER: process.execPath }, browserOptions: { removeProfile: never, startTimeoutMs: 3000 }, stdout: out.stream });
  assert.equal(code, 0);
  const printed = out.json();
  assert.match(printed.degraded, /did not answer over the pipe|could not start/);
  const dom = JSON.parse(fs.readFileSync(path.join(run, 'dom.json'), 'utf8'));
  assert.equal(dom.cleanup.profileRemoved, false);
  assert.equal(printed.leftoverProfile, dom.cleanup.profile);
  assert.ok(fs.existsSync(printed.leftoverProfile));
  rmQuiet(printed.leftoverProfile);
});

test('SIGINT and SIGTERM kill the browser, remove its profile and say so (exit 130 / 143)', { skip }, async () => {
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
    const browser = await openBrowser({ executable: browserPath() });
    const proc = new EventEmitter();
    const out = capture();
    const exits = [];
    const guard = watchSignals({ proc, current: () => browser, stdout: out.stream, exit: (c) => exits.push(c) });
    proc.emit(signal);
    try {
      assert.ok(guard.settled, `${signal} has a handler`);
      await guard.settled;
    } finally {
      guard.dispose();
      await browser.close({ graceful: false }); // a failing run must not leave the browser behind
    }
    assert.deepEqual(exits, [code]);
    const printed = out.json();
    assert.equal(printed.interrupted, signal);
    assert.equal(printed.cleanup.profileRemoved, true);
    assert.equal(printed.leftoverProfile, undefined);
    assert.equal(alive(browser.pid), false);
    assert.equal(fs.existsSync(browser.profile), false);
    assert.deepEqual(await leftoverProcesses(browser.profile), []);
    assert.equal(proc.listenerCount('SIGINT') + proc.listenerCount('SIGTERM'), 0, 'dispose removes the handlers');
  }
});

test('on Ctrl+C a profile that cannot be removed is reported as leftoverProfile', { skip }, async () => {
  const browser = await openBrowser({ executable: browserPath(), removeProfile: never });
  const proc = new EventEmitter();
  const out = capture();
  const guard = watchSignals({ proc, current: () => browser, stdout: out.stream, exit: () => {} });
  proc.emit('SIGINT');
  try {
    assert.ok(guard.settled, 'SIGINT has a handler');
    await guard.settled;
    assert.equal(out.json().leftoverProfile, browser.profile);
    assert.equal(alive(browser.pid), false);
  } finally {
    guard.dispose();
    await browser.close({ graceful: false });
    rmQuiet(browser.profile);
  }
});
