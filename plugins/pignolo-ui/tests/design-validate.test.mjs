import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURES, PLUGIN_ROOT, makeTempDir, writeTree, runScript } from './helpers.mjs';
import { validateDesign, splitFrontmatter, DEFAULT_ALIASES } from '../lib/design-doc.mjs';

const catalog = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'catalog', 'rules.json'), 'utf8'));
const VALID = fs.readFileSync(path.join(FIXTURES, 'design', 'valid.md'), 'utf8');

function edit(find, replace, text = VALID) {
  assert.equal(text.split(find).length, 2, `not unique: ${find}`);
  return text.replace(find, replace);
}

const check = (text, opts = {}) => validateDesign(text, { catalog, ...opts });
const ids = (r) => r.findings.map((f) => `${f.id} ${f.path}`);

test('the complete fixture is valid', () => {
  const r = check(VALID);
  assert.deepEqual(r.findings, []);
  assert.equal(r.status, 'valid');
  assert.equal(r.reject, false);
});

test('a BOM and CRLF line endings validate the same (Review Focus 2)', () => {
  const r = check(`\uFEFF${VALID.replace(/\n/g, '\r\n')}`);
  assert.equal(r.status, 'valid', JSON.stringify(r.findings));
  const bad = check(`\uFEFF${edit('  platform: both\n', '  platform: tablet\n').replace(/\n/g, '\r\n')}`);
  assert.deepEqual(bad.findings.map((f) => [f.id, f.line]), [['DESIGN-SCHEMA', 32]]);
});

