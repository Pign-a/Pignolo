// Button: no hover lift (author decision 4), press scale, focus ring, keyboard, loading (width held, no double submit), disabled, rapid clicks.
export default async function (t) {
  const tf = (sel) => t.eval((s) => {
    const cs = getComputedStyle(document.querySelector(s));
    const m = new DOMMatrixReadOnly(cs.transform);
    // press is the CSS scale property (pressClass); the transform stays untouched
    return { x: m.e, y: m.f, s: m.a * (parseFloat(cs.scale) || 1), top: document.querySelector(s).getBoundingClientRect().top + window.scrollY };
  }, sel);

  // Hover changes color only: no lift, no transform (decision 4; it was -2 px before)
  let p = await tf('[data-testid="btn-primary"]');
  const top0 = p.top;
  await t.hover('[data-testid="btn-primary"]');
  await t.wait(500);
  p = await tf('[data-testid="btn-primary"]');
  t.expect(Math.abs(p.y) < 0.01 && Math.abs(p.top - top0) < 0.01, `hover does not lift the button (y=${p.y}, top moved ${(p.top - top0).toFixed(2)})`);
  // hover background is one step darker than rest
  const bgHover = await t.style('[data-testid="btn-primary"]', 'background-color');
  await t.hover('[data-testid="btn-sm"]');
  await t.wait(400);
  const bgRest = await t.style('[data-testid="btn-primary"]', 'background-color');
  t.expect(bgHover !== bgRest, `hover color differs from rest (${bgHover} vs ${bgRest})`);
  p = await tf('[data-testid="btn-primary"]');
  t.expect(Math.abs(p.y) < 0.01, `still no transform after leaving (got ${p.y.toFixed(2)})`);

  // Touch: on a coarse pointer every size reaches 44 px (coarseTarget); desktop sizes are unchanged
  const desk = await t.eval(() => [...document.querySelectorAll('[data-testid^="btn-"]')].filter((e) => e.tagName === 'BUTTON').map((e) => Math.round(e.getBoundingClientRect().height)));
  t.expect(desk.some((h) => h < 44), `desktop sizes are not forced up (${desk.join(',')})`);
  await t.coarse(true);
  await t.wait(300);
  const coarse = await t.eval(() => [...document.querySelectorAll('[data-testid^="btn-"]')].filter((e) => e.tagName === 'BUTTON').map((e) => Math.round(e.getBoundingClientRect().height)));
  t.expect(coarse.every((h) => h >= 44), `touch: every button is at least 44 px tall (${coarse.join(',')})`);
  await t.coarse(false);
  await t.wait(200);

  // Press: ~0.97 while held, within ~100 ms (70 ms tween)
  await t.mouseDown('[data-testid="btn-secondary"]');
  await t.wait(110);
  p = await tf('[data-testid="btn-secondary"]');
  await t.mouseUp();
  if (t.reducedMotion) t.expect(Math.abs(p.s - 1) < 0.001, `reduced: no press scale (got ${p.s})`);
  else t.expect(p.s > 0.955 && p.s < 0.985, `press scale near 0.97 (got ${p.s.toFixed(3)})`);
  await t.wait(500);
  p = await tf('[data-testid="btn-secondary"]');
  t.expect(Math.abs(p.s - 1) < 0.005, `scale springs back to 1 (got ${p.s.toFixed(3)})`);

  // Rapid clicks all count (interruptible)
  for (let i = 0; i < 6; i++) await t.click('[data-testid="btn-count"]');
  await t.wait(200);
  t.expectEqual(await t.text('[data-testid="clicks"]'), '6', 'six rapid clicks counted');

  // Keyboard: Enter and Space activate; focus ring visible
  await t.focus('[data-testid="btn-save"]');
  await t.press('Enter');
  await t.press('Space');
  await t.wait(100);
  t.expectEqual(await t.text('[data-testid="saves"]'), '2', 'Enter and Space activate');
  await t.focus('[data-testid="btn-count"]');
  await t.press('Tab');
  await t.press('Tab');
  const outline = await t.eval(() => getComputedStyle(document.activeElement).outlineStyle);
  t.expect(outline === 'solid', `focus-visible outline after Tab (got ${outline})`);

  // Disabled: no clicks, no lift
  await t.click('[data-testid="btn-disabled"]');
  await t.wait(100);
  t.expectEqual(await t.text('[data-testid="blocked"]'), '0', 'disabled button ignores clicks');
  await t.hover('[data-testid="btn-disabled"]');
  await t.wait(300);
  p = await tf('[data-testid="btn-disabled"]');
  t.expect(Math.abs(p.y) < 0.1, 'disabled does not lift');

  // Loading: width held, label stays, aria-busy, second click ignored, focus kept
  const w0 = (await t.rect('[data-testid="btn-load"]')).width;
  await t.click('[data-testid="btn-load"]');
  await t.wait(200);
  const w1 = (await t.rect('[data-testid="btn-load"]')).width;
  t.expect(Math.abs(w1 - w0) <= 1, `width held while loading (${w0} -> ${w1})`);
  t.expectEqual(await t.attr('[data-testid="btn-load"]', 'aria-busy'), 'true', 'aria-busy while loading');
  t.expect((await t.text('[data-testid="btn-load"]')).includes('Guardar cambios'), 'label stays while loading');
  await t.click('[data-testid="btn-load"]');
  await t.wait(100);
  t.expectEqual(await t.text('[data-testid="saves-load"]'), '3', 'second click while loading ignored (2 earlier + 1)');
  const stillFocusable = await t.eval(() => { const b = document.querySelector('[data-testid="btn-load"]'); b.focus(); return document.activeElement === b; });
  t.expect(stillFocusable, 'loading button keeps focus');
  await t.wait(1600);
  t.expectEqual(await t.attr('[data-testid="btn-load"]', 'aria-busy'), null, 'aria-busy cleared after loading');
  const w2 = (await t.rect('[data-testid="btn-load"]')).width;
  t.expect(Math.abs(w2 - w0) <= 1, `width back to rest (${w2} vs ${w0})`);

  // Icon-only has an accessible name
  t.expectEqual(await t.attr('[data-testid="btn-icon"]', 'aria-label'), 'Agregar', 'icon-only has aria-label');
  await t.screenshot(`button-interact${t.reducedMotion ? '-reduced' : ''}`);
}
