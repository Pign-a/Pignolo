// Segmented tabs: sliding pill (mid-slide sample), rapid switching, arrows/Home/End, disabled skip, panel enter, reduced cross-fade.
export default async function (t) {
  const root = '[data-testid="seg-main"]';
  const tab = (name) => `${root} [role="tab"]:nth-child(${name})`;
  const pillRect = () => t.eval((r) => {
    const p = document.querySelector(r + ' [role="tab"] > span[aria-hidden]');
    if (!p) return null;
    const b = p.getBoundingClientRect();
    return { x: b.x, w: b.width, n: document.querySelectorAll(r + ' [role="tab"] > span[aria-hidden]').length };
  }, root);
  const tabX = (i) => t.eval((a) => document.querySelectorAll(a.r + ' [role="tab"]')[a.k].getBoundingClientRect().x, { r: root, k: i });
  const selected = () => t.eval((r) => [...document.querySelectorAll(r + ' [role="tab"]')].findIndex((e) => e.getAttribute('aria-selected') === 'true'), root);

  t.expectEqual(await t.attr(`${root} [role="tablist"]`, 'aria-label'), 'Período', 'tablist is named');
  t.expectEqual(await selected(), 1, 'Semana selected by default');
  let pill = await pillRect();
  t.expect(pill && Math.abs(pill.x - (await tabX(1)) ) < 3, 'pill sits under the selected tab');

  // Click Mes (index 2): sample the pill mid-slide
  const from = await tabX(1);
  const to = await tabX(2);
  await t.click(tab(3));
  await t.wait(70);
  pill = await pillRect();
  if (t.reducedMotion) {
    const xs = await t.eval((r) => [...document.querySelectorAll(r + ' [role="tab"] > span[aria-hidden]')].map((p) => p.getBoundingClientRect().x), root);
    t.expect(xs.every((x) => Math.abs(x - from) < 3 || Math.abs(x - to) < 3), `reduced: pills only sit at tab positions, never between (${xs.map((x) => x.toFixed(0))})`);
  } else {
    t.expect(pill.x > from + 3 && pill.x < to - 3 || Math.abs(pill.x - to) < 3, `pill is travelling 70 ms in (x=${pill.x.toFixed(1)} between ${from.toFixed(1)} and ${to.toFixed(1)})`);
  }
  await t.wait(700);
  pill = await pillRect();
  t.expect(Math.abs(pill.x - to) < 1.5 && pill.n === 1, `pill settles under Mes, single pill (x=${pill.x.toFixed(1)}, n=${pill.n})`);
  const panelText = await t.text(`${root} [role="tabpanel"]:not([hidden])`);
  t.expect((panelText || "").includes('Este mes'), `panel shows the Mes content (got ${JSON.stringify(panelText)})`);

  // Panel enters (fade + rise) and is interruptible
  await t.click(tab(4));
  await t.wait(40);
  const op = await t.eval((r) => parseFloat(getComputedStyle(document.querySelector(r + ' [role="tabpanel"]:not([hidden]) > div')).opacity), root);
  t.expect(op < 0.95, `new panel is fading in (opacity ${op.toFixed(2)})`);
  await t.wait(500);

  // Rapid switching: ends on the last click, one pill, aligned
  for (const i of [1, 4, 2, 3, 1, 2]) { await t.click(tab(i)); await t.wait(35); }
  await t.wait(800);
  t.expectEqual(await selected(), 1, 'rapid switching ends on the last click (Semana)');
  pill = await pillRect();
  t.expect(Math.abs(pill.x - (await tabX(1))) < 1.5 && pill.n === 1, `pill aligned after rapid switching (n=${pill.n})`);

  // Keyboard: the selected tab is the single tab stop (roving tabindex); arrows move + select
  const stops = await t.eval((r) => [...document.querySelectorAll(r + ' [role="tab"]')].map((e) => e.tabIndex), root);
  t.expectEqual(stops, [-1, 0, -1, -1], 'only the selected tab is in the tab order');
  await t.eval((r) => document.querySelectorAll(r + ' [role="tab"]')[1].focus(), root);
  await t.press('ArrowRight');
  await t.wait(500);
  t.expectEqual(await selected(), 2, 'ArrowRight selects the next tab');
  t.expectEqual(await t.eval(() => getComputedStyle(document.activeElement).outlineStyle), 'solid', 'focus-visible ring on the tab');
  await t.press('ArrowLeft');
  await t.wait(60);
  await t.press('ArrowLeft');
  await t.wait(500);
  t.expectEqual(await selected(), 0, 'ArrowLeft x2 reaches the first');
  await t.press('End');
  await t.wait(500);
  t.expectEqual(await selected(), 3, 'End selects the last');
  await t.press('Home');
  await t.wait(300);
  t.expectEqual(await selected(), 0, 'Home selects the first');
  t.expectEqual(await t.eval((r) => document.activeElement === document.querySelectorAll(r + ' [role="tab"]')[0], root), true, 'focus follows the selection');
  await t.press('Tab');
  t.expectEqual(await t.eval(() => document.activeElement.getAttribute('role')), 'tabpanel', 'Tab goes on to the panel');

  // Press is the CSS `scale` property (pressClass), not whileTap
  await t.mouseDown(tab(2));
  await t.wait(110);
  const sc = await t.eval((s) => { const cs = getComputedStyle(document.querySelector(s)); return new DOMMatrixReadOnly(cs.transform).a * (parseFloat(cs.scale) || 1); }, tab(2));
  await t.mouseUp();
  if (t.reducedMotion) t.expect(Math.abs(sc - 1) < 0.001, 'reduced: no press scale');
  else t.expect(sc > 0.955 && sc < 0.985, `tab press scale near 0.97 (got ${sc.toFixed(3)})`);

  // F13: items without `content` are a filter, not tabs: a radio group (APG), never a tablist without panels
  const second = '[aria-label="Filtro de movimientos"]';
  const radio = (n) => `${second} [role="radio"]:nth-child(${n})`;
  const filter = () => t.text('[data-testid="filter"]');
  const checkedIdx = () => t.eval((r) => [...document.querySelectorAll(r + ' [role="radio"]')].findIndex((e) => e.getAttribute('aria-checked') === 'true'), second);
  const focusedIdx = () => t.eval((r) => [...document.querySelectorAll(r + ' [role="radio"]')].findIndex((e) => e === document.activeElement), second);
  t.expectEqual(await t.attr(second, 'role'), 'radiogroup', 'content-less segments render as a radiogroup');
  t.expectEqual(await t.count(`${second} [role="tab"], ${second}[role="tablist"]`), 0, 'no tab roles without panels');
  t.expectEqual(await t.count(`${second} [role="radio"]`), 4, 'four radios');
  t.expectEqual(await checkedIdx(), 0, 'Todos is checked by default');
  t.expectEqual(await t.eval((r) => [...document.querySelectorAll(r + ' [role="radio"]')].map((e) => e.tabIndex), second), [0, -1, -1, -1], 'roving tabindex: only the checked radio is a tab stop');
  t.expectEqual(await t.attr(radio(4), 'disabled'), '', 'the disabled radio is disabled');
  await t.click(radio(3));
  await t.wait(200);
  t.expectEqual(await filter(), 'gastos', 'click checks a radio and updates the controlled value');
  t.expectEqual(await checkedIdx(), 2, 'Gastos is aria-checked');
  t.expectEqual(await focusedIdx(), 2, 'a clicked radio has focus');
  await t.press('ArrowRight');
  await t.wait(200);
  t.expectEqual(await filter(), 'todos', 'ArrowRight skips the disabled radio and wraps to the first');
  t.expectEqual(await focusedIdx(), 0, 'focus follows the check (ArrowRight)');
  await t.press('ArrowLeft');
  await t.wait(200);
  t.expectEqual(await filter(), 'gastos', 'ArrowLeft wraps to the last enabled radio');
  await t.press('ArrowUp');
  await t.wait(200);
  t.expectEqual(await filter(), 'ingresos', 'ArrowUp moves to the previous radio (APG radio keys use all four arrows)');
  await t.press('ArrowDown');
  await t.wait(200);
  t.expectEqual(await filter(), 'gastos', 'ArrowDown moves to the next radio');
  await t.press('Home');
  await t.wait(200);
  t.expectEqual(await filter(), 'todos', 'Home checks the first');
  await t.press('End');
  await t.wait(200);
  t.expectEqual(await filter(), 'gastos', 'End checks the last enabled radio');
  await t.click(radio(4));
  await t.wait(100);
  t.expectEqual(await filter(), 'gastos', 'disabled radio ignores clicks');
  const pills = await t.eval((r) => document.querySelectorAll(r + ' [role="radio"] > span[aria-hidden]').length, second);
  t.expectEqual(pills, 1, 'one pill under the checked radio');
  await t.press('Tab');
  t.expectEqual(await t.eval((r) => !document.querySelector(r).contains(document.activeElement), second), true, 'Tab leaves the radio group');

  // Forced colors: the selected pill is Highlight and its text HighlightText (tabs and radio group)
  await t.emulate([{ name: 'forced-colors', value: 'active' }]);
  await t.wait(200);
  const fc = await t.eval((r) => {
    const probe = (prop, v) => { const d = document.createElement('i'); d.style[prop] = v; document.body.append(d); const c = getComputedStyle(d)[prop]; d.remove(); return c; };
    const sel = document.querySelector(r + ' [role="radio"][aria-checked="true"]');
    return {
      forced: matchMedia('(forced-colors: active)').matches,
      pill: getComputedStyle(sel.querySelector('span[aria-hidden]')).backgroundColor, highlight: probe('backgroundColor', 'Highlight'),
      text: getComputedStyle(sel).color, highlightText: probe('color', 'HighlightText'),
      listBorder: getComputedStyle(sel.parentElement).borderTopWidth,
    };
  }, second);
  t.expect(fc.forced, 'forced-colors emulation is active');
  t.expectEqual(fc.pill, fc.highlight, 'forced colors: the selected pill is Highlight');
  t.expectEqual(fc.text, fc.highlightText, 'forced colors: the selected label is HighlightText');
  t.expect(parseFloat(fc.listBorder) >= 1, `forced colors: the list has a border (${fc.listBorder})`);
  await t.screenshot(`segmented-tabs-forced${t.reducedMotion ? '-reduced' : ''}`);
  await t.emulate([{ name: 'forced-colors', value: 'none' }]);

  // Touch: segments are at least 44 px tall on a coarse pointer
  await t.coarse(true);
  await t.wait(300);
  const heights = await t.eval((r) => [...document.querySelectorAll(r + ' [role="radio"]')].map((e) => Math.round(e.getBoundingClientRect().height)), second);
  t.expect(heights.every((h) => h >= 44), `touch: radios are at least 44 px tall (${heights.join(',')})`);
  await t.coarse(false);
  await t.wait(200);
  await t.screenshot(`segmented-tabs-interact${t.reducedMotion ? '-reduced' : ''}`);
}
