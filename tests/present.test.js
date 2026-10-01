'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { PLUGIN_ROOT, makeRepo, makeTempDir } = require('./helpers');
const pr = require(path.join(PLUGIN_ROOT, 'lib', 'present.js'));
const { writeConfig, readConfig } = require(path.join(PLUGIN_ROOT, 'lib', 'profiles.js'));

const CLI = path.join(PLUGIN_ROOT, 'scripts', 'present.js');

test('FORMATS', () => {
  assert.deepStrictEqual(pr.FORMATS, ['simple', 'ui', 'infra', 'decision']);
});

test('resolvePresentation: the project overrides the user; artifact without the tool falls back to text with a notice', () => {
  const r = (userConfig, projectConfig, tool) => pr.resolvePresentation({ userConfig, projectConfig, artifactToolAvailable: tool });
  assert.strictEqual(r({ presentation: 'artifact' }, { presentation: 'text' }, true).mode, 'text');
  assert.strictEqual(r({ presentation: 'text' }, { presentation: 'artifact' }, true).mode, 'artifact');
  assert.strictEqual(r({ presentation: 'ask' }, { presentation: null }, true).mode, 'ask');
  assert.strictEqual(r({ presentation: 'ask' }, {}, true).mode, 'ask');
  const noTool = r({ presentation: 'artifact' }, {}, false);
  assert.strictEqual(noTool.mode, 'text');
  assert.match(noTool.notice, /\S/);
  assert.ok(!noTool.notice.includes('\n'), 'one line');
  assert.strictEqual(r({ presentation: 'ask' }, {}, false).mode, 'text', 'never artifact nor ask without the tool');
  assert.strictEqual(r({ presentation: 'text' }, {}, true).notice, undefined);
  assert.strictEqual(r({ presentation: 'artifact' }, {}, undefined).mode, 'text');
});

test('defaults by profile come from readConfig: ask with balanced, text with economy', () => {
  const env = { PIGNOLO_HOME: path.join(makeTempDir(), '.pignolo') };
  assert.strictEqual(pr.resolvePresentation({ userConfig: readConfig({ env }), projectConfig: {}, artifactToolAvailable: true }).mode, 'ask');
  writeConfig({ env }, { profile: 'economy' });
  assert.strictEqual(pr.resolvePresentation({ userConfig: readConfig({ env }), projectConfig: {}, artifactToolAvailable: true }).mode, 'text');
});

const page = (opts) => `<!doctype html><html><body>${opts.map(([id, label]) => `<button data-option="${id}">${label}</button>`).join('')}</body></html>`;
const OPTS = [{ id: '1', label: 'Opción A' }, { id: '2', label: 'Opción B' }];

test('sameOptions: exact ids and labels', () => {
  const same = pr.sameOptions(OPTS, page([['1', 'Opción A'], ['2', 'Opción B']]));
  assert.strictEqual(same.same, true);
  assert.deepStrictEqual([same.extra, same.missing], [[], []]);
  assert.strictEqual(pr.sameOptions(OPTS, page([['1', '  Opción   A '], ['2', 'Opción B']])).same, true, 'whitespace is normalized');
  const extra = pr.sameOptions(OPTS, page([['1', 'Opción A'], ['2', 'Opción B'], ['3', 'Opción C']]));
  assert.strictEqual(extra.same, false);
  assert.deepStrictEqual(extra.extra, ['3']);
  assert.strictEqual(pr.sameOptions(OPTS, page([['1', 'Opción A'], ['2', 'Otra cosa']])).same, false);
  const missing = pr.sameOptions(OPTS, page([['1', 'Opción A']]));
  assert.strictEqual(missing.same, false);
  assert.deepStrictEqual(missing.missing, ['2']);
});

test('scanPublishable: pii patterns and secrets block; clean text does not; the value is never echoed', () => {
  const pii = ['\\b\\d{2}\\.\\d{3}\\.\\d{3}\\b'];
  const a = pr.scanPublishable('<p>doc 12.345.678</p>', { piiPatterns: pii });
  assert.deepStrictEqual(a.map((x) => x.kind), ['pii']);
  assert.ok(!JSON.stringify(a).includes('12.345.678'));
  const b = pr.scanPublishable('<p>AKIAABCDEFGHIJKLMNOP</p>', { piiPatterns: pii });
  assert.deepStrictEqual(b.map((x) => x.kind), ['secret']);
  assert.ok(!JSON.stringify(b).includes('AKIAABCDEFGHIJKLMNOP'));
  assert.deepStrictEqual(pr.scanPublishable('<p>Hola, esto es una opción</p>', { piiPatterns: pii }), []);
  assert.deepStrictEqual(pr.scanPublishable('<p>hola</p>'), []);
  const keys = ['-----BEGIN RSA PRIVATE KEY-----', `ghp_${'a'.repeat(36)}`, `sk-${'b'.repeat(24)}`, 'xoxb-1234567890-abc', 'password = hunter2xx'];
  for (const k of keys) assert.strictEqual(pr.scanPublishable(`<p>${k}</p>`).length, 1, k);
});

test('canvasAllowed needs the consent and the Design type', () => {
  assert.strictEqual(pr.canvasAllowed({ projectConfig: {}, designTypeAvailable: true }), false);
  assert.strictEqual(pr.canvasAllowed({ projectConfig: { canvasConsent: false }, designTypeAvailable: true }), false);
  assert.strictEqual(pr.canvasAllowed({ projectConfig: { canvasConsent: true }, designTypeAvailable: false }), false);
  assert.strictEqual(pr.canvasAllowed({ projectConfig: { canvasConsent: true }, designTypeAvailable: true }), true);
});

