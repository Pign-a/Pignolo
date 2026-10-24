'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const dir = path.join(__dirname, 'evals', 'ui-vote');
const url = (f) => pathToFileURL(path.join(dir, f)).href;

function makePack() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-vote-'));
  const items = ['A', 'B', 'C'].map((l) => ({ label: l, files: { shot1280: `${l}-1280.png`, shot390: `${l}-390.png`, html: `${l}.html` } }));
  for (const it of items) {
    fs.writeFileSync(path.join(d, it.files.shot1280), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    fs.writeFileSync(path.join(d, it.files.shot390), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    fs.writeFileSync(path.join(d, it.files.html), '<p>stub</p>');
  }
  fs.writeFileSync(path.join(d, 'pack.json'), JSON.stringify({ scenario: 's1', items }));
  return d;
}

test('build genera vote.html autocontenido y su script parsea', () => {
  const d = makePack();
  const r = spawnSync(process.execPath, [path.join(dir, 'build.mjs'), '--pack', d], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  const html = fs.readFileSync(path.join(d, 'vote.html'), 'utf8');
  for (const l of ['A', 'B', 'C']) assert.ok(html.includes(`"label":"${l}"`));
  assert.ok(html.includes('A-1280.png') && html.includes('C.html'));
  assert.ok(!/https?:\/\//.test(html), 'sin URLs externas');
  assert.ok(!/\bU[0-9]\b|\bC0\b|pignolo/i.test(html), 'sin nombres de brazos');
  const scripts = [...html.matchAll(/<script(?![^>]*application\/json)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.strictEqual(scripts.length, 1);
  assert.doesNotThrow(() => new Function(scripts[0]));
  const json = html.match(/<script id="pack"[^>]*>([\s\S]*?)<\/script>/)[1];
  assert.strictEqual(JSON.parse(json).items.length, 3);
});

test('build rechaza pack ausente o mal formado', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-vote-'));
  let r = spawnSync(process.execPath, [path.join(dir, 'build.mjs'), '--pack', d], { encoding: 'utf8' });
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /pack\.json/);
  fs.writeFileSync(path.join(d, 'pack.json'), '{"scenario":"s1","items":[{"label":"A"}]}');
  r = spawnSync(process.execPath, [path.join(dir, 'build.mjs'), '--pack', d], { encoding: 'utf8' });
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /files/);
});

test('tally calcula lo esperado y la vista pareada', async () => {
  const { tally, render } = await import(url('tally.mjs'));
  const mk = (sc, a, b, aFirst) => ({
    scenario: sc,
    items: {
      A: { polish: a[0], clarity: 4, keep: 3, changes: a[1], tags: ['espaciado'], note: '' },
      B: { polish: b[0], clarity: 2, keep: 1, changes: b[1], tags: ['espaciado', 'otro'], note: '' },
    },
    ranking: aFirst ? ['A', 'B'] : ['B', 'A'],
  });
  const v1 = mk('s1', [5, 1], [3, 5], true);
  const v2 = mk('s2', [4, 3], [2, 7], false);
  const k1 = { A: { arm: 'U3', rep: 1, extra: 1 }, B: { arm: 'C0', rep: 1 } };
  const k2 = { A: { arm: 'C0' }, B: { arm: 'U3' } };
  const r = tally([v1, v2], [k1, k2], 'C0');
  assert.strictEqual(r.overall.U3.changesMean, (1 + 7) / 2);
  assert.strictEqual(r.overall.C0.changesMean, (5 + 3) / 2);
  assert.strictEqual(r.overall.U3.polish, (5 + 2) / 2);
  assert.strictEqual(r.overall.U3.firsts, 2);
  assert.strictEqual(r.overall.U3.rankMean, 1);
  assert.strictEqual(r.overall.U3.tags.espaciado, 2);
  assert.strictEqual(r.overall.U3.tags.otro, 1);
  assert.deepStrictEqual(r.paired.perScenario.map((p) => p.diffs.U3), [-4, 4]);
  assert.strictEqual(r.paired.meanDiff.U3.mean, 0);
  assert.match(render(r), /descriptivos/);
});

test('tally por CLI con --json', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-vote-'));
  fs.writeFileSync(path.join(d, 'v.json'), JSON.stringify({ scenario: 's1', items: { A: { polish: 1, clarity: 1, keep: 1, changes: 2, tags: [], note: '' } }, ranking: ['A'] }));
  fs.writeFileSync(path.join(d, 'k.json'), JSON.stringify({ A: { arm: 'X' } }));
  const r = spawnSync(process.execPath, [path.join(dir, 'tally.mjs'), '--votes', path.join(d, 'v.json'), '--key', path.join(d, 'k.json'), '--json'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(JSON.parse(r.stdout).overall.X.changesMean, 2);
});
