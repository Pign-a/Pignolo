// B1-B4 (lib/browser-checks.mjs, spec §5.4, §16.1). The Node-side conversion runs always; the
// page checks need Chrome or Edge and are a visible skip without one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { serveRoutes, BROWSER_SKIP, browserPath } from './helpers.mjs';
import { withBrowser } from '../lib/browser-session.mjs';
import { parseComputedColor, contrastFindings, reflowFindings, runChecks, runReducedMotionCheck } from '../lib/browser-checks.mjs';

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
      await p.setMedia({ theme, reducedMotion: reduced });
      await p.navigate(`${site.base}/`);
      await p.waitReady();
      return reduced ? runReducedMotionCheck(p) : runChecks(p);
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
