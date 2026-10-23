// Cross-cutting acceptance of ui-check (spec §16.1): everything goes through the CLI, in
// temporary projects, with the real rules of the catalog.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeTempDir, writeTree, runScript, PLUGIN_ROOT, FIXTURES } from './helpers.mjs';
import * as catalogModule from '../lib/catalog.mjs';

const NEXT_SHADCN = path.join(FIXTURES, 'acceptance', 'next-shadcn');
let runCounter = 0;

function readTree(dir, prefix = '') {
  const tree = {};
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isDirectory()) Object.assign(tree, readTree(path.join(dir, item.name), rel));
    else tree[rel] = fs.readFileSync(path.join(dir, item.name), 'utf8');
  }
  return tree;
}

function initGit(repo) {
  const g = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe', timeout: 10000 });
  g('init', '-q');
  g('config', 'user.email', 'test@example.com');
  g('config', 'user.name', 'Test');
  g('config', 'core.autocrlf', 'false');
  g('add', '.');
  g('commit', '-q', '-m', 'base');
}

// Runs the CLI over `tree` in a fresh project; returns { status, entries, repo, run }.
function check(tree, { files, design, base, git = false } = {}) {
  const repo = writeTree(makeTempDir(), tree);
  if (git) initGit(repo);
  const run = path.join(repo, '.pignolo-ui', 'runs', `r${++runCounter}`);
  const args = ['--project', repo, '--run', run];
  for (const f of files ?? Object.keys(tree).filter((k) => k !== 'DESIGN.md')) args.push('--files', f);
  if (design) args.push('--design', design);
  if (base) args.push('--base', base);
  const r = runScript('ui-check.mjs', args, { cwd: repo });
  assert.notEqual(r.status, 2, r.stderr);
  const report = JSON.parse(fs.readFileSync(path.join(run, 'ui-check.json'), 'utf8'));
  return { status: r.status, entries: report.entries, repo, run };
}
const fails = (entries, id) => entries.filter((e) => e.status === 'fail' && (id === undefined || e.id === id));
const countBy = (entries) => {
  const out = {};
  for (const e of entries) out[e.id] = (out[e.id] ?? 0) + 1;
  return out;
};

// ---- document level (C-01) ----

const CLEAN_MARKUP = '<div><h1>Titulo</h1><button type="button">Guardar</button><img src="a.png" alt="Logo"></div>';

test('document level: a fragment in a component never blocks for A11Y-01/02/05', () => {
  const jsx = CLEAN_MARKUP.replace('alt="Logo">', 'alt="Logo" />');
  const r = check({ 'src/components/Card.tsx': `export function Card() {\n  return ${jsx};\n}\n` });
  assert.equal(r.status, 0);
  for (const id of ['A11Y-01', 'A11Y-02', 'A11Y-05']) {
    assert.deepEqual(fails(r.entries, id), [], id);
    assert.ok(r.entries.some((e) => e.id === id && e.status === 'unverified'), `${id} leaves an unverified entry`);
  }
});

test('document level: the same markup inside a full .html document fails A11Y-01 and A11Y-02', () => {
  const r = check({ 'index.html': `<!doctype html><html><head></head><body>${CLEAN_MARKUP}</body></html>` });
  assert.equal(r.status, 1);
  assert.equal(fails(r.entries, 'A11Y-01').length, 1);
  assert.equal(fails(r.entries, 'A11Y-02').length, 1);
});

// ---- Tailwind classes vs the equivalent CSS ----

const TW_CLASSES = 'rounded-[6px] text-[#333] transition-all outline-none';
const TW_IDS = ['COLOR-02', 'LAYOUT-04', 'MOTION-04', 'STATE-04'];
// MOTION-03 is left out on purpose: in utilities it only reads animate-*, not transition-*.
const failCounts = (entries) => Object.fromEntries(Object.entries(countBy(fails(entries))).filter(([id]) => TW_IDS.includes(id)));

test('tailwind classes: .tsx and .vue give the ids and counts of the equivalent .css', () => {
  const css = check({ 'C.css': '.a { border-radius: 6px; color: #333; transition: all; outline: none; }\n' });
  const tsx = check({ 'C.tsx': `export function C() {\n  return <div className="${TW_CLASSES}">x</div>;\n}\n` });
  const vue = check({ 'C.vue': `<template>\n  <div class="${TW_CLASSES}">x</div>\n</template>\n` });
  const expected = { 'COLOR-02': 1, 'LAYOUT-04': 1, 'MOTION-04': 1, 'STATE-04': 1 };
  assert.deepEqual(failCounts(css.entries), expected);
  assert.deepEqual(failCounts(tsx.entries), expected);
  assert.deepEqual(failCounts(vue.entries), expected);
  // In .vue the markup rules are not evaluated: they stay unverified, never pass or fail.
  for (const id of ['A11Y-04', 'A11Y-26']) {
    assert.deepEqual(vue.entries.filter((e) => e.id === id).map((e) => e.status), ['unverified'], id);
  }
});

