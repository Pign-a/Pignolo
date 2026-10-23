// Framework-default look rules (spec §5.4): THEME-01, THEME-02 and COLOR-11.
//
// THEME-01 and THEME-02 are project rules: they read the token sources and DESIGN.md, never
// one file. COLOR-11 has a project part (the primary of DESIGN.md and of the token sources)
// and a file part (gradients in CSS and Tailwind gradient utilities). Third-party values
// live in catalog/framework-defaults.json and catalog/shadcn-base-colors.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pass, fail, unverified } from './api.mjs';
import { parseColor, toOklch } from '../color.mjs';

const CATALOG_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'catalog');
const readCatalogJson = (name) => JSON.parse(fs.readFileSync(path.join(CATALOG_DIR, name), 'utf8'));

const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const near = (a, b) => Math.abs(a - b) <= 0.003;
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
const sameColor = (x, y) => x.ok && y.ok && ['r', 'g', 'b', 'a'].every((k) => near(x.rgba[k], y.rgba[k]));

// ---- token candidates ---------------------------------------------------------------------

// CSS variable name -> role (the aliases of DEFAULT_ALIASES: brand is primary; card and
// background are surface). `accent` is not primary here: in shadcn it is a gray surface.
const ROLE_OF_VAR = new Map([
  ['primary', 'primary'], ['brand', 'primary'],
  ['surface', 'surface'], ['background', 'surface'], ['bg', 'surface'], ['card', 'surface'],
  ['radius', 'radius'], ['border-radius', 'radius'], ['rounded', 'radius'], ['bs-border-radius', 'radius'],
  ['font', 'font'], ['font-sans', 'font'], ['font-family', 'font'], ['font-body', 'font'], ['font-base', 'font'],
]);
const V3_ROLE = [
  [['colors', 'primary'], 'primary'], [['colors', 'primary', 'DEFAULT'], 'primary'],
  [['colors', 'surface'], 'surface'], [['colors', 'background'], 'surface'],
  [['borderRadius', 'DEFAULT'], 'radius'], [['borderRadius', 'lg'], 'radius'],
  [['fontFamily', 'sans'], 'font'],
];
const samePath = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

function roleOfVar(name) {
  return ROLE_OF_VAR.get(name.replace(/^--/, '').replace(/^color-/, '')) ?? null;
}

// Light-theme candidates of the project ([{ role, name, value, file, line }]) and the map of
// light variables, for var() chains.
function collectTokens(tokens) {
  const found = [];
  const vars = {};
  for (const src of tokens.sources ?? []) {
    if (Array.isArray(src.blocks)) {
      for (const b of src.blocks) {
        if (b.theme === 'dark') continue;
        for (const v of b.vars) {
          vars[v.name] = v.value;
          const role = roleOfVar(v.name);
          if (role) found.push({ role, name: v.name, value: v.value, file: src.file, line: v.line });
        }
      }
    } else if (src.kind === 'tailwind-v3' && Array.isArray(src.leaves)) {
      for (const leaf of src.leaves) {
        const p = leaf.path[0] === 'extend' ? leaf.path.slice(1) : leaf.path;
        const hit = V3_ROLE.find(([q]) => samePath(q, p));
        if (hit && typeof leaf.value === 'string') found.push({ role: hit[1], name: p.join('.'), value: leaf.value, file: src.file, line: leaf.line });
      }
    }
  }
  return { found, vars };
}

// ---- DESIGN.md ----------------------------------------------------------------------------

// { name, value } of a semantic color in DESIGN.md (also through the read aliases), or null.
function designColor(design, target) {
  const colors = design && design.data && isMap(design.data.colors) ? design.data.colors : null;
  if (!colors) return null;
  if (typeof colors[target] === 'string') return { name: target, value: colors[target] };
  for (const [name, a] of design.aliases ?? []) {
    if (a.as === target && typeof colors[name] === 'string') return { name, value: colors[name] };
  }
  return null;
}

