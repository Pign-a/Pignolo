'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT, makeTempDir, makeRepo, git } = require('./helpers');
const L = require(path.join(PLUGIN_ROOT, 'lib', 'learnings.js'));
const store = require(path.join(PLUGIN_ROOT, 'lib', 'state-store.js'));

const ID = '2026-09-30-use-lf';
const PASS = { novelty: 'pass', evidence: 'pass', contradictions: 'pass', safety: 'pass', size: 'pass', scope: 'pass' };
const validation = (overrides = {}, status = 'DONE', id = ID) => ({ ok: true, status, results: [{ id, checks: { ...PASS, ...overrides.checks }, contradicts: overrides.contradicts || [], promoteCandidate: false, notes: '' }] });
const entry = (source, scope = 'project') => ({ id: ID, status: 'proposed', fields: { source, scope } });
const clean = { findings: [] };
const report = (json, word = 'DONE') => `Informe.\n\n\`\`\`json\n${JSON.stringify(json, null, 2)}\n\`\`\`\n\n${word}\n`;

test('decideAcceptance follows R-8 in order (table)', () => {
  const d = (e, v, s = clean, r = false) => L.decideAcceptance({ entry: e, validation: v, scan: s, reservedMatch: r });
  assert.strictEqual(d(entry('session'), validation()).decision, 'accepted');
  assert.strictEqual(d(entry('human'), validation()).decision, 'accepted');
  assert.strictEqual(d(entry('web'), validation()).decision, 'human');
  assert.strictEqual(d(entry('session'), validation(), clean, true).decision, 'human');
  assert.strictEqual(d(entry('session'), validation({ contradicts: ['rules/core.md'] })).decision, 'human');
  const rej = d(entry('session'), validation({ checks: { contradictions: 'fail' } }));
  assert.strictEqual(rej.decision, 'rejected');
  assert.match(rej.reason, /contradictions/);
  const floor = d(entry('session'), validation(), { findings: [{ kind: 'secret', match: 'ghp_x' }] });
  assert.strictEqual(floor.decision, 'rejected');
  assert.match(floor.reason, /piso mecánico/);
  assert.strictEqual(d(entry('web'), validation({ checks: { safety: 'fail' } })).decision, 'rejected', 'un fail gana sobre web');
  assert.strictEqual(d(entry('session'), validation({}, 'BLOCKED')).decision, 'pending');
  assert.strictEqual(d(entry('session'), validation({}, 'NEEDS_CONTEXT')).decision, 'pending');
  assert.strictEqual(d(entry('session'), { ok: false, error: 'x' }).decision, 'pending');
  assert.strictEqual(d(entry('session'), validation({}, 'DONE', '2026-09-30-other')).decision, 'pending', 'no informado');
  assert.strictEqual(d(entry('session'), validation({ checks: { safety: 'fail' } }, 'BLOCKED')).decision, 'pending', 'pending gana sobre rejected');
  const gen = d(entry('session', 'general'), validation());
  assert.deepStrictEqual([gen.decision, gen.promoteCandidate], ['accepted', true]);
  assert.strictEqual(d(entry('session'), validation()).promoteCandidate, false);
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

test('parseValidation takes the last json block and the final word; missing check, no word or an unrequested id fail', () => {
  const json = { results: [{ id: ID, checks: PASS, contradicts: [], promoteCandidate: true, notes: 'ok' }] };
  const two = `${report({ results: [{ id: ID, checks: { ...PASS, novelty: 'fail' } }] }, '')}\nSegundo bloque:\n${report(json)}`;
  const r = L.parseValidation(two, { ids: [ID] });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.status, 'DONE');
  assert.strictEqual(r.results[0].checks.novelty, 'pass');
  assert.strictEqual(r.results[0].promoteCandidate, true);
  const missing = L.parseValidation(report({ results: [{ id: ID, checks: { ...PASS, novelty: undefined } }] }));
  assert.strictEqual(missing.ok, false);
  assert.match(missing.error, /novelty/);
  const noWord = L.parseValidation(report(json, 'fin'));
  assert.strictEqual(noWord.ok, false);
  const unknown = L.parseValidation(report(json), { ids: ['2026-09-30-other'] });
  assert.strictEqual(unknown.ok, false);
  assert.match(unknown.error, /no se pidió/);
  const dup = L.parseValidation(report({ results: [json.results[0], json.results[0]] }));
  assert.strictEqual(dup.ok, false);
  assert.strictEqual(L.parseValidation('sin bloque\nDONE').ok, false);
  assert.strictEqual(L.parseValidation(report(json, 'BLOCKED')).status, 'BLOCKED');
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

test('applyDecision moves accepted to accepted/ with its status; human and pending do not move; a duplicate keeps the original', () => {
  const main = makeTempDir('pignolo-learn-');
  const propose = (id) => assert.ok(L.proposeLearning({ main, id, source: 'session', evidence: 'e', body: '# T\n' }).ok);
  propose(ID);
  for (const decision of ['human', 'pending']) {
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
