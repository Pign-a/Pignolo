// STRESS-04 (hito 4e, R-4e-18): a control with a fixed width in px breaks when its text grows
// (a longer language, a zoom of 200 %). Static, over CSS and <style> blocks. Only fails are
// reported. Skipped: a width that is var() or calc(), a square control (same height, an icon
// button), aspect-ratio, min-width or max-width in the same rule. Tailwind utilities
// (w-[120px]) are not measured.
import { fail } from './api.mjs';
import { isControlSelector } from './controls.mjs';

export const FIXED_WIDTH_MIN_PX = 48;

const PX = /^([\d.]+)px$/i;
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

function stress04(ctx) {
  const out = [];
  for (const rule of ctx.css.rules) {
    if (!isControlSelector(rule.selector)) continue;
    const width = rule.decls.find((d) => d.property === 'width');
    if (!width || /\b(var|calc)\(/i.test(width.value)) continue;
    const m = PX.exec(norm(width.value));
    if (!m || Number(m[1]) <= FIXED_WIDTH_MIN_PX) continue;
    const has = (p) => rule.decls.some((d) => d.property === p);
    const height = rule.decls.find((d) => d.property === 'height');
    if (has('aspect-ratio') || has('min-width') || has('max-width') || (height && norm(height.value) === norm(width.value))) continue;
    out.push(fail(`${rule.selector}|width`, {
      line: width.line, selector: rule.selector, measure: { widthPx: Number(m[1]) },
      reason: `fixed width of ${m[1]} px on a control: longer text or a 200 % zoom will overflow it`,
    }));
  }
  return out;
}

export const RULES = [{ id: 'STRESS-04', checkFile: stress04 }];