function extractedPaths(design) {
  const pig = design && design.data && isMap(design.data.pignolo) ? design.data.pignolo : null;
  return pig && Array.isArray(pig.extracted) ? pig.extracted.filter((x) => typeof x === 'string') : [];
}

// A role is declared when DESIGN.md defines it and does not list it as extracted ("extracted,
// not decided"). Both `primary` and `colors.primary` are read in the list.
function declared(design, role) {
  if (!design || !isMap(design.data)) return false;
  const data = design.data;
  const ex = extractedPaths(design);
  const isEx = (names, section) => ex.some((p) => p === section || names.some((n) => p === n || p === `${section}.${n}`));
  if (role === 'primary') return designColor(design, 'primary') !== null && !isEx(['primary'], 'colors');
  if (role === 'surface') {
    const c = designColor(design, 'surface') ?? designColor(design, 'background');
    return c !== null && !isEx(['surface', 'background'], 'colors');
  }
  if (role === 'radius') return isMap(data.rounded) && Object.keys(data.rounded).length > 0 && !ex.some((p) => p === 'rounded' || p.startsWith('rounded.'));
  if (role === 'font') {
    const has = isMap(data.typography) && Object.values(data.typography).some((x) => isMap(x) && x.fontFamily);
    return has && !ex.some((p) => p === 'typography' || p.startsWith('typography.'));
  }
  return false;
}

// ---- value comparison ---------------------------------------------------------------------

function toPx(value) {
  const m = /^\s*(-?(?:\d+\.?\d*|\.\d+))(rem|px)\s*$/i.exec(String(value));
  return m ? Number(m[1]) * (m[2].toLowerCase() === 'rem' ? 16 : 1) : null;
}
const firstFamily = (v) => String(v).split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase();

function equalValue(role, a, b, vars) {
  if (role === 'radius') {
    const x = toPx(a);
    const y = toPx(b);
    return x !== null && y !== null && near(x, y);
  }
  if (role === 'font') return firstFamily(a) !== '' && firstFamily(a) === firstFamily(b);
  return sameColor(parseColor(a, { vars }), parseColor(b));
}

// ---- THEME-01 -----------------------------------------------------------------------------

