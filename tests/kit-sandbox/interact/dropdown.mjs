// Dropdown (APG select-only combobox on a non modal Radix Popover): semantics, forms, keyboard, typeahead,
// direct tier timing, first open vs later opens, read only style, page scroll never locked, reduced motion.
export default async function (t) {
  const trig = '[data-testid="dd-order"] [role="combobox"]';
  const menu = '[role="listbox"]';
  const info = () =>
    t.eval(() => {
      const m = document.querySelector('[role="listbox"]');
      if (!m) return null;
      const cs = getComputedStyle(m);
      const mat = new DOMMatrixReadOnly(cs.transform === 'none' ? undefined : cs.transform);
      return { opacity: parseFloat(cs.opacity), scale: mat.a, ty: mat.m42 };
    });
  // Focus stays on the trigger; the highlighted option is named by aria-activedescendant.
  const activeText = () =>
    t.eval(() => {
      const id = document.activeElement?.getAttribute('aria-activedescendant');
      return id ? document.getElementById(id)?.textContent?.trim() ?? '' : '';
    });
  const key = async (k) => { await t.press(k); await t.wait(60); };
  const value = () => t.text('[data-testid="dd-order-value"]');
  const isCombo = () => t.eval(() => document.activeElement?.getAttribute('role') === 'combobox');
  const scrollY = () => t.eval(() => window.scrollY);
  const wheel = (x, y, deltaY) => t.cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY });

  // Semantics (WAI-ARIA APG select-only combobox).
  t.expectEqual(await t.attr(trig, 'role'), 'combobox', 'trigger is a combobox, not a menu button');
  t.expectEqual(await t.attr(trig, 'aria-haspopup'), null, 'no menu semantics on a select');
  t.expectEqual(await t.attr(trig, 'aria-expanded'), 'false', 'closed at start');
  t.expect((await t.attr(trig, 'aria-labelledby')) !== null, 'trigger is named by the visible label');
  t.expectEqual(await t.eval(() => document.querySelector('[data-testid="dd-order"] select[name="orden"]')?.value), 'recientes', 'native select inside the form carries the value');
  t.expectEqual(await t.eval(() => [...document.querySelectorAll('[data-testid="dd-order"] [role="combobox"]')].every((b) => b.getAttribute('aria-required') !== 'true' && !b.hasAttribute('aria-invalid'))), true, 'a valid optional control is neither required nor invalid');
  t.expectEqual(await t.eval(() => { const b = [...document.querySelectorAll('[role="combobox"]')].find((x) => x.closest('section')?.textContent.includes('Cuenta de destino')); return [b.getAttribute('aria-invalid'), b.getAttribute('aria-required')]; }), ['true', 'true'], 'error + required combobox carries aria-invalid and aria-required');
  t.expectEqual(await t.eval(() => document.querySelectorAll('div[aria-labelledby]:not([role])').length), 0, 'no roleless element carries aria-labelledby');

  // Read only: a styled, labelled, focusable, copyable field. Not the faded disabled look, no chevron, no popup.
  const ro = '[data-testid="dd-readonly"]';
  t.expectEqual(await t.eval(() => { const i = document.querySelector('[data-testid="dd-readonly"] input'); return [i.readOnly, i.value, document.getElementById(i.getAttribute('aria-labelledby'))?.textContent]; }), [true, 'Más antiguos', 'Moneda base'], 'read only is an input named by its label');
  const roStyle = await t.eval(() => {
    const box = document.querySelector('[data-testid="dd-readonly"] [data-readonly-field]');
    const live = document.querySelector('[data-testid="dd-order"] [role="combobox"]');
    const dis = [...document.querySelectorAll('[role="combobox"]')].find((b) => b.disabled);
    const input = box.querySelector('input');
    const cs = getComputedStyle(box);
    return {
      boxBg: cs.backgroundColor, liveBg: getComputedStyle(live).backgroundColor,
      boxBorder: cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor,
      color: getComputedStyle(input).color, onSurface: getComputedStyle(document.body).getPropertyValue('--color-on-surface').trim(),
      opacity: getComputedStyle(box).opacity, input: getComputedStyle(input).opacity, disabledOpacity: getComputedStyle(dis).opacity,
      chevron: box.querySelectorAll('svg:not([data-readonly-mark])').length, lock: box.querySelectorAll('svg[data-readonly-mark][aria-hidden="true"]').length,
      cursor: getComputedStyle(input).cursor, select: getComputedStyle(input).userSelect, role: box.querySelector('[role="combobox"]') ? 1 : 0,
    };
  });
  t.expect(roStyle.boxBg !== roStyle.liveBg, `read only has its own fill, different from an editable trigger (${roStyle.boxBg} vs ${roStyle.liveBg})`);
  t.expect(parseFloat(roStyle.boxBorder) >= 1 && roStyle.boxBorder.includes('solid'), `read only has a visible border (${roStyle.boxBorder})`);
  t.expectEqual([roStyle.opacity, roStyle.input], ['1', '1'], 'read only text is at full contrast, not faded like disabled');
  t.expect(parseFloat(roStyle.disabledOpacity) < 0.5, `disabled stays faded (${roStyle.disabledOpacity}), so the two states differ`);
  t.expectEqual([roStyle.chevron, roStyle.lock], [0, 1], 'read only: no chevron, one decorative lock mark');
  t.expect(roStyle.cursor !== 'pointer' && roStyle.select === 'text', `read only is not clickable-looking and text can be selected (cursor ${roStyle.cursor}, user-select ${roStyle.select})`);
  t.expectEqual(roStyle.role, 0, 'read only is not a combobox, so nothing promises a popup');
  const borderRest = await t.style(`${ro} [data-readonly-field]`, 'border-top-color');
  const bgRest = await t.style(`${ro} [data-readonly-field]`, 'background-color');
  await t.hover(`${ro} [data-readonly-field]`);
  await t.wait(200);
  t.expectEqual([await t.style(`${ro} [data-readonly-field]`, 'border-top-color'), await t.style(`${ro} [data-readonly-field]`, 'background-color')], [borderRest, bgRest], 'read only gives no hover highlight (it does not suggest editing)');
  await t.click(`${ro} input`);
  await t.wait(500);
  t.expect(!(await t.exists(menu)), 'clicking a read only field opens nothing');
  t.expectEqual(await t.eval(() => document.activeElement === document.querySelector('[data-testid="dd-readonly"] input')), true, 'read only is focusable');
  t.expectEqual(await t.style(`${ro} input`, 'outline-style'), 'solid', 'read only shows the focus ring when focused by keyboard');
  const copied = await t.eval(() => { const i = document.querySelector('[data-testid="dd-readonly"] input'); i.focus(); i.select(); return getSelection().toString() || i.value.slice(i.selectionStart, i.selectionEnd); });
  t.expectEqual(copied, 'Más antiguos', 'the value can be selected and copied');
  await t.emulate([{ name: 'forced-colors', value: 'active' }]);
  await t.wait(150);
  t.expectEqual(await t.style(`${ro} [data-readonly-field]`, 'border-top-style'), 'dashed', 'forced colors: read only is told apart by a dashed system-color border');
  await t.emulate([]);
  await t.wait(100);
  await t.eval(() => document.activeElement?.blur());

  // Keyboard open: focus stays on the trigger, the highlight is the selected option.
  await t.focus(trig);
  await t.press('Enter');
  await t.waitFor(menu);
  await t.wait(500);
  t.expectEqual(await t.attr(trig, 'aria-expanded'), 'true', 'aria-expanded true when open');
  t.expectEqual(await t.attr(trig, 'aria-controls'), await t.attr(menu, 'id'), 'aria-controls points at the listbox');
  t.expect(await isCombo(), 'DOM focus stays on the combobox (aria-activedescendant model)');
  t.expectEqual(await activeText(), 'Más recientes', 'the selected option is highlighted when opened by keyboard');
  const states = await t.eval(() => [...document.querySelectorAll('[role="option"]')].map((e) => e.getAttribute('aria-selected')));
  t.expectEqual(states, ['true', 'false', 'false', 'false', 'false', 'false'], 'one option selected');

  // Direct tier: no stagger on the items.
  const timing = await t.eval(() => [...document.querySelectorAll('[role="option"]')].map((e) => e.getAnimations().length));
  t.expect(timing.every((n) => n === 0), 'options do not animate one by one (no per-item stagger)');

  // Arrow keys move the highlight and it follows.
  await key('ArrowDown');
  await t.wait(500);
  t.expectEqual(await activeText(), 'Más antiguos', 'ArrowDown moves to the next option');
  const hlRest = () =>
    t.eval(() => {
      const span = document.querySelector('[role="listbox"] > span[aria-hidden="true"]');
      const item = document.getElementById(document.activeElement.getAttribute('aria-activedescendant'));
      const sr = span.getBoundingClientRect();
      const ir = item.getBoundingClientRect();
      return { dy: Math.abs(sr.top - ir.top), dh: Math.abs(sr.height - ir.height) };
    });
  const hlPos = await hlRest();
  t.expect(hlPos.dy < 2 && hlPos.dh < 2, `highlight rests on the active option (dy ${hlPos.dy.toFixed(1)}, dh ${hlPos.dh.toFixed(1)})`);

  // Mid slide (not under reduced motion).
  const hlTop = async () => (await hlRest()).dy;
  if (!t.reducedMotion) {
    await key('ArrowDown');
    await key('ArrowDown');
    await t.wait(40);
    const mid = await hlTop();
    t.expect(mid > 2, `highlight is still travelling 40 ms after the move (${mid.toFixed(1)} px away)`);
    await t.wait(500);
  } else {
    await key('ArrowDown');
    await key('ArrowDown');
    await t.wait(50);
    t.expect((await hlTop()) < 2, 'reduced motion: highlight jumps with no travel');
  }

  // No wrap (native select behavior), Home and End.
  await key('Home');
  t.expectEqual(await activeText(), 'Más recientes', 'Home goes to the first option');
  await key('ArrowUp');
  t.expectEqual(await activeText(), 'Más recientes', 'ArrowUp from the first stays on the first (no wrap)');
  await key('End');
  t.expectEqual(await activeText(), 'Por categoría', 'End goes to the last option');
  await key('ArrowDown');
  t.expectEqual(await activeText(), 'Por categoría', 'ArrowDown from the last stays on the last');

  // Typeahead inside the open menu.
  for (const c of 'may') await key(c);
  t.expectEqual(await activeText(), 'Mayor monto', 'typing "may" jumps to Mayor monto');

  // Enter picks, closes; focus never left the trigger.
  await t.press('Enter');
  await t.wait(500);
  t.expect(!(await t.exists(menu)), 'menu removed after picking');
  t.expectEqual(await value(), 'mayor', 'value updated');
  t.expectEqual(await t.eval(() => document.querySelector('[data-testid="dd-order"] select[name="orden"]').value), 'mayor', 'native select follows the value');
  t.expect(await isCombo(), 'focus is on the trigger after picking');

  // Esc closes and keeps focus.
  await key('ArrowDown');
  await t.waitFor(menu);
  await t.wait(300);
  t.expectEqual(await activeText(), 'Mayor monto', 'ArrowDown opens on the selected option');
  await t.press('Escape');
  await t.wait(500);
  t.expect(!(await t.exists(menu)), 'Esc closes the menu');
  t.expect(await isCombo(), 'Esc keeps focus on the trigger');
  t.expectEqual(await value(), 'mayor', 'Esc keeps the value');

  // Typeahead on the closed trigger changes the value without opening.
  await t.press('a');
  t.expectEqual(await value(), 'alfabetico', 'typing on the closed trigger picks the match');
  t.expect(!(await t.exists(menu)), 'typeahead does not open the menu');

  // Visible focus ring after keyboard focus.
  const outline = await t.eval(() => getComputedStyle(document.activeElement).outlineStyle);
  t.expect(outline === 'solid', `focus-visible outline on the trigger (got ${outline})`);

  // Tab commits the highlighted option, closes, and moves on (APG).
  await t.press('Enter');
  await t.waitFor(menu);
  await t.wait(300);
  await key('ArrowDown');
  t.expectEqual(await activeText(), 'Por categoría', 'ArrowDown reached the next option');
  await t.press('Tab');
  await t.wait(500);
  t.expect(!(await t.exists(menu)), 'Tab closes the menu');
  t.expectEqual(await value(), 'categoria', 'Tab picks the highlighted option');
  t.expect(await t.eval(() => document.activeElement?.closest('[data-testid="dd-order"]') === null), 'Tab moves focus past the trigger');

  // Mouse: open, mid animation state, pick with click.
  await t.click(trig);
  await t.wait(50);
  const early = await info();
  t.expect(early !== null, 'menu present 50 ms after click');
  if (t.reducedMotion) {
    t.expect(Math.abs(early.scale - 1) < 0.001 && Math.abs(early.ty) < 0.5, `reduced motion: no scale or travel (scale ${early.scale.toFixed(3)}, y ${early.ty.toFixed(1)})`);
  } else {
    t.expect(early.opacity < 1 || early.scale < 1, `menu is mid-entry at 50 ms (opacity ${early.opacity.toFixed(2)}, scale ${early.scale.toFixed(3)})`);
    t.expect(early.scale >= 0.92, 'entry never scales below 0.92');
  }
  await t.wait(600);
  const settled = await info();
  t.expect(settled.opacity === 1 && Math.abs(settled.scale - 1) < 0.001, 'menu settles at opacity 1, scale 1');
  if (!t.reducedMotion) {
    const dur = await t.eval(() => getComputedStyle(document.querySelector('[role="listbox"]')).animationDuration);
    const ms = parseFloat(dur) * 1000;
    t.expect(ms >= 150 && ms <= 260, `enter takes about 0.2 s (${ms} ms)`);
    await t.screenshot('dropdown-open');
  }

  // Menu width follows the trigger and the item height is 40.
  const geo = await t.eval(() => {
    const tr = document.querySelector('[data-testid="dd-order"] [role="combobox"]').getBoundingClientRect();
    const m = document.querySelector('[role="listbox"]').getBoundingClientRect();
    const it = document.querySelector('[role="option"]').getBoundingClientRect();
    return { tw: tr.width, mw: m.width, ih: it.height };
  });
  t.expect(geo.mw >= geo.tw - 1, `menu at least as wide as trigger (${geo.mw} vs ${geo.tw})`);
  t.expect(Math.abs(geo.ih - 40) < 1, `option height is 40 px (${geo.ih})`);

  // Click an option.
  await t.click('[role="option"]:nth-of-type(2)');
  await t.wait(500);
  t.expectEqual(await value(), 'antiguos', 'click picks an option');
  t.expect(!(await t.exists(menu)), 'menu closed after click');
  t.expect(await isCombo(), 'focus is on the trigger after a click pick');

  // Outside click closes (the page is not inert, so the click also reaches what it hit).
  await t.click(trig);
  await t.waitFor(menu);
  await t.wait(300);
  await t.click('h1');
  await t.wait(500);
  t.expect(!(await t.exists(menu)), 'outside click closes');
  t.expectEqual(await value(), 'antiguos', 'outside click keeps the value');

  // Exit is faster than enter.
  if (!t.reducedMotion) {
    await t.click(trig);
    await t.waitFor(menu);
    await t.wait(400);
    await t.press('Escape');
    await t.wait(20);
    const out = await t.eval(() => {
      const m = document.querySelector('[role="listbox"]');
      return m ? parseFloat(getComputedStyle(m).animationDuration) * 1000 : 0;
    });
    t.expect(out > 0 && out <= 130, `exit takes about 0.1 s (${out} ms)`);
    await t.wait(400);
  }

  // Rapid toggling ends coherent. Never half mounted.
  await t.click(trig);
  await t.wait(40);
  await t.click(trig);
  await t.wait(40);
  await t.click(trig);
  await t.wait(800);
  const present = await t.exists(menu);
  t.expectEqual(await t.attr(trig, 'aria-expanded'), present ? 'true' : 'false', 'aria-expanded matches the list after rapid toggles');
  if (present) {
    const after = await info();
    t.expect(after.opacity === 1 && Math.abs(after.scale - 1) < 0.001, 'menu fully settled after rapid toggles');
    await t.press('Escape');
    await t.wait(500);
  }
  await t.click(trig);
  await t.wait(30);
  await t.press('Escape');
  await t.wait(600);
  t.expect(!(await t.exists(menu)), 'closing mid entry leaves nothing mounted');

  // First open is identical to later ones: the trigger never changes size or position while the popup opens
  // (it used to squeeze to 0.97 on press, only on some opens), and the popup enters from the same state every time.
  const A = '[data-testid="dd-order"] [role="combobox"]';
  const B = '[data-testid="dd-country"] [role="combobox"]';
  const openFrames = async (sel) => {
    await t.rect(sel);
    await t.eval((s) => {
      window.__f = []; window.__stop = false;
      const tr = document.querySelector(s);
      const tick = () => {
        const r = tr.getBoundingClientRect(), m = document.querySelector('[role="listbox"]');
        const mr = m && m.getBoundingClientRect(), cs = m && getComputedStyle(m);
        window.__f.push({ t: performance.now(), tr: [r.x, r.y, r.width, r.height], tsc: getComputedStyle(tr).scale, m: m ? [mr.x, mr.y, mr.width, mr.height, parseFloat(cs.opacity), new DOMMatrixReadOnly(cs.transform === 'none' ? undefined : cs.transform).a] : null });
        if (!window.__stop) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, sel);
    await t.click(sel);
    await t.wait(700);
    await t.eval(() => { window.__stop = true; });
    const f = await t.eval(() => window.__f);
    await t.press('Escape');
    await t.wait(500);
    return f;
  };
  const jitter = (f) => {
    const first = f[0].tr;
    return Math.max(...f.flatMap((x) => x.tr.map((v, i) => Math.abs(v - first[i]))));
  };
  const runs = {};
  for (const [label, sel] of [['first open', A], ['second open', A], ['other dropdown', B], ['back to the first', A]]) {
    const f = await openFrames(sel);
    runs[label] = f;
    t.expect(jitter(f) < 0.01, `${label}: the trigger rectangle does not move or resize in any frame (max change ${jitter(f).toFixed(2)} px)`);
    t.expect(f.every((x) => x.tsc === 'none' || x.tsc === '1'), `${label}: the trigger has no press scale`);
    const shown = f.filter((x) => x.m && x.m[4] > 0);
    const tr = f[0].tr;
    t.expect(shown.length > 3, `${label}: the popup is visible for several frames`);
    t.expect(shown.every((x) => x.m[1] > tr[1] + tr[3] - 1 && x.m[1] < tr[1] + tr[3] + 24), `${label}: from its first visible frame the popup sits just under the trigger (no jump from elsewhere; y ${shown[0].m[1].toFixed(1)} vs bottom ${(tr[1] + tr[3]).toFixed(1)})`);
    t.expect(Math.abs(shown[shown.length - 1].m[2] - tr[2]) < 1 && Math.abs(shown[shown.length - 1].m[0] - tr[0]) < 1, `${label}: it ends as wide as and aligned with the trigger`);
    if (!t.reducedMotion) t.expect(shown[0].m[5] >= 0.92 && shown[0].m[5] <= 0.99, `${label}: it starts at the entry scale (${shown[0].m[5].toFixed(3)})`);
  }
  if (!t.reducedMotion) {
    const startScale = (l) => runs[l].filter((x) => x.m && x.m[4] > 0)[0].m[5];
    t.expect(Math.abs(startScale('first open') - startScale('second open')) < 0.02 && Math.abs(startScale('first open') - startScale('back to the first')) < 0.02, 'the first open starts from the same scale as the second and as coming back from another dropdown');
  }

  // The page is never locked while a popup is open.
  await t.eval(() => window.scrollTo(0, 0));
  await t.click(trig);
  await t.waitFor(menu);
  await t.wait(400);
  const lock = await t.eval(() => ({
    bodyOverflow: getComputedStyle(document.body).overflow, htmlOverflow: getComputedStyle(document.documentElement).overflow,
    bodyPointer: getComputedStyle(document.body).pointerEvents, locked: document.body.hasAttribute('data-scroll-locked'),
    hidden: document.querySelectorAll('[data-aria-hidden]').length, inert: document.querySelectorAll('[inert]').length,
    canScroll: document.documentElement.scrollHeight > window.innerHeight + 200,
  }));
  t.expect(lock.canScroll, 'the preview page is tall enough to scroll');
  t.expect(lock.bodyOverflow !== 'hidden' && lock.htmlOverflow !== 'hidden' && !lock.locked, `body scroll is not locked while open (${JSON.stringify(lock)})`);
  t.expect(lock.bodyPointer !== 'none' && lock.hidden === 0 && lock.inert === 0, 'the rest of the page stays interactive and visible to assistive tech');
  // Wheel over the page body scrolls the page, and the popup stays attached to its trigger.
  const gap = () => t.eval(() => {
    const tr = document.querySelector('[data-testid="dd-order"] [role="combobox"]').getBoundingClientRect();
    const m = document.querySelector('[role="listbox"]');
    return m ? m.getBoundingClientRect().top - tr.bottom : null;
  });
  const g0 = await gap();
  const y0 = await scrollY();
  await wheel(20, 600, 120);
  await t.wait(500);
  const y1 = await scrollY();
  t.expect(y1 > y0 + 20, `wheel over the page scrolls the page while the popup is open (scrollY ${y0} to ${y1})`);
  t.expect(await t.exists(menu), 'the popup stays open while the trigger is still visible');
  t.expect(Math.abs((await gap()) - g0) < 1.5, `the popup follows its trigger while the page scrolls (gap ${g0.toFixed(1)} then ${(await gap()).toFixed(1)})`);
  t.expectEqual(await t.attr(trig, 'aria-expanded'), 'true', 'still expanded after the page scrolled');
  // Keyboard still works after a page scroll, focus never left the trigger.
  await key('ArrowDown');
  t.expect(await isCombo(), 'focus is still on the trigger after scrolling the page');
  t.expectEqual(await activeText(), 'Mayor monto', 'the keyboard still drives the list after a page scroll');
  // Scrolling the trigger out of the viewport closes the popup.
  await wheel(20, 600, 1500);
  await t.wait(700);
  t.expect(!(await t.exists(menu)), 'the popup closes when its trigger leaves the viewport');
  t.expectEqual(await t.attr(trig, 'aria-expanded'), 'false', 'aria-expanded false after it closed by scrolling away');
  await t.eval(() => window.scrollTo(0, 0));
  await t.wait(200);
  // Esc after a scroll still closes and the focus is where it was.
  await t.focus(trig);
  await t.press('Enter');
  await t.waitFor(menu);
  await wheel(20, 600, 60);
  await t.wait(300);
  await t.press('Escape');
  await t.wait(500);
  t.expect(!(await t.exists(menu)) && (await isCombo()), 'Esc after a page scroll closes and keeps focus on the trigger');
  // Outside click after a page scroll.
  await t.click(trig);
  await t.waitFor(menu);
  await wheel(20, 600, 60);
  await t.wait(300);
  await t.click('h1');
  await t.wait(500);
  t.expect(!(await t.exists(menu)), 'outside click after a page scroll closes');
  await t.eval(() => window.scrollTo(0, 0));
  await t.wait(200);

  // Long list: capped height, wheel over the list scrolls the list and not the page, still keyboard operable.
  await t.focus(B);
  await t.press('Enter');
  await t.waitFor(menu);
  await t.wait(500);
  const h = await t.eval(() => document.querySelector('[role="listbox"]').getBoundingClientRect().height);
  t.expect(h <= 6.5 * 40 + 12 + 1 && h > 200, `long list capped near 6.5 options (${Math.round(h)} px)`);
  const listBox = await t.eval(() => { const r = document.querySelector('[role="listbox"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, scrolls: document.querySelector('[role="listbox"]').scrollHeight > document.querySelector('[role="listbox"]').clientHeight + 4, st: document.querySelector('[role="listbox"]').scrollTop }; });
  t.expect(listBox.scrolls, 'the long list overflows its box');
  t.expectEqual(await t.style(menu, 'overscroll-behavior-y'), 'contain', 'the list does not chain its scroll to the page');
  const py = await scrollY();
  const st0 = await t.eval(() => document.querySelector('[role="listbox"]').scrollTop);
  await wheel(listBox.x, listBox.y, 100);
  await t.wait(400);
  const st1 = await t.eval(() => document.querySelector('[role="listbox"]').scrollTop);
  t.expect(st1 > st0 + 20, `wheel over the list scrolls the list (${st0} to ${st1})`);
  t.expectEqual(await scrollY(), py, 'the page did not move while the list scrolled');
  await t.eval(() => { const l = document.querySelector('[role="listbox"]'); l.scrollTop = l.scrollHeight; });
  await t.wait(200);
  await wheel(listBox.x, listBox.y, 200);
  await t.wait(400);
  t.expectEqual(await scrollY(), py, 'at the end of the list the wheel does not drag the page along');
  await key('End');
  await t.wait(100);
  t.expectEqual(await activeText(), 'Venezuela', 'End reaches the last option and scrolls it in');
  const vis = await t.eval(() => {
    const m = document.querySelector('[role="listbox"]').getBoundingClientRect();
    const a = document.getElementById(document.activeElement.getAttribute('aria-activedescendant')).getBoundingClientRect();
    return a.bottom <= m.bottom + 1 && a.top >= m.top - 1;
  });
  t.expect(vis, 'the highlighted last option is visible inside the list');
  for (const c of 'uru') await key(c);
  t.expectEqual(await activeText(), 'Uruguay', 'typeahead works in the long list');
  await t.press('Enter');
  await t.wait(500);
  t.expectEqual(await t.text('[data-testid="dd-country-value"]'), 'uruguay', 'long list pick');
  t.expect(await isCombo(), 'focus returns to the trigger');

  // Inside a scrolling container: the popup follows the trigger and closes when the container hides it.
  const BOXT = '[data-testid="dd-box"] [role="combobox"]';
  await t.eval(() => document.querySelector('[data-testid="dd-box"]').scrollIntoView({ block: 'center' }));
  await t.eval(() => { document.querySelector('[data-testid="dd-box"]').scrollTop = 0; });
  await t.wait(200);
  await t.click(BOXT);
  await t.waitFor(menu);
  await t.wait(400);
  const boxGap = () => t.eval(() => { const tr = document.querySelector('[data-testid="dd-box"] [role="combobox"]').getBoundingClientRect(); const m = document.querySelector('[role="listbox"]'); return m ? m.getBoundingClientRect().top - tr.bottom : null; });
  const bg0 = await boxGap();
  const box = await t.eval(() => { const r = document.querySelector('[data-testid="dd-box"]').getBoundingClientRect(); return { x: r.x + 6, y: r.y + 30 }; });
  await wheel(box.x, box.y, 40);
  await t.wait(400);
  t.expect((await t.eval(() => document.querySelector('[data-testid="dd-box"]').scrollTop)) > 10, 'wheel over the scrolling container scrolls it');
  t.expect(await t.exists(menu), 'the popup stays while its trigger is still inside the container');
  t.expect(Math.abs((await boxGap()) - bg0) < 1.5, 'the popup follows the trigger inside the container');
  await wheel(box.x, box.y, 400);
  await t.wait(700);
  t.expect(!(await t.exists(menu)), 'the popup closes when the container scrolls the trigger out of sight');
  await t.eval(() => window.scrollTo(0, 0));

  // Disabled option cannot be picked.
  await t.click('text=Elegí una categoría');
  await t.waitFor(menu);
  await t.wait(500);
  const dis = await t.eval(() => document.querySelector('[role="option"][aria-disabled="true"]')?.textContent);
  t.expectEqual(dis, 'Salud', 'disabled option exposes aria-disabled');
  await t.click('[role="option"][aria-disabled="true"]');
  await t.wait(200);
  t.expect(await t.exists(menu), 'clicking a disabled option does nothing');
  await key('ArrowDown');
  await key('ArrowDown');
  await key('ArrowDown');
  t.expect((await activeText()) !== 'Salud', 'the keyboard skips a disabled option');
  await t.press('Escape');
  await t.wait(500);

  // Loading and empty states: a disabled option inside the list, announced by a polite region.
  await t.click('[data-testid="dd-loading"] [role="combobox"]');
  await t.waitFor(menu);
  await t.wait(200);
  t.expectEqual(await t.text('[data-testid="dd-loading"] [role="status"]'), 'Cargando monedas', 'loading text is announced through the live region');
  t.expectEqual(await t.eval(() => [...document.querySelectorAll('[role="listbox"] > *')].map((n) => n.getAttribute('role') ?? n.tagName)), ['option'], 'the listbox holds only options (no status div)');
  t.expect(await t.eval(() => { const a = document.querySelector('[role="listbox"] svg'); return !!a && (a.getAttribute('class') ?? '').includes('motion-reduce:animate-pulse'); }), 'spinner falls back to a pulse under reduced motion');
  await t.press('Escape');
  await t.wait(500);
  await t.click('[data-testid="dd-empty"] [role="combobox"]');
  await t.waitFor(menu);
  await t.wait(200);
  t.expect((await t.text(menu)).includes('Todavía no hay etiquetas'), 'empty state text');
  t.expectEqual(await t.text('[data-testid="dd-empty"] [role="status"]'), 'Todavía no hay etiquetas', 'empty text is announced');
  await t.press('Escape');
  await t.wait(500);

  // Disabled trigger does not open.
  t.expect(await t.eval(() => [...document.querySelectorAll('[role="combobox"]')].some((b) => b.disabled)), 'a disabled trigger is a disabled button');

  // Form participation: required is real validation, reset restores, FormData carries the values.
  const form = '[data-testid="dd-form"]';
  t.expectEqual(await t.eval(() => document.querySelector('[data-testid="dd-form"]').checkValidity()), false, 'a required empty select blocks the form');
  await t.eval(() => document.querySelector('[data-testid="dd-form"]').requestSubmit());
  await t.wait(100);
  t.expectEqual(await t.text('[data-testid="dd-posted"]'), 'nada', 'the invalid form did not submit');
  t.expect(await t.eval(() => document.activeElement?.closest('[data-testid="dd-form"]') !== null && document.activeElement.getAttribute('role') === 'combobox' && document.activeElement.textContent.includes('Elegí una prioridad')), 'an invalid required dropdown puts focus on its trigger');
  t.expectEqual(await t.count(`${form} [role="combobox"]`), 2, 'two comboboxes in the form');
  await t.eval(() => document.querySelectorAll('[data-testid="dd-form"] [role="combobox"]')[1].focus());
  await t.press('Enter');
  await t.waitFor(menu);
  await t.wait(300);
  await key('ArrowDown');
  await t.press('Enter');
  await t.wait(500);
  t.expectEqual(await t.eval(() => document.querySelector('[data-testid="dd-form"]').checkValidity()), true, 'picking a value makes the form valid');
  await t.click('[data-testid="dd-submit"]');
  await t.wait(200);
  t.expectEqual(await t.text('[data-testid="dd-posted"]'), '{"rubro":"comida","prioridad":"antiguos"}', 'FormData carries both selects');
  await t.eval(() => document.querySelectorAll('[data-testid="dd-form"] [role="combobox"]')[0].focus());
  await t.press('o');
  await t.wait(100);
  t.expect((await t.eval(() => document.querySelectorAll('[data-testid="dd-form"] [role="combobox"]')[0].textContent)).includes('Ocio'), 'typeahead changed the form value');
  await t.click('[data-testid="dd-reset"]');
  await t.wait(300);
  t.expectEqual(await t.eval(() => [...document.querySelectorAll('[data-testid="dd-form"] [role="combobox"]')].map((c) => c.textContent.trim())), ['Comida', 'Elegí una prioridad'], 'form reset restores the initial values');

  // No press scale on the trigger.
  await t.mouseDown(trig);
  await t.wait(150);
  const sc = await t.eval(() => parseFloat(getComputedStyle(document.querySelector('[data-testid="dd-order"] [role="combobox"]')).scale) || 1);
  await t.mouseUp();
  t.expect(sc === 1, `no press scale on the trigger (${sc})`);
  await t.wait(500);
  await t.press('Escape');
  await t.wait(400);
  await t.screenshot(`dropdown-state-${t.reducedMotion ? 'reduced' : 'motion'}`);
}
