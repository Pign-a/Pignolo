import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { FIXTURES, makeTempDir, writeTree, runScript } from './helpers.mjs';
import { saveApproved, verifyApproved, checkScreens, decisionEntry } from '../lib/approved.mjs';

const DESIGN = fs.readFileSync(path.join(FIXTURES, 'design', 'valid.md'), 'utf8');
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const page = (title, extra = '') => `<!doctype html>\n<html lang="es">\n<head><meta charset="utf-8"><title>${title}</title></head>\n<body><main><h1 data-sample>${title}</h1>${extra}<p>Datos de muestra</p></main></body>\n</html>\n`;

function screens(tree = {}) {
  return writeTree(makeTempDir(), {
    'home.html': page('Inicio', '<a href="detail.html#top">Ver</a>'),
    'detail.html': page('Detalle', '<a href="home.html">Volver</a> <a href="https://example.com">Ayuda</a>'),
    ...tree,
  });
}

function project() {
  return writeTree(makeTempDir(), { 'DESIGN.md': DESIGN });
}

test('save writes the folder and a manifest with the sha256 of every screen', () => {
  const root = project();
  const r = saveApproved({ projectRoot: root, flow: 'checkout', from: screens(), date: '2026-09-28' });
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.equal(r.path, 'design/approved/checkout');
  assert.equal(r.version, 1);
  const dir = path.join(root, 'design', 'approved', 'checkout');
  assert.deepEqual(fs.readdirSync(dir).sort(), ['detail.html', 'home.html', 'manifest.json']);
  const manifestBytes = fs.readFileSync(path.join(dir, 'manifest.json'));
  assert.equal(r.manifestSha256, sha(manifestBytes));
  const manifest = JSON.parse(manifestBytes);
  assert.deepEqual(manifest, {
    flow: 'checkout',
    version: 1,
    date: '2026-09-28',
    files: ['detail.html', 'home.html'].map((f) => ({ path: f, sha256: sha(fs.readFileSync(path.join(dir, f))) })),
  });
});

test('an approved folder is never overwritten: a new approval creates -v2, then -v3', () => {
  const root = project();
  const first = saveApproved({ projectRoot: root, flow: 'checkout', from: screens(), date: '2026-09-28' });
  const before = fs.readFileSync(path.join(root, first.path, 'home.html'));
  const second = saveApproved({ projectRoot: root, flow: 'checkout', from: screens({ 'home.html': page('Inicio 2', '<a href="detail.html">x</a>') }), date: '2026-09-29' });
  const third = saveApproved({ projectRoot: root, flow: 'checkout', from: screens(), date: '2026-09-30' });
  assert.deepEqual([second.path, second.version, third.path, third.version], ['design/approved/checkout-v2', 2, 'design/approved/checkout-v3', 3]);
  assert.deepEqual(fs.readFileSync(path.join(root, first.path, 'home.html')), before);
});

test('screens that are not self-contained static HTML are refused and nothing is written', () => {
  const cases = {
    'no-charset': { 'home.html': '<html><title>x</title><a href="detail.html">d</a></html>' },
    script: { 'home.html': page('x', '<script>alert(1)</script><a href="detail.html">d</a>') },
    'remote-resource': { 'home.html': page('x', '<img src="https://cdn.example.com/a.png" alt=""><a href="detail.html">d</a>') },
    'remote-resource ': { 'home.html': page('x', '<style>@import url("//fonts.example.com/f.css");</style><a href="detail.html">d</a>') },
    'broken-link': { 'home.html': page('x', '<a href="missing.html">m</a>') },
    'broken-link ': { 'home.html': page('x', '<a href="/detail.html">m</a>') },
    'not-html': { 'notes.txt': 'x' },
    'bad-name': { 'Home Page.html': page('x') },
  };
  for (const [problem, tree] of Object.entries(cases)) {
    const root = project();
    const r = saveApproved({ projectRoot: root, flow: 'checkout', from: screens(tree), date: '2026-09-28' });
    assert.equal(r.ok, false, problem);
    assert.ok(r.problems.some((p) => p.problem === problem.trim()), `${problem}: ${JSON.stringify(r.problems)}`);
    assert.equal(fs.existsSync(path.join(root, 'design', 'approved', 'checkout')), false, problem);
  }
  const sub = screens();
  fs.mkdirSync(path.join(sub, 'assets'));
  assert.ok(checkScreens(sub).problems.some((p) => p.problem === 'subfolder'));
  assert.deepEqual(checkScreens(makeTempDir()).problems, [{ file: '', problem: 'empty' }]);
  assert.equal(saveApproved({ projectRoot: project(), flow: 'Check Out', from: screens(), date: '2026-09-28' }).ok, false);
});

