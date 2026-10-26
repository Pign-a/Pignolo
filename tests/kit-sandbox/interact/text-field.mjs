// Text field (author decision 3): the label rests inside the box, centered; on focus or value it moves to
// the top left of the SAME box and the box grows (52 -> 60 px) while the reserved slot (60 px) does not,
// so nothing below moves. Also: animated focus ring, placeholder rule, error states, persistent live region.
export default async function (t) {
  const field = (id) => `[data-testid="${id}"]`;
  const box = (id) => t.eval((s) => {
    const i = document.querySelector(s);
    const b = i.closest('[data-field-box]');
    const r = b.getBoundingClientRect();
    const slot = b.parentElement.getBoundingClientRect();
    return { h: r.height, top: r.top, left: r.left, slotH: slot.height, slotTop: slot.top };
  }, field(id));
  const lab = (id) => t.eval((s) => {
    const i = document.querySelector(s);
    const l = document.querySelector(`label[for="${i.id}"]`);
    const m = new DOMMatrixReadOnly(getComputedStyle(l).transform);
    const b = i.closest('[data-field-box]').getBoundingClientRect();
    const r = l.getBoundingClientRect();
    return { y: m.f, s: m.a, text: l.textContent, relTop: r.top - b.top, relLeft: r.left - b.left, w: r.width, h: r.height, boxH: b.height };
  }, field(id));
  const ring = (id) => t.eval((s) => {
    const r = document.querySelector(s).closest('[data-field-box]').querySelector('span[aria-hidden]');
    const cs = getComputedStyle(r);
    return { o: parseFloat(cs.opacity), s: new DOMMatrixReadOnly(cs.transform).a, w: cs.borderTopWidth };
  }, field(id));
  const phColor = (id) => t.eval((s) => getComputedStyle(document.querySelector(s), '::placeholder').color, field(id));
  const msgTop = (id) => t.eval((s) => document.querySelector(s).closest('[data-field-box]').parentElement.nextElementSibling.getBoundingClientRect().top, field(id));
  const pageTop = (sel) => t.eval((s) => document.querySelector(s).getBoundingClientRect().top + window.scrollY, sel);
  const hidden = (c) => /rgba\(0, 0, 0, 0\)|transparent/.test(c);
  const lum = (rgb) => {
    const [r, g, b] = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

  // A real label, never a placeholder
  t.expectEqual(await t.eval((s) => document.querySelector(`label[for="${document.querySelector(s).id}"]`)?.tagName ?? null, field('tf-name')), 'LABEL', 'the label is a real <label for>');

  // Rest: label centered in a 52 px box at full size, no ring, placeholder hidden
  let b = await box('tf-name');
  let l = await lab('tf-name');
  t.expect(Math.abs(b.h - 52) < 0.6, `rest box is 52 px tall (got ${b.h})`);
  t.expect(Math.abs(l.s - 1) < 0.001 && Math.abs(l.relTop + l.h / 2 - b.h / 2) < 1.5, `label rests centered at full size (top ${l.relTop.toFixed(1)}, scale ${l.s})`);
  t.expect(Math.abs(b.slotH - 60) < 0.6, `slot is reserved at the grown height (got ${b.slotH})`);
  t.expect((await ring('tf-name')).o < 0.02, 'no focus ring at rest');
  t.expect(hidden(await phColor('tf-name')), `placeholder hidden while the label rests (${await phColor('tf-name')})`);
  const restMsgTop = await msgTop('tf-name');
  const restContrast = contrast(await t.eval((s) => getComputedStyle(document.querySelector(`label[for="${document.querySelector(s).id}"]`)).color, field('tf-name')), await t.eval((s) => getComputedStyle(document.querySelector(s).closest('[data-field-box]')).backgroundColor, field('tf-name')));
  t.expect(restContrast >= 4.5, `resting label contrast ${restContrast.toFixed(2)}:1 >= 4.5`);

  // Stack: what is below the field does not move when it focuses
  const belowBefore = await pageTop(field('tf-number'));
  const afterBefore = await pageTop(field('tf-after'));

  // Focus by click: mid-flight sample (label travelling, box growing), then settled
  await t.mouseDown(field('tf-name'));
  await t.mouseUp();
  await t.wait(60);
  l = await lab('tf-name');
  b = await box('tf-name');
  let r = await ring('tf-name');
  if (t.reducedMotion) {
    t.expect(Math.abs(r.s - 1) < 0.001, `reduced: ring only fades (scale ${r.s})`);
  } else {
    t.expect(l.y > 6.5 && l.y < 12.5, `label is mid-move 60 ms after focus (y ${l.y.toFixed(1)}, rest 13, up 6)`);
    t.expect(b.h > 52.4 && b.h < 59.6, `box is mid-growth 60 ms after focus (h ${b.h.toFixed(1)})`);
    t.expect((r.o > 0 && r.o < 0.99) || r.s < 0.999, `ring is blooming (opacity ${r.o.toFixed(2)}, scale ${r.s.toFixed(3)})`);
  }
  await t.wait(600);
  l = await lab('tf-name');
  b = await box('tf-name');
  r = await ring('tf-name');
  t.expect(Math.abs(l.y - 6) < 0.3 && Math.abs(l.s - 0.75) < 0.01, `label settles up (y ${l.y.toFixed(1)}, scale ${l.s.toFixed(3)})`);
  t.expect(l.relLeft >= 14 && l.relLeft <= 18 && l.relTop >= 4 && l.relTop <= 10, `label sits at the top left of the same box (left ${l.relLeft.toFixed(1)}, top ${l.relTop.toFixed(1)})`);
  t.expect(Math.abs(b.h - 60) < 0.6, `box settles at 60 px (got ${b.h})`);
  t.expect(Math.abs(b.slotH - 60) < 0.6, 'slot height never changed');
  t.expect(r.o > 0.99 && Math.abs(r.s - 1) < 0.001, 'ring fully on');
  t.expectEqual(r.w, '2px', 'ring uses --focus-width');
  t.expect(!hidden(await phColor('tf-name')), 'placeholder visible once the label has moved up');
  t.expect(Math.abs((await msgTop('tf-name')) - restMsgTop) < 0.5, 'helper text did not move when the field grew');
  t.expect(Math.abs((await pageTop(field('tf-number'))) - belowBefore) < 0.5, 'the field below did not move');
  t.expect(Math.abs((await pageTop(field('tf-after'))) - afterBefore) < 0.5, 'the button below did not move');
  const upLabel = await t.eval((s) => getComputedStyle(document.querySelector(`label[for="${document.querySelector(s).id}"]`)).color, field('tf-name'));
  const boxBg = await t.eval((s) => getComputedStyle(document.querySelector(s).closest('[data-field-box]')).backgroundColor, field('tf-name'));
  t.expect(contrast(upLabel, boxBg) >= 4.5, `focused label contrast ${contrast(upLabel, boxBg).toFixed(2)}:1 >= 4.5`);

  // Stack focus: focus the street field, the number field and the button stay put
  await t.mouseDown(field('tf-street'));
  await t.mouseUp();
  await t.wait(600);
  t.expect(Math.abs((await pageTop(field('tf-number'))) - belowBefore) < 0.5, 'focusing the street field does not move the number field');
  t.expect(Math.abs((await pageTop(field('tf-after'))) - afterBefore) < 0.5, 'focusing the street field does not move the button');
  await t.eval(() => document.activeElement.blur());
  await t.wait(400);

  // Type, blur: label stays up and the box stays grown; clear, blur: both return
  await t.mouseDown(field('tf-name'));
  await t.mouseUp();
  await t.type('Ana');
  await t.eval(() => document.activeElement.blur());
  await t.wait(600);
  l = await lab('tf-name');
  b = await box('tf-name');
  t.expect(Math.abs(l.y - 6) < 0.3 && Math.abs(b.h - 60) < 0.6, 'filled field keeps the label up and the box grown after blur');
  t.expect((await ring('tf-name')).o < 0.02, 'ring leaves on blur');
  await t.mouseDown(field('tf-name'));
  await t.mouseUp();
  for (let k = 0; k < 3; k++) await t.press('Backspace');
  await t.eval(() => document.activeElement.blur());
  await t.wait(600);
  l = await lab('tf-name');
  b = await box('tf-name');
  t.expect(Math.abs(l.y - 13) < 0.3 && Math.abs(l.s - 1) < 0.01 && Math.abs(b.h - 52) < 0.6, `emptied field drops the label and shrinks back (y ${l.y.toFixed(1)}, h ${b.h.toFixed(1)})`);

  // Interrupted: focus then blur at once ends at rest
  await t.mouseDown(field('tf-city'));
  await t.mouseUp();
  await t.wait(50);
  await t.eval(() => document.activeElement.blur());
  await t.wait(700);
  l = await lab('tf-city');
  b = await box('tf-city');
  t.expect(Math.abs(l.y - 13) < 0.3 && Math.abs(b.h - 52) < 0.6, 'focus then quick blur ends at rest');

  // Prefilled starts up
  l = await lab('tf-filled');
  b = await box('tf-filled');
  t.expect(Math.abs(l.y - 6) < 0.3 && Math.abs(b.h - 60) < 0.6, 'defaultValue starts with the label up and the box grown');

  // Persistent live region: present and polite even for a field with no message
  const live = await t.eval((s) => { const el = document.querySelector(s).closest('[data-field-box]').parentElement.nextElementSibling; return { live: el.getAttribute('aria-live'), text: el.textContent.trim() }; }, field('tf-disabled'));
  t.expectEqual(live, { live: 'polite', text: '' }, 'the polite live region is always in the DOM, empty when there is no message');

  // Validation: invalid email on blur shows the error without shifting layout
  const h0 = await t.eval((s) => document.querySelector(s).closest('[data-field-box]').parentElement.parentElement.getBoundingClientRect().height, field('tf-email'));
  await t.mouseDown(field('tf-email'));
  await t.mouseUp();
  await t.type('abc');
  await t.eval(() => document.activeElement.blur());
  await t.wait(500);
  t.expectEqual(await t.attr(field('tf-email'), 'aria-invalid'), 'true', 'aria-invalid on error');
  const msgId = await t.attr(field('tf-email'), 'aria-describedby');
  const msg = await t.eval((id) => document.getElementById(id).textContent, msgId);
  t.expect(msg.includes('correo válido'), `aria-describedby points at the error (${msg})`);
  const h1 = await t.eval((s) => document.querySelector(s).closest('[data-field-box]').parentElement.parentElement.getBoundingClientRect().height, field('tf-email'));
  t.expect(Math.abs(h1 - h0) < 1, `error does not shift the layout (${h0} -> ${h1})`);
  const boxBorder = await t.eval((s) => getComputedStyle(document.querySelector(s).closest('[data-field-box]')).borderTopColor, field('tf-email'));
  const errColor = await t.eval(() => { const d = document.createElement('i'); d.style.color = 'var(--color-error)'; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; });
  t.expectEqual(boxBorder, errColor, 'border uses the error token');
  const lc = await t.eval((s) => { const i = document.querySelector(s); return getComputedStyle(document.querySelector(`label[for="${i.id}"]`)).color; }, field('tf-email'));
  t.expectEqual(lc, errColor, 'label turns error color');
  const mark = await t.eval((id) => !!document.getElementById(id).querySelector('svg'), msgId);
  t.expect(mark, 'error has a mark, color is not the only signal');
  // Fix it: error clears, helper returns
  await t.mouseDown(field('tf-email'));
  await t.mouseUp();
  await t.press('End');
  await t.eval(() => { const i = document.querySelector('[data-testid="tf-email"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'abc@x.co'); i.dispatchEvent(new Event('input', { bubbles: true })); });
  await t.wait(500);
  t.expectEqual(await t.attr(field('tf-email'), 'aria-invalid'), null, 'valid again');
  const helper = await t.eval((id) => document.getElementById(id).textContent, await t.attr(field('tf-email'), 'aria-describedby'));
  t.expect(helper.includes('comprobante'), `helper text returns (${helper})`);

  // Static error field, readOnly, disabled
  t.expectEqual(await t.attr(field('tf-error'), 'aria-invalid'), 'true', 'static error is invalid');
  t.expect((await ring('tf-error')).o < 0.02, 'static error shows no focus ring when unfocused');
  t.expectEqual(await t.attr(field('tf-readonly'), 'readonly'), '', 'readonly attribute');
  await t.mouseDown(field('tf-readonly'));
  await t.mouseUp();
  await t.type('zz');
  t.expectEqual(await t.eval((s) => document.querySelector(s).value, field('tf-readonly')), 'CL-20931', 'read-only value unchanged');
  await t.eval(() => document.activeElement.blur());
  t.expectEqual(await t.attr(field('tf-disabled'), 'disabled'), '', 'disabled attribute');
  await t.mouseDown(field('tf-disabled'));
  await t.mouseUp();
  t.expect((await t.eval(() => document.activeElement.getAttribute('data-testid'))) !== 'tf-disabled', 'disabled field takes no focus');

  // Trailing control switches the password type; keyboard Tab order and ring
  t.expectEqual(await t.attr(field('tf-pass'), 'type'), 'password', 'password hidden');
  await t.click(field('tf-toggle'));
  await t.wait(100);
  t.expectEqual(await t.attr(field('tf-pass'), 'type'), 'text', 'trailing button reveals the password');
  await t.eval(() => document.querySelector('[data-testid="tf-name"]').focus());
  await t.press('Tab');
  t.expectEqual(await t.eval(() => document.activeElement.getAttribute('data-testid')), 'tf-email', 'Tab moves to the next field');
  await t.wait(500);
  t.expect((await ring('tf-email')).o > 0.99, 'ring shows on keyboard focus');

  // Author report: on click the field grows but the focus border stayed smaller for a moment. The ring is a child of the
  // growing box and must follow it frame by frame: sample both boxes on every animation frame, growing and shrinking.
  await t.eval(() => document.activeElement?.blur());
  await t.wait(600);
  const sampleRing = (id, action) =>
    t.eval(
      ([sel, act]) =>
        new Promise((resolve) => {
          const input = document.querySelector(sel);
          const boxEl = input.closest('[data-field-box]');
          const ringEl = boxEl.querySelector('span[aria-hidden]');
          const frames = [];
          const t0 = performance.now();
          let acted = false;
          const tick = () => {
            const now = performance.now() - t0;
            if (!acted && now > 80) { acted = true; if (act === 'focus') input.focus(); else input.blur(); }
            const b = boxEl.getBoundingClientRect();
            const r = ringEl.getBoundingClientRect();
            frames.push({ t: now, bh: b.height, bw: b.width, rh: r.height, rw: r.width, dt: r.top - b.top, db: r.bottom - b.bottom, dl: r.left - b.left, dr: r.right - b.right, op: parseFloat(getComputedStyle(ringEl).opacity) });
            if (now < 900) requestAnimationFrame(tick);
            else resolve(frames);
          };
          tick();
        }),
      [field(id), action],
    );
  const worst = (frames) => {
    let d = 0;
    for (const f of frames) d = Math.max(d, Math.abs(f.dt), Math.abs(f.db), Math.abs(f.dl), Math.abs(f.dr), Math.abs(f.rh - f.bh), Math.abs(f.rw - f.bw));
    return d;
  };
  for (const id of ['tf-name', 'tf-error', 'tf-pass']) {
    const grow = await sampleRing(id, 'focus');
    const hs = grow.map((f) => f.bh);
    const growing = hs.some((h) => h > Math.min(...hs) + 3 && h < Math.max(...hs) - 3);
    if (!t.reducedMotion) t.expect(growing, `${id}: the sample caught the box mid-growth (heights ${Math.min(...hs).toFixed(1)} to ${Math.max(...hs).toFixed(1)})`);
    const lit = grow.filter((f) => f.op > 0.05);
    t.expect(lit.length >= 3, `${id}: the ring was visible in ${lit.length} sampled frames`);
    t.expect(worst(lit) < 1, `${id}: the ring box matches the field box in all ${lit.length} visible frames while growing (worst difference ${worst(lit).toFixed(2)} px)`);
    t.expect(worst(grow) < 1, `${id}: and also when it is faint (worst ${worst(grow).toFixed(2)} px)`);
    const shrink = await sampleRing(id, 'blur');
    t.expect(worst(shrink) < 1, `${id}: the ring follows the box while it shrinks back (worst ${worst(shrink).toFixed(2)} px)`);
  }
  await t.screenshot(`text-field-interact${t.reducedMotion ? '-reduced' : ''}`);
}
