// Modal: enter/exit motion, focus trap and return, Esc, outside click, confirm variants, loading, locked dismissal.
export default async function (t) {
  const dlg = '[role="dialog"]';
  const log = () => t.text('[data-testid="log"]');
  const panel = () =>
    t.eval(() => {
      const d = document.querySelector('[role="dialog"]');
      if (!d) return null;
      const cs = getComputedStyle(d);
      const m = new DOMMatrixReadOnly(cs.transform === 'none' ? undefined : cs.transform);
      return { opacity: parseFloat(cs.opacity), scale: m.a, ty: m.m42 };
    });
  const activeInDialog = () => t.eval(() => !!document.activeElement?.closest('[role="dialog"]'));
  const activeText = () => t.eval(() => document.activeElement?.textContent?.trim() ?? '');
  const goneAfterKey = async (key) => {
    await t.press(key);
    return t.eval(
      () =>
        new Promise((resolve) => {
          const t0 = performance.now();
          const tick = () => (document.querySelector('[role="dialog"]') ? requestAnimationFrame(tick) : resolve(performance.now() - t0));
          tick();
        }),
    );
  };
  // Clicks the backdrop for real: shrinks it to a corner first so the click does not land on the panel.
  const clickBackdrop = async () => {
    await t.eval(() => {
      const o = [...document.querySelectorAll('div[data-state="open"]')].find((e) => e.getAttribute('role') !== 'dialog' && getComputedStyle(e).position === 'fixed');
      o.setAttribute('data-test-overlay', '');
      Object.assign(o.style, { right: 'auto', bottom: 'auto', width: '60px', height: '60px' });
    });
    await t.click('[data-test-overlay]');
  };

  // Open with motion visible mid flight.
  await t.click('[data-testid="open-form"]');
  await t.wait(50);
  const early = await panel();
  t.expect(early !== null, 'dialog mounted 50 ms after click');
  if (t.reducedMotion) {
    t.expect(Math.abs(early.scale - 1) < 0.001 && Math.abs(early.ty) < 0.5, `reduced motion: no scale or travel (scale ${early.scale.toFixed(3)}, y ${early.ty.toFixed(1)})`);
  } else {
    t.expect(early.opacity < 1 && early.scale < 1 && early.scale >= 0.92, `entry in flight, scale in [0.92, 1) (opacity ${early.opacity.toFixed(2)}, scale ${early.scale.toFixed(3)})`);
    t.expect(early.ty > 0 && early.ty <= 8.5, `panel rises from below (y ${early.ty.toFixed(1)})`);
  }
  await t.wait(600);
  const rest = await panel();
  t.expect(rest.opacity === 1 && Math.abs(rest.scale - 1) < 0.001 && Math.abs(rest.ty) < 0.1, 'panel settles at rest');
  const backdropOpacity = await t.eval(() => {
    const o = [...document.querySelectorAll('div[data-state="open"]')].find((e) => e.getAttribute('role') !== 'dialog' && getComputedStyle(e).position === 'fixed');
    return parseFloat(getComputedStyle(o).opacity);
  });
  t.expect(backdropOpacity === 1, 'backdrop fully visible');

  // Semantics and initial focus.
  t.expectEqual(await t.attr('#root', 'aria-hidden'), 'true', 'the page behind is hidden from assistive tech');
  const labelled = await t.eval(() => {
    const d = document.querySelector('[role="dialog"]');
    const id = d.getAttribute('aria-labelledby');
    return document.getElementById(id)?.textContent;
  });
  t.expectEqual(labelled, 'Nuevo proyecto', 'aria-labelledby points at the title');
  t.expect(await activeInDialog(), 'focus moved inside the dialog');
  t.expectEqual(await t.eval(() => document.activeElement.getAttribute('data-testid')), 'form-name', 'first input gets focus');

  // Author report: the short form clipped its text field at the bottom. Nothing inside the content box may stick out of it,
  // focus rings included, with the kit TextField (52 to 60 px) and with a plain control that draws an outline.
  const contained = (label) =>
    t.eval(() => {
      const d = document.querySelector('[role="dialog"]');
      const wrap = d.querySelector('[class*="overflow-y-auto"]');
      const w = wrap.getBoundingClientRect();
      const out = [];
      for (const el of wrap.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.top < w.top - 0.5 || r.bottom > w.bottom + 0.5 || r.left < w.left - 0.5 || r.right > w.right + 0.5) out.push(el.tagName + '.' + (el.getAttribute('data-field-box') !== null ? 'field-box' : el.className.toString().slice(0, 30)) + ' ' + JSON.stringify({ top: r.top - w.top, bottom: r.bottom - w.bottom }));
      }
      const a = document.activeElement;
      const cs = getComputedStyle(a);
      let ring = null;
      if (cs.outlineStyle !== 'none') {
        const grow = parseFloat(cs.outlineWidth) + parseFloat(cs.outlineOffset);
        const r = a.getBoundingClientRect();
        ring = { top: r.top - grow - w.top, bottom: r.bottom + grow - w.bottom };
        if (ring.top < -0.5 || ring.bottom > 0.5) out.push('focus ring of ' + a.tagName + ' sticks out ' + JSON.stringify(ring));
      }
      return { out, scrolls: wrap.scrollHeight > wrap.clientHeight + 0.5, ring, fields: wrap.querySelectorAll('[data-field-box]').length };
    });
  const c1 = await contained('text field');
  t.expectEqual(c1.out, [], 'every element of the form (and its rings) is inside the content box');
  t.expect(!c1.scrolls, 'a short form does not need to scroll');
  t.expect(c1.fields >= 1, 'the form uses the kit TextField');
  await t.eval(() => {
    const wrap = document.querySelector('[role="dialog"] [class*="overflow-y-auto"]');
    const input = document.createElement('input');
    input.className = 'kit-focus';
    input.setAttribute('data-test-plain', '');
    input.style.cssText = 'display:block;width:100%;min-height:40px;box-sizing:border-box;margin-top:8px;border:1px solid currentColor;border-radius:12px';
    wrap.lastElementChild.appendChild(input);
  });
  await t.focus('[data-test-plain]');
  await t.wait(50);
  const c2 = await contained('plain control');
  t.expectEqual(c2.out, [], 'a plain control with an outline ring at the very end of the content is not clipped either');
  t.expect(c2.ring !== null, 'the plain control draws an outline ring');
  await t.eval(() => document.querySelector('[data-test-plain]').remove());
  await t.focus('[data-testid="form-name"]');

  // Focus trap: tabbing never leaves.
  for (let i = 0; i < 7; i++) {
    await t.press('Tab');
    await t.wait(20);
    t.expect(await activeInDialog(), `Tab ${i + 1} stays inside the dialog`);
  }
  const outline = await t.eval(() => getComputedStyle(document.activeElement).outlineStyle);
  t.expect(outline === 'solid', 'focus-visible ring on the focused control');

  // Typing works; Esc closes, exit is fast, focus returns to the opener.
  await t.focus('[data-testid="form-name"]');
  await t.type('Casa');
  const closeMs = await goneAfterKey('Escape');
  t.expect(closeMs < 450, `exit finishes quickly (${Math.round(closeMs)} ms)`);
  // A large overlay leaves in 150 to 180 ms (design critic F19); under reduced motion the fade is 100 ms.
  if (!t.reducedMotion) t.expect(closeMs >= 140 && closeMs <= 260, `the modal exit is 150 to 180 ms, not the 100 ms of a control (${Math.round(closeMs)} ms)`);
  await t.wait(100);
  t.expectEqual(await t.eval(() => document.activeElement?.getAttribute('data-testid')), 'open-form', 'focus returns to the opener');
  t.expect(await t.eval(() => getComputedStyle(document.body).pointerEvents !== 'none'), 'page is interactive again');
  t.expectEqual(await t.eval(() => document.querySelectorAll('[data-state="open"][role="dialog"]').length), 0, 'no dialog left mounted');

  // Reopen: typed value kept by the app; save writes the log.
  await t.click('[data-testid="open-form"]');
  await t.waitFor(dlg);
  await t.wait(500);
  await t.click('[data-testid="form-save"]');
  await t.wait(500);
  t.expectEqual(await log(), 'proyecto Casa', 'primary button acts and closes');

  // Close with the X, and with a click on the backdrop; clicks inside do not close.
  await t.click('[data-testid="open-form"]');
  await t.wait(500);
  await t.click('[role="dialog"] h2');
  await t.wait(200);
  t.expect(await t.exists(dlg), 'clicking inside does not close');
  await t.click('[aria-label="Cerrar"]');
  await t.wait(500);
  t.expect(!(await t.exists(dlg)), 'the X closes');
  await t.click('[data-testid="open-form"]');
  await t.wait(500);
  await clickBackdrop();
  await t.wait(500);
  t.expect(!(await t.exists(dlg)), 'clicking the backdrop closes');

  // Open and close before the entry finishes: ends clean.
  await t.click('[data-testid="open-form"]');
  await t.wait(40);
  await t.press('Escape');
  await t.wait(600);
  t.expect(!(await t.exists(dlg)), 'closing mid entry leaves nothing mounted');
  t.expect(await t.eval(() => getComputedStyle(document.body).pointerEvents !== 'none'), 'page interactive after mid entry close');
  t.expectEqual(await t.eval(() => document.activeElement?.getAttribute('data-testid')), 'open-form', 'focus returned after mid entry close');

  // Simple confirm: initial focus on the confirm button, Enter confirms.
  await t.click('[data-testid="open-confirm"]');
  await t.wait(600);
  t.expectEqual(await activeText(), 'Archivar informe', 'non destructive confirm focuses the confirm button');
  await t.press('Enter');
  await t.wait(500);
  t.expectEqual(await log(), 'archivado', 'Enter confirms');

  // Destructive: focus starts on Cancel, the danger button is red, Enter on Cancel keeps the data.
  await t.click('[data-testid="open-destroy"]');
  await t.wait(600);
  t.expectEqual(await activeText(), 'Conservar proyecto', 'destructive confirm focuses Cancel');
  const danger = await t.eval(() => {
    const b = [...document.querySelectorAll('[role="dialog"] button')].find((x) => x.textContent === 'Eliminar proyecto');
    const probe = document.createElement('i');
    probe.style.color = 'var(--color-error)';
    document.body.append(probe);
    const want = getComputedStyle(probe).color;
    probe.remove();
    return { bg: getComputedStyle(b).backgroundColor, want };
  });
  t.expectEqual(danger.bg, danger.want, 'destructive action uses the error token');
  await t.press('Enter');
  await t.wait(500);
  t.expect(!(await t.exists(dlg)), 'Cancel closes');
  t.expectEqual(await log(), 'archivado', 'nothing deleted after Cancel');
  await t.click('[data-testid="open-destroy"]');
  await t.wait(600);
  await t.click('[role="dialog"] .justify-end button:nth-of-type(2)');
  await t.wait(500);
  t.expectEqual(await log(), 'eliminado', 'destructive confirm acts');

  // Loading: the dialog stays open, the button is aria-disabled with a spinner, then it resolves.
  await t.click('[data-testid="open-slow"]');
  await t.wait(600);
  await t.click('[role="dialog"] .justify-end button:nth-of-type(2)');
  await t.wait(150);
  const loadingState = await t.eval(() => {
    const b = document.querySelector('[role="dialog"] .justify-end button:nth-of-type(2)');
    return { aria: b.getAttribute('aria-disabled'), spinner: !!b.querySelector('svg'), label: b.textContent };
  });
  t.expectEqual(loadingState, { aria: 'true', spinner: true, label: 'Guardar cambios' }, 'loading: aria-disabled, spinner, label stays');
  t.expect(await t.eval(() => (document.querySelector('[role="dialog"] .justify-end button:nth-of-type(2) svg').getAttribute('class') ?? '').includes('motion-reduce:animate-pulse')), 'the spinner pulses instead of spinning under reduced motion');
  t.expect(await t.exists(dlg), 'modal stays open while loading');
  await t.wait(1500);
  t.expect(!(await t.exists(dlg)), 'closes when the work finishes');
  t.expectEqual(await log(), 'guardado', 'loading flow completed');

  // Locked: Esc and backdrop do nothing, error message is announced, the X closes.
  await t.click('[data-testid="open-locked"]');
  await t.wait(600);
  await t.press('Escape');
  await t.wait(400);
  t.expect(await t.exists(dlg), 'Esc is ignored while preventDismiss');
  await clickBackdrop();
  await t.wait(400);
  t.expect(await t.exists(dlg), 'backdrop click is ignored while preventDismiss');
  t.expectEqual(await t.attr('[role="alert"]', 'role'), 'alert', 'error message has role alert');
  await t.screenshot(`modal-locked-${t.reducedMotion ? 'reduced' : 'motion'}`);
  await t.click('[aria-label="Cerrar"]');
  await t.wait(500);
  t.expect(!(await t.exists(dlg)), 'the X still closes a locked modal');

  // ResponsiveDialog: a centered modal on a wide screen, the bottom sheet below 640 px.
  await t.click('[data-testid="open-responsive"]');
  await t.waitFor(dlg);
  await t.wait(600);
  t.expectEqual(await t.eval(() => !!document.querySelector('[role="dialog"] [data-handle]')), false, 'wide screen: a centered modal, not a sheet');
  t.expect(Math.abs((await t.eval(() => { const r = document.querySelector('[role="dialog"]').getBoundingClientRect(); return r.left + r.width / 2; })) - 640) < 12, 'wide screen: the panel is centered');
  await t.press('Escape');
  await t.wait(500);
  await t.raw.setViewport({ width: 390, height: 844 });
  await t.wait(400);
  await t.click('[data-testid="open-responsive"]');
  await t.waitFor(dlg);
  await t.wait(800);
  t.expectEqual(await t.eval(() => !!document.querySelector('[role="dialog"] [data-handle]')), true, 'below 640 px: the same dialog is a bottom sheet');
  const order = await t.eval(() => {
    const bs = [...document.querySelectorAll('[role="dialog"] button')].filter((b) => ['Cancelar', 'Compartir'].includes(b.textContent));
    return bs.map((b) => ({ text: b.textContent, top: Math.round(b.getBoundingClientRect().top), w: Math.round(b.getBoundingClientRect().width) }));
  });
  t.expect(order.length === 2 && order.find((b) => b.text === 'Compartir').top < order.find((b) => b.text === 'Cancelar').top, 'in the sheet the primary button comes first (above Cancel)');
  t.expect(order.every((b) => b.w > 250), `in the sheet the buttons are full width (${order.map((b) => b.w).join(', ')})`);
  await t.screenshot(`modal-responsive-sheet-${t.reducedMotion ? 'reduced' : 'motion'}`);
  await t.click('[data-testid="responsive-share"]');
  await t.wait(700);
  t.expectEqual(await log(), 'compartido', 'the sheet footer acts');
  t.expect(!(await t.exists(dlg)), 'and closes the sheet');
  t.expectEqual(await t.eval(() => document.activeElement?.getAttribute('data-testid')), 'open-responsive', 'focus returns to the opener');
  await t.click('[data-testid="open-responsive-locked"]');
  await t.waitFor(dlg);
  await t.wait(800);
  await t.press('Escape');
  await t.wait(500);
  t.expect(await t.exists(dlg), 'Esc is ignored in the sheet while preventDismiss');
  await t.click('[aria-label="Cerrar"]');
  await t.wait(800);
  t.expect(!(await t.exists(dlg)), 'the X still closes it');
  await t.raw.setViewport({ width: 1280, height: 800 });
  await t.wait(400);

  // Visual capture of the destructive confirm.
  await t.click('[data-testid="open-destroy"]');
  await t.wait(600);
  await t.screenshot(`modal-destructive-${t.reducedMotion ? 'reduced' : 'motion'}`);
  await t.press('Escape');
  await t.wait(500);
}
