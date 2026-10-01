'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { PLUGIN_ROOT, makeTempDir } = require('./helpers');
const ap = require(path.join(PLUGIN_ROOT, 'lib', 'approved.js'));

const SAVE_CLI = path.join(PLUGIN_ROOT, 'scripts', 'approved.js');
const VERIFY_CLI = path.join(PLUGIN_ROOT, 'scripts', 'approved-verify.js');
const UI_LIB = pathToFileURL(path.join(PLUGIN_ROOT, '..', 'pignolo-ui', 'lib', 'approved.mjs')).href;
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const page = (title, extra = '') => `<!doctype html>\n<html lang="es">\n<head><meta charset="utf-8"><title>${title}</title></head>\n<body><main><h1>${title}</h1>${extra}</main></body>\n</html>\n`;

function write(dir, tree) {
  for (const [rel, text] of Object.entries(tree)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}
const screens = (tree = {}) => write(makeTempDir('approved-from-'), {
  'a.html': page('Inicio', '<a href="b.html">ir</a>'),
  'b.html': page('Detalle', '<a href="a.html">volver</a>'),
  ...tree,
});
const project = () => makeTempDir('approved-proj-');
const run = (script, args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

test('save copies the screens and writes a manifest with the right sha256; verify is ok', () => {
  const root = project();
  const r = ap.saveApproved({ projectRoot: root, flow: 'checkout', from: screens(), date: '2026-09-30' });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.path, 'design/approved/checkout');
  assert.strictEqual(r.version, 1);
  const dir = path.join(root, r.path);
  assert.deepStrictEqual(fs.readdirSync(dir).sort(), ['a.html', 'b.html', 'manifest.json']);
  const bytes = fs.readFileSync(path.join(dir, 'manifest.json'));
  assert.strictEqual(r.manifestSha256, sha(bytes));
  assert.deepStrictEqual(JSON.parse(bytes), {
    flow: 'checkout', version: 1, date: '2026-09-30',
    files: ['a.html', 'b.html'].map((f) => ({ path: f, sha256: sha(fs.readFileSync(path.join(dir, f))) })),
  });
  assert.strictEqual(ap.manifestSha(root, r.path), r.manifestSha256);
  const v = ap.verifyApproved({ projectRoot: root, approvedPath: r.path, expectedManifestSha: r.manifestSha256 });
  assert.deepStrictEqual(v, { ok: true, problems: [] });
});

test('a second save creates -v2 and leaves the first intact; a third -v3', () => {
  const root = project();
  const first = ap.saveApproved({ projectRoot: root, flow: 'checkout', from: screens(), date: '2026-09-30' });
  const before = fs.readFileSync(path.join(root, first.path, 'a.html'));
  const second = ap.saveApproved({ projectRoot: root, flow: 'checkout', from: screens({ 'a.html': page('Otra', '<a href="b.html">x</a>') }), date: '2026-10-01' });
  const third = ap.saveApproved({ projectRoot: root, flow: 'checkout', from: screens(), date: '2026-10-02' });
  assert.deepStrictEqual([second.path, second.version, third.path, third.version], ['design/approved/checkout-v2', 2, 'design/approved/checkout-v3', 3]);
  assert.ok(before.equals(fs.readFileSync(path.join(root, first.path, 'a.html'))));
});

test('verify finds each kind of tampering', () => {
  const root = project();
  const r = ap.saveApproved({ projectRoot: root, flow: 'checkout', from: screens(), date: '2026-09-30' });
  const dir = path.join(root, r.path);
  const v = () => ap.verifyApproved({ projectRoot: root, approvedPath: r.path, expectedManifestSha: r.manifestSha256 });
  const kinds = () => v().problems.map((p) => p.problem);

  fs.appendFileSync(path.join(dir, 'a.html'), ' ');
  assert.deepStrictEqual(kinds(), ['file-changed']);
  assert.strictEqual(v().ok, false);
  fs.writeFileSync(path.join(dir, 'a.html'), fs.readFileSync(path.join(dir, 'a.html'), 'utf8').slice(0, -1));
  assert.strictEqual(v().ok, true);

  fs.writeFileSync(path.join(dir, 'c.html'), page('c'));
  assert.deepStrictEqual(kinds(), ['extra-file']);
  fs.rmSync(path.join(dir, 'c.html'));

  const keep = fs.readFileSync(path.join(dir, 'b.html'));
  fs.rmSync(path.join(dir, 'b.html'));
  assert.deepStrictEqual(kinds(), ['missing-file']);
  fs.writeFileSync(path.join(dir, 'b.html'), keep);

  const manifest = fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8');
  fs.writeFileSync(path.join(dir, 'manifest.json'), manifest.replace('2026-09-30', '2026-09-29'));
  assert.deepStrictEqual(kinds(), ['manifest-sha-mismatch']);
  fs.writeFileSync(path.join(dir, 'manifest.json'), '{ roto');
  assert.ok(kinds().includes('manifest-unreadable'));
});

test('verify never accepts a path outside APPROVED_PATH', () => {
  const root = project();
  for (const bad of ['design/approved/../x', '../design/approved/x', 'design/approved/A', 'design/approved/x/y', '']) {
    const v = ap.verifyApproved({ projectRoot: root, approvedPath: bad, expectedManifestSha: 'a'.repeat(64) });
    assert.strictEqual(v.ok, false, bad);
  }
  const cli = run(VERIFY_CLI, ['--path', 'design/approved/../x', '--project', root]);
  assert.notStrictEqual(cli.status, 0);
  assert.ok(ap.APPROVED_PATH.test('design/approved/checkout-v2'));
});

test('save refuses remote resources, escaping links and pii; it writes nothing', () => {
  const root = project();
  const cases = [
    ['remote script', { 'a.html': page('x', '<script src="https://cdn.x/y.js"></script>') }, []],
    ['remote css url', { 'a.html': '<html><body style="background:url(//x.y/z.png)">hola</body></html>' }, []],
    ['link escaping the folder', { 'a.html': page('x', '<a href="../fuera.html">x</a>') }, []],
    ['pii', { 'a.html': page('x', '<p>CUIT 20.123.456</p>') }, ['\\b\\d{2}\\.\\d{3}\\.\\d{3}\\b']],
    ['not html', { 'notes.txt': 'hola' }, []],
  ];
  for (const [name, tree, pii] of cases) {
    const r = ap.saveApproved({ projectRoot: root, flow: 'checkout', from: screens(tree), date: '2026-09-30', piiPatterns: pii });
    assert.strictEqual(r.ok, false, name);
    assert.ok(r.problems.length > 0, name);
    assert.ok(!fs.existsSync(path.join(root, 'design')), `${name}: nothing written`);
  }
  assert.strictEqual(ap.saveApproved({ projectRoot: root, flow: 'Bad Name', from: screens(), date: '2026-09-30' }).ok, false);
});

test('the pii problem never echoes the matched value', () => {
  const r = ap.saveApproved({ projectRoot: project(), flow: 'f', from: screens({ 'a.html': page('x', '<p>20.123.456</p>') }), date: '2026-09-30', piiPatterns: ['\\b\\d{2}\\.\\d{3}\\.\\d{3}\\b'] });
  assert.ok(!JSON.stringify(r).includes('20.123.456'));
});

test('compatible with pignolo-ui in both directions', async () => {
  const ui = await import(UI_LIB);
  // núcleo guarda, pignolo-ui verifica con el sha registrado en DESIGN.md
  const root = project();
  const r = ap.saveApproved({ projectRoot: root, flow: 'checkout', from: screens(), date: '2026-09-30' });
  fs.writeFileSync(path.join(root, 'DESIGN.md'), `# Diseño\n\n## Decisions\n\n${ui.decisionEntry({ path: r.path, manifestSha256: r.manifestSha256, date: '2026-09-30', quote: 'dale' })}\n`);
  assert.strictEqual(ui.verifyApproved({ projectRoot: root, approvedPath: r.path }).status, 'ok');
  // pignolo-ui guarda, el núcleo verifica
  const root2 = project();
  const u = ui.saveApproved({ projectRoot: root2, flow: 'checkout', from: screens(), date: '2026-09-30' });
  assert.strictEqual(u.ok, true, JSON.stringify(u.problems));
  assert.deepStrictEqual(ap.verifyApproved({ projectRoot: root2, approvedPath: u.path, expectedManifestSha: u.manifestSha256 }), { ok: true, problems: [] });
  // y el manifest tiene el mismo formato: mismas claves, en el mismo orden
  const keys = (p) => Object.keys(JSON.parse(fs.readFileSync(path.join(p, 'manifest.json'), 'utf8')));
  assert.deepStrictEqual(keys(path.join(root, r.path)), keys(path.join(root2, u.path)));
});

test('recordDecision writes the decision file; approved-verify finds the sha there', () => {
  const root = project();
  const r = ap.saveApproved({ projectRoot: root, flow: 'checkout', from: screens(), date: '2026-09-30' });
  const d = ap.recordDecision({ projectRoot: root, path: r.path, manifestSha256: r.manifestSha256, quote: 'dale, esa pantalla', date: '2026-09-30' });
  assert.strictEqual(d.id, '2026-09-30-checkout');
  const text = fs.readFileSync(d.file, 'utf8');
  assert.match(text, /^---\nid: 2026-09-30-checkout\nstatus: accepted\nsource: human\nevidence: .*design\/approved\/checkout.*[0-9a-f]{64}.*\ncreated: 2026-09-30\n---\n/);
  assert.match(text, /dale, esa pantalla/);
  assert.ok(d.file.includes(path.join('.pignolo', 'state', 'decisions')));
  assert.strictEqual(ap.recordDecision({ projectRoot: root, path: r.path, manifestSha256: r.manifestSha256, quote: '', date: '2026-09-30' }).error !== undefined, true);
  const ok = run(VERIFY_CLI, ['--path', r.path, '--project', root]);
  assert.strictEqual(ok.status, 0, ok.stdout + ok.stderr);
  fs.appendFileSync(path.join(root, r.path, 'a.html'), ' ');
  const bad = run(VERIFY_CLI, ['--path', r.path, '--project', root]);
  assert.strictEqual(bad.status, 1);
  assert.match(bad.stdout, /BLOCKED/);
  assert.match(bad.stdout, /file-changed/);
});

test('approved-verify: --sha explicit, and no registered sha is BLOCKED', () => {
  const root = project();
  const r = ap.saveApproved({ projectRoot: root, flow: 'checkout', from: screens(), date: '2026-09-30' });
  assert.strictEqual(run(VERIFY_CLI, ['--path', r.path, '--project', root]).status, 1, 'no entry anywhere');
  assert.strictEqual(run(VERIFY_CLI, ['--path', r.path, '--project', root, '--sha', r.manifestSha256]).status, 0);
  assert.strictEqual(run(VERIFY_CLI, ['--path', r.path, '--project', root, '--sha', 'f'.repeat(64)]).status, 1);
  assert.strictEqual(run(VERIFY_CLI, ['--project', root]).status, 2);
});

test('approved.js save and record by CLI', () => {
  const root = project();
  const from = screens();
  const s = run(SAVE_CLI, ['save', '--project', root, '--flow', 'checkout', '--from', from, '--date', '2026-09-30']);
  assert.strictEqual(s.status, 0, s.stdout + s.stderr);
  const out = JSON.parse(s.stdout);
  assert.strictEqual(out.path, 'design/approved/checkout');
  const qf = path.join(makeTempDir(), 'q.txt');
  fs.writeFileSync(qf, 'aprobado');
  const rec = run(SAVE_CLI, ['record', '--project', root, '--path', out.path, '--quote-file', qf, '--date', '2026-09-30']);
  assert.strictEqual(rec.status, 0, rec.stdout + rec.stderr);
  const bad = run(SAVE_CLI, ['save', '--project', root, '--flow', 'x', '--from', screens({ 'a.html': page('x', '<img src="http://x.y/z.png">') })]);
  assert.strictEqual(bad.status, 1);
  assert.strictEqual(run(SAVE_CLI, ['save', '--project', root]).status, 2);
  assert.strictEqual(run(SAVE_CLI, ['nada']).status, 2);
});

// Receta del paso 9 de la skill plan (I2 de la revisión final de 5b): el implementer verifica
// desde su worktree, sin --project, así que la carpeta y la decisión tienen que estar
// commiteadas en int/<plan> antes de crear el worktree de la tarea.
test('step 9: committed by path in int/<plan>, the approved folder verifies from a task worktree; uncommitted, it is BLOCKED there', () => {
  const { makeRepo } = require('./helpers');
  const { execFileSync } = require('node:child_process');
  const repo = makeRepo();
  const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
  const q = path.join(makeTempDir('approved-q-'), 'q.txt');
  fs.writeFileSync(q, 'me gusta la primera\n');
  assert.strictEqual(run(SAVE_CLI, ['save', '--project', repo, '--flow', 'tasks', '--from', screens()]).status, 0);
  assert.strictEqual(run(SAVE_CLI, ['record', '--project', repo, '--path', 'design/approved/tasks', '--quote-file', q]).status, 0);
  const verifyFrom = (cwd) => spawnSync(process.execPath, [VERIFY_CLI, '--path', 'design/approved/tasks'], { cwd, encoding: 'utf8' });
  // sin commit: el worktree de la tarea no tiene ni la carpeta ni la decisión
  git('branch', 'int/demo');
  const wt0 = path.join(repo, '.claude', 'worktrees', 't0');
  git('worktree', 'add', '-q', '-b', 'task/demo/00-x', wt0, 'int/demo');
  const r0 = verifyFrom(wt0);
  assert.strictEqual(r0.status, 1);
  assert.match(r0.stdout, /BLOCKED/);
  git('worktree', 'remove', '--force', wt0);
  // con el commit por ruta en la rama del plan, verifica desde el worktree
  git('checkout', '-q', 'int/demo');
  git('add', 'design/approved/tasks/', '.pignolo/state/decisions/');
  const msg = path.join(makeTempDir('approved-msg-'), 'm.txt');
  fs.writeFileSync(msg, 'chore(plan): aprobado visual tasks\n');
  git('commit', '-q', '-F', msg);
  const wt = path.join(repo, '.claude', 'worktrees', 't1');
  git('worktree', 'add', '-q', '-b', 'task/demo/01-x', wt, 'int/demo');
  const r1 = verifyFrom(wt);
  assert.strictEqual(r1.status, 0, r1.stdout + r1.stderr);
  git('worktree', 'remove', '--force', wt);
});
