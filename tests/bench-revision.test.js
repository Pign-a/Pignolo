'use strict';
// Tests of the preparation scripts of the revision benchmarks (tests/bench/revision/). Pure unit
// tests plus one temporary git repo for the snapshot; no agents, no network, no paid commands.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const R = path.join(__dirname, 'bench', 'revision');
const lib = require(path.join(R, 'lib'));
const order = require(path.join(R, 'order'));
const snapshot = require(path.join(R, 'snapshot'));
const leak = require(path.join(R, 'leak-check'));
const extract = require(path.join(R, 'extract'));
const prefilter = require(path.join(R, 'prefilter'));
const assemble = require(path.join(R, 'assemble'));
const dispatch = require(path.join(R, 'dispatch'));
const evalCases = require(path.join(R, 'lentes-eval-cases'));

const cases = lib.loadCases();
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pignolo-bench-rev-'));

// ---- cases.json and order ---------------------------------------------------------------------
test('cases.json: 5 cases with defect (14 important defects) and 2 clean ones, as the lentes card says', () => {
  const l = cases.lentes.cases;
  assert.deepStrictEqual(l.map((c) => c.id), ['D1', 'D2', 'D3', 'D4', 'D5', 'L1', 'L2']);
  assert.strictEqual(l.filter((c) => c.kind === 'defect').length, 5);
  assert.strictEqual(l.flatMap((c) => c.defects).length, 14);
  const known = new Set(cases.defects.map((d) => d.id));
  for (const id of l.flatMap((c) => c.defects)) assert.ok(known.has(id), id);
  assert.deepStrictEqual(cases.lentes.stageA.cases, ['D1', 'D2', 'D5']);
  assert.deepStrictEqual(cases.lentes.arms.B, ['reliability']);
});

test('cases.json: momento scope is 11 defects of 7a and 7 of pignolo-ui; every snapshot has a unique neutral code', () => {
  assert.strictEqual(cases.momento.scope['7a'].length, 11);
  assert.strictEqual(cases.momento.scope.ui.length, 7);
  const codes = cases.snapshots.map((s) => lib.snapshotCode(s.id));
  assert.strictEqual(new Set(codes).size, codes.length);
  for (const c of codes) assert.match(c, /^c[0-9a-f]{7}$/);
  const ids = new Set(cases.snapshots.map((s) => s.id));
  for (const b of cases.momento.blocks) for (const r of b.runs) assert.ok(ids.has(r.snapshot), r.snapshot);
});

test('mulberry32 gives the reference sequence and shuffle is a seeded permutation', () => {
  assert.strictEqual(lib.mulberry32(1)(), 0.6270739405881613);
  const xs = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const s1 = lib.shuffle(xs, 20261002);
  assert.deepStrictEqual(s1, lib.shuffle(xs, 20261002));
  assert.deepStrictEqual(s1.slice().sort(), xs);
});

test('order: run counts of the cards (84 stage B, 12 stage A, 30 momento + 12 reused) and a fixed first run', () => {
  assert.strictEqual(order.lentesOrder(cases, 'B').length, 84);
  assert.strictEqual(order.lentesOrder(cases, 'A').length, 12);
  assert.strictEqual(order.momentoOrder(cases).length, 30);
  assert.strictEqual(order.momentoOrder(cases, { includeReused: true }).length, 42);
  const again = order.lentesOrder(cases, 'B');
  assert.deepStrictEqual(again, order.lentesOrder(cases, 'B'));
  assert.deepStrictEqual(again.slice().sort(), order.lentesRuns(cases, 'B'));
  assert.notDeepStrictEqual(again, order.lentesRuns(cases, 'B'));
});

