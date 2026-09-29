'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeTempDir } = require('./helpers');
const L = require('../plugins/pignolo/lib/ledger');

const CLI = path.join(__dirname, '..', 'plugins', 'pignolo', 'scripts', 'ledger.js');
const SHA = 'a'.repeat(40);
const F = (o = {}) => ({ id: 'F1', lens: 'risk', location: 'src/a.js:10', severity: 'WARNING', status: 'open', evidence: 'x', ...o });
const REPRO = { test: 'falla al pasar null' };

for (const [level, profile, lenses, refuters, jd] of [
  ['low', 'balanced', [], 0, false],
  ['medium', 'economy', ['reliability', 'testability'], 0, false],
  ['high', 'max', 5, 3, true],
  ['high', 'balanced', 5, 1, false],
  ['high', 'economy', ['risk', 'testability'], 1, false],
]) {
  test(`reviewPlan ${level}/${profile}`, () => {
    const p = L.reviewPlan({ level, profile });
    if (Array.isArray(lenses)) assert.deepEqual(p.lenses, lenses);
    else assert.equal(p.lenses.length, lenses);
    assert.equal(p.refuters, refuters);
    assert.equal(p.judgmentDay, jd);
  });
}

for (const [verdicts, opts, want] of [
  [['REFUTED', 'REFUTED', 'CONFIRMED'], { profile: 'max', level: 'high' }, 'refuted'],
  [['REFUTED', 'INCONCLUSIVE', 'INCONCLUSIVE'], { profile: 'max', level: 'high' }, 'stands'],
  [['REFUTED', 'REFUTED'], { profile: 'max', level: 'high' }, 'refuted'],
  [['REFUTED'], { profile: 'max', level: 'high' }, 'stands'],
  [['REFUTED', 'refuted', null], { profile: 'max', level: 'high' }, 'stands'],
  [['REFUTED'], { profile: 'balanced', level: 'high' }, 'refuted'],
  [[], { profile: 'balanced', level: 'high' }, 'stands'],
  [['REFUTED'], { profile: 'max', level: 'medium' }, 'refuted'],
]) {
  test(`refutation ${JSON.stringify(verdicts)} ${opts.profile}/${opts.level}`, () => {
    assert.equal(L.refutation(verdicts, opts), want);
  });
}

test('applyRepro: CRITICAL sin rojo baja a WARNING unreproduced', () => {
  const r = L.applyRepro(F({ severity: 'CRITICAL', repro: REPRO }), { red: false });
  assert.equal(r.severity, 'WARNING');
  assert.equal(r.status, 'unreproduced');
});
test('applyRepro: BLOCKER con rojo se confirma; WARNING no cambia', () => {
  assert.equal(L.applyRepro(F({ severity: 'BLOCKER', repro: REPRO }), { red: true }).status, 'confirmed');
  const w = F();
  assert.deepEqual(L.applyRepro(w, { red: false }), w);
});

test('judgment: coincidencias', () => {
  let r = L.judgment([F({ location: 'src/a.js:10' })], [F({ location: 'src/a.js:12' })]);
  assert.equal(r.fix.length, 1);
  assert.equal(r.suspect.length, 0);
  r = L.judgment([F({ location: 'src/a.js:10' })], [F({ location: 'src/a.js:20' })]);
  assert.equal(r.fix.length, 0);
  assert.equal(r.suspect.length, 2);
  r = L.judgment([F({ severity: 'BLOCKER', repro: REPRO })], [F({ severity: 'SUGGESTION' })]);
  assert.equal(r.conflicts.length, 1);
  assert.equal(r.fix.length + r.suspect.length, 0);
  r = L.judgment([F({ location: 'src/a.js:10' })], [F({ location: 'src/b.js:10' })]);
  assert.equal(r.suspect.length, 2);
});

test('validateLedger', () => {
  const ok = { v: 1, sha: SHA, level: 'high', profile: 'max', round: 0, findings: [] };
  assert.deepEqual(L.validateLedger(ok), []);
  assert.ok(L.validateLedger({ ...ok, sha: 'abc' }).length > 0);
  assert.ok(L.validateLedger({ ...ok, round: 3 }).length > 0);
  assert.ok(L.validateLedger({ ...ok, findings: [F({ severity: 'BLOCKER' })] }).length > 0);
  assert.deepEqual(L.validateLedger({ ...ok, findings: [F({ severity: 'BLOCKER', repro: REPRO })] }), []);
});

test('validateFinding: campos malos', () => {
  assert.ok(L.validateFinding(F({ location: 'sinlinea' })).length > 0);
  assert.ok(L.validateFinding(F({ lens: 'x' })).length > 0);
  assert.ok(L.validateFinding(F({ evidence: '' })).length > 0);
  assert.ok(L.validateFinding(F({ status: 'zzz' })).length > 0);
});

test('nextStep', () => {
  const base = { v: 1, sha: SHA, level: 'high', profile: 'max', findings: [F({ status: 'confirmed' })] };
  assert.equal(L.nextStep({ ...base, round: 2 }, { reopened: [] }), 'escalate');
  assert.equal(L.nextStep({ ...base, round: 1 }, { reopened: [] }), 'fix');
  assert.equal(L.nextStep({ ...base, round: 0, findings: [] }, { reopened: [] }), 'done');
  assert.equal(L.nextStep({ ...base, round: 2, findings: [F({ status: 'fixed' })] }, { reopened: [F()] }), 'escalate');
});

test('isFrozen', () => {
  assert.equal(L.isFrozen({ sha: SHA }, SHA), true);
  assert.equal(L.isFrozen({ sha: SHA }, 'b'.repeat(40)), false);
});

test('CLI validate inválido: exit 1 con la lista; uso: exit 2', () => {
  const dir = makeTempDir();
  try {
    const f = path.join(dir, 'l.json');
    fs.writeFileSync(f, JSON.stringify({ v: 1, sha: 'abc', level: 'high', profile: 'max', round: 0, findings: [] }));
    const r = spawnSync(process.execPath, [CLI, 'validate', f], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.ok(JSON.parse(r.stdout).errors.length > 0);
    assert.equal(spawnSync(process.execPath, [CLI], { encoding: 'utf8' }).status, 2);
    const p = spawnSync(process.execPath, [CLI, 'plan', '--level', 'high', '--profile', 'max'], { encoding: 'utf8' });
    assert.equal(p.status, 0);
    assert.equal(JSON.parse(p.stdout).refuters, 3);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
