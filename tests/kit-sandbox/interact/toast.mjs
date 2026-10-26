// Toast: stacking, entry motion, reflow time after removing a middle toast, pause on hover, undo, persistence, loading, max, keyboard.
export default async function (t) {
  const region = 'section[aria-label="Avisos"]';
  const items = `${region} li`;
  const count = () => t.count(items);
  const titles = () => t.eval(() => [...document.querySelectorAll('section[aria-label="Avisos"] li p:first-of-type')].map((p) => p.textContent));
  const tops = () => t.eval(() => [...document.querySelectorAll('section[aria-label="Avisos"] li')].map((li) => Math.round(li.getBoundingClientRect().top * 10) / 10));
  const log = () => t.text('[data-testid="log"]');
  const liState = () =>
    t.eval(() => [...document.querySelectorAll('section[aria-label="Avisos"] li')].map((li) => {
      const cs = getComputedStyle(li);
      const m = new DOMMatrixReadOnly(cs.transform === 'none' ? undefined : cs.transform);
      return { opacity: parseFloat(cs.opacity), ty: m.m42 };
    }));

  t.expectEqual(await t.attr(region, 'aria-label'), 'Avisos', 'region is named');
  t.expectEqual(await count(), 0, 'no toasts at start');
  // F9: the live regions exist before any content is inserted, so the first announcement is not lost.
  t.expectEqual(await t.eval(() => [...document.querySelectorAll('[data-toast-live]')].map((e) => e.dataset.toastLive + ':' + e.getAttribute('role') + ':' + e.textContent)), ['polite:status:', 'assertive:alert:'], 'a polite status region and an assertive alert region exist and are empty at start');
  t.expectEqual(await t.attr(region, 'aria-keyshortcuts'), 'F8', 'the region declares its focus hotkey');
  const live = (kind) => t.eval((k) => document.querySelector('[data-toast-live="' + k + '"]').textContent, kind);

  // Entry motion: rises from below (28 px) and fades; reduced motion only fades.
  await t.click('[data-testid="add"]');
  await t.wait(40);
  const early = (await liState())[0];
  if (t.reducedMotion) {
    t.expect(Math.abs(early.ty) < 0.5, `reduced motion: no rise (y ${early.ty.toFixed(1)})`);
    t.expect(early.opacity < 1, 'reduced motion: fades in');
  } else {
    t.expect(early.ty > 4 && early.ty <= 28.01, `rises from below (y ${early.ty.toFixed(1)})`);
    t.expect(early.opacity < 1, `fades in (opacity ${early.opacity.toFixed(2)})`);
  }
  await t.wait(700);
  const rest = (await liState())[0];
  t.expect(Math.abs(rest.ty) < 0.1 && rest.opacity === 1, 'settles at rest');
  t.expectEqual(await t.attr(`${items} > div`, 'role'), null, 'the visible card has no live role of its own (the persistent regions announce)');
  t.expect((await live('polite')).includes('Cambios guardados 1'), 'a success toast is announced in the polite status region');
  t.expectEqual(await live('assertive'), '', 'and not in the alert region');

  // Stack: three more, newest at the bottom, gap 8 px.
  await t.click('[data-testid="add"]');
  await t.click('[data-testid="add"]');
  await t.click('[data-testid="add"]');
  await t.wait(900);
  t.expectEqual(await titles(), ['Cambios guardados 1', 'Cambios guardados 2', 'Cambios guardados 3', 'Cambios guardados 4'], 'newest is last (closest to the bottom edge)');
  const geo = await t.eval(() => {
    const rs = [...document.querySelectorAll('section[aria-label="Avisos"] li')].map((li) => li.getBoundingClientRect());
    return { gaps: rs.slice(1).map((r, i) => Math.round(r.top - rs[i].bottom)), bottom: window.innerHeight - rs[rs.length - 1].bottom, width: rs[0].width };
  });
  t.expectEqual(geo.gaps, [8, 8, 8], 'stack gap is 8 px');
  t.expect(Math.abs(geo.bottom - 16) < 1.5, `stack sits 16 px from the edge (${geo.bottom})`);
  t.expect(geo.width <= 380.5, `width is at most 380 px (${geo.width})`);

  // Max 4: a fifth pushes the oldest out.
  await t.click('[data-testid="add"]');
  await t.wait(900);
  t.expectEqual(await count(), 4, 'max 4 toasts');
  t.expectEqual((await titles())[0], 'Cambios guardados 2', 'the oldest left');

  // Reflow: close the second toast; the older one above it slides down into the gap fast.
  const before = await tops();
  const firstTopBefore = before[0];
  const removedHeight = await t.eval(() => document.querySelectorAll('section[aria-label="Avisos"] li')[1].getBoundingClientRect().height);
  const target = firstTopBefore + removedHeight + 8;
  await t.click(`${items}:nth-child(2) button[aria-label="Cerrar aviso"]`);
  const ms = await t.eval(
    ([want]) =>
      new Promise((resolve) => {
        const t0 = performance.now();
        const tick = () => {
          const li = document.querySelector('section[aria-label="Avisos"] li');
          const top = li.getBoundingClientRect().top;
          if (Math.abs(top - want) < 1) resolve(performance.now() - t0);
          else if (performance.now() - t0 > 1500) resolve(-1);
          else requestAnimationFrame(tick);
        };
        tick();
      }),
    [target],
  );
  t.expect(ms >= 0, 'the older toast reaches its new position');
  t.expect(ms <= 320, `reflow settles within 300 ms (took ${Math.round(ms)} ms)`);
  await t.wait(500);
  t.expectEqual(await count(), 3, 'one toast removed');
  const after = await tops();
  t.expectEqual(after.length, 3, 'three left');
  const gaps = await t.eval(() => {
    const rs = [...document.querySelectorAll('section[aria-label="Avisos"] li')].map((li) => li.getBoundingClientRect());
    return rs.slice(1).map((r, i) => Math.round(r.top - rs[i].bottom));
  });
  t.expectEqual(gaps, [8, 8], 'gaps are restored after the removal');

  // Rapid deletes: close all remaining quickly, one after another, still consistent.
  await t.click('[data-testid="add"]');
  await t.click('[data-testid="add"]');
  await t.wait(500);
  t.expectEqual(await count(), 4, 'four toasts before the rapid deletes');
  // Programmatic clicks: the stack is moving between mouse down and up, so real clicks would miss.
  for (const n of [4, 3, 2]) {
    await t.eval((k) => document.querySelectorAll('section[aria-label="Avisos"] li')[k - 1].querySelector('button[aria-label="Cerrar aviso"]').click(), n);
    await t.wait(40);
  }
  await t.wait(700);
  t.expectEqual(await count(), 1, 'rapid deletes leave the right count');
  const gaps2 = await t.eval(() => {
    const rs = [...document.querySelectorAll('section[aria-label="Avisos"] li')].map((li) => li.getBoundingClientRect());
    return rs.slice(1).map((r, i) => Math.round(r.top - rs[i].bottom));
  });
  t.expectEqual(gaps2, [], 'no stray gaps after rapid deletes');
  const lastTop = await t.eval(() => window.innerHeight - document.querySelector('section[aria-label="Avisos"] li').getBoundingClientRect().bottom);
  t.expect(Math.abs(lastTop - 16) < 1.5, `the survivor settles at the edge (${lastTop})`);
  await t.click('[data-testid="clear"]');
  await t.wait(700);
  t.expectEqual(await count(), 0, 'dismiss() with no id clears everything');

  // Auto dismiss and persistence: the short info toast leaves; the error stays; hover pauses.
  await t.click('[data-testid="add-error"]');
  await t.click('[data-testid="add-short"]');
  await t.wait(300);
  t.expect((await live('polite')).includes('Informe exportado'), 'info toast is announced politely');
  t.expect((await live('assertive')).includes('No se pudo sincronizar'), 'error toast is announced in the alert region');
  await t.hover(`${items}:last-child`);
  await t.wait(2200);
  t.expectEqual(await count(), 2, 'hover pauses the timer (still here after 2.2 s)');
  await t.hover('h1');
  await t.wait(1900);
  t.expectEqual(await titles(), ['No se pudo sincronizar'], 'after leaving, the short toast dismisses itself and the error stays');
  await t.wait(1500);
  t.expectEqual(await count(), 1, 'errors never auto dismiss');

  // Keyboard: F8 focuses the newest toast, Esc dismisses it, focus ring is visible.
  await t.eval(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8', bubbles: true, cancelable: true })));
  t.expect(await t.eval(() => !!document.activeElement?.closest('section[aria-label="Avisos"]')), 'F8 moves focus into the toasts');
  await t.eval(() => document.querySelector('section[aria-label="Avisos"] li button').focus());
  await t.press('Escape');
  await t.wait(600);
  t.expectEqual(await count(), 0, 'Esc dismisses the focused toast');

  // Undo action.
  await t.click('[data-testid="add-undo"]');
  await t.wait(500);
  t.expect((await t.text(`${items} button:not([aria-label])`)).startsWith('Deshacer'), 'action button shows its label');
  // Keyboard ring: focus the close button of the first toast, Tab to the action of the next one.
  await t.click('[data-testid="add-error"]');
  await t.wait(500);
  await t.eval(() => document.querySelector('section[aria-label="Avisos"] li:first-child button').focus());
  await t.press('Tab');
  const ring = await t.eval(() => ({ ring: getComputedStyle(document.activeElement).outlineStyle, inRegion: !!document.activeElement.closest('section[aria-label="Avisos"]') }));
  t.expect(ring.inRegion && ring.ring === 'solid', `Tab walks the toasts and draws the ring (${JSON.stringify(ring)})`);
  await t.eval(() => document.querySelector('section[aria-label="Avisos"] li button:not([aria-label])').focus());
  await t.press('Enter');
  await t.wait(600);
  t.expectEqual(await log(), 'deshecho', 'Enter on the action runs it');
  t.expectEqual(await titles(), ['No se pudo sincronizar'], 'the action also dismisses its own toast (the error stays)');
  await t.click('[data-testid="clear"]');
  await t.wait(600);

  // F5 (WCAG 2.2.1): a toast whose only recovery is Undo does not vanish in 5 s, whatever duration was asked.
  await t.click('[data-testid="add-undo-default"]');
  await t.click('[data-testid="add-undo-short"]');
  await t.wait(500);
  t.expectEqual(await t.eval(() => [...document.querySelectorAll('section[aria-label="Avisos"] li > div')].map((d) => d.dataset.duration)), ['10000', '10000'], 'actionable toasts last at least 10 s, even when 1.5 s was asked');
  await t.wait(6200);
  t.expectEqual(await count(), 2, 'both Undo toasts are still here after 6.7 s (the plain default would have left at 5 s)');
  // F8: the action has a hotkey, announced and shown.
  t.expectEqual(await t.attr(`${items}:last-child button[aria-keyshortcuts]`, 'aria-keyshortcuts'), 'Alt+Z', 'the newest action declares aria-keyshortcuts');
  t.expect((await t.text(`${items}:last-child button[aria-keyshortcuts]`)).includes('Alt+Z'), 'the hotkey is visible next to the action label');
  t.expectEqual(await t.eval(() => document.querySelectorAll('section[aria-label="Avisos"] button[aria-keyshortcuts]').length), 1, 'only the newest action owns the hotkey');
  await t.eval(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', altKey: true, bubbles: true, cancelable: true })));
  await t.wait(700);
  t.expectEqual(await log(), 'deshecho-corto', 'Alt+Z runs the action of the newest actionable toast');
  t.expectEqual(await count(), 1, 'and dismisses it');
  await t.eval(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', altKey: true, bubbles: true, cancelable: true })));
  await t.wait(700);
  t.expectEqual(await log(), 'deshecho', 'the next Alt+Z runs the next one');
  t.expectEqual(await count(), 0, 'nothing left');
  // F5: timers also pause when the window loses focus.
  await t.click('[data-testid="add-short"]');
  await t.wait(300);
  await t.eval(() => window.dispatchEvent(new Event('blur')));
  await t.wait(2300);
  t.expectEqual(await count(), 1, 'a 1.5 s toast is still here 2.6 s later because the window lost focus');
  await t.eval(() => window.dispatchEvent(new Event('focus')));
  await t.wait(2300);
  t.expectEqual(await count(), 0, 'it leaves once the window is back');
  // F21: over max, a persistent error is never expelled unseen.
  for (let i = 0; i < 5; i++) await t.click('[data-testid="add-error"]');
  await t.wait(900);
  t.expectEqual(await count(), 5, 'five errors with max 4: the stack grows instead of expelling one');
  await t.click('[data-testid="clear"]');
  await t.wait(700);
  await t.click('[data-testid="add"]');
  await t.click('[data-testid="add"]');
  await t.click('[data-testid="add-error"]');
  await t.click('[data-testid="add-error"]');
  await t.wait(600);
  await t.click('[data-testid="add"]');
  await t.wait(900);
  t.expectEqual(await count(), 4, 'a new toast over max evicts an auto dismissing one');
  t.expectEqual((await titles()).filter((x) => x === 'No se pudo sincronizar').length, 2, 'both errors survived');
  await t.click('[data-testid="clear"]');
  await t.wait(700);

  // Warning is persistent and an alert; loading resolves in place.
  await t.click('[data-testid="add-warning"]');
  await t.wait(500);
  t.expect((await live('assertive')).includes('Tu plan vence en 3 días'), 'a warning is announced in the alert region');
  await t.click('[data-testid="clear"]');
  await t.wait(600);
  await t.click('[data-testid="add-loading"]');
  await t.wait(400);
  t.expectEqual(await t.attr(`${items} > div`, 'data-variant'), 'loading', 'loading toast shows first');
  t.expect(await t.eval(() => (document.querySelector('section[aria-label="Avisos"] li svg')?.getAttribute('class') ?? '').includes('motion-reduce:animate-pulse')), 'the loading spinner falls back to a pulse under reduced motion');
  await t.wait(1200);
  t.expectEqual(await t.attr(`${items} > div`, 'data-variant'), 'success', 'the same toast resolves into success');
  t.expect((await live('polite')).includes('Informe guardado'), 'the resolved text is announced');
  t.expectEqual(await count(), 1, 'resolved in place, not a second toast');
  await t.screenshot(`toast-stack-${t.reducedMotion ? 'reduced' : 'motion'}`);
  await t.click('[data-testid="clear"]');
  await t.wait(600);
  await t.click('[data-testid="add-error"]');
  await t.click('[data-testid="add-undo"]');
  await t.click('[data-testid="add-loading"]');
  await t.wait(500);
  await t.screenshot(`toast-variants-${t.reducedMotion ? 'reduced' : 'motion'}`);

  // Author report: in the simple notice, delete with undo, undo without duration, undo 1.5 s, warning and save-with-wait
  // toasts the text was not centered with the icon and the action. Measure the vertical centers of every part, per variant.
  await t.click('[data-testid="clear"]');
  await t.wait(700);
  const centers = () =>
    t.eval(() => {
      const li = [...document.querySelectorAll('section[aria-label="Avisos"] li')].pop();
      const card = li.firstElementChild;
      const cy = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
      const kids = [...card.children];
      const icon = kids.find((k) => k.tagName === 'SPAN');
      const text = kids.find((k) => k.className.includes('min-w-0'));
      const action = kids.find((k) => k.tagName === 'BUTTON' && !k.getAttribute('aria-label'));
      const close = kids.find((k) => k.tagName === 'BUTTON' && k.getAttribute('aria-label'));
      const cr = card.getBoundingClientRect();
      const lines = [...text.querySelectorAll('p')].map((p) => cy(p));
      return { variant: card.dataset.variant, card: cr.top + cr.height / 2, cardH: cr.height, icon: cy(icon), text: cy(text), action: cy(action), close: cy(close), lines: lines.length, title: text.firstElementChild.getBoundingClientRect().height, textBox: text.getBoundingClientRect().height };
    });
  const variants = [
    ['add', 'simple notice'],
    ['add-undo', 'delete with undo'],
    ['add-undo-default', 'undo without duration'],
    ['add-undo-short', 'undo 1.5 s'],
    ['add-warning', 'warning'],
    ['add-loading', 'save with wait (loading)'],
    ['add-short', 'notice with a description'],
    ['add-error', 'error with a description'],
  ];
  for (const [id, label] of variants) {
    await t.click('[data-testid="clear"]');
    await t.wait(650);
    await t.click(`[data-testid="${id}"]`);
    await t.wait(700);
    const c = await centers();
    const parts = { text: c.text, ...(c.icon !== null ? { icon: c.icon } : {}), ...(c.action !== null ? { action: c.action } : {}), ...(c.close !== null ? { close: c.close } : {}) };
    for (const [name, v] of Object.entries(parts)) {
      t.expect(Math.abs(v - c.card) <= 1, `${label}: the ${name} is vertically centered in the card (off by ${(v - c.card).toFixed(2)} px; card height ${c.cardH.toFixed(1)})`);
      t.expect(Math.abs(v - c.text) <= 1, `${label}: the ${name} shares the text center (off by ${(v - c.text).toFixed(2)} px)`);
    }
  }
  // Touch: the buttons grow to 44 px and the parts stay centered.
  await t.coarse(true);
  for (const id of ['add-undo', 'add-error']) {
    await t.eval(() => document.querySelector('[data-testid="clear"]').click());
    await t.wait(650);
    await t.eval((x) => document.querySelector('[data-testid="' + x + '"]').click(), id);
    await t.wait(700);
    const c = await centers();
    for (const v of [c.text, c.icon, c.close, c.action].filter((x) => x !== null)) t.expect(Math.abs(v - c.card) <= 1, `touch ${id}: parts centered (off by ${(v - c.card).toFixed(2)} px, card ${c.cardH.toFixed(0)} px)`);
  }
  await t.coarse(false);
  // The loading toast resolves in place into a success: still aligned after the icon changes.
  await t.click('[data-testid="clear"]');
  await t.wait(650);
  await t.click('[data-testid="add-loading"]');
  await t.wait(1900);
  const resolved = await centers();
  t.expectEqual(resolved.variant, 'success', 'the loading toast resolved');
  t.expect(Math.abs(resolved.icon - resolved.text) <= 1 && Math.abs(resolved.close - resolved.text) <= 1, 'aligned after resolving too');
  await t.screenshot(`toast-aligned-${t.reducedMotion ? 'reduced' : 'motion'}`);
  await t.click('[data-testid="clear"]');
  await t.wait(600);
}
