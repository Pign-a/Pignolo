// Switch: thumb travel (mid-animation sample), press stretch, rapid toggles, keyboard, label click, disabled.
export default async function (t) {
  const thumbOf = (id) => `[data-testid="${id}"] > span[data-state]`;
  const tf = (sel) => t.eval((s) => {
    const m = new DOMMatrixReadOnly(getComputedStyle(document.querySelector(s)).transform);
    return { x: m.e, sx: m.a };
  }, sel);
  const checked = (id) => t.attr(`[data-testid="${id}"]`, 'aria-checked');

  t.expectEqual(await t.attr('[data-testid="sw-plane"]', 'role'), 'switch', 'role=switch');
  t.expectEqual(await checked('sw-plane'), 'false', 'starts off');
  t.expectEqual(await checked('sw-notif'), 'true', 'starts on');
  let p = await tf(thumbOf('sw-notif'));
  t.expect(Math.abs(p.x - 20) < 0.5, `on thumb sits at +20px (got ${p.x.toFixed(1)})`);

  // Click: sample mid-animation
  await t.hover('[data-testid="sw-plane"]');
  await t.mouseDown('[data-testid="sw-plane"]');
  await t.wait(110);
  p = await tf(thumbOf('sw-plane'));
  if (t.reducedMotion) t.expect(Math.abs(p.sx - 1) < 0.001, `reduced: no stretch (sx=${p.sx})`);
  else t.expect(p.sx > 1.1 && p.sx < 1.2, `thumb stretches to ~1.15 while pressed (got ${p.sx.toFixed(3)})`);
  await t.mouseUp();
  await t.wait(70);
  p = await tf(thumbOf('sw-plane'));
  if (t.reducedMotion) t.expect(Math.abs(p.x - 20) < 0.5, `reduced: thumb jumps to 20 (got ${p.x.toFixed(1)})`);
  else t.expect(p.x > 1 && p.x < 19.5, `thumb is mid-travel 70 ms after release (x=${p.x.toFixed(1)})`);
  await t.wait(700);
  p = await tf(thumbOf('sw-plane'));
  t.expect(Math.abs(p.x - 20) < 0.5 && Math.abs(p.sx - 1) < 0.01, `settles at 20, unstretched (x=${p.x.toFixed(2)}, sx=${p.sx.toFixed(3)})`);
  t.expectEqual(await checked('sw-plane'), 'true', 'checked after click');
  const layer = await t.eval(() => parseFloat(getComputedStyle(document.querySelector('[data-testid="sw-plane"] > span[data-layer="fill"]')).opacity));
  t.expect(layer > 0.99, 'checked track layer is opaque');

  // Rapid toggling: 5 quick clicks end consistent with parity and the thumb follows
  for (let i = 0; i < 5; i++) { await t.click('[data-testid="sw-plane"]'); await t.wait(40); }
  await t.wait(800);
  t.expectEqual(await checked('sw-plane'), 'false', 'five rapid clicks from on end off');
  p = await tf(thumbOf('sw-plane'));
  t.expect(Math.abs(p.x) < 0.5, `thumb back at 0 after rapid toggling (got ${p.x.toFixed(2)})`);

  // Keyboard: Space toggles, ring visible after Tab
  await t.eval(() => document.querySelector('[data-testid="sw-notif"]').focus());
  await t.press('Tab');
  const active = await t.eval(() => document.activeElement.getAttribute('data-testid'));
  t.expectEqual(active, 'sw-plane', 'Tab moves to the next switch');
  const outline = await t.eval(() => getComputedStyle(document.activeElement).outlineStyle);
  t.expect(outline === 'solid', `focus-visible ring (got ${outline})`);
  await t.press('Space');
  await t.wait(300);
  t.expectEqual(await checked('sw-plane'), 'true', 'Space toggles');

  // Label click toggles
  await t.click('text=Sincronizar con el banco');
  await t.wait(200);
  t.expectEqual(await checked('sw-sync'), 'false', 'clicking the label toggles the switch');

  // Disabled
  await t.click('[data-testid="sw-disabled-off"]');
  await t.wait(100);
  t.expectEqual(await checked('sw-disabled-off'), 'false', 'disabled stays off');
  t.expect((await t.attr('[data-testid="sw-disabled-off"]', 'data-disabled')) !== null, 'disabled flag present');

  // Description wired and bare switch has a name
  t.expect((await t.attr('[data-testid="sw-notif"]', 'aria-describedby')) !== null, 'description linked');
  t.expectEqual(await t.attr('[data-testid="sw-bare"]', 'aria-label'), 'Activar modo oscuro', 'bare switch named');
  t.expectEqual(await t.text('[data-testid="state"]'), '110', 'state after interactions');
  // F4 (WCAG 1.4.11): the off track has a 1.5 px ring in the outline token, 3:1 against the page, light and dark
  const probe = (prop, value) => t.eval((a) => { const d = document.createElement('i'); d.style[a.prop] = a.value; document.body.append(d); const c = getComputedStyle(d)[a.prop]; d.remove(); return c; }, { prop, value });
  const ringShadow = await t.eval(() => getComputedStyle(document.querySelector('[data-testid="sw-disabled-off"] > span[data-layer="ring"], [data-testid="sw-bare"] > span[data-layer="ring"]')).boxShadow);
  t.expect(/1\.5px/.test(ringShadow) && /inset/.test(ringShadow), `off track has an inset 1.5 px ring (${ringShadow})`);
  const lumOf = (rgb) => { const [r, g, b] = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [hi, lo] = [lumOf(a), lumOf(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  for (const scheme of ['light', 'dark']) {
    await t.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: t.reducedMotion ? 'reduce' : 'no-preference' }] });
    await t.wait(100);
    const outline = await probe('color', 'var(--color-outline)');
    const page = await t.eval(() => getComputedStyle(document.body).backgroundColor);
    t.expect(ratio(outline, page) >= 3, `${scheme}: off-track ring ${ratio(outline, page).toFixed(2)}:1 against the page (>= 3)`);
  }
  await t.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: t.reducedMotion ? 'reduce' : 'no-preference' }] });

  // F5: forced colors. System colors: CanvasText border, Highlight when on
  await t.emulate([{ name: 'forced-colors', value: 'active' }]);
  await t.wait(150);
  const fc = await t.eval(() => {
    const root = (id) => document.querySelector('[data-testid="' + id + '"]');
    const cs = (el) => getComputedStyle(el);
    const probe = (v) => { const d = document.createElement('i'); d.style.color = v; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; };
    return {
      forced: matchMedia('(forced-colors: active)').matches,
      border: cs(root('sw-plane')).borderTopColor, borderW: cs(root('sw-plane')).borderTopWidth,
      canvasText: probe('CanvasText'), highlight: probe('Highlight'),
      fillOn: cs(root('sw-plane').querySelector('[data-layer="fill"]')).backgroundColor,
      thumbOn: cs(root('sw-plane').querySelector('[data-state]')).backgroundColor, highlightText: probe('HighlightText'),
    };
  });
  t.expect(fc.forced, 'forced-colors emulation is active');
  t.expectEqual(fc.border, fc.canvasText, 'forced colors: track border is CanvasText');
  t.expect(parseFloat(fc.borderW) >= 1, `forced colors: track has a real border (${fc.borderW})`);
  t.expectEqual(fc.fillOn, fc.highlight, 'forced colors: the on track fills with Highlight');
  t.expectEqual(fc.thumbOn, fc.highlightText, 'forced colors: the on thumb is HighlightText');
  await t.screenshot(`switch-forced${t.reducedMotion ? '-reduced' : ''}`);
  await t.emulate([{ name: 'forced-colors', value: 'none' }]);

  // F22-style hit area on touch: 44 px tall target around the 28 px track
  await t.coarse(true);
  await t.wait(300);
  t.expect(await t.eval(() => matchMedia('(pointer: coarse)').matches), 'coarse pointer emulation is active');
  const hit = await t.eval(() => {
    const el = document.querySelector('[data-testid="sw-bare"]');
    el.scrollIntoView({ block: 'center' });
    const b = el.getBoundingClientRect();
    const y = b.top - 6; // 6 px above the track, inside the 8 px invisible pad
    const hitEl = document.elementFromPoint(b.left + b.width / 2, y);
    return { height: b.height, ok: hitEl === el, tag: hitEl && hitEl.tagName };
  });
  t.expect(hit.ok, `touch: a point 6 px above the track still hits the switch (hit ${hit.tag})`);
  await t.coarse(false);
  await t.wait(200);
  const hitDesktop = await t.eval(() => {
    const el = document.querySelector('[data-testid="sw-bare"]');
    el.scrollIntoView({ block: 'center' });
    const b = el.getBoundingClientRect();
    return document.elementFromPoint(b.left + b.width / 2, b.top - 6) === el;
  });
  t.expect(!hitDesktop, 'desktop: no extra hit area above the track');


  // ---- Author request: press the thumb and drag it left and right at will, like iOS. ----
  const mouse = (type, x, y, extra = {}) => t.cdp('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: type === 'mouseMoved' ? 0 : 1, ...extra });
  const grab = async (id) => {
    const r = await t.rect(`[data-testid="${id}"]`);
    await mouse('mouseMoved', r.cx, r.cy);
    await mouse('mousePressed', r.cx, r.cy, { buttons: 1 });
    return r;
  };
  const pull = async (r, dx, { steps = 6, gap = 24 } = {}) => {
    for (let i = 1; i <= steps; i++) {
      await mouse('mouseMoved', r.cx + (dx * i) / steps, r.cy, { buttons: 1 });
      await t.wait(gap);
    }
  };
  const drop = (r, dx) => mouse('mouseReleased', r.cx + dx, r.cy, { buttons: 0 });
  const xOf = async (id) => (await tf(thumbOf(id))).x;
  const changes = async () => parseInt(await t.text('[data-testid="drag-count"]'), 10);
  const D = 'sw-drag';

  t.expectEqual(await checked(D), 'false', 'drag switch starts off');
  // 1. The thumb follows the pointer while the button is held, both ways, any number of times.
  let g = await grab(D);
  await pull(g, 9);
  await t.wait(60);
  let xs = await xOf(D);
  t.expect(Math.abs(xs - 9) < 1.5, `holding: the thumb follows the pointer to the right (x ${xs.toFixed(1)}, pointer +9)`);
  t.expectEqual(await checked(D), 'false', 'nothing changes while the button is held');
  await mouse('mouseMoved', g.cx + 3, g.cy, { buttons: 1 });
  await t.wait(60);
  xs = await xOf(D);
  t.expect(Math.abs(xs - 3) < 1.5, `and back to the left without releasing (x ${xs.toFixed(1)}, pointer +3)`);
  await mouse('mouseMoved', g.cx + 17, g.cy, { buttons: 1 });
  await t.wait(60);
  xs = await xOf(D);
  t.expect(Math.abs(xs - 17) < 1.5, `and to the right again (x ${xs.toFixed(1)}, pointer +17)`);
  await mouse('mouseMoved', g.cx + 60, g.cy, { buttons: 1 });
  await t.wait(60);
  xs = await xOf(D);
  t.expect(Math.abs(xs - 20) < 0.5, `the thumb stops at the end of the track (x ${xs.toFixed(1)})`);
  await mouse('mouseMoved', g.cx - 60, g.cy, { buttons: 1 });
  await t.wait(60);
  xs = await xOf(D);
  t.expect(Math.abs(xs) < 0.5, `and at the start (x ${xs.toFixed(1)})`);
  // The track color follows the thumb while dragging (iOS), not only after the release.
  await mouse('mouseMoved', g.cx + 10, g.cy, { buttons: 1 });
  await t.wait(60);
  const fillMid = await t.eval(() => parseFloat(getComputedStyle(document.querySelector('[data-testid="sw-drag"] > span[data-layer="fill"]')).opacity));
  t.expect(Math.abs(fillMid - 0.5) < 0.12, `halfway, the track is halfway colored (opacity ${fillMid.toFixed(2)})`);
  // 2. Release past the middle: on, and the click that follows the drag does not toggle it back.
  await mouse('mouseMoved', g.cx + 15, g.cy, { buttons: 1 });
  await t.wait(200);
  const before = await changes();
  await drop(g, 15);
  await t.wait(60);
  if (t.reducedMotion) t.expect(Math.abs((await xOf(D)) - 20) < 0.5, 'reduced motion: the release snaps, no travel');
  await t.wait(800);
  t.expectEqual(await checked(D), 'true', 'released past the middle: on');
  t.expect(Math.abs((await xOf(D)) - 20) < 0.5, 'thumb rests at the end');
  t.expectEqual((await changes()) - before, 1, 'exactly one change (the click after the drag is swallowed)');
  // 3. Drag back to the left and release past the middle: off.
  g = await grab(D);
  await pull(g, -16);
  await t.wait(200);
  xs = await xOf(D);
  t.expect(Math.abs(xs - 4) < 1.5, `from on, dragging left moves the thumb (x ${xs.toFixed(1)})`);
  await drop(g, -16);
  await t.wait(800);
  t.expectEqual(await checked(D), 'false', 'released on the left half: off');
  t.expect(Math.abs(await xOf(D)) < 0.5, 'thumb rests at the start');
  // 4. A short, slow drag that stays under the middle returns to where it was.
  const c4 = await changes();
  g = await grab(D);
  await pull(g, 6);
  await t.wait(250);
  await drop(g, 6);
  await t.wait(800);
  t.expectEqual(await checked(D), 'false', 'a short slow drag does not toggle');
  t.expect(Math.abs(await xOf(D)) < 0.5, 'and the thumb is back at the start');
  t.expectEqual(await changes(), c4, 'no change reported');
  // 5. A short but fast flick throws it over by velocity.
  g = await grab(D);
  await pull(g, 7, { steps: 2, gap: 8 });
  await drop(g, 7);
  await t.wait(800);
  t.expectEqual(await checked(D), 'true', 'a fast flick of a few pixels toggles by velocity');
  // 6. A plain click without movement still toggles.
  g = await grab(D);
  await drop(g, 0);
  await t.wait(600);
  t.expectEqual(await checked(D), 'false', 'a plain click still toggles');
  // 7. A tiny wobble while clicking (under 3 px) is still a click.
  g = await grab(D);
  await mouse('mouseMoved', g.cx + 2, g.cy, { buttons: 1 });
  await drop(g, 2);
  await t.wait(600);
  t.expectEqual(await checked(D), 'true', 'a 2 px wobble during a click is still a click');
  // 8. Keyboard still works after dragging.
  await t.focus(`[data-testid="${D}"]`);
  await t.press('Space');
  await t.wait(500);
  t.expectEqual(await checked(D), 'false', 'Space still toggles');
  // 9. Disabled: dragging does nothing.
  const dsb = await t.rect('[data-testid="sw-disabled-off"]');
  await mouse('mouseMoved', dsb.cx, dsb.cy);
  await mouse('mousePressed', dsb.cx, dsb.cy, { buttons: 1 });
  await pull(dsb, 18);
  await drop(dsb, 18);
  await t.wait(300);
  t.expectEqual(await checked('sw-disabled-off'), 'false', 'a disabled switch cannot be dragged on');
  t.expect(Math.abs(await xOf('sw-disabled-off')) < 0.5, 'and its thumb did not move');
  // 10. Controlled switch: the drag goes through the parent's onCheckedChange.
  const s1 = await checked('sw-plane');
  const dir = s1 === 'true' ? -18 : 18;
  g = await grab('sw-plane');
  await pull(g, dir);
  await drop(g, dir);
  await t.wait(800);
  t.expect((await checked('sw-plane')) !== s1, 'a controlled switch changes through the drag too');
  t.expectEqual((await t.text('[data-testid="state"]'))[1], (await checked('sw-plane')) === 'true' ? '1' : '0', 'and the parent state followed');
  // 11. Right to left: the "on" side is the left one, and dragging left turns it on.
  const posRtl = () => t.eval(() => {
    const root = document.querySelector('[data-testid="sw-rtl"]');
    const thumb = root.querySelector('[data-state]');
    const a = root.getBoundingClientRect();
    const b = thumb.getBoundingClientRect();
    return { fromRight: a.right - b.right, fromLeft: b.left - a.left };
  });
  let rp = await posRtl();
  t.expectEqual(await checked('sw-rtl'), 'false', 'rtl switch starts off');
  t.expect(rp.fromRight < 4 && rp.fromLeft > 20, `rtl: the off thumb sits on the right (${JSON.stringify(rp)})`);
  g = await grab('sw-rtl');
  await pull(g, -9);
  await t.wait(80);
  rp = await posRtl();
  t.expect(Math.abs(rp.fromRight - 2 - 9) < 1.5, `rtl: dragging left moves the thumb left with the pointer (${rp.fromRight.toFixed(1)} from the right edge)`);
  await pull(g, -18, { steps: 4 });
  await drop(g, -18);
  await t.wait(800);
  rp = await posRtl();
  t.expectEqual(await checked('sw-rtl'), 'true', 'rtl: released at the left end: on');
  t.expect(rp.fromLeft < 4 && rp.fromRight > 20, `rtl: the on thumb sits on the left (${JSON.stringify(rp)})`);
  g = await grab('sw-rtl');
  await pull(g, 18);
  await drop(g, 18);
  await t.wait(800);
  t.expectEqual(await checked('sw-rtl'), 'false', 'rtl: dragging right turns it off');
  // 12. Touch: a finger drags it too (real touch events; pan-y keeps vertical scrolling).
  await t.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  t.expectEqual(await t.eval(() => getComputedStyle(document.querySelector('[data-testid="sw-drag"]')).touchAction), 'pan-y', 'touch-action is pan-y: horizontal drags reach the switch, vertical ones still scroll');
  const finger = async (id, dx) => {
    const r = await t.rect(`[data-testid="${id}"]`);
    const at = (x) => [{ x, y: r.cy, id: 1 }];
    await t.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(r.cx) });
    for (let i = 1; i <= 6; i++) { await t.cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(r.cx + (dx * i) / 6) }); await t.wait(24); }
    await t.wait(200);
    await t.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await finger(D, 16);
  await t.wait(800);
  t.expectEqual(await checked(D), 'true', 'touch: dragging with a finger turns it on');
  await finger(D, -16);
  await t.wait(800);
  t.expectEqual(await checked(D), 'false', 'touch: and off');
  await t.cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
  await t.wait(200);
  await t.screenshot(`switch-interact${t.reducedMotion ? '-reduced' : ''}`);
}