test('save refuses screens that leak user or machine data (spec 7.4); nothing is written', () => {
  const cases = [
    [{ 'home.html': page('x', '<a href="detail.html">d</a><p>/Users/someone/app</p>') }, []],
    [{ 'detail.html': page('Detalle', '<a href="home.html">v</a><p>Hecho por Ana Pérez</p>') }, ['Ana Pérez']],
  ];
  for (const [tree, leakValues] of cases) {
    const root = project();
    const r = saveApproved({ projectRoot: root, flow: 'checkout', from: screens(tree), date: '2026-09-28', leakValues });
    assert.equal(r.ok, false);
    assert.ok(r.problems.some((p) => p.problem === 'leak'), JSON.stringify(r.problems));
    assert.ok(!JSON.stringify(r.problems).includes('Ana'));
    assert.equal(fs.existsSync(path.join(root, 'design', 'approved', 'checkout')), false);
  }
  const values = path.join(makeTempDir(), 'values.json');
  fs.writeFileSync(values, JSON.stringify(['Ana Pérez']));
  const out = runScript('approve.mjs', ['save', '--project', project(), '--flow', 'checkout', '--from', screens(cases[1][0]), '--values-file', values]);
  assert.equal(out.status, 1);
  assert.equal(out.json.problems[0].problem, 'leak');
});

test('decisionEntry cites the path, the manifest sha256, the date and the literal choice', () => {
  assert.equal(
    decisionEntry({ path: 'design/approved/checkout', manifestSha256: 'a'.repeat(64), date: '2026-09-28', quote: 'B con la\ncabecera de A' }),
    `- 2026-09-28 — approved \`design/approved/checkout/\` (manifest sha256 \`${'a'.repeat(64)}\`): "B con la cabecera de A"`,
  );
});

function approvedProject() {
  const root = project();
  const saved = saveApproved({ projectRoot: root, flow: 'checkout', from: screens(), date: '2026-09-28' });
  const entry = decisionEntry({ ...saved, date: '2026-09-28', quote: 'B' });
  fs.writeFileSync(path.join(root, 'DESIGN.md'), `${DESIGN}\n${entry}\n`);
  return { root, saved, dir: path.join(root, saved.path) };
}

test('verify: an untouched approval registered in DESIGN.md is ok', () => {
  const { root, saved } = approvedProject();
  assert.deepEqual(verifyApproved({ projectRoot: root, approvedPath: saved.path }), { status: 'ok', problems: [] });
});

test('verify: an edited, added or removed file, or an edited manifest, is BLOCKED', () => {
  const edits = {
    'file-changed': ({ dir }) => fs.appendFileSync(path.join(dir, 'home.html'), '<!-- edited -->'),
    'extra-file': ({ dir }) => fs.writeFileSync(path.join(dir, 'extra.html'), page('x')),
    'missing-file': ({ dir }) => fs.rmSync(path.join(dir, 'detail.html')),
    'manifest-sha-mismatch': ({ dir }) => fs.appendFileSync(path.join(dir, 'manifest.json'), '\n'),
    'no-entry': ({ root }) => fs.writeFileSync(path.join(root, 'DESIGN.md'), DESIGN),
  };
  for (const [problem, edit] of Object.entries(edits)) {
    const p = approvedProject();
    edit(p);
    const r = verifyApproved({ projectRoot: p.root, approvedPath: p.saved.path });
    assert.equal(r.status, 'BLOCKED', problem);
    assert.ok(r.problems.some((x) => x.problem === problem), `${problem}: ${JSON.stringify(r.problems)}`);
  }
});

