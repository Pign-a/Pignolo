// Checkbox: tick draws (mid-animation pathLength), indeterminate dash, press scale, keyboard, label click, invalid, disabled, rapid toggles.
export default async function (t) {
  const cb = (id) => `[data-testid="${id}"]`;
  const state = (id) => t.attr(cb(id), 'aria-checked');
  const pathInfo = (id) => t.eval((s) => {
    const p = document.querySelector(s + ' path');
    if (!p) return null;
    const cs = getComputedStyle(p);
    return { d: p.getAttribute('d'), dash: cs.strokeDasharray, off: cs.strokeDashoffset, opacity: parseFloat(cs.opacity) };
  }, cb(id));

  t.expectEqual(await t.attr(cb('cb-all'), 'role'), 'checkbox', 'role=checkbox');
  t.expectEqual(await state('cb-all'), 'mixed', 'partial selection is mixed');
  let info = await pathInfo('cb-all');
  t.expect(info && info.d.startsWith('M5.5 10'), `indeterminate draws the dash (d=${info && info.d})`);
  t.expectEqual(await state('cb-ingresos'), 'false', 'ingresos starts unchecked');
  t.expectEqual(await pathInfo('cb-ingresos'), null, 'no mark when unchecked');

  // Tick draws: sample mid-animation (not instantly complete)
  await t.mouseDown(cb('cb-ingresos'));
  await t.wait(110);
  // Press is the CSS `scale` property (pressClass family), not whileTap.
  const scale = await t.eval((s) => { const cs = getComputedStyle(document.querySelector(s)); return new DOMMatrixReadOnly(cs.transform).a * (parseFloat(cs.scale) || 1); }, cb('cb-ingresos'));
  await t.mouseUp();
  if (t.reducedMotion) t.expect(Math.abs(scale - 1) < 0.001, `reduced: no press scale (${scale})`);
  else t.expect(scale > 0.9 && scale < 0.97, `press scales the box (got ${scale.toFixed(3)})`);
  await t.wait(40);
  info = await pathInfo('cb-ingresos');
  t.expect(info !== null, 'tick mounted after click');
  if (!t.reducedMotion) {
    const filled = parseFloat(info.dash);
    t.expect(filled > 0.02 && filled < 0.98, `tick is mid-draw shortly after click (drawn ${filled.toFixed(2)})`);
  } else {
    t.expect(info.opacity <= 1, 'reduced: tick fades');
  }
  await t.wait(500);
  info = await pathInfo('cb-ingresos');
  t.expect(info.d.startsWith('M5 10.5'), 'checked shows the tick path');
  if (!t.reducedMotion) t.expect(parseFloat(info.dash) > 0.99, `tick fully drawn after settling (${info.dash})`);
  t.expectEqual(await state('cb-ingresos'), 'true', 'checked');

  // All selected -> parent becomes checked; click parent clears all
  await t.click(cb('cb-ahorro'));
  await t.wait(400);
  t.expectEqual(await state('cb-all'), 'true', 'parent checked when all children are');
  await t.click(cb('cb-all'));
  await t.wait(400);
  t.expectEqual(await t.text('[data-testid="state"]'), 'false', 'parent click clears everything');
  t.expectEqual(await state('cb-gastos'), 'false', 'children cleared');
  await t.click(cb('cb-all'));
  await t.wait(300);
  t.expectEqual(await state('cb-gastos'), 'true', 'parent click selects all');

  // Rapid clicks: 7 quick toggles on one box end checked (parity)
  const before = await state('cb-gastos');
  for (let i = 0; i < 7; i++) { await t.click(cb('cb-gastos')); await t.wait(30); }
  await t.wait(500);
  t.expectEqual(await state('cb-gastos'), before === 'true' ? 'false' : 'true', 'odd number of rapid clicks flips once');

  // Keyboard: Space toggles, ring shows
  await t.eval(() => document.querySelector('[data-testid="cb-ahorro"]').focus());
  await t.press('Tab');
  const outline = await t.eval(() => getComputedStyle(document.activeElement).outlineStyle);
  t.expect(outline === 'solid', `focus-visible ring (got ${outline})`);
  const focusedId = await t.eval(() => document.activeElement.getAttribute('data-testid'));
  const was = await state(focusedId);
  await t.press('Space');
  await t.wait(300);
  t.expect((await state(focusedId)) !== was, `Space toggles ${focusedId}`);

  // Label click
  const termsBefore = await state('cb-terms');
  await t.click('text=Acepto los términos del servicio');
  await t.wait(300);
  t.expect((await state('cb-terms')) !== termsBefore, 'label click toggles');
  if ((await state('cb-terms')) !== 'true') { await t.click(cb('cb-terms')); await t.wait(300); }
  t.expectEqual(await t.attr(cb('cb-terms'), 'aria-invalid'), null, 'invalid cleared once accepted');

  // Disabled
  await t.click(cb('cb-disabled-off'));
  await t.wait(100);
  t.expectEqual(await state('cb-disabled-off'), 'false', 'disabled ignores clicks');
  t.expectEqual(await state('cb-disabled-on'), 'true', 'disabled keeps its checked value');
  // F22: the 20 px box has an invisible 24 px hit area (WCAG 2.2 target size minimum) and 44 px on touch
  const edge = (dx, dy) => t.eval((a) => {
    const el = document.querySelector(a.s);
    el.scrollIntoView({ block: 'center' });
    const b = el.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2 + a.dx, b.top + b.height / 2 + a.dy);
    return { w: b.width, ok: hit === el };
  }, { s: cb('cb-ingresos'), dx, dy });
  let h = await edge(11, 0); // 1 px outside the 20 px box, inside the 24 px target
  t.expect(h.w === 20 && h.ok, `desktop: a point 1 px outside the 20 px box still hits it (box ${h.w})`);
  h = await edge(13, 0);
  t.expect(!h.ok, 'desktop: nothing is hit 3 px outside the box');
  await t.coarse(true);
  await t.wait(300);
  t.expect(await t.eval(() => matchMedia('(pointer: coarse)').matches), 'coarse pointer emulation is active');
  h = await edge(20, 0);
  t.expect(h.ok, 'touch: a point 10 px outside the box still hits it (44 px target)');
  await t.coarse(false);
  await t.wait(200);

  // F5: forced colors. The inset shadow border does not render there, so a real border and system colors take over
  await t.emulate([{ name: 'forced-colors', value: 'active' }]);
  await t.wait(150);
  const fc = await t.eval(() => {
    const root = (id) => document.querySelector('[data-testid="' + id + '"]');
    const cs = (el) => getComputedStyle(el);
    const probe = (v) => { const d = document.createElement('i'); d.style.color = v; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; };
    const on = root('cb-ingresos');
    return {
      forced: matchMedia('(forced-colors: active)').matches,
      border: cs(root('cb-ingresos')).borderTopColor, borderW: cs(root('cb-ingresos')).borderTopWidth, canvasText: probe('CanvasText'),
      fill: cs(on.querySelector('span[aria-hidden]')).backgroundColor, highlight: probe('Highlight'),
      tick: cs(on.querySelector('svg')).color, highlightText: probe('HighlightText'),
      shadow: cs(root('cb-ingresos')).boxShadow,
    };
  });
  t.expect(fc.forced, 'forced-colors emulation is active');
  t.expectEqual(fc.border, fc.canvasText, 'forced colors: the box has a CanvasText border');
  t.expect(parseFloat(fc.borderW) >= 1, `forced colors: the border is real (${fc.borderW})`);
  t.expectEqual(fc.fill, fc.highlight, 'forced colors: the checked box fills with Highlight');
  t.expectEqual(fc.tick, fc.highlightText, 'forced colors: the tick is HighlightText');
  await t.screenshot(`checkbox-forced${t.reducedMotion ? '-reduced' : ''}`);
  await t.emulate([{ name: 'forced-colors', value: 'none' }]);
  await t.screenshot(`checkbox-interact${t.reducedMotion ? '-reduced' : ''}`);
}
