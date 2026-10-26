// Progress: ARIA, scaleX growth (mid-animation), grows only once in view, indeterminate motion, steps states and connector stagger.
export default async function (t) {
  const bar = (id) => `[data-testid="${id}"] [role="progressbar"]`;
  const fill = (id) => `${bar(id)} > div`;
  const sx = (sel) => t.eval((s) => new DOMMatrixReadOnly(getComputedStyle(document.querySelector(s)).transform).a, sel);
  const op = (sel) => t.eval((s) => parseFloat(getComputedStyle(document.querySelector(s)).opacity), sel);

  // Not in view yet: the last bar waits at zero (viewport is 800 px high)
  const below = await t.eval(() => document.querySelector('[data-testid="bar-done"]').getBoundingClientRect().top > window.innerHeight);
  t.expect(below, 'precondition: bar-done starts below the fold');
  if (!t.reducedMotion) t.expect((await sx(fill('bar-done'))) < 0.02, 'bar below the fold has not started');

  // ARIA
  t.expectEqual(await t.attr(bar('bar-main'), 'aria-valuenow'), '35', 'aria-valuenow');
  t.expectEqual(await t.attr(bar('bar-main'), 'aria-valuemax'), '100', 'aria-valuemax');
  t.expectEqual(await t.attr(bar('bar-main'), 'aria-valuetext'), '35 de 100 por ciento', 'aria-valuetext from getValueLabel');
  t.expect((await t.attr(bar('bar-main'), 'aria-labelledby')) !== null, 'labelled by the visible label');
  t.expectEqual(await t.attr(bar('bar-small'), 'aria-label'), 'Espacio usado', 'bare bar uses aria-label');
  await t.wait(800);
  let v = await sx(fill('bar-main'));
  t.expect(Math.abs(v - 0.35) < 0.01, `bar fills to 35% (scaleX ${v.toFixed(3)})`);

  // Change value: mid-animation sample, then settle; rapid changes keep working
  await t.click('[data-testid="bar-plus"]');
  await t.wait(110);
  v = await sx(fill('bar-main'));
  if (t.reducedMotion) t.expect(Math.abs(v - 0.6) < 0.01, `reduced: jumps to 60% (${v.toFixed(3)})`);
  else t.expect(v > 0.36 && v < 0.6, `mid-growth 110 ms after change (scaleX ${v.toFixed(3)})`);
  await t.wait(900);
  v = await sx(fill('bar-main'));
  t.expect(Math.abs(v - 0.6) < 0.01, `settles at 60% (${v.toFixed(3)})`);
  t.expectEqual(await t.attr(bar('bar-main'), 'aria-valuenow'), '60', 'aria-valuenow follows');
  for (let k = 0; k < 4; k++) { await t.click('[data-testid="bar-plus"]'); await t.wait(40); }
  await t.click('[data-testid="bar-minus"]');
  await t.wait(1000);
  v = await sx(fill('bar-main'));
  t.expect(Math.abs(v - 0.75) < 0.01, `rapid +,+,+,+,- ends at 75% (${v.toFixed(3)})`);

  // Starts when it scrolls into view
  await t.rect('[data-testid="bar-done"]');
  await t.wait(1000);
  v = await sx(fill('bar-done'));
  t.expect(v > 0.99, `bar grows once visible (scaleX ${v.toFixed(3)})`);

  // Indeterminate
  t.expectEqual(await t.attr(bar('bar-indeterminate'), 'data-state'), 'indeterminate', 'indeterminate state');
  t.expectEqual(await t.attr(bar('bar-indeterminate'), 'aria-valuenow'), null, 'no aria-valuenow when indeterminate');
  const a = await t.eval((s) => { const c = getComputedStyle(document.querySelector(s)); return [new DOMMatrixReadOnly(c.transform).e, parseFloat(c.opacity)]; }, fill('bar-indeterminate'));
  await t.wait(500);
  const b = await t.eval((s) => { const c = getComputedStyle(document.querySelector(s)); return [new DOMMatrixReadOnly(c.transform).e, parseFloat(c.opacity)]; }, fill('bar-indeterminate'));
  if (t.reducedMotion) t.expect(Math.abs(a[0]) < 0.01 && Math.abs(b[0]) < 0.01 && Math.abs(a[1] - b[1]) > 0.02, `reduced: pulses opacity instead of sliding (${a} -> ${b})`);
  else t.expect(Math.abs(a[0] - b[0]) > 5, `indeterminate slides (${a[0].toFixed(0)} -> ${b[0].toFixed(0)})`);

  // Steps
  const li = (n) => `[data-testid="steps"] ol > li:nth-child(${n})`;
  const conn = (n) => `${li(n)} > span[aria-hidden] > span`;
  t.expectEqual(await t.attr('[data-testid="steps"] ol', 'aria-label'), 'Alta de cuenta', 'steps list named');
  t.expectEqual(await t.attr(li(2), 'aria-current'), 'step', 'current step marked');
  t.expectEqual(await t.attr(li(1), 'aria-current'), null, 'completed step is not current');
  t.expect((await t.text(li(1))).includes('Completado') && (await t.text(li(2))).includes('Paso actual') && (await t.text(li(3))).includes('Pendiente'), 'status text for screen readers');
  await t.wait(600);
  t.expect((await sx(conn(1))) > 0.99 && (await sx(conn(2))) < 0.01, 'connector 1 filled, 2 empty');

  // Finish all at once: connectors and markers fill one after another (stagger)
  await t.click('[data-testid="step-end"]');
  await t.wait(70);
  const c2 = await sx(conn(2));
  const c3 = await sx(conn(3));
  if (!t.reducedMotion) t.expect(c2 > 0.02 && c3 < 0.01, `connector 2 is filling while 3 still waits its 90 ms turn (c2 ${c2.toFixed(2)}, c3 ${c3.toFixed(2)})`);
  await t.wait(1200);
  t.expect((await sx(conn(2))) > 0.99 && (await sx(conn(3))) > 0.99, 'all connectors full');
  t.expectEqual(await t.count('[data-testid="steps"] ol > li[aria-current]'), 0, 'no current step when all are done');
  t.expectEqual(await t.count('[data-testid="steps"] ol path'), 4, 'four drawn ticks');

  // Back one step: un-fills quickly (no stagger)
  await t.click('[data-testid="step-back"]');
  await t.click('[data-testid="step-back"]');
  await t.wait(450);
  t.expect((await sx(conn(3))) < 0.02 || t.reducedMotion, 'connector 3 empties quickly when going back');
  t.expectEqual(await t.attr(li(3), 'aria-current'), 'step', 'step 3 current again');
  await t.click('[data-testid="step-reset"]');
  await t.wait(500);
  t.expectEqual(await t.attr(li(1), 'aria-current'), 'step', 'reset returns to step 1');
  // F5: forced colors. Backgrounds and inset shadows are dropped there: track border, Highlight fill, step borders
  await t.click('[data-testid="step-end"]');
  await t.wait(900);
  await t.emulate([{ name: 'forced-colors', value: 'active' }]);
  await t.wait(200);
  const fc = await t.eval(() => {
    const probe = (prop, v) => { const d = document.createElement('i'); d.style[prop] = v; document.body.append(d); const c = getComputedStyle(d)[prop]; d.remove(); return c; };
    const bar = document.querySelector('[data-testid="bar-main"] [role="progressbar"]');
    const fill = bar.firstElementChild;
    const li = document.querySelector('[data-testid="steps"] li');
    const circle = li.querySelector('span[aria-hidden].relative');
    return {
      forced: matchMedia('(forced-colors: active)').matches,
      track: getComputedStyle(bar).borderTopWidth, trackColor: getComputedStyle(bar).borderTopColor, canvasText: probe('color', 'CanvasText'),
      fill: getComputedStyle(fill).backgroundColor, highlight: probe('backgroundColor', 'Highlight'),
      stepBorder: circle ? getComputedStyle(circle).borderTopWidth : null,
      stepFill: circle ? getComputedStyle(circle.firstElementChild).backgroundColor : null,
    };
  });
  t.expect(fc.forced, 'forced-colors emulation is active');
  t.expect(parseFloat(fc.track) >= 1 && fc.trackColor === fc.canvasText, `forced colors: the bar track has a CanvasText border (${fc.track} ${fc.trackColor})`);
  t.expectEqual(fc.fill, fc.highlight, 'forced colors: the bar fill is Highlight, visible against the track');
  t.expect(parseFloat(fc.stepBorder) >= 1, `forced colors: step markers have a real border (${fc.stepBorder})`);
  t.expectEqual(fc.stepFill, fc.highlight, 'forced colors: a completed step fills with Highlight');
  await t.screenshot(`progress-forced${t.reducedMotion ? '-reduced' : ''}`);
  await t.emulate([{ name: 'forced-colors', value: 'none' }]);
  await t.screenshot(`progress-interact${t.reducedMotion ? '-reduced' : ''}`);
}
