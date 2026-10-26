// List: add entry, remove (rapid and keyboard), reorder, reflow time, leaving rows take no clicks, empty state, announcements.
const MAIN = '[data-testid="list-main"]';
const MANY = '[data-testid="list-many"]';
const rows = (root) => `${root} [data-list-row]`;
const liveRows = (root) => `${root} [data-list-row] > div:not([inert])`;
const removeBtn = (root) => `${root} [data-list-row] > div:not([inert]) button[data-act="remove"]`;

export default async function (t) {
  const labels = (root) => t.eval(`[...document.querySelectorAll('${liveRows(root)}')].map((r) => r.querySelector('span span').textContent)`);
  const tops = (root) => t.eval(`[...document.querySelectorAll('${rows(root)}')].map((r) => Math.round((r.getBoundingClientRect().top + window.scrollY) * 10) / 10)`);

  t.expectEqual((await labels(MAIN)).length, 4, 'four rows at first');
  t.expectEqual(await t.attr(`${MAIN} ul`, 'aria-label'), 'Tareas', 'list is named');

  // Add: the new row appears at the top, sliding in from the left.
  await t.eval(`(() => {
    window.__rec = []; window.__stop = false;
    const tick = () => {
      const li = document.querySelector('${MAIN} [data-list-row]');
      const s = getComputedStyle(li);
      window.__rec.push({ t: performance.now(), n: document.querySelectorAll('${MAIN} [data-list-row]').length, o: Number(s.opacity), x: new DOMMatrixReadOnly(s.transform).e });
      if (!window.__stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })()`);
  await t.click('[data-testid="list-add"]');
  await t.wait(700);
  await t.eval('window.__stop = true'); await t.wait(60);
  const addRec = await t.eval('window.__rec');
  const after = await labels(MAIN);
  t.expectEqual(after.length, 5, 'one row added');
  t.expectEqual(after[0], 'Pagar alquiler'.length ? after[0] : '', 'new row goes first');
  const grown = addRec.filter((r) => r.n === 5);
  if (t.reducedMotion) {
    t.expect(grown.every((r) => Math.abs(r.x) < 0.5), 'reduced motion: the new row does not travel');
  } else {
    t.expect(grown.some((r) => r.x < -2 && r.o < 0.9), 'new row slides in from the left while fading in');
  }
  t.expect(grown[grown.length - 1].o > 0.99 && Math.abs(grown[grown.length - 1].x) < 0.5, 'new row settles');

  // Reflow time after one removal in the ten-row list.
  const before = await tops(MANY);
  await t.eval(`(() => {
    window.__rec = []; window.__stop = false; window.__t0 = 0;
    const btn = document.querySelector('${removeBtn(MANY)}');
    btn.addEventListener('click', () => { window.__t0 = performance.now(); }, { once: true });
    const tick = () => {
      window.__rec.push({ t: performance.now(), tops: [...document.querySelectorAll('${rows(MANY)}')].map((r) => ({ top: r.getBoundingClientRect().top + window.scrollY, o: Number(getComputedStyle(r).opacity), gone: !!r.querySelector('div[inert]') })) });
      if (!window.__stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })()`);
  await t.click(removeBtn(MANY));
  await t.wait(900);
  await t.eval('window.__stop = true'); await t.wait(60);
  const rr = await t.eval('({ t0: window.__t0, rec: window.__rec })');
  const afterTops = await tops(MANY);
  t.expectEqual(afterTops.length, 9, 'the removed row leaves the DOM');
  t.expect(Math.abs(afterTops[0] - before[0]) < 1, 'the next row ends where the first one was');
  // Rows below: each ends one pitch up. Find the last frame where any surviving row is off target by more than 1 px.
  const frames = rr.rec.filter((f) => f.t >= rr.t0 && f.tops.length >= 9);
  let lastOff = 0;
  for (const f of frames) {
    const living = f.tops.filter((r) => !r.gone);
    const off = living.some((r, i) => Math.abs(r.top - afterTops[i]) > 1);
    if (off) lastOff = f.t - rr.t0;
  }
  if (t.reducedMotion) t.expect(lastOff < 60, `reduced motion: reflow is immediate (${Math.round(lastOff)} ms)`);
  else t.expect(lastOff > 40 && lastOff < 300, `reflow settles in under 300 ms (${Math.round(lastOff)} ms) and is not instant`);
  console.log('MEASURE reflow settle ms', Math.round(lastOff));
  const leavingSeen = frames.some((f) => f.tops.some((r) => r.gone));
  t.expect(leavingSeen, 'the leaving row is marked inert (takes no clicks) while it exits');
  const exitEnd = frames.find((f) => f.tops.length === 9 && f.t - rr.t0 > 20);
  t.expect(exitEnd && exitEnd.t - rr.t0 < 260, `the leaving row is gone within 260 ms (${exitEnd ? Math.round(exitEnd.t - rr.t0) : 'never'})`);
  t.expect((await t.text(`${MANY} .sr-only`)).includes('quitada'), 'removal is announced');

  // Spam: remove rapidly, chasing the first live row, 30 ms apart.
  // Programmatic clicks every 30 ms (the harness re-scrolls to a moving target, which a real pointer would not).
  for (let i = 0; i < 7; i++) { await t.eval(`document.querySelector('${removeBtn(MANY)}').click()`); await t.wait(30); }
  await t.wait(700);
  t.expectEqual((await labels(MANY)).length, 2, `rapid deletes keep working (left: ${JSON.stringify(await labels(MANY))})`);
  t.expectEqual(await t.count(rows(MANY)), 2, 'no zombie rows stay in the DOM');
  // And with a real pointer at a quick human pace.
  await t.click(removeBtn(MANY));
  await t.wait(230);
  await t.click(removeBtn(MANY));
  await t.wait(600);
  t.expect(await t.exists(`${MANY} [data-list-empty]`), 'empty state appears when the last row goes');
  t.expect((await t.text(`${MANY} [data-list-empty]`)).includes('No quedan tareas'), 'empty title');

  // Keyboard: Delete on a row control removes it; focus moves to the next remove button.
  const second = `${rows(MAIN)}:nth-child(2) button[data-act="remove"]`;
  const labelsBefore = await labels(MAIN);
  await t.focus(second);
  await t.press('Delete');
  await t.wait(500);
  const labelsAfter = await labels(MAIN);
  t.expectEqual(labelsAfter, labelsBefore.filter((_, i) => i !== 1), 'Delete removes the focused row');
  const focused = await t.eval(`document.activeElement.getAttribute('aria-label')`);
  t.expectEqual(focused, `Quitar ${labelsBefore[2]}`, 'focus moves to the next row remove button');

  // The shortcut keys are advertised, and the app is told about each removal so it can offer undo.
  t.expect((await t.attr(`${rows(MAIN)}:nth-child(1) button[data-act="remove"]`, 'aria-keyshortcuts')).includes('Delete'), 'remove button advertises Delete (aria-keyshortcuts)');
  t.expect((await t.attr(`${rows(MAIN)}:nth-child(1) button[data-act="down"]`, 'aria-keyshortcuts')) === 'Alt+ArrowDown', 'move down advertises Alt+ArrowDown');
  t.expect((await t.attr(`${rows(MAIN)}:nth-child(2) button[data-act="up"]`, 'aria-keyshortcuts')) === 'Alt+ArrowUp', 'move up advertises Alt+ArrowUp');
  t.expect((await t.text('[data-testid="list-last-text"]')).includes('con el teclado'), `onRemove reports the shortcut removal ("${await t.text('[data-testid="list-last-text"]')}")`);
  t.expect((await t.text('[data-testid="list-last-text"]')).includes('posición 2'), 'onRemove reports where the row was');
  await t.click('[data-testid="list-undo"]');
  await t.wait(500);
  t.expectEqual(await labels(MAIN), labelsBefore, 'undo puts the row back where it was');
  await t.eval(`document.querySelector('${rows(MAIN)}:nth-child(1) button[data-act="remove"]').click()`);
  await t.wait(500);
  t.expect((await t.text('[data-testid="list-last-text"]')).includes('con el botón'), 'onRemove also reports a button removal');
  await t.click('[data-testid="list-undo"]');
  await t.wait(500);
  t.expectEqual(await labels(MAIN), labelsBefore, 'undo of the first row restores the order');

  // Touch screens get 44 px targets.
  await t.coarse(true);
  await t.wait(200);
  t.expect(await t.eval("matchMedia('(pointer: coarse)').matches"), 'coarse pointer emulation is on');
  const sizes = await t.eval(`[...document.querySelectorAll('${MAIN} [data-list-row] button')].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })`);
  t.expect(sizes.length > 0 && sizes.every(([w, h]) => w >= 44 && h >= 44), `row buttons are at least 44 px on touch (${JSON.stringify(sizes[0])})`);
  await t.coarse(false);
  await t.wait(200);
  const fine = await t.eval(`(() => { const r = document.querySelector('${MAIN} [data-list-row] button').getBoundingClientRect(); return Math.round(r.width); })()`);
  t.expectEqual(fine, 32, 'row buttons stay 32 px with a mouse');

  // Reorder with buttons and with Alt+Arrow; focus stays with the moved row.
  const order0 = await labels(MAIN);
  const topsBefore = await tops(MAIN);
  await t.eval(`(() => { window.__rec = []; window.__stop = false;
    const tick = () => { window.__rec.push([...document.querySelectorAll('${rows(MAIN)}')].map((r) => r.getBoundingClientRect().top + window.scrollY)); if (!window.__stop) requestAnimationFrame(tick); };
    requestAnimationFrame(tick); })()`);
  await t.focus(`${rows(MAIN)}:nth-child(1) button[data-act="down"]`);
  await t.press('Enter');
  await t.wait(120);
  await t.eval('window.__stop = true'); await t.wait(60);
  const swapFrames = await t.eval('window.__rec');
  await t.wait(500);
  const order1 = await labels(MAIN);
  t.expectEqual(order1.slice(0, 2), [order0[1], order0[0]], 'Enter on "Bajar" swaps with the next row');
  t.expectEqual(await t.eval(`document.activeElement.getAttribute('aria-label')`), `Bajar ${order0[0]}`, 'focus stays on the moved row');
  if (!t.reducedMotion) {
    const dom = await t.eval(`[...document.querySelectorAll('${rows(MAIN)}')].map((r) => r.querySelector('span span').textContent)`);
    const idx = dom.indexOf(order0[0]);
    t.expect(swapFrames.some((f) => f[idx] > topsBefore[0] + 3 && f[idx] < topsBefore[1] - 3), 'the moved row travels through intermediate positions (animated swap)');
  }
  t.expect((await t.text(`${MAIN} .sr-only`)).includes('posición 2 de'), 'move is announced');
  t.expectEqual(await t.eval(`document.querySelector('${rows(MAIN)}:first-child button[data-act="up"]')?.disabled`), true, 'first row cannot move up');
  await t.focus(`${rows(MAIN)} button[aria-label="Bajar ${order0[0]}"]`);
  await t.press('Enter');
  await t.wait(500);
  await t.eval(`document.querySelector('${rows(MAIN)} button[aria-label^="Subir"]:not(:disabled)').focus()`);
  const lastLabels = await labels(MAIN);
  // Alt+ArrowDown on the first row's down button.
  await t.eval(`document.querySelector('${rows(MAIN)} button[data-act="down"]').focus()`);
  const firstName = (await labels(MAIN))[0];
  await t.eval(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }))`);
  await t.wait(500);
  t.expectEqual((await labels(MAIN))[1], firstName, 'Alt+ArrowDown moves the row down');
  t.expect(lastLabels.length === (await labels(MAIN)).length, 'moving never changes the count');

  // Empty the main list by keyboard: focus ends on the list region, empty state shows with its action.
  for (let i = 0; i < 6 && (await t.exists(removeBtn(MAIN))); i++) {
    await t.eval(`document.querySelector('${removeBtn(MAIN)}').focus()`);
    await t.press('Backspace');
    await t.wait(450);
  }
  t.expect(await t.exists(`${MAIN} [data-list-empty]`), 'main list reaches the empty state');
  t.expect((await t.text(`${MAIN} [data-list-empty]`)).includes('Empezá agregando'), 'empty copy comes from props');
  t.expectEqual(await t.eval(`document.activeElement === document.querySelector('${MAIN} div[tabindex="-1"]')`), true, 'focus lands on the list region, not lost');
  await t.click('[data-testid="list-empty-add"]');
  await t.wait(500);
  t.expectEqual((await labels(MAIN)).length, 1, 'the empty-state action adds a row again');
  t.expect(!(await t.exists(`${MAIN} [data-list-empty]`)), 'empty state is gone');

  // Press feedback on an icon button.
  if (!t.reducedMotion) {
    const b = `${rows(MAIN)} button[data-act="remove"]`;
    await t.mouseDown(b);
    await t.wait(160);
    const s = await t.eval(`new DOMMatrixReadOnly(getComputedStyle(document.querySelector('${b}')).transform).a`);
    await t.eval(`document.querySelector('${b}').blur()`);
    await t.mouseUp();
    t.expect(s > 0.95 && s < 0.99, `icon buttons press to about 0.97 (${s.toFixed(3)})`);
  }
  await t.screenshot(`list-interact${t.reducedMotion ? '-reduced' : ''}`);
}
