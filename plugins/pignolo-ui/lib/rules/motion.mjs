// Static motion rules over CSS and <style> blocks (hito 4e, R-4e-9): MOTION-05 duration,
// MOTION-06 easing, MOTION-08 layout properties and MOTION-09 hover transforms. Only fails are
// reported (the runner adds the pass). Values with var() or calc() are not judged; Tailwind
// utilities (duration-*, ease-in) and motion done with scripts are not measured.
import { fail } from './api.mjs';
import { isControlSelector } from './controls.mjs';

export const MAX_CONTROL_MS = 500;
export const LAYOUT_PROPS = ['width', 'height', 'top', 'left', 'right', 'bottom', 'margin', 'padding'];

const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const dynamic = (v) => /\b(var|calc)\(/i.test(v);
const isLayoutProp = (p) => LAYOUT_PROPS.some((x) => p === x || p.startsWith(`${x}-`));
const TIME = /^(-?[\d.]+)(ms|s)$/i;

// Top-level comma split: commas inside parentheses (cubic-bezier, steps) stay.
function splitTop(value) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const c of value) {
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += c;
  }
  parts.push(cur.trim());
  return parts.filter(Boolean);
}
const words = (item) => item.replace(/\([^)]*\)/g, (m) => m.replace(/\s+/g, '')).split(/\s+/).filter(Boolean);
const toMs = (w) => { const m = TIME.exec(w); return m ? Number(m[1]) * (m[2].toLowerCase() === 's' ? 1000 : 1) : null; };

const transitionProps = (decls) => decls.filter((d) => ['transition', 'transition-property', 'transition-duration', 'transition-timing-function'].includes(d.property));

const declaredMotion = (ctx) => {
  const m = ctx.design?.data?.pignolo?.motion;
  return m && typeof m === 'object' ? m : null;
};

function motion05(ctx) {
  const motion = declaredMotion(ctx);
  const set = motion && motion.durationMs && typeof motion.durationMs === 'object'
    ? new Set(Object.values(motion.durationMs).map(Number).filter(Number.isFinite)) : null;
  const out = [];
  for (const d of transitionProps(ctx.css.decls)) {
    if (!['transition', 'transition-duration'].includes(d.property) || dynamic(d.value)) continue;
    const items = splitTop(d.value);
    const durations = d.property === 'transition'
      ? items.map((it) => words(it).map(toMs).find((x) => x !== null)).filter((x) => x !== undefined)
      : items.map((it) => toMs(it)).filter((x) => x !== null);
    const bad = durations.find((ms) => ms > 0 && (set && set.size ? !set.has(ms) : ms > MAX_CONTROL_MS && isControlSelector(d.selector)));
    if (bad === undefined) continue;
    out.push(fail(`${d.selector}|${d.property}|${norm(d.value)}`, {
      line: d.line, selector: d.selector,
      reason: set && set.size ? `duration ${bad} ms is not one of the DESIGN.md pignolo.motion.durationMs values` : `duration ${bad} ms on a control is above ${MAX_CONTROL_MS} ms`,
    }));
  }
  return out;
}

function motion06(ctx) {
  const motion = declaredMotion(ctx);
  if (motion && motion.easing && typeof motion.easing === 'object' && Object.keys(motion.easing).length) return [];
  const out = [];
  for (const d of transitionProps(ctx.css.decls)) {
    if (!['transition', 'transition-timing-function'].includes(d.property) || dynamic(d.value)) continue;
    const bounce = [...d.value.matchAll(/cubic-bezier\(\s*([^)]*)\)/gi)].some((m) => {
      const n = m[1].split(',').map((x) => Number(x.trim()));
      return n.length === 4 && n.every(Number.isFinite) && (n[1] < 0 || n[1] > 1 || n[3] < 0 || n[3] > 1);
    });
    const easeIn = isControlSelector(d.selector) && splitTop(d.value).some((it) => words(it).includes('ease-in'));
    if (!bounce && !easeIn) continue;
    out.push(fail(`${d.selector}|${d.property}|${norm(d.value)}`, {
      line: d.line, selector: d.selector, reason: bounce ? 'cubic-bezier with a control point outside 0 to 1 (bounce)' : 'ease-in on a control',
    }));
  }
  return out;
}

function motion08(ctx) {
  const out = [];
  for (const d of ctx.css.decls) {
    if (dynamic(d.value) && d.property !== 'transition' && d.property !== 'transition-property') continue;
    let prop = null;
    if (d.property === 'transition' || d.property === 'transition-property') {
      prop = splitTop(d.value).map((it) => (d.property === 'transition' ? words(it).find((w) => !toMs(w) && !/\(/.test(w) && !/^(ease|linear|step|infinite)/.test(w)) : it.trim())).find((p) => p && isLayoutProp(p.toLowerCase()));
    } else if (d.atRules.some((a) => /@keyframes/i.test(a)) && isLayoutProp(d.property)) {
      prop = d.property;
    }
    if (!prop) continue;
    out.push(fail(`${d.selector}|${d.property}|${norm(d.value)}`, {
      line: d.line, selector: d.selector, reason: `${prop} is animated: it forces layout on every frame (animate transform or opacity)`,
    }));
  }
  return out;
}

const HOVER_GATE = /\(\s*(any-)?hover\s*:\s*hover\s*\)/i;
function motion09(ctx) {
  const out = [];
  for (const d of ctx.css.decls) {
    if (!['transform', 'scale', 'translate', 'rotate'].includes(d.property) || !/:hover\b/i.test(d.selector)) continue;
    if (d.atRules.some((a) => HOVER_GATE.test(a))) continue;
    out.push(fail(`${d.selector}|${d.property}|${norm(d.value)}`, {
      line: d.line, selector: d.selector, reason: `${d.property} on :hover outside @media (hover: hover): touch screens keep the hover state after a tap`,
    }));
  }
  return out;
}

export const RULES = [
  { id: 'MOTION-05', checkFile: motion05 },
  { id: 'MOTION-06', checkFile: motion06 },
  { id: 'MOTION-08', checkFile: motion08 },
  { id: 'MOTION-09', checkFile: motion09 },
];