// ---- snapshot ---------------------------------------------------------------------------------
function tempRepo() {
  const dir = tmp();
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { env, encoding: 'utf8' });
  g('init', '-q');
  fs.mkdirSync(path.join(dir, 'lib'));
  fs.mkdirSync(path.join(dir, 'tests'));
  fs.writeFileSync(path.join(dir, 'lib', 'a.js'), 'one\n');
  fs.writeFileSync(path.join(dir, 'tests', 'a.test.js'), 'one\n');
  g('add', '-A');
  g('commit', '-q', '-m', 'base');
  const base = g('rev-parse', 'HEAD').trim();
  fs.writeFileSync(path.join(dir, 'lib', 'a.js'), 'one\ntwo\n');
  fs.writeFileSync(path.join(dir, 'tests', 'a.test.js'), 'one\ntwo\n');
  fs.writeFileSync(path.join(dir, 'README.md'), 'doc\n');
  g('add', '-A');
  g('commit', '-q', '-m', 'task: change a');
  const task = g('rev-parse', 'HEAD').trim();
  fs.writeFileSync(path.join(dir, 'lib', 'b.js'), 'future\n');
  g('add', '-A');
  g('commit', '-q', '-m', 'later');
  return { dir, base, task };
}

test('snapshot: tree is the commit without .git or later files; diff holds only non-test sources; files.txt lists all', () => {
  const { dir, base, task } = tempRepo();
  const out = path.join(tmp(), 'snap');
  const info = snapshot.buildSnapshot({ repo: dir, commit: task, parent: base, dir: out, cardText: 'card\n' });
  assert.strictEqual(info.hasGitDir, false);
  assert.ok(!fs.existsSync(path.join(out, 'tree', '.git')));
  assert.strictEqual(fs.readFileSync(path.join(out, 'tree', 'lib', 'a.js'), 'utf8'), 'one\ntwo\n');
  assert.ok(!fs.existsSync(path.join(out, 'tree', 'lib', 'b.js')), 'a later file must not be in the snapshot');
  const patch = fs.readFileSync(path.join(out, 'brief', 'diff.patch'), 'utf8');
  assert.match(patch, /lib\/a\.js/);
  assert.doesNotMatch(patch, /a\.test\.js|README/);
  const files = fs.readFileSync(path.join(out, 'brief', 'files.txt'), 'utf8');
  for (const f of ['lib/a.js', 'tests/a.test.js', 'README.md']) assert.ok(files.includes(f), f);
  assert.strictEqual(fs.readFileSync(path.join(out, 'brief', 'task-card.md'), 'utf8'), 'card\n');
  assert.strictEqual(info.sourceAdded, 1);
  assert.throws(() => snapshot.buildSnapshot({ repo: dir, commit: task, parent: base, dir: out }), /ya existe/);
});

test('snapshot: task sections are cut by heading level and picked by number or by the files they name', () => {
  const plan = ['# Plan', '## Task 1: alpha (`lib/a.js`)', 'a body', '### sub', 'more', '## Task 2: beta', 'mentions lib/b.js', '# Wave', '## Task 3: gamma'].join('\n');
  const s = snapshot.planSections(plan);
  assert.deepStrictEqual(s.map((x) => x.n), ['1', '2', '3']);
  assert.match(s[0].text, /sub\nmore$/);
  assert.doesNotMatch(s[1].text, /Wave/);
  assert.deepStrictEqual(snapshot.sectionsNaming(s, ['plugins/x/lib/a.js']).map((x) => x.n), ['1']);
  assert.deepStrictEqual(snapshot.sectionsNaming(s, ['lib/b.js']).map((x) => x.n), ['2']);
});