test('verify and record only accept design/approved/<flow> paths', () => {
  const { root } = approvedProject();
  for (const p of ['../outside', 'design/approved/../../x', 'design/approved/', 'src/checkout']) {
    assert.deepEqual(verifyApproved({ projectRoot: root, approvedPath: p }), { status: 'BLOCKED', problems: [{ problem: 'bad-path' }] }, p);
  }
  const quote = path.join(makeTempDir(), 'q.txt');
  fs.writeFileSync(quote, 'x');
  const out = runScript('approve.mjs', ['record', '--project', root, '--path', '../outside', '--quote-file', quote]);
  assert.equal(out.status, 1);
  assert.equal(out.json.error, 'bad-path');
});

test('verify uses the latest entry for the path', () => {
  const { root, saved } = approvedProject();
  const stale = decisionEntry({ path: saved.path, manifestSha256: 'b'.repeat(64), date: '2026-09-27', quote: 'old' });
  const text = fs.readFileSync(path.join(root, 'DESIGN.md'), 'utf8');
  fs.writeFileSync(path.join(root, 'DESIGN.md'), text.replace('\n- 2026-09-28', `\n${stale}\n- 2026-09-28`));
  assert.equal(verifyApproved({ projectRoot: root, approvedPath: saved.path }).status, 'ok');
  fs.appendFileSync(path.join(root, 'DESIGN.md'), `${stale}\n`);
  assert.equal(verifyApproved({ projectRoot: root, approvedPath: saved.path }).status, 'BLOCKED');
});

test('CLI: save, record (diff first, then --write) and verify', () => {
  const root = project();
  const from = screens();
  const quote = path.join(makeTempDir(), 'quote.txt');
  fs.writeFileSync(quote, 'Me quedo con la B');
  let out = runScript('approve.mjs', ['save', '--project', root, '--flow', 'checkout', '--from', from, '--date', '2026-09-28', '--values-file', emptyValues()]);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.json.path, 'design/approved/checkout');
  out = runScript('approve.mjs', ['verify', '--project', root, '--path', 'design/approved/checkout']);
  assert.equal(out.status, 1);
  assert.equal(out.json.status, 'BLOCKED');
  out = runScript('approve.mjs', ['record', '--project', root, '--path', 'design/approved/checkout', '--quote-file', quote, '--date', '2026-09-28']);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.json.written, false);
  assert.match(out.json.diff, /\+- 2026-09-28 — approved `design\/approved\/checkout\/`/);
  assert.equal(fs.readFileSync(path.join(root, 'DESIGN.md'), 'utf8'), DESIGN);
  out = runScript('approve.mjs', ['record', '--project', root, '--path', 'design/approved/checkout', '--quote-file', quote, '--date', '2026-09-28', '--write']);
  assert.equal(out.json.written, true);
  out = runScript('approve.mjs', ['verify', '--project', root, '--path', 'design/approved/checkout']);
  assert.equal(out.status, 0, out.stdout);
  out = runScript('approve.mjs', ['save', '--project', root, '--flow', 'checkout', '--from', path.join(root, 'nope'), '--values-file', emptyValues()]);
  assert.equal(out.status, 2);
  out = runScript('approve.mjs', ['save', '--project', root, '--flow', 'checkout', '--from', screens({ 'home.html': page('x', '<script></script>') }), '--values-file', emptyValues()]);
  assert.equal(out.status, 1);
  assert.equal(out.json.ok, false);
});

test('screens with event handlers, javascript: URLs, <base>, meta refresh or remote srcset candidates are refused', () => {
  const link = '<a href="detail.html">d</a>';
  const cases = [
    ['script', page('x', `<img src="a.png" alt="" onerror="alert(1)">${link}`)],
    ['script', page('x', `<button onclick="fetch(1)">b</button>${link}`)],
    ['script', page('x', '<a href="javascript:alert(1)">j</a>')],
    ['script', page('x', `<img src="a.png"onerror="alert(1)">${link}`)],
    ['script', page('x', `<img/onerror=alert(1) src=x>${link}`)],
    ['remote-resource', page('x', `<img srcset=a.png,https://x.example/b.png alt="">${link}`)],
    ['remote-resource', page('x', `<base href="https://evil.example/">${link}`)],
    ['remote-resource', page('x', `<meta http-equiv="refresh" content="0;url=detail.html">${link}`)],
    ['remote-resource', page('x', `<img srcset="a.png 1x, https://cdn.example/b.png 2x" alt="">${link}`)],
  ];
  for (const [problem, html] of cases) {
    const r = checkScreens(screens({ 'home.html': html }));
    assert.ok(r.problems.some((p) => p.file === 'home.html' && p.problem === problem), `${problem}: ${html}`);
  }
  assert.deepEqual(checkScreens(screens({ 'home.html': page('x', '<a href="./detail.html">d</a>') })).problems, []);
});

