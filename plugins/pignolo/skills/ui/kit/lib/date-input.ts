/**
 * Date helpers for the kit pickers (month-picker, date-picker, calendar). Pure functions, no
 * React, no `Date` arithmetic: days are counted as integers (days since 1970-01-01, proleptic
 * Gregorian) so a daylight saving change can never move a date. `Intl` formatting uses UTC noon,
 * never local midnight.
 *
 * Typed input (es-AR first), after NN/g "Date-Input Form Fields" (always allow typing, accept
 * several formats), GOV.UK date input (accept 3, 03, mar, march; helper text, not placeholder) and
 * Carbon (format as hint text). Accepted for months: `3/26`, `03/2026`, `mar 2026`, `marzo 2026`,
 * `marzo de 2026`, `2026-03`, `032026`. For days: `5/3/26`, `5-3-2026`, `05.03.2026`, `5 mar 2026`,
 * `5 de marzo de 2026`, `mar 5 2026`, `2026-03-05`, `05032026`. Order of numbers follows the
 * locale (es-AR: day, month, year; en-US: month, day, year); a 4 digit first number is always the
 * year (ISO). Separators: `/ - . , space`. Accents, dots and case are ignored; a month name may be
 * the full name, the Intl short name or any prefix of at least 3 letters ("sep", "sept").
 * Two digit years use a FIXED base (default 2000: 26 is 2026, never a sliding window).
 * Anything unclear returns a reason instead of a guess.
 */

export interface YMD {
  year: number;
  /** 0 for January to 11 for December. */
  month: number;
  day: number;
}

export const YEAR_MIN = 1000;
export const YEAR_MAX = 9999;

export const pad = (n: number, width = 2) => String(n).padStart(width, "0");

export const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

export function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month] ?? 30;
}

/** Days since 1970-01-01 (Hinnant's civil algorithm). Month is 0 to 11. */
export function toOrdinal(year: number, month: number, day: number): number {
  const m1 = month + 1;
  const y = m1 <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m1 > 2 ? m1 - 3 : m1 + 9) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function fromOrdinal(n: number): YMD {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m1 = mp < 10 ? mp + 3 : mp - 9;
  return { year: yoe + era * 400 + (m1 <= 2 ? 1 : 0), month: m1 - 1, day };
}

export const ordinalOf = (v: YMD) => toOrdinal(v.year, v.month, v.day);
/** 0 for Sunday to 6 for Saturday. */
export const weekdayOf = (v: YMD) => (((ordinalOf(v) % 7) + 7 + 4) % 7);
export const monthIndex = (v: { year: number; month: number }) => v.year * 12 + v.month;
export const compareYMD = (a: YMD, b: YMD) => ordinalOf(a) - ordinalOf(b);

export function clampYear(v: YMD): YMD {
  if (v.year < YEAR_MIN) return { year: YEAR_MIN, month: 0, day: 1 };
  if (v.year > YEAR_MAX) return { year: YEAR_MAX, month: 11, day: 31 };
  return v;
}

export const addDays = (v: YMD, n: number): YMD => clampYear(fromOrdinal(ordinalOf(v) + n));

/** Moves by months and keeps the day, or the last day of a shorter month (31 Jan + 1 month is 28 or 29 Feb). */
export function addMonths(v: YMD, n: number): YMD {
  const i = monthIndex(v) + n;
  const year = Math.floor(i / 12);
  const month = i - year * 12;
  return clampYear({ year, month, day: Math.min(v.day, daysInMonth(year, month)) });
}

export const addYears = (v: YMD, n: number): YMD => addMonths(v, n * 12);

export function todayYMD(now: Date = new Date()): YMD {
  return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
}

/** Is `v` outside min and max? For months compare only year and month. */
export function isOutside(v: YMD, min: YMD | undefined, max: YMD | undefined, unit: "day" | "month" | "year"): boolean {
  const key = (x: YMD) => (unit === "day" ? ordinalOf(x) : unit === "month" ? monthIndex(x) : x.year);
  return (min !== undefined && key(v) < key(min)) || (max !== undefined && key(v) > key(max));
}

export const toIsoMonth = (v: { year: number; month: number }) => `${pad(v.year, 4)}-${pad(v.month + 1)}`;
export const toIsoDate = (v: YMD) => `${toIsoMonth(v)}-${pad(v.day)}`;

