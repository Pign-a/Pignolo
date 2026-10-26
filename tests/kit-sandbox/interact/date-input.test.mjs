// Unit tests for kit/lib/date-input.ts (pure logic of the date and month pickers).
// Run: node --test interact/date-input.test.mjs   (Node 22.18+ strips the types by itself)
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";

const kit = process.env.PIGNOLO_KIT_DIR || fileURLToPath(new URL("../../../plugins/pignolo/skills/ui/kit", import.meta.url));
const d = await import(pathToFileURL(`${kit}/lib/date-input.ts`).href);

const ymd = (year, month, day = 1) => ({ year, month, day });
const month = (text, extra = {}) => d.parseDateInput(text, { mode: "month", locale: "es-AR", ...extra });
const day = (text, extra = {}) => d.parseDateInput(text, { mode: "day", locale: "es-AR", ...extra });

test("calendar math: ordinal round trip, weekday, leap years", () => {
  assert.equal(d.toOrdinal(1970, 0, 1), 0);
  assert.deepEqual(d.fromOrdinal(0), ymd(1970, 0, 1));
  for (const y of [1000, 1900, 1999, 2000, 2024, 2026, 2100, 9999]) {
    for (const m of [0, 1, 5, 11]) {
      const v = ymd(y, m, d.daysInMonth(y, m));
      assert.deepEqual(d.fromOrdinal(d.ordinalOf(v)), v, `${y}-${m}`);
    }
  }
  assert.equal(d.weekdayOf(ymd(2026, 2, 5)), 4, "5 March 2026 is a Thursday");
  assert.equal(d.weekdayOf(ymd(1900, 0, 1)), 1, "1 January 1900 is a Monday");
  assert.equal(d.weekdayOf(ymd(2100, 11, 31)), 5, "31 December 2100 is a Friday");
  assert.equal(d.isLeapYear(1900), false, "1900 is not a leap year");
  assert.equal(d.isLeapYear(2000), true);
  assert.equal(d.isLeapYear(2100), false, "2100 is not a leap year");
  assert.equal(d.daysInMonth(2024, 1), 29);
  assert.equal(d.daysInMonth(2025, 1), 28);
  assert.equal(d.daysInMonth(1900, 1), 28);
  assert.equal(d.daysInMonth(2100, 1), 28);
});

test("moves: PageDown from the 31st clamps, leap day, years, edges of the supported range", () => {
  assert.deepEqual(d.addMonths(ymd(2026, 0, 31), 1), ymd(2026, 1, 28), "31 Jan + 1 month is 28 Feb");
  assert.deepEqual(d.addMonths(ymd(2024, 0, 31), 1), ymd(2024, 1, 29), "31 Jan + 1 month in a leap year is 29 Feb");
  assert.deepEqual(d.addMonths(ymd(2026, 2, 31), -1), ymd(2026, 1, 28), "31 Mar - 1 month is 28 Feb");
  assert.deepEqual(d.addMonths(ymd(2026, 7, 31), 1), ymd(2026, 8, 30), "31 Aug + 1 month is 30 Sep");
  assert.deepEqual(d.addYears(ymd(2024, 1, 29), 1), ymd(2025, 1, 28), "29 Feb + 1 year is 28 Feb");
  assert.deepEqual(d.addYears(ymd(2024, 1, 29), 4), ymd(2028, 1, 29), "29 Feb + 4 years is 29 Feb");
  assert.deepEqual(d.addDays(ymd(2026, 11, 31), 1), ymd(2027, 0, 1), "day arithmetic crosses the year");
  assert.deepEqual(d.addDays(ymd(2028, 1, 28), 1), ymd(2028, 1, 29));
  assert.deepEqual(d.addDays(ymd(2100, 1, 28), 1), ymd(2100, 2, 1), "2100 has no 29 Feb");
  assert.deepEqual(d.addDays(ymd(1900, 1, 28), 1), ymd(1900, 2, 1), "1900 has no 29 Feb");
  assert.deepEqual(d.addDays(ymd(2026, 2, 8), -7), ymd(2026, 2, 1));
  assert.deepEqual(d.addMonths(ymd(1000, 0, 15), -1), ymd(1000, 0, 1), "clamped at the first supported year");
  assert.deepEqual(d.addMonths(ymd(9999, 11, 15), 1), ymd(9999, 11, 31), "clamped at the last supported year");
});

