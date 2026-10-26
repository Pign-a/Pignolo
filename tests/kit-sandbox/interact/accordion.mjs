// Accordion: open/close height, intermediate heights, keyboard, single vs multiple, spam, inert when closed, reduced motion.
export default async function (t) {
  const single = '[data-testid="acc-single"]';
  const multi = '[data-testid="acc-multi"]';
  const trig = (root, i) => `${root} > div > div:nth-of-type(${i}) h3 button`;
  const trigs = (root) => `${root} button[aria-expanded]`;
  // Height of the i-th region (1 based) in a root.
  const height = (root, i) =>
    t.eval(([r, n]) => document.querySelectorAll(`${r} [role="region"]`)[n - 1].getBoundingClientRect().height, [root, i]);
  const expanded = (root) => t.eval((r) => [...document.querySelectorAll(`${r} button[aria-expanded]`)].map((b) => b.getAttribute('aria-expanded') === 'true'), root);

  // Initial state: "saldo" open, the rest collapsed to 0.
  t.expectEqual(await expanded(single), [true, false, false, false], 'single starts with the first open');
  const full = await height(single, 1);
  t.expect(full > 40, `open region has its content height (${Math.round(full)} px)`);
  t.expect((await height(single, 2)) < 1, 'closed region has no height');
  t.expectEqual(await t.eval(() => [...document.querySelectorAll('[data-testid="acc-single"] [role="region"]')].map((r) => r.hasAttribute('inert'))), [false, true, true, true], 'closed regions are inert');
  const labelled = await t.eval(() => {
    const r = document.querySelector('[data-testid="acc-single"] [role="region"]');
    return document.getElementById(r.getAttribute('aria-labelledby'))?.textContent;
  });
  t.expectEqual(labelled, '¿Cómo se calcula el saldo?', 'region is labelled by its header');

  // Open the second: single mode closes the first. Heights are mid flight at 50 ms.
  await t.click(trig(single, 2));
  await t.wait(50);
  const midOpen = await height(single, 2);
  const midClose = await height(single, 1);
  if (t.reducedMotion) {
    t.expect(midOpen > 20 && midClose < 1, `reduced motion: heights snap (open ${Math.round(midOpen)}, closed ${Math.round(midClose)})`);
  } else {
    t.expect(midOpen > 0.5 && midOpen < (await height(single, 2)) + 0.01, `second region is growing at 50 ms (${midOpen.toFixed(1)} px)`);
    t.expect(midClose < full - 1 || midClose === 0, `first region is already shrinking (${midClose.toFixed(1)} of ${Math.round(full)} px)`);
    await t.wait(30);
    const later = await height(single, 2);
    t.expect(later > midOpen, `growth continues (${midOpen.toFixed(1)} to ${later.toFixed(1)} px)`);
  }
  await t.wait(700);
  t.expectEqual(await expanded(single), [false, true, false, false], 'single: only the second is open');
  t.expectEqual(await t.text('[data-testid="acc-value"]'), 'exportar', 'onValueChange reports the open item');
  const settled = await height(single, 2);
  t.expect(settled > 30, `second region fully open (${Math.round(settled)} px)`);
  t.expect((await height(single, 1)) < 1, 'first region fully closed');
  t.expectEqual(await t.eval(() => [...document.querySelectorAll('[data-testid="acc-single"] [role="region"]')].map((r) => r.hasAttribute('inert'))), [true, false, true, true], 'inert follows the open region');

  // Closing is faster than opening: shortly after the click it is already almost closed.
  await t.click(trig(single, 2));
  await t.wait(220);
  const closing = await height(single, 2);
  t.expect(closing < settled * 0.2, `exit is fast: ${closing.toFixed(1)} of ${Math.round(settled)} px left after 220 ms`);
  await t.wait(500);
  t.expectEqual(await expanded(single), [false, false, false, false], 'collapsible: all can be closed');
  t.expectEqual(await t.text('[data-testid="acc-value"]'), 'ninguna', 'value is empty when all closed');

  // Keyboard: ArrowDown / ArrowUp / Home / End, Enter and Space toggle, disabled is skipped.
  await t.focus(trig(single, 1));
  await t.press('ArrowDown');
  await t.wait(60);
  t.expectEqual(await t.eval(() => document.activeElement.textContent), '¿Puedo exportar mis datos?', 'ArrowDown moves to the next header');
  await t.press('End');
  await t.wait(60);
  t.expectEqual(await t.eval(() => document.activeElement.textContent), '¿Qué moneda se usa?', 'End goes to the last enabled header (disabled is skipped)');
  await t.press('Home');
  await t.wait(60);
  t.expectEqual(await t.eval(() => document.activeElement.textContent), '¿Cómo se calcula el saldo?', 'Home goes to the first header');
  await t.press('Enter');
  await t.wait(600);
  t.expectEqual(await expanded(single), [true, false, false, false], 'Enter opens');
  await t.press('Space');
  await t.wait(600);
  t.expectEqual(await expanded(single), [false, false, false, false], 'Space closes');
  const outline = await t.eval(() => getComputedStyle(document.activeElement).outlineStyle);
  t.expect(outline === 'solid', `focus-visible ring on the header (${outline})`);

  // Disabled header does nothing.
  t.expect(await t.eval(() => document.querySelector('[data-testid="acc-single"] > div > div:nth-of-type(4) h3 button').disabled), 'disabled header is a disabled button');

  // Spam: seven quick toggles end open (odd), consistent attribute and height, nothing stuck.
  for (let i = 0; i < 7; i++) {
    await t.click(trig(single, 3));
    await t.wait(35);
  }
  await t.wait(800);
  t.expectEqual(await expanded(single), [false, false, true, false], 'seven toggles end open');
  const spamH = await height(single, 3);
  t.expect(spamH > 20, `region ends fully open after spam (${Math.round(spamH)} px)`);
  await t.click(trig(single, 3));
  await t.click(trig(single, 3));
  await t.click(trig(single, 3));
  await t.wait(800);
  t.expectEqual(await expanded(single), [false, false, false, false], 'three more toggles end closed');
  t.expect((await height(single, 3)) < 1, 'closed after spam, height 0');

  // Press feedback on a header: a tint on the whole row (checked in detail below), never a scale.
  await t.mouseDown(trig(single, 1));
  await t.wait(150);
  const sc = await t.eval(() => getComputedStyle(document.querySelector('[data-testid="acc-single"] h3 button')).scale);
  await t.mouseUp();
  t.expect(sc === 'none' || parseFloat(sc) === 1, `the pressed header is not scaled (${sc})`);
  await t.wait(600);
  if ((await expanded(single))[0]) { await t.click(trig(single, 1)); await t.wait(700); }

  // Multiple: two open at the start, opening another keeps them.
  t.expectEqual(await expanded(multi), [false, true, true, false], 'multiple starts with exportar and moneda open');
  await t.click(trig(multi, 1));
  await t.wait(700);
  t.expectEqual(await expanded(multi), [true, true, true, false], 'multiple keeps the others open');

  // ---- Author report 1: hover and press must cover the whole question row, edge to edge of the item. ----
  const rowGeo = () =>
    t.eval(() => {
      const trig = document.querySelectorAll('[data-testid="acc-single"] button[aria-expanded]')[2];
      const item = trig.closest('[data-orientation]').closest('[data-state]');
      const tr = trig.getBoundingClientRect();
      const ir = item.getBoundingClientRect();
      const cs = getComputedStyle(trig);
      return { tl: tr.left, tr: tr.right, tt: tr.top, tb: tr.bottom, il: ir.left, ir: ir.right, it: ir.top, scale: cs.scale, bg: cs.backgroundColor, transform: cs.transform, h: tr.height };
    });
  await t.wait(300);
  const rest0 = await rowGeo();
  t.expect(Math.abs(rest0.tl - rest0.il) < 0.5 && Math.abs(rest0.tr - rest0.ir) < 0.5, `the row spans the whole item width (row ${rest0.tl.toFixed(1)}-${rest0.tr.toFixed(1)}, item ${rest0.il.toFixed(1)}-${rest0.ir.toFixed(1)})`);
  t.expect(Math.abs(rest0.tt - rest0.it) < 0.5, 'the row starts at the top edge of the item');
  await t.hover(trig(single, 3));
  await t.wait(250);
  const hov = await rowGeo();
  t.expect(hov.bg !== rest0.bg && hov.bg !== 'rgba(0, 0, 0, 0)', `hover tints the row (${hov.bg})`);
  t.expect(hov.tl === rest0.tl && hov.tr === rest0.tr, 'hover does not change the row box');
  await t.mouseDown(trig(single, 3));
  await t.wait(200);
  const prs = await rowGeo();
  t.expect(prs.bg !== hov.bg, `press changes the tint (${hov.bg} to ${prs.bg})`);
  t.expect(prs.scale === 'none' || parseFloat(prs.scale) === 1, `the pressed row is not scaled, so the highlight keeps covering the whole row (scale ${prs.scale})`);
  t.expect(Math.abs(prs.tl - prs.il) < 0.5 && Math.abs(prs.tr - prs.ir) < 0.5 && Math.abs(prs.tb - hov.tb) < 0.5, 'while pressed the row still spans the whole item width and height');
  await t.mouseUp();
  await t.wait(700);
  // Close what that press opened so the next block starts from a known state.
  if ((await expanded(single))[2]) { await t.click(trig(single, 3)); await t.wait(700); }
  await t.hover('h1');

  // ---- Author report 2: in single mode the swap must not pull the eye. ----
  // The closing and the opening panel share one spring (same time, no bounce); every header moves once, in one direction, with no overshoot.
  const record = (ms) =>
    t.eval(
      (dur) =>
        new Promise((resolve) => {
          const out = [];
          const t0 = performance.now();
          const tick = () => {
            const now = performance.now() - t0;
            const trigs = [...document.querySelectorAll('[data-testid="acc-single"] button[aria-expanded]')];
            const regs = [...document.querySelectorAll('[data-testid="acc-single"] [role="region"]')];
            out.push({ t: now, tops: trigs.map((b) => b.getBoundingClientRect().top), hs: regs.map((r) => r.getBoundingClientRect().height) });
            if (now < dur) requestAnimationFrame(tick);
            else resolve(out);
          };
          tick();
        }),
      ms,
    );
  const analyse = (frames, clicked, closing) => {
    const first = frames[0];
    const last = frames[frames.length - 1];
    const n = first.tops.length;
    const res = { path: [], overshoot: [], monotonic: [], syncGap: 0, travelMs: 0 };
    for (let i = 0; i < n; i++) {
      const series = frames.map((f) => f.tops[i]);
      const net = series[series.length - 1] - series[0];
      const dir = Math.sign(net);
      let path = 0;
      let back = 0;
      let over = 0;
      for (let k = 1; k < series.length; k++) {
        const d = series[k] - series[k - 1];
        path += Math.abs(d);
        if (dir !== 0 && d * dir < -0.3) back = Math.max(back, -d * dir);
      }
      for (const v of series) over = Math.max(over, dir > 0 ? v - series[series.length - 1] : dir < 0 ? series[series.length - 1] - v : 0);
      res.path.push({ net, path, back, over });
    }
    // Progress of the closing panel and of the opening one, per frame, while both move.
    const h1 = first.hs[closing];
    const h2 = last.hs[clicked];
    for (const f of frames) {
      const pc = 1 - f.hs[closing] / h1;
      const po = f.hs[clicked] / h2;
      if (pc > 0.02 && pc < 0.98) res.syncGap = Math.max(res.syncGap, Math.abs(pc - po));
    }
    const moved = frames.filter((f) => Math.abs(f.hs[clicked] - first.hs[clicked]) > 0.5);
    const done = frames.find((f) => Math.abs(f.hs[clicked] - h2) < 0.5 && f.t > (moved[0]?.t ?? 0));
    res.travelMs = moved.length && done ? done.t - moved[0].t : 0;
    return res;
  };

  // Start: item 1 open. Click item 3 (below): item 1 closes above it, so its header has to rise by the closing height.
  await t.click(trig(single, 1));
  await t.wait(700);
  if (!(await expanded(single))[0]) { await t.click(trig(single, 1)); await t.wait(700); }
  const rec1 = record(1400);
  await t.wait(120);
  await t.click(trig(single, 3));
  const f1 = await rec1;
  const a1 = analyse(f1, 2, 0);
  const closedH = f1[0].hs[0];
  const clicked1 = a1.path[2];
  t.expect(Math.abs(clicked1.net + closedH) < 1.5, `the clicked header rises by exactly the height that closed above it (${clicked1.net.toFixed(1)} of -${closedH.toFixed(1)})`);
  t.expect(clicked1.path <= Math.abs(clicked1.net) + 0.8, `the clicked header travels once, with no wobble (path ${clicked1.path.toFixed(1)} px for ${Math.abs(clicked1.net).toFixed(1)} px)`);
  for (let i = 0; i < a1.path.length; i++) {
    const p = a1.path[i];
    t.expect(p.back < 0.5, `header ${i + 1} never moves against its direction (back ${p.back.toFixed(2)} px)`);
    t.expect(p.over < 0.6, `header ${i + 1} never overshoots its final position (over ${p.over.toFixed(2)} px)`);
  }
  if (!t.reducedMotion) {
    t.expect(a1.syncGap < 0.1, `the closing and the opening panel move in step (max progress gap ${a1.syncGap.toFixed(3)})`);
    t.expect(a1.travelMs >= 220 && a1.travelMs <= 520, `the swap is one calm motion, not a snap or a drag (${Math.round(a1.travelMs)} ms)`);
  }

  // Click item 1 (above the open one): its header must not move at all, whatever happens below it.
  const rec2 = record(1400);
  await t.wait(120);
  await t.click(trig(single, 1));
  const f2 = await rec2;
  const a2 = analyse(f2, 0, 2);
  t.expect(a2.path[0].path < 0.6, `opening a section above the open one keeps its own header still (moved ${a2.path[0].path.toFixed(2)} px)`);
  for (let i = 0; i < a2.path.length; i++) t.expect(a2.path[i].over < 0.6 && a2.path[i].back < 0.5, `header ${i + 1} moves in one direction without overshoot`);
  if (!t.reducedMotion) t.expect(a2.syncGap < 0.1, `also in step when opening upwards (max progress gap ${a2.syncGap.toFixed(3)})`);
  await t.wait(400);

  // A lone close (nothing replaces it) stays fast, as before.
  await t.click(trig(single, 1));
  await t.wait(220);
  t.expect((await height(single, 1)) < 3 || t.reducedMotion, 'a lone close is still quick');
  await t.wait(500);
  await t.screenshot(`accordion-${t.reducedMotion ? 'reduced' : 'motion'}`);
}