// ---------------------------------------------------------------------------------------------
// Locale data (Intl, UTC noon)

const utcNoon = (year: number, month: number, day: number) => {
  const d = new Date(Date.UTC(2000, month, day, 12));
  d.setUTCFullYear(year);
  return d;
};

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" });
    formatters.set(key, f);
  }
  return f;
}

const upperFirst = (s: string, locale: string) => (s ? s.charAt(0).toLocaleUpperCase(locale) + s.slice(1) : s);

/** Month names from Intl: capitalized, no trailing dot. es-AR short names are "ene", "sept"... */
export function monthNames(locale: string, form: "long" | "short"): string[] {
  return Array.from({ length: 12 }, (_, m) => upperFirst(formatter(locale, { month: form }).format(utcNoon(2026, m, 15)).replace(/\.$/, ""), locale));
}

/** Weekday names starting on `firstDay` (0 is Sunday). */
export function weekdayNames(locale: string, firstDay: number, form: "short" | "long"): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const wd = (firstDay + i) % 7;
    return upperFirst(formatter(locale, { weekday: form }).format(utcNoon(2023, 0, 1 + wd)).replace(/\.$/, ""), locale);
  });
}

/** First day of the week for the locale: 0 Sunday to 6 Saturday. Monday when the runtime cannot tell. */
export function firstWeekday(locale: string): number {
  try {
    const l = new Intl.Locale(locale) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
    const info = typeof l.getWeekInfo === "function" ? l.getWeekInfo() : l.weekInfo;
    if (info?.firstDay) return info.firstDay % 7;
  } catch {
    /* fall through */
  }
  return 1;
}

