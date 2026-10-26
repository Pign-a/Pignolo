// Bars: starts only in view, one by one (stagger), anatomy, legend, tooltip, keyboard, table fallback, replay, reduced motion.
const nb = (s) => s.replace(/ /g, ' ');
const LATE ='[data-testid="bars-late"] [data-bars-bar]';

const frameRecorder = (sel) => `(() => {
  window.__rec = []; window.__stop = false;
  const tick = () => {
    window.__rec.push({ t: performance.now(), d: [...document.querySelectorAll('${sel}')].map((b) => { const s = getComputedStyle(b); return { sy: new DOMMatrixReadOnly(s.transform).d, o: Number(s.opacity) }; }) });
    if (!window.__stop) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`;

export default async function (t) {
  const state = (sel) =>
    t.eval(`[...document.querySelectorAll('${sel}')].map((b) => { const s = getComputedStyle(b); return { sy: new DOMMatrixReadOnly(s.transform).d, o: Number(s.opacity) }; })`);

  // 1. Not started while off screen.
  const off = await state(LATE);
  t.expectEqual(off.length, 7, 'late chart has 7 bars');
  t.expect(off.every((b) => b.o < 0.05 && (t.reducedMotion || b.sy < 0.1)), `bars wait while off screen (${JSON.stringify(off[0])})`);
  await t.wait(600);
  t.expect((await state(LATE)).every((b) => b.o < 0.05), 'still waiting after 600 ms off screen');

  // 2. Scroll into view: they grow in order.
  await t.eval(frameRecorder(LATE));
  await t.eval(`(() => { window.__t0 = performance.now(); document.querySelector('[data-testid="bars-late"]').scrollIntoView({ block: 'center' }); })()`);
  await t.wait(2200);
  await t.eval('window.__stop = true');
  const rec = await t.eval('({ t0: window.__t0, rec: window.__rec })');
  const startOf = (i) => { const f = rec.rec.find((r) => r.t >= rec.t0 && r.d[i].o > 0.15); return f ? f.t : null; };
  const starts = [0, 1, 2, 3, 4, 5, 6].map(startOf);
  t.expect(starts.every((s) => s !== null), 'every bar becomes visible');
  const gaps = starts.slice(1).map((s, i) => s - starts[i]);
  if (t.reducedMotion) {
    t.expect(Math.max(...starts) - Math.min(...starts) < 120, `reduced motion: bars fade together (spread ${Math.round(Math.max(...starts) - Math.min(...starts))} ms)`);
    t.expect(rec.rec.every((r) => r.d.every((b) => Math.abs(b.sy - 1) < 0.001)), 'reduced motion: no scale growth');
  } else {
    t.expect(gaps.every((g) => g > 40 && g < 160), `stagger about 90 ms (${gaps.map(Math.round)})`);
    const mid = rec.rec.find((r) => r.d.some((b) => b.sy > 0.2 && b.sy < 0.9));
    t.expect(!!mid, 'growth passes through intermediate scaleY values');
  }
  const done = await state(LATE);
  t.expect(done.every((b) => Math.abs(b.sy - 1) < 0.01 && b.o > 0.99), 'all bars end full size');

  // 3. Anatomy (first chart).
  const a = await t.eval(`(() => {
    const bars = [...document.querySelectorAll('[data-testid="bars-single"] [data-bars-bar]')];
    const r = bars.map((b) => b.parentElement.getBoundingClientRect());
    const s = getComputedStyle(bars[0]);
    return { n: bars.length, w: r.map((x) => Math.round(x.width)), h: r.map((x) => x.height), radius: [s.borderTopLeftRadius, s.borderBottomLeftRadius],
      labels: [...document.querySelectorAll('[data-testid="bars-single"] [data-bars-value]')].map((e) => e.textContent), legend: !!document.querySelector('[data-testid="bars-single"] figure > ul') };
  })()`);
  t.expectEqual(a.n, 6, 'six bars');
  t.expect(a.w.every((w) => w <= 24), `bars are at most 24 px thick (${a.w})`);
  t.expect(Math.abs(a.h[3] / a.h[0] - 2) < 0.03, `heights are proportional (90k is twice 45k: ${(a.h[3] / a.h[0]).toFixed(2)})`);
  t.expectEqual(a.radius, ['4px', '0px'], 'rounded 4 px at the data end, square at the baseline');
  t.expectEqual(nb(a.labels[0]), '$ 45.000', 'each bar prints its value');
  t.expectEqual(a.legend, false, 'single series has no legend box');

  // 4. Multi series: legend, hatch, tooltip, keyboard.
  const m = await t.eval(`(() => {
    const root = document.querySelector('[data-testid="bars-multi"]');
    const bars = [...root.querySelectorAll('[data-bars-column]:first-child [data-bars-bar]')].map((b) => getComputedStyle(b).backgroundImage);
    return { legend: [...root.querySelectorAll('figure > ul > li')].map((l) => l.textContent), hatch: bars, values: root.querySelectorAll('[data-bars-value]').length };
  })()`);
  t.expectEqual(m.legend, ['Ingresos', 'Gastos', 'Ahorro'], 'legend names every series');
  t.expect(m.hatch[0] === 'none' && m.hatch[1] !== 'none' && m.hatch[2] !== 'none' && m.hatch[1] !== m.hatch[2], 'series 2 and 3 are hatched (identity beyond color)');
  t.expectEqual(m.values, 0, 'no number on every bar with several series');
  const col = '[data-testid="bars-multi"] [data-bars-column]:nth-child(2)';
  const label = await t.attr(col, 'aria-label');
  t.expect(label.startsWith('Feb:') && nb(label).includes('Ingresos $ 135.000') && nb(label).includes('Ahorro $ 43.000'), `column is labeled with every value ("${label}")`);
  const tip = `${col} > div[aria-hidden="true"]:last-child`;
  t.expect(Number(await t.style(tip, 'opacity')) < 0.05, 'tooltip hidden at rest');
  await t.hover(col);
  await t.wait(250);
  t.expect(Number(await t.style(tip, 'opacity')) > 0.95, 'tooltip shows on hover');
  t.expect(nb(await t.text(tip)).includes('$ 92.000'), 'tooltip lists the values');
  await t.hover('[data-testid="bars-multi"] figcaption');
  await t.focus('[data-testid="bars-multi"] [data-bars-column]:nth-child(5)');
  await t.press('Tab');
  await t.press('Tab');
  await t.focus('[data-testid="bars-multi"] [data-bars-column]:nth-child(3)');
  await t.wait(250);
  const kbd = '[data-testid="bars-multi"] [data-bars-column]:nth-child(3) > div[aria-hidden="true"]:last-child';
  t.expect(Number(await t.style(kbd, 'opacity')) > 0.95, 'tooltip shows on keyboard focus');
  t.expectEqual(await t.style('[data-testid="bars-multi"] [data-bars-column]:nth-child(3)', 'outline-style'), 'solid', 'focus ring on a column');

  // 5. Table fallback.
  const toggle = '[data-testid="bars-multi"] button[aria-expanded]';
  t.expectEqual(await t.attr(toggle, 'aria-expanded'), 'false', 'table closed at first');
  t.expectEqual(await t.exists('[data-testid="bars-multi"] table'), false, 'no table while closed');
  await t.focus(toggle);
  await t.press('Enter');
  await t.wait(300);
  t.expectEqual(await t.attr(toggle, 'aria-expanded'), 'true', 'Enter opens the table');
  t.expectEqual(await t.text(toggle), 'Ocultar tabla', 'button label flips');
  t.expectEqual(await t.count('[data-testid="bars-multi"] tbody tr'), 6, 'six data rows');
  t.expectEqual(await t.count('[data-testid="bars-multi"] thead th'), 4, 'category plus three series columns');
  t.expect((await t.text('[data-testid="bars-multi"] tbody tr:nth-child(2) td:nth-child(2)')).includes('135.000'), 'table has the values');
  await t.press('Space');
  await t.wait(500);
  t.expectEqual(await t.exists('[data-testid="bars-multi"] table'), false, 'Space closes it again');

  // 6. Empty state.
  t.expect((await t.text('[data-testid="bars-empty"]')).includes('Todavía no hay gastos'), 'empty message');
  t.expectEqual(await t.exists('[data-testid="bars-empty"] [data-bars-bar]'), false, 'empty: no plot');

  // 7. Replay plays the growth again.
  await t.eval(frameRecorder('[data-testid="bars-single"] [data-bars-bar]'));
  await t.click('[data-testid="bars-replay"]');
  await t.wait(1600);
  await t.eval('window.__stop = true');
  const again = await t.eval('window.__rec');
  t.expect(again.some((r) => r.d.some((b) => b.o < 0.2)), 'replay restarts from hidden');
  t.expect(again[again.length - 1].d.every((b) => b.sy > 0.99 && b.o > 0.99), 'replay ends full size');

// 8. Changing the data glides the heights with the direct spring (no reveal replay, no jump).
  const SINGLE = '[data-testid="bars-single"] [data-bars-bar]';
  await t.eval('window.scrollTo(0, 0)');
  await t.wait(200);
  await t.eval(`(() => { window.__rec = []; window.__stop = false;
    const tick = () => { window.__rec.push({ t: performance.now(), h: [...document.querySelectorAll('${SINGLE}')].map((b) => b.parentElement.getBoundingClientRect().height),
      sy: [...document.querySelectorAll('${SINGLE}')].map((b) => new DOMMatrixReadOnly(getComputedStyle(b).transform).d) });
      if (!window.__stop) requestAnimationFrame(tick); };
    requestAnimationFrame(tick); })()`);
  const hBefore = await t.eval(`[...document.querySelectorAll('${SINGLE}')].map((b) => b.parentElement.getBoundingClientRect().height)`);
  await t.click('[data-testid="bars-change"]');
  await t.wait(1000);
  await t.eval('window.__stop = true');
  const chg = await t.eval('window.__rec');
  const hAfter = await t.eval(`[...document.querySelectorAll('${SINGLE}')].map((b) => b.parentElement.getBoundingClientRect().height)`);
  t.expect(hAfter.some((h, i) => Math.abs(h - hBefore[i]) > 20), 'the data really changed the heights');
  t.expect(Math.abs(hAfter[0] / hAfter[1] - 82000 / 30000) < 0.05, 'new heights are proportional to the new values');
  const moving = chg.filter((f) => f.h.some((h, i) => Math.abs(hAfter[i] - hBefore[i]) > 30 && Math.abs(h - hBefore[i]) > 6 && Math.abs(h - hAfter[i]) > 6));
  if (t.reducedMotion) t.expect(moving.length === 0, 'reduced motion: heights jump to the new data');
  else {
    t.expect(moving.length >= 3, `heights pass through intermediate values when the data changes (${moving.length} frames)`);
    const first = chg.find((f) => f.h.some((h, i) => Math.abs(h - hBefore[i]) > 2));
    const last = [...chg].reverse().find((f) => f.h.some((h, i) => Math.abs(h - hAfter[i]) > 2));
    t.expect(first && last && last.t - first.t < 600, `the glide settles within 600 ms (${first && last ? Math.round(last.t - first.t) : 'n/a'} ms)`);
    t.expect(chg.every((f) => f.sy.every((v) => Math.abs(v - 1) < 0.02)), 'changing data does not replay the grow-in (scaleY stays 1)');
  }

  // 9. A long series caps its sweep: 18 bars must not take 1.5 s to appear.
  await t.eval(`document.querySelector('[data-testid="bars-many"]').scrollIntoView({ block: 'center' })`);
  await t.wait(1800);
  await t.eval(frameRecorder('[data-testid="bars-many"] [data-bars-bar]'));
  await t.eval('window.__t0 = performance.now()');
  await t.click('[data-testid="bars-many-replay"]');
  await t.wait(2200);
  await t.eval('window.__stop = true');
  const many = await t.eval('({ t0: window.__t0, rec: window.__rec })');
  const mStarts = Array.from({ length: 18 }, (_, i) => { const f = many.rec.find((r) => r.t >= many.t0 + 60 && r.d[i].o > 0.15); return f ? f.t : null; });
  t.expect(mStarts.every((x) => x !== null), 'all 18 bars appear');
  const sweep = Math.max(...mStarts) - Math.min(...mStarts);
  if (t.reducedMotion) t.expect(sweep < 150, `reduced motion: the 18 bars fade together (${Math.round(sweep)} ms)`);
  else t.expect(sweep > 350 && sweep < 800, `the sweep of 18 bars is capped to about 0.6 s (${Math.round(sweep)} ms)`);

  // 10. One tab stop for the plot (roving tabindex), arrows move between categories.
  const MULTI = '[data-testid="bars-multi"]';
  const stops = () => t.eval(`[...document.querySelectorAll('${MULTI} [data-bars-column]')].map((c) => c.tabIndex)`);
  t.expectEqual((await stops()).filter((x) => x === 0).length, 1, 'only one category is a tab stop');
  const active = () => t.eval(`[...document.querySelectorAll('${MULTI} [data-bars-column]')].indexOf(document.activeElement)`);
  await t.focus(`${MULTI} [data-bars-column]:nth-child(1)`);
  await t.press('ArrowRight');
  await t.wait(200);
  t.expectEqual(await active(), 1, 'ArrowRight moves to the next category');
  t.expectEqual(await stops(), [-1, 0, -1, -1, -1, -1], 'the tab stop follows the arrows');
  const tipOf = (i) => `${MULTI} [data-bars-column]:nth-child(${i + 1}) > div[aria-hidden="true"]:last-child`;
  t.expect(Number(await t.style(tipOf(1), 'opacity')) > 0.95, 'arrowing to a category shows its tooltip');
  await t.press('End');
  t.expectEqual(await active(), 5, 'End goes to the last category');
  await t.press('Home');
  t.expectEqual(await active(), 0, 'Home goes to the first category');
  await t.press('ArrowRight');
  await t.press('Tab');
  t.expectEqual(await t.eval(`document.activeElement.matches('${MULTI} button[aria-expanded]')`), true, 'one Tab leaves the plot for the table button');

  // 11. Esc dismisses the tooltip without moving focus (WCAG 1.4.13 dismissible).
  await t.focus(`${MULTI} [data-bars-column][tabindex="0"]`);
  await t.wait(250);
  const openIdx = await active();
  t.expect(Number(await t.style(tipOf(openIdx), 'opacity')) > 0.95, 'tooltip open on the focused category');
  await t.press('Escape');
  await t.wait(250);
  t.expect(Number(await t.style(tipOf(openIdx), 'opacity')) < 0.05, 'Esc hides the tooltip');
  t.expectEqual(await active(), openIdx, 'focus stays on the category after Esc');
  await t.press('ArrowRight');
  await t.wait(250);
  t.expect(Number(await t.style(tipOf(openIdx + 1), 'opacity')) > 0.95, 'moving to another category shows its tooltip again');

  // 12. The tooltip is hoverable: moving the pointer onto it keeps it open (WCAG 1.4.13 hoverable).
  await t.eval('document.activeElement.blur()');
  await t.hover(`${MULTI} figcaption`);
  await t.hover(`${MULTI} [data-bars-column]:nth-child(2)`);
  await t.wait(250);
  t.expect(Number(await t.style(tipOf(1), 'opacity')) > 0.95, 'tooltip open on hover');
  await t.hover(`${tipOf(1)} p`);
  await t.wait(300);
  t.expect(Number(await t.style(tipOf(1), 'opacity')) > 0.95, 'tooltip stays open while the pointer is on it');
  await t.press('Escape');
  await t.wait(250);
  t.expect(Number(await t.style(tipOf(1), 'opacity')) < 0.05, 'Esc also dismisses a tooltip opened by hover');
  await t.hover(`${MULTI} figcaption`);

  // 13. Series colors come from the chart tokens (fixed order).
  const colors = await t.eval(`(() => {
    const probe = document.createElement('i'); document.body.appendChild(probe);
    const rgb = (v) => { probe.style.backgroundColor = v; return getComputedStyle(probe).backgroundColor; };
    const root = getComputedStyle(document.documentElement);
    const want = [1, 2, 3].map((n) => rgb(root.getPropertyValue('--chart-' + n).trim()));
    const got = [...document.querySelectorAll('${MULTI} [data-bars-column]:first-child [data-bars-bar]')].map((b) => getComputedStyle(b).backgroundColor);
    probe.remove(); return { want, got };
  })()`);
  t.expectEqual(colors.got, colors.want, 'series 1 to 3 use --chart-1 to --chart-3');
  t.expect(new Set(colors.got).size === 3, 'the three series have three different colors');

  // 14. Forced colors: marks keep a system color instead of vanishing into Canvas.
  await t.emulate([{ name: 'forced-colors', value: 'active' }]);
  await t.wait(200);
  const forced = await t.eval(`(() => {
    const probe = document.createElement('i'); document.body.appendChild(probe);
    const rgb = (v) => { probe.style.backgroundColor = v; return getComputedStyle(probe).backgroundColor; };
    const bar = document.querySelector('${MULTI} [data-bars-column]:first-child [data-bars-bar]');
    const cs = getComputedStyle(bar);
    const r = { adjust: cs.forcedColorAdjust, bg: cs.backgroundColor, canvas: rgb('Canvas'), highlight: rgb('Highlight'), active: matchMedia('(forced-colors: active)').matches };
    probe.remove(); return r;
  })()`);
  t.expect(forced.active, 'forced colors emulation is on');
  t.expectEqual(forced.adjust, 'none', 'bars opt out of forced color adjustment');
  t.expect(forced.bg !== forced.canvas, `a bar is not painted with Canvas in forced colors (${forced.bg})`);
  t.expectEqual(forced.bg, forced.highlight, 'series 1 maps to the Highlight system color');
  await t.screenshot(`bars-forced${t.reducedMotion ? '-reduced' : ''}`);
  await t.emulate([{ name: 'forced-colors', value: 'none' }]);

  // Touch: the table button is a 44 px target.
  await t.coarse(true);
  await t.wait(200);
  const tb = await t.eval(`Math.round(document.querySelector('[data-testid="bars-multi"] button[aria-expanded]').getBoundingClientRect().height)`);
  t.expect(tb >= 44, `the table button is 44 px on touch (${tb})`);
  await t.coarse(false);

  await t.screenshot(`bars-interact${t.reducedMotion ? '-reduced' : ''}`);
}
