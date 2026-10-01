'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT, makeTempDir, makeRepo, git } = require('./helpers');
const L = require(path.join(PLUGIN_ROOT, 'lib', 'learnings.js'));
const store = require(path.join(PLUGIN_ROOT, 'lib', 'state-store.js'));

const ID = '2026-09-30-use-lf';
const entry = (source, scope = 'project') => ({ id: ID, status: 'proposed', fields: { source, scope } });
const clean = { findings: [] };
const good = { verified: true, checked: [{ ref: 'src/a.js:1', kind: 'file-line', ok: true }] };
const bad = { verified: false, checked: [{ ref: 'src/a.js:99', kind: 'file-line', ok: false }] };
const NOT_DUP = { duplicate: false };
const decide = (o = {}) => L.decideAcceptance({ entry: entry('session'), scan: clean, duplicate: NOT_DUP, evidence: good, ...o });

// Protects: R-8 (nada se acepta solo, ni un session limpio) · Breaks if: algo acepta sin answer 'yes',
// el piso o un duplicado no ganan al sí, o los flags no avisan al humano.
test('decideAcceptance follows R-8 in order (table, one row per rule)', () => {
  const r0 = decide();
  assert.deepStrictEqual([r0.decision, r0.flags], ['human', []], 'todo limpio y sin respuesta: se pregunta, nunca accepted');
  for (const source of ['session', 'human', 'web']) assert.notStrictEqual(decide({ entry: entry(source) }).decision, 'accepted', source);
  assert.strictEqual(decide({ answer: 'yes' }).decision, 'accepted');
  const no = decide({ answer: 'no' });
  assert.deepStrictEqual([no.decision, no.reason], ['rejected', 'human-no']);
  const floor = decide({ answer: 'yes', scan: { findings: [{ kind: 'secret', match: 'ghp_x' }] } });
  assert.strictEqual(floor.decision, 'rejected', 'el piso gana al sí');
  assert.match(floor.reason, /piso mecánico/);
  const dup = decide({ answer: 'yes', duplicate: { duplicate: true, of: 'otra' } });
  assert.deepStrictEqual([dup.decision, /otra/.test(dup.reason)], ['rejected', true], 'un duplicado se rechaza sin preguntar');
  assert.strictEqual(decide({ duplicate: { duplicate: true, of: 'otra' } }).decision, 'rejected', 'ni siquiera sin respuesta');
  const web = decide({ entry: entry('web') });
  assert.deepStrictEqual([web.decision, web.flags.includes('web')], ['human', true]);
  assert.ok(decide({ reservedMatch: true }).flags.includes('reserved'));
  const ev = decide({ evidence: bad });
  assert.deepStrictEqual([ev.decision, ev.flags], ['human', ['evidence-unverified']]);
  const gen = decide({ entry: entry('session', 'general'), answer: 'yes' });
  assert.deepStrictEqual([gen.decision, gen.promoteCandidate], ['accepted', true]);
  assert.strictEqual(decide({ answer: 'yes' }).promoteCandidate, false);
  assert.strictEqual(decide({ answer: 'maybe' }).decision, 'human', 'una respuesta desconocida no acepta');
});

// Protects: R-9 duplicados · Breaks if: la comparación distingue mayúsculas o puntuación, compara contra
// sí misma, o ignora accepted/rejected/otras proposed.
test('findDuplicate normalizes case, spaces and punctuation; existingFor reads accepted, rejected and other proposed, never itself', () => {
  const ex = [{ id: 'a', body: '# Usar LF\n\nSiempre LF, en todo.\n' }];
  assert.deepStrictEqual(L.findDuplicate({ body: '# usar   lf\n\nsiempre lf en todo', existing: ex }), { duplicate: true, of: 'a' });
  assert.deepStrictEqual(L.findDuplicate({ body: '# Otra cosa\n', existing: ex }), { duplicate: false });
  assert.strictEqual(L.findDuplicate({ body: '', existing: [{ id: 'v', body: '' }] }).duplicate, false, 'vacío no es duplicado');
  const main = makeTempDir('pignolo-dup-');
  const put = (kind, id, body) => assert.ok(store.writeEntry({ main, kind, id, fields: { status: kind.split('/')[1], source: 'session', scope: 'project', evidence: 'e', created: '2026-09-30' }, body }).ok);
  put('learnings/proposed', '2026-09-30-me', '# Mía\n\ntexto uno\n');
  put('learnings/proposed', '2026-09-30-other', '# Otra\n\ntexto dos\n');
  put('learnings/accepted', '2026-09-30-acc', '# Acc\n\ntexto tres\n');
  put('learnings/rejected', '2026-09-30-rej', '# Rej\n\ntexto cuatro\n');
  const ids = L.existingFor({ main, id: '2026-09-30-me' }).map((e) => e.id).sort();
  assert.deepStrictEqual(ids, ['2026-09-30-acc', '2026-09-30-other', '2026-09-30-rej']);
  const mine = fs.readFileSync(path.join(store.stateDir(main, 'learnings/proposed'), '2026-09-30-me.md'), 'utf8');
  assert.strictEqual(L.findDuplicate({ body: mine, existing: L.existingFor({ main, id: '2026-09-30-me' }) }).duplicate, false, 'nunca contra sí misma');
  const rej = fs.readFileSync(path.join(store.stateDir(main, 'learnings/rejected'), '2026-09-30-rej.md'), 'utf8');
  assert.deepStrictEqual(L.findDuplicate({ body: rej.replace('id: 2026-09-30-rej', 'id: x'), existing: L.existingFor({ main, id: '2026-09-30-me' }) }), { duplicate: true, of: '2026-09-30-rej' });
});

