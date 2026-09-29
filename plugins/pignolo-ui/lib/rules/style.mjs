// Style rules over CSS, <style> blocks and Tailwind utilities (spec §5.4, §5.5):
// STATE-04, MOTION-03, MOTION-04, COLOR-02, DEPTH-01, LAYOUT-04.
// CSS findings key on selector|property|value; utility findings on tag|class. Only fails are
// reported: the runner adds the `pass` for a file without findings of the rule.
import { fail, unverified } from './api.mjs';

const NAMED_COLORS = new Set(('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown '
  + 'burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray '
  + 'darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue '
  + 'darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite '
  + 'forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory '
  + 'khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen '
  + 'lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime '
  + 'limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue '
  + 'mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive '
  + 'olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum '
  + 'powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue '
  + 'slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow '
  + 'yellowgreen').split(' '));

const COLOR_PROPS = /^(color|background|background-color|border|border-color|border-(top|right|bottom|left|block|inline|block-start|block-end|inline-start|inline-end)-color|outline-color|fill|stroke|text-decoration-color|caret-color|accent-color)$/;
const RADIUS_PROP = /^border(-(top|bottom|start|end)-(left|right|start|end))?-radius$/;
const COLOR_FN = /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(/i;
const HEX = /#[0-9a-f]{3,8}\b/i;

const FAMILY = {
  radius: /radius|rounded/i,
  elevation: /shadow|elevation/i,
  // A token is "another family" for a color when its name says so.
  notColor: /^--(radius|rounded|space|spacing|gap|shadow|elevation|font|text-size|size|z|duration|ease|motion|leading|tracking|breakpoint|container)/i,
};

const varNames = (value) => [...value.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
const withoutUrls = (value) => value.replace(/url\([^)]*\)/gi, '');
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

function hasColorLiteral(value) {
  const v = withoutUrls(value).replace(/var\([^)]*\)/g, '');
  if (HEX.test(v) || COLOR_FN.test(v)) return true;
  return (v.toLowerCase().match(/[a-z]+/g) || []).some((w) => NAMED_COLORS.has(w));
}

// Splits "a b, c d" into the items' words, at the top level of parentheses.
function items(value) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim().split(/\s+(?![^(]*\))/).filter(Boolean));
}

const isNone = (v) => /^(none|0|0px)$/i.test(norm(v));

// ---- CSS parts -------------------------------------------------------------------------

function tokenRule(ctx, isProp, { okFamily, literal, what }) {
  const out = [];
  for (const d of ctx.css.decls) {
    if (d.inTokenBlock || !isProp(d.property)) continue;
    const key = `${d.selector}|${d.property}|${norm(d.value)}`;
    const extra = { line: d.line, selector: d.selector };
    const names = varNames(d.value);
    const wrong = names.find((n) => !okFamily(n));
    if (wrong) out.push(fail(key, { ...extra, reason: `token of another family (${wrong}) in ${d.property}` }));
    else if (!names.length && literal(d.value)) out.push(fail(key, { ...extra, reason: `literal ${what} outside tokens` }));
  }
  return out;
}

function colorCss(ctx) {
  return tokenRule(ctx, (p) => COLOR_PROPS.test(p), {
    okFamily: (n) => !FAMILY.notColor.test(n),
    literal: hasColorLiteral,
    what: 'color',
  });
}

function depthCss(ctx) {
  return tokenRule(ctx, (p) => p === 'box-shadow', {
    okFamily: (n) => FAMILY.elevation.test(n),
    literal: (v) => !/^(none|inherit|initial|unset|revert|revert-layer)$/i.test(norm(v)),
    what: 'box-shadow',
  });
}

function radiusCss(ctx) {
  return tokenRule(ctx, (p) => RADIUS_PROP.test(p), {
    okFamily: (n) => FAMILY.radius.test(n),
    literal: (v) => norm(v).split(/[\s/]+/).some((t) => !/^(0|0px|0%|50%|inherit|initial|unset|revert|revert-layer)$/i.test(t)),
    what: 'border-radius',
  });
}

const selectorBase = (sel) => norm(sel.replace(/:(focus-visible|focus-within|focus|hover|active)\b/g, ''));

