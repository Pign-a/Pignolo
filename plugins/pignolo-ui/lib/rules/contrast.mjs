// Contrast and drift rules (spec §4.5, §5.4): COLOR-03, COLOR-04, COLOR-12, DRIFT-01.
// COLOR-03, COLOR-04 and DRIFT-01 are project rules and need DESIGN.md; COLOR-12 is per file.
// Every ratio is measured with lib/color.mjs and reported as measure { ratio, required, fg, bg, theme }
// with the ratio rounded to 2 decimals.
import fs from 'node:fs';
import path from 'node:path';
import { pass, fail, unverified } from './api.mjs';
import { parseColor, contrastRatio } from '../color.mjs';
import { splitFrontmatter, isSemanticColor } from '../design-doc.mjs';
import { parseYaml, locate } from '../yaml-subset.mjs';

const TEXT = 4.5;
const LARGE = 3;
const NON_TEXT = 3;
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const round2 = (n) => Math.round(n * 100) / 100;

// ---- design model ------------------------------------------------------------------------

function refName(v) {
  const m = typeof v === 'string' ? /^\{colors\.([^{}]+)\}$/.exec(v.trim()) : null;
  return m ? m[1] : null;
}

// Colors of DESIGN.md by raw name and by canonical MD3 name (aliases resolved, spec §4.2).
function buildModel(design) {
  const data = design.data;
  const colors = isMap(data.colors) ? data.colors : {};
  const pig = isMap(data.pignolo) ? data.pignolo : {};
  const dark = isMap(pig.themes) && isMap(pig.themes.dark) ? pig.themes.dark : null;
  const byRaw = new Map();
  const canon = new Map();
  for (const name of Object.keys(colors)) {
    const alias = design.aliases && design.aliases.get(name);
    const c = isSemanticColor(name) ? name : alias ? alias.as : name;
    const entry = { raw: name, canon: c, aliasOf: c !== name ? c : null };
    byRaw.set(name, entry);
    if (!canon.has(c)) canon.set(c, entry);
  }
  const value = (name, theme, depth = 0) => {
    if (depth > 4) return null;
    let v = theme === 'dark' && dark && Object.prototype.hasOwnProperty.call(dark, name) ? dark[name] : colors[name];
    if (typeof v !== 'string') return null;
    const r = refName(v);
    if (r !== null) return Object.prototype.hasOwnProperty.call(colors, r) ? value(r, theme, depth + 1) : null;
    return v;
  };
  const themes = dark ? ['light', 'dark'] : ['light'];
  return { data, colors, pig, dark, byRaw, canon, value, themes };
}

const find = (model, name) => model.byRaw.get(name) ?? model.canon.get(name) ?? null;

// Color string of `spec` (a {colors.x} reference or a literal) in a theme.
function resolveColor(model, spec, theme) {
  if (typeof spec !== 'string') return null;
  const r = refName(spec);
  if (r === null) return spec;
  const e = find(model, r);
  return e ? model.value(e.raw, theme) : null;
}

const label = (e) => (e.aliasOf ? `${e.raw} (${e.canon})` : e.canon);

function designLines(design, project) {
  try {
    const text = fs.readFileSync(path.join(project, design.rel), 'utf8');
    const fm = splitFrontmatter(text);
    if (!fm.ok) return { line: () => undefined, body: null };
    const parsed = parseYaml(fm.yaml);
    return {
      line: (p) => {
        for (let i = p.length; i > 0; i--) {
          const loc = locate(parsed, p.slice(0, i));
          if (loc) return loc.line + fm.yamlLine - 1;
        }
        return undefined;
      },
      body: fm.body,
      bodyLine: fm.bodyLine,
    };
  } catch {
    return { line: () => undefined, body: null };
  }
}

// Shared gate for the three project rules.
function gate(pctx) {
  if (!pctx.design) return [unverified('no DESIGN.md')];
  if (!isMap(pctx.design.data)) return [unverified(`DESIGN.md could not be read (${pctx.design.status})`, { file: pctx.design.rel })];
  return null;
}