// Protects: R-9 evidencia · Breaks if: una línea inexistente verifica, se lee fuera del repo, un sha
// inexistente verifica o una evidencia sin referencia reconocible verifica.
test('checkEvidence verifies path:line and commit shas, never reads outside the repo', () => {
  const main = makeRepo();
  fs.mkdirSync(path.join(main, 'src'));
  fs.writeFileSync(path.join(main, 'src', 'a.js'), '1\n2\n3\n4\n5\n');
  const run = (args) => git(args, main);
  const sha = git(['rev-parse', 'HEAD'], main);
  const c = (evidence) => L.checkEvidence({ main, evidence, run });
  assert.strictEqual(c('src/a.js:3').verified, true);
  assert.strictEqual(c('src/a.js:5').verified, true);
  assert.strictEqual(c('src/a.js:99').verified, false);
  assert.strictEqual(c('src/a.js:0').verified, false);
  assert.strictEqual(c('src/nope.js:1').verified, false);
  assert.deepStrictEqual(c('src/a.js:3').checked, [{ ref: 'src/a.js:3', kind: 'file-line', ok: true }]);
  const outside = makeTempDir('pignolo-outside-');
  fs.writeFileSync(path.join(outside, 'marker.txt'), 'x\ny\n');
  const reads = [];
  const orig = fs.readFileSync;
  fs.readFileSync = function patched(p, ...rest) { reads.push(String(p)); return orig.call(this, p, ...rest); };
  try {
    const rel = path.relative(main, path.join(outside, 'marker.txt')).split(path.sep).join('/');
    assert.strictEqual(c(`${rel}:1`).verified, false, '.. no se sigue');
    assert.strictEqual(c(`${path.join(outside, 'marker.txt')}:1`).verified, false, 'una ruta absoluta no se sigue');
  } finally { fs.readFileSync = orig; }
  assert.ok(!reads.some((p) => p.includes('marker.txt')), 'el archivo de afuera no se leyó');
  const real = c(sha);
  assert.deepStrictEqual([real.verified, real.checked[0].kind, real.checked[0].ok], [true, 'commit', true]);
  assert.strictEqual(c('deadbeefdeadbeef').verified, false);
  assert.strictEqual(c('tests/x.test.js').verified, false, 'sin referencia reconocible');
  assert.deepStrictEqual(c(''), { verified: false, checked: [] });
  assert.strictEqual(c(`src/a.js:3 ${sha}`).verified, true);
  assert.strictEqual(c(`src/a.js:3 deadbeefdeadbeef`).verified, false, 'una referencia mala invalida el conjunto');
});

test('scanLearning finds secrets, permissions, size and pii; a clean text has no findings', () => {
  const kinds = (text, pii = []) => L.scanLearning({ text, piiPatterns: pii }).findings.map((f) => f.kind);
  assert.deepStrictEqual(kinds(`token ghp_${'a'.repeat(36)} en el log`), ['secret']);
  assert.deepStrictEqual(kinds('clave AKIAABCDEFGHIJKLMNOP vista'), ['secret']);
  assert.deepStrictEqual(kinds('usá --no-verify en los commits'), ['permission']);
  assert.deepStrictEqual(kinds('x'.repeat(1300)), ['size']);
  assert.deepStrictEqual(kinds('cliente 20.123.456', ['\\b\\d{2}\\.\\d{3}\\.\\d{3}\\b']), ['pii']);
  assert.deepStrictEqual(kinds('password: hunter2'), ['secret']);
  assert.deepStrictEqual(kinds('-----BEGIN RSA PRIVATE KEY-----'), ['secret']);
  assert.deepStrictEqual(kinds('Los tests de la sombra usan PIGNOLO_HOME temporal porque el real se pisa. '.repeat(4)), []);
  assert.throws(() => L.scanLearning({ text: 'x', piiPatterns: ['('] }), /pii-patterns: "\("/);
});

