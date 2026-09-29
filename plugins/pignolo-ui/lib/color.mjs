// Colors that pignolo-ui understands (spec §4.5): hex 3/4/6/8; rgb, hsl, hwb, oklch, oklab,
// lab and lch, with alpha; bare shadcn HSL ("222.2 84% 4.9%"); var() chains with fallback;
// color-mix() in srgb and oklch. Anything else is { ok: false, reason } = "no verificado".
// Out-of-gamut results are clipped to sRGB and flagged (clipped: true).
//
// parseColor(input, { vars }) -> { ok: true, rgba: { r, g, b, a }, format, clipped } | { ok: false, reason }
// contrastRatio(fg, bg), composite(fg, bg), relativeLuminance(rgba), toOklch(rgba),
// formatColor(rgba, 'hex'|'rgb'|'hsl'|'hsl-bare'|'oklch'), detectFormat(str)

const fail = (reason) => ({ ok: false, reason });
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const WHITE = { r: 1, g: 1, b: 1, a: 1 };
const MAX_VAR_DEPTH = 10;
const NUM = '[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?';
const BARE_HSL = new RegExp(`^(${NUM})(?:deg)?\\s+(${NUM})%\\s+(${NUM})%(?:\\s*/\\s*(${NUM}%?))?$`);

const toLinear = (v) => (Math.abs(v) <= 0.04045 ? v / 12.92 : Math.sign(v) * ((Math.abs(v) + 0.055) / 1.055) ** 2.4);
const toGamma = (v) => (Math.abs(v) <= 0.0031308 ? 12.92 * v : Math.sign(v) * (1.055 * Math.abs(v) ** (1 / 2.4) - 0.055));

function mul(m, [x, y, z]) {
  return [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];
}

const D50_TO_D65 = [0.9554734527042182, -0.023098536874261423, 0.0632593086610217,
  -0.028369706963208136, 1.0099954580058226, 0.021041398966943008,
  0.012314001688319899, -0.020507696433477912, 1.3303659366080753];
const XYZ65_TO_LSRGB = [3.2409699419045226, -1.537383177570094, -0.4986107602930034,
  -0.9692436362808796, 1.8759675015077202, 0.04155505740717559,
  0.05563007969699366, -0.20397695888897652, 1.0569715142428786];
const D50_WHITE = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];

function oklabToSrgb(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ].map(toGamma);
}