function pluginRootWith(approvals, templates) {
  const root = makeTempDir('present-root-');
  fs.mkdirSync(path.join(root, 'templates', 'present'), { recursive: true });
  fs.writeFileSync(path.join(root, 'templates', 'present', 'APPROVALS.md'), approvals);
  for (const [name, text] of Object.entries(templates)) fs.writeFileSync(path.join(root, 'templates', 'present', name), text);
  return root;
}
const tpl = (f, v, extra = '') => `<!-- pignolo-present: formato=${f} version=${v} -->\n<html><body>${extra}</body></html>\n`;
const shaOf = (t) => crypto.createHash('sha256').update(t).digest('hex');

test('templateApproved', () => {
  const empty = pluginRootWith('# Aprobaciones\n', Object.fromEntries(pr.FORMATS.map((f) => [`${f}.html`, tpl(f, 1)])));
  for (const f of pr.FORMATS) assert.strictEqual(pr.templateApproved({ pluginRoot: empty, format: f }).approved, false, f);

  const body = tpl('simple', 1, 'hola');
  const good = pluginRootWith(`- simple v1 — aprobado 2026-10-01 — sha256 ${shaOf(body)}\n`, { 'simple.html': body });
  assert.deepStrictEqual(pr.templateApproved({ pluginRoot: good, format: 'simple' }), { approved: true });
  assert.strictEqual(pr.templateApproved({ pluginRoot: good, format: 'ui' }).approved, false);

  const changed = pluginRootWith(`- simple v1 — aprobado 2026-10-01 — sha256 ${shaOf(body)}\n`, { 'simple.html': tpl('simple', 1, 'hola!') });
  const c = pr.templateApproved({ pluginRoot: changed, format: 'simple' });
  assert.strictEqual(c.approved, false);
  assert.match(c.reason, /sha256/);

  const v2 = pluginRootWith(`- simple v1 — aprobado 2026-10-01 — sha256 ${shaOf(tpl('simple', 2))}\n`, { 'simple.html': tpl('simple', 2) });
  assert.strictEqual(pr.templateApproved({ pluginRoot: v2, format: 'simple' }).approved, false, 'version differs');

  const noMark = pluginRootWith(`- simple v1 — aprobado 2026-10-01 — sha256 ${shaOf('<html></html>')}\n`, { 'simple.html': '<html></html>' });
  assert.strictEqual(pr.templateApproved({ pluginRoot: noMark, format: 'simple' }).approved, false, 'no marker');
  assert.strictEqual(pr.templateApproved({ pluginRoot: makeTempDir(), format: 'simple' }).approved, false, 'no files');
  assert.strictEqual(pr.templateApproved({ pluginRoot: good, format: 'nope' }).approved, false);
});

const run = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env } });

test('present.js decide prints the mode, the canvas and the formats (text until templates are approved)', () => {
  const repo = makeRepo();
  const r = run(['decide', '--cwd', repo, '--tool-available', '--design-available'], repo);
  assert.strictEqual(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.mode, 'ask');
  assert.strictEqual(out.canvas, false);
  assert.deepStrictEqual(out.formats, { simple: false, ui: false, infra: false, decision: false });
  const none = JSON.parse(run(['decide', '--cwd', repo], repo).stdout);
  assert.strictEqual(none.mode, 'text');
  fs.mkdirSync(path.join(repo, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'), '---\ntype: code-tested\npresentation: artifact\ncanvas-consent: true\n---\n');
  const proj = JSON.parse(run(['decide', '--cwd', repo, '--tool-available', '--design-available'], repo).stdout);
  assert.strictEqual(proj.mode, 'artifact');
  assert.strictEqual(proj.canvas, true);
  assert.strictEqual(run(['nada'], repo).status, 2);
});

test('present.js check: exit 0 when publishable, 1 with the problems', () => {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.pignolo', 'project.md'), '---\ntype: code-tested\npii-patterns:\n  - \'\\b\\d{2}\\.\\d{3}\\.\\d{3}\\b\'\n---\n');
  const dir = makeTempDir('present-html-');
  const clean = path.join(dir, 'clean.html');
  fs.writeFileSync(clean, page([['1', 'Opción A'], ['2', 'Opción B']]));
  const optsFile = path.join(dir, 'opts.json');
  fs.writeFileSync(optsFile, JSON.stringify(OPTS));
  assert.strictEqual(run(['check', '--html', clean, '--options-file', optsFile, '--cwd', repo], repo).status, 0);
  const dirty = path.join(dir, 'dirty.html');
  fs.writeFileSync(dirty, `${page([['1', 'Opción A'], ['2', 'Opción B']])}<p>12.345.678</p>`);
  const r = run(['check', '--html', dirty, '--cwd', repo], repo);
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /pii/);
  assert.ok(!r.stdout.includes('12.345.678'));
  const extra = path.join(dir, 'extra.html');
  fs.writeFileSync(extra, page([['1', 'Opción A'], ['2', 'Opción B'], ['3', 'Opción C']]));
  const e = run(['check', '--html', extra, '--options-file', optsFile, '--cwd', repo], repo);
  assert.strictEqual(e.status, 1);
  assert.match(e.stdout, /"3"/);
  assert.strictEqual(run(['check', '--cwd', repo], repo).status, 2);
});
