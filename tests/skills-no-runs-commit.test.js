'use strict';
// T4 del plan 2026-10-03-fuga-leak-values: ningún texto de pignolo invita a un "commit de resguardo" de lo ignorado.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { RULES } = require('../plugins/pignolo/lib/git-guard');

const ROOT = path.join(__dirname, '..', 'plugins');
const CORE_SKILLS = ['daily', 'trivial', 'entry', 'close-session'].map((s) => path.join(ROOT, 'pignolo', 'skills', s, 'SKILL.md'));
const UI_CONTEXT = path.join(ROOT, 'pignolo-ui', 'reference', 'context.md');
const count = (file, mark) => fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.startsWith(mark) || l.includes(`${mark} `)).length;

function mdFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'tests') mdFiles(full, out); } else if (e.name === 'SKILL.md' || (e.name.endsWith('.md') && path.basename(dir) === 'reference')) out.push(full);
  }
  return out;
}

test('1: each core skill has exactly one NO-RUNS-COMMIT line; pignolo-ui context.md exactly one NO-GIT-UI', () => {
  for (const f of CORE_SKILLS) assert.strictEqual(count(f, 'NO-RUNS-COMMIT:'), 1, f);
  assert.strictEqual(count(UI_CONTEXT, 'NO-GIT-UI:'), 1);
});

test('2: no SKILL.md or reference/*.md joins .pignolo-ui or .pignolo/local with git add, commit, resguardo, backup or stage', () => {
  const RE = /(git add|commit|resguard|back ?up|stage)[^\n]{0,80}(\.pignolo-ui|\.pignolo\/local)|(\.pignolo-ui|\.pignolo\/local)[^\n]{0,80}(git add|commit|resguard|back ?up|stage)/i;
  const bad = [];
  for (const f of [...mdFiles(path.join(ROOT, 'pignolo')), ...mdFiles(path.join(ROOT, 'pignolo-ui'))]) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/^NO-(RUNS-COMMIT|GIT-UI):/.test(line)) return;
      if (RE.test(line)) bad.push(`${path.relative(ROOT, f)}:${i + 1}`);
    });
  }
  assert.deepStrictEqual(bad, []);
});

test('3: every guard alternative that says commiteá also says "sin git add -f"', () => {
  const bad = Object.entries(RULES).filter(([, r]) => /commite/i.test(r[2] || '') && !/sin git add -f/.test(r[2])).map(([k]) => k);
  assert.deepStrictEqual(bad, []);
});