function stateCss(ctx) {
  const decls = ctx.css.decls;
  const draws = (d) => (d.property === 'outline' && !isNone(d.value))
    || (d.property === 'outline-style' && !isNone(d.value))
    || (d.property === 'box-shadow' && !isNone(d.value))
    || (d.property === 'border' && !isNone(d.value));
  const drawers = new Set();
  for (const d of decls) {
    if (!draws(d)) continue;
    for (const part of d.selector.split(',')) {
      if (/:focus-visible\b/.test(part) && !/:not\(\s*:focus-visible/.test(part)) drawers.add(selectorBase(part));
    }
  }
  const out = [];
  for (const d of decls) {
    const removes = (d.property === 'outline' && isNone(d.value)) || (d.property === 'outline-style' && /^none$/i.test(norm(d.value)));
    if (!removes) continue;
    const parts = d.selector.split(',');
    const bad = parts.find((p) => !/:not\(\s*:focus-visible/.test(p) && !drawers.has(selectorBase(p)));
    if (bad === undefined) continue;
    out.push(fail(`${d.selector}|${d.property}|${norm(d.value)}`, {
      line: d.line, selector: d.selector, reason: 'outline removed without a :focus-visible indicator',
    }));
  }
  return out;
}

const transitionItems = (d) => items(d.value);
const listsProperty = (d, re) => (d.property === 'transition'
  ? transitionItems(d).some((words) => words.some((w) => re.test(w)))
  : d.property === 'transition-property' && transitionItems(d).some((words) => words.some((w) => re.test(w))));

function transitionAllCss(ctx) {
  return ctx.css.decls.filter((d) => listsProperty(d, /^all$/i)).map((d) => fail(`${d.selector}|${d.property}|${norm(d.value)}`, {
    line: d.line, selector: d.selector, reason: 'transition on all properties',
  }));
}

function motionCss(ctx) {
  if (/prefers-reduced-motion\s*:\s*reduce/i.test(ctx.text)) return [];
  const out = [];
  const reason = 'motion without prefers-reduced-motion';
  for (const d of ctx.css.decls) {
    const animation = (d.property === 'animation' || d.property === 'animation-name') && !/^(none|initial|unset|revert)$/i.test(norm(d.value));
    if (animation || listsProperty(d, /^(transform|-webkit-transform|all)$/i)) {
      out.push(fail(`${d.selector}|${d.property}|${norm(d.value)}`, { line: d.line, selector: d.selector, reason }));
    }
  }
  for (const k of ctx.css.keyframes) {
    if (/\btransform\s*:/i.test(k.text)) out.push(fail(`@keyframes ${k.name}|transform`, { line: k.line, selector: `@keyframes ${k.name}`, reason }));
  }
  return out;
}

// ---- Utility classes ---------------------------------------------------------------------

const DRAWS_FOCUS = /^(ring|outline|border|shadow)/;

// Calls visit(cls, list) for each class of each list; lists carry their element and dynamic flag.
function eachClass(ctx, visit) {
  const out = [];
  for (const list of ctx.classLists) for (const cls of list.classes) out.push(...(visit(cls, list) ?? []));
  return out;
}

const tagOf = (list) => list.element?.tag ?? 'class';
const utilKey = (list, cls) => `${tagOf(list)}|${cls.raw}`;
const isColorArbitrary = (a) => /^color:/i.test(a) || HEX.test(a) || COLOR_FN.test(a) || NAMED_COLORS.has(a.trim().toLowerCase());

function arbitraryUtility(ctx, matches, reason) {
  return eachClass(ctx, (cls, list) => (cls.arbitrary != null && matches(cls)
    ? [fail(utilKey(list, cls), { line: cls.line, reason })]
    : []));
}

function stateUtility(ctx) {
  const out = [];
  for (const list of ctx.classLists) {
    const hits = list.classes.filter((c) => c.base === 'outline-none' && (c.variants.length === 0 || (c.variants.length === 1 && c.variants[0] === 'focus')));
    if (!hits.length) continue;
    const restores = list.classes.some((c) => c.variants.includes('focus-visible') && DRAWS_FOCUS.test(c.base) && c.base !== 'outline-none');
    if (restores) continue;
    if (list.dynamic) out.push(unverified('dynamic class list: focus-visible indicator not resolvable', { line: hits[0].line, key: `${tagOf(list)}|dynamic` }));
    else for (const c of hits) out.push(fail(utilKey(list, c), { line: c.line, reason: 'outline-none without a focus-visible indicator' }));
  }
  return out;
}

function motionUtility(ctx) {
  const out = [];
  for (const list of ctx.classLists) {
    const hits = list.classes.filter((c) => (/^animate-/.test(c.base) && c.base !== 'animate-none' || c.base === 'transition-transform')
      && !c.variants.some((v) => v === 'motion-safe' || v === 'motion-reduce'));
    if (!hits.length) continue;
    const guarded = list.classes.some((c) => c.variants.includes('motion-reduce'));
    if (guarded) continue;
    if (list.dynamic) out.push(unverified('dynamic class list: motion-reduce not resolvable', { line: hits[0].line, key: `${tagOf(list)}|dynamic` }));
    else for (const c of hits) out.push(fail(utilKey(list, c), { line: c.line, reason: 'motion class without motion-safe/motion-reduce' }));
  }
  return out;
}

const colorUtility = (ctx) => arbitraryUtility(ctx, (c) => /^(text|bg|border)$/.test(c.base) && isColorArbitrary(c.arbitrary), 'arbitrary color outside tokens');
const depthUtility = (ctx) => arbitraryUtility(ctx, (c) => c.base === 'shadow', 'arbitrary box-shadow outside tokens');
const radiusUtility = (ctx) => arbitraryUtility(ctx, (c) => /^rounded(-[a-z]{1,2})?$/.test(c.base), 'arbitrary border-radius outside tokens');
const transitionAllUtility = (ctx) => eachClass(ctx, (c, list) => (c.base === 'transition-all'
  ? [fail(utilKey(list, c), { line: c.line, reason: 'transition on all properties' })]
  : []));

const both = (css, util) => (ctx) => [...css(ctx), ...util(ctx)];

export const RULES = [
  { id: 'STATE-04', checkFile: both(stateCss, stateUtility) },
  { id: 'MOTION-03', checkFile: both(motionCss, motionUtility) },
  { id: 'MOTION-04', checkFile: both(transitionAllCss, transitionAllUtility) },
  { id: 'COLOR-02', checkFile: both(colorCss, colorUtility) },
  { id: 'DEPTH-01', checkFile: both(depthCss, depthUtility) },
  { id: 'LAYOUT-04', checkFile: both(radiusCss, radiusUtility) },
];