// ---- contrast ----------------------------------------------------------------------------

function ratioOf(fgStr, bgStr) {
  const fg = parseColor(fgStr);
  const bg = parseColor(bgStr);
  if (!fg.ok) return { error: `${fgStr}: ${fg.reason}` };
  if (!bg.ok) return { error: `${bgStr}: ${bg.reason}` };
  return { ratio: contrastRatio(fg.rgba, bg.rgba) };
}

// The raw ratio decides; only the number shown is rounded. A failing ratio never shows as the
// requirement (4.49995 -> 4.49, not 4.5).
function shownRatio(raw, required) {
  const r = round2(raw);
  return raw < required && r >= required ? Math.floor(raw * 100) / 100 : r;
}

// One measured pair -> finding. `names` is the text shown in the reason.
function pairFinding({ key, names, fgStr, bgStr, required, theme, file, line, extra = {} }) {
  const r = ratioOf(fgStr, bgStr);
  if (r.error) return unverified(`color not supported (${r.error})`, { file });
  const ratio = shownRatio(r.ratio, required);
  const measure = { ratio, required, fg: fgStr, bg: bgStr, theme };
  const base = { file, line, measure, ...extra };
  return r.ratio >= required
    ? pass(key, { ...base, reason: `${names} is ${ratio}:1 (${theme})` })
    : fail(key, { ...base, reason: `${names} is ${ratio}:1, needs ${required}:1 (${theme})` });
}

// Themes worth measuring for a pair: light always; dark when it changes something.
function themesFor(model, fgSpec, bgSpec) {
  const out = [];
  for (const theme of model.themes) {
    const fg = resolveColor(model, fgSpec, theme);
    const bg = resolveColor(model, bgSpec, theme);
    if (fg === null || bg === null) continue;
    if (theme === 'dark') {
      const lf = resolveColor(model, fgSpec, 'light');
      const lb = resolveColor(model, bgSpec, 'light');
      if (fg === lf && bg === lb) continue;
    }
    out.push({ theme, fg, bg });
  }
  return out;
}

const dimPx = (v) => {
  const m = /^(-?\d*\.?\d+)\s*(px|rem|em)?$/i.exec(String(v ?? '').trim());
  if (!m) return null;
  return Number(m[1]) * (m[2] && m[2].toLowerCase() !== 'px' ? 16 : 1);
};

function weightOf(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'bold') return 700;
  const n = Number(s);
  return Number.isFinite(n) ? n : 400;
}

function isLarge(data, typographyRef) {
  const m = typeof typographyRef === 'string' ? /^\{typography\.([^{}]+)\}$/.exec(typographyRef.trim()) : null;
  const t = m && isMap(data.typography) ? data.typography[m[1]] : null;
  if (!isMap(t)) return false;
  const size = dimPx(t.fontSize);
  if (size === null) return false;
  return size >= 24 || (size >= 18.66 && weightOf(t.fontWeight) >= 700);
}

// Implicit on-X / X pairs of the ruling (aliases resolved).
function tokenPairs(model) {
  const out = [];
  for (const [name, fgEntry] of model.canon) {
    if (!name.startsWith('on-')) continue;
    const bgEntry = model.canon.get(name.slice(3));
    if (bgEntry) out.push({ fg: fgEntry, bg: bgEntry });
  }
  return out;
}

// {colors.a} sobre|on|over {colors.b} in the prose, "(texto grande)" / "(large text)" at the end.
function prosePairs(body, bodyLine) {
  const out = [];
  const re = /\{colors\.([^{}]+)\}\s+(?:sobre|on|over)\s+\{colors\.([^{}]+)\}(\s*\((?:texto grande|large text)\))?/gi;
  let m;
  while ((m = re.exec(body))) {
    out.push({ fg: m[1], bg: m[2], large: Boolean(m[3]), line: bodyLine + (body.slice(0, m.index).match(/\n/g) ?? []).length });
  }
  return out;
}

// ---- CSS side (cssVars) ------------------------------------------------------------------