test('proposeLearning refuses without evidence or with an unknown source; otherwise writes proposed/', () => {
  const main = makeTempDir('pignolo-learn-');
  assert.strictEqual(L.proposeLearning({ main, id: ID, source: 'session', scope: 'project', body: 'x' }).refused, 'no-evidence');
  assert.strictEqual(L.proposeLearning({ main, id: ID, source: 'other', evidence: 'e', body: 'x' }).refused, 'invalid-source');
  assert.strictEqual(L.proposeLearning({ main, id: ID, source: 'session', scope: 'all', evidence: 'e', body: 'x' }).refused, 'invalid-scope');
  const ok = L.proposeLearning({ main, id: ID, source: 'session', scope: 'general', evidence: 'tests/x.test.js', body: '# Usar LF\n\nSiempre.\n', created: '2026-09-30' });
  assert.strictEqual(ok.ok, true, JSON.stringify(ok));
  const e = store.readEntries({ main, kind: 'learnings/proposed' }).entries[0];
  assert.deepStrictEqual([e.status, e.fields.source, e.fields.scope, e.fields.evidence], ['proposed', 'session', 'general', 'tests/x.test.js']);
});

test('applyDecision moves accepted to accepted/ with its status; human does not move; a duplicate keeps the original', () => {
  const main = makeTempDir('pignolo-learn-');
  const propose = (id) => assert.ok(L.proposeLearning({ main, id, source: 'session', evidence: 'e', body: '# T\n' }).ok);
  propose(ID);
  for (const decision of ['human']) {
    const r = L.applyDecision({ main, id: ID, decision });
    assert.deepStrictEqual([r.ok, r.moved], [true, false]);
    assert.ok(fs.existsSync(path.join(store.stateDir(main, 'learnings/proposed'), `${ID}.md`)));
  }
  const acc = L.applyDecision({ main, id: ID, decision: 'accepted' });
  assert.strictEqual(acc.ok, true, JSON.stringify(acc));
  assert.strictEqual(acc.how, 'rename');
  assert.ok(!fs.existsSync(path.join(store.stateDir(main, 'learnings/proposed'), `${ID}.md`)));
  const moved = store.readEntries({ main, kind: 'learnings/accepted' }).entries[0];
  assert.strictEqual(moved.status, 'accepted');
  propose(ID);
  const dup = L.applyDecision({ main, id: ID, decision: 'accepted' });
  assert.deepStrictEqual([dup.ok, dup.refused], [false, 'exists']);
  assert.ok(fs.existsSync(path.join(store.stateDir(main, 'learnings/proposed'), `${ID}.md`)));
  assert.ok(fs.existsSync(path.join(store.stateDir(main, 'learnings/accepted'), `${ID}.md`)));
  const rej = L.applyDecision({ main, id: ID, decision: 'rejected' });
  assert.strictEqual(rej.ok, true);
  assert.strictEqual(store.readEntries({ main, kind: 'learnings/rejected' }).entries[0].status, 'rejected');
  assert.strictEqual(L.applyDecision({ main, id: ID, decision: 'maybe' }).refused, 'invalid-decision');
});

test('applyDecision uses git mv for a versioned proposal and rename for an uncommitted one (F6)', () => {
  const main = makeRepo();
  assert.ok(L.proposeLearning({ main, id: ID, source: 'session', evidence: 'e', body: '# T\n' }).ok);
  git(['add', '.pignolo'], main);
  git(['commit', '-q', '-m', 'propuesta'], main);
  const acc = L.applyDecision({ main, id: ID, decision: 'accepted' });
  assert.strictEqual(acc.how, 'git-mv');
  const status = git(['status', '--porcelain'], main);
  assert.match(status, /^RM?\s+\.pignolo\/state\/learnings\/proposed\/.*-> \.pignolo\/state\/learnings\/accepted\//m);
  const other = '2026-09-30-fresh';
  assert.ok(L.proposeLearning({ main, id: other, source: 'session', evidence: 'e', body: '# T\n' }).ok);
  const r2 = L.applyDecision({ main, id: other, decision: 'rejected' });
  assert.strictEqual(r2.ok, true, JSON.stringify(r2));
  assert.strictEqual(r2.how, 'rename');
  assert.ok(!git(['status', '--porcelain'], main).includes(`proposed/${other}`), 'el índice de git no ve la que no estaba versionada');
});
