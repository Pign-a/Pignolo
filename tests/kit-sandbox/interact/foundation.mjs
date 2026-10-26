// Example interaction test: proves the helpers and the foundation (tiers, press, focus, reduced motion).
export default async function (t) {
  const boxX = () => t.eval(() => document.querySelector('[data-testid="tier-box-direct"]').getBoundingClientRect().x);

  // Author decision 1: controls have no bounce; momentum keeps 0.2, data stays 0.
  const spec = (n) => t.eval((id) => document.querySelector(`[data-testid="tier-spec-${id}"]`).textContent.replace(/\s+/g, " ").trim(), n);
  t.expectEqual(await spec("direct"), "direct 0.22 s, bounce 0, exit 100 ms", "direct tier is 0.22 s, bounce 0, exit 100 ms");
  t.expect((await spec("momentum")).includes("bounce 0.2"), "momentum tier keeps bounce 0.2");
  t.expect((await spec("data")).includes("bounce 0,"), "data tier keeps bounce 0");
  // No hover lift in the foundation: hovering a pressable button does not move it.
  const top0 = await t.eval(() => document.querySelector('[data-testid="tier-toggle-direct"]').getBoundingClientRect().y + window.scrollY);
  await t.hover('[data-testid="tier-toggle-direct"]');
  await t.wait(400);
  const top1 = await t.eval(() => document.querySelector('[data-testid="tier-toggle-direct"]').getBoundingClientRect().y + window.scrollY);
  t.expect(Math.abs(top1 - top0) < 0.01, `hover does not lift the button (dy ${(top1 - top0).toFixed(2)})`);

  const x0 = await boxX();
  await t.click('[data-testid="tier-toggle-direct"]');
  await t.wait(900);
  const x1 = await boxX();
  if (t.reducedMotion) {
    t.expect(Math.abs(x1 - x0) < 1, 'reduced motion: no travel');
  } else {
    t.expect(x1 - x0 > 150, `direct box travels right (moved ${Math.round(x1 - x0)}px)`);
  }

  // Interruptible: toggle twice quickly, ends back at the start.
  await t.click('[data-testid="tier-toggle-direct"]');
  await t.wait(60);
  await t.click('[data-testid="tier-toggle-direct"]');
  await t.wait(900);
  t.expect(Math.abs((await boxX()) - x1) < 1 || t.reducedMotion, 'double toggle returns to the same place');

  // Press feedback: scale ~0.97 while the button is held (not under reduced motion).
  await t.mouseDown('[data-testid="tier-toggle-momentum"]');
  await t.wait(150);
  const scale = await t.eval(() => {
    const m = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('[data-testid="tier-toggle-momentum"]')).transform);
    const sc = getComputedStyle(document.querySelector('[data-testid="tier-toggle-momentum"]')).scale;
    return m.a * (sc && sc !== "none" ? parseFloat(sc) : 1);
  });
  await t.mouseUp();
  if (!t.reducedMotion) t.expect(scale > 0.95 && scale < 0.99, `press scale near 0.97 (got ${scale.toFixed(3)})`);

  // Keyboard: Tab reaches a button, focus ring is drawn from tokens, Enter activates.
  await t.focus('[data-testid="tier-toggle-data"]');
  await t.press('Enter');
  await t.wait(900);
  t.expectEqual(await t.attr('[data-testid="tier-box-data"]', 'data-on'), 'true', 'Enter toggles the data box');
  await t.press('Tab');
  await t.press('Tab');
  const outline = await t.eval(() => getComputedStyle(document.activeElement).outlineStyle);
  t.expect(outline === 'solid', `focus-visible outline after keyboard Tab (got ${outline})`);
}