function cssMaps(tokens) {
  const light = new Map();
  const dark = new Map();
  for (const src of (tokens && tokens.sources) || []) {
    for (const b of src.blocks || []) {
      const target = b.theme === 'light' ? light : b.theme === 'dark' ? dark : null;
      if (!target) continue;
      for (const v of b.vars) target.set(v.name, { value: v.value, file: src.file, line: v.line });
    }
  }
  return { light, dark, plain: (theme) => Object.fromEntries([...light, ...(theme === 'dark' ? dark : [])].map(([k, v]) => [k, v.value])) };
}

const cssVarOf = (maps, name, theme) => (theme === 'dark' && maps.dark.has(name) ? maps.dark.get(name) : maps.light.get(name) ?? null);

function cssVarsOf(design) {
  const pig = isMap(design.data.pignolo) ? design.data.pignolo : {};
  return isMap(pig.cssVars) ? pig.cssVars : {};
}

function colorsCss(pctx, model, required) {
  const vars = cssVarsOf(pctx.design);
  if (Object.keys(vars).length === 0) return [unverified('no cssVars')];
  const maps = cssMaps(pctx.tokens);
  const out = [];
  for (const { fg, bg } of tokenPairs(model)) {
    const fv = vars[`colors.${fg.raw}`];
    const bv = vars[`colors.${bg.raw}`];
    if (!fv || !bv) continue;
    for (const theme of model.themes) {
      const f = cssVarOf(maps, fv, theme);
      const b = cssVarOf(maps, bv, theme);
      if (!f || !b) continue;
      if (theme === 'dark' && !maps.dark.has(fv) && !maps.dark.has(bv)) continue;
      const plain = maps.plain(theme);
      const fc = parseColor(f.value, { vars: plain });
      const bc = parseColor(b.value, { vars: plain });
      if (!fc.ok || !bc.ok) { out.push(unverified('CSS color not supported', { file: f.file, line: f.line })); continue; }
      out.push(pairFinding({
        key: `css:${fg.canon}/${bg.canon}/${theme}`,
        names: `${label(fg)} on ${label(bg)} in ${f.file}`,
        fgStr: f.value.includes('var(') ? colorText(fc, f.value) : f.value,
        bgStr: b.value.includes('var(') ? colorText(bc, b.value) : b.value,
        required,
        theme,
        file: f.file,
        line: f.line,
      }));
    }
  }
  return out;
}

// A var() value is measured through its resolved color; keep the written text in the measure.
const colorText = (_parsed, written) => written;

// ---- COLOR-03 ----------------------------------------------------------------------------

function checkColor03(pctx) {
  const stop = gate(pctx);
  if (stop) return stop;
  const { design } = pctx;
  const model = buildModel(design);
  const { line: lineOf, body, bodyLine } = designLines(design, pctx.project);
  const file = design.rel;
  const out = [];

  for (const { fg, bg } of tokenPairs(model)) {
    for (const t of themesFor(model, `{colors.${fg.raw}}`, `{colors.${bg.raw}}`)) {
      out.push(pairFinding({
        key: `${fg.canon}/${bg.canon}/${t.theme}`,
        names: `${label(fg)} on ${label(bg)}`,
        fgStr: t.fg,
        bgStr: t.bg,
        required: TEXT,
        theme: t.theme,
        file,
        line: lineOf(['colors', fg.raw]),
      }));
    }
  }

  const components = isMap(model.data.components) ? model.data.components : {};
  for (const [name, comp] of Object.entries(components)) {
    if (!isMap(comp) || comp.textColor === undefined || comp.backgroundColor === undefined) continue;
    const large = isLarge(model.data, comp.typography);
    for (const t of themesFor(model, comp.textColor, comp.backgroundColor)) {
      out.push(pairFinding({
        key: `components.${name}/${t.theme}`,
        names: `${name} textColor on backgroundColor${large ? ' (large text)' : ''}`,
        fgStr: t.fg,
        bgStr: t.bg,
        required: large ? LARGE : TEXT,
        theme: t.theme,
        file,
        line: lineOf(['components', name]),
      }));
    }
  }

  if (body !== null) {
    for (const p of prosePairs(body, bodyLine)) {
      const fe = find(model, p.fg);
      const be = find(model, p.bg);
      if (!fe || !be) continue;
      for (const t of themesFor(model, `{colors.${fe.raw}}`, `{colors.${be.raw}}`)) {
        out.push(pairFinding({
          key: `prose:${fe.canon}/${be.canon}/${t.theme}`,
          names: `${label(fe)} on ${label(be)} (prose)`,
          fgStr: t.fg,
          bgStr: t.bg,
          required: p.large ? LARGE : TEXT,
          theme: t.theme,
          file,
          line: p.line,
        }));
      }
    }
  }

  return [...out, ...colorsCss(pctx, model, TEXT)];
}

