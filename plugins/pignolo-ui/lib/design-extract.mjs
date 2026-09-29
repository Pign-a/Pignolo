// Bootstrap of DESIGN.md from code (spec §4.5 "arranque", A-18). First the configuration that
// already exists (@theme, :root/.dark, shadcn, literal tailwind.config). Only when there is
// none, the most frequent colors, fonts and radii are counted; those tokens go to
// pignolo.extracted ("extracted, not decided"). When the tokens live somewhere pignolo-ui
// cannot read (non-literal config, CSS-in-JS), nothing is proposed: a frequency guess would
// become a second source. The result is a proposal the user confirms as a diff.
//
// extractDesign(root, { date }) -> { mode: 'config'|'frequency'|'unverified'|'none', text, from,
//   extracted, darkDetected, unsupported, unverified }
import fs from 'node:fs';
import path from 'node:path';
import { readTokenSources, listCss, blankComments } from './token-sources.mjs';
import { parseColor, formatColor, detectFormat, toOklch } from './color.mjs';
import { yamlScalar, yamlKey } from './design-patch.mjs';
import { resolveAliases } from './design-doc.mjs';

const OFFICIAL_COLOR_FORMATS = new Set(['hex', 'rgb', 'hsl', 'hwb', 'oklch', 'oklab', 'lab', 'lch']);
const TAILWIND_NAMESPACES = /^(text|leading|tracking|shadow|inset-shadow|drop-shadow|ease|animate|breakpoint|container|blur|perspective|aspect|font-weight|default)-/;
const GENERIC_FONTS = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', 'inherit', 'initial', 'unset', 'revert']);
const DIMENSION = /^\d*\.?\d+(px|rem|em)$/;
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\([^)]*\)/g;
const MAX_FREQUENT_COLORS = 8;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function colorName(raw) {
  let n = raw.toLowerCase();
  if (n.startsWith('color-')) n = n.slice(6);
  if (n === 'foreground') return 'on-background';
  const fg = /^(.*)-foreground$/.exec(n);
  if (fg) return `on-${fg[1]}`;
  return n.replace(/[^a-z0-9-]/g, '-');
}

