// Hito 3 end to end through the CLIs (spec §8 step 2, §11, §12): measure, dom and capture on a
// page served on 127.0.0.1, ui-check with --dom and --measures, and report-check citing
// browser.json and a capture. Without Chrome or Edge: visible skip.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { makeTempDir, writeTree, serveRoutes, runScript, BROWSER_SKIP, PLUGIN_ROOT } from './helpers.mjs';

const HTML = { 'content-type': 'text/html; charset=utf-8' };
const PAGE = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cuenta</title>
<style>body{margin:0;padding:0 24px;background:#fff;color:#111;font:16px sans-serif} .muted{color:#9a9a9a} #save{outline:none}</style></head>
<body><main><h1>Cuenta</h1><p class="muted" id="hint">Última actualización hace 2 días</p><button id="save">Guardar</button></main></body></html>`;

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
function browserCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(PLUGIN_ROOT, 'scripts', 'browser.mjs'), ...args]);
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (status) => resolve({ status, stderr }));
  });
}

test('hito 3: the browser evidence reaches ui-check and report-check', { skip: BROWSER_SKIP }, async () => {
  const root = writeTree(makeTempDir(), { 'DESIGN.md': '---\nname: X\npignolo:\n  schema: 1\n  platform: desktop\n---\n' });
  const run = path.join(root, '.pignolo-ui', 'runs', '2026-09-30-audit-cuenta');
  const site = await serveRoutes({ '/cuenta': { headers: HTML, body: PAGE } });
  const common = ['--project', root, '--run', run, '--url', `${site.base}/cuenta`, '--design', path.join(root, 'DESIGN.md')];
  try {
    assert.equal((await browserCli(['measure', ...common])).status, 1, 'B1 and B2 find new bloquea');
    assert.equal((await browserCli(['dom', ...common])).status, 0);
    assert.equal((await browserCli(['capture', ...common])).status, 0);
  } finally {
    await site.close();
  }
  const browser = readJson(path.join(run, 'browser.json'));
  const hint = browser.entries.find((e) => e.fingerprint === 'COLOR-03|/cuenta|1440|light|#hint');
  assert.equal(hint.status, 'fail');
  assert.ok(browser.entries.some((e) => e.fingerprint === 'STATE-04|/cuenta|1440|light|#save' && e.status === 'fail'));

  const uc = runScript('ui-check.mjs', ['--project', root, '--run', run, '--design', path.join(root, 'DESIGN.md'), '--dom', path.join(run, 'dom-1440.html'), '--measures', path.join(run, 'browser.json')]);
  assert.equal(uc.status, 1, uc.stderr);
  const uiCheck = readJson(path.join(run, 'ui-check.json'));
  assert.ok(uiCheck.entries.some((e) => e.id === 'A11Y-02' && e.status === 'pass' && e.file.endsWith('dom-1440.html')));
  assert.ok(uiCheck.entries.some((e) => e.fingerprint === hint.fingerprint));

  const capture = readJson(path.join(run, 'captures.json')).captures[0];
  const report = {
    version: 1,
    implemented: false,
    evidence: { 'ui-check.json': sha(path.join(run, 'ui-check.json')), 'browser.json': sha(path.join(run, 'browser.json')) },
    claims: [
      { id: 'c1', text: 'El texto de ayuda no llega al contraste mínimo', rule: 'COLOR-03', status: 'fail', measure: { ratio: hint.measure.ratio }, ref: { source: 'browser', fingerprint: hint.fingerprint } },
      { id: 'c2', text: 'El texto de ayuda tiene buen contraste', rule: 'COLOR-03', status: 'pass', ref: { source: 'browser', fingerprint: hint.fingerprint } },
      { id: 'c3', text: 'Así se ve la pantalla', ref: { source: 'capture', path: capture.path, sha256: capture.sha256 } },
      { id: 'c4', text: 'Lo mismo, citado desde ui-check', rule: 'COLOR-03', status: 'fail', ref: { source: 'ui-check', fingerprint: hint.fingerprint } },
    ],
  };
  fs.writeFileSync(path.join(run, 'report.json'), JSON.stringify(report));
  const rc = runScript('report-check.mjs', ['--project', root, '--run', run]);
  assert.equal(rc.status, 1, rc.stderr);
  const out = readJson(path.join(run, 'report-check.json'));
  assert.deepEqual(out.kept, ['c1', 'c3', 'c4']);
  assert.deepEqual(out.retired, [{ id: 'c2', reason: 'evidence says COLOR-03 fail' }]);

  // Measuring again changes browser.json: ui-check.json, which listed it as an input, is stale.
  fs.appendFileSync(path.join(run, 'browser.json'), '\n');
  report.evidence['browser.json'] = sha(path.join(run, 'browser.json'));
  fs.writeFileSync(path.join(run, 'report.json'), JSON.stringify(report));
  runScript('report-check.mjs', ['--project', root, '--run', run]);
  const stale = readJson(path.join(run, 'report-check.json')).retired.find((r) => r.id === 'c4');
  assert.match(stale.reason, /ui-check\.json is stale: \.pignolo-ui\/runs\/2026-09-30-audit-cuenta\/browser\.json changed after it ran/);
});
