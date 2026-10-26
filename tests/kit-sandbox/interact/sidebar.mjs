// Sidebar: width spring 0.16 s, labels fade, indicator slides with layoutId, keyboard, spam, reduced motion.
export default async function (t) {
  const nav = '[data-testid="sidebar-demo"] nav';
  const toggle = `${nav} > div:first-child button`;
  const width = () => t.eval(() => document.querySelector('[data-testid="sidebar-demo"] nav').getBoundingClientRect().width);
  const indicator = () =>
    t.eval(() => {
      const i = document.querySelector('[data-sidebar-indicator]');
      const b = i.getBoundingClientRect();
      return { top: b.top, left: b.left, width: b.width, count: document.querySelectorAll('[data-sidebar-indicator]').length };
    });
  const itemTop = (n) =>
    t.eval((k) => {
      const li = document.querySelectorAll('[data-testid="sidebar-demo"] nav li')[k];
      return li.firstElementChild.getBoundingClientRect().top;
    }, n);
  const current = () => t.text('[data-testid="current"]');
  const itemSel = (n) => `${nav} li:nth-of-type(${n}) >*:first-child`;

  // The persisted state of a previous run (same origin) must not leak in.
  await t.eval(() => localStorage.removeItem('kit-sidebar-demo'));
  if (Math.round(await width()) === 56) { await t.click(toggle); await t.wait(600); }
  await t.eval(() => localStorage.removeItem('kit-sidebar-demo'));

  // Landmark and initial state.
  t.expectEqual(await t.attr(nav, 'aria-label'), 'Principal', 'nav landmark is named');
  t.expectEqual(await t.attr(toggle, 'aria-expanded'), 'true', 'toggle starts expanded');
  // F10: the label never changes with the state; aria-controls points at the region that collapses, not at the nav itself.
  t.expectEqual((await t.text(toggle)).trim(), 'Barra lateral', 'the toggle label is fixed');
  const ctl = await t.eval(() => {
    const b = document.querySelector('[data-testid="sidebar-demo"] nav > div:first-child button');
    const region = document.getElementById(b.getAttribute('aria-controls'));
    return { exists: !!region, isNav: region?.tagName === 'NAV', holdsToggle: !!region?.contains(b), holdsItems: region?.querySelectorAll('a, button').length > 4 };
  });
  t.expectEqual(ctl, { exists: true, isNav: false, holdsToggle: false, holdsItems: true }, 'aria-controls names the collapsible region (items, header, footer)');
  t.expectEqual(Math.round(await width()), 256, 'open width is 256');
  t.expectEqual(await t.eval(() => [...document.querySelectorAll('[data-testid="sidebar-demo"] nav [aria-current]')].length), 1, 'exactly one aria-current');
  t.expectEqual(await t.attr(`${nav} a[aria-current]`, 'aria-current'), 'page', 'aria-current is "page"');
  const ind0 = await indicator();
  t.expectEqual(ind0.count, 1, 'one indicator');
  t.expect(Math.abs(ind0.top - (await itemTop(0))) < 1.5, 'indicator sits on the current item');

  // Collapse: width is mid flight at 60 ms, settles at 56; labels fade out.
  await t.click(toggle);
  await t.wait(60);
  const mid = await width();
  if (t.reducedMotion) {
    t.expect(Math.round(mid) === 56, `reduced motion: width snaps (${mid})`);
  } else {
    t.expect(mid < 256 && mid > 56, `width is between open and rail at 60 ms (${mid.toFixed(1)})`);
  }
  await t.wait(500);
  t.expectEqual(Math.round(await width()), 56, 'collapsed width is 56');
  t.expectEqual(await t.attr(toggle, 'aria-expanded'), 'false', 'aria-expanded false when collapsed');
  t.expectEqual((await t.text(toggle)).trim(), 'Barra lateral', 'the toggle label did not change with the state');
  t.expectEqual(await t.attr(toggle, 'title'), null, 'no native title on the toggle');
  t.expectEqual(await t.eval(() => document.querySelector('[data-testid="sidebar-demo"] nav a').getAttribute('title')), null, 'collapsed items use no native title tooltip');
  t.expectEqual(await t.eval(() => document.querySelector('[data-testid="sidebar-demo"] nav a').textContent), 'Inicio', 'label text stays in the DOM (accessible name)');
  // F12: header and footer content is not reachable in the rail.
  t.expectEqual(await t.eval(() => [document.querySelector('[data-sidebar-header]').inert, document.querySelector('[data-sidebar-footer]').inert]), [true, true], 'collapsed header and footer are inert');
  await t.focus(toggle);
  await t.press('Tab');
  await t.press('Tab');
  await t.press('Tab');
  await t.press('Tab');
  await t.press('Tab');
  await t.press('Tab');
  await t.press('Tab');
  t.expectEqual(await t.eval(() => document.activeElement?.closest('[data-sidebar-header], [data-sidebar-footer]') === null), true, 'Tab never lands in the header or footer of the rail');
  // F11: the rail uses the kit tooltip, shown on hover and on keyboard focus.
  await t.hover(`${nav} li:first-child a`);
  await t.waitFor('[role="tooltip"]');
  t.expectEqual((await t.text('[role="tooltip"]')).trim(), 'Inicio', 'hover shows the label in a kit tooltip');
  await t.hover('h1');
  await t.hover('h1');
  await t.wait(400);
  t.expect(!(await t.exists('[role="tooltip"]')), 'the tooltip leaves with the pointer (the kit tooltip is hoverable, so it waits for the pointer to clear its grace area)');
  await t.eval(() => document.querySelectorAll('[data-testid="sidebar-demo"] nav li a')[1].focus());
  await t.wait(300);
  t.expectEqual(await t.eval(() => document.querySelector('[role="tooltip"]')?.textContent?.trim() ?? null), 'Informes', 'keyboard focus shows the tooltip');
  await t.press('Escape');
  await t.wait(300);
  t.expect(!(await t.exists('[role="tooltip"]')), 'Esc hides the tooltip');
  await t.eval(() => document.activeElement.blur());
  const op = await t.eval(() => parseFloat(getComputedStyle(document.querySelector('[data-testid="sidebar-demo"] nav a span span:nth-of-type(2)')).opacity));
  t.expect(op === 0, `labels are faded out when collapsed (${op})`);
  const iconBox = await t.eval(() => {
    const n = document.querySelector('[data-testid="sidebar-demo"] nav').getBoundingClientRect();
    const ic = document.querySelector('[data-testid="sidebar-demo"] nav a span span').getBoundingClientRect();
    return { off: ic.left + ic.width / 2 - (n.left + n.width / 2) };
  });
  t.expect(Math.abs(iconBox.off) < 1.5, `icons are centered in the rail (offset ${iconBox.off.toFixed(1)})`);
  t.expectEqual(await t.text('[data-testid="collapsed"]'), 'true', 'onCollapsedChange fired');

  // Expand again; labels come back.
  await t.click(toggle);
  await t.wait(600);
  t.expectEqual(Math.round(await width()), 256, 'expanded again');
  const op2 = await t.eval(() => parseFloat(getComputedStyle(document.querySelector('[data-testid="sidebar-demo"] nav a span span:nth-of-type(2)')).opacity));
  t.expect(op2 === 1, `labels are back (${op2})`);
  t.expectEqual(await t.eval(() => [document.querySelector('[data-sidebar-header]').inert, document.querySelector('[data-sidebar-footer]').inert]), [false, false], 'header and footer are reachable again when expanded');
  await t.hover(`${nav} li:first-child a`);
  await t.wait(500);
  t.expect(!(await t.exists('[role="tooltip"]')), 'no tooltip while the labels are visible');
  await t.hover('h1');

  // Spam the toggle: seven clicks end collapsed and settle at the rail width.
  for (let i = 0; i < 7; i++) {
    await t.click(toggle);
    await t.wait(35);
  }
  await t.wait(700);
  t.expectEqual(Math.round(await width()), 56, 'seven toggles end collapsed');
  t.expectEqual(await t.attr(toggle, 'aria-expanded'), 'false', 'state matches width after spam');
  await t.click(toggle);
  await t.wait(600);

  // Indicator slides to the clicked item: mid flight it is between the two, at rest on the target.
  const target = await itemTop(3);
  const from = (await indicator()).top;
  await t.click(itemSel(4));
  await t.wait(45);
  const midInd = await indicator();
  if (t.reducedMotion) {
    t.expect(Math.abs(midInd.top - target) < 1.5, 'reduced motion: indicator jumps to the item');
  } else {
    t.expect(midInd.top > from + 1 && midInd.top < target - 1 || Math.abs(midInd.top - target) < 1.5, `indicator is travelling (${from.toFixed(0)} to ${target.toFixed(0)}, now ${midInd.top.toFixed(1)})`);
  }
  await t.wait(500);
  const rest = await indicator();
  t.expect(Math.abs(rest.top - target) < 1.5, `indicator rests on the new item (${rest.top.toFixed(1)} vs ${target.toFixed(1)})`);
  t.expectEqual(await current(), 'metas', 'onNavigate reports the item');
  t.expectEqual(await t.eval(() => document.querySelectorAll('[data-testid="sidebar-demo"] nav [aria-current]').length), 1, 'still exactly one current');
  t.expectEqual((await indicator()).count, 1, 'still one indicator');

  // Keyboard: Tab reaches items, ring is drawn, Enter on a button item navigates, disabled is skipped.
  await t.focus(toggle);
  for (let i = 0; i < 6; i++) await t.press('Tab');
  t.expectEqual(await t.eval(() => document.activeElement.textContent), 'Ajustes', 'Tab walks the header button and the items in order');
  const outline = await t.eval(() => getComputedStyle(document.activeElement).outlineStyle);
  t.expect(outline === 'solid', `focus-visible ring on the item (${outline})`);
  await t.press('Enter');
  await t.wait(500);
  t.expectEqual(await current(), 'ajustes', 'Enter activates a button item');
  await t.press('Tab');
  t.expectEqual(await t.eval(() => document.activeElement?.getAttribute('data-testid')), 'account', 'the disabled item is skipped by Tab: the footer link is next');
  t.expectEqual(await t.eval(() => document.querySelector('[data-testid="sidebar-demo"] nav ul:last-of-type li:last-child button').disabled), true, 'disabled item is disabled');

  // Press: content scales, indicator does not.
  await t.mouseDown(itemSel(1));
  await t.wait(150);
  const press = await t.eval(() => {
    const c = document.querySelector('[data-testid="sidebar-demo"] nav li a > span:last-child');
    const i = document.querySelector('[data-sidebar-indicator]');
    return { content: parseFloat(getComputedStyle(c).scale) || 1, indicatorScale: parseFloat(getComputedStyle(i).scale) || 1 };
  });
  await t.mouseUp();
  if (!t.reducedMotion) t.expect(press.content > 0.95 && press.content < 0.99, `press scales the content to ~0.97 (${press.content.toFixed(3)})`);
  await t.wait(500);

  // Hover tint on a non current item.
  await t.hover(itemSel(2));
  await t.wait(250);
  const hoverBg = await t.eval(() => getComputedStyle(document.querySelector('[data-testid="sidebar-demo"] nav li:nth-of-type(2) a')).backgroundColor);
  t.expect(hoverBg !== 'rgba(0, 0, 0, 0)', `hover tints the item (${hoverBg})`);
  await t.screenshot(`sidebar-${t.reducedMotion ? 'reduced' : 'motion'}`);
  await t.click(toggle);
  await t.wait(600);
  await t.screenshot(`sidebar-rail-${t.reducedMotion ? 'reduced' : 'motion'}`);

  // Persistence: the collapsed state is written to localStorage under `storageKey` and read back on load.
  t.expectEqual(await t.eval(() => localStorage.getItem('kit-sidebar-demo')), 'true', 'collapsing is persisted');
  await t.eval(() => { setTimeout(() => location.reload(), 0); });
  await t.wait(300);
  await t.raw.waitReady();
  // The harness helper lives in the page, so put it back after a navigation.
  await t.eval(() => {
    window.__kitFind = (sel) => {
      if (sel.startsWith('text=')) {
        const want = sel.slice(5).trim();
        const hits = [...document.body.querySelectorAll('*')].filter((e) => e.textContent.trim() === want);
        return hits.find((e) => ![...e.children].some((c) => c.textContent.trim() === want)) || null;
      }
      return document.querySelector(sel);
    };
  });
  await t.wait(900);
  t.expectEqual(Math.round(await width()), 56, 'the collapsed state comes back after a reload');
  t.expectEqual(await t.eval(() => document.querySelector('[data-testid="collapsed"]').textContent), 'true', 'and onCollapsedChange reports it to the app');
  await t.eval(() => document.querySelector('[data-testid="sidebar-demo"] nav > div:first-child button').click());
  await t.wait(600);
  t.expectEqual(await t.eval(() => localStorage.getItem('kit-sidebar-demo')), 'false', 'expanding is persisted too');
  // A storage that throws (private mode, blocked site data) must not break the control.
  await t.eval(() => { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } }); });
  await t.eval(() => document.querySelector('[data-testid="sidebar-demo"] nav > div:first-child button').click());
  await t.wait(600);
  t.expectEqual(Math.round(await width()), 56, 'the toggle still works when storage throws');

  // F14: below 768 px the sidebar is a drawer (a modal with an overlay) that the app opens.
  await t.raw.setViewport({ width: 390, height: 844 });
  await t.wait(500);
  t.expect(!(await t.exists('[data-testid="sidebar-demo"] nav')), 'below 768 px the inline sidebar is gone');
  t.expect(await t.exists('[data-testid="open-drawer"]'), 'the app shows its own menu button');
  await t.focus('[data-testid="open-drawer"]');
  await t.press('Enter');
  await t.waitFor('[role="dialog"]');
  await t.wait(600);
  const drawer = await t.eval(() => {
    const d = document.querySelector('[role="dialog"]');
    const r = d.getBoundingClientRect();
    return { w: Math.round(r.width), left: Math.round(r.left), nav: d.querySelector('nav')?.getAttribute('aria-label'), labels: [...d.querySelectorAll('li a, li button')].map((x) => x.textContent.trim()).slice(0, 2), toggle: !!d.querySelector('[aria-expanded]'), modal: d.getAttribute('aria-modal') ?? document.querySelector('[role="dialog"]')?.getAttribute('data-state') };
  });
  t.expectEqual([drawer.w, drawer.left, drawer.nav], [288, 0, 'Principal'], 'the drawer is 288 px wide, flush left, and holds the named nav');
  t.expectEqual(drawer.labels, ['Inicio', 'Informes'], 'the drawer always shows the labels (no rail)');
  t.expectEqual(drawer.toggle, false, 'the drawer has no rail toggle');
  t.expect(await t.exists('[data-sidebar-overlay]'), 'an overlay covers the page');
  t.expectEqual(await t.eval(() => !!document.activeElement?.closest('[role="dialog"]')), true, 'focus moves into the drawer');
  await t.screenshot(`sidebar-drawer-${t.reducedMotion ? 'reduced' : 'motion'}`);
  await t.press('Escape');
  await t.wait(500);
  t.expect(!(await t.exists('[role="dialog"]')), 'Esc closes the drawer');
  t.expectEqual(await t.eval(() => document.activeElement?.getAttribute('data-testid')), 'open-drawer', 'focus returns to the menu button');
  await t.click('[data-testid="open-drawer"]');
  await t.waitFor('[role="dialog"]');
  await t.wait(500);
  await t.click('[role="dialog"] li:nth-of-type(2) a');
  await t.wait(600);
  t.expectEqual(await current(), 'informes', 'picking an item navigates');
  t.expect(!(await t.exists('[role="dialog"]')), 'and closes the drawer');
  await t.raw.setViewport({ width: 1280, height: 800 });
  await t.wait(500);
  await t.eval(() => { delete window.localStorage; });
}
