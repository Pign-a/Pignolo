// Date picker: typed input (es-AR), day grid APG keys, month and year grids, range, leap days, 1900 and 2100, sheet, form, reduced motion.
import { clickAt, geometry, keyWith, tap, wheel } from './_calendar.mjs';

export default async function (t) {
  const free = '[data-testid="dp-free"]';
  const limited = '[data-testid="dp-limited"]';
  const edge = '[data-testid="dp-edge"]';
  const sheet = '[data-testid="dp-sheet"]';
  const input = (root) => `${root} input[type="text"]`;
  const calBtn = (root) => `${root} button[aria-haspopup="dialog"]`;
  // The page shows YYYY-MM-DD (month 1 to 12); the expectations below use year-month index-day.
  const value = async (id) => {
    const s = await t.text(`[data-testid="${id}-value"]`);
    const m = /^(\d+)-(\d+)-(\d+)$/.exec(s ?? '');
    return m ? `${Number(m[1])}-${Number(m[2]) - 1}-${Number(m[3])}` : s;
  };
  const dayCell = (y, m, d) => `[data-day-cell][data-year="${y}"][data-month="${m}"][data-day="${d}"]`;
  const active = () => t.eval(() => {
    const a = document.activeElement;
    if (a?.hasAttribute('data-day-cell')) return `${a.dataset.year}-${a.dataset.month}-${a.dataset.day}`;
    if (a?.hasAttribute('data-month-cell')) return `m${a.dataset.year}-${a.dataset.month}`;
    if (a?.hasAttribute('data-year-cell')) return `y${a.dataset.year}`;
    return a?.tagName + ':' + (a?.getAttribute('aria-label') ?? '');
  });
  const key = async (k, mods = {}) => {
    if (k === 'PageUp' || k === 'PageDown') await t.eval(([name, m]) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...m })), [k, mods]);
    else await t.press(k);
    await t.wait(70);
  };
  const dialogs = () => t.count('[role="dialog"]');
  const open = async (root) => {
    await t.focus(calBtn(root));
    await t.press('Enter');
    await t.waitFor('[role="dialog"]');
    await t.wait(450);
  };
  const typeInto = async (root, text, { commit = 'Enter' } = {}) => {
    await t.eval((sel) => { const i = document.querySelector(sel); i.focus(); i.select(); }, input(root));
    await t.press('Backspace');
    await t.type(text);
    if (commit) await t.press(commit);
    await t.wait(150);
  };
  const err = (root) => t.eval((r) => document.querySelector(`${r} [aria-live="polite"] p:has(svg)`)?.textContent ?? null, root);
  const field = (root) => t.eval((r) => document.querySelector(`${r} input[type="text"]`).value, root);
  const hidden = () => t.eval(() => document.querySelector('[data-testid="dp-free"] input[name="fecha"]')?.value ?? null);

  // Semantics and the typed field.
  t.expectEqual(await t.eval(() => { const i = document.querySelector('[data-testid="dp-free"] input[type="text"]'); return [document.querySelector(`label[for="${i.id}"]`)?.textContent, i.placeholder, i.getAttribute('inputmode')]; }), ['Fecha del gasto', '', 'text'], 'the field has a real label, no placeholder, text input mode on a fine pointer');
  t.expect((await t.text(free)).includes('Formato dd/mm/aaaa, por ejemplo 05/03/2026'), 'the format is visible helper text');
  t.expectEqual(await field(free), '25/10/2026', 'the committed value is shown in es-AR order');
  t.expectEqual(await hidden(), '2026-10-25', 'a hidden input posts the ISO date');
  t.expectEqual(await t.attr(calBtn(free), 'aria-label'), 'Elegir fecha', 'the calendar button is named');

  // Typed formats commit (Enter) and the hidden input follows.
  const accepted = [
    ['5/3/26', '2026-2-5', '05/03/2026'],
    ['5-3-2026', '2026-2-5', '05/03/2026'],
    ['5 mar 2026', '2026-2-5', '05/03/2026'],
    ['5 de sept de 2026', '2026-8-5', '05/09/2026'],
    ['2026-03-06', '2026-2-6', '06/03/2026'],
    ['29/2/2024', '2024-1-29', '29/02/2024'],
    ['31/12/2100', '2100-11-31', '31/12/2100'],
    ['1/1/1900', '1900-0-1', '01/01/1900'],
    ['05032026', '2026-2-5', '05/03/2026'],
  ];
  for (const [text, want, shown] of accepted) {
    await typeInto(free, text);
    t.expectEqual(await value('free'), want, `"${text}" commits ${want}`);
    t.expectEqual(await field(free), shown, `"${text}" is shown as ${shown}`);
    t.expectEqual(await err(free), null, `"${text}" shows no error`);
  }
  t.expectEqual(await hidden(), '2026-03-05', 'the hidden input holds the last committed ISO date');
  await t.click('[data-testid="free-post"]');
  await t.wait(100);
  t.expectEqual(await t.text('[data-testid="free-hidden"]'), '{"fecha":"2026-03-05"}', 'the form posts the ISO date');

  // Errors never guess and never commit.
  const rejected = [
    ['31/4/2026', 'Ese día no existe en ese mes.'],
    ['29/2/2025', 'Ese día no existe en ese mes.'],
    ['29/2/1900', 'Ese día no existe en ese mes.'],
    ['29/2/2100', 'Ese día no existe en ese mes.'],
    ['5/13/2026', 'El mes va de 1 a 12'],
    ['5/3', 'Falta una parte de la fecha'],
    ['5/3/202', 'El año tiene 2 o 4 cifras.'],
    ['hola', 'No entendimos esa fecha'],
  ];
  const before = await value('free');
  for (const [text, msg] of rejected) {
    await typeInto(free, text);
    const e = await err(free);
    t.expect(typeof e === 'string' && e.includes(msg), `"${text}" shows "${msg}" (got ${JSON.stringify(e)})`);
    t.expectEqual(await value('free'), before, `"${text}" does not change the value`);
  }
  t.expectEqual(await t.eval(() => document.querySelector('[data-testid="dp-free"] input[type="text"]').getAttribute('aria-invalid')), 'true', 'the field is aria-invalid on error');
  t.expect((await t.text(`${free} [aria-live="polite"]`)).length > 0, 'the error is also in a live region');
  // Leaving the field commits a valid text, an empty field clears the value.
  await typeInto(free, '7/3/2026', { commit: 'Tab' });
  t.expectEqual(await value('free'), '2026-2-7', 'blur commits a valid date');
  t.expectEqual(await err(free), null, 'the error clears with a valid date');
  await typeInto(free, '', { commit: 'Tab' });
  t.expectEqual(await value('free'), 'ninguna', 'an empty field clears the value');
  t.expectEqual(await hidden(), null, 'no hidden input value when empty');
  await typeInto(free, '25/10/2026');

  // Open: focus on the selected day, one dialog, header buttons are named.
  await open(free);
  t.expectEqual(await t.attr(calBtn(free), 'aria-expanded'), 'true', 'the button reports expanded');
  t.expectEqual(await dialogs(), 1, 'exactly one dialog');
  t.expectEqual(await active(), '2026-9-25', 'focus on the selected day');
  t.expectEqual(await t.eval(() => document.activeElement.getAttribute('aria-label')), 'domingo, 25 de octubre de 2026', 'the focused day announces its full date');
  t.expectEqual(await t.eval(() => [...document.querySelectorAll('[role="columnheader"]')].map((c) => c.textContent).join(',')), 'Lun,Mar,Mié,Jue,Vie,Sáb,Dom', 'es-AR weeks start on Monday');
  t.expectEqual(await t.eval(() => document.querySelectorAll('[data-day-cell]').length), 31, 'October has 31 day cells');
  t.expectEqual(await t.eval(() => document.querySelector('[data-testid="year-text"]').closest('button').getAttribute('aria-label')), 'Cambiar año, 2026', 'the year button is named');
  t.expectEqual(await t.eval(() => document.querySelector('[data-testid="month-name"]').closest('button').getAttribute('aria-label')), 'Cambiar mes, Octubre', 'the month button is named');
  t.expectEqual(await t.eval(() => document.querySelector('[data-testid="panel-live"]').textContent), 'Octubre 2026', 'the month is in a live region');
  t.expectEqual(await t.eval(() => getComputedStyle(document.querySelector('[role="dialog"] > div')).getPropertyValue('--kit-cell').trim()), '40px', 'cells are 40 px on a fine pointer');
  t.expectEqual(await t.eval(() => document.querySelector('[data-day-cell]').getBoundingClientRect().height), 40, 'day cells are 40 px tall');
  const dayBody = await t.eval(() => document.querySelector('[role="dialog"]').getBoundingClientRect().height);
  await t.screenshot(`date-picker-open-${t.reducedMotion ? 'reduced' : 'motion'}`);

  // APG day keys.
  await key('ArrowRight');
  t.expectEqual(await active(), '2026-9-26', 'ArrowRight moves a day');
  await key('ArrowLeft');
  t.expectEqual(await active(), '2026-9-25', 'ArrowLeft moves back a day');
  await key('ArrowDown');
  t.expectEqual(await active(), '2026-10-1', 'ArrowDown moves a week and crosses into November');
  await t.wait(500);
  t.expectEqual(await t.eval(() => document.querySelector('[data-testid="panel-live"]').textContent), 'Noviembre 2026', 'the live region follows the month');
  await key('ArrowUp');
  t.expectEqual(await active(), '2026-9-25', 'ArrowUp moves a week back');
  await t.wait(500);
  await key('Home');
  t.expectEqual(await active(), '2026-9-19', 'Home goes to the start of the week (Monday 19 Oct)');
  await key('End');
  t.expectEqual(await active(), '2026-9-25', 'End goes to the end of the week (Sunday 25 Oct)');
  await key('PageDown');
  t.expectEqual(await active(), '2026-10-25', 'PageDown moves a month');
  await key('PageUp');
  await key('PageUp');
  t.expectEqual(await active(), '2026-8-25', 'PageUp moves a month back');
  await key('PageDown', { shiftKey: true });
  t.expectEqual(await active(), '2027-8-25', 'Shift+PageDown moves a year');
  await key('PageUp', { shiftKey: true });
  await key('PageUp', { shiftKey: true });
  t.expectEqual(await active(), '2025-8-25', 'Shift+PageUp moves a year back');
  await t.wait(500);
  t.expectEqual(await t.eval(() => document.querySelectorAll('[role="grid"]').length), 1, 'old grids are gone after the slides');

  // Rapid stepping: eight PageDown presses land on the right month with one grid left.
  for (let i = 0; i < 8; i++) {
    await t.eval(() => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true })));
    await t.wait(25);
  }
  await t.wait(800);
  t.expectEqual(await active(), '2026-4-25', 'rapid PageDown x8 from Sep 2025 lands on May 2026');
  t.expectEqual(await t.eval(() => document.querySelectorAll('[role="grid"]').length), 1, 'one grid after rapid stepping');

  // Month button: the month grid replaces the body, no popup in a popup, same height.
  await t.click('button[aria-label^="Cambiar mes"]');
  await t.wait(500);
  t.expectEqual(await dialogs(), 1, 'one dialog with the month grid');
  t.expectEqual(await t.eval(() => document.querySelectorAll('[data-month-cell]').length), 12, 'the month grid has 12 months');
  t.expectEqual(await t.eval(() => document.querySelectorAll('[data-day-cell]').length), 0, 'the day grid is gone');
  t.expectEqual(await t.eval(() => document.querySelector('[role="dialog"]').getBoundingClientRect().height), dayBody, 'the panel keeps its height between views');
  t.expectEqual(await active(), 'm2026-4', 'focus on the cursor month');
  t.expectEqual(await t.attr('button[aria-label^="Cambiar mes"]', 'aria-expanded'), 'true', 'the month button reports the open grid');
  await key('ArrowDown');
  t.expectEqual(await active(), 'm2026-7', 'month grid: ArrowDown moves 3 months');
  await t.click(`[data-month-cell][data-year="2026"][data-month="1"]`);
  await t.wait(600);
  t.expectEqual(await t.eval(() => document.querySelector('[data-testid="month-name"]').textContent), 'Febrero', 'picking a month returns to the day grid of that month');
  t.expectEqual(await t.eval(() => document.querySelectorAll('[data-day-cell]').length), 28, 'February 2026 has 28 day cells');
  t.expectEqual(await active(), '2026-1-25', 'focus on the cursor day in the new month');

  // Year button: decade grid, pick a far year, return to the day grid.
  await t.click('button[aria-label^="Cambiar año"]');
  await t.wait(500);
  t.expectEqual(await t.eval(() => document.querySelectorAll('[data-year-cell]').length), 12, 'the decade grid has 12 years');
  t.expectEqual(await t.eval(() => document.querySelector('[role="dialog"]').getBoundingClientRect().height), dayBody, 'the panel keeps its height in the year view');
  t.expectEqual(await t.eval(() => document.querySelector('[role="dialog"] span.font-semibold:not([aria-live])')?.textContent), '2020 - 2029', 'the header shows the decade');
  for (let i = 0; i < 3; i++) {
    await t.click('button[aria-label="Década anterior"]');
    await t.wait(250);
  }
  await t.wait(400);
  t.expectEqual(await t.eval(() => document.querySelector('[role="grid"]').getAttribute('aria-label')), '1990 - 1999', 'three decade arrows go back to the 1990s');
  await t.click('[data-year-cell][data-year="1999"]');
  await t.wait(600);
  t.expectEqual(await t.eval(() => document.querySelector('[data-testid="year-text"]').textContent), '1999', 'the picked year is in the header');
  t.expectEqual(await t.eval(() => document.querySelectorAll('[data-day-cell]').length), 28, 'February 1999 has 28 days');
  await key('Enter');
  t.expectEqual(await value('free'), '1999-1-25', 'Enter picks the focused day');
  await t.wait(600);
  t.expectEqual(await dialogs(), 0, 'picking closes the popover');
  t.expectEqual(await field(free), '25/02/1999', 'the field shows the picked day');
  t.expectEqual(await t.eval(() => document.activeElement?.getAttribute('aria-haspopup')), 'dialog', 'focus returns to the calendar button');
  t.expectEqual(await hidden(), '1999-02-25', 'the hidden input follows');

  // Far dates: 1900 and 2100 weekday names, leap and common years.
  await typeInto(free, '1/1/1900');
  await open(free);
  t.expectEqual(await t.eval(() => document.activeElement.getAttribute('aria-label')), 'lunes, 1 de enero de 1900', '1 January 1900 was a Monday');
  await t.press('Escape');
  await t.wait(500);
  await typeInto(free, '31/12/2100');
  await open(free);
  t.expectEqual(await t.eval(() => document.activeElement.getAttribute('aria-label')), 'viernes, 31 de diciembre de 2100', '31 December 2100 is a Friday');
  await key('ArrowRight');
  t.expectEqual(await active(), '2101-0-1', 'the day after 31 Dec 2100 is 1 Jan 2101');
  await t.press('Escape');
  await t.wait(500);
  await typeInto(free, '28/2/2100');
  await open(free);
  await key('ArrowRight');
  t.expectEqual(await active(), '2100-2-1', '2100 is not a leap year: 28 Feb is followed by 1 March');
  await t.press('Escape');
  await t.wait(500);
  await typeInto(free, '28/2/2000');
  await open(free);
  await key('ArrowRight');
  t.expectEqual(await active(), '2000-1-29', '2000 is a leap year: 29 Feb exists');
  t.expectEqual(await t.eval(() => document.querySelectorAll('[data-day-cell]').length), 29, 'February 2000 has 29 cells');
  await t.press('Escape');
  await t.wait(500);

  // Today.
  await t.eval(() => document.querySelector('[data-testid="dp-free"] input[type="text"]').blur());
  await open(free);
  const nowDay = await t.eval(() => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; });
  await t.click('text=Hoy');
  await t.wait(600);
  t.expectEqual(await value('free'), nowDay, 'the today button picks today');

  // Leap day and PageDown from the 31st (clamps to the last day of the month).
  await open(edge);
  t.expectEqual(await active(), '2024-0-31', 'the edge picker opens on 31 January 2024');
  await key('PageDown');
  t.expectEqual(await active(), '2024-1-29', 'PageDown from 31 Jan 2024 lands on 29 Feb (leap year)');
  await key('PageDown');
  t.expectEqual(await active(), '2024-2-29', 'the day stays 29 after a clamp');
  await key('PageUp');
  await key('PageUp');
  t.expectEqual(await active(), '2024-0-29', 'and goes back to 29 Jan');
  await key('PageDown');
  await key('PageDown', { shiftKey: true });
  t.expectEqual(await active(), '2025-1-28', 'Shift+PageDown from 29 Feb 2024 lands on 28 Feb 2025');
  await t.press('Escape');
  await t.wait(500);

  // Range: 10 March to 20 December 2026. Out of range days are aria-disabled but focusable.
  await typeInto(limited, '9/3/2026', { commit: null });
  t.expect(((await err(limited)) ?? '').includes('fuera del rango'), 'a complete date before the min says so while typing');
  await t.press('Enter');
  await t.wait(150);
  t.expectEqual(await value('limited'), 'ninguna', 'a date before the min is not committed');
  await typeInto(limited, '10/3/2026');
  t.expectEqual(await value('limited'), '2026-2-10', 'the min itself is allowed');
  await typeInto(limited, '21/12/2026');
  t.expectEqual(await value('limited'), '2026-2-10', 'a date after the max is not committed');
  await typeInto(limited, '20/12/2026');
  t.expectEqual(await value('limited'), '2026-11-20', 'the max itself is allowed');
  await typeInto(limited, '10/3/2026');
  await t.eval(() => document.querySelector('[data-testid="dp-limited"] input[type="text"]').blur());
  await open(limited);
  t.expectEqual(await active(), '2026-2-10', 'opens on the min day');
  await key('ArrowLeft');
  t.expectEqual(await active(), '2026-2-9', 'keys enter the disabled day');
  t.expectEqual(await t.eval(() => document.activeElement.getAttribute('aria-disabled')), 'true', 'the day before the min is aria-disabled');
  await key('Enter');
  t.expectEqual(await dialogs(), 1, 'Enter on a disabled day does nothing');
  t.expectEqual(await value('limited'), '2026-2-10', 'and does not change the value');
  await t.click(dayCell(2026, 2, 5));
  await t.wait(300);
  t.expectEqual(await dialogs(), 1, 'clicking a disabled day keeps the popover open');
  await key('PageUp');
  await t.wait(500);
  t.expectEqual(await t.eval(() => document.querySelector('[data-testid="month-name"]').textContent), 'Febrero', 'navigating to a fully disabled month is possible');
  t.expectEqual(await t.eval(() => [...document.querySelectorAll('[data-day-cell]')].every((c) => c.getAttribute('aria-disabled') === 'true')), true, 'every day of that month is disabled');
  t.expectEqual(await t.eval(() => document.querySelectorAll('[data-day-cell][tabindex="0"]').length), 1, 'the disabled month still has one tab stop');
  await t.press('Escape');
  await t.wait(500);
  t.expectEqual(await t.eval(() => document.activeElement?.getAttribute('aria-haspopup')), 'dialog', 'Esc returns focus to the calendar button');

  // English (US): month first, Sunday first.
  const enInput = 'section:has(h2) input[type="text"][value="03/05/2026"]';
  t.expect(await t.exists(enInput), 'en-US shows the value as mm/dd/yyyy');
  await t.eval(() => { const i = document.querySelector('input[type="text"][value="03/05/2026"]'); i.focus(); i.select(); });
  await t.press('Backspace');
  await t.type('13/1/2026');
  await t.press('Enter');
  await t.wait(150);
  t.expect((await t.text('body')).includes('We could not read that date.'), 'en-US reads the first number as the month: 13 is an error');
  await t.eval(() => document.querySelector('input[type="text"][aria-invalid="true"]').blur());

  // Required and disabled.
  t.expectEqual(await t.eval(() => { const i = [...document.querySelectorAll('input[type="text"]')].find((x) => document.querySelector(`label[for="${x.id}"]`)?.textContent.startsWith('Fecha requerida')); return [i.required, i.value]; }), [true, ''], 'a required date is marked required');
  t.expect(await t.eval(() => [...document.querySelectorAll('input[type="text"]')].some((i) => i.disabled)), 'a disabled picker disables its field');

  // The sheet presentation (touch): the kit bottom sheet holds the same panel.
  await t.click(calBtn(sheet));
  await t.waitFor('[role="dialog"]');
  await t.wait(700);
  t.expectEqual(await t.eval(() => !!document.querySelector('[role="dialog"] [data-handle]')), true, 'the calendar opens inside the bottom sheet');
  t.expectEqual(await t.eval(() => document.activeElement?.hasAttribute('data-day-cell')), true, 'focus lands on a day, not on a text field');
  await t.screenshot(`date-picker-sheet-${t.reducedMotion ? 'reduced' : 'motion'}`);
  const pick = await t.eval(() => { const d = new Date(); return [d.getFullYear(), d.getMonth()]; });
  await t.click(dayCell(pick[0], pick[1], 15));
  await t.wait(900);
  t.expectEqual(await value('sheet'), `${pick[0]}-${pick[1]}-15`, 'picking in the sheet sets the value');
  t.expectEqual(await dialogs(), 0, 'picking closes the sheet');
  t.expectEqual(await t.eval(() => document.activeElement?.getAttribute('aria-haspopup')), 'dialog', 'focus returns to the calendar button after the sheet');

  // ---------------------------------------------------------------------------------------------
  // Round 3 (author feedback): panel height and gap, whole-field hover and click, sheet size, scroll.
  const popoverSel = '[role="dialog"]';
  const resetPage = async () => {
    await t.eval(() => { window.scrollTo(0, 0); document.activeElement?.blur?.(); });
    await t.hover('h1');
    await t.wait(150);
  };
  await resetPage();

  // 1. No dead space: months with 4, 5 and 6 week rows keep one panel height and a small fixed gap to Today.
  const months = [['5/10/2026', 5, 'Oct 2026'], ['5/11/2026', 6, 'Nov 2026'], ['5/12/2026', 5, 'Dec 2026'], ['5/2/2027', 4, 'Feb 2027']];
  const heights = new Set();
  const gaps = new Set();
  for (const [text, realRows, name] of months) {
    await typeInto(free, text);
    await open(free);
    const g = await geometry(t, 'Hoy');
    t.expectEqual(g.realRows, realRows, `${name} has ${realRows} week rows with dates of its own`);
    t.expect(g.gap >= 0 && g.gap <= 16, `${name}: the gap between the last date row and Today is ${g.gap}px (<= 16)`);
    heights.add(Math.round(g.h));
    gaps.add(Math.round(g.gap));
    await t.press('Escape');
    await t.wait(500);
  }
  t.expectEqual(heights.size, 1, `the panel height is the same in months with 4, 5 and 6 rows (got ${[...heights]})`);
  t.expectEqual(gaps.size, 1, `the gap above Today is the same in every month (got ${[...gaps]})`);
  // Month and year views keep that height and that gap.
  await typeInto(free, '5/2/2027');
  await open(free);
  const dayGeo = await geometry(t, 'Hoy');
  await t.click('button[aria-label^="Cambiar mes"]');
  await t.wait(500);
  const monthGeo = await geometry(t, 'Hoy');
  await t.click('button[aria-label^="Cambiar año"]');
  await t.wait(500);
  const yearGeo = await geometry(t, 'Hoy');
  t.expectEqual([monthGeo.h, yearGeo.h], [dayGeo.h, dayGeo.h], 'the panel height is the same in the day, month and year views');
  t.expect(monthGeo.gap <= 16 && yearGeo.gap <= 16, `the month and year grids end ${monthGeo.gap}px and ${yearGeo.gap}px above Today (<= 16)`);
  t.expect(Math.abs(monthGeo.gridBottom - dayGeo.gridBottom) <= 1 && Math.abs(yearGeo.gridBottom - dayGeo.gridBottom) <= 1, 'the month and year grids end where the day grid ends');
  await t.press('Escape');
  await t.wait(500);

  // The days of the neighbour months fill the grid: muted, pickable, never a tab stop.
  await typeInto(free, '25/10/2026');
  await open(free);
  t.expectEqual(await t.eval(() => document.querySelectorAll('[data-outside-cell]').length), 42 - 31, 'October 2026 shows 11 days of the neighbour months');
  t.expectEqual(await t.eval(() => document.querySelectorAll('[data-outside-cell][tabindex="0"]').length), 0, 'a neighbour day is not a tab stop');
  t.expectEqual(await t.eval(() => document.querySelector('[data-outside-cell][data-month="10"][data-day="1"]').getAttribute('aria-label')), 'domingo, 1 de noviembre de 2026', 'a neighbour day announces its full date');
  await t.click('[data-outside-cell][data-month="10"][data-day="1"]');
  await t.wait(600);
  t.expectEqual(await value('free'), '2026-10-1', 'clicking a day of the next month picks it');
  t.expectEqual(await dialogs(), 0, 'and closes the popover');
  await typeInto(free, '25/10/2026');
  await resetPage();

  // 2. The field is one control for hover: the box and the calendar button share the hover state.
  const boxState = () => t.eval(() => { const b = document.querySelector('[data-testid="dp-free"] [data-field-box]'); const cs = getComputedStyle(b); return `${cs.borderTopColor}|${cs.backgroundColor}`; });
  const rest = await boxState();
  await t.hover(input(free));
  await t.wait(200);
  const overText = await boxState();
  await t.hover(calBtn(free));
  await t.wait(200);
  const overIcon = await boxState();
  const iconBg = await t.eval(() => getComputedStyle(document.querySelector('[data-testid="dp-free"] button[aria-haspopup="dialog"]')).backgroundColor);
  t.expect(rest.split('|')[0] !== overText.split('|')[0], 'hover darkens the box border');
  t.expect(rest.split('|')[1] !== overText.split('|')[1], 'hover washes the whole box, so the calendar button sits on the same tint as the text');
  t.expectEqual(overIcon, overText, 'hovering the calendar button gives the same box hover as hovering the text');
  t.expect(iconBg !== 'rgba(0, 0, 0, 0)', 'the calendar button also shows its own hover inside the washed box');
  const boxRect = await t.rect(`${free} [data-field-box]`);
  await t.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: boxRect.x + boxRect.width - 3, y: boxRect.cy, button: 'none' });
  await t.wait(200);
  t.expectEqual(await boxState(), overText, 'the right edge of the box (next to the button) hovers too');
  await resetPage();

  // 3. A click anywhere on the field opens the calendar; the caret stays and typing works while it is open.
  const activeTag = () => t.eval(() => document.activeElement?.tagName + (document.activeElement?.type ? ':' + document.activeElement.type : ''));
  await t.click(input(free));
  await t.wait(500);
  t.expectEqual(await dialogs(), 1, 'a click on the text opens the calendar');
  t.expectEqual(await activeTag(), 'INPUT:text', 'the caret stays in the input (the calendar did not take the focus)');
  const typedBefore = await field(free);
  await t.type('7');
  t.expectEqual((await field(free)).length, typedBefore.length + 1, 'typing works while the calendar is open');
  t.expectEqual(await dialogs(), 1, 'the calendar stays open while typing');
  await t.press('Escape');
  await t.wait(500);
  t.expectEqual(await dialogs(), 0, 'Esc closes the calendar');
  t.expectEqual(await activeTag(), 'INPUT:text', 'Esc leaves the focus in the input it was opened from');
  await typeInto(free, '25/10/2026');
  await resetPage();
  // On the label side and on the edge of the box next to the button.
  await clickAt(t, boxRect.x + 6, boxRect.y + 6);
  await t.wait(500);
  t.expectEqual(await dialogs(), 1, 'a click on the label area opens the calendar');
  await t.press('Escape');
  await t.wait(500);
  await resetPage();
  await clickAt(t, boxRect.x + boxRect.width - 3, boxRect.cy);
  await t.wait(500);
  t.expectEqual(await dialogs(), 1, 'a click on the edge of the box next to the button opens the calendar');
  // Clicking the field again keeps it open; clicking elsewhere closes it.
  await t.click(input(free));
  await t.wait(300);
  t.expectEqual(await dialogs(), 1, 'a second click on the field does not close or reopen it');
  await t.click('h1');
  await t.wait(500);
  t.expectEqual(await dialogs(), 0, 'a click outside closes it');
  // The helper text under the field is not part of the control.
  await clickAt(t, boxRect.x + 20, boxRect.y + boxRect.height + 14);
  await t.wait(400);
  t.expectEqual(await dialogs(), 0, 'a click on the helper text does not open the calendar');
  await resetPage();
  // The calendar button toggles and puts the focus on the day.
  await t.click(calBtn(free));
  await t.wait(500);
  t.expectEqual(await dialogs(), 1, 'the calendar button opens it');
  t.expectEqual(await active(), '2026-9-25', 'opened from the button, the focus is on the selected day');
  await t.click(calBtn(free));
  await t.wait(500);
  t.expectEqual(await dialogs(), 0, 'the button closes it again');
  await resetPage();
  // Keyboard: ArrowDown and Alt+ArrowDown on the focused input.
  await t.focus(input(free));
  await t.press('ArrowDown');
  await t.waitFor(popoverSel);
  await t.wait(500);
  t.expectEqual(await active(), '2026-9-25', 'ArrowDown on the focused input opens the calendar and moves into the grid');
  await t.press('Escape');
  await t.wait(500);
  t.expectEqual(await activeTag(), 'INPUT:text', 'Esc returns the focus to the input');
  await keyWith(t, 'ArrowDown', 1);
  await t.waitFor(popoverSel);
  await t.wait(500);
  t.expectEqual(await dialogs(), 1, 'Alt+ArrowDown opens the calendar');
  await t.press('Escape');
  await t.wait(500);
  // Open by a click (the focus stays in the input), then ArrowDown goes into the grid.
  await t.click(input(free));
  await t.wait(500);
  t.expectEqual(await activeTag(), 'INPUT:text', 'still in the input after the click');
  await t.press('ArrowDown');
  await t.wait(200);
  t.expectEqual(await active(), '2026-9-25', 'ArrowDown with the calendar open moves the focus into the grid');
  await t.press('Escape');
  await t.wait(500);
  t.expectEqual(await t.eval(() => document.activeElement?.tagName), 'INPUT', 'Esc from the grid returns the focus to the input that opened it');
  // Typing a full date and pressing Enter commits it, moves the calendar and closes.
  await t.click(input(free));
  await t.wait(400);
  await t.eval((sel) => { const i = document.querySelector(sel); i.select(); }, input(free));
  await t.press('Backspace');
  await t.type('8/3/2027');
  await t.wait(200);
  await t.press('Enter');
  await t.wait(600);
  t.expectEqual(await value('free'), '2027-2-8', 'Enter in the input commits the typed date');
  t.expectEqual(await dialogs(), 0, 'and closes the calendar');
  await typeInto(free, '25/10/2026');
  await resetPage();

  // 4. Scroll: the popover is non-modal (the wheel scrolls the page) and follows its field.
  await t.click(input(free));
  await t.wait(500);
  const scrollInfo = () => t.eval(() => {
    const w = document.querySelector('[data-radix-popper-content-wrapper]');
    const f = document.querySelector('[data-testid="dp-free"] [data-field-box]');
    return { y: window.scrollY, max: document.documentElement.scrollHeight - innerHeight, pop: w.getBoundingClientRect().top, field: f.getBoundingClientRect().top, vis: getComputedStyle(w).visibility, locked: document.body.hasAttribute('data-scroll-locked') || getComputedStyle(document.body).overflow === 'hidden' };
  });
  const s0 = await scrollInfo();
  t.expect(s0.max > 400, `the page is tall enough to scroll (${s0.max}px)`);
  t.expectEqual(s0.locked, false, 'the popover does not lock the page scroll');
  await wheel(t, 1100, 500, 120);
  await t.wait(400);
  const s1 = await scrollInfo();
  t.expect(s1.y >= 100, `the wheel scrolls the page while the popover is open (scrollY ${s1.y})`);
  t.expect(Math.abs(s1.pop - s0.pop + s1.y) <= 2, `the popover follows the field (moved ${s0.pop - s1.pop}px for a ${s1.y}px scroll)`);
  t.expectEqual(await dialogs(), 1, 'scrolling does not close the popover');
  await wheel(t, 1100, 500, 600);
  await t.wait(400);
  const s2 = await scrollInfo();
  t.expect(s2.field < -60, `the field scrolled out of view (${s2.field}px)`);
  t.expectEqual(s2.vis, 'hidden', 'the popover hides when its field is out of the viewport');
  await wheel(t, 1100, 500, -2000);
  await t.wait(400);
  t.expectEqual((await scrollInfo()).vis, 'visible', 'and comes back with the field');
  await t.press('Escape');
  await t.wait(500);
  await resetPage();

  // The sheet is a dialog: it locks the page scroll (the only presentation that does).
  await t.click(calBtn(sheet));
  await t.waitFor(popoverSel);
  await t.wait(800);
  const y0 = await t.eval(() => window.scrollY);
  await wheel(t, 60, 400, 200);
  await t.wait(300);
  t.expectEqual(await t.eval(() => window.scrollY), y0, 'the sheet locks the page scroll behind it');
  await t.click('[role="dialog"] button[aria-label="Cerrar"]');
  await t.wait(900);

  // 5. The sheet on a desktop width: sized for a browser, not a 280 px strip on a 560 px sheet.
  await t.click(calBtn(sheet));
  await t.waitFor(popoverSel);
  await t.wait(900);
  const wide = await t.eval(() => {
    const d = document.querySelector('[role="dialog"]').getBoundingClientRect();
    const p = document.querySelector('[role="dialog"] [data-view-slide] [role="grid"]').getBoundingClientRect();
    const c = document.querySelector('[role="dialog"] [data-day-cell]').getBoundingClientRect();
    return { dialog: d.width, panel: p.width, cellW: c.width, cellH: c.height, centered: Math.abs((d.left + d.right) / 2 - innerWidth / 2) < 1, text: getComputedStyle(document.querySelector('[role="dialog"] [data-day-cell]')).fontSize };
  });
  t.expect(wide.dialog >= 480 && wide.dialog <= 520, `1280: the sheet is ${wide.dialog}px wide (480 to 520)`);
  t.expect(wide.panel >= 420 && wide.panel <= 480, `1280: the calendar fills the sheet, ${wide.panel}px wide (420 to 480)`);
  t.expect(wide.cellW >= 56 && wide.cellH >= 48, `1280: cells are ${wide.cellW} x ${wide.cellH}px (bigger than the 40 px of the popover)`);
  t.expectEqual(wide.centered, true, '1280: the sheet is centered');
  t.expectEqual(wide.text, '16px', '1280: the day numbers are 16px in the sheet');
  await t.screenshot(`date-picker-sheet-1280-${t.reducedMotion ? 'reduced' : 'motion'}`);
  await t.click('[role="dialog"] button[aria-label="Cerrar"]');
  await t.wait(900);
  await t.raw.setViewport({ width: 390, height: 844 });
  await t.wait(300);
  await t.click(calBtn(sheet));
  await t.waitFor(popoverSel);
  await t.wait(900);
  const narrow = await t.eval(() => {
    const d = document.querySelector('[role="dialog"]').getBoundingClientRect();
    const p = document.querySelector('[role="dialog"] [data-view-slide] [role="grid"]').getBoundingClientRect();
    const c = document.querySelector('[role="dialog"] [data-day-cell]').getBoundingClientRect();
    return { dialog: d.width, panel: p.width, cellH: c.height, overflow: document.documentElement.scrollWidth - innerWidth };
  });
  t.expectEqual(narrow.dialog, 390, '390: the sheet is full width');
  t.expect(narrow.panel >= 330, `390: the calendar fills the sheet, ${narrow.panel}px wide`);
  t.expect(narrow.cellH >= 44, `390: cells are ${narrow.cellH}px tall (touch target)`);
  t.expectEqual(narrow.overflow, 0, '390: no horizontal overflow');
  await t.screenshot(`date-picker-sheet-390-${t.reducedMotion ? 'reduced' : 'motion'}`);
  await t.click('[role="dialog"] button[aria-label="Cerrar"]');
  await t.wait(900);
  await t.raw.setViewport({ width: 1280, height: 800 });
  await t.wait(300);

  // 6. On touch (coarse pointer, auto presentation) a tap on the field opens the sheet and does not raise the keyboard.
  await t.coarse(true);
  await t.wait(300);
  await t.eval(() => { window.scrollTo(0, 0); document.activeElement?.blur?.(); });
  await tap(t, input(free));
  await t.waitFor('[role="dialog"] [data-handle]');
  await t.wait(900);
  t.expectEqual(await t.eval(() => document.activeElement?.tagName), 'BUTTON', 'a tap on the field opens the sheet and the focus is on a day, not on the input');
  t.expectEqual(await t.eval(() => document.querySelectorAll('[role="dialog"] input[type="text"]').length), 1, 'the sheet has its own typed field for typing on touch');
  await tap(t, '[role="dialog"] button[aria-label="Cerrar"]');
  await t.wait(900);
  await t.coarse(false);
  await t.wait(300);
}
