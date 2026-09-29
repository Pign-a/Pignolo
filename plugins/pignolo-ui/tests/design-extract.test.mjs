import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { FIXTURES, PLUGIN_ROOT, makeTempDir, writeTree, runScript } from './helpers.mjs';
import { extractDesign } from '../lib/design-extract.mjs';
import { validateDesign, splitFrontmatter } from '../lib/design-doc.mjs';
import { parseYaml } from '../lib/yaml-subset.mjs';

const catalog = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'catalog', 'rules.json'), 'utf8'));
const fixture = (name) => path.join(FIXTURES, 'extract', name);
const DATE = '2026-09-28';

function extract(name) {
  const r = extractDesign(fixture(name), { date: DATE });
  assert.ok(r.text, `${name}: no proposal (${r.mode})`);
  const parsed = parseYaml(splitFrontmatter(r.text).yaml);
  assert.equal(parsed.supported, true);
  assert.deepEqual(parsed.errors, []);
  const v = validateDesign(r.text, { catalog });
  assert.equal(v.reject, false, JSON.stringify(v.findings.filter((f) => f.rejects)));
  return { r, data: parsed.value };
}

test('Tailwind v4 @theme: read from config, namespaces removed, cssVars kept', () => {
  const { r, data } = extract('tailwind-v4');
  assert.equal(r.mode, 'config');
  assert.deepEqual(r.from, ['app.css']);
  assert.deepEqual(data.colors, {
    primary: 'oklch(0.55 0.2 260)', 'on-primary': 'oklch(0.98 0 0)', surface: 'oklch(1 0 0)', 'on-surface': 'oklch(0.2 0 0)', 'brand-500': 'oklch(0.62 0.18 40)',
  });
  assert.deepEqual(data.rounded, { md: '0.5rem', lg: '0.75rem' });
  assert.deepEqual(data.typography, { 'body-md': { fontFamily: 'Inter' } });
  assert.deepEqual(data.spacing, { 1: '0.25rem' });
  assert.equal(data.pignolo.cssVars['colors.primary'], '--color-primary');
  assert.equal(data.pignolo.cssVars['rounded.md'], '--radius-md');
  assert.equal(data.pignolo.extracted, undefined);
  assert.equal(data.pignolo.themes, undefined);
});

test('Tailwind v3 literal config: nested DEFAULT/foreground and the first font of the list', () => {
  const { r, data } = extract('tailwind-v3');
  assert.equal(r.mode, 'config');
  assert.deepEqual(r.from, ['tailwind.config.js']);
  assert.deepEqual(data.colors, { primary: '#0b6bcb', 'on-primary': '#ffffff', surface: '#ffffff', 'on-surface': '#1a1a1a' });
  assert.deepEqual(data.rounded, { lg: '12px' });
  assert.deepEqual(data.typography, { 'body-md': { fontFamily: 'Inter' } });
  assert.equal(data.pignolo.cssVars, undefined);
});

test(':root and .dark: the dark theme goes to pignolo.themes.dark in OKLCH; other CSS is not counted', () => {
  const { r, data } = extract('css-root');
  assert.equal(r.mode, 'config');
  assert.deepEqual(r.from, ['styles/tokens.css']);
  assert.equal(r.darkDetected, true);
  assert.deepEqual(Object.keys(data.colors), ['primary', 'on-primary', 'surface', 'on-surface']);
  assert.ok(!r.text.toLowerCase().includes('ff00ff'), 'frequency counting must not run when config exists');
  assert.deepEqual(Object.keys(data.pignolo.themes.dark), ['primary', 'on-primary', 'surface', 'on-surface']);
  for (const v of Object.values(data.pignolo.themes.dark)) assert.match(v, /^oklch\(/);
  assert.deepEqual(data.rounded, { md: '8px' });
  assert.deepEqual(data.typography, { 'body-md': { fontFamily: 'Source Sans 3' } });
});

test('shadcn: bare HSL becomes hex; foreground, primary-foreground and card follow the shared alias table', () => {
  const { r, data } = extract('shadcn');
  assert.equal(r.mode, 'config');
  assert.deepEqual(r.from, ['app/globals.css']);
  assert.deepEqual(data.colors, { background: '#ffffff', 'on-surface': '#020817', primary: '#0f172a', 'on-primary': '#f8fafc', surface: '#ffffff' });
  assert.deepEqual(Object.keys(data.pignolo.themes.dark), ['background', 'on-surface', 'primary', 'on-primary', 'surface']);
  assert.deepEqual(data.rounded, { md: '0.5rem' });
  assert.deepEqual(data.typography, { 'body-md': { fontFamily: 'Geist' } });
  assert.equal(data.pignolo.cssVars['colors.on-surface'], '--foreground');
  assert.deepEqual(r.renamed, [{ from: 'foreground', to: 'on-surface' }, { from: 'primary-foreground', to: 'on-primary' }, { from: 'card', to: 'surface' }]);
  const v = validateDesign(r.text, { catalog });
  assert.deepEqual(v.findings.filter((f) => f.severity === 'alto' && /^colors./.test(f.path)), []);
});

test('shadcn without --card: no surface is invented and the validator reports it missing', () => {
  const r = extractDesign(fixture('shadcn-no-card'), { date: DATE });
  assert.equal(r.mode, 'config');
  assert.deepEqual(r.renamed, [{ from: 'foreground', to: 'on-surface' }, { from: 'primary-foreground', to: 'on-primary' }]);
  const data = parseYaml(splitFrontmatter(r.text).yaml).value;
  assert.ok(data.colors.background);
  assert.equal(data.colors.surface, undefined);
  const hits = validateDesign(r.text, { catalog }).findings.filter((f) => f.id === 'DESIGN-CONTENT' && f.path === 'colors.surface');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].severity, 'alto');
  assert.equal(hits[0].message, 'semantic color surface is missing');
});

