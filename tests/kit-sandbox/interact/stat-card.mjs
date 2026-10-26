// Stat card: structure, trend words, figure roll, loading/empty/error, clickable card (keyboard, hover, press).
export default async function (t) {
  const band = '[data-testid="sc-band"]';
  const card = (n) => `${band} > :nth-child(${n})`;
  const matrix = (sel) =>
    t.eval(`(() => { const cs = getComputedStyle(document.querySelector(${JSON.stringify(sel)})); const m = new DOMMatrixReadOnly(cs.transform); return { a: m.a * (parseFloat(cs.scale) || 1), f: m.f }; })()`);

  // Structure: group named by its label; value readable; trend says the direction in words.
  t.expectEqual(await t.attr(card(1), 'role'), 'group', 'card is a group');
  const labelId = await t.attr(card(1), 'aria-labelledby');
  t.expect((await t.eval(`document.getElementById(${JSON.stringify(labelId)}).textContent`)) === 'Ingresos del mes', 'group is named by the label');
  t.expect((await t.text(`${card(1)} .sr-only`)).includes('1.284.560'), 'figure is readable as text');
  t.expect((await t.text(`${card(1)} .sr-only`)).startsWith('Ingresos del mes'), 'the announced figure carries the card label');
  t.expect((await t.text(`${card(1)} [data-stat="trend"]`)).includes('Sube'), 'trend says the direction in words');
  t.expect((await t.text(`${card(2)} [data-stat="trend"]`)).includes('Baja'), 'down trend says it in words');
  t.expectEqual(await t.eval(`document.querySelector('${card(1)} [data-stat="trend"] svg').getAttribute('aria-hidden')`), 'true', 'arrow icon is decorative');
  // Color is a secondary cue: up on income is good, up on expenses is bad, and they differ.
  const goodUp = await t.eval(`getComputedStyle(document.querySelector('${card(1)} [data-stat="trend"] svg')).color`);
  const badUp = await t.eval(`getComputedStyle(document.querySelector('[data-testid="sc-bad"] [data-stat="trend"] svg')).color`);
  t.expect(goodUp !== badUp, `upIsGood flips the cue color (${goodUp} vs ${badUp})`);
  t.expect(!(await t.text('[data-testid="sc-bad"] [data-stat="trend"]')).includes('undefined'), 'trend words come from props');

  // Update: the figure rolls.
  await t.click('[data-testid="sc-update"]');
  await t.wait(110);
  if (!t.reducedMotion) {
    const mid = await t.eval(`[...document.querySelectorAll('${card(1)} .flex-col')].map((s) => new DOMMatrixReadOnly(getComputedStyle(s).transform).f)`);
    const target = await t.eval(`[...document.querySelectorAll('${card(1)} .flex-col')].map((s) => s.parentElement.getBoundingClientRect().height)`);
    t.expect(mid.length === 7, `7 digit columns (${mid.length})`);
    // 1.284.560 -> 1.397.425: digits are somewhere between rest positions at 110 ms.
    t.expect(mid.some((y, i) => { const old = -[1, 2, 8, 4, 5, 6, 0][i] * target[i]; const nw = -[1, 3, 9, 7, 4, 2, 5][i] * target[i]; return old !== nw && y !== old && y !== nw; }), 'some digit is mid-roll');
  }
  await t.wait(1400);
  t.expect((await t.text(`${card(1)} .sr-only`)).includes('1.397.425'), 'figure updated');
  t.expect((await t.text(`${card(2)} .sr-only`)).includes('698.150'), 'second card updated too');

  // Loading, empty, error.
  t.expectEqual(await t.attr('[data-testid="sc-loading"] [role="status"]', 'aria-busy'), 'true', 'loading: status region is busy');
  t.expect((await t.count('[data-testid="sc-loading"] [data-skeleton]')) === 2, 'loading: skeleton for the figure and the note');
  t.expect((await t.text('[data-testid="sc-empty"] [data-stat="empty"]')).trim() === '-', 'empty: a mark, not a zero');
  t.expect((await t.text('[data-testid="sc-empty"]')).includes('Todavía no hay ventas'), 'empty: one explanatory line');
  t.expect(!(await t.exists('[data-testid="sc-empty"] .flex-col')), 'empty: no rolling digits');
  t.expect((await t.text('[data-testid="sc-error"]')).includes('No se pudo cargar'), 'error: message');
  t.expect(!/\d{3}/.test(await t.text('[data-testid="sc-error"]')), 'error: no stale number');
  await t.coarse(true);
  await t.wait(200);
  const retryH = await t.eval(`Math.round(document.querySelector('[data-testid="sc-error"] button').getBoundingClientRect().height)`);
  t.expect(retryH >= 44, `the retry button is 44 px on touch (${retryH})`);
  await t.coarse(false);
  await t.wait(100);
  await t.focus('[data-testid="sc-error"] button');
  await t.press('Enter');
  await t.wait(110);
  if (!t.reducedMotion) {
    t.expect((await t.count('[data-testid="sc-error"] .flex-col')) > 0, 'retry: figure appears rolling');
  }
  await t.wait(1400);
  t.expect((await t.text('[data-testid="sc-error"] .sr-only')).includes('352.800'), 'retry via keyboard shows the figure');

  // Clickable card: keyboard, hover, press, ring.
  const click = '[data-testid="sc-click"] button';
  await t.focus('[data-testid="sc-update"]');
  // Tab into the clickable card: from the update button the next stops are the error retry... use focus + Shift via direct focus
  await t.focus(click);
  t.expectEqual(await t.eval(`document.activeElement === document.querySelector(${JSON.stringify(click)})`), true, 'card button is focusable');
  await t.press('Tab');
  await t.press('Tab');
  await t.focus(click);
  await t.press('Enter');
  await t.press('Space');
  await t.wait(60);
  t.expectEqual((await t.text('[data-testid="sc-clicks"]')).trim(), 'Aperturas: 2', 'Enter and Space both activate');
  const outline = await t.style(click, 'outline-style');
  // focus() from script after keyboard use still counts as focus-visible in Chromium.
  t.expect(outline === 'solid', `focus ring drawn (${outline})`);
  const r0 = await t.rect(click);
  await t.hover(click);
  await t.wait(500);
  const hov = await matrix(click);
  // Decision 4: no hover lift anywhere. Hover changes color and shadow only.
  t.expect(Math.abs(hov.f) < 0.5, `hover does not lift the card (${hov.f.toFixed(2)})`);
  t.expect((await t.style(click, 'box-shadow')) !== 'none', 'hover adds a soft shadow');
  await t.mouseDown(click);
  await t.wait(160);
  const pressed = await matrix(click);
  await t.mouseUp();
  if (!t.reducedMotion) t.expect(pressed.a > 0.95 && pressed.a < 0.99, `press scale near 0.97 (${pressed.a.toFixed(3)})`);
  t.expect(r0.height > 100, 'card has a real size');
  // The loading skeleton waits 1 s by default (loads under a second show nothing), and reserves its space.
  const DELAY = '[data-testid="sc-delay"]';
  const blocksVis = () => t.eval(`[...document.querySelectorAll('${DELAY} [data-skeleton]')].map((b) => getComputedStyle(b).visibility)`);
  await t.click('[data-testid="sc-reload"]');
  await t.wait(300);
  t.expect((await blocksVis()).length === 2 && (await blocksVis()).every((v) => v === 'hidden'), `loading blocks wait during the first second (${await blocksVis()})`);
  await t.wait(900);
  t.expect((await blocksVis()).every((v) => v === 'visible'), 'then the skeleton shows');
  await t.click('[data-testid="sc-reload"]');
  await t.wait(200);
  t.expectEqual(await t.exists(`${DELAY} [data-skeleton]`), false, 'it goes away with the load');

  // Arrival: the first time a figure replaces a skeleton it fades in (and rolls); a refresh does not animate.
  const arrive = async (id) => {
    const root = `[data-testid="sc-arrive-${id}"]`;
    await t.eval(`(() => { const root = document.querySelector('${root}'); window.__rec = []; window.__stop = false;
      const tick = () => { const card = root.querySelector('[role="group"], button');
        const val = root.querySelector('[data-stat="value"]'); const wrap = val && val.parentElement;
        const sk = [...root.querySelectorAll('[data-skeleton]')];
        const label = root.querySelector('p[id]');
        window.__rec.push({ at: performance.now(), h: card.getBoundingClientRect().height,
          fig: val ? Number(getComputedStyle(wrap).opacity) : null,
          strips: val ? [...val.querySelectorAll('.flex-col')].map((e) => new DOMMatrixReadOnly(getComputedStyle(e).transform).f) : [],
          sk: sk.length, skOp: sk.length ? (() => { let o = 1; for (let e = sk[0]; e && e !== root; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; })() : null,
          label: label ? Number(getComputedStyle(label).opacity) : null });
        if (!window.__stop) requestAnimationFrame(tick); };
      requestAnimationFrame(tick); })()`);
    await t.click(`${root} button`);
    await t.wait(1000);
    await t.eval('window.__stop = true');
    const frames = (await t.eval('window.__rec')).filter((f) => f.fig !== null || f.sk > 0);
    const shown = frames.filter((f) => f.fig !== null);
    const last = shown[shown.length - 1];
    const off = (f) => Math.max(0, ...f.strips.map((y, i) => Math.abs(y - (last.strips[i] ?? y))));
    return {
      frames, shown, last,
      fading: shown.filter((f) => f.fig > 0.02 && f.fig < 0.98).length,
      rolling: shown.filter((f) => off(f) > 2).length,
      crossFrames: frames.filter((f) => f.fig !== null && f.sk > 0 && f.skOp !== null && f.skOp < 1).length,
      firstOpacity: shown[0].fig,
      overlap: frames.filter((f) => f.fig !== null && f.sk > 0).length,
      labelMin: Math.min(...frames.map((f) => f.label ?? 1)),
      hSpread: Math.max(...frames.map((f) => f.h)) - Math.min(...frames.filter((f) => f.fig !== null).map((f) => f.h)),
    };
  };
  const first = await arrive('auto');
  t.expect(first.fading >= 3, `auto, first load: the figure fades in over several frames (${first.fading})`);
  t.expectEqual(first.last.fig, 1, 'auto, first load: the figure ends fully opaque');
  t.expect(first.last.sk === 0, 'auto, first load: the skeleton is gone once it settles');
  t.expect(first.labelMin === 1, 'the label never dips while the rest cross-fades');
  if (t.reducedMotion) {
    t.expectEqual(first.rolling, 0, 'reduced motion: the first load only fades, no digits roll');
    t.expectEqual(await t.count('[data-testid="sc-arrive-auto"] .flex-col'), 0, 'reduced motion: no sliding strips at all');
  } else {
    t.expect(first.rolling >= 5, `auto, first load: the digits roll up from zero (${first.rolling} frames in motion)`);
    t.expect(first.crossFrames >= 1, 'auto, first load: the skeleton fades out while the figure fades in (cross-fade)');
    t.expect(first.hSpread < 3, `the card does not change height during the swap (${first.hSpread.toFixed(1)} px)`);
  }
  // A refresh of a figure that was already shown: loading and back.
  await t.click('[data-testid="sc-arrive-auto"] button');
  await t.wait(500);
  const refresh = await arrive('auto');
  t.expect(refresh.firstOpacity === 1 && refresh.fading === 0, `auto, refresh: the figure is fully opaque from its first frame (first ${refresh.firstOpacity}, fading frames ${refresh.fading})`);
  t.expectEqual(refresh.rolling, 0, 'auto, refresh: the digits are at rest at once (no roll from zero)');
  t.expect(refresh.overlap <= 1, `auto, refresh: the skeleton does not linger over the figure (${refresh.overlap} frames)`);
  // Forced fade, on a refresh as well: opacity only, no roll.
  const fade1 = await arrive('fade');
  t.expect(fade1.fading >= 3 && fade1.rolling === 0, `fade: first load fades (${fade1.fading}) and does not roll (${fade1.rolling})`);
  await t.click('[data-testid="sc-arrive-fade"] button');
  await t.wait(500);
  const fade2 = await arrive('fade');
  t.expect(fade2.fading >= 3 && fade2.rolling === 0, 'fade: forced on a refresh too');
  // Never animate.
  const none = await arrive('none');
  t.expect(none.firstOpacity === 1 && none.fading === 0 && none.rolling === 0, `none: the figure is simply there (first opacity ${none.firstOpacity}, fading ${none.fading}, rolling ${none.rolling})`);
  if (!t.reducedMotion) console.log('MEASURE first load fade frames', first.fading, 'rolling frames', first.rolling, '| refresh', refresh.fading, refresh.rolling);
  await t.screenshot(`stat-card-interact${t.reducedMotion ? '-reduced' : ''}`);
}