test("DST: arithmetic does not use local midnight", () => {
  // The Buenos Aires and New York spring changes land inside these spans; counting days must not move.
  assert.deepEqual(d.addDays(ymd(2026, 2, 7), 1), ymd(2026, 2, 8));
  assert.deepEqual(d.addDays(ymd(2026, 9, 31), 1), ymd(2026, 10, 1));
  assert.equal(d.ordinalOf(ymd(2026, 2, 9)) - d.ordinalOf(ymd(2026, 2, 8)), 1);
});

test("range checks at the edge", () => {
  const min = ymd(2026, 2, 10);
  const max = ymd(2026, 11, 20);
  assert.equal(d.isOutside(ymd(2026, 2, 10), min, max, "day"), false, "min is inside");
  assert.equal(d.isOutside(ymd(2026, 2, 9), min, max, "day"), true, "day before min");
  assert.equal(d.isOutside(ymd(2026, 11, 20), min, max, "day"), false, "max is inside");
  assert.equal(d.isOutside(ymd(2026, 11, 21), min, max, "day"), true, "day after max");
  assert.equal(d.isOutside(ymd(2026, 2, 1), min, max, "month"), false, "the month of min is allowed for months");
  assert.equal(d.isOutside(ymd(2026, 1, 1), min, max, "month"), true);
  assert.equal(d.isOutside(ymd(2027, 0, 1), min, max, "year"), true);
  assert.equal(d.isOutside(ymd(1900, 0, 1), undefined, undefined, "day"), false, "no bounds, no limit");
});

test("locale data: es-AR sept vs sep, first weekday, order", () => {
  assert.equal(d.monthNames("es-AR", "short")[8], "Sept", "Intl returns sept for es-AR");
  assert.equal(d.monthNames("es-AR", "long")[8], "Septiembre");
  assert.equal(d.monthNames("en", "short")[8], "Sep");
  assert.equal(d.monthNames("es-AR", "long")[2], "Marzo");
  assert.equal(d.firstWeekday("es-AR"), 1, "es-AR starts on Monday");
  assert.equal(d.firstWeekday("en-US"), 0, "en-US starts on Sunday");
  assert.deepEqual(d.weekdayNames("es-AR", 1, "short").slice(0, 2), ["Lun", "Mar"]);
  assert.equal(d.dateOrder("es-AR"), "dmy");
  assert.equal(d.dateOrder("en-US"), "mdy");
  assert.match(d.formatLongDate(ymd(2026, 2, 5), "es-AR"), /jueves, 5 de marzo de 2026/);
  assert.equal(d.toIsoMonth(ymd(2026, 2)), "2026-03");
  assert.equal(d.toIsoMonth(ymd(1000, 0)), "1000-01");
  assert.equal(d.toIsoDate(ymd(2026, 2, 5)), "2026-03-05");
  assert.equal(d.formatTyped(ymd(2026, 2, 5), "month", "es-AR"), "03/2026");
  assert.equal(d.formatTyped(ymd(2026, 2, 5), "day", "es-AR"), "05/03/2026");
  assert.equal(d.formatTyped(ymd(2026, 2, 5), "day", "en-US"), "03/05/2026");
});

test("typed month: accepted formats", () => {
  const ok = [
    ["3/26", [2026, 2]],
    ["03/2026", [2026, 2]],
    ["3-2026", [2026, 2]],
    ["3.2026", [2026, 2]],
    ["03 2026", [2026, 2]],
    ["mar 2026", [2026, 2]],
    ["Mar. 2026", [2026, 2]],
    ["marzo 2026", [2026, 2]],
    ["MARZO DE 2026", [2026, 2]],
    ["marzo de 26", [2026, 2]],
    ["2026-03", [2026, 2]],
    ["2026/3", [2026, 2]],
    ["032026", [2026, 2]],
    ["sep 2026", [2026, 8]],
    ["sept 2026", [2026, 8]],
    ["sept. 2026", [2026, 8]],
    ["septiembre 2026", [2026, 8]],
    ["setiembre 2026", [2026, 8]],
    ["Sétiembre 2026", [2026, 8]],
    ["dic 1900", [1900, 11]],
    ["12/2100", [2100, 11]],
    ["01/1000", [1000, 0]],
    ["  3 / 26  ", [2026, 2]],
  ];
  for (const [text, [y, m]] of ok) {
    const r = month(text);
    assert.equal(r.ok, true, `${text} should parse (${JSON.stringify(r)})`);
    assert.deepEqual(r.value, ymd(y, m, 1), text);
  }
});

