// Structural fingerprints and distances (spec §7.5, A-18): two options of a decision must differ
// in structure (mockups) or in tokens (style tiles); an implementation is compared with its
// approved mockup in structure only. Pure: the page fingerprint is taken by fingerprint-page.mjs.
//
// editDistance(a, b) / normalizedDistance(a, b)   Levenshtein over lists
// mockupDistance(fa, fb) -> { coincide, distance, reasons }   coincide: distance < 0.3, same columns, same primary
// tileFingerprint(html) -> { v: 1, kind: 'tile', primaryHue, fontFamily, radii }
// tileDistance(fa, fb)   -> { coincide, reasons }
// pairwise({ A, B, C }, distanceFn) -> [{ a, b, coincide, distance?, reasons }]
import { parseColor, toOklch } from './color.mjs';

export const SAME_THRESHOLD = 0.3;
export const HUE_THRESHOLD = 30;

export function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

export function normalizedDistance(a, b) {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 0 : editDistance(a, b) / max;
}

export function samePrimary(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return true;
  return a.row === b.row && a.col === b.col;
}

export function mockupDistance(fa, fb) {
  const distance = normalizedDistance(fa.blocks || [], fb.blocks || []);
  const reasons = [];
  if (distance < SAME_THRESHOLD) reasons.push('blocks');
  if (fa.columns === fb.columns) reasons.push('columns');
  if (samePrimary(fa.primary, fb.primary)) reasons.push('primary');
  return { coincide: reasons.length === 3, distance, reasons };
}

function rootVars(html) {
  const text = String(html).replace(/\/\*[\s\S]*?\*\//g, '');
  const vars = {};
  for (const block of text.matchAll(/:root\s*\{([^}]*)\}/g)) {
    for (const m of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+?)\s*(?:;|$)/g)) vars[m[1]] = m[2].trim();
  }
  return vars;
}

export function tileFingerprint(html) {
  const vars = rootVars(html);
  let primaryHue = null;
  if (vars['--color-primary'] !== undefined) {
    const p = parseColor(vars['--color-primary']);
    if (p.ok) primaryHue = Math.round(toOklch(p.rgba).h) % 360;
  }
  let fontFamily = null;
  if (vars['--font-body'] !== undefined) {
    const first = vars['--font-body'].split(',')[0].trim().replace(/^["']|["']$/g, '').trim().toLowerCase();
    fontFamily = first || null;
  }
  const radii = [];
  for (const k of ['--radius-sm', '--radius-md', '--radius-lg']) {
    const m = vars[k] !== undefined ? /(-?\d*\.?\d+)px/.exec(vars[k]) : null;
    if (m) radii.push(Number(m[1]));
  }
  const unique = [...new Set(radii)].sort((x, y) => x - y);
  return { v: 1, kind: 'tile', primaryHue, fontFamily, radii: unique };
}

export function tileDistance(fa, fb) {
  if (fa.primaryHue === null || fa.primaryHue === undefined || fb.primaryHue === null || fb.primaryHue === undefined) {
    return { coincide: false, reasons: ['missing-primary'] };
  }
  const d = Math.abs(fa.primaryHue - fb.primaryHue);
  const delta = Math.min(d, 360 - d);
  const reasons = [];
  if (delta < HUE_THRESHOLD) reasons.push('hue');
  if (fa.fontFamily === fb.fontFamily) reasons.push('font');
  if (JSON.stringify(fa.radii) === JSON.stringify(fb.radii)) reasons.push('radii');
  return { coincide: reasons.length === 3, reasons };
}

export function pairwise(fingerprints, distanceFn) {
  const letters = Object.keys(fingerprints).sort();
  const out = [];
  for (let i = 0; i < letters.length; i++) {
    for (let j = i + 1; j < letters.length; j++) {
      const a = letters[i];
      const b = letters[j];
      out.push({ a, b, ...distanceFn(fingerprints[a], fingerprints[b]) });
    }
  }
  return out;
}
