// Rolling number: formatted text, stagger order, blur, interruptibility, digit-count changes, reduced motion.
const STRIPS = '[data-testid="rn-money"] [aria-hidden="true"] .flex-col';

export default async function (t) {
  const sr = (id = 'rn-money') => t.eval(`document.querySelector('[data-testid="${id}"] .sr-only').textContent`);
  const rest = () =>
    t.eval(`[...document.querySelectorAll('${STRIPS}')].map((s) => ({ y: new DOMMatrixReadOnly(getComputedStyle(s).transform).f, h: s.parentElement.getBoundingClientRect().height }))`);
  const digitsOf = (s) => s.replace(/\D/g, '').split('').map(Number);
  const expectAtRest = async (label) => {
    const text = await sr();
    const want = digitsOf(text);
    if (t.reducedMotion) {
      t.expectEqual(await t.count(STRIPS), 0, `${label}: reduced motion renders no sliding strips`);
      return;
    }
    const strips = await rest();
    t.expectEqual(strips.length, want.length, `${label}: one strip per digit of "${text}"`);
    strips.forEach((s, i) => t.expect(Math.abs(s.y + want[i] * s.h) < 0.6, `${label}: digit ${i} rests on ${want[i]} (y ${s.y.toFixed(2)}, h ${s.h})`));
  };

  // Rest: text for assistive tech, live region, tabular figures, formatted by the prop.
  const first = await sr();
  t.expect(first.includes('1.284.560'), `formatted value for screen readers (got "${first}")`);
  t.expectEqual(await t.attr('[data-testid="rn-money"] .sr-only', 'aria-live'), 'polite', 'announces politely');
  t.expectEqual(await t.attr('[data-testid="rn-money"] [aria-hidden="true"]', 'aria-hidden'), 'true', 'rolling columns hidden from assistive tech');
  t.expect((await t.style('[data-testid="rn-money"] > span', 'font-variant-numeric')).includes('tabular-nums'), 'tabular figures');
  await expectAtRest('initial');
  t.expect((await sr('rn-km')).includes('42,7 km') && (await sr('rn-pct')).includes('18,4'), 'other formats (unit, percent) are honored');

  // A change: record every frame.
  await t.eval(`(() => {
    window.__rec = []; window.__stop = false; window.__t0 = 0;
    document.querySelector('[data-testid="rn-a"]').addEventListener('click', () => { window.__t0 = performance.now(); }, { once: true });
    const tick = () => {
      const strips = [...document.querySelectorAll('${STRIPS}')];
      window.__rec.push({
        t: performance.now(),
        y: strips.map((s) => new DOMMatrixReadOnly(getComputedStyle(s).transform).f),
        f: strips.map((s) => getComputedStyle(s.parentElement).filter),
        o: strips.map((s) => Number(getComputedStyle(s.parentElement).opacity)),
      });
      if (!window.__stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })()`);
  const before = digitsOf(await sr());
  const h = t.reducedMotion ? 0 : (await rest())[0].h;
  await t.click('[data-testid="rn-a"]');
  await t.wait(1400);
  await t.eval('window.__stop = true');
  const after = digitsOf(await sr());
  t.expect((await sr()).includes('1.397.425'), 'value text updates to the final value at once');
  await expectAtRest('after change');

  if (!t.reducedMotion) {
    const rec = await t.eval('({ t0: window.__t0, rec: window.__rec })');
    const changed = before.map((d, i) => (d !== after[i] ? i : -1)).filter((i) => i >= 0);
    t.expect(changed.length >= 5, `several digits change (${changed.length})`);
    const startOf = (i) => {
      const y0 = -before[i] * h, y1 = -after[i] * h;
      const f = rec.rec.find((r) => r.t >= rec.t0 && (r.y[i] - y0) / (y1 - y0) > 0.08);
      return f ? f.t - rec.t0 : null;
    };
    const endOf = (i) => {
      const y0 = -before[i] * h, y1 = -after[i] * h;
      const f = rec.rec.find((r) => r.t >= rec.t0 && (r.y[i] - y0) / (y1 - y0) > 0.97);
      return f ? f.t - rec.t0 : null;
    };
    const starts = changed.map(startOf);
    t.expect(starts.every((s) => s !== null), `every changed digit moves (starts ${JSON.stringify(starts.map((s) => s && Math.round(s)))})`);
    for (let k = 1; k < starts.length; k++) t.expect(starts[k] > starts[k - 1] - 8, `digit ${k} starts after digit ${k - 1} (stagger order)`);
    const step = (starts[starts.length - 1] - starts[0]) / (starts.length - 1);
    t.expect(step > 30 && step < 80, `stagger step is about 50 ms (measured ${Math.round(step)} ms)`);
    const lastEnd = Math.max(...changed.map(endOf));
    t.expect(lastEnd < 1100, `whole roll settles in about a second (last digit done at ${Math.round(lastEnd)} ms)`);
    // Roll duration of one digit: 8 % to 97 % of the way.
    const dur = endOf(changed[0]) - startOf(changed[0]);
    t.expect(dur > 250 && dur < 800, `a single digit takes about the data tier time (${Math.round(dur)} ms)`);
    // Blur: starts near 2 px and clears.
    let maxBlur = 0;
    for (const r of rec.rec) for (const f of r.f) { const m = /blur\(([\d.]+)px\)/.exec(f); if (m) maxBlur = Math.max(maxBlur, Number(m[1])); }
    t.expect(maxBlur > 0.5 && maxBlur <= 2.05, `entry blur reaches up to 2 px (max ${maxBlur.toFixed(2)})`);
    const lastFrame = rec.rec[rec.rec.length - 1];
    t.expect(lastFrame.f.every((f) => f === 'none'), 'blur is removed once settled: ' + JSON.stringify(lastFrame.f));
  } else {
    const rec = await t.eval('({ t0: window.__t0, rec: window.__rec })');
    t.expect(rec.rec.every((r) => r.y.length === 0), 'reduced motion: nothing slides');
  }

  // Interrupt and spam: ten +1 in quick succession ends on the exact value.
  for (let i = 0; i < 10; i++) { await t.click('[data-testid="rn-plus"]'); await t.wait(20); }
  await t.wait(1400);
  t.expect((await sr()).includes('1.397.435'), `spam of +1 ends exact (got "${await sr()}")`);
  await expectAtRest('after spam');

  // Interrupt a roll in the middle with a different target.
  await t.click('[data-testid="rn-b"]');
  await t.wait(120);
  await t.click('[data-testid="rn-c"]');
  await t.wait(1500);
  t.expect((await sr()).includes('12.840.560'), 'retarget mid roll lands on the last value');
  await expectAtRest('after retarget (8 digits)');
  await t.click('[data-testid="rn-b"]');
  await t.wait(1400);
  t.expect((await sr()).includes('98.700'), 'fewer digits');
  await expectAtRest('after shrinking (5 digits)');

  // Eight changing digits settle within about 0.8 s (the per-digit stagger is capped).
  if (!t.reducedMotion) {
    await t.eval(`(() => {
      window.__rec = []; window.__stop = false; window.__t0 = 0;
      document.querySelector('[data-testid="rn-c"]').addEventListener('click', () => { window.__t0 = performance.now(); }, { once: true });
      const tick = () => { window.__rec.push({ t: performance.now(), y: [...document.querySelectorAll('${STRIPS}')].map((s) => new DOMMatrixReadOnly(getComputedStyle(s).transform).f) });
        if (!window.__stop) requestAnimationFrame(tick); };
      requestAnimationFrame(tick); })()`);
    await t.click('[data-testid="rn-c"]');
    await t.wait(1600);
    await t.eval('window.__stop = true');
    const big = await t.eval('({ t0: window.__t0, rec: window.__rec })');
    const finalDigits = digitsOf(await sr());
    t.expectEqual(finalDigits.length, 8, 'the big value has eight digits');
    const h8 = (await rest())[0].h;
    const frames = big.rec.filter((r) => r.t >= big.t0 && r.y.length === 8);
    let lastOff = 0;
    for (const f of frames) if (f.y.some((y, i) => Math.abs(y + finalDigits[i] * h8) > 0.04 * h8)) lastOff = f.t - big.t0;
    t.expect(lastOff > 300 && lastOff < 850, `eight digits settle within about 0.8 s (${Math.round(lastOff)} ms)`);
    console.log('MEASURE eight digits settle ms', Math.round(lastOff));
  }

  // Selecting or finding the figure gives the real number, not the digit columns.
  const picked = await t.eval(`(() => { const el = document.querySelector('[data-testid="rn-money"]'); const sel = getSelection(); sel.removeAllRanges(); const r = document.createRange(); r.selectNodeContents(el); sel.addRange(r); return sel.toString(); })()`);
  const num = (await sr()).replace(/^Ingresos del mes: /, '').replace(/\s/g, '');
  t.expectEqual(picked.replace(/\s/g, ''), num, `copying the figure copies the number only ("${picked}")`);
  t.expectEqual(await t.style('[data-testid="rn-money"] [aria-hidden="true"]', 'user-select'), 'none', 'decorative columns are not selectable');
  await t.eval('getSelection().removeAllRanges()');

  // The announced value carries its label; the label is not part of a copy.
  t.expect((await sr()).startsWith('Ingresos del mes'), `the announcement starts with the label ("${await sr()}")`);
  t.expectEqual(await t.style('[data-testid="rn-money"] .sr-only > span:first-child', 'user-select'), 'none', 'the label stays out of a copy');

  // `instant`: an automatic refresh lands at once, no roll, no blur.
  const AUTO = '[data-testid="rn-auto"]';
  const autoStrips = () => t.eval(`[...document.querySelectorAll('${AUTO} .flex-col')].map((s) => ({ y: new DOMMatrixReadOnly(getComputedStyle(s).transform).f, h: s.parentElement.getBoundingClientRect().height, f: getComputedStyle(s.parentElement).filter }))`);
  await t.click('[data-testid="rn-auto-btn"]');
  await t.wait(70);
  const nowText = (await t.text(`${AUTO} .sr-only`)).replace(/\D/g, '');
  t.expectEqual(nowText, '60555', 'the instant figure shows the new value');
  if (!t.reducedMotion) {
    const strips = await autoStrips();
    t.expect(strips.every((s, i) => Math.abs(s.y + Number(nowText[i]) * s.h) < 0.6 && s.f === 'none'), `instant: every digit is already at rest, no blur (${JSON.stringify(strips.map((s) => Math.round(s.y)))})`);
  }


  // More or fewer characters: new slots grow in and fade, removed slots shrink out, neighbours keep their identity.
  const scenario = async (id, from, to) => {
    const fig = `[data-testid="rn-${id}"]`;
    await t.click(`[data-testid="rn-${id}-${from}"]`);
    await t.wait(1300);
    await t.eval(`(() => { const els = [...document.querySelectorAll('${fig} [aria-hidden="true"] > [data-slot]')]; els.forEach((e, i) => { e.__t = i; }); window.__uid = 1000;
      window.__rec = []; window.__stop = false;
      const tick = () => { const box = document.querySelector('${fig} [aria-hidden="true"]');
        const sl = [...box.querySelectorAll(':scope > [data-slot]')].map((e) => { if (e.__t === undefined) e.__t = window.__uid++; const cs = getComputedStyle(e); return { t: e.__t, w: e.getBoundingClientRect().width, op: parseFloat(cs.opacity), txt: e.textContent.replace(/\D/g, '') ? 'd' : e.textContent }; });
        window.__rec.push({ at: performance.now(), total: box.getBoundingClientRect().width, sl });
        if (!window.__stop) requestAnimationFrame(tick); };
      requestAnimationFrame(tick); })()`);
    const before = await t.count(`${fig} [aria-hidden="true"] > [data-slot]`);
    await t.click(`[data-testid="rn-${id}-${to}"]`);
    await t.wait(1100);
    await t.eval('window.__stop = true');
    const frames = (await t.eval('window.__rec')).filter((f) => f.sl.length > 0);
    const last = frames[frames.length - 1];
    const first = frames[0];
    const firstIds = new Set(first.sl.map((x) => x.t));
    const lastIds = new Set(last.sl.map((x) => x.t));
    const widthOf = (frame, tag) => (frame.sl.find((x) => x.t === tag) || {}).w;
    const entering = [...lastIds].filter((tag) => !firstIds.has(tag));
    const leaving = [...firstIds].filter((tag) => !lastIds.has(tag));
    const survivors = [...firstIds].filter((tag) => lastIds.has(tag));
    const totals = frames.map((f) => f.total);
    const maxStep = Math.max(...totals.slice(1).map((v, i) => Math.abs(v - totals[i])));
    const delta = Math.abs(last.total - first.total);
    return { before, after: await t.count(`${fig} [aria-hidden="true"] > [data-slot]`), frames, last, first, entering, leaving, survivors, maxStep, delta, widthOf, sr: (await t.text(`${fig} .sr-only`)).trim() };
  };
  const cases = [
    { id: 'grow', up: '100', newN: 1, goneN: 1, keep: 2 },
    { id: 'thousand', up: '1.000', newN: 2, goneN: 2, keep: 3 },
    { id: 'dec', up: '10,00', newN: 1, goneN: 1, keep: 4 },
    { id: 'usd', up: '$10.00', newN: 1, goneN: 1, keep: 5 },
    { id: 'ars', up: '100', newN: 1, goneN: 1, keep: 4 },
    { id: 'free', up: '1.234,5', newN: 2, goneN: 2, keep: 5 },
  ];
  for (const c of cases) {
    // Growing: lo to hi.
    const g = await scenario(c.id, 'lo', 'hi');
    t.expect(g.sr.replace(/s/g, '').includes(c.up.replace(/s/g, '')), `${c.id}: shows the new value (${g.sr})`);
    t.expectEqual([g.entering.length, g.survivors.length], [c.newN, c.keep], `${c.id}: ${c.newN} new slot(s) and ${c.keep} slots that keep their identity (no remount of neighbours, prefix, separators)`);
    const ent = g.entering[0];
    const finalW = g.widthOf(g.last, ent);
    const midFrames = g.frames.filter((f) => { const w = f.sl.find((x) => x.t === ent); return w && w.w > 0.5 && w.w < finalW - 0.5; });
    const opFrames = g.frames.filter((f) => { const w = f.sl.find((x) => x.t === ent); return w && w.op > 0.02 && w.op < 0.98; });
    t.expect(opFrames.length >= 2, `${c.id}: the new slot fades in over several frames (${opFrames.length})`);
    if (t.reducedMotion) {
      t.expectEqual(midFrames.length, 0, `${c.id}: reduced motion: the slot takes its full width at once, only a fade`);
    } else {
      t.expect(midFrames.length >= 4, `${c.id}: the new slot grows through intermediate widths (${midFrames.length} frames)`);
      t.expect(g.maxStep < 0.6 * g.delta, `${c.id}: the figure width changes smoothly, no single frame jumps (max step ${g.maxStep.toFixed(1)} of ${g.delta.toFixed(1)} px)`);
    }
    // Shrinking: hi to lo.
    const d = await scenario(c.id, 'hi', 'lo');
    t.expectEqual([d.leaving.length, d.survivors.length, d.after], [c.goneN, c.keep, c.keep], `${c.id}: ${c.goneN} slot(s) leave, the rest keep their identity and the DOM is clean afterwards`);
    const gone = d.leaving[0];
    const fullW = d.widthOf(d.first, gone);
    const shrinking = d.frames.filter((f) => { const w = f.sl.find((x) => x.t === gone); return w && w.w > 0.5 && w.w < fullW - 0.5; });
    const fading = d.frames.filter((f) => { const w = f.sl.find((x) => x.t === gone); return w && w.op > 0.02 && w.op < 0.98; });
    t.expect(fading.length >= 1, `${c.id}: the leaving slot fades out instead of vanishing (${fading.length} frames)`);
    if (t.reducedMotion) t.expectEqual(shrinking.length, 0, `${c.id}: reduced motion: the slot goes without a width animation`);
    else {
      t.expect(shrinking.length >= 2, `${c.id}: the leaving slot shrinks through intermediate widths (${shrinking.length} frames)`);
      t.expect(d.maxStep < 0.75 * d.delta, `${c.id}: shrinking is smooth too (max step ${d.maxStep.toFixed(1)} of ${d.delta.toFixed(1)} px)`);
    }
  }
  // The reference case from the author: 99 to 100 with its measured trajectory.
  if (!t.reducedMotion) {
    const g = await scenario('grow', 'lo', 'hi');
    const e = g.entering[0];
    console.log('MEASURE 99->100 new slot width per frame', g.frames.filter((f) => f.sl.find((x) => x.t === e)).map((f) => Math.round(f.sl.find((x) => x.t === e).w * 10) / 10).join(' '));
  }

  // Mount roll from zero.
  await t.click('[data-testid="rn-mount-btn"]');
  await t.wait(120);
  if (!t.reducedMotion) {
    const mid = await t.eval(`[...document.querySelectorAll('[data-testid="rn-mount"] .flex-col')].map((s) => new DOMMatrixReadOnly(getComputedStyle(s).transform).f)`);
    t.expect(mid.length > 0, 'animateOnMount: the digit columns exist');
    await t.wait(1500);
    const end = await t.eval(`[...document.querySelectorAll('[data-testid="rn-mount"] .flex-col')].map((s) => new DOMMatrixReadOnly(getComputedStyle(s).transform).f)`);
    t.expect(mid.some((y, i) => Math.abs(y - end[i]) > 3), `animateOnMount: at 120 ms the digits are still on their way from zero (${JSON.stringify(mid.map(Math.round))} vs rest ${JSON.stringify(end.map(Math.round))})`);
  }
  await t.wait(1500);
  t.expect((await sr('rn-mount')).includes('64.210'), 'mount value');
  await t.screenshot(`rolling-number-interact${t.reducedMotion ? '-reduced' : ''}`);
}