// ---- leak check -------------------------------------------------------------------------------
const ROOT = path.join(os.tmpdir(), 'snaps', 'c1234567');
const LEAK = {
  hashes: ['bfb52ba0123456789abcdef0123456789abcdef0'],
  strings: [
    { text: 'fix(guard): refs protegidas con -C, listas falsas, revert/am', kind: 'commit-message', defect: '7a-I1' },
    { text: "I1: -C, branch/tag con -v/--sort/--format, revert, am, worktree add", kind: 'test-title', defect: '7a-I1' },
  ],
};
const ev = (type, content) => JSON.stringify({ type, message: { content } });
const use = (name, input) => ev('assistant', [{ type: 'tool_use', id: 'x', name, input }]);
const result = (text) => ev('user', [{ type: 'tool_result', tool_use_id: 'x', content: [{ type: 'text', text }] }]);
const say = (text) => ev('assistant', [{ type: 'text', text }]);
const check = (lines, extra = {}) => leak.checkLeak({ raw: lines.join('\n'), roots: [ROOT], leak: LEAK, ...extra });

test('leak-check: a run that reads only inside the snapshot is clean', () => {
  const r = check([
    use('Read', { file_path: `${ROOT}/tree/lib/a.js` }),
    use('Grep', { pattern: 'x', path: `${ROOT}/tree` }),
    use('Glob', { pattern: `${ROOT}/tree/**/*.js` }),
    use('Read', { file_path: 'tree/lib/b.js' }),
    result('content with abc1234 which is not a fix hash'),
    say(`Looked at ${ROOT}/tree/lib/a.js`),
  ]);
  assert.deepStrictEqual(r.leaks, []);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.toolCalls, 4);
});

test('leak-check: any tool other than Read, Grep and Glob is a leak (Bash reaches the git history)', () => {
  const r = check([use('Bash', { command: 'git log' })]);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.leaks[0].kind, 'tool');
  assert.strictEqual(check([use('Agent', { prompt: 'x' })], { allowTools: ['Read', 'Grep', 'Glob', 'Agent'] }).ok, true);
});

test('leak-check: paths outside the snapshot are leaks, also with .. and with the other drive spelling', () => {
  for (const p of [`${path.dirname(ROOT)}/other/tree/x.js`, `${ROOT}/../c7654321/tree/x.js`, 'D:/pignolo/lib/x.js', '../escape.js']) {
    const r = check([use('Read', { file_path: p })]);
    assert.strictEqual(r.ok, false, p);
    assert.strictEqual(r.leaks[0].kind, 'path', p);
  }
  assert.strictEqual(check([use('Grep', { pattern: 'x', path: path.dirname(ROOT) })]).ok, false);
  assert.strictEqual(check([say('see D:/pignolo/lib/x.js')]).leaks[0].kind, 'outside');
});

test('leak-check: hash (full or abbreviated), fix commit subject and fix test title are leaks wherever they appear', () => {
  assert.strictEqual(check([result('the fix is bfb52ba here')]).leaks[0].kind, 'hash');
  assert.strictEqual(check([say('bfb52ba0123456789abcdef0123456789abcdef0')]).leaks[0].kind, 'hash');
  assert.strictEqual(check([result('git log: fix(guard): refs protegidas con -C, listas falsas, revert/am')]).leaks[0].kind, 'text');
  const t = check([result("test('I1: -C, branch/tag con -v/--sort/--format, revert, am, worktree add', () => {")]);
  assert.strictEqual(t.leaks[0].kind, 'text');
  assert.strictEqual(check(['plain text output mentioning bfb52ba'], {}).ok, false);
});

test('leak-check: plain output files and JSON arrays are read too', () => {
  assert.strictEqual(check(['## Review', 'no leak here', 'APPROVE']).ok, true);
  const arr = JSON.stringify([JSON.parse(use('Read', { file_path: '/etc/passwd' }))]);
  assert.strictEqual(leak.checkLeak({ raw: arr, roots: [ROOT], leak: LEAK }).ok, false);
});

