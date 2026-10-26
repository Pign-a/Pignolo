// Date range picker: start then end, the band and its caps across week rows, hover preview, month navigation while
// selecting, min and max, minimum nights, two typed fields, keyboard, hidden inputs, forced colors, sheet, scroll.
import { clickAt, geometry, keyWith, tap, wheel } from './_calendar.mjs';

export default async function (t) {
  const free = '[data-testid="rp-free"]';
  const stay = '[data-testid="rp-stay"]';
  const one = '[data-testid="rp-one"]';
  const sheet = '[data-testid="rp-sheet"]';
  const en = '[data-testid="rp-en"]';
  const inputs = (root) => `${root} input[type="text"]`;
  const calBtn = (root) => `${root} button[aria-haspopup="dialog"]`;
  const dialogs = () => t.count('[role="dialog"]');
  const dayCell = (y, m, d) => `[data-day-cell][data-year="${y}"][data-month="${m}"][data-day="${d}"]`;
  const rangeOf = (y, m, d) => t.eval(([yy, mm, dd]) => document.querySelector(`[data-day-cell][data-year="${yy}"][data-month="${mm}"][data-day="${dd}"]`)?.getAttribute('data-range') ?? null, [y, m, d]);
  const rangeCount = (kind) => t.eval((k) => document.querySelectorAll(`[role="dialog"] [data-range="${k}"]`).length, kind);
  // The page shows "year-month index-day" for both ends, "-" for none.
  const value = (id) => t.text(`[data-testid="${id}-value"]`);
  const fieldValue = (root, i) => t.eval(([r, n]) => document.querySelectorAll(`${r} input[type="text"]`)[n].value, [root, i]);
  const active = () => t.eval(() => {
    const a = document.activeElement;
    return a?.hasAttribute('data-day-cell') ? `${a.dataset.year}-${a.dataset.month}-${a.dataset.day}` : a?.tagName + ':' + (a?.getAttribute('aria-label') ?? '');
  });
  const rest = async () => {
    await t.eval(() => { window.scrollTo(0, 0); document.activeElement?.blur?.(); });
    await t.hover('h1');
    await t.wait(150);
  };
  const typeInto = async (root, i, text, { commit = 'Enter' } = {}) => {
    await t.eval(([r, n]) => { const el = document.querySelectorAll(`${r} input[type="text"]`)[n]; el.focus(); el.select(); }, [root, i]);
    await t.press('Backspace');
    await t.type(text);
    if (commit) await t.press(commit);
    await t.wait(150);
  };
  const fieldError = (root, i) => t.eval(([r, n]) => {
    const input = document.querySelectorAll(`${r} input[type="text"]`)[n];
    const box = document.getElementById(input.getAttribute('aria-describedby'));
    return box?.querySelector('p:has(svg)')?.textContent ?? null;
  }, [root, i]);
  const openByIcon = async (root) => {
    await t.focus(calBtn(root));
    await t.press('Enter');
    await t.waitFor('[role="dialog"]');
    await t.wait(450);
  };
  const close = async () => {
    await t.press('Escape');
    await t.wait(500);
  };

  // ---------------------------------------------------------------------------------------------
  // Semantics, names and the form.
  t.expectEqual(await t.attr(`${free} [role="group"]`, 'aria-label'), 'Período del gasto', 'the two fields form a named group');
  t.expectEqual(await t.eval((r) => [...document.querySelectorAll(`${r} input[type="text"]`)].map((i) => document.querySelector(`label[for="${i.id}"]`)?.textContent), free), ['Fecha de inicio', 'Fecha de fin'], 'the fields are named start date and end date');
  t.expectEqual(await t.eval((r) => [...document.querySelectorAll(`${r} input[type="text"]`)].map((i) => i.placeholder), free), ['', ''], 'no placeholders');
  t.expect((await t.text(free)).includes('Formato dd/mm/aaaa, por ejemplo 05/03/2026'), 'the format is visible helper text');
  t.expectEqual([await fieldValue(free, 0), await fieldValue(free, 1)], ['20/10/2026', '27/10/2026'], 'both ends are shown in es-AR order');
  t.expectEqual(await t.eval(() => [document.querySelector('[data-testid="rp-free"] input[name="periodo-start"]')?.value, document.querySelector('[data-testid="rp-free"] input[name="periodo-end"]')?.value]), ['2026-10-20', '2026-10-27'], 'hidden inputs name-start and name-end post ISO dates');
  await t.click('[data-testid="free-post"]');
  await t.wait(100);
  t.expectEqual(await t.text('[data-testid="free-hidden"]'), '{"periodo-start":"2026-10-20","periodo-end":"2026-10-27"}', 'the form posts both ISO dates');
  t.expectEqual(await t.eval((r) => document.querySelectorAll(`${r} button[aria-haspopup="dialog"]`).length, free), 1, 'one calendar button, inside the end field');
  t.expectEqual(await t.eval((r) => document.querySelector(`${r} button[aria-haspopup="dialog"]`).closest('[data-field-box]').querySelector('input').id === document.querySelectorAll(`${r} input[type="text"]`)[1].id, free), true, 'the calendar button sits inside the end field box');
  t.expectEqual(await t.eval(() => [...document.querySelectorAll('[data-testid="rp-en"] input[type="text"]')].map((i) => document.querySelector(`label[for="${i.id}"]`).textContent)), ['Start date', 'End date'], 'the english labels come from props');
  t.expectEqual(await t.eval(() => [...document.querySelectorAll('input[type="text"]')].filter((i) => i.disabled).length), 2, 'a disabled range disables both fields');

  // ---------------------------------------------------------------------------------------------
  // Opening: a click anywhere on either field, the keyboard, the button. Two months side by side at 1280.
  await rest();
  await t.click(inputs(free));
  await t.wait(500);
  t.expectEqual(await dialogs(), 1, 'a click on the start field opens the calendar');
  t.expectEqual(await t.eval(() => document.activeElement?.tagName), 'INPUT', 'the caret stays in the start input');
  t.expectEqual(await t.attr('[role="dialog"] > div', 'data-months'), '2', 'two months side by side at 1280');
  t.expectEqual(await t.eval(() => document.querySelectorAll('[role="dialog"] [role="grid"]').length), 2, 'two month grids');
  t.expectEqual(await t.eval(() => [...document.querySelectorAll('[role="dialog"] [role="grid"]')].map((g) => g.getAttribute('aria-label'))), ['Octubre 2026', 'Noviembre 2026'], 'the grids are October and November 2026');
  t.expectEqual(await t.eval(() => document.querySelectorAll('[role="dialog"] [data-outside-cell]').length), 0, 'no neighbour days when two months are side by side (no duplicates)');
  const twin = await t.eval(() => { const g = [...document.querySelectorAll('[role="dialog"] [role="grid"]')].map((x) => x.getBoundingClientRect()); const d = document.querySelector('[role="dialog"]').getBoundingClientRect(); return { w0: g[0].width, w1: g[1].width, gap: g[1].left - g[0].right, dialog: d.width, inView: d.right <= innerWidth && d.left >= 0 }; });
  t.expect(Math.abs(twin.w0 - 280) <= 1 && Math.abs(twin.w1 - 280) <= 1, `each month is 7 cells of 40px (${twin.w0}, ${twin.w1})`);
  t.expect(twin.gap >= 16 && twin.gap <= 32, `a gap separates the months (${twin.gap}px)`);
  t.expectEqual(twin.inView, true, 'the two month popover fits the viewport');
  await t.screenshot(`date-range-open-${t.reducedMotion ? 'reduced' : 'motion'}`);
  await close();
  t.expectEqual(await t.eval(() => document.activeElement === document.querySelectorAll('[data-testid="rp-free"] input[type="text"]')[0]), true, 'Esc returns the focus to the start input');
  await rest();
  await t.eval(() => document.querySelectorAll('[data-testid="rp-free"] input[type="text"]')[1].focus());
  await t.press('ArrowDown');
  await t.waitFor('[role="dialog"]');
  await t.wait(450);
  t.expectEqual(await active(), '2026-9-27', 'ArrowDown on the end input opens the calendar on its day and moves into the grid');
  await close();
  t.expectEqual(await t.eval(() => document.activeElement === document.querySelectorAll('[data-testid="rp-free"] input[type="text"]')[1]), true, 'Esc returns the focus to the end input');
  await rest();
  await t.eval(() => document.querySelectorAll('[data-testid="rp-free"] input[type="text"]')[0].focus());
  await keyWith(t, 'ArrowDown', 1);
  await t.waitFor('[role="dialog"]');
  await t.wait(450);
  t.expectEqual(await dialogs(), 1, 'Alt+ArrowDown opens the calendar');
  await close();
  await rest();
  await t.click(calBtn(free));
  await t.wait(500);
  t.expectEqual(await active(), '2026-9-27', 'the button opens it with the focus on the end day');
  await close();
  t.expectEqual(await t.eval(() => document.activeElement?.getAttribute('aria-haspopup')), 'dialog', 'opened from the button, Esc returns the focus to the button');

  // The band of a complete range: solid ends, a continuous band, rounded caps at the week edges.
  await rest();
  await openByIcon(free);
  t.expectEqual([await rangeOf(2026, 9, 20), await rangeOf(2026, 9, 27)], ['start', 'end'], '20 and 27 October are the ends');
  t.expectEqual(await t.eval(() => [...document.querySelectorAll('[role="dialog"] [data-range="in"]')].map((b) => b.dataset.day).join(',')), '21,22,23,24,25,26', 'the days between are in the band');
  t.expectEqual(await rangeCount('preview-end'), 0, 'no preview when the range is complete');
  const look = await t.eval(() => {
    const q = (d) => document.querySelector(`[data-day-cell][data-month="9"][data-day="${d}"]`);
    const cs = (e) => getComputedStyle(e);
    const root = getComputedStyle(document.documentElement);
    const band = cs(q(22).parentElement);
    return {
      bandBg: band.backgroundColor,
      containerToken: (() => { const p = document.createElement('i'); p.style.backgroundColor = root.getPropertyValue('--color-primary-container'); document.body.appendChild(p); const c = getComputedStyle(p).backgroundColor; p.remove(); return c; })(),
      primaryToken: (() => { const p = document.createElement('i'); p.style.backgroundColor = root.getPropertyValue('--color-primary'); document.body.appendChild(p); const c = getComputedStyle(p).backgroundColor; p.remove(); return c; })(),
      startBg: cs(q(20)).backgroundColor,
      endBg: cs(q(27)).backgroundColor,
      plainBg: cs(q(1).parentElement).backgroundColor,
      // Oct 20 2026 is a Tuesday, 27 the next Tuesday: the band wraps at Sunday 25 and Monday 26.
      sunday: { r: cs(q(25).parentElement).borderTopRightRadius, l: cs(q(25).parentElement).borderTopLeftRadius },
      monday: { l: cs(q(26).parentElement).borderTopLeftRadius, r: cs(q(26).parentElement).borderTopRightRadius },
      midday: cs(q(23).parentElement).borderTopLeftRadius,
      startR: cs(q(20)).borderTopRightRadius, startL: cs(q(20)).borderTopLeftRadius,
      endL: cs(q(27)).borderTopLeftRadius, endR: cs(q(27)).borderTopRightRadius,
      sundayRow: q(25).closest('[role="row"]') === q(24).closest('[role="row"]') && q(26).closest('[role="row"]') !== q(25).closest('[role="row"]'),
    };
  });
  t.expectEqual(look.bandBg, look.containerToken, 'the band uses the primary-container token');
  t.expectEqual([look.startBg, look.endBg], [look.primaryToken, look.primaryToken], 'the ends use the primary token');
  t.expect(look.plainBg === 'rgba(0, 0, 0, 0)', 'days outside the range have no band');
  t.expectEqual(look.sundayRow, true, 'the range wraps from Sunday 25 to Monday 26 across two week rows');
  t.expect(parseFloat(look.sunday.r) > 0 && parseFloat(look.sunday.l) === 0, 'the band ends with a rounded cap at the end of the week row');
  t.expect(parseFloat(look.monday.l) > 0 && parseFloat(look.monday.r) === 0, 'and starts again with a rounded cap at the start of the next row');
  t.expectEqual(parseFloat(look.midday), 0, 'a day in the middle of a row has square edges (continuous band)');
  t.expect(parseFloat(look.startL) > 0 && parseFloat(look.startR) === 0, 'the start has a rounded outer cap and a flat side toward the band');
  t.expect(parseFloat(look.endR) > 0 && parseFloat(look.endL) === 0, 'the end has a rounded outer cap and a flat side toward the band');
  // No gap between neighbours in a row: the band is continuous.
  t.expectEqual(await t.eval(() => { const c = [21, 22, 23, 24].map((d) => document.querySelector(`[data-day-cell][data-month="9"][data-day="${d}"]`).parentElement.getBoundingClientRect()); return c.slice(1).map((r, i) => Math.round(r.left - c[i].right)); }), [0, 0, 0], 'no seam between the cells of the band');
  t.expectEqual(await t.eval(() => document.querySelector('[data-testid="range-summary"]').textContent), '7 noches', 'the footer says how long the range is');
  t.expectEqual(await t.eval(() => document.querySelector('[data-day-cell][data-month="9"][data-day="20"]').getAttribute('aria-label')), 'martes, 20 de octubre de 2026, fecha de inicio', 'the start cell says it is the start');
  t.expectEqual(await t.eval(() => document.querySelector('[data-day-cell][data-month="9"][data-day="27"]').getAttribute('aria-label')), 'martes, 27 de octubre de 2026, fecha de fin', 'the end cell says it is the end');
  await t.screenshot(`date-range-band-${t.reducedMotion ? 'reduced' : 'motion'}`);

  // Clicking a day starts a new range (start only); the hover previews the band before the second pick.
  await t.click(dayCell(2026, 9, 6));
  await t.wait(200);
  t.expectEqual(await dialogs(), 1, 'the first click does not close the calendar');
  t.expectEqual(await value('free'), '2026-9-6 / -', 'the first click sets the start and clears the end');
  t.expectEqual([await fieldValue(free, 0), await fieldValue(free, 1)], ['06/10/2026', ''], 'the fields follow: new start, empty end');
  t.expectEqual(await rangeCount('start'), 1, 'one start cell');
  t.expectEqual(await rangeCount('in'), 0, 'no band yet');
  await t.hover(dayCell(2026, 9, 14));
  t.expectEqual(await t.eval(() => [...document.querySelectorAll('[role="dialog"] [data-range="in"]')].map((b) => b.dataset.day).join(',')), '7,8,9,10,11,12,13', 'hovering 14 October previews the band from the 7th to the 13th');
  t.expectEqual(await rangeOf(2026, 9, 14), 'preview-end', 'the hovered day is the preview end');
  const pv = await t.eval(() => { const q = (d) => document.querySelector(`[data-day-cell][data-month="9"][data-day="${d}"]`); return { band: getComputedStyle(q(10).parentElement).backgroundColor, pe: getComputedStyle(q(14)).backgroundColor, peBorder: getComputedStyle(q(14)).borderTopColor, startBg: getComputedStyle(q(6)).backgroundColor }; });
  t.expect(pv.band !== 'rgba(0, 0, 0, 0)' && pv.pe !== pv.startBg, 'the preview band is lighter than the solid ends');
  t.expectEqual(await value('free'), '2026-9-6 / -', 'previewing does not change the value');
  await t.hover(dayCell(2026, 9, 18));
  t.expectEqual(await rangeOf(2026, 9, 17), 'in', 'the preview follows the pointer');
  t.expectEqual(await rangeOf(2026, 9, 14), 'in', 'the old preview end is now inside the band');
  await t.hover(dayCell(2026, 9, 3));
  t.expectEqual(await rangeCount('in'), 0, 'hovering a day before the start shows no band');
  t.expectEqual(await rangeCount('preview-end'), 0, 'and no preview end');
  await t.screenshot(`date-range-preview-${t.reducedMotion ? 'reduced' : 'motion'}`);
  // A click before the start moves the start.
  await t.click(dayCell(2026, 9, 3));
  await t.wait(200);
  t.expectEqual(await value('free'), '2026-9-3 / -', 'a click before the start moves the start');
  // Month navigation while selecting: the start stays, the band reaches into the next months.
  await t.click('button[aria-label="Mes siguiente"]');
  await t.wait(600);
  t.expectEqual(await t.eval(() => [...document.querySelectorAll('[role="dialog"] [role="grid"]')].map((g) => g.getAttribute('aria-label'))), ['Noviembre 2026', 'Diciembre 2026'], 'the arrow moves both months by one');
  await t.hover(dayCell(2026, 10, 5));
  t.expectEqual(await rangeOf(2026, 10, 1), 'in', 'the band covers days of a month after the start');
  t.expectEqual(await rangeOf(2026, 10, 5), 'preview-end', 'the preview end is in the next month');
  t.expectEqual(await value('free'), '2026-9-3 / -', 'navigating keeps the start');
  // A week row wraps: the preview band is continuous across the rows of November.
  t.expectEqual(await t.eval(() => [...document.querySelectorAll('[role="dialog"] [data-range="in"]')].length), 4, 'four days of November are in the band');
  await t.click(dayCell(2026, 10, 9));
  await t.wait(600);
  t.expectEqual(await dialogs(), 0, 'the second click closes the calendar');
  t.expectEqual(await value('free'), '2026-9-3 / 2026-10-9', 'the second click sets the end');
  t.expectEqual([await fieldValue(free, 0), await fieldValue(free, 1)], ['03/10/2026', '09/11/2026'], 'the fields show both ends');
  t.expectEqual(await t.eval(() => [document.querySelector('[data-testid="rp-free"] input[name="periodo-start"]')?.value, document.querySelector('[data-testid="rp-free"] input[name="periodo-end"]')?.value]), ['2026-10-03', '2026-11-09'], 'the hidden inputs follow');
  await rest();

  // Clear.
  await openByIcon(free);
  t.expectEqual(await t.eval(() => document.querySelector('[data-testid="range-summary"]').textContent), '37 noches', 'the footer counts the nights');
  await t.click('[data-testid="range-clear"]');
  await t.wait(200);
  t.expectEqual(await value('free'), '- / -', 'Clear empties both ends');
  t.expectEqual(await t.eval(() => document.querySelectorAll('[data-testid="rp-free"] input[type="hidden"]').length), 0, 'and the hidden inputs');
  t.expectEqual(await t.eval(() => document.querySelector('[data-testid="range-clear"]').getAttribute('aria-disabled')), 'true', 'Clear is disabled when there is nothing to clear');
  await close();

  // ---------------------------------------------------------------------------------------------
  // Keyboard: arrows, Enter sets the start and then the end, Esc cancels.
  await rest();
  await typeInto(free, 0, '20/10/2026');
  await typeInto(free, 1, '27/10/2026');
  await openByIcon(free);
  await t.press('ArrowRight');
  await t.wait(70);
  await t.press('ArrowRight');
  await t.wait(70);
  t.expectEqual(await active(), '2026-9-29', 'arrows move through the grid');
  await t.press('Enter');
  await t.wait(150);
  t.expectEqual(await value('free'), '2026-9-29 / -', 'Enter on a day sets the start');
  await t.press('ArrowRight');
  await t.wait(70);
  t.expectEqual(await rangeOf(2026, 9, 30), 'preview-end', 'the focused day previews the band for a keyboard user');
  await t.press('ArrowDown');
  await t.wait(70);
  await t.press('Enter');
  await t.wait(700);
  t.expectEqual(await value('free'), '2026-9-29 / 2026-10-6', 'Enter on a later day sets the end');
  t.expectEqual(await dialogs(), 0, 'and closes the calendar');
  t.expectEqual(await t.eval(() => document.activeElement?.getAttribute('aria-haspopup')), 'dialog', 'the focus returns to the calendar button');
  await rest();

  // ---------------------------------------------------------------------------------------------
  // Typing: both dates, the order rule, the formats of DatePicker.
  await typeInto(free, 0, '5/3/2026');
  t.expectEqual([await value('free'), await fieldValue(free, 0)], ['2026-2-5 / 2026-10-6', '05/03/2026'], 'a typed start before the end commits and keeps the end');
  await typeInto(free, 1, '3/3/2026');
  const orderErr = await fieldError(free, 1);
  t.expect((orderErr ?? '').includes('anterior a la de inicio'), `an end before the start shows the order error (${orderErr})`);
  t.expectEqual(await t.eval(() => document.querySelectorAll('[data-testid="rp-free"] input[type="text"]')[1].getAttribute('aria-invalid')), 'true', 'the end field is aria-invalid');
  t.expectEqual(await value('free'), '2026-2-5 / 2026-10-6', 'and it is not committed');
  await typeInto(free, 1, '7 mar 2026');
  t.expectEqual(await value('free'), '2026-2-5 / 2026-2-7', 'a typed end after the start commits');
  t.expectEqual(await fieldError(free, 1), null, 'the error clears');
  await typeInto(free, 0, '10-3-2026');
  t.expectEqual([await value('free'), await fieldValue(free, 1)], ['2026-2-10 / -', ''], 'a start after the end moves the end out');
  await typeInto(free, 1, '15-3-2026');
  t.expectEqual(await value('free'), '2026-2-10 / 2026-2-15', 'the other formats work in both fields');
  // Typing keeps working while the calendar is open, and the calendar follows the typed date.
  await rest();
  await t.click(inputs(free));
  await t.wait(500);
  t.expectEqual(await t.eval(() => document.querySelectorAll('[role="dialog"] [role="grid"]')[0].getAttribute('aria-label')), 'Marzo 2026', 'the calendar opens on March 2026');
  await t.eval(() => { const i = document.querySelectorAll('[data-testid="rp-free"] input[type="text"]')[0]; i.select(); });
  await t.press('Backspace');
  await t.type('4/5/2026');
  await t.press('Enter');
  await t.wait(500);
  t.expectEqual(await value('free'), '2026-4-4 / -', 'typing a start while the calendar is open commits it (the end was before it)');
  t.expectEqual(await t.eval(() => document.querySelectorAll('[role="dialog"] [role="grid"]')[0].getAttribute('aria-label')), 'Mayo 2026', 'and the open calendar moves to the typed date');
  await close();
  await rest();

  // Min and max, minimum nights.
  await rest();
  await typeInto(stay, 0, '9/11/2030');
  t.expect(((await fieldError(stay, 0)) ?? '').includes('fuera del rango'), 'a start before the min says it is out of range');
  await typeInto(stay, 0, '12/11/2030');
  t.expectEqual(await value('stay'), '2030-10-12 / -', 'the start inside the range commits');
  await typeInto(stay, 1, '13/11/2030');
  t.expect(((await fieldError(stay, 1)) ?? '').includes('estadía mínima'), 'an end closer than the minimum nights shows that error');
  await typeInto(stay, 1, '21/2/2031');
  t.expect(((await fieldError(stay, 1)) ?? '').includes('fuera del rango'), 'an end after the max says it is out of range');
  await typeInto(stay, 1, '14/11/2030');
  t.expectEqual(await value('stay'), '2030-10-12 / 2030-10-14', 'the minimum itself is allowed');
  await rest();
  // In the calendar: out of range days and days that are too close are disabled but focusable.
  await typeInto(stay, 0, '');
  t.expectEqual(await value('stay'), '- / -', 'an empty start field clears the range');
  await t.click(calBtn(stay));
  await t.wait(500);
  t.expectEqual(await t.eval(() => [...document.querySelectorAll('[role="dialog"] [role="grid"]')].map((g) => g.getAttribute('aria-label'))), ['Noviembre 2030', 'Diciembre 2030'], 'with a min in the future the calendar opens on the min month');
  t.expectEqual(await t.eval(() => document.querySelector('[data-day-cell][data-month="10"][data-day="9"]').getAttribute('aria-disabled')), 'true', 'the day before the min is disabled');
  t.expectEqual(await t.eval(() => document.querySelector('[data-day-cell][data-month="10"][data-day="10"]').getAttribute('aria-disabled')), null, 'the min day is enabled');
  await t.click(dayCell(2030, 10, 9));
  await t.wait(200);
  t.expectEqual(await value('stay'), '- / -', 'clicking a disabled day does nothing');
  await t.click(dayCell(2030, 10, 12));
  await t.wait(200);
  t.expectEqual(await t.eval(() => ['13', '14', '15'].map((d) => document.querySelector(`[data-day-cell][data-month="10"][data-day="${d}"]`).getAttribute('aria-disabled'))), ['true', null, null], 'with 2 nights the day after the start is disabled and 14 is not');
  await t.click(dayCell(2030, 10, 13));
  await t.wait(200);
  t.expectEqual([await dialogs(), await value('stay')], [1, '2030-10-12 / -'], 'a day closer than the minimum nights cannot be the end');
  await t.hover(dayCell(2030, 10, 13));
  t.expectEqual(await rangeCount('preview-end'), 0, 'and has no preview');
  await t.hover(dayCell(2030, 10, 14));
  t.expectEqual(await rangeOf(2030, 10, 14), 'preview-end', 'the first valid end previews');
  // Move to February 2031: the max is the 20th.
  for (let i = 0; i < 3; i++) {
    await t.click('button[aria-label="Mes siguiente"]');
    await t.wait(400);
  }
  t.expectEqual(await t.eval(() => [...document.querySelectorAll('[role="dialog"] [role="grid"]')].map((g) => g.getAttribute('aria-label'))), ['Febrero 2031', 'Marzo 2031'], 'three arrows later the left month is February 2031');
  t.expectEqual(await t.eval(() => [document.querySelector('[data-day-cell][data-month="1"][data-day="20"]').getAttribute('aria-disabled'), document.querySelector('[data-day-cell][data-month="1"][data-day="21"]').getAttribute('aria-disabled')]), [null, 'true'], 'the max day is enabled and the next one is disabled');
  await t.click(dayCell(2031, 1, 20));
  await t.wait(600);
  t.expectEqual(await value('stay'), '2030-10-12 / 2031-1-20', 'the max day can be the end');
  await rest();

  // ---------------------------------------------------------------------------------------------
  // One month (a prop), with the neighbour days: the band shows on them too and the panel keeps its height.
  await t.click(inputs(one));
  await t.wait(500);
  t.expectEqual(await t.eval(() => document.querySelectorAll('[role="dialog"] [role="grid"]').length), 1, 'months={1} shows one month');
  const o1 = await geometry(t, 'Borrar fechas');
  t.expect(o1.gap >= 0 && o1.gap <= 16, `one month: the gap between the last date row and the footer is ${o1.gap}px (<= 16)`);
  await close();

  // The wheel scrolls the page while the range popover is open and the popover follows.
  await rest();
  await t.click(inputs(free));
  await t.wait(500);
  const pos = () => t.eval(() => ({ y: window.scrollY, pop: document.querySelector('[data-radix-popper-content-wrapper]').getBoundingClientRect().top, locked: document.body.hasAttribute('data-scroll-locked') || getComputedStyle(document.body).overflow === 'hidden' }));
  const p0 = await pos();
  await wheel(t, 1150, 500, 100);
  await t.wait(400);
  const p1 = await pos();
  t.expect(p1.y >= 80 && !p0.locked, `the page scrolls with the wheel while the popover is open (scrollY ${p1.y})`);
  t.expect(Math.abs(p1.pop - p0.pop + p1.y) <= 2, 'and the popover follows the field');
  await close();
  await rest();

  // Dark theme: the same band from the tokens.
  await typeInto(free, 0, '20/10/2026');
  await typeInto(free, 1, '27/10/2026');
  await rest();
  await t.eval(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await t.wait(200);
  await openByIcon(free);
  await t.hover(dayCell(2026, 9, 23));
  await t.screenshot(`date-range-dark-${t.reducedMotion ? 'reduced' : 'motion'}`);
  const dk = await t.eval(() => { const q = (d) => document.querySelector(`[data-day-cell][data-month="9"][data-day="${d}"]`); return { band: getComputedStyle(q(22).parentElement).backgroundColor, plain: getComputedStyle(q(2).parentElement).backgroundColor, text: getComputedStyle(q(22)).color }; });
  t.expect(dk.band !== 'rgba(0, 0, 0, 0)' && dk.band !== dk.plain && dk.text !== dk.band, `dark: the band is visible and its text contrasts (${dk.band}, ${dk.text})`);
  await close();
  await t.eval(() => document.documentElement.removeAttribute('data-theme'));
  await rest();

  // ---------------------------------------------------------------------------------------------
  // Forced colors: the ends are Highlight, the band is Mark, the preview is dashed.
  await typeInto(free, 0, '20/10/2026');
  await typeInto(free, 1, '27/10/2026');
  await rest();
  await t.emulate([{ name: 'forced-colors', value: 'active' }]);
  await t.wait(200);
  await openByIcon(free);
  const fc = await t.eval(() => {
    const q = (d) => document.querySelector(`[data-day-cell][data-month="9"][data-day="${d}"]`);
    const cs = (e) => getComputedStyle(e);
    return { band: cs(q(23).parentElement).backgroundColor, start: cs(q(20)).backgroundColor, end: cs(q(27)).backgroundColor, plain: cs(q(2).parentElement).backgroundColor, plainBtn: cs(q(2)).backgroundColor, bandText: cs(q(23)).color, startText: cs(q(20)).color };
  });
  t.expect(fc.band !== fc.plain && fc.band !== 'rgba(0, 0, 0, 0)', `forced colors: the band has its own system color (${fc.band} vs ${fc.plain})`);
  t.expect(fc.start !== fc.band && fc.start !== fc.plainBtn, `forced colors: the ends are Highlight (${fc.start}), not the band (${fc.band})`);
  t.expectEqual(fc.start, fc.end, 'forced colors: both ends look the same');
  t.expect(fc.startText !== fc.start, 'forced colors: the end text contrasts with its fill');
  await t.click(dayCell(2026, 9, 6));
  await t.wait(200);
  await t.hover(dayCell(2026, 9, 12));
  const pvc = await t.eval(() => { const q = document.querySelector('[data-day-cell][data-month="9"][data-day="9"]').parentElement; const e = document.querySelector('[data-day-cell][data-month="9"][data-day="12"]'); return { bt: getComputedStyle(q).borderTopStyle, bw: getComputedStyle(q).borderTopWidth, endStyle: getComputedStyle(e).borderTopStyle }; });
  t.expect(pvc.bt === 'dashed' && parseFloat(pvc.bw) > 0, `forced colors: the preview band is a dashed outline (${pvc.bt} ${pvc.bw})`);
  t.expectEqual(pvc.endStyle, 'dashed', 'forced colors: the preview end is dashed');
  await t.emulate([]);
  await t.wait(200);
  await close();
  await typeInto(free, 0, '20/10/2026');
  await typeInto(free, 1, '27/10/2026');
  await rest();

  // ---------------------------------------------------------------------------------------------
  // The sheet: one month, sized for a browser, with the two typed fields at the top; full width on a phone.
  await t.click(calBtn(sheet));
  await t.waitFor('[role="dialog"] [data-handle]');
  await t.wait(900);
  const sh = await t.eval(() => {
    const d = document.querySelector('[role="dialog"]').getBoundingClientRect();
    const g = document.querySelectorAll('[role="dialog"] [role="grid"]');
    const c = document.querySelector('[role="dialog"] [data-day-cell]').getBoundingClientRect();
    return { dialog: d.width, grids: g.length, panel: g[0].getBoundingClientRect().width, cellH: c.height, inputs: document.querySelectorAll('[role="dialog"] input[type="text"]').length, focus: document.activeElement?.hasAttribute('data-day-cell') };
  });
  t.expect(sh.dialog >= 480 && sh.dialog <= 520, `1280: the sheet is ${sh.dialog}px wide`);
  t.expectEqual(sh.grids, 1, 'the sheet shows one month even on a wide screen');
  t.expect(sh.panel >= 420 && sh.panel <= 480, `1280: the calendar fills the sheet (${sh.panel}px)`);
  t.expect(sh.cellH >= 48, `1280: cells are ${sh.cellH}px tall`);
  t.expectEqual(sh.inputs, 2, 'the sheet has its own start and end fields');
  t.expectEqual(sh.focus, true, 'the focus lands on a day, not on a text field');
  await t.screenshot(`date-range-sheet-1280-${t.reducedMotion ? 'reduced' : 'motion'}`);
  // Pick start and end in the sheet.
  const ym = await t.eval(() => { const d = new Date(); return [d.getFullYear(), d.getMonth()]; });
  await t.click(dayCell(ym[0], ym[1], 10));
  await t.wait(200);
  t.expectEqual(await t.eval(() => document.querySelectorAll('[role="dialog"]').length), 1, 'the sheet stays open after the start');
  await t.hover(dayCell(ym[0], ym[1], 16));
  t.expectEqual(await t.eval(() => document.querySelectorAll('[role="dialog"] [data-range="in"]').length), 5, 'the preview band shows in the sheet');
  await t.click(dayCell(ym[0], ym[1], 16));
  await t.wait(1000);
  t.expectEqual(await dialogs(), 0, 'the end closes the sheet');
  t.expectEqual(await value('sheet'), `${ym[0]}-${ym[1]}-10 / ${ym[0]}-${ym[1]}-16`, 'the sheet range is set');
  await t.raw.setViewport({ width: 390, height: 844 });
  await t.wait(300);
  await t.click(calBtn(sheet));
  await t.waitFor('[role="dialog"] [data-handle]');
  await t.wait(900);
  const ph = await t.eval(() => {
    const d = document.querySelector('[role="dialog"]').getBoundingClientRect();
    const g = document.querySelectorAll('[role="dialog"] [role="grid"]');
    const f = [...document.querySelectorAll('[role="dialog"] input[type="text"]')].map((i) => i.closest('[data-field-box]').getBoundingClientRect());
    return { dialog: d.width, panel: g[0].getBoundingClientRect().width, overflow: document.documentElement.scrollWidth - innerWidth, stacked: f.length === 2 && f[1].top >= f[0].bottom - 1 };
  });
  t.expectEqual(ph.dialog, 390, '390: the sheet is full width');
  t.expect(ph.panel >= 330, `390: the calendar fills the sheet (${ph.panel}px)`);
  t.expectEqual(ph.overflow, 0, '390: no horizontal overflow');
  t.expectEqual(ph.stacked, true, '390: the two typed fields are stacked');
  await t.screenshot(`date-range-sheet-390-${t.reducedMotion ? 'reduced' : 'motion'}`);
  await t.click('[role="dialog"] button[aria-label="Cerrar"]');
  await t.wait(900);
  // A popover on a phone width (auto months): one month, nothing wider than the screen.
  await rest();
  await t.click(inputs(free));
  await t.wait(500);
  const pop = await t.eval(() => { const d = document.querySelector('[role="dialog"]').getBoundingClientRect(); return { grids: document.querySelectorAll('[role="dialog"] [role="grid"]').length, fits: d.left >= 0 && d.right <= innerWidth, overflow: document.documentElement.scrollWidth - innerWidth }; });
  t.expectEqual(pop.grids, 1, '390: the popover shows one month');
  t.expectEqual(pop.fits, true, '390: the popover fits the screen');
  t.expectEqual(pop.overflow, 0, '390: no horizontal overflow with the popover open');
  await t.screenshot(`date-range-popover-390-${t.reducedMotion ? 'reduced' : 'motion'}`);
  await close();
  await t.raw.setViewport({ width: 1280, height: 800 });
  await t.wait(300);

  // Touch: a tap on a field opens the sheet and does not raise the keyboard.
  await t.coarse(true);
  await t.wait(300);
  await t.eval(() => { window.scrollTo(0, 0); document.activeElement?.blur?.(); });
  await tap(t, inputs(free));
  await t.waitFor('[role="dialog"] [data-handle]');
  await t.wait(900);
  t.expectEqual(await t.eval(() => document.activeElement?.tagName), 'BUTTON', 'a tap opens the sheet with the focus on a day, not on the input');
  await tap(t, '[role="dialog"] button[aria-label="Cerrar"]');
  await t.wait(900);
  await t.coarse(false);
  await t.wait(300);
}
