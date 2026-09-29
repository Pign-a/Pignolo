'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { runLauncher, PLUGIN_ROOT } = require('./helpers');

const HANDLERS = path.join(PLUGIN_ROOT, 'hooks', 'handlers');

function withTempHandler(name, source, fn) {
  const file = path.join(HANDLERS, `${name}.js`);
  fs.writeFileSync(file, source);
  try { return fn(); } finally { fs.rmSync(file, { force: true }); }
}

test('runs a handler and propagates its exit and stdout', () => {
  const r = runLauncher('_echo', { hello: 'mundo' });
  assert.strictEqual(r.status, 0);
  assert.strictEqual(JSON.parse(r.stdout).hello, 'mundo');
});

test('invalid JSON on stdin exits 2', () => {
  const r = runLauncher('_echo', '{no es json');
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /entrada JSON inválida/);
});

test('stdin that is not a JSON object exits 2', () => {
  for (const raw of ['', 'null', '[]', '"git reset --hard"', '42']) {
    const r = runLauncher('_echo', raw);
    assert.strictEqual(r.status, 2, JSON.stringify(raw));
    assert.match(r.stderr, /entrada JSON inválida/);
  }
});

test('unknown handler exits 2', () => {
  assert.strictEqual(runLauncher('no-existe', {}).status, 2);
});

test('handler name with path traversal exits 2', () => {
  assert.strictEqual(runLauncher('../launcher', {}).status, 2);
});

test('handler with a syntax error exits 2', () => {
  withTempHandler('_tmp-syntax', 'exports.run = (', () => {
    assert.strictEqual(runLauncher('_tmp-syntax', {}).status, 2);
  });
});

test('handler that throws exits 2', () => {
  withTempHandler('_tmp-throw', 'exports.run = () => { throw new Error("boom"); };', () => {
    const r = runLauncher('_tmp-throw', {});
    assert.strictEqual(r.status, 2);
    assert.match(r.stderr, /boom/);
  });
});

test('async handler (returns a promise) exits 2', () => {
  withTempHandler('_tmp-async', 'exports.run = async () => ({ exit: 0 });', () => {
    assert.strictEqual(runLauncher('_tmp-async', {}).status, 2);
  });
});

// Con --unhandled-rejections=warn Node no convierte el rechazo en excepción:
// solo el listener propio del launcher puede forzar el 2 (sin él, sale 0).
test('unhandled rejection inside a handler exits 2', () => {
  withTempHandler('_tmp-rej', 'exports.run = () => { Promise.reject(new Error("tarde")); return { exit: 0 }; };', () => {
    const r = runLauncher('_tmp-rej', {}, { NODE_OPTIONS: '--unhandled-rejections=warn' });
    assert.strictEqual(r.status, 2);
    assert.match(r.stderr, /tarde/);
  });
});

test('handler returning an invalid result exits 2', () => {
  withTempHandler('_tmp-bad', 'exports.run = () => ({ ok: true });', () => {
    assert.strictEqual(runLauncher('_tmp-bad', {}).status, 2);
  });
});

// Spec §8.3: el plazo interno (~3 s) NIEGA al vencer; no se espera al host.
test('a handler that exceeds the internal deadline is denied with exit 2', () => {
  withTempHandler('_tmp-slow', 'exports.run = () => { const end = Date.now() + 8000; while (Date.now() < end) {} return { exit: 0 }; };', () => {
    const t0 = Date.now();
    const r = runLauncher('_tmp-slow', {});
    const took = Date.now() - t0;
    assert.strictEqual(r.status, 2);
    assert.match(r.stderr, /plazo interno/);
    assert.ok(took < 6000, `denied at the internal deadline, not after the handler (${took} ms)`);
  });
});

test('a handler that exits the worker without a result exits 2', () => {
  withTempHandler('_tmp-exit', 'exports.run = () => { process.exit(0); };', () => {
    assert.strictEqual(runLauncher('_tmp-exit', {}).status, 2);
  });
});

test('the guard deadline is about 3 s and every handler gets one', () => {
  const src = fs.readFileSync(path.join(PLUGIN_ROOT, 'hooks', 'launcher.js'), 'utf8');
  assert.match(src, /DEFAULT_DEADLINE_MS = 3000;/);
});