test('leak-check CLI: exit 1 on a leak, 0 when clean, 2 on bad usage', () => {
  const dir = tmp();
  const f = path.join(dir, 't.jsonl');
  const lk = path.join(dir, 'leak.json');
  fs.writeFileSync(lk, JSON.stringify(LEAK));
  const run = (lines) => {
    fs.writeFileSync(f, lines.join('\n'));
    const r = require('node:child_process').spawnSync(process.execPath, [path.join(R, 'leak-check.js'), '--file', f, '--root', ROOT, '--leak', lk], { encoding: 'utf8' });
    return r.status;
  };
  assert.strictEqual(run([use('Read', { file_path: `${ROOT}/tree/a.js` })]), 0);
  assert.strictEqual(run([use('Bash', { command: 'ls' })]), 1);
  assert.strictEqual(require('node:child_process').spawnSync(process.execPath, [path.join(R, 'leak-check.js')], { encoding: 'utf8' }).status, 2);
});

// ---- extract ----------------------------------------------------------------------------------
const FINDINGS = [
  { id: 'rel-1', lens: 'reliability', location: 'plugins/pignolo/lib/git-guard.js:1090', severity: 'CRITICAL', evidence: 'git -C allows commit (see git-guard.js:1090 and lines 10-20)', repro: 'run git -C main commit' },
  { id: 'rel-2', lens: 'reliability', location: 'C:\\x\\snaps\\c1234567\\tree\\lib\\a.js:7', severity: 'WARNING', evidence: 'minor thing in C:\\x\\snaps\\c1234567\\tree\\lib\\a.js' },
];
const report = (arr) => `Reviewed.\n\`\`\`json\n${JSON.stringify(arr, null, 2)}\n\`\`\`\nREQUEST_CHANGES\n`;

test('extract: reads the json block from plain output and from a stream-json trace (tool_result of the Agent)', () => {
  assert.strictEqual(extract.extractBlock(report(FINDINGS)).findings.length, 2);
  assert.strictEqual(extract.extractBlock(report([])).ok, true);
  const trace = [say('RELAYED'), result(report(FINDINGS))].join('\n');
  assert.strictEqual(extract.extractBlock(trace).findings.length, 2);
  assert.strictEqual(extract.extractBlock('no block here').error, 'no-json-block');
  assert.strictEqual(extract.extractBlock('```json\n{oops\n```\n').error, 'json-invalid');
});

test('extract: location is split, absolute paths are cut at tree/, and line numbers go with --strip-lines', () => {
  assert.deepStrictEqual(extract.splitLocation('a/b.js:12'), { file: 'a/b.js', line: 12 });
  assert.deepStrictEqual(extract.splitLocation('C:\\x\\snaps\\c1234567\\tree\\lib\\a.js:7'), { file: 'lib/a.js', line: 7 });
  assert.strictEqual(extract.cleanText('see lib/a.js:44-50 and line 12', true), 'see lib/a.js and line N');
  assert.strictEqual(extract.cleanText('in C:\\x\\snaps\\c1234567\\tree\\lib\\a.js', false), 'in lib\\a.js');
});

test('extract: the blind list drops lens, id, repetition and run, mixes the runs of a case, keeps the key apart', () => {
  const dir = tmp();
  const files = {};
  for (const [run, arr] of [['D2|reliability|1', FINDINGS], ['D2|risk|1', [{ ...FINDINGS[0], id: 'r-1', lens: 'risk' }]], ['D2|resilience|1', []]]) {
    files[run] = path.join(dir, `${run.replace(/\|/g, '_')}.md`);
    fs.writeFileSync(files[run], report(arr));
  }
  const runs = Object.entries(files).map(([run, file]) => ({ run, file, minutes: 2, weighted: 100 }));
  const res = extract.extractAll({ cases, experiment: 'lentes', runs });
  assert.strictEqual(res.full.length, 3);
  assert.strictEqual(new Set(res.full.map((f) => f.code)).size, 3);
  assert.deepStrictEqual(res.full.map((f) => f.lens).sort(), ['reliability', 'reliability', 'risk']);
  const blind = res.blind.D2;
  assert.strictEqual(blind.length, 3);
  for (const b of blind) {
    assert.deepStrictEqual(Object.keys(b).sort(), ['code', 'file', 'line', 'severity', 'text']);
    assert.doesNotMatch(JSON.stringify(b), /reliability|risk|rel-1|r-1|"rep"|D2\|/);
  }
  assert.strictEqual(res.runTable.find((r) => r.run === 'D2|resilience|1').valid, true);
  assert.deepStrictEqual(res.blind, extract.extractAll({ cases, experiment: 'lentes', runs }).blind, 'seeded: same input, same codes and order');
});