// ---- COLOR-04 ----------------------------------------------------------------------------

function checkColor04(pctx) {
  const stop = gate(pctx);
  if (stop) return stop;
  const { design } = pctx;
  const model = buildModel(design);
  const { line: lineOf } = designLines(design, pctx.project);
  const file = design.rel;
  const out = [];
  const focus = isMap(model.pig.focus) ? model.pig.focus : null;
  const borders = isMap(model.pig.borders) ? model.pig.borders : null;

  const pairs = [];
  if (focus && focus.color !== undefined) {
    pairs.push({ name: 'focus', fg: focus.color, bg: 'surface', path: ['pignolo', 'focus', 'color'] });
    pairs.push({ name: 'focus', fg: focus.color, bg: 'background', path: ['pignolo', 'focus', 'color'] });
  }
  pairs.push({ name: 'outline', fg: '{colors.outline}', bg: 'surface', path: ['colors', 'outline'] });
  if (borders && borders.strong !== undefined) pairs.push({ name: 'borders.strong', fg: borders.strong, bg: 'surface', path: ['pignolo', 'borders', 'strong'] });

  for (const p of pairs) {
    const bgEntry = model.canon.get(p.bg);
    if (!bgEntry) continue;
    for (const t of themesFor(model, p.fg, `{colors.${bgEntry.raw}}`)) {
      out.push(pairFinding({
        key: `${p.name}/${bgEntry.canon}/${t.theme}`,
        names: `${p.name} on ${label(bgEntry)}`,
        fgStr: t.fg,
        bgStr: t.bg,
        required: NON_TEXT,
        theme: t.theme,
        file,
        line: lineOf(p.path),
      }));
    }
  }
  if (!focus || focus.color === undefined) out.push(unverified('no pignolo.focus'));
  return out;
}

// ---- COLOR-12 ----------------------------------------------------------------------------

const DIRECTION = /^(to\s|in\s|from\s|at\s|circle|ellipse|closest|farthest|-?\.?\d+(\.\d+)?(deg|turn|rad|grad)\b)/i;

// Text inside the parentheses that open at `open` (index of "(").
function balanced(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return { inner: text.slice(open + 1, i), end: i };
  }
  return null;
}

function splitCommas(text) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += ch;
  }
  parts.push(cur.trim());
  return parts;
}