test("typed month: errors never guess", () => {
  const bad = [
    ["", "empty"],
    ["   ", "empty"],
    ["3", "incomplete"],
    ["2026", "incomplete"],
    ["marzo", "incomplete"],
    ["hola", "format"],
    ["13/2026", "month"],
    ["0/2026", "month"],
    ["ma 2026", "month"],
    ["foo 2026", "month"],
    ["3/2", "year"],
    ["3/202", "year"],
    ["3/20266", "year"],
    ["3/0999", "year"],
    ["3/10000", "year"],
    ["3/26/1", "format"],
    ["2026 2026", "month"],
    ["03262026", "format"],
    ["0326", "incomplete"],
    ["03/20 26", "format"],
    ["#3/2026", "format"],
  ];
  for (const [text, reason] of bad) {
    const r = month(text);
    assert.equal(r.ok, false, `${JSON.stringify(text)} must not parse`);
    assert.equal(r.reason, reason, `${JSON.stringify(text)}`);
  }
});

test("typed month: fixed two digit year base, configurable", () => {
  assert.deepEqual(month("3/26").value, ymd(2026, 2));
  assert.deepEqual(month("3/99").value, ymd(2099, 2), "always 20xx by default, never a sliding window");
  assert.deepEqual(month("3/99", { twoDigitYearBase: 1900 }).value, ymd(1999, 2));
  assert.deepEqual(month("3/00").value, ymd(2000, 2));
});

test("typed day: accepted formats", () => {
  const ok = [
    ["5/3/26", [2026, 2, 5]],
    ["5-3-2026", [2026, 2, 5]],
    ["05.03.2026", [2026, 2, 5]],
    ["05/03/2026", [2026, 2, 5]],
    ["5 mar 2026", [2026, 2, 5]],
    ["5 de marzo de 2026", [2026, 2, 5]],
    ["5 Sept 2026", [2026, 8, 5]],
    ["mar 5 2026", [2026, 2, 5]],
    ["2026-03-05", [2026, 2, 5]],
    ["2026/3/5", [2026, 2, 5]],
    ["05032026", [2026, 2, 5]],
    ["29/2/2024", [2024, 1, 29]],
    ["29/02/2000", [2000, 1, 29]],
    ["31/12/2100", [2100, 11, 31]],
    ["1/1/1900", [1900, 0, 1]],
    ["31/1/26", [2026, 0, 31]],
  ];
  for (const [text, [y, m, dd]] of ok) {
    const r = day(text);
    assert.equal(r.ok, true, `${text} should parse (${JSON.stringify(r)})`);
    assert.deepEqual(r.value, ymd(y, m, dd), text);
  }
});

test("typed day: errors never guess", () => {
  const bad = [
    ["", "empty"],
    ["5", "incomplete"],
    ["5/3", "incomplete"],
    ["marzo 2026", "incomplete"],
    ["29/2/2025", "day"],
    ["29/2/1900", "day"],
    ["29/2/2100", "day"],
    ["31/4/2026", "day"],
    ["0/3/2026", "day"],
    ["32/1/2026", "day"],
    ["5/13/2026", "month"],
    ["5/3/202", "year"],
    ["5/3/2026/1", "format"],
    ["5 xyz 2026", "month"],
    ["0503", "incomplete"],
    ["050326", "format"],
  ];
  for (const [text, reason] of bad) {
    const r = day(text);
    assert.equal(r.ok, false, `${JSON.stringify(text)} must not parse`);
    assert.equal(r.reason, reason, `${JSON.stringify(text)}`);
  }
});

test("typed day: order follows the locale (es-AR day first, en-US month first)", () => {
  assert.deepEqual(day("5/3/2026").value, ymd(2026, 2, 5), "es-AR: 5 March");
  assert.deepEqual(day("5/3/2026", { locale: "en-US" }).value, ymd(2026, 4, 3), "en-US: 3 May");
  assert.equal(day("13/3/2026", { locale: "en-US" }).reason, "month");
  assert.deepEqual(day("2026-03-05", { locale: "en-US" }).value, ymd(2026, 2, 5), "ISO is the same everywhere");
  assert.deepEqual(day("Mar 5 2026", { locale: "en-US" }).value, ymd(2026, 2, 5));
});
