import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTempDir, writeTree } from './helpers.mjs';
import { readTokenSources, scanCss, parseTailwindConfig } from '../lib/token-sources.mjs';

const project = (tree) => writeTree(makeTempDir(), tree);
const varsOf = (block) => Object.fromEntries(block.vars.map((v) => [v.name, v.value]));

test('plain CSS variables in :root and .dark', () => {
  const r = readTokenSources(project({
    'src/styles.css': ':root {\n  --primary: #0b6bcb;\n  --radius: 8px;\n}\n\n.dark {\n  --primary: oklch(0.72 0.14 250);\n}\n.card { color: var(--primary); }\n',
  }));
  assert.deepEqual(r.unsupported, []);
  assert.deepEqual(r.unverified, []);
  assert.equal(r.darkDetected, true);
  assert.equal(r.sources.length, 1);
  const [src] = r.sources;
  assert.equal(src.kind, 'css-vars');
  assert.equal(src.file, 'src/styles.css');
  assert.deepEqual(src.blocks.map((b) => [b.selector, b.theme, b.line, b.endLine]), [[':root', 'light', 1, 4], ['.dark', 'dark', 6, 8]]);
  assert.deepEqual(varsOf(src.blocks[0]), { '--primary': '#0b6bcb', '--radius': '8px' });
  assert.deepEqual(src.blocks[0].vars.map((v) => v.line), [2, 3]);
});

test('Tailwind v4 @theme and @theme inline blocks', () => {
  const r = readTokenSources(project({
    'app.css': '@import "tailwindcss";\n@theme {\n  --color-primary: oklch(0.55 0.2 260);\n  --radius-md: 0.5rem;\n}\n@theme inline {\n  --color-surface: var(--surface);\n}\n',
  }));
  assert.equal(r.darkDetected, false);
  assert.deepEqual(r.sources.map((s) => [s.kind, s.file]), [['tailwind-v4', 'app.css']]);
  assert.deepEqual(r.sources[0].blocks.map((b) => b.selector), ['@theme', '@theme inline']);
  assert.deepEqual(varsOf(r.sources[0].blocks[0]), { '--color-primary': 'oklch(0.55 0.2 260)', '--radius-md': '0.5rem' });
});

test('shadcn: the CSS named by components.json, with bare HSL inside @layer base', () => {
  const r = readTokenSources(project({
    'components.json': JSON.stringify({ style: 'default', tailwind: { config: 'tailwind.config.js', css: 'app/globals.css', baseColor: 'slate', cssVariables: true } }),
    'app/globals.css': '@tailwind base;\n@layer base {\n  :root {\n    --background: 0 0% 100%;\n    --primary: 222.2 47.4% 11.2%;\n    --primary-foreground: 210 40% 98%;\n  }\n  .dark {\n    --background: 222.2 84% 4.9%;\n  }\n}\n',
  }));
  const shadcn = r.sources.find((s) => s.kind === 'shadcn');
  assert.ok(shadcn, JSON.stringify(r.sources.map((s) => s.kind)));
  assert.equal(shadcn.file, 'app/globals.css');
  assert.equal(shadcn.baseColor, 'slate');
  assert.deepEqual(shadcn.blocks.map((b) => [b.selector, b.theme, b.context]), [[':root', 'light', ['@layer base']], ['.dark', 'dark', ['@layer base']]]);
  assert.equal(varsOf(shadcn.blocks[0])['--primary-foreground'], '210 40% 98%');
});

test('prefers-color-scheme: dark and [data-theme] count as a dark theme', () => {
  const media = scanCss('@media (prefers-color-scheme: dark) {\n  :root { --bg: #000; }\n}\n');
  assert.equal(media.dark, true);
  assert.deepEqual(media.blocks.map((b) => [b.selector, b.theme]), [[':root', 'dark']]);
  const attr = scanCss(':root[data-theme="dark"] { --bg: #000 }\n[data-theme=light] { --bg: #fff }\n');
  assert.equal(attr.dark, true);
  assert.deepEqual(attr.blocks.map((b) => b.theme), ['dark', 'light']);
  assert.equal(scanCss('.darker { color: red }\n:root { --x: 1px }\n').dark, false);
});