function srgbToOklab(r, g, b) {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

function labToSrgb(L, a, b) {
  const e = 216 / 24389;
  const k = 24389 / 27;
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const xyz = [
    fx ** 3 > e ? fx ** 3 : (116 * fx - 16) / k,
    L > k * e ? fy ** 3 : L / k,
    fz ** 3 > e ? fz ** 3 : (116 * fz - 16) / k,
  ].map((v, i) => v * D50_WHITE[i]);
  return mul(XYZ65_TO_LSRGB, mul(D50_TO_D65, xyz)).map(toGamma);
}

function hslToSrgb(h, s, l) {
  const hh = ((h % 360) + 360) % 360;
  const f = (n) => {
    const k = (n + hh / 30) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

function hwbToSrgb(h, w, bl) {
  if (w + bl >= 1) {
    const gray = w / (w + bl);
    return [gray, gray, gray];
  }
  return hslToSrgb(h, 1, 0.5).map((v) => v * (1 - w - bl) + w);
}

// ---- tokens --------------------------------------------------------------------------

function num(tok) {
  if (tok === 'none') return 0;
  if (!new RegExp(`^${NUM}$`).test(tok)) return NaN;
  return Number(tok);
}

// Number or percentage; pct maps 100% to `scale`.
function numOrPct(tok, scale) {
  if (typeof tok !== 'string') return NaN;
  if (tok.endsWith('%')) return (num(tok.slice(0, -1)) / 100) * scale;
  return num(tok);
}

function hue(tok) {
  const m = new RegExp(`^(${NUM})(deg|grad|rad|turn)?$`).exec(tok);
  if (tok === 'none') return 0;
  if (!m) return NaN;
  const v = Number(m[1]);
  return { deg: v, grad: v * 0.9, rad: (v * 180) / Math.PI, turn: v * 360, undefined: v }[m[2]];
}

function alpha(tok) {
  if (tok === undefined) return 1;
  const v = tok.endsWith('%') ? num(tok.slice(0, -1)) / 100 : num(tok);
  return Number.isNaN(v) ? NaN : clamp01(v);
}

// "a b c / d" or "a, b, c, d" -> [a, b, c, alpha?] or null
function splitArgs(args) {
  const s = args.trim();
  if (s.includes(',')) {
    const parts = s.split(',').map((p) => p.trim());
    return parts.length === 3 || parts.length === 4 ? parts : null;
  }
  const [main, a, extra] = s.split('/');
  if (extra !== undefined) return null;
  const parts = main.trim().split(/\s+/);
  if (parts.length !== 3) return null;
  if (a !== undefined) {
    if (!a.trim()) return null;
    parts.push(a.trim());
  }
  return parts;
}

// Splits on top-level commas (outside parentheses).
function topLevelCommas(s) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    else if (s[i] === ',' && depth === 0) {
      out.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(s.slice(start).trim());
  return out;
}

// Textual var() substitution, as CSS does; recursive, with fallback and cycle detection.
function substituteVars(s, vars, stack = []) {
  const at = s.search(/var\(/i);
  if (at < 0) return { ok: true, text: s };
  if (stack.length > MAX_VAR_DEPTH) return fail('var() chain too deep');
  let depth = 0;
  let end = -1;
  for (let i = at + 3; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')' && --depth === 0) { end = i; break; }
  }
  if (end < 0) return fail('unbalanced var()');
  const inner = s.slice(at + 4, end);
  const comma = topLevelCommas(inner);
  const name = comma[0];
  const fallback = comma.length > 1 ? inner.slice(inner.indexOf(',') + 1).trim() : null;
  let replacement;
  if (stack.includes(name)) return fail(`var() cycle through ${name}`);
  if (Object.prototype.hasOwnProperty.call(vars, name)) {
    const r = substituteVars(String(vars[name]), vars, [...stack, name]);
    if (!r.ok) return r;
    replacement = r.text;
  } else if (fallback !== null) {
    const r = substituteVars(fallback, vars, stack);
    if (!r.ok) return r;
    replacement = r.text;
  } else {
    return fail(`undefined variable ${name}`);
  }
  return substituteVars(s.slice(0, at) + replacement + s.slice(end + 1), vars, stack);
}

function finish(rgb, a, format) {
  // Half an 8-bit step: rounding in formatColor(…, 'oklch') must not read back as out of gamut.
  const clipped = rgb.some((v) => v < -1 / 510 || v > 1 + 1 / 510);
  const [r, g, b] = rgb.map(clamp01);
  return { ok: true, rgba: { r, g, b, a }, format, clipped };
}

function parseMix(args, vars) {
  const parts = topLevelCommas(args);
  if (parts.length !== 3) return fail('color-mix() needs a space and two colors');
  const space = /^in\s+(srgb|oklch)(?:\s+shorter\s+hue)?$/i.exec(parts[0]);
  if (!space) return fail(`color-mix() space "${parts[0]}" not supported`);
  const items = parts.slice(1).map((p) => {
    const m = /^(.*?)(?:\s+(\d+(?:\.\d+)?)%)?$/.exec(p);
    const lead = /^(\d+(?:\.\d+)?)%\s+(.*)$/.exec(p);
    return lead ? { color: lead[2], pct: Number(lead[1]) } : { color: m[1], pct: m[2] === undefined ? null : Number(m[2]) };
  });
  let [p1, p2] = items.map((it) => it.pct);
  if (p1 === null && p2 === null) { p1 = 50; p2 = 50; } else if (p1 === null) p1 = 100 - p2; else if (p2 === null) p2 = 100 - p1;
  const sum = p1 + p2;
  if (!(sum > 0)) return fail('color-mix() percentages add up to 0');
  const w2 = p2 / sum;
  const alphaMult = sum < 100 ? sum / 100 : 1;
  const [c1, c2] = items.map((it) => parseColor(it.color, { vars }));
  if (!c1.ok) return c1;
  if (!c2.ok) return c2;
  const A = c1.rgba;
  const B = c2.rgba;
  const a = A.a * (1 - w2) + B.a * w2;
  if (space[1].toLowerCase() === 'srgb') {
    const ch = (k) => (a === 0 ? 0 : (A[k] * A.a * (1 - w2) + B[k] * B.a * w2) / a);
    return finish([ch('r'), ch('g'), ch('b')], a * alphaMult, 'color-mix');
  }
  const o1 = toOklch(A);
  const o2 = toOklch(B);
  let h1 = o1.c < 1e-4 ? o2.h : o1.h;
  let h2 = o2.c < 1e-4 ? o1.h : o2.h;
  if (h2 - h1 > 180) h1 += 360; else if (h1 - h2 > 180) h2 += 360;
  const pm = (v1, v2) => (a === 0 ? 0 : (v1 * A.a * (1 - w2) + v2 * B.a * w2) / a);
  const L = pm(o1.l, o2.l);
  const C = pm(o1.c, o2.c);
  const H = ((h1 * (1 - w2) + h2 * w2) * Math.PI) / 180;
  return finish(oklabToSrgb(L, C * Math.cos(H), C * Math.sin(H)), a * alphaMult, 'color-mix');
}

export function parseColor(input, { vars = {} } = {}) {
  if (typeof input !== 'string') return fail('not a string');
  let s = input.trim();
  let viaVar = false;
  if (/var\(/i.test(s)) {
    const r = substituteVars(s, vars);
    if (!r.ok) return r;
    s = r.text.trim();
    viaVar = true;
  }
  const out = parseResolved(s, vars);
  if (out.ok && viaVar) out.viaVar = true;
  return out;
}

function parseResolved(s, vars) {
  if (s === '') return fail('empty value');
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (!/^([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(hex)) return fail(`invalid hex color ${s}`);
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex;
    const v = full.match(/../g).map((x) => Number.parseInt(x, 16) / 255);
    return finish(v.slice(0, 3), v.length === 4 ? v[3] : 1, 'hex');
  }
  const bare = BARE_HSL.exec(s);
  if (bare) {
    const a = alpha(bare[4]);
    return finish(hslToSrgb(Number(bare[1]), Number(bare[2]) / 100, Number(bare[3]) / 100), a, 'hsl-bare');
  }
  const fn = /^([a-zA-Z-]+)\((.*)\)$/s.exec(s);
  if (!fn) return fail(`unsupported color "${s}"`);
  const name = fn[1].toLowerCase();
  if (name === 'color-mix') return parseMix(fn[2], vars);
  if (/\bfrom\b/.test(fn[2])) return fail('relative color syntax not supported');
  const p = splitArgs(fn[2]);
  if (!p) return fail(`cannot read the arguments of ${name}()`);
  const a = alpha(p[3]);
  let rgb;
  let format = name;
  switch (name) {
    case 'rgb':
    case 'rgba':
      rgb = p.slice(0, 3).map((t) => numOrPct(t, 255) / 255);
      format = 'rgb';
      break;
    case 'hsl':
    case 'hsla':
      rgb = hslToSrgb(hue(p[0]), numOrPct(p[1].endsWith('%') ? p[1] : `${p[1]}%`, 1), numOrPct(p[2].endsWith('%') ? p[2] : `${p[2]}%`, 1));
      format = 'hsl';
      break;
    case 'hwb':
      // Bare numbers are percentages (0-100), as in hsl().
      rgb = hwbToSrgb(hue(p[0]), numOrPct(p[1].endsWith('%') ? p[1] : `${p[1]}%`, 1), numOrPct(p[2].endsWith('%') ? p[2] : `${p[2]}%`, 1));
      break;
    case 'oklab':
      rgb = oklabToSrgb(numOrPct(p[0], 1), numOrPct(p[1], 0.4), numOrPct(p[2], 0.4));
      break;
    case 'oklch': {
      const h = (hue(p[2]) * Math.PI) / 180;
      const c = numOrPct(p[1], 0.4);
      rgb = oklabToSrgb(numOrPct(p[0], 1), c * Math.cos(h), c * Math.sin(h));
      break;
    }
    case 'lab':
      rgb = labToSrgb(numOrPct(p[0], 100), numOrPct(p[1], 125), numOrPct(p[2], 125));
      break;
    case 'lch': {
      const h = (hue(p[2]) * Math.PI) / 180;
      const c = numOrPct(p[1], 150);
      rgb = labToSrgb(numOrPct(p[0], 100), c * Math.cos(h), c * Math.sin(h));
      break;
    }
    default:
      return fail(`color function ${name}() not supported`);
  }
  if (rgb.some((v) => Number.isNaN(v)) || Number.isNaN(a)) return fail(`invalid ${name}() value`);
  return finish(rgb, a, format);
}

export function relativeLuminance({ r, g, b }) {
  const [R, G, B] = [r, g, b].map(toLinear);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

// fg over bg (source-over). bg is treated as opaque.
export function composite(fg, bg) {
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}

// WCAG 2.2 ratio. A translucent background is first composited over white.
export function contrastRatio(fg, bg) {
  const base = bg.a < 1 ? composite(bg, WHITE) : bg;
  const top = composite(fg, base);
  const [l1, l2] = [relativeLuminance(top), relativeLuminance(base)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

export function toOklch({ r, g, b }) {
  const [L, A, B] = srgbToOklab(r, g, b);
  const c = Math.hypot(A, B);
  const h = c < 1e-4 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

function round(v, d) {
  const f = 10 ** d;
  return String(Math.round(v * f) / f);
}

function srgbToHsl({ r, g, b }) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

export function formatColor(rgba, format) {
  const a = rgba.a ?? 1;
  const alphaPart = a < 1 ? ` / ${round(a, 3)}` : '';
  switch (format) {
    case 'hex': {
      const parts = [rgba.r, rgba.g, rgba.b, ...(a < 1 ? [a] : [])];
      return `#${parts.map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0')).join('')}`;
    }
    case 'rgb':
      return `rgb(${[rgba.r, rgba.g, rgba.b].map((v) => Math.round(clamp01(v) * 255)).join(' ')}${alphaPart})`;
    case 'hsl':
    case 'hsl-bare': {
      const [h, s, l] = srgbToHsl(rgba);
      const body = `${round(h, 1)} ${round(s * 100, 1)}% ${round(l * 100, 1)}%`;
      return format === 'hsl' ? `hsl(${body}${alphaPart})` : `${body}${alphaPart}`;
    }
    case 'oklch': {
      const { l, c, h } = toOklch(rgba);
      return `oklch(${round(l, 4)} ${round(c, 4)} ${round(h, 2)}${alphaPart})`;
    }
    default:
      throw new Error(`unknown color format ${format}`);
  }
}

export function detectFormat(str) {
  const s = String(str).trim();
  if (/var\(/i.test(s)) return 'var';
  if (/^#[0-9a-fA-F]+$/.test(s)) return 'hex';
  if (BARE_HSL.test(s)) return 'hsl-bare';
  const fn = /^([a-zA-Z-]+)\(/.exec(s);
  if (!fn) return null;
  const name = fn[1].toLowerCase();
  if (name === 'rgba') return 'rgb';
  if (name === 'hsla') return 'hsl';
  return ['rgb', 'hsl', 'hwb', 'oklch', 'oklab', 'lab', 'lch', 'color-mix'].includes(name) ? name : null;
}