test('tailwind classes: focus-visible restores the outline, like :focus-visible in css', () => {
  const css = check({ 'C.css': '.a { outline: none; }\n.a:focus-visible { outline: 2px solid currentcolor; }\n' });
  const tsx = check({ 'C.tsx': 'export function C() {\n  return <div className="outline-none focus-visible:ring-2">x</div>;\n}\n' });
  const vue = check({ 'C.vue': '<template>\n  <div class="outline-none focus-visible:ring-2">x</div>\n</template>\n' });
  for (const r of [css, tsx, vue]) assert.deepEqual(fails(r.entries, 'STATE-04'), []);
});

// ---- comments ----

test('comments: a defect wrapped in the comment of its syntax is not a finding', () => {
  const tree = {
    'a.css': '/* .a { border-radius: 6px; color: #333; transition: all; outline: none; } */\n.b { display: block; }\n',
    'b.tsx': `// <div className="${TW_CLASSES}" />\nexport function B() {\n  return <div>{/* <div className="${TW_CLASSES}">x</div> */}ok</div>;\n}\n`,
    'c.html': `<!-- <div class="${TW_CLASSES}">x</div> <style>.a { outline: none; }</style> -->\n<div>ok</div>\n`,
    'd.vue': `<template>\n  <!-- <div class="${TW_CLASSES}">x</div> -->\n  <div>ok</div>\n</template>\n<style>\n/* .a { outline: none; } */\n</style>\n`,
  };
  const r = check(tree);
  assert.deepEqual(fails(r.entries).map((e) => `${e.id} ${e.file}`), []);
  assert.equal(r.status, 0);
});

// ---- unsupported extension ----

test('unsupported extension: Page.astro leaves only unverified entries and exit 0', () => {
  const r = check({ 'Page.astro': '---\n---\n<div class="rounded-[6px] outline-none">x</div>\n' });
  assert.equal(r.status, 0);
  const own = r.entries.filter((e) => e.file === 'Page.astro');
  assert.ok(own.length > 0);
  assert.ok(own.every((e) => e.status === 'unverified' && /unsupported extension/.test(e.reason)));
});

// ---- approved mockups ----

const MOCKUP = '<!doctype html><html lang="es"><head><title>Home</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main><h1 data-sample>$ 12.480,00</h1><p>Datos de muestra</p></main></body></html>';

test('approved mockup: markers are detalle under design/approved/, bloquea in src/', () => {
  const approved = check({ 'design/approved/checkout/home.html': MOCKUP });
  const c1 = approved.entries.filter((e) => e.id === 'CONTENT-01' && e.status === 'fail');
  assert.equal(c1.length, 1);
  assert.equal(c1[0].severity, 'detalle');
  assert.equal(approved.status, 0);
  const inSrc = check({ 'src/home.html': MOCKUP });
  const c2 = inSrc.entries.filter((e) => e.id === 'CONTENT-01' && e.status === 'fail');
  assert.equal(c2.length, 1);
  assert.equal(c2[0].severity, 'bloquea');
  assert.equal(inSrc.status, 1);
});

// ---- realistic case ----

test('realistic case (next + shadcn): the expected findings and no false blocker in layout.tsx', () => {
  const r = check(readTree(NEXT_SHADCN), { files: ['app/layout.tsx', 'app/page.tsx', 'app/globals.css'], design: 'DESIGN.md' });
  assert.equal(r.status, 1);
  const theme02 = r.entries.find((e) => e.id === 'THEME-02' && e.status === 'fail');
  assert.equal(theme02.severity, 'medio');
  const c03 = fails(r.entries, 'COLOR-03');
  assert.ok(c03.some((e) => e.measure && e.measure.theme === 'dark' && e.measure.ratio === 4.12), 'COLOR-03 dark 4.12');
  const counts = countBy(fails(r.entries));
  assert.equal(counts['LAYOUT-04'], 3);
  assert.equal(counts['MOTION-04'], 1);
  assert.equal(counts['STATE-04'], 1);
  assert.equal(counts['A11Y-04'], 1);
  assert.match(fails(r.entries, 'A11Y-04')[0].reason, /accessible name/);
  for (const id of ['A11Y-02', 'A11Y-05']) {
    const own = r.entries.filter((e) => e.id === id && e.file === 'app/layout.tsx');
    assert.deepEqual(own.map((e) => e.status), ['unverified'], id);
  }
  assert.deepEqual(fails(r.entries).filter((e) => e.file === 'app/layout.tsx'), []);
});

// ---- real rules with translated rejections and scope ----

const REJECT_DESIGN = (items) => `---\nversion: alpha\nname: Fixture\npignolo:\n  schema: 1\n  rejections:\n${items}---\n`;
const RULE_REJECTION = '    - id: R-001\n      date: 2026-09-20\n      rule: MOTION-04\n      note: rechazado\n';
const TEXT_REJECTION = '    - id: R-002\n      date: 2026-09-20\n      pattern:\n        kind: text\n        value: "descubr[ií] m[aá]s"\n      note: cta\n';

