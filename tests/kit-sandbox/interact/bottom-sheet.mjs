// Bottom sheet: entry/exit, backdrop follows position, drag with velocity projection and rubber band, focus without scroll, keyboard.
export default async function (t) {
  const dlg = '[role="dialog"]';
  const handle = `${dlg} [data-handle]`;
  const state = () =>
    t.eval(() => {
      const d = document.querySelector('[role="dialog"]');
      if (!d) return null;
      const cs = getComputedStyle(d);
      const mat = new DOMMatrixReadOnly(cs.transform === 'none' ? undefined : cs.transform);
      const ov = [...document.querySelectorAll('div[data-state="open"]')].find((e) => e.getAttribute('role') !== 'dialog' && getComputedStyle(e).position === 'fixed');
      return { y: mat.m42, opacity: parseFloat(cs.opacity), backdrop: ov ? parseFloat(getComputedStyle(ov).opacity) : null, h: d.getBoundingClientRect().height - 120 };
    });
  const scrolls = () => t.eval(() => ({ wrap: document.querySelector('[data-testid="wrap"]').scrollTop, doc: document.scrollingElement.scrollTop, win: window.scrollY }));
  const gone = () => t.eval(() => !document.querySelector('[role="dialog"]'));
  const log = () => t.text('[data-testid="log"]');
  const open = async (id = 'open-share') => {
    await t.click(`[data-testid="${id}"]`);
    await t.waitFor(dlg);
    await t.wait(900);
  };

  const scroll0 = await scrolls();

  // Entry: mid flight at 60 ms, rest at y 0 with the backdrop fully shown.
  await t.click('[data-testid="open-share"]');
  await t.wait(60);
  const early = await state();
  t.expect(early !== null, 'sheet mounted 60 ms after the click');
  if (t.reducedMotion) {
    t.expect(Math.abs(early.y) < 0.5, `reduced motion: no slide (y ${early.y.toFixed(1)})`);
    t.expect(early.opacity < 1, `reduced motion: cross-fade (opacity ${early.opacity.toFixed(2)})`);
  } else {
    t.expect(early.y > 5 && early.y < early.h + 24, `sheet is sliding up (y ${early.y.toFixed(0)} of ${Math.round(early.h)})`);
    t.expect(early.backdrop > 0 && early.backdrop < 1, `backdrop follows the sheet (${early.backdrop.toFixed(2)})`);
  }
  await t.wait(900);
  const rest = await state();
  t.expect(Math.abs(rest.y) < 0.5 && rest.opacity === 1 && rest.backdrop === 1, `rests at y 0 with backdrop 1 (${JSON.stringify(rest)})`);

  // The round 1 bug: focus must not scroll any container.
  t.expectEqual(await scrolls(), scroll0, 'opening and focusing scrolled nothing');
  t.expect(await t.eval(() => !!document.activeElement?.closest('[role="dialog"]')), 'focus is inside the sheet');
  t.expectEqual(await t.eval(() => getComputedStyle(document.querySelector('[role="dialog"]')).overflow), 'clip', 'sheet root uses overflow: clip');
  t.expectEqual(await t.eval(() => document.activeElement?.textContent), 'Copiar', 'first control in the content gets focus (not the close button)');
  t.expectEqual(await t.eval(() => document.querySelector('[role="dialog"] h2').textContent), 'Compartir informe', 'title present');
  t.expect((await t.eval(() => document.querySelector('[role="dialog"]').getAttribute('aria-labelledby'))) !== null, 'sheet is labelled');

  // Focus trap.
  for (let i = 0; i < 6; i++) {
    await t.press('Tab');
    await t.wait(20);
    t.expect(await t.eval(() => !!document.activeElement?.closest('[role="dialog"]')), `Tab ${i + 1} stays inside`);
  }
  t.expect((await t.eval(() => getComputedStyle(document.activeElement).outlineStyle)) === 'solid', 'focus ring visible');

  // Esc closes with the fast tween; focus returns to the opener without scrolling.
  await t.press('Escape');
  await t.wait(60);
  if (!t.reducedMotion) {
    const mid = await state();
    t.expect(mid === null || mid.y > 5, `closing slides down (y ${mid ? mid.y.toFixed(0) : 'gone'})`);
  }
  await t.wait(500);
  t.expect(await gone(), 'unmounted after the exit');
  t.expectEqual(await t.eval(() => document.activeElement?.getAttribute('data-testid')), 'open-share', 'focus returns to the opener');
  t.expectEqual(await scrolls(), scroll0, 'closing scrolled nothing either');

  // A large overlay leaves in 150 to 180 ms (design critic F19), longer than the 130 ms of the momentum tier.
  await open();
  await t.press('Escape');
  const exitMs = await t.eval(() => new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => (document.querySelector('[role="dialog"]') ? requestAnimationFrame(tick) : resolve(performance.now() - t0));
    tick();
  }));
  if (!t.reducedMotion) t.expect(exitMs >= 140 && exitMs <= 260, `the sheet exit takes 150 to 180 ms (${Math.round(exitMs)} ms)`);
  await t.wait(300);

  // Slow short drag returns to rest.
  await open();
  const h0 = (await state()).h;
  await t.drag(handle, { dx: 0, dy: 40 }, { steps: 20 });
  await t.wait(900);
  const back = await state();
  t.expect(back !== null && Math.abs(back.y) < 0.5, `a slow short drag springs back (y ${back ? back.y.toFixed(1) : 'gone'})`);

  // Mid drag, pulling up: the rubber band caps the travel (the pointer moves 300 px, the sheet far less).
  const pull = t.drag(handle, { dx: 0, dy: -300 }, { steps: 30 });
  await t.wait(330);
  const up = await state();
  // Author report: pulling up showed the page below the sheet, as if it were cut. The body must still cover the bottom edge.
  const gap = await t.eval(() => {
    const d = document.querySelector('[role="dialog"]');
    const r = d.getBoundingClientRect();
    const cx = Math.round(r.left + r.width / 2);
    const probe = (y) => !!document.elementFromPoint(cx, y)?.closest('[role="dialog"]');
    const bg = getComputedStyle(d).backgroundColor;
    return { moved: new DOMMatrixReadOnly(getComputedStyle(d).transform).m42, bottom: r.bottom, vh: window.innerHeight, covered: [1, 2, 6, 20].every((k) => probe(window.innerHeight - k)), bg };
  });
  t.expect(gap.moved < -10, `the sheet is pulled up (${gap.moved.toFixed(1)} px)`);
  t.expect(gap.bottom >= gap.vh, `the sheet bottom stays at or below the viewport edge while pulled up (bottom ${gap.bottom.toFixed(1)}, viewport ${gap.vh})`);
  t.expect(gap.covered, 'sheet surface still covers the last pixels of the viewport while pulled up (no gap below)');
  await pull;
  t.expect(up.y < -10 && up.y > -120, `rubber band: pointer pulled up ~200 px, sheet moved ${up.y.toFixed(1)} px`);
  t.expect(Math.abs(up.y) < 100, 'rubber band stays well under the pointer travel');
  await t.wait(900);
  t.expect(Math.abs((await state()).y) < 0.5, 'after the rubber band the sheet returns to rest');

  // Mid drag, pulling down: the sheet follows and the backdrop fades with it.
  const down = t.drag(handle, { dx: 0, dy: 90 }, { steps: 30 });
  await t.wait(330);
  const dn = await state();
  await down;
  t.expect(dn.y > 20 && dn.y < 100, `sheet follows the pointer down (${dn.y.toFixed(1)} px)`);
  if (!t.reducedMotion) t.expect(dn.backdrop < 1 && dn.backdrop > 0.5, `backdrop fades while dragging (${dn.backdrop.toFixed(2)})`);
  await t.wait(900);
  t.expect(Math.abs((await state()).y) < 0.5, 'released with low velocity: back at rest');

  // Velocity projection: a small but fast flick dismisses...
  const projectedBefore = await state();
  t.expect(projectedBefore.h > 150, `sheet height ${Math.round(projectedBefore.h)}`);
  const dist = Math.round(projectedBefore.h * 0.18);
  await t.drag(handle, { dx: 0, dy: dist }, { steps: 2 });
  await t.wait(30);
  const flicking = await state();
  if (!t.reducedMotion) t.expect(flicking === null || flicking.y > dist, `flick of ${dist}px keeps going (y ${flicking ? flicking.y.toFixed(0) : 'gone'})`);
  await t.wait(1200);
  t.expect(await gone(), `a fast flick of only ${dist}px (18% of the height) dismisses by projection`);
  t.expectEqual(await t.eval(() => document.activeElement?.getAttribute('data-testid')), 'open-share', 'focus returns after a drag dismiss');

  // ...and a long slow drag past half the height also dismisses.
  await open();
  const h1 = (await state()).h;
  await t.drag(handle, { dx: 0, dy: Math.round(h1 * 0.8) }, { steps: 40 });
  await t.wait(1200);
  t.expect(await gone(), 'dragging past the half way point dismisses');

  // Backdrop click, close button and Done button.
  await open();
  await t.eval(() => {
    const o = [...document.querySelectorAll('div[data-state="open"]')].find((e) => e.getAttribute('role') !== 'dialog' && getComputedStyle(e).position === 'fixed');
    o.setAttribute('data-test-overlay', '');
    Object.assign(o.style, { right: 'auto', bottom: 'auto', width: '60px', height: '60px' });
  });
  await t.click('[data-test-overlay]');
  await t.wait(700);
  t.expect(await gone(), 'backdrop click closes');
  await open();
  await t.click(`${dlg} button[aria-label="Cerrar"]`);
  await t.wait(700);
  t.expect(await gone(), 'close button closes');
  await open();
  await t.click('[data-testid="done"]');
  await t.wait(700);
  t.expect(await gone(), 'footer button closes');
  t.expectEqual(await log(), 'listo', 'footer action ran');

  // Clicking the close button must not start a drag (it sits in the drag zone).
  await open();
  await t.click(`${dlg} button[aria-label="Cerrar"]`);
  await t.wait(700);
  t.expect(await gone(), 'close inside the drag zone still works');

  // Open then close before the entry ends: ends clean and unmounted.
  await t.click('[data-testid="open-share"]');
  await t.wait(50);
  await t.press('Escape');
  await t.wait(1000);
  t.expect(await gone(), 'closing mid entry unmounts');
  t.expect(await t.eval(() => getComputedStyle(document.body).pointerEvents !== 'none'), 'page interactive again');

  // Second sheet: autofocus input, long list scrolls inside, pick closes.
  await t.click('[data-testid="open-pick"]');
  await t.waitFor(dlg);
  await t.wait(900);
  t.expectEqual(await t.eval(() => document.activeElement?.getAttribute('data-testid')), 'search', 'data-autofocus gets focus');
  t.expectEqual(await scrolls(), scroll0, 'autofocus on an input scrolled nothing');
  const sizes = await t.eval(() => {
    const d = document.querySelector('[role="dialog"]');
    const body = d.querySelector('[data-sheet-content]');
    return { h: d.getBoundingClientRect().height - 120, vh: window.innerHeight, overflow: body.scrollHeight > body.clientHeight };
  });
  t.expect(sizes.h <= sizes.vh * 0.85 + 1, `sheet is capped at 85% of the viewport (${Math.round(sizes.h)} of ${sizes.vh})`);
  t.expect(sizes.overflow, 'long content scrolls inside the sheet');
  // Author report: the currency list showed the browser's default scrollbar. It must use the kit-scroll style.
  await t.cdp('Emulation.setScrollbarsHidden', { hidden: false }); // the check browser hides scrollbars by default
  await t.wait(100);
  const sb = await t.eval(() => {
    const body = document.querySelector('[role="dialog"] [data-sheet-content]');
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:200px;height:60px;overflow-y:scroll;visibility:hidden';
    probe.innerHTML = '<div style="height:400px"></div>';
    document.body.appendChild(probe);
    const plain = probe.offsetWidth - probe.clientWidth;
    probe.className = 'kit-scroll';
    const thin = probe.offsetWidth - probe.clientWidth;
    probe.remove();
    const cs = getComputedStyle(body);
    return { cls: body.className.includes('kit-scroll'), width: cs.scrollbarWidth, color: cs.scrollbarColor, gutter: body.offsetWidth - body.clientWidth, plain, thin };
  });
  t.expect(sb.cls, 'the sheet scroll area carries kit-scroll');
  t.expectEqual(sb.width, 'thin', 'scrollbar-width is thin');
  t.expect(sb.color !== 'auto' && sb.color.includes('rgb'), `scrollbar-color comes from the tokens (${sb.color})`);
  // The check browser hides scrollbars by default (gutters are 0); with real ones, thin must be narrower.
  if (sb.plain > 0) {
    t.expect(sb.gutter > 0 && sb.gutter <= sb.thin, `the gutter is the thin one (${sb.gutter} px, thin ${sb.thin} px, default ${sb.plain} px)`);
    t.expect(sb.thin < sb.plain, `kit-scroll is narrower than the default scrollbar (${sb.thin} < ${sb.plain})`);
  }
  // forced colors: the system draws it.
  await t.emulate([{ name: 'forced-colors', value: 'active' }]);
  t.expectEqual(await t.eval(() => getComputedStyle(document.querySelector('[role="dialog"] [data-sheet-content]')).scrollbarColor), 'auto', 'forced colors: scrollbar-color is auto');
  await t.emulate([]);
  await t.screenshot(`bottom-sheet-scrollbar-${t.reducedMotion ? 'reduced' : 'motion'}`);
  await t.cdp('Emulation.setScrollbarsHidden', { hidden: true });
  await t.screenshot(`bottom-sheet-pick-${t.reducedMotion ? 'reduced' : 'motion'}`);
  await t.click(`${dlg} li:nth-child(3) button`);
  await t.wait(900);
  t.expectEqual(await t.text('[data-testid="chosen"]'), 'Euro', 'picking an option works');
  t.expect(await gone(), 'picking closes');

  // Capture of the share sheet.
  await open();
  await t.screenshot(`bottom-sheet-share-${t.reducedMotion ? 'reduced' : 'motion'}`);
  await t.press('Escape');
  await t.wait(700);
}