test('extract momento: T, F and G of one plan share a batch, lines are stripped and reused runs are skipped', () => {
  const dir = tmp();
  const mk = (name, arr) => { const f = path.join(dir, name); fs.writeFileSync(f, report(arr)); return f; };
  const runs = [
    { run: 'T-7a|t1|1', file: mk('t1', [FINDINGS[0]]) },
    { run: 'F-7a|end|1', file: mk('f', [FINDINGS[0]]) },
    { run: 'T-7a|t8|1', file: mk('t8', [FINDINGS[0]]) },
  ];
  const res = extract.extractAll({ cases, experiment: 'momento', runs });
  assert.deepStrictEqual(Object.keys(res.blind), ['7a']);
  assert.strictEqual(res.blind['7a'].length, 2);
  for (const b of res.blind['7a']) {
    assert.strictEqual(b.line, null);
    assert.doesNotMatch(b.text, /:1090|10-20/);
  }
  assert.strictEqual(res.runTable.find((r) => r.run === 'T-7a|t8|1').valid, null);
  assert.deepStrictEqual(res.full.map((f) => f.arm).sort(), ['F', 'T']);
});

// ---- prefilter --------------------------------------------------------------------------------
test('prefilter: a finding is a candidate when its file is one of the defect files (suffix match), nothing else', () => {
  const cards = [{ id: '7a-I1', files: ['plugins/pignolo/lib/git-guard.js'] }, { id: '7a-I4', files: ['plugins/pignolo/lib/branch-cleanup.js'] }];
  const res = prefilter.prefilter([
    { code: 'f1', file: 'lib/git-guard.js' },
    { code: 'f2', file: 'plugins/pignolo/lib/branch-cleanup.js' },
    { code: 'f3', file: 'lib/other.js' },
    { code: 'f4', file: 'LIB/GIT-GUARD.JS' },
  ], cards);
  assert.deepStrictEqual(res.map((r) => r.candidates), [['7a-I1'], ['7a-I4'], [], ['7a-I1']]);
  assert.strictEqual(prefilter.sameFile('xlib/git-guard.js', 'lib/git-guard.js'), false);
});

// ---- assemble ---------------------------------------------------------------------------------
let seq = 0;
function fnd(run, caseId, lens, rep, severity) {
  seq += 1;
  return { code: `f${seq}`, run, experiment: 'lentes', batch: caseId, caseId, lens, rep, severity };
}
function lentesFixture() {
  const findings = [];
  const matches = {};
  const add = (lens, rep, severity, match, caseId = 'D2') => {
    const f = fnd(`${caseId}|${lens}|${rep}`, caseId, lens, rep, severity);
    findings.push(f);
    matches[f.code] = match;
  };
  // reliability: I1 in every repetition
  for (const rep of [1, 2, 3]) add('reliability', rep, 'CRITICAL', '7a-I1');
  // risk: I2 (BLOCKER) in reps 1 and 2 and 3; reliability never finds it -> stable unique
  for (const rep of [1, 2, 3]) add('risk', rep, 'BLOCKER', '7a-I2');
  // resilience: I3 only as WARNING in rep 1 (seen, not detected), as CRITICAL in rep 3
  add('resilience', 1, 'WARNING', '7a-I3');
  add('resilience', 3, 'CRITICAL', '7a-I3');
  // an unbacked alarm (BLOCKER matching nothing) from readability in rep 2, and a known minor
  add('readability', 2, 'BLOCKER', 'ninguno');
  add('readability', 2, 'CRITICAL', '7a-M5');
  // clean case L1: any blocking finding counts as unbacked
  add('reliability', 1, 'CRITICAL', 'ninguno', 'L1');
  const runs = [];
  for (const caseId of ['D2', 'L1']) for (const lens of cases.lentes.lenses) for (const rep of [1, 2, 3]) runs.push({ run: `${caseId}|${lens}|${rep}`, experiment: 'lentes', caseId, lens, rep, minutes: lens === 'risk' ? 4 : 2, weighted: 100, finalContext: 1000, usd: 0.5 });
  return { findings, matches, runs };
}

