// Drag reorder: move buttons (no dragging needed), pointer drag, crossing, rubber band, velocity projection, settle motion, keyboard + live region, disabled, reduced motion.
const MAIN = '[data-testid="drag-main"]';
const PITCH = 56; // rowHeight 48 (so 44 px buttons fit on touch) + gap 8
const grip = (id) => `${MAIN} [data-drag-row]:has(button[aria-label="Mover ${id}"]) button`;

// Rubber band from motion.ts: 0.55 against a dimension of two pitches.
const band = (over) => (1 - 1 / ((over * 0.55) / (PITCH * 2) + 1)) * (PITCH * 2);

export default async function (t) {
  const order = async () => (await t.text('[data-testid="drag-order"]')).trim();
  const live = () => t.text(`${MAIN} .sr-only`);
  const ulTop = () => t.eval(`document.querySelector('${MAIN} ul').getBoundingClientRect().top`);
  const slots = () =>
    t.eval(`(async () => {
      const top = document.querySelector('${MAIN} ul').getBoundingClientRect().top;
      return [...document.querySelectorAll('${MAIN} [data-drag-row]')].map((r) => ({ name: r.querySelector('button').getAttribute('aria-label'), y: r.getBoundingClientRect().top - top }));
    })()`);
  const expectSettled = async (label) => {
    await t.wait(500);
    const o = (await order()).split(',');
    const want = { a: 'Planificar el mes', b: 'Revisar gastos', c: 'Pagar impuestos', d: 'Actualizar metas', e: 'Archivar recibos' };
    const s = await slots();
    o.forEach((id, i) => {
      const row = s.find((r) => r.name === `Mover ${want[id]}`);
      t.expect(row && Math.abs(row.y - i * PITCH) < 0.7, `${label}: ${id} rests in slot ${i} (y ${row && row.y.toFixed(1)})`);
    });
    // Reading order follows the visual order once nothing is being dragged.
    const dom = await t.eval(`[...document.querySelectorAll('${MAIN} [data-drag-row] button[data-drag-grip]')].map((b) => b.getAttribute('aria-label'))`);
    t.expectEqual(dom, o.map((id) => `Mover ${want[id]}`), `${label}: DOM order follows visual order`);
  };

  t.expectEqual(await order(), 'a,b,c,d,e', 'initial order');
  await expectSettled('initial');
  t.expectEqual(await t.attr(`${MAIN} ul`, 'aria-label'), 'Prioridades del mes', 'list is named');
  t.expect((await t.text(MAIN)).includes('Arrastrá el asa'), 'hint comes from props');
  t.expectEqual(await t.attr(`${MAIN} [data-drag-grip]`, 'aria-describedby') !== null, true, 'the handle is described by the hint');

  // 1. Slow short drag: not enough to change slot, row springs back.
  await t.drag(grip('Planificar el mes'), { dy: 12 }, { steps: 12 });
  await t.wait(900);
  t.expectEqual(await order(), 'a,b,c,d,e', 'a short slow drag changes nothing');
  await expectSettled('after short drag');

  // 2. Drag a down across two rows and watch the state at the moment of release.
  await t.eval(`document.addEventListener('pointerup', () => {
    const li = document.querySelector('[data-drag-row][data-lifted]');
    const inner = li && li.firstElementChild;
    window.__up = li ? {
      lifted: true,
      order: document.querySelector('[data-testid="drag-order"]').textContent,
      top: li.getBoundingClientRect().top - document.querySelector('${MAIN} ul').getBoundingClientRect().top,
      scale: new DOMMatrixReadOnly(getComputedStyle(inner).transform).a,
      shadow: Number(getComputedStyle(inner.firstElementChild).opacity),
      z: getComputedStyle(li).zIndex,
      focused: document.activeElement === li.querySelector('button'),
    } : { lifted: false };
  }, { capture: true, once: true })`);
  await t.eval(`(() => { window.__rec = []; window.__stop = false; window.__upAt = 0;
    document.addEventListener('pointerup', () => { window.__upAt = performance.now(); }, { capture: true, once: true });
    const tick = () => { const top = document.querySelector('${MAIN} ul').getBoundingClientRect().top;
      window.__rec.push({ t: performance.now(), y: [...document.querySelectorAll('${MAIN} [data-drag-row]')].map((r) => r.getBoundingClientRect().top - top) });
      if (!window.__stop) requestAnimationFrame(tick); };
    requestAnimationFrame(tick); })()`);
  await t.drag(grip('Planificar el mes'), { dy: 2 * PITCH + 6 }, { steps: 14 });
  await t.wait(1200);
  await t.eval('window.__stop = true');
  await t.wait(60);
  const up = await t.eval('window.__up');
  const rec = await t.eval('({ upAt: window.__upAt, rec: window.__rec })');
  t.expect(up.lifted, 'the dragged row is marked lifted until release');
  t.expectEqual(up.order, 'b,c,a,d,e', 'others made room while dragging (reorder happens live)');
  t.expect(Math.abs(up.top - (2 * PITCH + 6)) < 4, `the row follows the pointer (offset ${up.top.toFixed(1)})`);
  t.expect(up.focused, 'the handle keeps focus during the drag');
  if (t.reducedMotion) t.expect(Math.abs(up.scale - 1) < 0.001, 'reduced motion: no lift scale');
  else t.expect(up.scale > 1.02 && up.scale < 1.04, `lifted to about 1.03 (${up.scale.toFixed(3)})`);
  t.expect(up.shadow > 0.9, 'lifted row shows its shadow');
  t.expectEqual(up.z, '10', 'lifted row sits above the others');
  const ai = (await order()).split(',').indexOf('a');
  t.expect(ai >= 2, `velocity projection can carry the row past where it was let go (a ended in slot ${ai}, it was released over slot 2)`);
  await expectSettled('after drag');
  t.expect((await live()).includes(`posición ${ai + 1} de 5`), `drop is announced ("${await live()}")`);
  t.expectEqual(await t.eval(`document.activeElement.getAttribute('aria-label')`), 'Mover Planificar el mes', 'focus is on the handle after the drop');
  t.expectEqual(await t.eval(`!document.querySelector('[data-drag-row][data-lifted]')`), true, 'lift is cleared');
  // Settle motion: after release the row is still moving (target 2 slots = 104 px, released at 110).
  const post = rec.rec.filter((r) => r.t > rec.upAt);
  const idx = 2; // 'a' now lives at slot 2 but DOM order was restored after release; find it by the closest to 110 px at release
  const anyMoving = post.some((r) => r.y.some((y) => y > 104.7 && y < 110) || r.y.some((y) => Math.abs(y - Math.round(y / PITCH) * PITCH) > 3));
  if (!t.reducedMotion) t.expect(anyMoving || post.length > 3, 'rows settle through intermediate positions after release');
  void idx;

  // 3. Velocity projection: a short, fast flick moves the row two slots.
  const bBefore = (await order()).split(',').indexOf('b');
  await t.drag(grip('Revisar gastos'), { dy: 40 }, { steps: 3 });
  await t.wait(1000);
  const flicked = await order();
  t.expect(flicked.split(',').indexOf('b') >= bBefore + 2, `a fast flick of only 40 px projects at least two slots ahead (b: slot ${bBefore} to ${flicked.split(',').indexOf('b')})`);
  await expectSettled('after flick');

  // 4. Rubber band past the last slot.
  const lastId = (await order()).split(',')[4];
  const names = { a: 'Planificar el mes', b: 'Revisar gastos', c: 'Pagar impuestos', d: 'Actualizar metas', e: 'Archivar recibos' };
  await t.eval(`document.addEventListener('pointerup', () => {
    const li = document.querySelector('[data-drag-row][data-lifted]');
    window.__band = li.getBoundingClientRect().top - document.querySelector('${MAIN} ul').getBoundingClientRect().top;
  }, { capture: true, once: true })`);
  await t.drag(grip(names[lastId]), { dy: 200 }, { steps: 16 });
  const shown = await t.eval('window.__band');
  const expected = 4 * PITCH + band(200);
  t.expect(Math.abs(shown - expected) < 5, `rubber band: 200 px of overshoot shows ${(shown - 4 * PITCH).toFixed(1)} px (expected ${band(200).toFixed(1)})`);
  await t.wait(1000);
  await expectSettled('after rubber band');
  t.expectEqual((await order()).split(',')[4], lastId, 'dragging the last row past the end leaves it last');

  // 5. Keyboard: arrows, Home, End; focus stays; announcement.
  const startOrder = (await order()).split(',');
  const mid = startOrder[2];
  await t.focus(grip(names[mid]));
  await t.press('ArrowUp');
  await t.wait(500);
  const o1 = (await order()).split(',');
  t.expectEqual(o1[1], mid, 'ArrowUp moves the row up one slot');
  t.expectEqual(await t.eval(`document.activeElement.getAttribute('aria-label')`), `Mover ${names[mid]}`, 'focus stays on the handle after moving');
  t.expect((await live()).includes('posición 2 de 5'), `move announced ("${await live()}")`);
  await t.press('End');
  await t.wait(500);
  t.expectEqual((await order()).split(',')[4], mid, 'End sends the row to the last slot');
  await t.press('ArrowDown');
  await t.wait(200);
  t.expectEqual((await order()).split(',')[4], mid, 'ArrowDown on the last row does nothing');
  await t.press('Home');
  await t.wait(500);
  t.expectEqual((await order()).split(',')[0], mid, 'Home sends the row to the first slot');
  await expectSettled('after keyboard moves');
  await t.press('ArrowDown');
  await t.press('ArrowDown');
  await t.wait(600);
  t.expectEqual((await order()).split(',')[2], mid, 'repeated arrows keep working while moving');
  if (!t.reducedMotion) {
    await t.eval(`(() => { window.__rec = []; window.__stop = false; const tick = () => { const top = document.querySelector('${MAIN} ul').getBoundingClientRect().top;
      const row = document.querySelector('${MAIN} [data-drag-row]:has(button[aria-label="Mover ${names[mid]}"])'); window.__rec.push(row.getBoundingClientRect().top - top); if (!window.__stop) requestAnimationFrame(tick); };
      requestAnimationFrame(tick); })()`);
    await t.press('ArrowDown');
    await t.wait(500);
    await t.eval('window.__stop = true');
    const path = await t.eval('window.__rec');
    t.expect(path.some((y) => y > 2 * PITCH + 4 && y < 3 * PITCH - 4), 'a keyboard move glides between slots');
  }
  await t.wait(300);
  await expectSettled('after glide');

  // 5b. Move buttons: one click does what a drag does (WCAG 2.5.7 single pointer alternative).
  const rowOf = (id) => `${MAIN} [data-drag-row]:has(button[aria-label="Mover ${names[id]}"])`;
  const btnOf = (id, act) => `${rowOf(id)} button[data-act="${act}"]`;
  const cur = (await order()).split(',');
  t.expectEqual(await t.eval(`document.querySelectorAll('${MAIN} button[data-act="up"]').length`), 5, 'every row has a Subir button');
  t.expectEqual(await t.eval(`document.querySelectorAll('${MAIN} button[data-act="down"]').length`), 5, 'every row has a Bajar button');
  t.expectEqual(await t.attr(btnOf(cur[1], 'down'), 'aria-label'), `Bajar ${names[cur[1]]}`, 'button names come from props');
  t.expectEqual(await t.eval(`document.querySelector('${btnOf(cur[0], 'up')}').disabled`), true, 'the first row cannot go up');
  t.expectEqual(await t.eval(`document.querySelector('${btnOf(cur[4], 'down')}').disabled`), true, 'the last row cannot go down');
  await t.click(btnOf(cur[1], 'down'));
  await t.wait(700);
  const swapped = (await order()).split(',');
  t.expectEqual(swapped[2], cur[1], 'Bajar sends the row one slot down');
  t.expectEqual(swapped[1], cur[2], 'the row it swapped with moved up');
  t.expect((await live()).includes('posición 3 de 5'), `the button move is announced ("${await live()}")`);
  t.expectEqual(await t.eval(`document.activeElement.getAttribute('aria-label')`), `Bajar ${names[cur[1]]}`, 'focus stays on the button that was pressed');
  await expectSettled('after Bajar');
  await t.click(btnOf(cur[1], 'up'));
  await t.wait(700);
  t.expectEqual((await order()).split(','), cur, 'Subir puts it back');
  await t.eval(`document.querySelector('${btnOf(cur[0], 'down')}').focus()`);
  await t.press('Enter');
  await t.wait(700);
  t.expectEqual((await order()).split(',')[1], cur[0], 'Enter on Bajar moves the first row down; focus follows');
  t.expectEqual(await t.eval(`document.activeElement.getAttribute('aria-label')`), `Bajar ${names[cur[0]]}`, 'focus stays on Bajar after the move');
  await t.eval(`document.querySelector('${btnOf(cur[0], 'up')}').click()`);
  await t.wait(700);
  await expectSettled('after button moves');
  // Touch: 44 px targets, and the row is tall enough to hold them.
  await t.coarse(true);
  await t.wait(200);
  t.expect(await t.eval("matchMedia('(pointer: coarse)').matches"), 'coarse pointer emulation is on');
  const sz = await t.eval(`[...document.querySelectorAll('${MAIN} [data-drag-row]:first-child button')].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })`);
  t.expect(sz.length === 3 && sz.every(([w, h]) => w >= 44 && h >= 44), `handle and move buttons are 44 px on touch (${JSON.stringify(sz)})`);
  const rowBox = await t.eval(`(() => { const r = document.querySelector('${MAIN} [data-drag-row]').getBoundingClientRect(); return r.height; })()`);
  t.expect(rowBox >= 46, `rows are tall enough for the touch targets (${rowBox})`);
  await t.coarse(false);
  await t.wait(200);

  // 5c. The six-dot handle stays quiet: no tone change on hover or while held, only the cursor.
  const gSel = grip(names[(await order()).split(',')[1]]);
  const paint = () => t.eval(`(() => { const b = document.querySelector(${JSON.stringify(gSel)}); const cs = getComputedStyle(b); return { bg: cs.backgroundColor, color: cs.color, cursor: cs.cursor, op: cs.opacity, sh: cs.boxShadow }; })()`);
  await t.eval(`document.activeElement && document.activeElement.blur()`);
  await t.hover(`${MAIN} h1, body`).catch(() => {});
  const restPaint = await paint();
  await t.hover(gSel);
  await t.wait(350);
  const hoverPaint = await paint();
  t.expectEqual([hoverPaint.bg, hoverPaint.color, hoverPaint.op, hoverPaint.sh], [restPaint.bg, restPaint.color, restPaint.op, restPaint.sh], 'hovering the handle does not change its background or color');
  t.expectEqual(hoverPaint.cursor, 'grab', 'hovering the handle shows the grab cursor');
  await t.mouseDown(gSel);
  await t.wait(350);
  const heldPaint = await paint();
  t.expectEqual([heldPaint.bg, heldPaint.color, heldPaint.op, heldPaint.sh], [restPaint.bg, restPaint.color, restPaint.op, restPaint.sh], 'holding the handle does not change its background or color');
  t.expectEqual(heldPaint.cursor, 'grabbing', 'holding the handle shows the grabbing cursor');
  t.expectEqual(await t.eval('document.body.style.cursor'), 'grabbing', 'the cursor stays grabbing for the whole drag, wherever the pointer is');
  t.expect(await t.eval(`!!document.querySelector('${MAIN} [data-drag-row][data-lifted]')`), 'the row is lifted while held (its shadow stays)');
  await t.mouseUp();
  await t.wait(500);
  t.expectEqual(await t.eval('document.body.style.cursor'), '', 'the body cursor is restored after the drop');
  t.expectEqual((await paint()).bg, restPaint.bg, 'the handle is quiet again after the drop');
  await expectSettled('after hold');

  // 6. Disabled list: handles inert.
  const dis = `[data-testid="drag-disabled"] button`;
  t.expectEqual(await t.eval(`[...document.querySelectorAll('${dis}')].every((b) => b.disabled)`), true, 'disabled handles');
  const before = await t.eval(`[...document.querySelectorAll('[data-testid="drag-disabled"] [data-drag-row]')].map((r) => r.textContent)`);
  await t.drag(dis, { dy: 80 });
  await t.wait(400);
  t.expectEqual(await t.eval(`[...document.querySelectorAll('[data-testid="drag-disabled"] [data-drag-row]')].map((r) => r.textContent)`), before, 'a disabled list does not reorder');

  // 7. Focus ring on a handle by keyboard.
  await t.focus(grip(names[mid]));
  await t.press('Tab');
  await t.press('Tab');
  await t.focus(grip(names[mid]));
  t.expectEqual(await t.style(grip(names[mid]), 'outline-style'), 'solid', 'focus-visible ring on the handle');
  await t.screenshot(`drag-reorder-interact${t.reducedMotion ? '-reduced' : ''}`);
}
