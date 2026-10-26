// Trigger safety: kit components with press feedback used as asChild trigger of Radix DropdownMenu and Popover.
// Real Enter, Space and mouse presses must open once and leave it open (no double toggle from a synthetic pointerdown).
export default async function (t) {
  const kinds = [
    { id: 'btn', menu: 'btn-menu', pop: 'btn-pop' },
    { id: 'card', menu: 'card-menu', pop: 'card-pop' },
    { id: 'stat', menu: 'stat-menu', pop: 'stat-pop' },
  ];
  const open = (sel) => t.exists(sel);

  for (const k of kinds) {
    for (const [kind, trigger, content] of [['menu', k.menu, `[data-testid="content-${k.id}-menu"]`], ['popover', k.pop, `[data-testid="content-${k.id}-pop"]`]]) {
      const sel = `[data-testid="${trigger}"]`;
      t.expect(await t.exists(sel), `${trigger} renders and receives the trigger props (data-testid forwarded)`);
      t.expectEqual(await t.attr(sel, 'aria-haspopup') !== null || (await t.attr(sel, 'aria-expanded')) !== null, true, `${trigger} carries Radix aria attributes`);

      for (const key of ['Enter', 'Space']) {
        await t.eval((s) => document.querySelector(s).focus(), sel);
        await t.press(key);
        await t.wait(450);
        t.expect(await open(content), `${kind} stays open after one ${key} on ${k.id}`);
        t.expectEqual(await t.attr(sel, 'aria-expanded'), 'true', `${trigger} aria-expanded true after ${key}`);
        await t.press('Escape');
        await t.wait(350);
        t.expect(!(await open(content)), `${kind} closes with Escape (${k.id}, after ${key})`);
      }

      // A second Enter right after: opens again (not stuck)
      await t.eval((s) => document.querySelector(s).focus(), sel);
      await t.press('Enter');
      await t.wait(450);
      t.expect(await open(content), `${kind} opens again on ${k.id}`);
      await t.press('Escape');
      await t.wait(350);

      // Mouse click: opens once
      await t.click(sel);
      await t.wait(450);
      t.expect(await open(content), `${kind} stays open after one click on ${k.id}`);
      await t.press('Escape');
      await t.wait(350);
      t.expect(!(await open(content)), `${kind} closed again (${k.id}, after click)`);
    }
  }

  // Menus and popovers never lock the page: scroll passes through, the popup follows its trigger, then hides with it.
  const wheel = (x, y, deltaY) => t.cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY });
  for (const k of kinds) {
    for (const [kind, trigger, content] of [['menu', k.menu, `[data-testid="content-${k.id}-menu"]`], ['popover', k.pop, `[data-testid="content-${k.id}-pop"]`]]) {
      const sel = `[data-testid="${trigger}"]`;
      await t.eval(() => window.scrollTo(0, 0));
      await t.click(sel);
      await t.wait(450);
      t.expect(await open(content), `${kind} opens on ${k.id}`);
      const lock = await t.eval(() => ({ pe: getComputedStyle(document.body).pointerEvents, ov: getComputedStyle(document.body).overflow, locked: document.body.hasAttribute('data-scroll-locked'), hidden: document.querySelectorAll('[data-aria-hidden]').length }));
      t.expect(lock.pe !== 'none' && lock.ov !== 'hidden' && !lock.locked && lock.hidden === 0, `${kind} on ${k.id} does not lock the page (${JSON.stringify(lock)})`);
      const gap = () => t.eval((a, b) => { const tr = document.querySelector(a).getBoundingClientRect(); const c = document.querySelector(b); return c ? c.getBoundingClientRect().top - tr.bottom : null; }, [sel, content]).catch(() => null);
      const gapOf = () => t.eval(`(() => { const tr = document.querySelector('${sel}').getBoundingClientRect(); const c = document.querySelector('${content}'); return c ? c.getBoundingClientRect().top - tr.bottom : null; })()`);
      void gap;
      const g0 = await gapOf();
      const y0 = await t.eval(() => window.scrollY);
      await wheel(8, 500, 120);
      await t.wait(500);
      const y1 = await t.eval(() => window.scrollY);
      t.expect(y1 > y0 + 20, `wheel over the page scrolls it while the ${kind} is open on ${k.id} (${y0} to ${y1})`);
      t.expect(await open(content) && Math.abs((await gapOf()) - g0) < 1.5, `the ${kind} stays attached to its trigger while the page scrolls (${g0} then ${await gapOf()})`);
      await wheel(8, 500, 1500);
      await t.wait(500);
      const hiddenNow = await t.eval(`(() => { const c = document.querySelector('${content}'); const w = c && c.closest('[data-radix-popper-content-wrapper]'); return !c || getComputedStyle(w || c).visibility === 'hidden'; })()`);
      t.expect(hiddenNow, `the ${kind} hides when its trigger leaves the screen (${k.id})`);
      await t.eval(() => window.scrollTo(0, 0));
      await t.wait(300);
      await t.press('Escape');
      await t.wait(350);
      t.expect(!(await open(content)), `Esc still closes the ${kind} after a page scroll (${k.id})`);
      t.expect(await t.eval(`document.activeElement === document.querySelector('${sel}')`), `focus returns to the trigger after Esc (${kind}, ${k.id})`);
      // Outside click closes.
      await t.click(sel);
      await t.wait(450);
      await t.click('h1');
      await t.wait(350);
      t.expect(!(await open(content)), `an outside click closes the ${kind} (${k.id})`);
    }
  }
  // Menu type-ahead and Tab.
  await t.eval(() => window.scrollTo(0, 0));
  await t.focus('[data-testid="btn-menu"]');
  await t.press('Enter');
  await t.wait(450);
  await t.press('d');
  await t.wait(100);
  t.expectEqual(await t.eval(() => document.activeElement?.textContent), 'Duplicar', 'type-ahead moves to Duplicar in the menu');
  await t.press('Escape');
  await t.wait(350);
  await t.screenshot(`trigger-safety${t.reducedMotion ? '-reduced' : ''}`);
}