test('splitFrontmatter gives the YAML, the body and their first lines', () => {
  const s = splitFrontmatter(VALID);
  assert.equal(s.ok, true);
  assert.equal(s.yamlLine, 2);
  assert.match(s.body, /^\n## Overview/);
  assert.equal(splitFrontmatter('# no frontmatter\n').ok, false);
  assert.equal(splitFrontmatter('---\na: 1\n').ok, false);
});

test('without frontmatter the file is invalid and rejected', () => {
  const r = check('# Design\n\nJust prose.\n');
  assert.deepEqual(ids(r), ['DESIGN-FRONTMATTER ']);
  assert.equal(r.reject, true);
});

test('unsupported YAML is "not validated": no rule is evaluated', () => {
  const r = check(edit('  md: 8px\n', '  md: &r 8px\n'));
  assert.equal(r.status, 'unverified');
  assert.match(r.reason, /anchor/);
  assert.deepEqual(r.findings, []);
});

test('the pignolo: schema is closed: unknown keys and wrong values reject', () => {
  const cases = [
    [edit('  schema: 1\n', '  schema: 1\n  foo: 1\n'), 'pignolo.foo'],
    [edit('    reducedMotion: fade-or-none\n', '    reducedMotion: fade-or-none\n    speed: 2\n'), 'pignolo.motion.speed'],
    [edit('  platform: both\n', '  platform: tablet\n'), 'pignolo.platform'],
    [edit('    hoverOpacity: 0.08\n', '    hoverOpacity: 2\n'), 'pignolo.states.hoverOpacity'],
    [edit('    color: "{colors.primary}"\n', '    color: "{rounded.md}"\n'), 'pignolo.focus.color'],
    [edit('  schema: 1\n', '  schema: 2\n'), 'pignolo.schema'],
    [edit('    level1: "0 1px 2px rgb(0 0 0 / 0.14)"\n', '    level9: "none"\n'), 'pignolo.elevation.level9'],
    [edit('  schema: 1\n', '  schema: 1\n  rejections:\n    - id: R-1\n      date: 2026-09-28\n      note: x\n'), 'pignolo.rejections.0.id'],
    [edit('  schema: 1\n', '  schema: 1\n  rejections:\n    - id: R-001\n      date: 2026-09-28\n'), 'pignolo.rejections.0.note'],
    [edit('  schema: 1\n', '  schema: 1\n  cssVars:\n    colors.primary: primary\n'), 'pignolo.cssVars.colors.primary'],
    [edit('  schema: 1\n', '  schema: 1\n  extracted:\n    - colors.nope\n'), 'pignolo.extracted.0'],
    [edit('  schema: 1\n', '  schema: 1\n  web:\n    public: yes\n'), 'pignolo.web.public'],
  ];
  for (const [text, where] of cases) {
    const r = check(text);
    assert.deepEqual(ids(r), [`DESIGN-SCHEMA ${where}`], where);
    assert.equal(r.reject, true, where);
    assert.equal(typeof r.findings[0].line, 'number', where);
  }
});

test('the reserved web keys and a full rejection entry are accepted', () => {
  const text = edit('  schema: 1\n', [
    '  schema: 1',
    '  web:',
    '    public: true',
    '    indexable: false',
    '    locales: [es, en]',
    '    aiCrawlers: null',
    '    llmsTxt: false',
    '    structuredData: []',
    '    conversion: { goal: signup }',
    '  rejections:',
    '    - id: R-001',
    '      date: 2026-09-28',
    '      rule: COLOR-11',
    '      pattern: { kind: property, value: "background-image: linear-gradient" }',
    '      note: no purple gradients',
    '  cssVars:',
    '    colors.primary: --primary',
    '  extracted:',
    '    - colors.outline',
    '',
  ].join('\n'));
  assert.deepEqual(check(text).findings, []);
});

test('intentional only accepts rules with acceptsIntentional: floor and THEME-03 reject', () => {
  const withIntentional = (id) => edit('  schema: 1\n', `  schema: 1\n  intentional:\n    - id: ${id}\n      why: brand decision\n`);
  assert.deepEqual(check(withIntentional('COLOR-02')).findings, []);
  for (const id of ['A11Y-01', 'COLOR-03', 'THEME-03', 'NOPE-99']) {
    const r = check(withIntentional(id));
    assert.deepEqual(ids(r), ['DESIGN-INTENTIONAL pignolo.intentional.0.id'], id);
    assert.equal(r.reject, true);
  }
});

test('hex or dimensions inside pignolo: would be token-like-ignored and reject', () => {
  let r = check(edit('      fast: 120\n', '      fast: "120ms"\n'));
  assert.deepEqual(ids(r), ['DESIGN-SCHEMA pignolo.motion.durationMs.fast', 'DESIGN-TOKEN-LIKE pignolo.motion.durationMs.fast']);
  assert.equal(r.reject, true);
  r = check(edit('  schema: 1\n', '  schema: 1\n  themes:\n    dark:\n      primary: "#7FB2F0"\n'));
  assert.ok(ids(r).includes('DESIGN-TOKEN-LIKE pignolo.themes.dark.primary'), ids(r).join());
  r = check(edit('    widthPx: 2\n', '    widthPx: 2\n    fontSize: 3\n'));
  assert.ok(ids(r).includes('DESIGN-TOKEN-LIKE pignolo.focus.fontSize'), ids(r).join());
  r = check(edit('  schema: 1\n', '  schema: 1\n  rejections:\n    - id: R-001\n      date: 2026-09-28\n      pattern: { kind: text, value: "12px gap" }\n      note: x\n'));
  assert.deepEqual(ids(r), ['DESIGN-SCHEMA pignolo.rejections.0.pattern.value']);
});

test('dark theme: detected in CSS without themes.dark, or incomplete, is THEME-03 alto', () => {
  let r = check(VALID, { darkInCss: true });
  assert.deepEqual(ids(r), ['THEME-03 pignolo.themes.dark']);
  assert.equal(r.findings[0].severity, 'alto');
  assert.equal(r.reject, false);
  const partial = edit('  schema: 1\n', '  schema: 1\n  themes:\n    dark:\n      primary: "oklch(0.72 0.14 250)"\n      surface: "oklch(0.2 0 0)"\n');
  r = check(partial);
  assert.deepEqual(ids(r), ['THEME-03 pignolo.themes.dark.on-primary', 'THEME-03 pignolo.themes.dark.on-surface', 'THEME-03 pignolo.themes.dark.outline']);
  const full = edit('  schema: 1\n', '  schema: 1\n  themes:\n    dark:\n      primary: "oklch(0.72 0.14 250)"\n      on-primary: "oklch(0.18 0.03 250)"\n      surface: "oklch(0.2 0 0)"\n      on-surface: "rgb(240 240 240)"\n      outline: "oklch(0.62 0 0)"\n');
  assert.deepEqual(check(full, { darkInCss: true }).findings, []);
  r = check(edit('  schema: 1\n', '  schema: 1\n  themes:\n    dark:\n      nope: "oklch(0.5 0 0)"\n'));
  assert.ok(ids(r).includes('DESIGN-SCHEMA pignolo.themes.dark.nope'), ids(r).join());
});

test('missing mandatory content is alto and proposes completing, without rejecting', () => {
  const cases = [
    [edit('  platform: both\n', ''), 'DESIGN-CONTENT pignolo.platform'],
    [edit('### Hierarchy and reading order\n', '### Notes\n'), 'DESIGN-CONTENT body'],
    [edit('  button-primary-hover:\n    backgroundColor: "{colors.primary}"\n    textColor: "{colors.on-primary}"\n', ''), 'DESIGN-CONTENT components.button-primary-hover'],
    [edit('  on-surface: "#1A1A1A"\n', ''), 'DESIGN-CONTENT colors.on-surface'],
    [edit('  blue-600: "#0B6BCB"\n  primary: "{colors.blue-600}"\n', '  primary: "#0B6BCB"\n'), 'DESIGN-CONTENT colors'],
    [edit('    draggedOpacity: 0.16\n', ''), 'DESIGN-CONTENT pignolo.states.draggedOpacity'],
  ];
  for (const [text, want] of cases) {
    const r = check(text);
    assert.deepEqual(ids(r), [want]);
    assert.equal(r.findings[0].severity, 'alto');
    assert.equal(r.reject, false);
  }
  const omitted = edit('rounded:\n  md: 8px\n', 'omitted:\n  - rounded\n').replace('    rounded: "{rounded.md}"\n', '');
  assert.deepEqual(check(omitted).findings, []);
});

test('semantic aliases: accent and text are read as primary and on-surface, and the finding names the alias', () => {
  const aliased = edit('  primary: "{colors.blue-600}"\n', '  accent: "{colors.blue-600}"\n')
    .replace('  on-surface: "#1A1A1A"\n', '  text: "#1A1A1A"\n')
    .replace(/\{colors\.primary\}/g, '{colors.accent}');
  const r = check(aliased);
  assert.deepEqual(r.findings.map((f) => [f.id, f.path, f.severity, f.rejects]), [
    ['DESIGN-ALIAS', 'colors.accent', 'detalle', false],
    ['DESIGN-ALIAS', 'colors.text', 'detalle', false],
  ]);
  assert.equal(r.findings[0].message, 'colors.accent read as primary (default alias)');
  assert.equal(r.status, 'valid');
  const dark = check(aliased.replace('  schema: 1\n', '  schema: 1\n  themes:\n    dark:\n      text: "oklch(0.95 0 0)"\n      on-primary: "oklch(0.2 0 0)"\n      surface: "oklch(0.2 0 0)"\n      outline: "oklch(0.6 0 0)"\n'));
  assert.deepEqual(ids(dark), ['DESIGN-ALIAS colors.accent', 'DESIGN-ALIAS colors.text', 'THEME-03 pignolo.themes.dark.accent']);
  const both = check(edit('  on-surface: "#1A1A1A"\n', '  on-surface: "#1A1A1A"\n  text: "#333333"\n'));
  assert.deepEqual(both.findings, [], 'an MD3 name that exists wins: text stays a primitive');
});

test('pignolo.aliases completes the default map and is part of the closed schema', () => {
  const custom = edit('  on-surface: "#1A1A1A"\n', '  brand-ink: "#1A1A1A"\n');
  assert.deepEqual(ids(check(custom)), ['DESIGN-CONTENT colors.on-surface']);
  const r = check(custom.replace('  schema: 1\n', '  schema: 1\n  aliases:\n    brand-ink: on-surface\n'));
  assert.deepEqual(r.findings.map((f) => f.message), ['colors.brand-ink read as on-surface (pignolo.aliases)']);
  assert.deepEqual(ids(check(edit('  schema: 1\n', '  schema: 1\n  aliases:\n    ink: blue-600\n'))), ['DESIGN-SCHEMA pignolo.aliases.ink']);
  assert.deepEqual(ids(check(edit('  schema: 1\n', '  schema: 1\n  aliases:\n    primary: surface\n'))), ['DESIGN-SCHEMA pignolo.aliases.primary']);
});

test('the README documents every default alias', () => {
  const readme = fs.readFileSync(path.join(PLUGIN_ROOT, 'README.md'), 'utf8');
  for (const [from, to] of Object.entries(DEFAULT_ALIASES)) assert.ok(readme.includes(`\`${from}\` → \`${to}\``), `${from} → ${to}`);
});

test('an unquoted hex is empty for YAML and is reported on its line (Review Focus 3)', () => {
  const r = check(edit('  on-primary: "#FFFFFF"\n', '  on-primary: #FFFFFF\n'));
  assert.deepEqual(r.findings.map((f) => [f.id, f.path, f.line, f.severity]), [['DESIGN-FORMAT', 'colors.on-primary', 8, 'alto']]);
  assert.match(r.findings[0].message, /comment/);
});

test('broken references are alto', () => {
  const r = check(edit('    rounded: "{rounded.md}"\n', '    rounded: "{rounded.lg}"\n'));
  assert.deepEqual(ids(r), ['DESIGN-REF components.button-primary.rounded']);
  assert.equal(r.reject, false);
});

test('an error in one key is reported and the rest is still validated', () => {
  const r = check(edit('  outline: "#8F8F8F"\n', '  outline: a: b\n').replace('  register: product\n', ''));
  assert.deepEqual(ids(r), ['DESIGN-YAML colors.outline', 'DESIGN-CONTENT pignolo.register']);
  assert.equal(r.reject, true);
});

test('CLI: exit 0 valid, 1 with findings, 2 unverified; --project detects dark CSS', () => {
  const dir = makeTempDir();
  const file = path.join(dir, 'DESIGN.md');
  fs.writeFileSync(file, VALID);
  let out = runScript('design-md.mjs', ['validate', '--file', file]);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.json.status, 'valid');
  writeTree(dir, { 'src/app.css': ':root { --x: #fff }\n.dark { --x: #000 }\n' });
  out = runScript('design-md.mjs', ['validate', '--file', file, '--project', dir]);
  assert.equal(out.status, 1);
  assert.deepEqual(out.json.findings.map((f) => f.id), ['THEME-03']);
  fs.writeFileSync(file, edit('  md: 8px\n', '  md: *r\n'));
  out = runScript('design-md.mjs', ['validate', '--file', file]);
  assert.equal(out.status, 2);
  assert.equal(out.json.status, 'unverified');
  out = runScript('design-md.mjs', ['validate', '--file', path.join(dir, 'missing.md')]);
  assert.equal(out.status, 2);
  assert.match(out.stderr, /no se pudo leer/);
});