// Color of a gradient argument ("#7c3aed 20%", "rgb(1 2 3) 0 50%"), or null for a direction.
function stopColor(part) {
  if (part === '' || DIRECTION.test(part)) return null;
  if (part.startsWith('#')) return /^#[0-9a-f]+/i.exec(part)[0];
  const fn = /^[a-zA-Z-]+\(/.exec(part);
  if (fn) {
    const b = balanced(part, fn[0].length - 1);
    return b ? part.slice(0, b.end + 1) : part;
  }
  return part.split(/\s+/)[0];
}

function gradientStops(value) {
  const stops = [];
  const re = /-gradient\(/gi;
  let m;
  while ((m = re.exec(value))) {
    const open = m.index + m[0].length - 1;
    const b = balanced(value, open);
    if (!b) continue;
    for (const part of splitCommas(b.inner)) {
      const c = stopColor(part);
      if (c !== null) stops.push(c);
    }
    re.lastIndex = b.end;
  }
  return stops;
}

function backgrounds(design) {
  if (!design || !isMap(design.data)) return [];
  const model = buildModel(design);
  const e = model.canon.get('background') ?? model.canon.get('surface');
  if (!e) return [];
  return model.themes.map((theme) => ({ theme, bg: model.value(e.raw, theme) })).filter((x, i, all) => x.bg !== null && (x.theme === 'light' || x.bg !== all[0].bg));
}

// COLOR-03 findings for a gradient: the worst stop against the background, per theme.
function gradientContrast({ stops, ctx, file, line, key, selector }) {
  const bgs = backgrounds(ctx.design);
  if (bgs.length === 0) return [unverified('no known background for the gradient stops', { id: 'COLOR-03', line, selector, key })];
  const vars = {};
  for (const src of (ctx.tokens && ctx.tokens.sources) || []) {
    for (const b of src.blocks || []) if (b.theme === 'light') for (const v of b.vars) vars[v.name] = v.value;
  }
  const out = [];
  const parsed = stops.map((s) => ({ s, c: parseColor(s, { vars }) }));
  if (parsed.some((p) => !p.c.ok)) out.push(unverified('gradient stop color not supported', { id: 'COLOR-03', line, selector, key }));
  for (const { theme, bg } of bgs) {
    const bgc = parseColor(bg);
    if (!bgc.ok) continue;
    let worst = null;
    for (const p of parsed) {
      if (!p.c.ok) continue;
      const ratio = contrastRatio(p.c.rgba, bgc.rgba);
      if (worst === null || ratio < worst.ratio) worst = { ratio, s: p.s };
    }
    if (worst && worst.ratio < TEXT) {
      worst.ratio = shownRatio(worst.ratio, TEXT);
      out.push(fail(`${key}/${theme}`, {
        id: 'COLOR-03',
        severity: 'bloquea',
        line,
        selector,
        reason: `gradient text stop ${worst.s} on ${bg} is ${worst.ratio}:1, needs ${TEXT}:1 (${theme})`,
        measure: { ratio: worst.ratio, required: TEXT, fg: worst.s, bg, theme },
      }));
    }
  }
  return out;
}

const UTILITY_GRADIENT = /^bg-(gradient-to-|linear|radial|conic)/;

function checkColor12(ctx) {
  const out = [];
  for (const rule of (ctx.css && ctx.css.rules) || []) {
    const clip = rule.decls.find((d) => (d.property === 'background-clip' || d.property === '-webkit-background-clip') && /\btext\b/i.test(d.value));
    const grad = rule.decls.find((d) => (d.property === 'background' || d.property === 'background-image') && /gradient\(/i.test(d.value));
    if (!clip || !grad) continue;
    const key = `${rule.selector}|background-clip|text`;
    out.push(fail(key, { line: grad.line, selector: rule.selector, reason: `text with a gradient background (${rule.selector})` }));
    out.push(...gradientContrast({ stops: gradientStops(grad.value), ctx, line: grad.line, key, selector: rule.selector }));
  }

  for (const list of ctx.classLists || []) {
    const clip = list.classes.find((c) => c.base === 'bg-clip-text');
    const grad = list.classes.find((c) => UTILITY_GRADIENT.test(c.base));
    if (!clip || !grad) continue;
    const tag = list.element ? list.element.tag : 'element';
    const key = `${tag}|${grad.raw}|${clip.raw}`;
    const line = clip.line ?? list.line;
    out.push(fail(key, { line, reason: `text with a gradient background (${grad.raw} with bg-clip-text)` }));
    const stopClasses = list.classes.filter((c) => /^(from|via|to)(-|$)/.test(c.base));
    const literal = stopClasses.filter((c) => c.arbitrary !== null && parseColor(c.arbitrary).ok);
    if (stopClasses.length === 0 || literal.length !== stopClasses.length) {
      out.push(unverified('gradient stops come from the Tailwind palette or theme (not resolved)', { id: 'COLOR-03', line, key }));
    } else {
      out.push(...gradientContrast({ stops: literal.map((c) => c.arbitrary), ctx, line, key, selector: tag }));
    }
  }
  return out;
}

// ---- DRIFT-01 ----------------------------------------------------------------------------

const norm = (v) => String(v).trim().toLowerCase().replace(/\s+/g, ' ');

function substitute(value, vars) {
  let s = value;
  for (let i = 0; i < 6 && /var\(/i.test(s); i++) {
    s = s.replace(/var\(\s*(--[\w-]+)\s*(?:,[^()]*)?\)/gi, (m, name) => (Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : m));
  }
  return /var\(/i.test(s) ? null : s;
}

// -> true | false | null (cannot compare)
function sameValue(designStr, cssStr, plain) {
  const dc = parseColor(designStr);
  if (dc.ok) {
    const cc = parseColor(cssStr, { vars: plain });
    if (!cc.ok) return null;
    const q = (c) => [c.r, c.g, c.b].map((x) => Math.round(x * 255)).concat(Math.round(c.a * 255));
    const a = q(dc.rgba);
    const b = q(cc.rgba);
    return a.every((x, i) => x === b[i]);
  }
  const css = substitute(cssStr, plain);
  if (css === null) return null;
  const d1 = dimPx(designStr);
  const d2 = dimPx(css);
  if (d1 !== null && d2 !== null) return Math.abs(d1 - d2) < 0.01;
  return norm(designStr) === norm(css);
}

function designValue(model, tokenPath, theme) {
  const parts = tokenPath.split('.');
  if (parts[0] === 'colors' && parts.length === 2) return model.value(parts[1], theme);
  let cur = model.data;
  for (const p of parts) {
    if (!isMap(cur) || !Object.prototype.hasOwnProperty.call(cur, p)) return null;
    cur = cur[p];
  }
  return typeof cur === 'string' || typeof cur === 'number' ? String(cur) : null;
}

function checkDrift(pctx) {
  const stop = gate(pctx);
  if (stop) return stop;
  const { design } = pctx;
  const vars = cssVarsOf(design);
  const entries = Object.entries(vars);
  if (entries.length === 0) return [unverified('no cssVars')];
  const model = buildModel(design);
  const { line: lineOf } = designLines(design, pctx.project);
  const maps = cssMaps(pctx.tokens);
  const out = [];

  for (const [tokenPath, cssName] of entries) {
    const inLight = maps.light.has(cssName);
    if (!inLight && !maps.dark.has(cssName)) {
      out.push(fail(`${tokenPath}/${cssName}/missing`, {
        file: design.rel,
        line: lineOf(['pignolo', 'cssVars', tokenPath]),
        reason: `${cssName} (${tokenPath}) is not defined in the token sources`,
        measure: { design: designValue(model, tokenPath, 'light'), css: null, theme: 'light' },
      }));
      continue;
    }
    const darkDeclared = tokenPath.startsWith('colors.') && model.dark !== null && Object.prototype.hasOwnProperty.call(model.dark, tokenPath.slice(7));
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark' && !darkDeclared && !maps.dark.has(cssName)) continue;
      const dv = designValue(model, tokenPath, theme);
      const cv = cssVarOf(maps, cssName, theme);
      if (dv === null || cv === null) continue;
      const same = sameValue(dv, cv.value, maps.plain(theme));
      const key = `${tokenPath}/${cssName}/${theme}`;
      const at = { file: cv.file, line: cv.line };
      if (same === null) out.push(unverified('value cannot be compared', at));
      else if (same) out.push(pass(key, { ...at, reason: `${tokenPath} matches ${cssName} (${theme})` }));
      else out.push(fail(key, { ...at, reason: `${tokenPath} is ${dv} in DESIGN.md and ${cv.value} in ${cssName} (${theme})`, measure: { design: dv, css: cv.value, theme } }));
    }
  }
  return out;
}

export const RULES = [
  { id: 'COLOR-03', checkProject: checkColor03 },
  { id: 'COLOR-04', checkProject: checkColor04 },
  { id: 'COLOR-12', checkFile: checkColor12 },
  { id: 'DRIFT-01', checkProject: checkDrift },
];