function theme01(pctx) {
  const defaults = readCatalogJson('framework-defaults.json');
  const { found, vars } = collectTokens(pctx.tokens ?? {});
  const out = [];
  const seen = new Set();
  for (const cand of found) {
    if (declared(pctx.design, cand.role)) continue;
    for (const d of defaults) {
      if (typeof d[cand.role] !== 'string' || !equalValue(cand.role, cand.value, d[cand.role], vars)) continue;
      const key = `${cand.role}/${d.framework}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(fail(key, {
        file: cand.file,
        line: cand.line,
        reason: `${cand.role} ${cand.value} is the default of ${d.framework} ${d.version} and DESIGN.md does not declare it`,
        measure: { framework: d.framework, version: d.version, token: cand.role, value: cand.value },
      }));
    }
  }
  for (const u of pctx.tokens?.unverified ?? []) {
    out.push(unverified(`token source not readable: ${u.reason}`, u.file && u.file !== '.' ? { file: u.file } : {}));
  }
  return out;
}

// ---- THEME-02 -----------------------------------------------------------------------------

const MIN_SHADCN_VARS = 5;
const MATCH_RATIO = 0.8;

const normalizeText = (v) => String(v).trim().replace(/\s+/g, ' ').toLowerCase();
const sameValue = (a, b) => normalizeText(a) === normalizeText(b) || sameColor(parseColor(a), parseColor(b));

function theme02(pctx) {
  const shadcn = (pctx.tokens?.sources ?? []).find((s) => s.kind === 'shadcn');
  if (!shadcn) {
    if (fs.existsSync(path.join(pctx.project, 'components.json'))) {
      return [unverified('components.json is present but its CSS file was not read as a token source')];
    }
    return [pass('not a shadcn project', { reason: 'not a shadcn project' })];
  }
  const roots = shadcn.blocks.filter((b) => b.theme !== 'dark' && /^(:root|html)$/.test(b.selector.trim()));
  const vars = new Map();
  for (const b of roots) for (const v of b.vars) vars.set(v.name.replace(/^--/, ''), v);
  const colorVars = [...vars].filter(([, v]) => parseColor(v.value).ok);
  if (colorVars.length < MIN_SHADCN_VARS) {
    return [unverified(`fewer than ${MIN_SHADCN_VARS} color variables in :root; nothing to compare`, { file: shadcn.file })];
  }
  const { sets } = readCatalogJson('shadcn-base-colors.json');
  let best = null;
  for (const [baseColor, set] of Object.entries(sets)) {
    const matched = colorVars.filter(([name, v]) => Object.prototype.hasOwnProperty.call(set, name) && sameValue(v.value, set[name])).length;
    if (!best || matched > best.matched) best = { baseColor, matched };
  }
  const total = colorVars.length;
  const measure = { baseColor: best.baseColor, matched: best.matched, total };
  if (best.matched / total >= MATCH_RATIO) {
    return [fail('base-color', {
      file: shadcn.file,
      line: roots[0] ? roots[0].line : undefined,
      reason: `${best.matched} of ${total} color variables of :root are the published ${best.baseColor} set of shadcn/ui`,
      measure,
    })];
  }
  return [pass('custom colors', { file: shadcn.file, measure })];
}

// ---- COLOR-11 -----------------------------------------------------------------------------

const HUE_MIN = 265;
const HUE_MAX = 310;
const BLUE_HUE_MIN = 200;
const CHROMA_MIN = 0.12;

function oklchOf(value, vars) {
  const p = parseColor(value, { vars });
  if (!p.ok) return { ok: false, reason: p.reason };
  const o = toOklch(p.rgba);
  return { ok: true, h: o.h, c: o.c };
}

const isViolet = (o) => o.c >= CHROMA_MIN && o.h >= HUE_MIN && o.h <= HUE_MAX;
const isBlue = (o) => o.c >= CHROMA_MIN && o.h >= BLUE_HUE_MIN && o.h < HUE_MIN;

function color11Project(pctx) {
  const out = [];
  const { found, vars } = collectTokens(pctx.tokens ?? {});
  const sources = [];
  const dc = designColor(pctx.design, 'primary');
  if (dc) sources.push({ value: dc.value, file: pctx.design.rel, vars: {} });
  for (const c of found) if (c.role === 'primary') sources.push({ value: c.value, file: c.file, line: c.line, vars });
  for (const s of sources) {
    const o = oklchOf(s.value, s.vars);
    const at = { file: s.file, ...(s.line !== undefined ? { line: s.line } : {}) };
    if (!o.ok) {
      out.push(unverified(`primary color not readable: ${o.reason}`, at));
    } else if (isViolet(o)) {
      out.push(fail('primary', {
        ...at,
        reason: `primary ${s.value} has OKLCH hue ${round(o.h, 1)} and chroma ${round(o.c, 3)}: the factory violet range`,
        measure: { h: round(o.h, 1), c: round(o.c, 3), value: s.value },
      }));
    } else {
      out.push(pass('primary', { ...at, measure: { h: round(o.h, 1), c: round(o.c, 3) } }));
    }
  }
  return out;
}

// Top-level comma split (parentheses balanced).
function splitArgs(s) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += ch;
  }
  parts.push(cur.trim());
  return parts;
}

// Bodies of the gradient functions inside a CSS value.
function gradientBodies(value) {
  const bodies = [];
  const re = /(?:repeating-)?(?:linear|radial|conic)-gradient\(/gi;
  let m;
  while ((m = re.exec(value))) {
    let depth = 1;
    let i = re.lastIndex;
    for (; i < value.length && depth > 0; i++) {
      if (value[i] === '(') depth++;
      else if (value[i] === ')') depth--;
    }
    bodies.push(value.slice(re.lastIndex, i - 1));
    re.lastIndex = i;
  }
  return bodies;
}

const NOT_A_COLOR = /^(transparent|currentcolor|inherit|initial|unset)$/i;
const CONFIG_ARG = /^(to\s|-?[\d.]+(deg|grad|rad|turn)\b|in\s|from\s|at\s|circle|ellipse|closest|farthest)/i;
const LENGTH = '-?(?:\\d+\\.?\\d*|\\.\\d+)(?:%|px|em|rem|vw|vh|deg|turn)?';
const POSITIONS = new RegExp(`(?:\\s+${LENGTH})+$`, 'i');
const BARE_LENGTH = new RegExp(`^${LENGTH}$`, 'i');

// Stops of one gradient: { o, text } with the OKLCH color, or { unresolved } when unreadable.
function gradientStops(body, vars) {
  const stops = [];
  for (const arg of splitArgs(body)) {
    if (arg === '' || CONFIG_ARG.test(arg) || BARE_LENGTH.test(arg)) continue;
    const text = parseColor(arg, { vars }).ok ? arg : arg.replace(POSITIONS, '');
    if (NOT_A_COLOR.test(text)) continue;
    const o = oklchOf(text, vars);
    stops.push(o.ok ? { o, text } : { unresolved: o.reason });
  }
  return stops;
}

// The first readable stop is blue and a later one is violet.
function blueToViolet(stops) {
  const readable = stops.filter((s) => s.o);
  if (!readable.length || !isBlue(readable[0].o)) return null;
  const to = readable.slice(1).find((s) => isViolet(s.o));
  return to ? { from: readable[0], to } : null;
}

const BLUE_FROM = /^from-(blue|sky|indigo)-/;
const VIOLET_TO = /^to-(violet|purple|fuchsia)-/;

function color11File(ctx) {
  const out = [];
  const { vars } = collectTokens(ctx.tokens ?? {});
  for (const d of ctx.css?.decls ?? []) {
    for (const body of gradientBodies(d.value ?? '')) {
      const stops = gradientStops(body, vars);
      const hit = blueToViolet(stops);
      const key = `${d.selector}|${d.property}|${String(d.value).replace(/\s+/g, ' ')}`;
      if (hit) {
        out.push(fail(key, {
          line: d.line,
          selector: d.selector,
          reason: `gradient from hue ${round(hit.from.o.h, 1)} to hue ${round(hit.to.o.h, 1)}: the factory blue to violet gradient`,
          measure: { from: round(hit.from.o.h, 1), to: round(hit.to.o.h, 1) },
        }));
      } else if (stops.some((s) => s.unresolved)) {
        out.push(unverified(`gradient color not readable: ${stops.find((s) => s.unresolved).unresolved}`, { line: d.line, selector: d.selector }));
      }
    }
  }
  for (const list of ctx.classLists ?? []) {
    const groups = new Map();
    for (const c of list.classes) {
      const variants = c.variants.join(':');
      const g = groups.get(variants) ?? { from: null, to: null };
      if (BLUE_FROM.test(c.base) && !g.from) g.from = c;
      if (VIOLET_TO.test(c.base) && !g.to) g.to = c;
      groups.set(variants, g);
    }
    for (const [variants, g] of groups) {
      if (!g.from || !g.to) continue;
      out.push(fail(`${variants ? `${variants}:` : ''}${g.from.base} ${g.to.base}`, {
        line: list.line,
        reason: `classes ${g.from.raw} and ${g.to.raw} make the factory blue to violet gradient`,
        measure: { from: g.from.base, to: g.to.base },
      }));
    }
  }
  return out;
}

export const RULES = [
  { id: 'THEME-01', checkProject: theme01 },
  { id: 'THEME-02', checkProject: theme02 },
  { id: 'COLOR-11', checkProject: color11Project, checkFile: color11File },
];