test('assemble: arm A is the union of the four lenses per repetition, B is reliability alone; loss = detected by A and not by B', () => {
  const { findings, matches, runs } = lentesFixture();
  const m = assemble.lentesMetrics({ cases, findings, runs, matches });
  const row = (name) => m.rows.find((r) => r.metric.startsWith(name));
  assert.deepStrictEqual(row('detectados A').values, [2, 2, 3]);
  assert.deepStrictEqual(row('detectados B').values, [1, 1, 1]);
  assert.deepStrictEqual(row('detectados C').values, [1, 1, 1]);
  assert.deepStrictEqual(row('vistos A').values, [3, 2, 3]);
  assert.deepStrictEqual(row('PERDIDA').values, [1, 1, 2]);
  assert.deepStrictEqual(m.stableUnique.map((s) => `${s.defect}:${s.lens}`), ['7a-I2:risk']);
  // 3 reps, loss [1,1,2]: median 1, range 1-2 (D3 etc. have no findings, only D2 and L1 ran)
  const { median, range } = lib;
  assert.strictEqual(median(row('PERDIDA').values), 1);
  assert.deepStrictEqual(range(row('PERDIDA').values), [1, 2]);
});

test('assemble: unbacked alarms count blocking findings that match no defect or known minor; in clean cases all of them', () => {
  const { findings, matches, runs } = lentesFixture();
  const m = assemble.lentesMetrics({ cases, findings, runs, matches });
  const row = (name) => m.rows.find((r) => r.metric === name);
  // A: rep1 has L1 reliability CRITICAL (clean case); rep2 has the BLOCKER matching nothing
  assert.deepStrictEqual(row('alarmas sin respaldo A').values, [1, 1, 0]);
  assert.deepStrictEqual(row('alarmas sin respaldo B').values, [1, 0, 0]);
});

test('assemble: time of an arm is the max of its lenses per case, cost is the sum', () => {
  const { findings, matches, runs } = lentesFixture();
  const m = assemble.lentesMetrics({ cases, findings, runs, matches });
  const row = (name) => m.rows.find((r) => r.metric.startsWith(name));
  assert.deepStrictEqual(row('minutos A').values, [8, 8, 8]);
  assert.deepStrictEqual(row('minutos B').values, [4, 4, 4]);
  assert.deepStrictEqual(row('ponderado A').values, [800, 800, 800]);
  assert.deepStrictEqual(row('usd B').values, [1, 1, 1]);
});

test('assemble: expected detection uses the per-lens rates (1 - prod(1 - p))', () => {
  const { findings, matches, runs } = lentesFixture();
  const m = assemble.lentesMetrics({ cases, findings, runs, matches });
  // I1 p=1 (reliability) -> 1; I2 p=1 (risk) -> 1; I3 resilience p=1/3 -> 1/3; A = 2.33; B = reliability only = 1
  assert.ok(Math.abs(m.expected.A - (2 + 1 / 3)) < 1e-9);
  assert.strictEqual(m.expected.B, 1);
});

