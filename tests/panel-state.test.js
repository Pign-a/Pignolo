'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { PLUGIN_ROOT, makeRepo, git } = require('./helpers');
const panel = require(path.join(PLUGIN_ROOT, 'lib', 'panel-state.js'));
const ps = require(path.join(PLUGIN_ROOT, 'lib', 'plan-state.js'));

const LIB = path.join(PLUGIN_ROOT, 'lib', 'panel-state.js');
const project = () => {
  const dir = makeRepo();
  fs.mkdirSync(path.join(dir, '.pignolo'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.pignolo', 'project.md'), '# p\n');
  return dir;
};
const file = (dir) => path.join(dir, '.pignolo', 'panel-state.json');
const opts = ['sí', 'no'];

test('panel-state: read of a missing file gives an empty state without throwing', () => {
  const dir = project();
  const r = panel.read(dir);
  assert.deepEqual(r.problems, []);
  assert.equal(r.state.schema, panel.SCHEMA);
  assert.deepEqual(r.state.decisions, []);
  assert.deepEqual(r.state.next, { none: 'nothing' });
});

test('panel-state: a file that is not UTF-8, empty or with another schema gives an empty state and a problem', () => {
  const dir = project();
  fs.writeFileSync(file(dir), Buffer.from([0xff, 0xfe, 0x00, 0x41, 0xc3, 0x28]));
  assert.deepEqual(panel.read(dir).problems, ['not-utf8']);
  fs.writeFileSync(file(dir), '');
  assert.deepEqual(panel.read(dir).problems, ['empty']);
  fs.writeFileSync(file(dir), JSON.stringify({ schema: 'otro/9', decisions: [{ id: 'Q-1', question: 'x' }] }));
  const r = panel.read(dir);
  assert.deepEqual(r.problems, ['schema-unknown']);
  assert.deepEqual(r.state.decisions, []);
  // y el script que escribe se recupera: reconstruye el archivo
  assert.deepEqual(panel.ask(dir, { question: '¿hola?', options: opts }), { id: 'Q-1' });
  assert.equal(panel.read(dir).state.decisions.length, 1);
});

test('panel-state: normalize drops items without id or question and clips options to 4 and text to its limits', () => {
  const long = 'x'.repeat(500);
  const { state } = panel.normalize({
    schema: panel.SCHEMA,
    decisions: [
      { id: '', question: 'sin id' }, { id: 'Q-1' }, null,
      { id: 'Q-2', question: long, context: long, options: ['a', 'b', 'c', 'd', 'e', { label: 'f', pros_contras: long }], recommended: long },
    ],
    cards: [{ id: 'T1', red: long, green: long }, { red: 'sin id' }],
    plan: { slug: 'p', request: long },
  });
  assert.equal(state.decisions.length, 1);
  const d = state.decisions[0];
  assert.equal(d.options.length, 4);
  assert.ok(d.question.length <= 300 && d.context.length <= 400 && d.recommended.length <= 80);
  assert.equal(state.cards.length, 1);
  assert.ok(state.cards[0].red.length <= 80 && state.cards[0].green.length <= 80);
  assert.ok(state.plan.request.length <= 160);
  const withPros = panel.normalize({ schema: panel.SCHEMA, decisions: [{ id: 'Q-3', question: 'q', options: [{ label: 'a', pros_contras: long }] }] }).state;
  assert.ok(withPros.decisions[0].options[0].pros_contras.length <= 200);
});

test('panel-state: sanitize keeps one line and replaces absolute paths and the user directory', () => {
  const home = os.homedir();
  const out = panel.sanitize(`falló en ${home}${path.sep}proyecto${path.sep}a.js\ny en C:\\Users\\otra\\x\\b.txt y /var/log/app/c.log; ok`, { max: 400 });
  assert.ok(!out.includes('\n'));
  assert.ok(!out.includes(home) && !/[A-Za-z]:[\\/]/.test(out) && !out.includes('/var/log'));
  assert.ok(out.includes('a.js') && out.includes('c.log'));
  const root = path.join(os.tmpdir(), 'proj').replace(/\\/g, '/');
  assert.equal(panel.sanitize(`ver ${root}/src/x.js`, { root }), 'ver src/x.js');
  assert.equal(panel.sanitize('a'.repeat(50), { max: 10 }).length, 10);
  assert.equal(panel.sanitize('and/or y a/b/c quedan'), 'and/or y a/b/c quedan');
});

test('panel-state: update writes through a temporary file and rename, and the file is valid JSON at every moment', async () => {
  const dir = project();
  panel.ask(dir, { question: 'base', options: opts });
  const code = `const p=require(${JSON.stringify(LIB)});for(let i=0;i<150;i++)p.ask(${JSON.stringify(dir)},{question:'q'+i+' '+'x'.repeat(100),options:['a','b']});`;
  const child = spawn(process.execPath, ['-e', code], { stdio: 'ignore' });
  let alive = true;
  child.on('exit', () => { alive = false; });
  let reads = 0;
  while (alive) {
    const text = fs.readFileSync(file(dir), 'utf8'); // nunca a medias
    JSON.parse(text);
    reads += 1;
    await new Promise((r) => setTimeout(r, 3));
  }
  assert.ok(reads > 5, `lecturas: ${reads}`);
  assert.equal(JSON.parse(fs.readFileSync(file(dir), 'utf8')).decisions.length, 151);
  assert.ok(!fs.readdirSync(path.join(dir, '.pignolo')).some((n) => n.includes('.tmp-')));
  assert.ok(!fs.readFileSync(file(dir), 'utf8').includes('\r'));
});

test('panel-state: two concurrent updates both survive', async () => {
  const dir = project();
  const run = (tag) => new Promise((resolve) => {
    const code = `const p=require(${JSON.stringify(LIB)});for(let i=0;i<20;i++)p.ask(${JSON.stringify(dir)},{question:'${tag}'+i,options:['a']});`;
    spawn(process.execPath, ['-e', code], { stdio: 'ignore' }).on('exit', resolve);
  });
  await Promise.all([run('A'), run('B')]);
  const ds = panel.read(dir).state.decisions;
  assert.equal(ds.length, 40);
  assert.equal(new Set(ds.map((d) => d.id)).size, 40);
  assert.equal(new Set(ds.map((d) => d.question)).size, 40);
});

test('panel-state: a stale lock of 10 seconds is taken over', () => {
  const dir = project();
  fs.mkdirSync(path.join(dir, '.pignolo', 'tmp'), { recursive: true });
  const lock = panel.lockOf(dir);
  fs.writeFileSync(lock, '99999\n');
  const old = new Date(Date.now() - 11000);
  fs.utimesSync(lock, old, old);
  const t0 = Date.now();
  panel.ask(dir, { question: 'tras lock viejo', options: opts });
  assert.ok(Date.now() - t0 < 1500);
  assert.ok(!fs.existsSync(lock));
  // un lock reciente de otro hace esperar y falla con LOCKED sin tocar el archivo
  fs.writeFileSync(lock, '1\n');
  assert.throws(() => panel.ask(dir, { question: 'bloqueada', options: opts }), /lock/);
  assert.equal(panel.read(dir).state.decisions.length, 1);
});

test('panel-state: ask assigns the next free Q-id and never reuses an answered one', () => {
  const dir = project();
  assert.equal(panel.ask(dir, { question: 'uno', options: opts }).id, 'Q-1');
  assert.equal(panel.ask(dir, { question: 'dos', options: opts }).id, 'Q-2');
  panel.answer(dir, { id: 'Q-2', answer: 'sí' });
  assert.equal(panel.ask(dir, { question: 'tres', options: opts }).id, 'Q-3');
  // aunque la respondida se recorte del archivo, el contador no retrocede
  panel.update(dir, (s) => { s.decisions = s.decisions.filter((d) => d.id === 'Q-1'); });
  assert.equal(panel.ask(dir, { question: 'cuatro', options: opts }).id, 'Q-4');
});

test('panel-state: answer needs an open id and an answer that is one of its options or the free one', () => {
  const dir = project();
  panel.ask(dir, { question: 'uno', options: opts });
  panel.ask(dir, { question: 'dos', options: opts });
  assert.deepEqual(panel.answer(dir, { id: 'Q-9', answer: 'sí' }), { ok: false, reason: 'unknown-id' });
  assert.deepEqual(panel.answer(dir, { id: 'Q-1', answer: 'quizás' }), { ok: false, reason: 'not-an-option' });
  assert.equal(panel.read(dir).state.decisions[0].status, 'open');
  assert.deepEqual(panel.answer(dir, { id: 'Q-1', answer: 'sí', now: '2026-10-03T10:00:00.000Z' }), { ok: true });
  const d = panel.read(dir).state.decisions[0];
  assert.deepEqual([d.status, d.answer, d.answeredAt], ['answered', 'sí', '2026-10-03T10:00:00.000Z']);
  assert.deepEqual(panel.answer(dir, { id: 'Q-2', answer: 'Otra' }), { ok: true });
});

test('panel-state: answer twice leaves the first answer and reports already-answered', () => {
  const dir = project();
  panel.ask(dir, { question: 'uno', options: opts });
  panel.answer(dir, { id: 'Q-1', answer: 'sí' });
  assert.deepEqual(panel.answer(dir, { id: 'Q-1', answer: 'no' }), { ok: false, reason: 'already-answered' });
  assert.equal(panel.read(dir).state.decisions[0].answer, 'sí');
});

test('panel-state: evidence keeps one line of 80 characters for red and green', () => {
  const dir = project();
  panel.evidence(dir, { card: 'T1', red: `falla: ${'x'.repeat(200)}\nsegunda línea`, green: '12/12' });
  const c = panel.read(dir).state.cards[0];
  assert.equal(c.id, 'T1');
  assert.ok(c.red.length <= 80 && !c.red.includes('\n'));
  assert.equal(c.green, '12/12');
});

function planProject() {
  const dir = project();
  ps.newPlan({ main: dir, plan: 'mi-plan', request: 'hacer algo' });
  ps.setTasks({ main: dir, plan: 'mi-plan', tasks: [{ id: 'T1' }, { id: 'T2' }, { id: 'T3' }] });
  ps.update({ main: dir, plan: 'mi-plan' }, (p) => { p.stage = 'executing'; return null; });
  return dir;
}
const writeRun = (dir, ids) => fs.writeFileSync(path.join(dir, '.pignolo', 'run.json'), JSON.stringify({
  v: 2, flow: 'plan', started: '2026-10-03T10:00:00Z', expires: '2099-01-01T00:00:00Z', plan: 'mi-plan',
  tasks: Object.fromEntries(ids.map((id) => [id, { id, worktree: path.join(dir, 'wt', id), base: 'a'.repeat(40), files: [], agents: [] }])),
}));

test('panel-state: refresh derives plan, branches and cards from the real stores and survives a missing event', () => {
  const dir = planProject();
  git(['checkout', '-q', '-b', 'task/mi-plan/01-x'], dir);
  fs.writeFileSync(path.join(dir, 'b.txt'), 'b\n');
  git(['add', 'b.txt'], dir);
  git(['commit', '-q', '-m', 'trabajo'], dir);
  git(['checkout', '-q', 'main'], dir);
  writeRun(dir, ['T1']);
  let s = panel.refresh(dir);
  assert.deepEqual(s.plan, { slug: 'mi-plan', stage: 'executing', request: 'hacer algo' });
  assert.deepEqual(s.cards.map((c) => [c.id, c.status]), [['T1', 'running'], ['T2', 'todo'], ['T3', 'todo']]);
  const b = s.branches.find((x) => x.name === 'task/mi-plan/01-x');
  assert.deepEqual([b.commits, b.merged, b.stage, b.review, b.suite], [1, false, 'review', 'none', 'none']);
  assert.deepEqual(s.next, { none: 'busy' });
  // nadie llamó a "task-end", solo se quitó la tarea de run.json: el siguiente refresh igual lo ve terminado
  fs.rmSync(path.join(dir, '.pignolo', 'run.json'));
  s = panel.refresh(dir);
  assert.deepEqual(s.cards.map((c) => [c.id, c.status]), [['T1', 'done'], ['T2', 'todo'], ['T3', 'todo']]);
  assert.equal(s.next.rule, 'review');
  // idempotente: sin cambios no reescribe
  const before = fs.readFileSync(file(dir), 'utf8');
  assert.equal(panel.refresh(dir).wrote, false);
  assert.equal(fs.readFileSync(file(dir), 'utf8'), before);
});

test('panel-state: refresh marks merged only for branches already in main', () => {
  const dir = project();
  git(['branch', 'ya-unida'], dir);
  git(['checkout', '-q', '-b', 'sin-unir'], dir);
  fs.writeFileSync(path.join(dir, 'c.txt'), 'c\n');
  git(['add', 'c.txt'], dir);
  git(['commit', '-q', '-m', 'x'], dir);
  git(['checkout', '-q', 'main'], dir);
  git(['checkout', '-q', '-b', 'unida-con-trabajo'], dir);
  fs.writeFileSync(path.join(dir, 'd.txt'), 'd\n');
  git(['add', 'd.txt'], dir);
  git(['commit', '-q', '-m', 'y'], dir);
  git(['checkout', '-q', 'main'], dir);
  git(['merge', '-q', '--no-ff', '-m', 'merge', 'unida-con-trabajo'], dir);
  const m = Object.fromEntries(panel.refresh(dir).branches.map((b) => [b.name, b.merged]));
  assert.deepEqual(m, { 'ya-unida': true, 'unida-con-trabajo': true, 'sin-unir': false });
  assert.equal(panel.refresh(dir).branches[0].name, 'sin-unir'); // las sin unir primero
});

test('panel-state: the file stays under 64 KB with 200 branches', () => {
  const dir = project();
  for (let i = 0; i < 200; i += 1) git(['branch', `feat/${'rama-larga-'.repeat(8)}${i}`], dir);
  for (let i = 0; i < 60; i += 1) panel.ask(dir, { question: 'q'.repeat(300), options: ['a'.repeat(80), 'b'.repeat(80), 'c'.repeat(80), 'd'.repeat(80)], context: 'c'.repeat(400) });
  panel.refresh(dir);
  const size = fs.statSync(file(dir)).size;
  assert.ok(size <= 64 * 1024, `tamaño ${size}`);
  assert.equal(JSON.parse(fs.readFileSync(file(dir), 'utf8')).schema, panel.SCHEMA);
});

test('panel-state: a .pignolo that points outside the project is refused', () => {
  const dir = makeRepo();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pignolo-out-'));
  try { fs.symlinkSync(out, path.join(dir, '.pignolo'), 'junction'); } catch (_) { return; }
  assert.throws(() => panel.ask(dir, { question: 'x', options: opts }), /fuera del proyecto/);
  assert.deepEqual(fs.readdirSync(out), []);
  fs.rmSync(out, { recursive: true, force: true });
});
