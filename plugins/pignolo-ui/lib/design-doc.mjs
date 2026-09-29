// DESIGN.md: frontmatter split and own validator (spec §4.2, §4.3, §5.4 "Validador").
// Google Labs format pinned to 0.4.0 plus the closed `pignolo:` schema, version 1.
//
// splitFrontmatter(text) -> { ok, yaml, yamlLine, body, bodyLine, eol } | { ok: false, reason }
// validateDesign(text, { catalog, darkInCss }) ->
//   { status: 'valid'|'invalid'|'unverified', reason, reject, findings, data }
// Finding: { id, severity, path, line, message, rejects }. `rejects: true` means the file
// must not be written as is (closed schema, intentional on the floor, token-like values).
// DESIGN-ALIAS findings are `detalle`: they say which alias was read and never make the
// status invalid.
import { parseYaml, locate } from './yaml-subset.mjs';
import { parseColor } from './color.mjs';

export const MD3_FAMILIES = new Set(['primary', 'secondary', 'tertiary', 'error', 'surface', 'background', 'outline']);
const REQUIRED_SEMANTIC = ['primary', 'on-primary', 'surface', 'on-surface'];
const CONTROL_PREFIXES = ['button', 'input', 'select', 'checkbox', 'radio', 'switch', 'link', 'tab', 'chip', 'toggle', 'textarea'];
const STATE_SUFFIX = /-(hover|pressed|focus|disabled|active|selected|dragged)$/;
const TYPOGRAPHY_PROPS = new Set(['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'fontFeature', 'fontVariation']);
const COMPONENT_PROPS = new Set(['backgroundColor', 'textColor', 'typography', 'rounded', 'padding', 'size', 'height', 'width']);
// Same heuristics as token-like-ignored in @google/design.md 0.4.0.
const TOKEN_LIKE_KEYS = new Set(['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing']);
const HEX_RE = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const DIMENSION_RE = /^-?\d*\.?\d+[a-zA-Z%]+$/;
const TOKEN_SECTIONS = ['colors', 'typography', 'rounded', 'spacing', 'components'];
const HIERARCHY_HEADING = /^#{2,6}\s+.*(hierarch|reading order|jerarqu|orden de lectura)/im;

// Official vocabulary: on-/inverse- prefixes and -container/-fixed/-dim... suffixes.
export function colorFamily(name) {
  return name.replace(/^on-/, '').replace(/^inverse-/, '').replace(/^on-/, '')
    .replace(/-container.*$/, '').replace(/-fixed.*$/, '').replace(/-(dim|bright|tint|variant)$/, '');
}

export const isSemanticColor = (name) => MD3_FAMILIES.has(colorFamily(name));

// Reading a user's DESIGN.md does not demand literal MD3 names (spec §4.2): these aliases,
// completed or overridden by pignolo.aliases, map common project names to MD3. What
// pignolo-ui generates keeps MD3 names. The README documents this map (a test checks it).
export const DEFAULT_ALIASES = Object.freeze({
  accent: 'primary',
  brand: 'primary',
  'on-accent': 'on-primary',
  'accent-foreground': 'on-primary',
  'primary-foreground': 'on-primary',
  text: 'on-surface',
  label: 'on-surface',
  foreground: 'on-surface',
  fg: 'on-surface',
  bg: 'background',
  card: 'surface',
  'card-foreground': 'on-surface',
  'surface-foreground': 'on-surface',
  'secondary-foreground': 'on-secondary',
  'muted-foreground': 'on-surface-variant',
  'text-muted': 'on-surface-variant',
  border: 'outline-variant',
  danger: 'error',
  destructive: 'error',
  'on-danger': 'on-error',
  'destructive-foreground': 'on-error',
});

// The same table serves the extraction (design-extract renames with resolveAliases): one map,
// so a name read here is renamed there the same way.
// name -> { as, source } for the colors read through an alias. An alias is taken only when
// its MD3 target is not defined itself and no earlier name took it.
export function resolveAliases(colors, custom) {
  const map = { ...DEFAULT_ALIASES, ...(custom !== null && typeof custom === 'object' && !Array.isArray(custom) ? custom : {}) };
  const out = new Map();
  const taken = new Set();
  for (const name of Object.keys(colors)) {
    if (isSemanticColor(name) || !Object.prototype.hasOwnProperty.call(map, name)) continue;
    const target = map[name];
    if (typeof target !== 'string' || !isSemanticColor(target) || Object.prototype.hasOwnProperty.call(colors, target) || taken.has(target)) continue;
    taken.add(target);
    const source = custom && Object.prototype.hasOwnProperty.call(custom, name) ? 'pignolo.aliases' : 'default alias';
    out.set(name, { as: target, source });
  }
  return out;
}

export function splitFrontmatter(text) {
  const src = String(text).replace(/^\uFEFF/, '');
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const lines = src.split('\n');
  if (lines[0].replace(/\r$/, '').trimEnd() !== '---') return { ok: false, reason: 'no YAML frontmatter (first line must be ---)' };
  const end = lines.findIndex((l, i) => i > 0 && l.replace(/\r$/, '').trimEnd() === '---');
  if (end < 0) return { ok: false, reason: 'frontmatter is not closed with ---' };
  return {
    ok: true,
    yaml: lines.slice(1, end).join('\n'),
    yamlLine: 2,
    body: lines.slice(end + 1).join('\n'),
    bodyLine: end + 2,
    eol,
  };
}

const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const has = (obj, k) => isMap(obj) && Object.prototype.hasOwnProperty.call(obj, k);

// ---- schema nodes for pignolo: -----------------------------------------------------------

const V = (check) => ({ kind: 'value', check });
const M = (keys, required = []) => ({ kind: 'map', keys, required });
const FREE = (keyCheck, value) => ({ kind: 'free', keyCheck, value });
const L = (item) => ({ kind: 'list', item });

const num = (min, max) => (v) => (typeof v === 'number' && Number.isFinite(v) && (min === undefined || v >= min) && (max === undefined || v <= max)
  ? null : `must be a number${min !== undefined ? ` >= ${min}` : ''}${max !== undefined ? ` and <= ${max}` : ''}`);
const oneOf = (...vals) => (v) => (vals.includes(v) ? null : `must be one of: ${vals.join(', ')}`);
const bool = (v) => (typeof v === 'boolean' ? null : 'must be true or false');
const str = (v) => (typeof v === 'string' && v.trim() ? null : 'must be a non-empty string');
const colorRef = (v, ctx) => (typeof v === 'string' && /^\{colors\.[^{}]+\}$/.test(v) && has(ctx.data.colors, v.slice(8, -1))
  ? null : 'must reference an existing color as {colors.name}');
const darkColor = (v) => (typeof v === 'string' && /^(oklch|rgba?)\(/i.test(v.trim()) && parseColor(v).ok ? null : 'must be an OKLCH or rgb() color');
const shadow = (v) => (v === 'none' || (typeof v === 'string' && v.trim() && !/[;{}]/.test(v)) ? null : 'must be a full box-shadow string or "none"');
const bezier = (v) => (typeof v === 'string' && /^cubic-bezier\(\s*-?[\d.]+\s*(,\s*-?[\d.]+\s*){3}\)$/.test(v) ? null : 'must be cubic-bezier(x1, y1, x2, y2)');
const tokenPath = (v, ctx) => (typeof v === 'string' && ctx.hasToken(v) ? null : 'must name an existing token (colors.x, rounded.x...)');
const cssVarName = (v) => (typeof v === 'string' && /^--[A-Za-z0-9_-]+$/.test(v) ? null : 'must be a CSS variable name (--x)');
const mapOrNull = (v) => (v === null || isMap(v) ? null : 'must be a map or null');
const anyList = (v) => (Array.isArray(v) ? null : 'must be a list');
const patternValue = (v) => {
  if (typeof v !== 'string' || !v.trim()) return 'must be a non-empty string';
  if (/^#[0-9a-fA-F]{3,8}\b/.test(v) || /^-?\d*\.?\d+[a-zA-Z%]+(\s|$)/.test(v)) return 'must not start with a hex color or a dimension (write a regex or OKLCH)';
  return null;
};

const shadowLevels = Object.fromEntries([0, 1, 2, 3, 4, 5].map((n) => [`level${n}`, V(shadow)]));
const STATES = ['hoverOpacity', 'focusOpacity', 'pressedOpacity', 'draggedOpacity', 'disabledContentOpacity', 'disabledContainerOpacity'];

export const PIGNOLO_SCHEMA = M({
  schema: V((v) => (v === 1 ? null : 'must be 1')),
  platform: V(oneOf('desktop', 'mobile', 'both')),
  register: V(oneOf('product', 'brand')),
  themes: M({ dark: FREE((k, ctx) => (has(ctx.data.colors, k) ? null : 'must be a color defined in colors'), V(darkColor)) }),
  elevation: M(shadowLevels),
  states: M(Object.fromEntries(STATES.map((k) => [k, V(num(0, 1))]))),
  focus: M({ color: V(colorRef), widthPx: V(num(0)), offsetPx: V(num()) }),
  motion: M({
    durationMs: M(Object.fromEntries(['fast', 'base', 'slow', 'slower'].map((k) => [k, V(num(0))]))),
    easing: M(Object.fromEntries(['standard', 'decelerate', 'accelerate'].map((k) => [k, V(bezier)]))),
    reducedMotion: V(oneOf('fade-or-none', 'none')),
  }),
  borders: M({ subtle: V(colorRef), strong: V(colorRef), widthPx: V(num(0)) }),
  targets: M({ minPx: V(num(0)), recommendedPx: V(num(0)) }),
  aliases: FREE((k) => (isSemanticColor(k) ? 'is already an MD3 semantic name' : null),
    V((v) => (typeof v === 'string' && isSemanticColor(v) ? null : 'must be an MD3 semantic color name (primary, on-surface...)'))),
  cssVars: FREE((k, ctx) => (ctx.hasToken(k) ? null : 'must name an existing token (colors.x, rounded.x...)'), V(cssVarName)),
  extracted: L(V(tokenPath)),
  intentional: L(M({ id: V(str), why: V(str) }, ['id', 'why'])),
  rejections: L(M({
    id: V((v) => (typeof v === 'string' && /^R-\d{3}$/.test(v) ? null : 'must be R-nnn')),
    date: V((v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? null : 'must be a YYYY-MM-DD date')),
    rule: V(str),
    pattern: M({ kind: V(oneOf('selector', 'property', 'text')), value: V(patternValue) }, ['kind', 'value']),
    note: V(str),
  }, ['id', 'date', 'note'])),
  web: M({
    public: V(bool),
    indexable: V(bool),
    locales: L(V(str)),
    aiCrawlers: V(mapOrNull),
    llmsTxt: V(bool),
    structuredData: V(anyList),
    conversion: V(mapOrNull),
  }),
}, ['schema']);

function walkSchema(node, value, p, ctx) {
  if (node.kind === 'value') {
    const err = node.check(value, ctx);
    if (err) ctx.add('DESIGN-SCHEMA', p, `${p.join('.')} ${err}`, { rejects: true });
    return;
  }
  if (node.kind === 'list') {
    if (!Array.isArray(value)) { ctx.add('DESIGN-SCHEMA', p, `${p.join('.')} must be a list`, { rejects: true }); return; }
    value.forEach((item, i) => walkSchema(node.item, item, [...p, i], ctx));
    return;
  }
  if (!isMap(value)) { ctx.add('DESIGN-SCHEMA', p, `${p.join('.')} must be a map`, { rejects: true }); return; }
  if (node.kind === 'free') {
    for (const [k, v] of Object.entries(value)) {
      const err = node.keyCheck(k, ctx);
      if (err) ctx.add('DESIGN-SCHEMA', [...p, k], `${[...p, k].join('.')}: key ${err}`, { rejects: true });
      else walkSchema(node.value, v, [...p, k], ctx);
    }
    return;
  }
  for (const [k, v] of Object.entries(value)) {
    if (!has(node.keys, k)) ctx.add('DESIGN-SCHEMA', [...p, k], `${[...p, k].join('.')} is not a key of the pignolo: schema v1`, { rejects: true });
    else walkSchema(node.keys[k], v, [...p, k], ctx);
  }
  for (const k of node.required) {
    if (!has(value, k)) ctx.add('DESIGN-SCHEMA', [...p, k], `${[...p, k].join('.')} is required`, { rejects: true });
  }
}

function walkTokenLike(value, p, ctx) {
  if (Array.isArray(value)) { value.forEach((v, i) => walkTokenLike(v, [...p, i], ctx)); return; }
  if (isMap(value)) {
    for (const [k, v] of Object.entries(value)) {
      if (TOKEN_LIKE_KEYS.has(k)) ctx.add('DESIGN-TOKEN-LIKE', [...p, k], `${[...p, k].join('.')}: typography keys inside pignolo: trigger token-like-ignored`, { rejects: true });
      walkTokenLike(v, [...p, k], ctx);
    }
    return;
  }
  if (typeof value === 'string' && value.length <= 64 && (HEX_RE.test(value) || DIMENSION_RE.test(value))) {
    ctx.add('DESIGN-TOKEN-LIKE', p, `${p.join('.')}: "${value}" is a hex color or a dimension; the official linter warns token-like-ignored (use a number with the unit in the key, OKLCH or {colors.x})`, { rejects: true });
  }
}

function omittedSections(data) {
  const list = Array.isArray(data.omitted) ? data.omitted : [];
  return new Set(list.map((o) => (typeof o === 'string' ? o : isMap(o) ? o.section : null)).filter(Boolean).map((s) => String(s).toLowerCase()));
}

export function validateDesign(text, { catalog, darkInCss = false } = {}) {
  const findings = [];
  const fm = splitFrontmatter(text);
  if (!fm.ok) {
    findings.push({ id: 'DESIGN-FRONTMATTER', severity: 'alto', path: '', line: 1, message: fm.reason, rejects: true });
    return { status: 'invalid', reason: null, reject: true, findings, data: null };
  }
  const parsed = parseYaml(fm.yaml);
  if (!parsed.supported) {
    return { status: 'unverified', reason: `YAML no soportado: no validado (${parsed.reason}, line ${parsed.line + fm.yamlLine - 1})`, reject: false, findings, data: null };
  }
  const data = isMap(parsed.value) ? parsed.value : {};
  const lineFor = (p) => {
    for (let i = p.length; i > 0; i--) {
      const loc = locate(parsed, p.slice(0, i));
      if (loc) return loc.line + fm.yamlLine - 1;
    }
    return fm.yamlLine;
  };
  const hasToken = (tp) => {
    const dot = tp.indexOf('.');
    return dot > 0 && TOKEN_SECTIONS.includes(tp.slice(0, dot)) && has(data[tp.slice(0, dot)], tp.slice(dot + 1));
  };
  const ctx = {
    data,
    hasToken,
    add(id, p, message, { severity = 'alto', rejects = false, line } = {}) {
      findings.push({ id, severity, path: p.join('.'), line: line ?? lineFor(p), message, rejects });
    },
  };

  for (const e of parsed.errors) {
    findings.push({ id: 'DESIGN-YAML', severity: 'alto', path: e.path.join('.'), line: e.line + fm.yamlLine - 1, message: e.message, rejects: true });
  }

  // official sections: shapes the linter and the checker rely on
  if (data.colors !== undefined && !isMap(data.colors)) ctx.add('DESIGN-FORMAT', ['colors'], 'colors must be a map');
  for (const [name, v] of Object.entries(isMap(data.colors) ? data.colors : {})) {
    if (v === null) ctx.add('DESIGN-FORMAT', ['colors', name], `colors.${name} is empty: an unquoted # starts a YAML comment, quote the color`);
    else if (typeof v !== 'string') ctx.add('DESIGN-FORMAT', ['colors', name], `colors.${name} must be a quoted color string`);
  }
  for (const [name, v] of Object.entries(isMap(data.typography) ? data.typography : {})) {
    if (!isMap(v)) { ctx.add('DESIGN-FORMAT', ['typography', name], `typography.${name} must be a map`); continue; }
    for (const k of Object.keys(v)) if (!TYPOGRAPHY_PROPS.has(k)) ctx.add('DESIGN-FORMAT', ['typography', name, k], `typography.${name}.${k} is not a 0.4.0 property (extensions go under pignolo:)`, { severity: 'medio' });
  }
  for (const [name, v] of Object.entries(isMap(data.components) ? data.components : {})) {
    if (!isMap(v)) { ctx.add('DESIGN-FORMAT', ['components', name], `components.${name} must be a map`); continue; }
    for (const k of Object.keys(v)) if (!COMPONENT_PROPS.has(k)) ctx.add('DESIGN-FORMAT', ['components', name, k], `components.${name}.${k} is not a 0.4.0 sub-token (extensions go under pignolo:)`, { severity: 'medio' });
  }

  // references in the official sections
  const walkRefs = (v, p) => {
    if (isMap(v)) { for (const [k, x] of Object.entries(v)) walkRefs(x, [...p, k]); return; }
    if (typeof v !== 'string') return;
    const m = /^\{([^{}]+)\}$/.exec(v.trim());
    if (m && !hasToken(m[1])) ctx.add('DESIGN-REF', p, `${p.join('.')} references ${v}, which does not exist`);
  };
  for (const section of TOKEN_SECTIONS) walkRefs(data[section], [section]);

  // pignolo: closed schema, intentional, token-like
  const pig = data.pignolo;
  if (pig !== undefined) {
    walkSchema(PIGNOLO_SCHEMA, pig, ['pignolo'], ctx);
    const rules = new Map(((catalog && catalog.rules) || []).map((r) => [r.id, r]));
    (Array.isArray(pig && pig.intentional) ? pig.intentional : []).forEach((item, i) => {
      if (!isMap(item) || typeof item.id !== 'string') return;
      const rule = rules.get(item.id);
      if (!rule) ctx.add('DESIGN-INTENTIONAL', ['pignolo', 'intentional', i, 'id'], `${item.id} is not a rule of the catalog`, { rejects: true });
      else if (!rule.acceptsIntentional) ctx.add('DESIGN-INTENTIONAL', ['pignolo', 'intentional', i, 'id'], `${item.id} does not accept intentional (floor or fixed rule)`, { rejects: true });
    });
    walkTokenLike(pig, ['pignolo'], ctx);
  }

  // semantic aliases (spec §4.2): informative, the finding names the alias it took
  const colors = isMap(data.colors) ? data.colors : {};
  const aliases = resolveAliases(colors, isMap(pig) ? pig.aliases : undefined);
  for (const [name, a] of aliases) ctx.add('DESIGN-ALIAS', ['colors', name], `colors.${name} read as ${a.as} (${a.source})`, { severity: 'detalle' });
  const semanticOf = (name) => (isSemanticColor(name) ? name : aliases.has(name) ? aliases.get(name).as : null);

  // mandatory content (spec §4.2): alto, proposed as a diff, never rejected
  const content = (p, message) => ctx.add('DESIGN-CONTENT', p, message);
  const omitted = omittedSections(data);
  if (!omitted.has('colors')) {
    const present = new Set(Object.keys(colors).map(semanticOf));
    for (const name of REQUIRED_SEMANTIC) if (!present.has(name)) content(['colors', name], `semantic color ${name} is missing`);
    if (!Object.keys(colors).some((n) => semanticOf(n) === null)) content(['colors'], 'no primitive color tokens (for example blue-600) under the semantic ones');
  }
  for (const section of ['typography', 'rounded', 'spacing']) {
    if (!omitted.has(section) && !(isMap(data[section]) && Object.keys(data[section]).length)) content([section], `${section} scale is missing`);
  }
  const components = isMap(data.components) ? data.components : {};
  for (const name of Object.keys(components)) {
    const isControl = CONTROL_PREFIXES.some((pre) => name === pre || name.startsWith(`${pre}-`));
    if (isControl && !STATE_SUFFIX.test(name) && !has(components, `${name}-hover`)) content(['components', `${name}-hover`], `control ${name} has no hover state variant`);
  }
  if (!HIERARCHY_HEADING.test(fm.body)) ctx.add('DESIGN-CONTENT', ['body'], 'no prose section on hierarchy and reading order', { line: fm.bodyLine });
  if (!isMap(pig)) {
    content(['pignolo'], 'pignolo: section is missing (platform, register, elevation, motion, states, focus)');
  } else {
    for (const k of ['platform', 'register']) if (!has(pig, k)) content(['pignolo', k], `pignolo.${k} is not declared`);
    if (!(isMap(pig.elevation) && Object.keys(pig.elevation).length)) content(['pignolo', 'elevation'], 'elevation scale is missing');
    if (!(isMap(pig.motion) && isMap(pig.motion.durationMs) && Object.keys(pig.motion.durationMs).length)) content(['pignolo', 'motion', 'durationMs'], 'motion durations are missing');
    if (!(isMap(pig.motion) && isMap(pig.motion.easing) && Object.keys(pig.motion.easing).length)) content(['pignolo', 'motion', 'easing'], 'motion easing is missing');
    if (!isMap(pig.states)) content(['pignolo', 'states'], 'control state opacities are missing');
    else for (const k of STATES) if (!has(pig.states, k)) content(['pignolo', 'states', k], `pignolo.states.${k} is missing`);
    if (!isMap(pig.focus)) content(['pignolo', 'focus'], 'focus indicator is missing');
  }

  // THEME-03 (A-16): a declared dark theme is complete
  const dark = isMap(pig) && isMap(pig.themes) ? pig.themes.dark : undefined;
  if (isMap(dark)) {
    for (const name of Object.keys(colors)) {
      if (semanticOf(name) !== null && !has(dark, name)) ctx.add('THEME-03', ['pignolo', 'themes', 'dark', name], `dark theme does not define ${name}`);
    }
  } else if (darkInCss) {
    ctx.add('THEME-03', ['pignolo', 'themes', 'dark'], 'the CSS has a dark theme but DESIGN.md does not declare pignolo.themes.dark');
  }

  const reject = findings.some((f) => f.rejects);
  // `detalle` findings (aliases) inform and never make the file invalid
  const status = findings.some((f) => f.severity !== 'detalle') ? 'invalid' : 'valid';
  return { status, reason: null, reject, findings, data };
}