test('without any config: most frequent colors, font and radii, all marked extracted', () => {
  const { r, data } = extract('frequency');
  assert.equal(r.mode, 'frequency');
  assert.deepEqual(r.from, ['src/site.css']);
  assert.deepEqual(data.colors, { primary: '#0b6bcb', surface: '#ffffff', 'on-surface': '#1a1a1a', 'neutral-1': '#e5e5e5' });
  assert.deepEqual(data.typography, { 'body-md': { fontFamily: 'Merriweather' } });
  assert.deepEqual(data.rounded, { sm: '6px', lg: '12px' });
  assert.deepEqual(data.pignolo.extracted, ['colors.primary', 'colors.surface', 'colors.on-surface', 'colors.neutral-1', 'typography.body-md', 'rounded.sm', 'rounded.lg']);
  assert.match(r.text, /extracted, not decided/);
});

test('an unreadable config or tokens in JavaScript: no proposal, never a frequency guess', () => {
  const tw = extractDesign(writeTree(makeTempDir(), {
    'tailwind.config.js': "module.exports = { theme: { colors: require('./tokens') } };",
    'src/a.css': '.a { color: #123456; }',
  }), { date: DATE });
  assert.equal(tw.mode, 'unverified');
  assert.equal(tw.text, null);
  assert.equal(tw.unverified[0].kind, 'tailwind-v3');
  const mui = extractDesign(writeTree(makeTempDir(), {
    'package.json': JSON.stringify({ dependencies: { '@mui/material': '^6' } }),
    'src/a.css': '.a { color: #123456; }',
  }), { date: DATE });
  assert.equal(mui.mode, 'unverified');
  assert.equal(mui.text, null);
  assert.equal(mui.unsupported[0].kind, 'mui');
  const empty = extractDesign(makeTempDir(), { date: DATE });
  assert.deepEqual([empty.mode, empty.text], ['none', null]);
});

test('what extract generates uses MD3 names: known aliases are renamed, cssVars keeps the project variable', () => {
  const root = writeTree(makeTempDir(), {
    'styles.css': ':root {\n  --accent: #0b6bcb;\n  --text: #1a1a1a;\n  --bg: #ffffff;\n  --card: #fafafa;\n  --font-body: Inter, sans-serif;\n}\n',
  });
  const r = extractDesign(root, { date: DATE });
  const data = parseYaml(splitFrontmatter(r.text).yaml).value;
  assert.deepEqual(data.colors, { primary: '#0b6bcb', 'on-surface': '#1a1a1a', background: '#ffffff', surface: '#fafafa' });
  assert.deepEqual(data.pignolo.cssVars, { 'colors.primary': '--accent', 'colors.on-surface': '--text', 'colors.background': '--bg', 'colors.surface': '--card' });
  assert.deepEqual(r.renamed, [{ from: 'accent', to: 'primary' }, { from: 'text', to: 'on-surface' }, { from: 'bg', to: 'background' }, { from: 'card', to: 'surface' }]);
  const both = extractDesign(writeTree(makeTempDir(), { 'a.css': ':root { --primary: #000; --accent: #111; --font-body: Inter; }' }), { date: DATE });
  assert.deepEqual(Object.keys(parseYaml(splitFrontmatter(both.text).yaml).value.colors), ['primary', 'accent']);
});

test('CLI extract into the run folder creates .pignolo-ui/.gitignore first and leaves git status clean', () => {
  const repo = writeTree(makeTempDir(), { 'a.css': ':root { --primary: #0b6bcb; --on-primary: #fff; --font-body: Inter; }' });
  execFileSync('git', ['init', '-q'], { cwd: repo });
  const out = path.join(repo, '.pignolo-ui', 'runs', '20260928-2100-new-home', 'DESIGN.proposal.md');
  const res = runScript('design-md.mjs', ['extract', '--project', repo, '--out', out, '--date', DATE]);
  assert.equal(res.status, 0, res.stderr);
  assert.equal(fs.readFileSync(path.join(repo, '.pignolo-ui', '.gitignore'), 'utf8'), '*\n');
  assert.ok(fs.existsSync(out));
  assert.equal(execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: repo, encoding: 'utf8' }), '?? a.css\n');
});