test('braces and semicolons inside strings, comments and url() do not open blocks (Review Focus 4)', () => {
  const css = [
    '/* :root { --fake: red; } */',
    ':root {',
    '  --icon: url(data:image/svg+xml;utf8,<svg xmlns="x"></svg>);',
    '  --quote: "}";',
    "  --semi: ';';",
    '  /* --commented: blue; */',
    '  --last: #fff',
    '}',
    '.a::after { content: "{"; }',
    '',
  ].join('\n');
  const { blocks } = scanCss(css);
  assert.deepEqual(blocks.map((b) => b.selector), [':root']);
  assert.deepEqual(varsOf(blocks[0]), {
    '--icon': 'url(data:image/svg+xml;utf8,<svg xmlns="x"></svg>)',
    '--quote': '"}"',
    '--semi': "';'",
    '--last': '#fff',
  });
  assert.equal(blocks[0].vars.find((v) => v.name === '--last').line, 7);
});

test('Tailwind v3: a literal theme is read with the line of each value', () => {
  const text = [
    "const plugin = require('tailwindcss-animate');",
    'module.exports = {',
    "  content: ['./src/**/*.tsx'],",
    '  theme: {',
    '    extend: {',
    '      colors: {',
    "        primary: { DEFAULT: '#0b6bcb', foreground: \"#fff\" },",
    '      },',
    "      borderRadius: { lg: '12px' }, // trailing comment",
    '    },',
    '  },',
    '  plugins: [plugin, require("x")({ a: 1 })],',
    '};',
    '',
  ].join('\n');
  const r = parseTailwindConfig(text);
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.leaves.map((l) => [l.path.join('.'), l.value, l.line]), [
    ['extend.colors.primary.DEFAULT', '#0b6bcb', 7],
    ['extend.colors.primary.foreground', '#fff', 7],
    ['extend.borderRadius.lg', '12px', 9],
  ]);
  const src = readTokenSources(project({ 'tailwind.config.js': text })).sources;
  assert.deepEqual(src.map((s) => [s.kind, s.file, s.leaves.length]), [['tailwind-v3', 'tailwind.config.js', 3]]);
});

test('Tailwind v3: TypeScript config exported through a const', () => {
  const r = parseTailwindConfig("import type { Config } from 'tailwindcss';\nconst config: Config = {\n  theme: { colors: { primary: '#123456' } },\n};\nexport default config;\n");
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.leaves.map((l) => l.path.join('.')), ['colors.primary']);
});

test('Tailwind v3: anything that is not a literal theme is unverified, never partial (Review Focus 5)', () => {
  const cases = [
    "module.exports = { theme: { extend: { colors: { ...defaultTheme.colors, primary: '#fff' } } } };",
    'module.exports = { theme: ({ theme }) => ({ colors: {} }) };',
    "const colors = require('tailwindcss/colors');\nmodule.exports = { theme: { colors: { blue: colors.blue } } };",
    "module.exports = { theme: { colors: require('./tokens.js') } };",
    'module.exports = { theme: { colors: { primary: `${base}` } } };',
    "module.exports = makeConfig({ theme: { colors: { primary: '#fff' } } });",
    "module.exports = { ...base, theme: { colors: { primary: '#fff' } } };",
    'export default config;',
  ];
  for (const text of cases) {
    const r = parseTailwindConfig(text);
    assert.equal(r.ok, false, text);
    assert.equal(r.leaves, undefined, text);
    assert.equal(typeof r.reason, 'string');
  }
  const out = readTokenSources(project({ 'tailwind.config.ts': cases[0] }));
  assert.deepEqual(out.sources, []);
  assert.deepEqual(out.unverified.map((u) => [u.kind, u.file]), [['tailwind-v3', 'tailwind.config.ts']]);
});

test('CSS-in-JS, MUI and Chakra are declared unsupported', () => {
  const r = readTokenSources(project({
    'package.json': JSON.stringify({ dependencies: { '@mui/material': '^6', react: '^19' }, devDependencies: { 'styled-components': '^6' }, peerDependencies: { '@chakra-ui/react': '^3' } }),
  }));
  assert.deepEqual(r.unsupported.map((u) => u.kind).sort(), ['chakra', 'css-in-js', 'mui']);
  for (const u of r.unsupported) assert.equal(u.file, 'package.json');
});

test('node_modules, build output and approved mockups are never token sources', () => {
  const r = readTokenSources(project({
    'node_modules/lib/x.css': ':root { --x: red; }',
    'dist/app.css': ':root { --x: red; }',
    'design/approved/home/style.css': ':root { --x: red; }',
    'src/app.css': 'body { margin: 0 }',
  }));
  assert.deepEqual(r.sources, []);
  assert.equal(r.darkDetected, false);
});
