// Month picker: chevron slide, limits, popover grids (month, decade), APG keys, typed input, range, sheet on touch, form, reduced motion.
import { wheel } from './_calendar.mjs';

export default async function (t) {
  const free = '[data-testid="mp-free"]';
  const limited = '[data-testid="mp-limited"]';
  const wide = '[data-testid="mp-wide"]';
  const sheet = '[data-testid="mp-sheet"]';
  const arrow = (root, name) => `${root} button[aria-label="${name}"]`;
  const trigger = (root) => `${root} button[aria-haspopup="dialog"]`;
  const value = (id) => t.text(`[data-testid="${id}-value"]`);
  const texts = (root) =>
    t.eval((r) => [...document.querySelectorAll(`${r} [data-testid="month-text"]`)].map((e) => {
      const wrap = e.parentElement;
      const mat = new DOMMatrixReadOnly(getComputedStyle(wrap).transform === 'none' ? undefined : getComputedStyle(wrap).transform);
      return { text: e.textContent, tx: mat.m41, opacity: parseFloat(getComputedStyle(wrap).opacity) };
    }), root);
  const cell = (y, m) => `[data-month-cell][data-year="${y}"][data-month="${m}"]`;
  const activeCell = () => t.eval(() => {
    const a = document.activeElement;
    if (a?.hasAttribute('data-month-cell')) return `${a.dataset.year}-${a.dataset.month}`;
    if (a?.hasAttribute('data-year-cell')) return `y${a.dataset.year}`;
    return a?.tagName + ':' + (a?.getAttribute('aria-label') ?? '');
  });
  // The shared helper has no PageUp/PageDown, so those are dispatched as keyboard events on the focused element.
  const key = async (k, mods = {}) => {
    if (k === 'PageUp' || k === 'PageDown') await t.eval(([name, m]) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...m })), [k, mods]);
    else await t.press(k);
    await t.wait(70);
  };
  const dialogs = () => t.count('[role="dialog"]');
  const open = async (root) => {
    await t.focus(trigger(root));
    await t.press('Enter');
    await t.waitFor('[role="dialog"]');
    await t.wait(450);
  };

  // Semantics.
  t.expectEqual(await t.attr(`${free} [role="group"]`, 'aria-label'), 'Período', 'group is named');
  t.expectEqual(await t.attr(trigger(free), 'aria-label'), 'Elegir mes, Octubre 2026', 'trigger names the action and the value');
  t.expectEqual((await texts(free)).map((x) => x.text), ['Octubre 2026'], 'initial text');
  t.expectEqual(await t.eval(() => document.querySelector('[data-testid="mp-free"] input[name="periodo"]').value), '2026-10', 'a hidden input posts the ISO month');

  // Next: the new month enters from the right (+x), the old leaves to the left (-x), 10 px.
  await t.click(arrow(free, 'Mes siguiente'));
  await t.wait(35);
  const goNext = await texts(free);
  t.expectEqual(goNext.map((x) => x.text).sort(), ['Noviembre 2026', 'Octubre 2026'], 'old and new month coexist during the slide');
  const nNew = goNext.find((x) => x.text === 'Noviembre 2026');
  const nOld = goNext.find((x) => x.text === 'Octubre 2026');
  if (t.reducedMotion) {
    t.expect(Math.abs(nNew.tx) < 0.01 && Math.abs(nOld.tx) < 0.01, 'reduced motion: no horizontal travel');
    t.expect(nNew.opacity < 1 || nOld.opacity < 1, 'reduced motion: cross-fades');
  } else {
    t.expect(nNew.tx > 0 && nNew.tx <= 10.01, `next month enters from the right (x ${nNew.tx.toFixed(2)})`);
    t.expect(nOld.tx < 0 && nOld.tx >= -10.01, `previous month leaves to the left (x ${nOld.tx.toFixed(2)})`);
    t.expect(nNew.opacity < 1, 'entering month fades in');
  }
  await t.wait(600);
  t.expectEqual((await texts(free)).map((x) => x.text), ['Noviembre 2026'], 'only the new month remains');
  t.expectEqual(await value('free'), '2026-10', 'value follows the arrow');
  t.expectEqual(await t.text(`${free} [aria-live="polite"]`), 'Noviembre 2026', 'the new month is announced through a live region');

  // Previous twice: enters from the left (-x).
  await t.click(arrow(free, 'Mes anterior'));
  await t.wait(600);
  await t.click(arrow(free, 'Mes anterior'));
  await t.wait(35);
  const goPrev = await texts(free);
  const pNew = goPrev.find((x) => x.text === 'Septiembre 2026');
  const pOld = goPrev.find((x) => x.text === 'Octubre 2026');
  if (!t.reducedMotion) {
    t.expect(pNew.tx < 0 && pNew.tx >= -10.01, `previous month enters from the left (x ${pNew.tx.toFixed(2)})`);
    t.expect(pOld.tx > 0, `current month leaves to the right (x ${pOld.tx.toFixed(2)})`);
  }
  await t.wait(600);
  t.expectEqual(await value('free'), '2026-8', 'two previous steps');

  // Rapid stepping: eight quick next clicks land on May 2027 (Sep 2026 + 8) with one text left.
  for (let i = 0; i < 8; i++) {
    await t.click(arrow(free, 'Mes siguiente'));
    await t.wait(25);
  }
  await t.wait(700);
  t.expectEqual((await texts(free)).map((x) => x.text), ['Mayo 2027'], 'rapid stepping settles on one correct month');
  t.expectEqual(await value('free'), '2027-4', 'value after rapid stepping');
  t.expectEqual(await t.eval(() => document.querySelectorAll('[data-testid="mp-free"] [data-testid="month-text"]').length), 1, 'no leftover exiting nodes');

  // Press feedback on an arrow.
  await t.mouseDown(arrow(free, 'Mes siguiente'));
  await t.wait(150);
  const sc = await t.eval(() => parseFloat(getComputedStyle(document.querySelector('[data-testid="mp-free"] button[aria-label="Mes siguiente"]')).scale) || 1);
  await t.mouseUp();
  if (!t.reducedMotion) t.expect(sc > 0.95 && sc < 0.99, `press scale near 0.97 (${sc.toFixed(3)})`);
  await t.wait(600);
  t.expectEqual(await value('free'), '2027-5', 'the press click also stepped the month');
  await t.click(arrow(free, 'Mes anterior'));
  await t.wait(600);

  // Limits: December 2026 is the max; the next arrow is aria-disabled and keeps focus.
  t.expectEqual(await t.attr(arrow(limited, 'Mes siguiente'), 'aria-disabled'), 'true', 'next is aria-disabled at the max');
  await t.click(arrow(limited, 'Mes siguiente'));
  await t.wait(300);
  t.expectEqual(await value('limited'), '2026-11', 'click at the limit changes nothing');
  await t.focus(arrow(limited, 'Mes siguiente'));
  await t.press('Enter');
  await t.wait(200);
  t.expectEqual(await t.eval(() => document.activeElement?.getAttribute('aria-label')), 'Mes siguiente', 'aria-disabled keeps keyboard focus');

  // Open with the keyboard: focus lands on the selected month; one dialog, no nested popup.
  await open(free);
  t.expectEqual(await t.attr(trigger(free), 'aria-expanded'), 'true', 'trigger reports expanded');
  t.expectEqual(await activeCell(), '2027-4', 'focus on the selected month');
  t.expectEqual(await dialogs(), 1, 'exactly one dialog');
  t.expectEqual(await t.eval(() => document.querySelector('[data-month-cell][aria-label="Mayo 2027"]').parentElement.getAttribute('aria-selected')), 'true', 'selected cell is aria-selected');
  t.expectEqual(await t.eval(() => document.querySelectorAll('[role="grid"] [role="gridcell"][aria-selected="true"]').length), 1, 'exactly one selected cell');
  t.expectEqual(await t.eval(() => document.querySelectorAll('[data-month-cell][tabindex="0"]').length), 1, 'roving tabindex: one tab stop');
  const geo = await t.eval(() => { const c = document.querySelector('[data-month-cell]').getBoundingClientRect(); return c.height; });
  t.expect(geo >= 40, `month cells are at least 40 px tall (${geo})`);
  t.expectEqual(await t.eval(() => document.querySelector('[data-testid="year-text"]').closest('button').getAttribute('aria-label')), 'Cambiar año, 2027', 'the year button is named with its value');
  t.expectEqual(await t.eval(() => document.querySelector('[data-testid="month-name"]')), null, 'the month picker has no month button (the body is the month grid)');
  const monthBody = await t.eval(() => document.querySelector('[role="dialog"]').getBoundingClientRect().height);

  // Typed field: the format is helper text, never a placeholder.
  t.expectEqual(await t.eval(() => { const i = document.querySelector('[role="dialog"] input'); return [i.placeholder, i.getAttribute('aria-label') ?? document.querySelector(`label[for="${i.id}"]`)?.textContent]; }), ['', 'Escribir el mes'], 'the field has no placeholder and a visible label');
  t.expect((await t.text('[role="dialog"]')).includes('Formato mm/aaaa, por ejemplo 03/2026'), 'the format is visible helper text');

  // Grid keys. May 2027 = index 4.
  await key('ArrowRight');
  t.expectEqual(await activeCell(), '2027-5', 'ArrowRight moves one month');
  await key('ArrowLeft');
  await key('ArrowLeft');
  t.expectEqual(await activeCell(), '2027-3', 'ArrowLeft moves back');
  await key('Home');
  t.expectEqual(await activeCell(), '2027-3', 'Home goes to the first month of the row (Apr is first of its row)');
  await key('End');
  t.expectEqual(await activeCell(), '2027-5', 'End goes to the last month of the row');
  await key('ArrowUp');
  t.expectEqual(await activeCell(), '2027-2', 'ArrowUp moves a row up');
  await key('ArrowUp');
  t.expectEqual(await activeCell(), '2026-11', 'ArrowUp crosses to the previous year and keeps focus');
  await t.wait(500);
  t.expectEqual(await t.text('[data-testid="year-text"]'), '2026', 'year header follows');
  t.expectEqual(await t.text('[data-testid="panel-live"]'), '2026', 'the year change is announced through a live region');
  await key('ArrowRight');
  t.expectEqual(await activeCell(), '2027-0', 'ArrowRight crosses to the next year');
  await key('PageUp');
  t.expectEqual(await activeCell(), '2026-0', 'PageUp goes one year back');
  await key('PageDown');
  await key('PageDown');
  t.expectEqual(await activeCell(), '2028-0', 'PageDown goes one year ahead');
  await t.wait(500);
  t.expectEqual(await t.eval(() => document.querySelectorAll('[role="grid"]').length), 1, 'old year grids are gone after the slide');

  // Year slide direction: step to the previous year and read both grids mid flight.
  if (!t.reducedMotion) {
    await t.press('ArrowLeft');
    await t.wait(25);
    const grids = await t.eval(() => [...document.querySelectorAll('[role="grid"]')].map((g) => {
      const mat = new DOMMatrixReadOnly(getComputedStyle(g).transform === 'none' ? undefined : getComputedStyle(g).transform);
      return { label: g.getAttribute('aria-label'), tx: mat.m41, inert: g.hasAttribute('inert') };
    }));
    t.expectEqual(grids.length, 2, 'two grids during the year slide');
    const entering = grids.find((g) => g.label === '2027');
    const leaving = grids.find((g) => g.label === '2028');
    t.expect(entering.tx < 0 && leaving.tx > 0, `going back in time: new grid from the left (${entering.tx.toFixed(1)}), old to the right (${leaving.tx.toFixed(1)})`);
    t.expect(leaving.inert, 'the leaving grid is inert (not focusable)');
    await t.wait(600);
  } else {
    await t.press('ArrowLeft');
    await t.wait(600);
  }

  // The year button replaces the body with a decade grid: no popup in a popup, same height.
  await t.click('button[aria-label^="Cambiar año"]');
  await t.wait(500);
  t.expectEqual(await dialogs(), 1, 'still exactly one dialog with the decade grid');
  t.expectEqual(await t.eval(() => document.querySelectorAll('[data-year-cell]').length), 12, 'the decade grid has 12 years');
  t.expectEqual(await t.eval(() => document.querySelector('[role="grid"]').getAttribute('aria-label')), '2020 - 2029', 'the grid is the decade of the cursor');
  t.expectEqual(await t.eval(() => [...document.querySelectorAll('[data-year-cell]')].map((c) => c.dataset.year).join(',')), '2019,2020,2021,2022,2023,2024,2025,2026,2027,2028,2029,2030', 'one year before and one after the decade');
  t.expectEqual(await activeCell(), 'y2027', 'focus on the cursor year');
  t.expectEqual(await t.eval(() => document.querySelectorAll('[data-month-cell]').length), 0, 'the month grid is gone');
  t.expectEqual(await t.eval(() => document.querySelector('[role="dialog"]').getBoundingClientRect().height), monthBody, 'the panel keeps its height between views');
  await key('ArrowRight');
  t.expectEqual(await activeCell(), 'y2028', 'year grid: ArrowRight moves a year');
  await key('ArrowDown');
  t.expectEqual(await activeCell(), 'y2031', 'year grid: ArrowDown moves a row (3 years) and changes decade');
  await t.wait(500);
  t.expectEqual(await t.eval(() => document.querySelector('[role="grid"]').getAttribute('aria-label')), '2030 - 2039', 'the page follows the cursor');
  await key('PageUp');
  t.expectEqual(await activeCell(), 'y2021', 'year grid: PageUp goes a decade back');
  await t.wait(500);
  await t.click('button[aria-label="Década siguiente"]');
  await t.wait(500);
  t.expectEqual(await t.eval(() => document.querySelector('[role="grid"]').getAttribute('aria-label')), '2030 - 2039', 'the decade arrow pages the grid');
  await t.click('[data-year-cell][data-year="2033"]');
  await t.wait(600);
  t.expectEqual(await t.eval(() => document.querySelectorAll('[data-month-cell]').length), 12, 'picking a year returns to the month grid');
  t.expectEqual(await t.text('[data-testid="year-text"]'), '2033', 'the header shows the picked year');
  t.expectEqual(await value('free'), '2027-4', 'picking a year does not change the value yet');
  t.expectEqual(await activeCell(), '2033-11', 'focus is on the cursor month (December) of that year');

  // Esc closes, focus returns to the trigger, value unchanged.
  await t.press('Escape');
  await t.wait(500);
  t.expectEqual(await dialogs(), 0, 'Esc closes the popover');
  t.expectEqual(await t.eval(() => document.activeElement?.getAttribute('aria-haspopup')), 'dialog', 'focus returns to the trigger');
  t.expectEqual(await value('free'), '2027-4', 'Esc keeps the value');

  // Reopen, navigate and pick with Enter; popover closes, value updates, text slides backwards.
  await t.press('Enter');
  await t.waitFor('[role="dialog"]');
  await t.wait(500);
  await key('ArrowLeft');
  await key('ArrowLeft');
  await key('ArrowLeft');
  await key('ArrowLeft');
  t.expectEqual(await activeCell(), '2027-0', 'moved to January');
  await t.press('Enter');
  await t.wait(30);
  t.expectEqual(await value('free'), '2027-0', 'Enter picks the focused month');
  await t.wait(600);
  t.expectEqual(await dialogs(), 0, 'picking closes the popover');
  t.expectEqual((await texts(free)).map((x) => x.text), ['Enero 2027'], 'trigger text updated');
  t.expectEqual(await t.eval(() => document.activeElement?.getAttribute('aria-haspopup')), 'dialog', 'focus returns to the trigger after picking');

  // Mouse: open, step the year with the chevrons, pick with a click.
  await t.click(trigger(free));
  await t.waitFor('[role="dialog"]');
  await t.wait(500);
  await t.click('button[aria-label="Año siguiente"]');
  await t.wait(500);
  t.expectEqual(await t.text('[data-testid="year-text"]'), '2028', 'year chevron advances');
  await t.screenshot(`month-picker-open-${t.reducedMotion ? 'reduced' : 'motion'}`);
  await t.click(cell(2028, 6));
  await t.wait(600);
  t.expectEqual(await value('free'), '2028-6', 'click picks a month in another year');
  t.expectEqual(await t.eval(() => document.querySelector('[data-testid="mp-free"] input[name="periodo"]').value), '2028-07', 'the hidden input follows the value');
  await t.click('[data-testid="free-post"]');
  await t.wait(100);
  t.expectEqual(await t.text('[data-testid="free-hidden"]'), '{"periodo":"2028-07"}', 'the form posts the ISO month');

  // "Este mes" picks the current month.
  await open(free);
  const nowMonth = await t.eval(() => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth()}`; });
  await t.click('text=Este mes');
  await t.wait(600);
  t.expectEqual(await value('free'), nowMonth, 'the this-month button picks the current month');

  // Typed input: accepted formats commit, errors never guess.
  const typeInto = async (text, { enter = true } = {}) => {
    await t.eval(() => { const i = document.querySelector('[role="dialog"] input'); i.focus(); i.select(); });
    await t.press('Backspace');
    await t.type(text);
    if (enter) await t.press('Enter');
    await t.wait(200);
  };
  const err = () => t.eval(() => document.querySelector('[role="dialog"] [aria-live="polite"] p:has(svg)')?.textContent ?? null);
  await open(free);
  await typeInto('mar 2029');
  t.expectEqual(await value('free'), '2029-2', 'typing "mar 2029" and Enter picks March 2029');
  await t.wait(500);
  t.expectEqual(await dialogs(), 0, 'a valid typed month closes the popover');
  await open(free);
  await typeInto('13/2030');
  t.expectEqual(await value('free'), '2029-2', 'an invalid month is not committed');
  t.expectEqual(await dialogs(), 1, 'the popover stays open on an error');
  t.expect((await err())?.includes('El mes va de 1 a 12'), `the month error is shown (${await err()})`);
  t.expectEqual(await t.eval(() => document.querySelector('[role="dialog"] input').getAttribute('aria-invalid')), 'true', 'the field is aria-invalid');
  t.expect(await t.eval(() => { const i = document.querySelector('[role="dialog"] input'); return (document.getElementById(i.getAttribute('aria-describedby')) ?? {}).textContent?.includes('El mes va de 1 a 12'); }), 'the field is described by its message, which holds the error');
  await typeInto('3');
  t.expect((await err())?.includes('Falta el año'), 'one number is incomplete, not guessed');
  t.expectEqual(await value('free'), '2029-2', 'incomplete input is not committed');
  await typeInto('3/2');
  t.expect((await err())?.includes('El año tiene 2 o 4 cifras'), 'a one digit year is an error, not 2002');
  await typeInto('sept 31');
  t.expectEqual(await value('free'), '2031-8', 'es-AR "sept 31" is September 2031 (two digit year is 20xx)');
  await t.wait(500);
  await open(free);
  await typeInto('2032-01');
  t.expectEqual(await value('free'), '2032-0', 'ISO 2032-01 works');
  await t.wait(500);
  await open(free);
  await typeInto('032033');
  t.expectEqual(await value('free'), '2033-2', 'six digits mmyyyy works (numeric keypad)');
  await t.wait(500);

  // Wide range: 1900 and 2100 are reachable and the edges hold.
  await open(wide);
  await typeInto('01/1900');
  t.expectEqual(await value('wide'), '1900-0', 'January 1900 is accepted');
  await t.wait(500);
  t.expectEqual(await t.attr(arrow(wide, 'Mes anterior'), 'aria-disabled'), 'true', 'previous is disabled at the min');
  await open(wide);
  await typeInto('12/1899');
  t.expectEqual(await value('wide'), '1900-0', 'a month before the min is not committed');
  t.expect((await err())?.includes('fuera del período'), 'the range error is shown for a complete date that is not allowed');
  await t.press('Escape');
  await t.wait(500);
  await open(wide);
  await key('PageUp');
  t.expectEqual(await activeCell(), '1899-0', 'keys can travel past the min (cells stay focusable)');
  t.expectEqual(await t.attr(cell(1899, 0), 'aria-disabled'), 'true', 'a month before the min is aria-disabled');
  await key('Enter');
  t.expectEqual(await dialogs(), 1, 'Enter on a disabled month does nothing');
  t.expectEqual(await value('wide'), '1900-0', 'the disabled month was not picked');
  await t.click('button[aria-label^="Cambiar año"]');
  await t.wait(500);
  t.expectEqual(await t.eval(() => document.querySelector('[role="grid"]').getAttribute('aria-label')), '1890 - 1899', 'the decade grid shows 1890s');
  t.expectEqual(await t.eval(() => [...document.querySelectorAll('[data-year-cell][aria-disabled="true"]')].map((c) => c.dataset.year).join(',')), '1889,1890,1891,1892,1893,1894,1895,1896,1897,1898,1899', 'every year before the min is disabled, 1900 is not');
  await t.press('Escape');
  await t.wait(500);
  await open(wide);
  await typeInto('12/2100');
  t.expectEqual(await value('wide'), '2100-11', 'December 2100 is accepted');
  await t.wait(500);
  t.expectEqual(await t.attr(arrow(wide, 'Mes siguiente'), 'aria-disabled'), 'true', 'next is disabled at the max');
  await open(wide);
  await key('PageDown');
  await t.click('button[aria-label^="Cambiar año"]');
  await t.wait(500);
  t.expectEqual(await t.eval(() => [...document.querySelectorAll('[data-year-cell][aria-disabled="true"]')].map((c) => c.dataset.year).join(',')), '2101,2102,2103,2104,2105,2106,2107,2108,2109,2110', 'years after the max are disabled');
  await t.press('Escape');
  await t.wait(500);

  // Out of range cells are aria-disabled, cannot be picked and stay focusable.
  await open(limited);
  t.expectEqual(await t.attr(cell(2026, 0), 'aria-disabled'), 'true', 'a month before the min is aria-disabled');
  await t.click(cell(2026, 0));
  await t.wait(300);
  t.expect((await dialogs()) === 1, 'clicking a disabled month keeps the popover open');
  t.expectEqual(await value('limited'), '2026-11', 'disabled month not picked');
  await typeInto('1/2026', { enter: false });
  t.expect((await err())?.includes('fuera del período'), 'typing a complete date outside the range says so before Enter');
  await t.eval(() => document.querySelector('[data-month-cell][tabindex="0"]').focus());
  await key('Home');
  await key('ArrowLeft');
  await key('ArrowLeft');
  await key('ArrowLeft');
  t.expectEqual(await activeCell(), '2026-6', 'Home then three Left moves');
  for (let i = 0; i < 6; i++) await key('ArrowLeft');
  t.expectEqual(await activeCell(), '2026-0', 'keys enter the disabled months instead of stopping at the min');
  t.expectEqual(await t.eval(() => document.activeElement.getAttribute('aria-disabled')), 'true', 'the focused cell says it is disabled');
  await t.press('Escape');
  await t.wait(500);

  // Outside click closes.
  await t.click(trigger(free));
  await t.waitFor('[role="dialog"]');
  await t.wait(400);
  await t.click('h1');
  await t.wait(500);
  t.expectEqual(await dialogs(), 0, 'outside click closes');

  // Rapid open and close on the trigger ends coherent.
  await t.click(trigger(free));
  await t.wait(40);
  await t.click(trigger(free));
  await t.wait(40);
  await t.click(trigger(free));
  await t.wait(800);
  t.expectEqual(await dialogs(), 1, 'open, close, open ends open');
  await t.press('Escape');
  await t.wait(500);

  // The sheet presentation (touch): the kit bottom sheet holds the same panel.
  await t.click(trigger(sheet));
  await t.waitFor('[role="dialog"]');
  await t.wait(700);
  t.expectEqual(await t.eval(() => !!document.querySelector('[role="dialog"] [data-handle]')), true, 'the panel opens inside the bottom sheet');
  t.expectEqual(await t.attr('[role="dialog"] button[aria-label="Cerrar"]', 'aria-label'), 'Cerrar', 'the sheet has its close button');
  t.expectEqual(await t.eval(() => document.querySelectorAll('[role="dialog"] [data-month-cell]').length), 12, 'the month grid is inside the sheet');
  t.expectEqual(await t.eval(() => document.activeElement?.hasAttribute('data-month-cell')), true, 'focus lands on the cursor month, not on the text field');
  await t.screenshot(`month-picker-sheet-${t.reducedMotion ? 'reduced' : 'motion'}`);
  await t.click(cell(2026, 8));
  await t.wait(900);
  t.expectEqual(await value('sheet'), '2026-8', 'picking in the sheet sets the value');
  t.expectEqual(await dialogs(), 0, 'picking closes the sheet');
  t.expectEqual(await t.eval(() => document.activeElement?.getAttribute('aria-haspopup')), 'dialog', 'focus returns to the trigger after the sheet');

  // English locale and disabled state.
  t.expect(((await t.text('body')) ?? '').includes('March 2026'), 'English month names come from the locale prop');
  t.expect(await t.eval(() => document.querySelector('button[aria-label="Elegir mes, Enero 2026"]').disabled), 'disabled picker has a disabled trigger');
  t.expectEqual(await t.attr(`${'[role="group"][aria-label="Período bloqueado"]'} button[aria-label="Mes anterior"]`, 'aria-disabled'), 'true', 'disabled picker disables the arrows');

  // ---------------------------------------------------------------------------------------------
  // Round 3: same panel as the date picker. Constant height between views, a sheet sized for a browser, no scroll lock.
  await t.eval(() => { window.scrollTo(0, 0); document.activeElement?.blur?.(); });
  await t.hover('h1');
  await t.click(trigger(free));
  await t.waitFor('[role="dialog"]');
  await t.wait(500);
  const mHeight = await t.eval(() => document.querySelector('[role="dialog"]').getBoundingClientRect().height);
  const mBottom = await t.eval(() => { const g = document.querySelector('[role="dialog"] [role="grid"]').getBoundingClientRect(); const b = [...document.querySelectorAll('[role="dialog"] button')].find((x) => x.textContent.trim() === 'Este mes').getBoundingClientRect(); return b.top - g.bottom; });
  t.expect(mBottom >= 0 && mBottom <= 16, `the month grid ends ${mBottom}px above the This month button (<= 16)`);
  await t.click('button[aria-label^="Cambiar año"]');
  await t.wait(500);
  t.expectEqual(await t.eval(() => document.querySelector('[role="dialog"]').getBoundingClientRect().height), mHeight, 'the year view keeps the panel height');
  const mScroll = () => t.eval(() => ({ y: window.scrollY, pop: document.querySelector('[data-radix-popper-content-wrapper]').getBoundingClientRect().top, locked: document.body.hasAttribute('data-scroll-locked') || getComputedStyle(document.body).overflow === 'hidden' }));
  const m0 = await mScroll();
  await wheel(t, 1150, 500, 100);
  await t.wait(400);
  const m1 = await mScroll();
  t.expect(m1.y >= 80 && !m0.locked, `the page scrolls with the wheel while the popover is open (scrollY ${m1.y})`);
  t.expect(Math.abs(m1.pop - m0.pop + m1.y) <= 2, 'the popover follows its trigger');
  t.expectEqual(await dialogs(), 1, 'scrolling does not close it');
  await t.press('Escape');
  await t.wait(500);
  await t.eval(() => window.scrollTo(0, 0));

  // The sheet on a desktop width and on a phone width.
  await t.click(trigger(sheet));
  await t.waitFor('[role="dialog"] [data-handle]');
  await t.wait(900);
  const sw = await t.eval(() => {
    const d = document.querySelector('[role="dialog"]').getBoundingClientRect();
    const g = document.querySelector('[role="dialog"] [role="grid"]').getBoundingClientRect();
    const c = document.querySelector('[role="dialog"] [data-month-cell]').getBoundingClientRect();
    return { dialog: d.width, grid: g.width, cellW: c.width, cellH: c.height };
  });
  t.expect(sw.dialog >= 480 && sw.dialog <= 520, `1280: the sheet is ${sw.dialog}px wide`);
  t.expect(sw.grid >= 420 && sw.grid <= 480, `1280: the month grid fills the sheet (${sw.grid}px)`);
  t.expect(sw.cellW >= 130 && sw.cellH >= 60, `1280: month cells are ${sw.cellW} x ${sw.cellH}px`);
  await t.click('[role="dialog"] button[aria-label="Cerrar"]');
  await t.wait(900);
  await t.raw.setViewport({ width: 390, height: 844 });
  await t.wait(300);
  await t.click(trigger(sheet));
  await t.waitFor('[role="dialog"] [data-handle]');
  await t.wait(900);
  const sp = await t.eval(() => ({ dialog: document.querySelector('[role="dialog"]').getBoundingClientRect().width, grid: document.querySelector('[role="dialog"] [role="grid"]').getBoundingClientRect().width, overflow: document.documentElement.scrollWidth - innerWidth }));
  t.expectEqual(sp.dialog, 390, '390: the sheet is full width');
  t.expect(sp.grid >= 330, `390: the month grid fills the sheet (${sp.grid}px)`);
  t.expectEqual(sp.overflow, 0, '390: no horizontal overflow');
  await t.screenshot(`month-picker-sheet-390-${t.reducedMotion ? 'reduced' : 'motion'}`);
  await t.click('[role="dialog"] button[aria-label="Cerrar"]');
  await t.wait(900);
  await t.raw.setViewport({ width: 1280, height: 800 });
  await t.wait(300);
}
