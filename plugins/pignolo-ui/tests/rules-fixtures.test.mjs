// Fixture harness for every rule with checker ui-check (spec §5.1: the catalog snippets are
// these fixtures). Each case is a mini project under tests/fixtures/rules/<ID>/<case>/:
//   pass-*       at least one pass, no fail and no unverified (except reasons matching allowUnverified)
//   fail-*       at least one fail
//   unverified-* at least one unverified and no fail
// expect.json (optional): one object or a list of objects, one per id:
//   { id, status, severity, count, lines, reason, measure, allowUnverified, absent, exitCode }
// Run one group with: node --test --test-name-pattern "rule (ID1|ID2) " <this file>
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURES } from './helpers.mjs';
import { loadCatalog } from '../lib/catalog.mjs';
import { runCheck } from '../lib/ui-check.mjs';

const RULES_DIR = path.join(FIXTURES, 'rules');
const NOT_INPUT = new Set(['expect.json', 'DESIGN.md', 'components.json', 'package.json']);
const PREFIXES = ['pass-', 'fail-', 'unverified-'];

function listFiles(dir, base = dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) listFiles(full, base, out);
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out.sort();
}

function caseDirs(id) {
  const dir = path.join(RULES_DIR, id);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

function readExpect(dir) {
  const file = path.join(dir, 'expect.json');
  if (!fs.existsSync(file)) return [];
  const v = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(v) ? v : [v];
}

const statusOf = (name) => (name.startsWith('pass-') ? 'pass' : name.startsWith('fail-') ? 'fail' : 'unverified');
const show = (entries) => JSON.stringify(entries.map(({ id, status, reason, severity, file, line }) => ({ id, status, reason, severity, file, line })), null, 1);

async function runCase(id, name) {
  const dir = path.join(RULES_DIR, id, name);
  const all = listFiles(dir);
  const files = all.filter((f) => !NOT_INPUT.has(f) && !/^tailwind\.config\./.test(f));
  const design = all.includes('DESIGN.md') ? path.join(dir, 'DESIGN.md') : null;
  const result = await runCheck({ project: dir, files, design, base: null, dom: [] });
  const specs = readExpect(dir);
  const own = specs.find((s) => (s.id ?? id) === id) || {};

  // prefix expectations for the folder's id
  const mine = result.entries.filter((e) => e.id === id);
  const count = (s) => mine.filter((e) => e.status === s).length;
  if (name.startsWith('pass-')) {
    assert.ok(count('pass') > 0, `${id} ${name}: expected a pass\n${show(mine)}`);
    assert.equal(count('fail'), 0, `${id} ${name}: unexpected fail\n${show(mine)}`);
    const allow = own.allowUnverified ? new RegExp(own.allowUnverified) : null;
    const extra = mine.filter((e) => e.status === 'unverified' && !(allow && allow.test(e.reason || '')));
    assert.equal(extra.length, 0, `${id} ${name}: unexpected unverified\n${show(extra)}`);
  } else if (name.startsWith('fail-')) {
    assert.ok(count('fail') > 0, `${id} ${name}: expected a fail\n${show(mine)}`);
  } else {
    assert.ok(count('unverified') > 0, `${id} ${name}: expected an unverified\n${show(mine)}`);
    assert.equal(count('fail'), 0, `${id} ${name}: unexpected fail\n${show(mine)}`);
  }

  // expect.json refinements, one object per id
  for (const spec of specs) {
    const sid = spec.id ?? id;
    const entries = result.entries.filter((e) => e.id === sid);
    const status = spec.status ?? statusOf(name);
    const withStatus = entries.filter((e) => e.status === status);
    const where = `${id} ${name} (${sid} ${status})\n${show(entries)}`;
    if (spec.status !== undefined) assert.ok(withStatus.length > 0, `no entry: ${where}`);
    if (spec.severity !== undefined) {
      assert.ok(withStatus.length > 0, `no entry: ${where}`);
      for (const e of withStatus) assert.equal(e.severity, spec.severity, `severity: ${where}`);
    }
    if (spec.count !== undefined) assert.equal(withStatus.length, spec.count, `count: ${where}`);
    if (spec.lines !== undefined) assert.deepEqual(withStatus.map((e) => e.line).sort((a, b) => a - b), [...spec.lines].sort((a, b) => a - b), `lines: ${where}`);
    if (spec.reason !== undefined) {
      const re = new RegExp(spec.reason);
      assert.ok(withStatus.some((e) => re.test(e.reason || '')), `reason ${spec.reason}: ${where}`);
    }
    if (spec.measure !== undefined) {
      const matches = (e) => e.measure && Object.entries(spec.measure).every(([k, v]) => {
        try { assert.deepEqual(e.measure[k], v); return true; } catch { return false; }
      });
      assert.ok(withStatus.some(matches), `measure ${JSON.stringify(spec.measure)}: ${where}\n${JSON.stringify(withStatus.map((e) => e.measure))}`);
    }
    if (spec.absent !== undefined) {
      for (const s of spec.absent) assert.equal(entries.filter((e) => e.status === s).length, 0, `absent ${s}: ${where}`);
    }
    if (spec.exitCode !== undefined) assert.equal(result.exitCode, spec.exitCode, `exitCode: ${where}`);
  }
}

const catalog = loadCatalog();
for (const rule of catalog.rules.filter((r) => r.checker === 'ui-check')) {
  const cases = caseDirs(rule.id);
  test(`rule ${rule.id} has fixtures`, () => {
    assert.ok(fs.existsSync(path.join(RULES_DIR, rule.id)), `missing tests/fixtures/rules/${rule.id}/`);
    assert.ok(cases.some((c) => c.startsWith('pass-')), `${rule.id}: no pass-* case`);
    assert.ok(cases.some((c) => c.startsWith('fail-')), `${rule.id}: no fail-* case`);
    const odd = cases.filter((c) => !PREFIXES.some((p) => c.startsWith(p)));
    assert.deepEqual(odd, [], `${rule.id}: case folders must start with pass-, fail- or unverified-`);
  });
  for (const name of cases.filter((c) => PREFIXES.some((p) => c.startsWith(p)))) {
    test(`rule ${rule.id} ${name}`, () => runCase(rule.id, name));
  }
}