test('CLI design-md: an unknown option is exit 2 with a Spanish usage message, per subcommand', () => {
  const dir = makeTempDir();
  const file = path.join(dir, 'DESIGN.md');
  fs.writeFileSync(file, VALID);
  const ops = path.join(dir, 'ops.json');
  fs.writeFileSync(ops, '[]');
  const cases = [
    ['validate', '--file', file, '--fil', file],
    ['validate', '--file', file, '--out', path.join(dir, 'x.md')],
    ['patch', '--file', file, '--ops', ops, '--writ'],
    ['extract', '--project', dir, '--out', path.join(dir, '.pignolo-ui', 'p.md'), '--file', file],
  ];
  for (const args of cases) {
    const out = runScript('design-md.mjs', args);
    assert.equal(out.status, 2, args.join(' '));
    assert.match(out.stderr, /opción desconocida/);
    assert.match(out.stderr, /opciones válidas/);
  }
});

test('CLI design-md: a missing or nonexistent --project, a bad --date and an op without heading are clean exit 2 errors', () => {
  const dir = makeTempDir();
  const file = path.join(dir, 'DESIGN.md');
  fs.writeFileSync(file, VALID);
  const clean = (out, pattern) => {
    assert.equal(out.status, 2, out.stderr);
    assert.match(out.stderr, pattern);
    assert.doesNotMatch(out.stderr, /error interno|\n\s+at |\.mjs:\d+/);
  };
  const missing = path.join(dir, 'nope');
  const proposal = path.join(dir, '.pignolo-ui', 'p.md');
  clean(runScript('design-md.mjs', ['validate', '--file', file, '--project', missing]), /--project/);
  clean(runScript('design-md.mjs', ['extract', '--project', missing, '--out', proposal]), /--project/);
  clean(runScript('design-md.mjs', ['extract', '--out', proposal]), /--project/);
  clean(runScript('design-md.mjs', ['extract', '--project', dir, '--out', proposal, '--date', '28/09/2026']), /YYYY-MM-DD/);
  const ops = path.join(dir, 'ops.json');
  fs.writeFileSync(ops, JSON.stringify([{ op: 'section-append', text: 'x' }]));
  clean(runScript('design-md.mjs', ['patch', '--file', file, '--ops', ops]), /heading/);
  fs.writeFileSync(ops, JSON.stringify([{ op: 'set', value: 1 }]));
  clean(runScript('design-md.mjs', ['patch', '--file', file, '--ops', ops]), /path/);
  fs.writeFileSync(ops, JSON.stringify(['x']));
  clean(runScript('design-md.mjs', ['patch', '--file', file, '--ops', ops]), /operación/);
  assert.equal(fs.readFileSync(file, 'utf8'), VALID);
});
