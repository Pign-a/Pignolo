// Tooltip: no delay, enter/exit timing sampled mid-animation, trigger to trigger, keyboard focus + Escape, sides, reduced motion.
export default async function (t) {
  const TIP = '[data-radix-popper-content-wrapper] > [data-state]';
  const info = () => t.eval((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const cs = getComputedStyle(e);
    const m = new DOMMatrixReadOnly(cs.transform);
    return { text: e.textContent.trim(), opacity: parseFloat(cs.opacity), scale: m.a, ty: m.f, tx: m.e, rect: e.getBoundingClientRect().toJSON() };
  }, TIP);

  t.expectEqual(await info(), null, 'no tooltip at rest');

  // Leaving like a real pointer: a few small moves, so Radix's grace area (hoverable content) is left too.
  const leave = async () => {
    await t.hover('h1');
    const r = await t.rect('h1');
    for (let k = 1; k <= 3; k++) await t.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.cx + 6 * k, y: r.cy, button: 'none' });
  };

  // Hover: appears with no delay; sample mid-enter
  await t.hover('[data-testid="tip-edit"]');
  await t.wait(35);
  let i = await info();
  t.expect(i !== null, 'tooltip mounted within 35 ms (no delay)');
  if (!t.reducedMotion) {
    t.expect(i.opacity > 0 && i.opacity < 0.98 || i.scale < 0.999, `mid-enter at 35 ms (opacity ${i.opacity.toFixed(2)}, scale ${i.scale.toFixed(3)})`);
    t.expect(i.scale >= 0.95, `entry never scales below 0.92 (got ${i.scale.toFixed(3)})`);
  } else {
    t.expect(Math.abs(i.scale - 1) < 0.001 && Math.abs(i.ty) < 0.01, `reduced: no scale or travel (scale ${i.scale}, ty ${i.ty})`);
  }
  await t.wait(250);
  i = await info();
  t.expectEqual(i.text, 'Editar', 'text from props');
  t.expect(i.opacity > 0.99 && Math.abs(i.scale - 1) < 0.001 && Math.abs(i.ty) < 0.01, 'fully entered');
  const trig = await t.rect('[data-testid="tip-edit"]');
  t.expect(i.rect.y + i.rect.height < trig.y, 'tooltip sits above the trigger');
  t.expect((await t.attr('[data-testid="tip-edit"]', 'aria-describedby')) !== null, 'trigger is described by the tooltip');
  t.expect(await t.exists('[role="tooltip"]'), 'role=tooltip present for assistive tech');

  // Leave: exit is faster (about 80 ms)
  await leave();
  await t.wait(35);
  i = await info();
  if (!t.reducedMotion) t.expect(i === null || i.opacity < 0.99, 'exit already started at 35 ms');
  await t.wait(200);
  t.expectEqual(await info(), null, 'tooltip unmounted shortly after leaving (exit about 80 ms)');

  // F2 (WCAG 1.4.13): the tip is hoverable. Moving the pointer onto it keeps it open; Escape and leaving close it.
  await t.hover('[data-testid="tip-edit"]');
  await t.wait(250);
  await t.hover(TIP);
  await t.wait(500);
  i = await info();
  t.expect(i !== null && i.opacity > 0.99, 'the tooltip stays open while the pointer is over it (hoverable content)');
  await t.press('Escape');
  await t.wait(250);
  t.expectEqual(await info(), null, 'Escape dismisses a tooltip that is being hovered');
  await t.hover('[data-testid="tip-edit"]');
  await t.wait(250);
  await t.hover(TIP);
  await t.wait(200);
  await leave();
  await t.wait(400);
  t.expectEqual(await info(), null, 'leaving the tooltip closes it');

  // Trigger to trigger: the second shows at once
  await t.hover('[data-testid="tip-edit"]');
  await t.wait(300);
  await t.hover('[data-testid="tip-copy"]');
  // A real pointer keeps moving: the first pointermove after leaving is ignored by Radix while the pointer is in
  // transit towards the first (hoverable) tip, so nudge a little like a hand would.
  { const r = await t.rect('[data-testid="tip-copy"]'); for (let k = 1; k <= 6; k++) { await t.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.cx + 2 * k, y: r.cy, button: 'none' }); await t.wait(25); } }
  await t.wait(20);
  const texts = await t.eval((sel) => [...document.querySelectorAll(sel)].map((e) => e.textContent.trim()), TIP);
  t.expect(texts.includes('Duplicar'), `second tooltip appears within about 170 ms of leaving the first (${texts.join(',')})`);
  await t.wait(250);
  t.expectEqual(await t.count(TIP), 1, 'only one tooltip visible after moving between triggers');

  // Rapid in/out ends clean
  for (let k = 0; k < 6; k++) { await t.hover('[data-testid="tip-trash"]'); await t.wait(25); await leave(); await t.wait(25); }
  await t.wait(350);
  t.expectEqual(await info(), null, 'no stuck tooltip after rapid hover in and out');

  // Keyboard: focus shows, Escape hides
  await t.eval(() => document.querySelector('[role="group"] button:last-child').focus());
  await t.press('Tab');
  await t.wait(250);
  t.expectEqual(await t.eval(() => document.activeElement.getAttribute('data-testid')), 'tip-edit', 'Tab reaches the first trigger');
  i = await info();
  t.expect(i && i.text === 'Editar', 'keyboard focus shows the tooltip');
  await t.press('Escape');
  await t.wait(250);
  t.expectEqual(await info(), null, 'Escape hides the tooltip');

  // Keyboard focus that makes the browser scroll the trigger into view must still show the tip
  // (Radix closes a tip on any scroll; the kit ignores the scroll that follows a focus).
  await t.press('Escape');
  await t.eval(() => {
    const sec = document.querySelector('[data-testid="tips"]');
    const before = document.createElement('button');
    before.id = 'scroll-before';
    before.textContent = 'before';
    const spacer = document.createElement('div');
    spacer.style.height = '1800px';
    sec.parentNode.insertBefore(before, sec);
    sec.parentNode.insertBefore(spacer, sec);
    window.scrollTo(0, 0);
  });
  await t.wait(100);
  await t.eval(() => document.getElementById('scroll-before').focus());
  await t.press('Tab');
  await t.wait(400);
  t.expectEqual(await t.eval(() => document.activeElement.getAttribute('data-testid')), 'tip-edit', 'Tab reaches the off-screen trigger');
  t.expect((await t.eval(() => window.scrollY)) > 500, 'the browser scrolled the trigger into view');
  i = await info();
  t.expect(i && i.text === 'Editar', 'tooltip stays open when focus scrolls the trigger into view');
  await t.press('Escape');
  await t.wait(250);
  t.expectEqual(await info(), null, 'Escape hides it after the scroll');
  await t.eval(() => { document.getElementById('scroll-before').nextElementSibling.remove(); document.getElementById('scroll-before').remove(); window.scrollTo(0, 0); });

  // F3: a tooltip describes, it does not name. An unnamed icon-only trigger warns in development.
  await t.eval(() => { window.__warns = []; const w = console.warn; console.warn = (...a) => { window.__warns.push(a.join(' ')); w.apply(console, a); }; });
  await t.click('[data-testid="tip-reveal-unnamed"]');
  await t.wait(200);
  const warns = await t.eval(() => window.__warns);
  // The warning is development only: it is stripped from a production build (the default of this check).
  // Run `NODE_ENV=development npm run check -- --route tooltip --interact interact/tooltip.mjs` to assert it.
  if (process.env.NODE_ENV === 'development') {
    t.expect(warns.some((w) => w.includes('aria-label')), `dev build: an icon-only trigger without aria-label warns (${JSON.stringify(warns)})`);
    t.expect(warns.filter((w) => w.includes('kit Tooltip')).length >= 1, 'the warning names the kit Tooltip (StrictMode may run the effect twice)');
  } else {
    t.expectEqual(warns.filter((w) => w.includes('kit Tooltip')).length, 0, 'production build: the dev warning is stripped');
  }
  // The named triggers of the page never warned: they were mounted before the hook, so check the contract by attribute
  t.expectEqual(await t.attr('[data-testid="tip-edit"]', 'aria-label'), 'Editar', 'icon-only triggers carry their own aria-label');

  // Sides
  await t.hover('[data-testid="tip-bottom"]');
  await t.wait(300);
  i = await info();
  const rb = await t.rect('[data-testid="tip-bottom"]');
  t.expect(i && i.rect.y > rb.y + rb.height - 1, 'side=bottom places it below');
  await t.hover('[data-testid="tip-right"]');
  { const r = await t.rect('[data-testid="tip-right"]'); for (let k = 1; k <= 4; k++) { await t.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.cx + 2 * k, y: r.cy, button: 'none' }); await t.wait(25); } }
  await t.wait(300);
  i = await info();
  const rr = await t.rect('[data-testid="tip-right"]');
  t.expect(i && i.rect.x > rr.x + rr.width - 1, 'side=right places it to the right');
  await t.screenshot(`tooltip-interact${t.reducedMotion ? '-reduced' : ''}`);
}