/** "dmy" for es-AR, "mdy" for en-US. Decides the order of numbers when typing. */
export function dateOrder(locale: string): "dmy" | "mdy" {
  const parts = formatter(locale, { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(utcNoon(2026, 2, 5));
  const at = (type: string) => parts.findIndex((p) => p.type === type);
  return at("month") < at("day") ? "mdy" : "dmy";
}

/** "jueves, 5 de marzo de 2026": what a screen reader says for a focused day. */
export function formatLongDate(v: YMD, locale: string): string {
  return formatter(locale, { dateStyle: "full" }).format(utcNoon(v.year, v.month, v.day));
}

/** What the typed field shows for a committed value: 03/2026, 05/03/2026 (order follows the locale). */
export function formatTyped(v: YMD, mode: "month" | "day", locale: string): string {
  if (mode === "month") return `${pad(v.month + 1)}/${pad(v.year, 4)}`;
  return dateOrder(locale) === "mdy" ? `${pad(v.month + 1)}/${pad(v.day)}/${pad(v.year, 4)}` : `${pad(v.day)}/${pad(v.month + 1)}/${pad(v.year, 4)}`;
}

// ---------------------------------------------------------------------------------------------
// Typed input

export type ParseFailure = "empty" | "incomplete" | "format" | "month" | "day" | "year" | "ambiguous";
export type ParseResult = { ok: true; value: YMD } | { ok: false; reason: ParseFailure };

export interface ParseOptions {
  mode: "month" | "day";
  locale?: string;
  /** Two digit years are `base + yy`. Default 2000 (fixed, not a sliding window). */
  twoDigitYearBase?: number;
}

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\./g, "").trim();

/** Alternative spellings that Intl does not return. */
const ALIASES: Record<string, Record<string, number>> = {
  es: { setiembre: 8, set: 8 },
};

type Lookup = (token: string) => number | "ambiguous" | undefined;

const lookupCache = new Map<string, Lookup>();
function monthLookup(locale: string): Lookup {
  let found = lookupCache.get(locale);
  if (found) return found;
  const long = monthNames(locale, "long").map(plain);
  const short = monthNames(locale, "short").map(plain);
  const aliases = ALIASES[locale.split("-")[0] ?? ""] ?? {};
  found = (token) => {
    const exact = new Set<number>();
    long.forEach((n, i) => n === token && exact.add(i));
    short.forEach((n, i) => n === token && exact.add(i));
    if (aliases[token] !== undefined) exact.add(aliases[token]);
    if (exact.size === 1) return [...exact][0];
    if (exact.size > 1) return "ambiguous";
    if (token.length < 3) return undefined;
    const prefix = long.map((n, i) => (n.startsWith(token) ? i : -1)).filter((i) => i >= 0);
    if (prefix.length === 1) return prefix[0];
    return prefix.length > 1 ? "ambiguous" : undefined;
  };
  lookupCache.set(locale, found);
  return found;
}

export function parseDateInput(text: string, options: ParseOptions): ParseResult {
  const { mode, locale = "es-AR", twoDigitYearBase = 2000 } = options;
  const clean = plain(text.replace(/[.,]/g, " ")).replace(/\bde\b/g, " ").trim();
  if (!clean) return { ok: false, reason: "empty" };

  let tokens = clean.split(/[\s/\-]+/).filter(Boolean);

  // Digits only, no separator: accept the two unambiguous full width forms and nothing else.
  if (tokens.length === 1 && /^\d+$/.test(tokens[0] ?? "")) {
    const d = tokens[0] as string;
    if (mode === "month" && d.length === 6) tokens = [d.slice(0, 2), d.slice(2)];
    else if (mode === "day" && d.length === 8) tokens = [d.slice(0, 2), d.slice(2, 4), d.slice(4)];
    else return { ok: false, reason: d.length <= 4 ? "incomplete" : "format" };
  }

  const isNum = (t: string) => /^\d+$/.test(t);
  const isWord = (t: string) => /^\p{L}+$/u.test(t);
  if (!tokens.every((t) => isNum(t) || isWord(t))) return { ok: false, reason: "format" };

  const lookup = monthLookup(locale);
  const needed = mode === "month" ? 2 : 3;
  if (tokens.length < needed) {
    // A short text is "incomplete" only when what is there could be part of a date.
    const unknownWord = tokens.some((tok) => isWord(tok) && lookup(tok) === undefined);
    return { ok: false, reason: unknownWord ? "format" : "incomplete" };
  }
  if (tokens.length > needed) return { ok: false, reason: "format" };

  const monthOf = (t: string): { month: number } | { reason: ParseFailure } => {
    if (isNum(t)) {
      const n = Number(t);
      return t.length <= 2 && n >= 1 && n <= 12 ? { month: n - 1 } : { reason: "month" };
    }
    const hit = lookup(t);
    if (hit === "ambiguous") return { reason: "ambiguous" };
    return hit === undefined ? { reason: "month" } : { month: hit };
  };
  const yearOf = (t: string): { year: number } | { reason: ParseFailure } => {
    if (!isNum(t)) return { reason: "format" };
    const year = t.length === 4 ? Number(t) : t.length === 2 ? twoDigitYearBase + Number(t) : NaN;
    return year >= YEAR_MIN && year <= YEAR_MAX ? { year } : { reason: "year" };
  };
  const dayOf = (t: string): number | undefined => (isNum(t) && t.length <= 2 ? Number(t) : undefined);

  const order = dateOrder(locale);
  const [a = "", b = "", c = ""] = tokens;
  let year: { year: number } | { reason: ParseFailure };
  let month: { month: number } | { reason: ParseFailure };
  let day: number | undefined = 1;

  if (mode === "month") {
    if (isNum(a) && a.length === 4) {
      year = yearOf(a);
      month = monthOf(b);
    } else {
      month = monthOf(a);
      year = yearOf(b);
    }
  } else if (isNum(a) && a.length === 4) {
    year = yearOf(a);
    month = monthOf(b);
    day = dayOf(c);
  } else if (isWord(a)) {
    month = monthOf(a);
    day = dayOf(b);
    year = yearOf(c);
  } else if (isWord(b)) {
    day = dayOf(a);
    month = monthOf(b);
    year = yearOf(c);
  } else if (order === "mdy") {
    month = monthOf(a);
    day = dayOf(b);
    year = yearOf(c);
  } else {
    day = dayOf(a);
    month = monthOf(b);
    year = yearOf(c);
  }

  // Report the first problem in reading order: month, then year, then day.
  if ("reason" in month) return { ok: false, reason: month.reason };
  if ("reason" in year) return { ok: false, reason: year.reason };
  if (day === undefined || day < 1 || day > daysInMonth(year.year, month.month)) return { ok: false, reason: "day" };
  return { ok: true, value: { year: year.year, month: month.month, day } };
}