function emptyValues() {
  const file = path.join(makeTempDir(), 'values.json');
  fs.writeFileSync(file, '[]');
  return file;
}

test('CLI save requires --values-file: the leak check cannot be skipped by omission or by a typo (spec 7.4)', () => {
  const leaky = screens({ 'home.html': page('x', '<p>jdoe was here</p><a href="detail.html">d</a>') });
  for (const extra of [[], ['--value-file', emptyValues()]]) {
    const root = project();
    const out = runScript('approve.mjs', ['save', '--project', root, '--flow', 'checkout', '--from', leaky, ...extra]);
    assert.equal(out.status, 2, JSON.stringify(extra));
    assert.match(out.stderr, /--values-file/);
    assert.doesNotMatch(out.stderr, /at .*\.mjs/);
    assert.equal(fs.existsSync(path.join(root, 'design')), false);
  }
});

test('CLI rejects unknown options per subcommand with exit 2 and a Spanish usage message', () => {
  const root = project();
  const cases = [
    ['save', '--project', root, '--flow', 'checkout', '--from', screens(), '--values-file', emptyValues(), '--write'],
    ['record', '--project', root, '--path', 'design/approved/checkout', '--quote-file', emptyValues(), '--flow', 'x'],
    ['verify', '--project', root, '--path', 'design/approved/checkout', '--date', '2026-09-28'],
  ];
  for (const args of cases) {
    const out = runScript('approve.mjs', args);
    assert.equal(out.status, 2, args[0]);
    assert.match(out.stderr, /opción desconocida/);
    assert.match(out.stderr, /opciones válidas/);
  }
});

function assertCleanUsageError(out, pattern) {
  assert.equal(out.status, 2, out.stderr);
  assert.match(out.stderr, pattern);
  assert.doesNotMatch(out.stderr, /error interno|\n\s+at |\.mjs:\d+/);
}

test('CLI approve: an invalid values file, a missing quote file and a bad --date are clean exit 2 errors', () => {
  const dir = makeTempDir();
  const root = project();
  const bad = path.join(dir, 'bad.json');
  for (const content of ['not json', '{"a":1}', '[1,2]']) {
    fs.writeFileSync(bad, content);
    const out = runScript('approve.mjs', ['save', '--project', root, '--flow', 'checkout', '--from', screens(), '--values-file', bad]);
    assertCleanUsageError(out, /--values-file/);
  }
  assertCleanUsageError(
    runScript('approve.mjs', ['save', '--project', root, '--flow', 'checkout', '--from', screens(), '--values-file', path.join(dir, 'missing.json')]),
    /--values-file/,
  );
  assertCleanUsageError(
    runScript('approve.mjs', ['record', '--project', root, '--path', 'design/approved/checkout', '--quote-file', path.join(dir, 'missing.txt')]),
    /--quote-file/,
  );
  assertCleanUsageError(runScript('approve.mjs', ['record', '--project', root, '--path', 'design/approved/checkout']), /--quote-file/);
  for (const date of ['2026-9-28', '28/09/2026', '2026-02-30', 'hoy']) {
    assertCleanUsageError(runScript('approve.mjs', ['save', '--project', root, '--flow', 'checkout', '--from', screens(), '--values-file', emptyValues(), '--date', date]), /YYYY-MM-DD/);
    assertCleanUsageError(runScript('approve.mjs', ['record', '--project', root, '--path', 'design/approved/checkout', '--quote-file', emptyValues(), '--date', date]), /YYYY-MM-DD/);
  }
  assert.equal(fs.existsSync(path.join(root, 'design')), false);
});
