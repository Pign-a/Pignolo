// B1-B4 (lib/browser-checks.mjs, spec §5.4, §16.1). The Node-side conversion runs always; the
// page checks need Chrome or Edge and are a visible skip without one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { serveRoutes, BROWSER_SKIP, browserPath } from './helpers.mjs';
import { withBrowser } from '../lib/browser-session.mjs';
import { measurePage } from '../lib/browser-run.mjs';
import { shotPlan } from '../lib/shot-plan.mjs';
import { parseComputedColor, contrastFindings, reflowFindings, targetFindings, fieldFindings, typeFindings, respFindings, effectiveRegister, runChecks, runReducedMotionCheck, visibleTextSelectors } from '../lib/browser-checks.mjs';

const skip = BROWSER_SKIP;
const HTML = { 'content-type': 'text/html; charset=utf-8' };
const page = (body, style = '') => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>p</title><style>body{margin:0;padding:0 24px;background:#fff;color:#111;font:16px/1.4 sans-serif}${style}</style></head><body>${body}</body></html>`;

test('computed colors: rgb with alpha, lab, oklch and color(srgb) are read', () => {
  const rgb = (v) => { const c = parseComputedColor(v); assert.ok(c.ok, v); return c.rgba; };
  assert.deepEqual(rgb('rgba(0, 0, 0, 0.5)').a, 0.5);
  assert.ok(Math.abs(rgb('color(srgb 0.5 0.5 0.5)').r - 0.5) < 1e-9);
  assert.equal(rgb('color(srgb 1 0 0 / 0.25)').a, 0.25);
  assert.ok(rgb('lab(20 0 0)').r < 0.25);
  assert.ok(rgb('oklch(0.8 0 0)').r > 0.7);
  assert.equal(parseComputedColor('color(display-p3 1 0 0)').ok, false);
});

test('B1 on measured items: thresholds, large text, layers, image, disabled, unknown canvas', () => {
  const base = { fontSize: 16, fontWeight: 400, opacity: 1, rootScheme: 'normal' };
  const { findings, checked } = contrastFindings([
    { ...base, selector: 'p.ok', color: 'rgb(17, 17, 17)', layers: ['rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)'] },
    { ...base, selector: 'p.low', color: 'rgb(170, 170, 170)', layers: ['rgb(255, 255, 255)'] },
    { ...base, selector: 'h1.large', fontSize: 24, color: 'rgb(148, 148, 148)', layers: ['rgb(255, 255, 255)'] },
    { ...base, selector: 'p.normal-same', color: 'rgb(148, 148, 148)', layers: ['rgb(255, 255, 255)'] },
    { ...base, selector: 'p.veil', color: 'rgb(255, 255, 255)', layers: ['rgba(0, 0, 0, 0.5)', 'rgb(255, 255, 255)'] },
    { ...base, selector: 'p.img', color: 'rgb(0, 0, 0)', layers: [], image: 'div.hero' },
    { ...base, selector: 'button.off', color: 'rgb(200, 200, 200)', layers: ['rgb(255, 255, 255)'], disabled: true },
    { ...base, selector: 'p.dark-canvas', color: 'rgb(200, 200, 200)', layers: [], rootScheme: 'dark' },
  ]);
  const by = Object.fromEntries(findings.map((f) => [f.selector, f]));
  assert.equal(by['p.ok'], undefined);
  assert.deepEqual([by['p.low'].status, by['p.low'].measure], ['fail', { ratio: 2.32, required: 4.5, fontSizePx: 16 }]);
  assert.equal(by['h1.large'], undefined, 'large text needs 3:1 (3.03)');
  assert.equal(by['p.normal-same'].status, 'fail');
  assert.equal(by['p.veil'].measure.ratio, 3.98, 'white over black at 50 % over white');
  assert.match(by['p.img'].reason, /image or gradient \(div\.hero\)/);
  assert.equal(by['button.off'], undefined, 'disabled controls are exempt');
  assert.match(by['p.dark-canvas'].reason, /canvas color is not known/);
  assert.equal(checked, 5);
});

test('B3 on measured data: LAYOUT-11 is bloquea only at 320, passes when nothing fails', () => {
  const data = { innerWidth: 320, scrollWidth: 500, clipped: [{ selector: 'p.cut', scrollWidth: 400, clientWidth: 272 }], margin: [{ selector: 'p.edge', left: 0, right: 40 }], checked: 4 };
  const at320 = reflowFindings(data, { width: 320 });
  assert.deepEqual(at320.map((f) => [f.id, f.key, f.severity]), [['LAYOUT-11', 'horizontal-scroll', undefined], ['LAYOUT-11', 'p.cut', undefined], ['LAYOUT-10', 'p.edge', undefined]]);
  const at768 = reflowFindings({ ...data, innerWidth: 768, scrollWidth: 900 }, { width: 768 });
  assert.deepEqual(at768.filter((f) => f.id === 'LAYOUT-11').map((f) => f.severity), ['alto', 'alto']);
  const clean = reflowFindings({ innerWidth: 320, scrollWidth: 320, clipped: [], margin: [], checked: 3 }, { width: 320 });
  assert.deepEqual(clean.map((f) => [f.id, f.status, f.measure.checked]), [['LAYOUT-11', 'pass', 3], ['LAYOUT-10', 'pass', 3]]);
});

async function checkPage(html, { width = 1440, height = 900, theme = 'light', reduced = false, headers = HTML } = {}) {
  const site = await serveRoutes({ '/': { headers, body: html } });
  try {
    return await withBrowser({ executable: browserPath() }, async (browser) => {
      const p = await browser.newPage();
      await p.setViewport({ width, height });
      await p.setMedia({ theme, reducedMotion: false });
      await p.navigate(`${site.base}/`);
      await p.waitReady();
      if (!reduced) return runChecks(p);
      const visible = await visibleTextSelectors(p); // the normal, settled load, as measurePage does
      await p.setMedia({ theme, reducedMotion: true });
      await p.navigate(`${site.base}/`);
      await p.waitReady();
      return runReducedMotionCheck(p, visible);
    });
  } finally {
    await site.close();
  }
}
const ids = (findings, id, status = 'fail') => findings.filter((f) => f.id === id && f.status === status);

test('B1 in the browser: rgb with alpha, lab, oklch and color-mix computed; gradient unverified; disabled exempt', { skip }, async () => {
  const f = await checkPage(page(`
    <p id="ok">Texto legible</p>
    <p id="alpha" style="color: rgb(0 0 0 / 0.3)">Texto translúcido</p>
    <p id="lab" style="color: lab(20 0 0)">Texto lab</p>
    <p id="oklch" style="color: oklch(0.8 0 0)">Texto oklch</p>
    <p id="mix" style="color: color-mix(in srgb, #000 50%, #fff)">Texto mezclado</p>
    <h1 id="large" style="font-size: 24px; color: #949494">Título grande</h1>
    <div style="background-image: linear-gradient(#000, #333)"><p id="grad" style="color: #fff">Sobre degradé</p></div>
    <button id="off" disabled style="color: #ccc; background: #fff">Deshabilitado</button>`));
  assert.deepEqual(ids(f, 'COLOR-03').map((x) => x.selector).sort(), ['#alpha', '#mix', '#oklch']);
  assert.equal(ids(f, 'COLOR-03', 'unverified')[0].selector, '#grad');
  assert.equal(ids(f, 'COLOR-03', 'pass').length, 0, 'no pass entry when something fails');
});

test('B1 in the browser: dark theme is measured with the dark colors', { skip }, async () => {
  const html = page('<p id="t">Texto</p>', '@media (prefers-color-scheme: dark){body{background:#101010;color:#3a3a3a}}');
  assert.deepEqual(ids(await checkPage(html), 'COLOR-03').length, 0);
  assert.deepEqual(ids(await checkPage(html, { theme: 'dark' }), 'COLOR-03').map((x) => x.selector), ['#t']);
});

test('B1 in the browser works under a strict CSP (nothing injected as a script)', { skip }, async () => {
  const f = await checkPage(page('<p id="low" style="color:#aaa">Texto</p>'), { headers: { ...HTML, 'content-security-policy': "default-src 'self'; style-src 'unsafe-inline'" } });
  assert.deepEqual(ids(f, 'COLOR-03').map((x) => x.selector), ['#low']);
});

test('B2 in the browser: focus without visible change, trap and role without tabindex', { skip }, async () => {
  const f = await checkPage(page(`
    <nav><a id="home" href="#h">Inicio</a> <div id="menu" role="button">Menú</div></nav>
    <button id="plain" style="outline: none">Sin foco visible</button>
    <button id="ring">Con foco</button>
    <button id="off" disabled>Deshabilitado</button>`, '#ring:focus-visible{outline:3px solid #0b6bcb}'));
  assert.deepEqual(ids(f, 'STATE-04').map((x) => x.selector), ['#plain']);
  assert.deepEqual(ids(f, 'NAV-01').map((x) => [x.selector, x.reason]), [['#menu', 'interactive role without tabindex: not reachable with Tab']]);
  const trap = await checkPage(page(`<input id="trap" aria-label="t" onkeydown="if (event.key === 'Tab') event.preventDefault()"><a id="after" href="#a">Después</a>`));
  assert.deepEqual(ids(trap, 'NAV-01').map((x) => x.selector), ['#after']);
});

test('B2 in the browser: a page where every control shows focus passes', { skip }, async () => {
  const f = await checkPage(page('<a href="#a">Uno</a> <button>Dos</button> <input aria-label="tres">'));
  assert.deepEqual(f.filter((x) => ['NAV-01', 'STATE-04'].includes(x.id)).map((x) => [x.id, x.status, x.measure.checked]), [['NAV-01', 'pass', 3], ['STATE-04', 'pass', 3]]);
});

test('B3 in the browser at 320: horizontal scroll, clipped text, margin; edge-to-edge bar exempt', { skip }, async () => {
  const f = await checkPage(page(`
    <header style="background:#0b6bcb;margin:0 -24px;padding:8px 4px"><span id="bar" style="color:#fff">Barra</span></header>
    <p id="fine">Texto con margen</p>
    <div id="wide" style="width: 500px">Ancho fijo</div>
    <p id="cut" style="white-space: nowrap; overflow: hidden; width: 100px">Un texto que no entra en su caja</p>
    <p id="dots" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100px">Un texto que no entra en su caja</p>
    <pre id="code" style="overflow-x: auto; width: 100px">const larguisimo = 'una línea que no entra';</pre>
    <p id="edge" style="margin-left: -20px">Pegado al borde</p>`), { width: 320, height: 640 });
  assert.deepEqual(ids(f, 'LAYOUT-11').map((x) => x.key), ['horizontal-scroll', '#cut']);
  assert.ok(ids(f, 'LAYOUT-11').every((x) => x.severity === undefined), 'catalog severity (bloquea) at 320');
  assert.deepEqual(ids(f, 'LAYOUT-10').map((x) => x.selector), ['#edge']);
});

test('B4 in the browser: text left at opacity 0 by a reveal animation fails under reduced motion', { skip }, async () => {
  const reveal = '.fade{opacity:0;animation:in 1s forwards}@keyframes in{to{opacity:1}}';
  const bad = page('<h1 class="fade" id="hero">Título</h1><p>Texto</p>', `${reveal}@media (prefers-reduced-motion: reduce){.fade{animation:none}}`);
  assert.deepEqual(ids(await checkPage(bad, { reduced: true }), 'MOTION-07').map((x) => x.selector), ['#hero']);
  const good = page('<h1 class="fade" id="hero">Título</h1><p>Texto</p>', `${reveal}@media (prefers-reduced-motion: reduce){.fade{animation:none;opacity:1}}`);
  const ok = await checkPage(good, { reduced: true });
  assert.deepEqual(ok.map((x) => [x.id, x.status]), [['MOTION-07', 'pass']]);
  const below = page(`<div style="height:2000px"></div><p class="fade" id="far">Lejos</p>`, `${reveal}@media (prefers-reduced-motion: reduce){.fade{animation:none}}`);
  assert.deepEqual(ids(await checkPage(below, { reduced: true, height: 600 }), 'MOTION-07'), [], 'only the first two viewports');
});

// Fixes of the final review of hito 3: common page patterns that must not be false `bloquea`.
test('B3 in the browser at 320: sr-only and visually-hidden text is not clipped text', { skip }, async () => {
  const f = await checkPage(page(`
    <span id="tw" style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border-width:0">Saltar al contenido principal de la página</span>
    <span id="bs" style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap">Texto solo para lectores de pantalla</span>
    <p id="cut" style="white-space: nowrap; overflow: hidden; width: 100px">Un texto que no entra en su caja</p>`), { width: 320, height: 640 });
  assert.deepEqual(ids(f, 'LAYOUT-11').map((x) => x.key), ['#cut'], 'only the text that is really cut');
});

test('B2 in the browser: a radio group is reached once with Tab (arrows move inside it)', { skip }, async () => {
  const f = await checkPage(page(`
    <label><input type="radio" name="plan" id="r1" value="a"> Uno</label>
    <label><input type="radio" name="plan" id="r2" value="b"> Dos</label>
    <label><input type="radio" name="plan" id="r3" value="c"> Tres</label>
    <label><input type="radio" name="otro" id="s1" value="a"> Otro</label>
    <button id="b">Enviar</button>`, 'input:focus-visible,button:focus-visible{outline:3px solid #0b6bcb}'));
  assert.deepEqual(ids(f, 'NAV-01'), [], 'radios 2 and 3 are reached with the arrows');
  assert.deepEqual(ids(f, 'STATE-04'), []);
  assert.equal(ids(f, 'NAV-01', 'pass').length, 1);
  // A group Tab cannot enter at all (every radio out of the tab order) still fails.
  const trap = await checkPage(page(`<input type="radio" name="g" id="x1" aria-label="x1" onfocus="this.blur()"><input type="radio" name="g" id="x2" aria-label="x2" onfocus="this.blur()">`));
  assert.deepEqual(ids(trap, 'NAV-01').map((x) => x.selector), ['#x1', '#x2']);
});

test('LAYOUT-10 in the browser: a painted full-width container is not a bar unless it is short or header/nav/footer', { skip }, async () => {
  const tall = (style) => `<div style="background:#f9fafb;margin:0 -24px;min-height:100vh;${style}"><p id="edge" style="margin:0 4px">Texto pegado al borde</p></div>`;
  for (const width of [1440, 320]) {
    assert.deepEqual(ids(await checkPage(page(tall('')), { width, height: 700 }), 'LAYOUT-10').map((x) => x.selector), ['#edge'], `painted page wrapper at ${width}`);
  }
  const bar = await checkPage(page('<header style="background:#f9fafb;margin:0 -24px;min-height:100vh"><p id="hb" style="margin:0 4px">Cabecera</p></header><div style="background:#0b6bcb;margin:0 -24px;padding:8px 0"><span id="short" style="margin:0 4px;color:#fff">Aviso</span></div>'), { width: 320, height: 640 });
  assert.deepEqual(ids(bar, 'LAYOUT-10'), [], 'header, and a short painted strip, are bars');
});

test('B4 in the browser: only text visible in the normal load is flagged under reduced motion (hover tooltips are not)', { skip }, async () => {
  const html = page('<div class="g"><span id="tip" class="tip">Ayuda al pasar el mouse</span></div><h1 class="fade" id="hero">Título</h1>',
    '.tip{opacity:0;transition:opacity .2s}.g:hover .tip{opacity:1}.fade{opacity:0;animation:in 1s forwards}@keyframes in{to{opacity:1}}@media (prefers-reduced-motion: reduce){.fade{animation:none}}');
  assert.deepEqual(ids(await checkPage(html, { reduced: true }), 'MOTION-07').map((x) => x.selector), ['#hero']);
});

// ---- Hito 4e, T2: TARGET-01 and FORM-01 ------------------------------------------------------------
const box = (selector, left, top, width, height, extra = {}) => ({ selector, left, top, width, height, inline: false, ...extra });
const phone = { width: 375 };

test('TARGET-01 on measured boxes: under 24 px is alto only when the 24 px circle crosses another target', () => {
  // Gaps are edge to edge: two 20 px boxes need 4 px between them for their circles to just touch.
  const crossing = targetFindings([box('#a', 0, 0, 20, 20), box('#b', 22, 0, 20, 20)], { width: 1440 });
  assert.deepEqual(crossing.map((f) => [f.id, f.status, f.key]), [['TARGET-01', 'fail', '#a'], ['TARGET-01', 'fail', '#b']]);
  assert.deepEqual(crossing[0].measure, { widthPx: 20, heightPx: 20, minPx: 24 });
  const touching = targetFindings([box('#a', 0, 0, 20, 20), box('#b', 24, 0, 20, 20)], { width: 1440 });
  assert.deepEqual(touching.map((f) => f.status), ['pass'], 'circles that only touch do not cross');
  const near = targetFindings([box('#a', 0, 0, 20, 20), box('#b', 30, 0, 20, 20)], { width: 1440 });
  assert.deepEqual(near.map((f) => f.status), ['pass'], 'a 10 px gap is enough');
  const alone = targetFindings([box('#a', 0, 0, 20, 20), box('#far', 80, 0, 100, 40)], { width: 1440 });
  assert.deepEqual(alone.map((f) => [f.status, f.key]), [['pass', 'checked']], 'isolated 20 px at desktop: no alto');
  const box30 = targetFindings([box('#a', 0, 0, 30, 30), box('#b', 40, 0, 100, 40)], { width: 1440 });
  assert.deepEqual(box30.map((f) => f.status), ['pass'], '30 px is not undersized at desktop');
});

test('TARGET-01 on measured boxes: a big neighbor box counts as a target for the circle', () => {
  const f = targetFindings([box('#icon', 0, 0, 20, 20), box('#row', 21, 0, 300, 44)], { width: 1440 });
  assert.deepEqual(f.map((x) => [x.status, x.key]), [['fail', '#icon']]);
});

test('TARGET-01 at phone width: one medio entry per width with count, smallest and at most 5 selectors', () => {
  const isolated = targetFindings([box('#a', 0, 0, 20, 20), box('#far', 200, 0, 100, 60)], phone);
  assert.deepEqual(isolated.map((f) => [f.status, f.key, f.severity]), [['fail', 'phone-targets', 'medio']]);
  assert.equal(isolated[0].measure.count, 1);
  const thirty = targetFindings([box('#a', 0, 0, 30, 30), box('#b', 60, 0, 30, 30)], phone);
  assert.deepEqual(thirty.map((f) => f.key), ['phone-targets']);
  assert.deepEqual([thirty[0].measure.count, thirty[0].measure.smallestPx, thirty[0].measure.selectors.length], [2, 30, 2]);
  const ok = targetFindings([box('#a', 0, 0, 44, 44)], phone);
  assert.deepEqual(ok.map((f) => [f.status, f.key, f.measure.checked]), [['pass', 'checked', 1]]);
  const many = targetFindings(Array.from({ length: 40 }, (_, i) => box(`#n${i}`, 0, i * 60, 40, 40)), phone);
  assert.equal(many.length, 1, 'forty small links are one entry, not forty');
  assert.deepEqual([many[0].key, many[0].measure.count, many[0].measure.selectors.length], ['phone-targets', 40, 5]);
  // An element that is already alto is not counted again in the 44 px entry.
  const both = targetFindings([box('#a', 0, 0, 20, 20), box('#b', 22, 0, 20, 20), box('#c', 0, 200, 40, 40)], phone);
  assert.deepEqual(both.map((f) => f.key), ['#a', '#b', 'phone-targets']);
  assert.equal(both[2].measure.count, 1);
});

test('TARGET-01: inline links are exempt, DESIGN.md can raise the minimum but never lower the floor', () => {
  const inline = targetFindings([box('#link', 0, 0, 60, 18, { inline: true }), box('#b', 0, 100, 44, 44)], phone);
  assert.deepEqual(inline.map((f) => f.status), ['pass']);
  const raised = targetFindings([box('#a', 0, 0, 30, 30), box('#b', 31, 0, 30, 30)], { width: 1440, minPx: 32 });
  assert.deepEqual(raised.map((f) => f.key), ['#a', '#b'], '30 px under a 32 px minimum with a neighbor 1 px away');
  assert.equal(raised[0].measure.minPx, 32);
  const lowered = targetFindings([box('#a', 0, 0, 20, 20), box('#b', 22, 0, 20, 20)], { width: 1440, minPx: 16 });
  assert.equal(lowered.filter((f) => f.status === 'fail').length, 2, 'the floor stays at 24');
  const rec = targetFindings([box('#a', 0, 0, 40, 40)], { width: 375, recommendedPx: 36 });
  assert.deepEqual(rec.map((f) => f.status), ['pass'], 'recommendedPx replaces the 44');
});

test('FORM-01 on measured fields: under 16 px at phone width, never elsewhere', () => {
  const field = (selector, fontSize) => ({ selector, fontSize });
  const bad = fieldFindings([field('#email', 14), field('#ok', 16)], phone);
  assert.deepEqual(bad.map((f) => [f.id, f.status, f.key, f.measure.fontSizePx]), [['FORM-01', 'fail', '#email', 14]]);
  assert.deepEqual(fieldFindings([field('#ok', 16)], phone).map((f) => [f.status, f.measure.checked]), [['pass', 1]]);
  assert.deepEqual(fieldFindings([field('#email', 14)], { width: 1440 }), [], 'not applicable above phone width');
  assert.deepEqual(fieldFindings([field('#email', 14)], { width: 480 }).map((f) => f.status), ['fail'], '480 is still phone');
});

test('TARGET-01 and FORM-01 in the browser', { skip }, async () => {
  const f = await checkPage(page(`
    <button id="a" style="width:20px;height:20px;padding:0;margin:0 2px 0 0">x</button><button id="b" style="width:20px;height:20px;padding:0">y</button>
    <p>Un texto con un <a id="inl" href="#x" style="font-size:12px">enlace en línea</a> adentro del párrafo.</p>
    <button id="off" disabled style="width:20px;height:20px;padding:0;margin-top:80px;display:block">z</button>
    <label id="lab" style="display:block;min-height:40px;line-height:40px;margin-top:20px"><input id="chk" type="checkbox" style="width:13px;height:13px;margin:0 8px"> Acepto</label>
    <input id="mail" aria-label="mail" style="font-size:14px;height:44px;margin-top:20px">`), { width: 375, height: 700 });
  assert.deepEqual(ids(f, 'TARGET-01').filter((x) => x.key !== 'phone-targets').map((x) => x.selector).sort(), ['#a', '#b'], 'only the two touching buttons are alto');
  const agg = ids(f, 'TARGET-01').find((x) => x.key === 'phone-targets');
  assert.ok(agg.measure.selectors.every((s) => !['#inl', '#off'].includes(s)), 'inline link and disabled button do not count');
  assert.ok(agg.measure.count >= 1, 'the checkbox with its 40 px label is in the 44 px entry');
  assert.deepEqual(ids(f, 'FORM-01').map((x) => x.selector), ['#mail']);
  const desk = await checkPage(page('<input id="mail" aria-label="mail" style="font-size:14px">'), { width: 1440 });
  assert.deepEqual(desk.filter((x) => x.id === 'FORM-01'), []);
});

// ---- Hito 4e, T3: TYPE-01 and TYPE-02 --------------------------------------------------------------
const typeData = (over = {}) => ({ title: { selector: 'h1', fontSize: 30 }, body: { fontSize: 24 }, blocks: [], tiny: [], ...over });
const t02 = (data, register) => typeFindings(data, { register }).find((f) => f.id === 'TYPE-02');
const block = (selector, chars, lines, leading = 1.5, tag = 'p') => ({ selector, chars, lines, leading, fontSize: 16, tag });

test('TYPE-02 by register: brand needs 1.25, product and undeclared 1.125', () => {
  assert.equal(t02(typeData({ title: { selector: 'h1', fontSize: 30 } }), 'brand').status, 'pass');
  const brandFail = t02(typeData({ title: { selector: 'h1', fontSize: 29.9 } }), 'brand');
  assert.deepEqual([brandFail.status, brandFail.measure.register, brandFail.measure.threshold, brandFail.measure.titlePx, brandFail.measure.bodyPx], ['fail', 'brand', 1.25, 29.9, 24]);
  assert.ok(brandFail.measure.ratio < 1.25);
  assert.equal(t02(typeData({ title: { selector: 'h1', fontSize: 27 } }), 'product').status, 'pass');
  assert.equal(t02(typeData({ title: { selector: 'h1', fontSize: 26.9 } }), 'product').status, 'fail');
  const unset = t02(typeData({ title: { selector: 'h1', fontSize: 27 } }), 'unset');
  assert.deepEqual([unset.status, unset.measure.register, unset.measure.threshold], ['pass', 'unset', 1.125]);
  const at28 = typeData({ title: { selector: 'h1', fontSize: 28 } });
  assert.deepEqual([t02(at28, 'product').status, t02(at28, 'brand').status], ['pass', 'fail'], 'same 1.167 ratio: dense passes, airy fails');
});

test('TYPE-02 without an h1 or without body text is unverified with the reason', () => {
  assert.match(t02(typeData({ title: null }), 'brand').reason, /no visible h1/);
  assert.equal(t02(typeData({ title: null }), 'brand').status, 'unverified');
  assert.match(t02(typeData({ body: null }), 'brand').reason, /no body text/);
});

test('TYPE-01: line length, leading and tiny text, one entry per motive', () => {
  const only = (blocks, tiny = []) => typeFindings(typeData({ blocks, tiny })).filter((f) => f.id === 'TYPE-01');
  assert.deepEqual(only([block('p.a', 81, 1)]).map((f) => f.key), ['line-length']);
  assert.deepEqual(only([block('p.a', 80, 1)]).map((f) => [f.status, f.key]), [['pass', 'checked']]);
  assert.deepEqual(only([block('p.a', 200, 3, 1.29)]).map((f) => f.key), ['leading']);
  assert.deepEqual(only([block('p.a', 200, 3, 1.3)]).map((f) => f.status), ['pass']);
  assert.deepEqual(only([block('p.a', 90, 1, 1.2)]).map((f) => f.key), ['line-length'], 'a one-line paragraph with tight leading is not a leading problem');
  assert.deepEqual(only([block('blockquote', 200, 3, 1.1, 'blockquote')]).map((f) => f.status), ['pass'], 'leading is for p and li');
  assert.deepEqual(only([], [{ selector: 'small', fontSize: 11 }]).map((f) => [f.key, f.measure.worst.value]), [['tiny-text', 11]]);
  const seven = only(Array.from({ length: 7 }, (_, i) => block(`p.n${i}`, 200 + i, 1)));
  assert.equal(seven.length, 1);
  assert.deepEqual([seven[0].key, seven[0].measure.count, seven[0].measure.worst.selector, seven[0].measure.threshold], ['line-length', 7, 'p.n6', 80]);
});

test('TYPE-01 and TYPE-02 in the browser', { skip }, async () => {
  const long = 'palabra '.repeat(25).trim();
  const wide = await checkPage(page(`<h1>Título</h1><p id="long" style="font-size:16px;max-width:none">${long}</p>`), { width: 1440 });
  assert.deepEqual(ids(wide, 'TYPE-01').map((x) => x.key), ['line-length']);
  const tiny = await checkPage(page('<h1 style="font-size:32px">Título</h1><p>Cuerpo.</p><small id="s11" style="font-size:11px">chico</small><small id="s12" style="font-size:12px">justo</small>'), { width: 1440 });
  assert.deepEqual(ids(tiny, 'TYPE-01').map((x) => [x.key, x.measure.count]), [['tiny-text', 1]]);
  const flat = await checkPage(page('<h1 style="font-size:16px">Título</h1><p>Texto del cuerpo, igual de grande.</p>'), { width: 1440 });
  assert.equal(ids(flat, 'TYPE-02').length, 1);
  const ok = await checkPage(page('<h1 style="font-size:32px">Título</h1><p style="max-width:40ch;line-height:1.5">Texto del cuerpo, corto.</p>'), { width: 1440 });
  assert.deepEqual([ids(ok, 'TYPE-02').length, ids(ok, 'TYPE-01').length], [0, 0]);
  assert.equal(ids(ok, 'TYPE-02', 'pass').length, 1);
});

// ---- Hito 4e, T10: RESP-01, controls that go missing on the phone ----------------------------------------
const item = (name, over = {}) => ({ key: `a|${name.toLowerCase()}|/x`, name, visible: true, disclosed: false, ...over });
const resp = (wideItems, narrowItems, widths = { 1440: 1, 375: 1 }) => respFindings(
  Object.fromEntries(Object.keys(widths).map((w) => [w, { items: Number(w) >= 1024 ? wideItems : narrowItems }])), {});

test('RESP-01 on measured items: a visible desktop control with no phone twin and no way to open it fails', () => {
  const gone = resp([item('Facturación')], [item('Facturación', { visible: false })]);
  assert.deepEqual(gone.map((f) => [f.status, f.key, f.severity, f.measure.names, f.measure.narrow, f.measure.width]), [['fail', 'missing-on-phone', 'medio', ['Facturación'], 375, 375]]);
  assert.equal(resp([item('Facturación')], [item('Facturación', { visible: false, disclosed: true })])[0].status, 'pass', 'a collapsed menu is not a loss');
  assert.equal(resp([item('Inicio')], [item('Inicio')])[0].status, 'pass');
  assert.equal(resp([item('Inicio')], [])[0].status, 'fail', 'absent from the DOM at phone width');
  assert.equal(resp([item('Oculto', { visible: false })], [])[0].status, 'pass', 'only what was visible on desktop counts');
});

test('RESP-01 without a desktop and a phone width is unverified with the reason', () => {
  const f = respFindings({ 1440: { items: [item('A')] }, 768: { items: [item('A')] } }, {});
  assert.deepEqual([f[0].status, f[0].id], ['unverified', 'RESP-01']);
  assert.match(f[0].reason, /desktop width and a phone width/);
  const only = respFindings({ 375: { items: [] }, 320: { items: [] } }, {});
  assert.equal(only[0].status, 'unverified');
});

test('RESP-01: seven missing controls are one entry with the count and at most five names', () => {
  const many = Array.from({ length: 7 }, (_, i) => item(`Enlace ${i}`));
  const f = resp(many, []);
  assert.equal(f.length, 1);
  assert.deepEqual([f[0].measure.count, f[0].measure.names.length], [7, 5]);
});

test('RESP-01: two of three "Ver" links are missing, so identity is name plus href, not name alone', () => {
  const ver = (href, over = {}) => ({ key: `a|ver|${href}`, name: 'Ver', visible: true, disclosed: false, ...over });
  const f = resp([ver('/a'), ver('/b'), ver('/c')], [ver('/a')]);
  assert.deepEqual([f[0].status, f[0].measure.count], ['fail', 2]);
});

async function measureReal(html, platform = 'both') {
  const site = await serveRoutes({ '/': { headers: HTML, body: html } });
  try {
    const open = (fn) => withBrowser({ executable: browserPath() }, fn);
    return (await measurePage({ url: `${site.base}/`, plan: shotPlan({ platform }), open, settleMs: 0 })).entries.filter((e) => e.id === 'RESP-01');
  } finally {
    await site.close();
  }
}
const NAV = '<nav class="side"><a href="/billing">Facturación</a> <a href="/team">Equipo</a></nav><main><h1>Panel</h1><p>Texto.</p></main>';

test('RESP-01 in the browser: hidden side nav fails, a collapsed menu with its button passes, an identical page passes', { skip }, async () => {
  const hidden = await measureReal(page(NAV, '@media (max-width:480px){.side{display:none}}'));
  assert.deepEqual(hidden.map((e) => [e.status, e.measure.names]), [['fail', ['facturación', 'equipo']]]);
  assert.equal(hidden[0].measure.width, 320);
  const collapsed = await measureReal(page(`<button aria-expanded="false" aria-controls="m" class="burger">Menú</button><nav id="m" class="side"><a href="/billing">Facturación</a> <a href="/team">Equipo</a></nav><main><h1>Panel</h1></main>`,
    '.burger{display:none}@media (max-width:480px){.burger{display:inline-block}.side{display:none}}'));
  assert.deepEqual(collapsed.map((e) => e.status), ['pass']);
  const same = await measureReal(page(NAV));
  assert.deepEqual(same.map((e) => e.status), ['pass']);
  const hiddenOnes = await measureReal(page('<a href="/x" aria-hidden="true">Oculto</a><button disabled>Apagado</button><main><h1>Panel</h1></main>', '@media (max-width:480px){a,button{display:none}}'));
  assert.deepEqual(hiddenOnes.map((e) => e.status), ['pass'], 'aria-hidden and disabled controls do not count');
});

test('RESP-01 in the browser: a plan without a desktop width is unverified', { skip }, async () => {
  const f = await measureReal(page(NAV), 'mobile');
  assert.deepEqual(f.map((e) => e.status), ['unverified']);
});

// ---- Hito 4e, T11: register per screen ------------------------------------------------------------------
test('effectiveRegister: the flag wins, then DESIGN.md, then unset; another value is an error', () => {
  assert.equal(effectiveRegister({ flag: 'brand', design: { register: 'product' } }), 'brand');
  assert.equal(effectiveRegister({ design: { register: 'product' } }), 'product');
  assert.equal(effectiveRegister({}), 'unset');
  assert.equal(effectiveRegister({ design: { platform: 'web' } }), 'unset');
  assert.throws(() => effectiveRegister({ flag: 'airy' }), /register must be one of/);
});