test('CLI extract: writes only the proposal, never over a file, never when DESIGN.md exists', () => {
  const copy = makeTempDir();
  fs.cpSync(fixture('css-root'), copy, { recursive: true });
  const out = path.join(copy, '.pignolo-ui', 'runs', 'r1', 'proposal.md');
  let res = runScript('design-md.mjs', ['extract', '--project', copy, '--out', out, '--date', DATE]);
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.json.mode, 'config');
  assert.equal(fs.readFileSync(out, 'utf8'), extractDesign(copy, { date: DATE }).text);
  assert.ok(res.json.diff.split('\n').slice(2).filter(Boolean).every((l) => l.startsWith('+') || l.startsWith('@@')));
  res = runScript('design-md.mjs', ['extract', '--project', copy, '--out', out, '--date', DATE]);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /ya existe/);
  const project = writeTree(makeTempDir(), { 'design.md': '# mine\n', 'a.css': ':root { --primary: #000 }' });
  const p2 = path.join(project, '.pignolo-ui', 'p2.md');
  res = runScript('design-md.mjs', ['extract', '--project', project, '--out', p2]);
  assert.equal(res.status, 1);
  assert.equal(res.json.mode, 'exists');
  assert.equal(fs.existsSync(p2), false);
  const empty = makeTempDir();
  res = runScript('design-md.mjs', ['extract', '--project', empty, '--out', path.join(empty, '.pignolo-ui', 'p3.md')]);
  assert.equal(res.status, 1);
  assert.equal(res.json.mode, 'none');
});

test('font-size/weight/line-height variables never become font families', () => {
  const root = writeTree(makeTempDir(), {
    'a.css': ':root { --font-size-base: 1rem; --font-weight: 400; --font-line-height: 1.5; --font-letter-spacing: 0.02em; --font-mono: 12px; --font-body: Inter, sans-serif; --primary: #0b6bcb; }',
  });
  const r = extractDesign(root, { date: DATE });
  const data = parseYaml(splitFrontmatter(r.text).yaml).value;
  assert.deepEqual(data.typography, { 'body-md': { fontFamily: 'Inter' } });
});

test('config without colors keeps its radii and fonts; only colors come from frequency, marked extracted', () => {
  const root = writeTree(makeTempDir(), {
    'a.css': ':root { --radius: 4px; --font-body: Inter; }\n.x { color: #123456; border-radius: 9px; font-family: Georgia; }\n',
  });
  const r = extractDesign(root, { date: DATE });
  assert.equal(r.mode, 'config');
  const data = parseYaml(splitFrontmatter(r.text).yaml).value;
  assert.deepEqual(data.rounded, { md: '4px' });
  assert.deepEqual(data.typography, { 'body-md': { fontFamily: 'Inter' } });
  assert.equal(data.colors.primary, '#123456');
  assert.deepEqual(data.pignolo.extracted, ['colors.primary']);
  assert.deepEqual(r.extracted, ['colors.primary']);
});

test('Tailwind v3: a top-level foreground is on-surface (not "on-"), and first-wins compares the stored name', () => {
  const config = [
    'module.exports = { theme: { extend: { colors: {',
    "  foreground: '#111111',",
    "  primary: { DEFAULT: '#0b6bcb', foreground: '#ffffff' },",
    "  'Card Text': '#222222',",
    "  'card-text': '#333333',",
    '} } } };',
    '',
  ].join(String.fromCharCode(10));
  const r = extractDesign(writeTree(makeTempDir(), { 'tailwind.config.js': config }), { date: DATE });
  const data = parseYaml(splitFrontmatter(r.text).yaml).value;
  assert.ok(!Object.keys(data.colors).includes('on-'), JSON.stringify(data.colors));
  assert.deepEqual(data.colors, { 'on-surface': '#111111', primary: '#0b6bcb', 'on-primary': '#ffffff', 'card-text': '#222222' });
});

test('CLI extract refuses an --out named design.md (any case) or outside the run root; DESIGN.md changes only through the confirmed diff', () => {
  const repo = writeTree(makeTempDir(), { 'a.css': ':root { --primary: #0b6bcb; --on-primary: #fff; --font-body: Inter; }' });
  const outside = makeTempDir();
  const runs = path.join(repo, '.pignolo-ui', 'runs', 'r1');
  const bad = [
    path.join(repo, 'DESIGN.md'),
    path.join(repo, 'design.md'),
    path.join(runs, 'DESIGN.md'),
    path.join(runs, 'Design.MD'),
    path.join(outside, 'proposal.md'),
    path.join(repo, 'proposal.md'),
    path.join(repo, '.pignolo-ui', '..', 'proposal.md'),
  ];
  for (const out of bad) {
    const res = runScript('design-md.mjs', ['extract', '--project', repo, '--out', out, '--date', DATE]);
    assert.equal(res.status, 2, out);
    assert.match(res.stderr, /--out/);
    assert.doesNotMatch(res.stderr, /error interno/);
    assert.equal(fs.existsSync(out), false, out);
  }
  assert.equal(fs.existsSync(path.join(repo, '.pignolo-ui')), false, 'a refused run must not create the run root');
  const ok = runScript('design-md.mjs', ['extract', '--project', repo, '--out', path.join(runs, 'DESIGN.proposal.md'), '--date', DATE]);
  assert.equal(ok.status, 0, ok.stderr);
});