function firstFamily(value) {
  const first = String(value).split(',')[0].trim().replace(/^["']|["']$/g, '');
  return first && !GENERIC_FONTS.has(first.toLowerCase()) ? first : null;
}

function colorValue(value, vars) {
  const parsed = parseColor(value, { vars });
  if (!parsed.ok) return null;
  return OFFICIAL_COLOR_FORMATS.has(detectFormat(value)) && !parsed.viaVar ? value.trim() : formatColor(parsed.rgba, 'hex');
}

function newTokens() {
  return { colors: {}, typography: {}, rounded: {}, spacing: {}, dark: {}, cssVars: {}, from: [] };
}

function note(t, file) {
  if (!t.from.includes(file)) t.from.push(file);
}

function fromCssSources(sources, t) {
  const light = {};
  const dark = {};
  for (const s of sources) {
    for (const b of s.blocks || []) {
      for (const v of b.vars) {
        const target = b.theme === 'dark' ? dark : light;
        if (!(v.name in target)) target[v.name] = v.value;
      }
    }
  }
  for (const s of sources) {
    for (const b of (s.blocks || []).filter((x) => x.theme !== 'dark')) {
      for (const v of b.vars) {
        const raw = v.name.slice(2);
        const radius = /^radius(?:-(.+))?$/.exec(raw);
        const font = /^font-(.+)$/.exec(raw);
        const spacing = /^spacing(?:-(.+))?$/.exec(raw);
        if (radius) {
          const key = radius[1] || 'md';
          if (DIMENSION.test(v.value) && !(key in t.rounded)) {
            t.rounded[key] = v.value;
            t.cssVars[`rounded.${key}`] = v.name;
            note(t, s.file);
          }
        } else if (font && !/^weight-/.test(font[1])) {
          const family = firstFamily(v.value);
          const key = Object.keys(t.typography).length ? `font-${font[1]}` : 'body-md';
          if (family && !Object.values(t.typography).some((x) => x.fontFamily === family)) {
            t.typography[key] = { fontFamily: family };
            note(t, s.file);
          }
        } else if (spacing) {
          const key = spacing[1] || '1';
          if (DIMENSION.test(v.value) && !(key in t.spacing)) {
            t.spacing[key] = v.value;
            t.cssVars[`spacing.${key}`] = v.name;
            note(t, s.file);
          }
        } else if (!TAILWIND_NAMESPACES.test(raw)) {
          const name = colorName(raw);
          const value = colorValue(v.value, light);
          if (value && !(name in t.colors)) {
            t.colors[name] = value;
            t.cssVars[`colors.${name}`] = v.name;
            note(t, s.file);
          }
        }
      }
    }
  }
  for (const [varName, value] of Object.entries(dark)) {
    const name = colorName(varName.slice(2));
    if (!(name in t.colors) || name in t.dark) continue;
    const parsed = parseColor(value, { vars: { ...light, ...dark } });
    if (parsed.ok) t.dark[name] = formatColor(parsed.rgba, 'oklch');
  }
}

function fromTailwindV3(source, t) {
  for (const leaf of source.leaves) {
    const p = leaf.path[0] === 'extend' ? leaf.path.slice(1) : leaf.path;
    const [section, ...rest] = p;
    if (section === 'colors' && typeof leaf.value === 'string') {
      const parts = rest.map(String);
      let name;
      if (parts[parts.length - 1] === 'DEFAULT') name = parts.slice(0, -1).join('-');
      else if (parts[parts.length - 1] === 'foreground') name = `on-${parts.slice(0, -1).join('-')}`;
      else name = parts.join('-');
      const value = colorValue(leaf.value, {});
      if (name && value && !(name in t.colors)) {
        t.colors[colorName(name)] = value;
        note(t, source.file);
      }
    } else if (section === 'borderRadius' && typeof leaf.value === 'string' && DIMENSION.test(leaf.value)) {
      const key = rest[0] === 'DEFAULT' ? 'md' : String(rest[0]);
      if (!(key in t.rounded)) { t.rounded[key] = leaf.value; note(t, source.file); }
    } else if (section === 'fontFamily' && (rest.length === 1 || rest[1] === 0)) {
      const family = firstFamily(leaf.value);
      const key = Object.keys(t.typography).length ? `font-${rest[0]}` : 'body-md';
      if (family && !Object.values(t.typography).some((x) => x.fontFamily === family)) {
        t.typography[key] = { fontFamily: family };
        note(t, source.file);
      }
    } else if (section === 'spacing' && typeof leaf.value === 'string' && DIMENSION.test(leaf.value)) {
      const key = String(rest[0]);
      if (!(key in t.spacing)) { t.spacing[key] = leaf.value; note(t, source.file); }
    }
  }
}

// What pignolo-ui generates uses MD3 names (spec §4.2): a color read through a default alias
// (accent, text, bg...) is renamed to its MD3 name, keeping its place, its dark value and its
// cssVars link to the project variable.
function toMd3Names(t) {
  const aliases = resolveAliases(t.colors);
  if (!aliases.size) return [];
  const rename = (map, prefix = '') => Object.fromEntries(Object.entries(map).map(([k, v]) => {
    const name = prefix ? k.slice(prefix.length) : k;
    return [prefix && !k.startsWith(prefix) ? k : `${prefix}${aliases.has(name) ? aliases.get(name).as : name}`, v];
  }));
  t.colors = rename(t.colors);
  t.dark = rename(t.dark);
  t.cssVars = rename(t.cssVars, 'colors.');
  return [...aliases].map(([from, a]) => ({ from, to: a.as }));
}

function bump(map, key, order, file, t) {
  const cur = map.get(key);
  if (cur) cur.count++;
  else map.set(key, { count: 1, first: order });
  note(t, file);
}

function byCount(map) {
  return [...map.entries()].sort((a, b) => b[1].count - a[1].count || a[1].first - b[1].first).map(([k]) => k);
}

function fromFrequency(root, t) {
  const colors = new Map();
  const fonts = new Map();
  const radii = new Map();
  let order = 0;
  for (const file of listCss(root, 2000).files) {
    const text = blankComments(fs.readFileSync(path.join(root, file), 'utf8'));
    for (const m of text.matchAll(/([a-zA-Z-]+)\s*:\s*([^;{}]+)/g)) {
      const prop = m[1].toLowerCase();
      const value = m[2].trim();
      if (prop.startsWith('--')) continue;
      for (const c of value.matchAll(COLOR_LITERAL)) {
        const parsed = parseColor(c[0]);
        if (parsed.ok) bump(colors, formatColor(parsed.rgba, 'hex'), order++, file, t);
      }
      if (prop === 'font-family') {
        const family = firstFamily(value);
        if (family) bump(fonts, family, order++, file, t);
      }
      if (prop === 'border-radius' && DIMENSION.test(value)) bump(radii, value, order++, file, t);
    }
  }
  const top = byCount(colors).slice(0, MAX_FREQUENT_COLORS);
  const chroma = (hex) => toOklch(parseColor(hex).rgba).c;
  const lightness = (hex) => toOklch(parseColor(hex).rgba).l;
  const accents = top.filter((h) => chroma(h) >= 0.05);
  const neutrals = top.filter((h) => chroma(h) < 0.05).sort((a, b) => lightness(b) - lightness(a));
  accents.forEach((hex, i) => { t.colors[i === 0 ? 'primary' : `accent-${i + 1}`] = hex; });
  if (neutrals.length) t.colors.surface = neutrals[0];
  if (neutrals.length > 1) t.colors['on-surface'] = neutrals[neutrals.length - 1];
  neutrals.slice(1, -1).forEach((hex, i) => { t.colors[`neutral-${i + 1}`] = hex; });
  const font = byCount(fonts)[0];
  if (font) t.typography['body-md'] = { fontFamily: font };
  const toPx = (v) => Number.parseFloat(v) * (v.endsWith('px') ? 1 : 16);
  const r = byCount(radii).slice(0, 3).sort((a, b) => toPx(a) - toPx(b));
  const names = r.length === 1 ? ['md'] : r.length === 2 ? ['sm', 'lg'] : ['sm', 'md', 'lg'];
  r.forEach((v, i) => { t.rounded[names[i]] = v; });
}

function render(t, { name, date, extracted }) {
  const lines = ['---', 'version: alpha', `name: ${yamlScalar(name)}`];
  const intro = extracted.length
    ? `Extracted from the project code on ${date}; the tokens listed in pignolo.extracted are extracted, not decided.`
    : `Extracted from the project configuration on ${date}; review before accepting.`;
  lines.push(`description: ${yamlScalar(intro)}`);
  const section = (key, map, fn = (v) => [`  ${yamlKey(v[0])}: ${yamlScalar(v[1])}`]) => {
    if (!Object.keys(map).length) return;
    lines.push(`${key}:`);
    for (const entry of Object.entries(map)) lines.push(...fn(entry));
  };
  section('colors', t.colors);
  section('typography', t.typography, ([k, v]) => [`  ${yamlKey(k)}:`, `    fontFamily: ${yamlScalar(v.fontFamily)}`]);
  section('rounded', t.rounded);
  section('spacing', t.spacing);
  lines.push('pignolo:', '  schema: 1');
  if (Object.keys(t.dark).length) {
    lines.push('  themes:', '    dark:');
    for (const [k, v] of Object.entries(t.dark)) lines.push(`      ${yamlKey(k)}: ${yamlScalar(v)}`);
  }
  if (Object.keys(t.cssVars).length) {
    lines.push('  cssVars:');
    for (const [k, v] of Object.entries(t.cssVars)) lines.push(`    ${yamlKey(k)}: ${yamlScalar(v)}`);
  }
  if (extracted.length) {
    lines.push('  extracted:');
    for (const p of extracted) lines.push(`    - ${yamlScalar(p)}`);
  }
  lines.push('---', '', `# ${name}`, '', '## Overview', '', intro, 'Platform, register, hierarchy and reading order are still to be decided.', '', '## Decisions', '');
  return lines.join('\n');
}

function projectName(root) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    if (typeof pkg.name === 'string' && pkg.name.trim()) return pkg.name.trim();
  } catch {
    // no package.json
  }
  return path.basename(path.resolve(root));
}

export function extractDesign(root, { date = today() } = {}) {
  const found = readTokenSources(root);
  const base = { from: [], extracted: [], darkDetected: found.darkDetected, unsupported: found.unsupported, unverified: found.unverified };
  const t = newTokens();
  fromCssSources(found.sources.filter((s) => s.kind !== 'tailwind-v3'), t);
  for (const s of found.sources.filter((x) => x.kind === 'tailwind-v3')) fromTailwindV3(s, t);
  const renamed = toMd3Names(t);
  let mode = 'config';
  let extracted = [];
  if (!Object.keys(t.colors).length) {
    if (found.unverified.length || found.unsupported.length) return { ...base, mode: 'unverified', text: null };
    Object.assign(t, newTokens());
    fromFrequency(root, t);
    if (!Object.keys(t.colors).length) return { ...base, mode: 'none', text: null };
    mode = 'frequency';
    extracted = [
      ...Object.keys(t.colors).map((k) => `colors.${k}`),
      ...Object.keys(t.typography).map((k) => `typography.${k}`),
      ...Object.keys(t.rounded).map((k) => `rounded.${k}`),
    ];
  }
  const text = render(t, { name: projectName(root), date, extracted });
  return { ...base, mode, text, from: t.from, extracted, renamed };
}
