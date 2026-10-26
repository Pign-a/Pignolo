// Skeleton: shimmer sweeps (or stays still under reduced motion), status region, same-size swap.
export default async function (t) {
  const sweepX = () =>
    t.eval(`(() => { const s = document.querySelector('[data-testid="sk-card"] [data-skeleton] > span'); return s ? new DOMMatrixReadOnly(getComputedStyle(s).transform).e : null; })()`);

  t.expectEqual(await t.attr('[data-testid="sk-card"] [role="status"]', 'aria-busy'), 'true', 'region is busy');
  t.expect((await t.text('[data-testid="sk-card"] [role="status"] .sr-only')).includes('Cargando'), 'region announces what is loading');
  t.expectEqual(await t.attr('[data-testid="sk-card"] [data-skeleton]', 'aria-hidden'), 'true', 'blocks are hidden from assistive tech');
  const before = await t.rect('[data-testid="sk-card"]');

  if (t.reducedMotion) {
    t.expectEqual(await sweepX(), null, 'reduced motion: no sweep element at all');
  } else {
    const xs = [];
    for (let i = 0; i < 6; i++) { xs.push(await sweepX()); await t.wait(120); }
    t.expect(new Set(xs.map((x) => Math.round(x))).size >= 4, `the sweep moves over time (${xs.map((x) => Math.round(x))})`);
    t.expect(xs[1] > xs[0] || xs[2] > xs[1], 'sweep travels left to right');
  }

  // Swapping to content keeps the card box about the same height (no layout jump).
  await t.click('[data-testid="sk-toggle"]');
  await t.wait(100);
  t.expect(!(await t.exists('[data-testid="sk-card"] [data-skeleton]')), 'skeleton is gone when content shows');
  const after = await t.rect('[data-testid="sk-card"]');
  t.expect(Math.abs(after.height - before.height) < 12, `card height stays stable (${Math.round(before.height)} to ${Math.round(after.height)})`);
  const rowsAfter = await t.rect('[data-testid="sk-rows"]');
  await t.click('[data-testid="sk-toggle"]');
  await t.wait(100);
  const rowsBefore = await t.rect('[data-testid="sk-rows"]');
  t.expect(Math.abs(rowsAfter.height - rowsBefore.height) < 2, 'list skeleton rows match final row heights');

  // Waiting: a region with the default delay shows nothing for the first second, then the blocks.
  const BOX = '[data-testid="sk-delay-box"]';
  const blocks = `${BOX} [data-skeleton]`;
  const vis = () => t.eval(`[...document.querySelectorAll('${blocks}')].map((b) => getComputedStyle(b).visibility)`);
  const labelVisible = () => t.eval(`(() => { const l = document.querySelector('${BOX} [role="status"] .sr-only'); return l ? getComputedStyle(l).visibility : null; })()`);
  t.expectEqual(await t.count(blocks), 0, 'no region before the load starts');
  await t.click('[data-testid="sk-delay-start"]');
  await t.wait(350);
  t.expectEqual(await t.count(blocks), 2, 'the blocks are in the DOM from the start (they reserve the space)');
  t.expect((await vis()).every((v) => v === 'hidden'), `blocks are invisible during the first second (${await vis()})`);
  t.expectEqual(await labelVisible(), 'visible', 'the loading label stays available to assistive tech');
  const reserved = await t.rect(BOX);
  await t.wait(800);
  t.expect((await vis()).every((v) => v === 'visible'), 'blocks show once the delay has passed');
  const shown = await t.rect(BOX);
  t.expect(Math.abs(shown.height - reserved.height) < 1, `showing the blocks does not move the layout (${reserved.height} to ${shown.height})`);
  await t.click('[data-testid="sk-delay-stop"]');
  await t.click('[data-testid="sk-delay-start"]');
  await t.wait(300);
  await t.click('[data-testid="sk-delay-stop"]');
  await t.wait(1200);
  t.expectEqual(await t.count(blocks), 0, 'a load that ends within the delay never draws a skeleton');
  // Arrival: first time it fades (cross-fade with the skeleton), a refresh is instant.
  const arrive = async () => {
    await t.eval(`(() => { window.__rec = []; window.__stop = false; const root = document.querySelector('[data-testid="sk-arrive"]');
      const tick = () => { const fig = root.querySelector('[data-testid="sk-arrive-figure"]'); const sk = root.querySelector('[data-skeleton]');
        let so = null; if (sk) { so = 1; for (let e = sk; e && e !== root; e = e.parentElement) so *= Number(getComputedStyle(e).opacity); }
        window.__rec.push({ fig: fig ? Number(getComputedStyle(fig.parentElement).opacity) : null, sk: !!sk, so });
        if (!window.__stop) requestAnimationFrame(tick); };
      requestAnimationFrame(tick); })()`);
    await t.click('[data-testid="sk-arrive-toggle"]');
    await t.wait(700);
    await t.eval('window.__stop = true');
    const f = (await t.eval('window.__rec')).filter((x) => x.fig !== null || x.sk);
    const shown = f.filter((x) => x.fig !== null);
    return { fading: shown.filter((x) => x.fig > 0.02 && x.fig < 0.98).length, first: shown[0].fig, last: shown[shown.length - 1].fig, cross: f.filter((x) => x.fig !== null && x.sk && x.so < 1).length, lingering: f.filter((x) => x.fig !== null && x.sk).length };
  };
  const firstLoad = await arrive();
  t.expect(firstLoad.fading >= 3 && firstLoad.last === 1 && firstLoad.cross >= 1, `first load: content fades in as the skeleton fades out (fading frames ${firstLoad.fading}, cross-fade frames ${firstLoad.cross})`);
  await t.click('[data-testid="sk-arrive-toggle"]');
  await t.wait(400);
  const again = await arrive();
  t.expect(again.first === 1 && again.fading === 0 && again.lingering <= 1, `refresh: the content is there at full opacity at once (first ${again.first}, fading ${again.fading})`);
  await t.focus('[data-testid="sk-toggle"]');
  await t.press('Tab'); // keyboard path: the skeleton itself is never a tab stop
  const onSkeleton = await t.eval(`!!document.activeElement.closest('[data-skeleton]')`);
  t.expect(!onSkeleton, 'skeleton is not focusable');
}