test('real rule STATE-04 in scope: the old defect is debt (alto, exit 0), a new one blocks', () => {
  const old = check({ 'app.css': '.a { outline: none; }\n' }, { base: 'HEAD', git: true });
  assert.equal(old.status, 0);
  assert.deepEqual(fails(old.entries, 'STATE-04').map((e) => [e.scope, e.severity]), [['debt', 'alto']]);
  fs.appendFileSync(path.join(old.repo, 'app.css'), '.b { outline: none; }\n');
  const more = runScript('ui-check.mjs', ['--project', old.repo, '--run', path.join(old.repo, '.pignolo-ui', 'runs', 'again'), '--files', 'app.css', '--base', 'HEAD'], { cwd: old.repo });
  assert.equal(more.status, 1);
});

test('real rule MOTION-04 rejected: the fail is bloquea and the exit is 1', () => {
  const tree = { 'DESIGN.md': REJECT_DESIGN(RULE_REJECTION), 'card.css': '.card { transition: all .2s; }\n' };
  const r = check(tree, { files: ['card.css'], design: 'DESIGN.md' });
  const [e] = fails(r.entries, 'MOTION-04');
  assert.equal(e.severity, 'bloquea');
  assert.equal(e.reason, 'rejected R-001');
  assert.equal(r.status, 1);
});

test('a rejection already in the base is debt: alto and exit 0', () => {
  const tree = { 'DESIGN.md': REJECT_DESIGN(RULE_REJECTION), 'card.css': '.card { transition: all .2s; }\n' };
  const r = check(tree, { files: ['card.css'], design: 'DESIGN.md', base: 'HEAD', git: true });
  const [e] = fails(r.entries, 'MOTION-04');
  assert.equal(e.scope, 'debt');
  assert.equal(e.severity, 'alto');
  assert.equal(e.reason, 'rejected R-001');
  assert.equal(r.status, 0);
});

test('a text-pattern rejection already in the base is debt too', () => {
  const tree = { 'DESIGN.md': REJECT_DESIGN(TEXT_REJECTION), 'cta.html': '<div><a href="/x">Descubrí más</a></div>\n' };
  const r = check(tree, { files: ['cta.html'], design: 'DESIGN.md', base: 'HEAD', git: true });
  const [e] = fails(r.entries, 'R-002');
  assert.equal(e.scope, 'debt');
  assert.equal(e.severity, 'alto');
  assert.equal(r.status, 0);
});

// ---- the catalog in the README ----

test('README: the block between catalog markers is exactly renderCatalogMarkdown(catalog)', () => {
  assert.equal(typeof catalogModule.renderCatalogMarkdown, 'function', 'renderCatalogMarkdown exists');
  const readme = fs.readFileSync(path.join(PLUGIN_ROOT, 'README.md'), 'utf8').replace(/\r\n/g, '\n');
  const m = readme.match(/<!-- catalog:start -->\n([\s\S]*?)\n<!-- catalog:end -->/);
  assert.ok(m, 'README has the catalog markers');
  assert.equal(m[1], catalogModule.renderCatalogMarkdown(catalogModule.loadCatalog()).trimEnd());
});

test('renderCatalogMarkdown: one row per rule, pipes escaped, all columns', () => {
  assert.equal(typeof catalogModule.renderCatalogMarkdown, 'function', 'renderCatalogMarkdown exists');
  const md = catalogModule.renderCatalogMarkdown({
    rules: [{ id: 'X-01', criterion: 'a | b', level: 'style', floor: true, severity: 'alto', acceptsIntentional: false, source: 'S 1.0', checker: 'ui-check' }],
  }).trimEnd().split('\n');
  assert.equal(md.length, 3);
  assert.match(md[0], /^\| Id \| /);
  assert.equal(md[2], '| X-01 | a \\| b | style | sí | alto | no | S 1.0 | ui-check |');
});

// ---- credits ----

test('CREDITS.md carries the MIT notice of every third-party project cited by the catalog', () => {
  const credits = fs.readFileSync(path.join(PLUGIN_ROOT, 'CREDITS.md'), 'utf8');
  const cited = new Set();
  for (const file of ['framework-defaults.json', 'shadcn-base-colors.json']) {
    const data = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'catalog', file), 'utf8'));
    const sources = Array.isArray(data) ? data.map((x) => x.source) : [data.source];
    for (const s of sources) for (const m of s.matchAll(/\b([a-z0-9-]+\/[a-z0-9.-]+)\s+(?:commit|v\d)/gi)) cited.add(m[1]);
  }
  assert.ok(cited.size >= 4, `found ${[...cited].join(', ')}`);
  for (const repo of cited) {
    const at = credits.indexOf(`${repo}, `);
    assert.ok(at >= 0, `${repo} is credited`);
    const notice = credits.slice(at).split('\n### ')[0];
    assert.match(notice, /Copyright[\s\S]*Permission is hereby granted/, `${repo} has its copyright and MIT text`);
  }
});