test('assemble: decision rules of the card, stage B and stage A', () => {
  const { findings, matches, runs } = lentesFixture();
  const b = assemble.lentesMetrics({ cases, findings, runs, matches });
  assert.match(b.decision.join(' '), /Sin diferencia demostrada/);
  assert.match(b.decision.join(' '), /menos de 5/);
  const a = assemble.lentesMetrics({ cases, findings: findings.filter((f) => f.rep === 1), runs: runs.filter((r) => r.rep === 1), matches });
  assert.match(a.decision.join(' '), /Etapa A/);
});

test('assemble: grades are resolved with agreement, kappa and the conservative rule under 85%', () => {
  const ids = new Set(['7a-I1', '7a-I2']);
  const g1 = { a: '7a-I1', b: '7a-I2', c: 'ninguno', d: '7a-I1' };
  const same = assemble.resolveGrades(g1, { a: '7a-I1', b: '7a-I2', c: 'ninguno' }, ids);
  assert.strictEqual(same.agreement.pct, 100);
  assert.strictEqual(same.agreement.kappa, 1);
  assert.strictEqual(same.final.d, '7a-I1');
  const diff = assemble.resolveGrades(g1, { a: 'ninguno', b: '7a-I2', c: 'ninguno', d: 'ninguno' }, ids);
  assert.ok(diff.agreement.pct < 85);
  assert.strictEqual(diff.agreement.conservative, true);
  assert.strictEqual(diff.final.a, 'ninguno', 'a disagreement counts as not matched');
  assert.strictEqual(diff.final.b, '7a-I2');
  const mild = assemble.resolveGrades({ ...g1, e: '7a-I1', f: '7a-I1', g: '7a-I1', h: '7a-I1', i: '7a-I1', j: '7a-I1' }, { a: '7a-I2', e: '7a-I1', f: '7a-I1', g: '7a-I1', h: '7a-I1', i: '7a-I1', j: '7a-I1' }, ids);
  assert.strictEqual(mild.agreement.conservative, false);
  assert.strictEqual(mild.final.a, '7a-I1');
  assert.strictEqual(assemble.cohenKappa([[true, true], [false, false], [true, false], [false, true]]), 0);
});

test('assemble momento: T is the union of the task runs of a repetition, F the plan run; reused lentes runs are merged in', () => {
  const findings = [];
  const matches = {};
  const add = (block, subrun, arm, rep, severity, match) => {
    seq += 1;
    const f = { code: `m${seq}`, run: `${block}|${subrun}|${rep}`, experiment: 'momento', batch: '7a', block, subrun, arm, rep, severity };
    findings.push(f);
    matches[f.code] = match;
  };
  const runs = [];
  for (const rep of [1, 2]) {
    for (const [block, subrun, arm] of [['T-7a', 't1', 'T'], ['T-7a', 't2', 'T'], ['T-7a', 't56', 'T'], ['F-7a', 'end', 'F']]) runs.push({ run: `${block}|${subrun}|${rep}`, experiment: 'momento', batch: '7a', block, subrun, arm, rep, minutes: 1, weighted: 10, finalContext: 100 });
  }
  add('T-7a', 't2', 'T', 1, 'CRITICAL', '7a-I10');
  add('T-7a', 't56', 'T', 1, 'BLOCKER', '7a-I5');
  add('T-7a', 't56', 'T', 1, 'WARNING', '7a-I9');
  add('F-7a', 'end', 'F', 1, 'CRITICAL', '7a-I5');
  add('T-7a', 't2', 'T', 2, 'CRITICAL', '7a-I10');
  add('F-7a', 'end', 'F', 2, 'BLOCKER', 'ninguno');
  const [cmp] = assemble.momentoMetrics({ cases, findings, runs, matches });
  const row = (name) => cmp.rows.find((r) => r.metric.startsWith(name));
  assert.strictEqual(cmp.id, 'T-vs-F-7a');
  assert.deepStrictEqual(row('detectados T').values, [2, 1]);
  assert.deepStrictEqual(row('detectados F').values, [1, 0]);
  assert.deepStrictEqual(row('vistos T').values, [3, 1]);
  assert.deepStrictEqual(row('alarmas sin respaldo F').values, [0, 1]);
  assert.deepStrictEqual(cmp.moment, [{ defect: '7a-I5', tasks: ['t56'] }, { defect: '7a-I10', tasks: ['t2'] }]);
  // reused runs: the lentes run D2|reliability|r becomes the momento run T-7a|t8|r
  const lf = [{ code: 'x1', run: 'D2|reliability|1', experiment: 'lentes', batch: 'D2', caseId: 'D2', lens: 'reliability', rep: 1, severity: 'CRITICAL' }];
  const lr = [{ run: 'D2|reliability|1', experiment: 'lentes', caseId: 'D2', lens: 'reliability', rep: 1, minutes: 3, weighted: 50, finalContext: 500 }];
  const merged = assemble.mergeReused({ cases, findings: [], runs: [], lentes: { findings: lf, runs: lr } });
  assert.strictEqual(merged.findings[0].block, 'T-7a');
  assert.strictEqual(merged.findings[0].subrun, 't8');
  assert.strictEqual(merged.findings[0].code, 'L:x1');
  assert.ok(merged.missing.includes('D2|reliability|2'));
});

