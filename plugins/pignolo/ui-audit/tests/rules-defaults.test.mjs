// Factory-look rules (THEME-01, THEME-02, COLOR-11): data files, credits and the cases the
// fixture harness (rules-fixtures.test.mjs) cannot express.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURES, PLUGIN_ROOT } from './helpers.mjs';
import { runCheck } from '../lib/ui-check.mjs';
import { RULES } from '../lib/rules/defaults.mjs';

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, rel), 'utf8'));
const caseDir = (id, name) => path.join(FIXTURES, 'rules', id, name);

async function check(id, name, files) {
  const dir = caseDir(id, name);
  const design = fs.existsSync(path.join(dir, 'DESIGN.md')) ? path.join(dir, 'DESIGN.md') : null;
  const res = await runCheck({ project: dir, files, design, base: null, dom: [] });
  return res.entries.filter((e) => e.id === id);
}

test('framework-defaults.json: every entry has framework, version and source', () => {
  const list = readJson('catalog/framework-defaults.json');
  assert.ok(Array.isArray(list) && list.length >= 6);
  for (const e of list) {
    for (const k of ['framework', 'version', 'source']) assert.equal(typeof e[k], 'string', `${e.framework}: ${k}`);
    assert.ok(['primary', 'surface', 'radius', 'font'].some((k) => typeof e[k] === 'string'), `${e.framework} has no value`);
  }
  const by = (f) => list.find((e) => e.framework === f);
  assert.equal(by('Bootstrap').primary, '#0d6efd');
  assert.equal(by('Bootstrap').radius, '0.375rem');
  assert.equal(by('shadcn/ui (Tailwind v3)').radius, '0.5rem');
  assert.equal(by('shadcn/ui (Tailwind v4)').radius, '0.625rem');
  assert.equal(by('Vite template').primary, '#646cff');
  assert.equal(list.filter((e) => e.framework === 'Tailwind CSS').map((e) => e.primary).sort().join(' '), '#3b82f6 oklch(62.3% 0.214 259.815)');
});

test('shadcn-base-colors.json: slate-v3 carries the five variables of the hito 1 fixture', () => {
  const data = readJson('catalog/shadcn-base-colors.json');
  assert.equal(typeof data.source, 'string');
  assert.equal(typeof data.version, 'string');
  const slate = data.sets['slate-v3'];
  assert.equal(slate.background, '0 0% 100%');
  assert.equal(slate.foreground, '222.2 84% 4.9%');
  assert.equal(slate.primary, '222.2 47.4% 11.2%');
  assert.equal(slate['primary-foreground'], '210 40% 98%');
  assert.equal(slate.card, '0 0% 100%');
});

test('CREDITS.md copies the MIT notice of shadcn/ui, Tailwind CSS, Bootstrap and Vite', () => {
  const text = fs.readFileSync(path.join(PLUGIN_ROOT, 'CREDITS.md'), 'utf8');
  for (const line of [
    'Copyright (c) 2023 shadcn',
    'Copyright (c) Tailwind Labs, Inc.',
    'Copyright (c) 2011-2025 The Bootstrap Authors',
    'Copyright (c) 2019-present, VoidZero Inc. and Vite contributors',
  ]) assert.ok(text.includes(line), line);
  assert.ok((text.match(/Permission is hereby granted, free of charge/g) ?? []).length >= 4);
});

test('THEME-01 names the framework, the token and the source file', async () => {
  const [e] = (await check('THEME-01', 'fail-bootstrap', ['app.css'])).filter((x) => x.status === 'fail');
  assert.equal(e.file, 'app.css');
  assert.equal(e.line, 1);
  assert.equal(e.measure.token, 'primary');
  assert.equal(e.measure.version, '5.3');
});

test('THEME-01 declared but extracted is still a default; declared alone is not', async () => {
  assert.equal((await check('THEME-01', 'pass-declared', ['app.css'])).filter((x) => x.status === 'fail').length, 0);
  assert.equal((await check('THEME-01', 'fail-extracted', ['app.css'])).filter((x) => x.status === 'fail').length, 1);
});

test('COLOR-11 reads a bare shadcn HSL primary like a hex one', async () => {
  const [e] = (await check('COLOR-11', 'fail-bare-hsl', ['app.css'])).filter((x) => x.status === 'fail');
  assert.ok(e.measure.h >= 265 && e.measure.h <= 310 && e.measure.c >= 0.12);
});

test('COLOR-11 intentional: the rule returns fail and the runner converts it to pass', async () => {
  const rule = RULES.find((r) => r.id === 'COLOR-11');
  const pctx = {
    project: caseDir('COLOR-11', 'pass-intentional'),
    design: { data: { colors: { primary: '#7C3AED' } }, aliases: new Map(), rel: 'DESIGN.md', status: 'valid' },
    tokens: { sources: [], unverified: [], unsupported: [] },
    catalog: null,
    files: [],
  };
  const raw = rule.checkProject(pctx);
  assert.equal(raw.filter((f) => f.status === 'fail').length, 1);
  const entries = await check('COLOR-11', 'pass-intentional', []);
  assert.deepEqual(entries.map((e) => e.status), ['pass']);
  assert.match(entries[0].reason, /^intentional: /);
});

test('COLOR-11 gradient with an unresolved color is unverified, not pass', async () => {
  const rule = RULES.find((r) => r.id === 'COLOR-11');
  const out = rule.checkFile({
    file: 'a.css', classLists: [], tokens: { sources: [] },
    css: { decls: [{ selector: '.a', atRules: [], property: 'background', value: 'linear-gradient(var(--x), #8b5cf6)', line: 1 }], rules: [], keyframes: [] },
  });
  assert.deepEqual(out.map((f) => f.status), ['unverified']);
});