// ---- dispatch and eval cases ------------------------------------------------------------------
test('dispatch: the text of the card, identical but for the values', () => {
  const t = dispatch.dispatchText({ sha: 'S', base: 'B', dir: 'C:\\w\\c1' });
  assert.strictEqual(t, [
    'Review this change through your lens.',
    'Frozen SHA: S. Worktree (its files are that SHA): C:/w/c1/tree',
    'Risk level: high.',
    'Task-card: C:/w/c1/brief/task-card.md',
    'Changed files: C:/w/c1/brief/files.txt',
    'Diff B..S of the non-test source files: C:/w/c1/brief/diff.patch',
    'Read only inside C:/w/c1. There is no git history here.',
  ].join('\n'));
});

test('stage A eval cases: 3 cases x 4 lenses, snapshot fixture, dispatch graders only, nothing is run', (t) => {
  try { execFileSync('git', ['-C', path.join(__dirname, '..'), 'cat-file', '-e', '26705eb^{commit}'], { stdio: 'ignore' }); } catch { t.skip('history of the benchmark commits not available'); return; }
  const work = tmp();
  for (const id of ['ui-p1', '7a-t8', '8d-d5']) fs.mkdirSync(path.join(work, 'snapshots', lib.snapshotCode(id), 'tree'), { recursive: true });
  const out = path.join(tmp(), 'gen');
  const built = evalCases.build({ work, out });
  assert.strictEqual(built.length, 12);
  const one = built.find((b) => b.case === 'D2' && b.lens === 'risk');
  const dir = path.join(out, one.name);
  const prompt = fs.readFileSync(path.join(dir, 'prompt.md'), 'utf8');
  assert.match(prompt, /subagent_type pignolo:review-risk, model opus/);
  assert.match(prompt, /Task-card: \.\/brief\/task-card\.md/);
  assert.match(prompt, /run_in_background false/);
  assert.match(fs.readFileSync(path.join(dir, 'fixture.sh'), 'utf8'), /cp -R ".*\/snapshots\/cdc0d590\/\." \./);
  assert.deepStrictEqual(fs.readdirSync(path.join(dir, 'graders')).sort(), ['dispatched.md', 'model.md', 'single-dispatch.md', 'subagent-returned.md']);
  assert.doesNotMatch(prompt, /D2|7a|fix/);
  const cmd = evalCases.commands('tests/evals/generated/x', 'case');
  assert.match(cmd.probe, /--max-cost-usd 0\.6/);
  assert.match(cmd.stage, /--runs 1 --ablation none --scaffold --trust-plugin --keep-temp --no-publish --max-cost-usd 4\.4 -j 2 --json /);
});
