/**
 * Calendar parts shared by MonthPicker and DatePicker: the panel (day grid, 3 x 4 month grid, year
 * grid per decade), the typed field, and the overlay (popover on desktop, bottom sheet on touch).
 * Not meant to be used alone; use `MonthPicker` or `DatePicker`.
 * Use when: never directly. See month-picker.tsx and date-picker.tsx.
 * Tier: direct (0.22 s, bounce 0, exit 0.1 s).
 * Design (research 2026-10-25, sources in references/patterns/date-and-month-picker.md): NN/g and
 *   GOV.UK say a calendar suits dates near today and typing suits far ones, so a typed field is
 *   always there; the header is `<  [March] [2026]  >` with the month and the year as TWO buttons;
 *   the month button opens a 3 x 4 month grid, the year button a 12 year grid per decade with
 *   decade arrows; the grid REPLACES the calendar body (no popup inside a popup, the body keeps its
 *   height so nothing jumps); chevrons step month, year or decade by the open view.
 * Primitive: @radix-ui/react-popover (dialog semantics, Esc, focus return) or BottomSheet when the
 *   primary pointer is coarse; grids are role="grid" with a roving tabindex.
 * Keyboard (WAI-ARIA APG date picker dialog; normative for the day grid): arrows move a day or a
 *   week, Home and End the start and end of the week, PageUp and PageDown a month, Shift+PageUp and
 *   Shift+PageDown a year, a shorter month clamps to its last day, Enter or Space picks, Esc closes
 *   and focus returns to the trigger. Month grid: arrows move a month or 3 months (rows of 3),
 *   Home and End the row, PageUp and PageDown a year. Year grid: arrows move a year or 3 years,
 *   Home and End the row, PageUp and PageDown a decade (these two grids are an inference, the APG
 *   has no month or year grid).
 * Range: `min` and `max` disable cells but keep them focusable (aria-disabled), so keyboard users
 *   can still travel and hear why. Dates are plain year, month, day numbers: no local midnight.
 * Motion: month changes slide 10 px and fade from the side they move toward; view changes
 *   cross-fade. Transform and opacity only. Reduced motion: fade only.
 * Touch: cells are 44 px on `(pointer: coarse)`; the panel opens in the kit bottom sheet.
 * Copy: everything visible comes from `labels` (see CalendarLabels, TypedLabels).
 */
"use client";

import {
  cloneElement,
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import * as Popover from "@radix-ui/react-popover";
import { AnimatePresence, useIsPresent } from "motion/react";
import type { Variants } from "motion/react";
import * as m from "motion/react-m";
import { cn } from "../lib/cn";
import {
  YEAR_MAX,
  YEAR_MIN,
  addDays,
  addMonths,
  addYears,
  daysInMonth,
  firstWeekday,
  formatLongDate,
  formatTyped,
  isOutside,
  monthNames,
  parseDateInput,
  todayYMD,
  weekdayNames,
  weekdayOf,
  type ParseFailure,
  type YMD,
} from "../lib/date-input";
import { coarseTarget, type MotionTier } from "../motion";
import { BottomSheet } from "./bottom-sheet";

export type { YMD } from "../lib/date-input";

// ---------------------------------------------------------------------------------------------
// Labels

export interface CalendarLabels {
  previousMonth: string;
  nextMonth: string;
  previousYear: string;
  nextYear: string;
  previousDecade: string;
  nextDecade: string;
  /** Name of the month button; the month is appended: "Cambiar mes, marzo". */
  changeMonth: string;
  /** Name of the year button; the year is appended: "Cambiar año, 2026". */
  changeYear: string;
  /** Button that picks today (day grid). */
  today: string;
  /** Button that picks the current month (month grid of the month picker). */
  thisMonth: string;
  /** Names the popover, the sheet and the trigger, for example "Elegir mes". */
  choose: string;
  /** Accessible name of the sheet close button. */
  close: string;
}

export interface TypedErrors {
  /** The text does not look like a date. Also the fallback for the others. */
  format: string;
  /** The date is before `min` or after `max`. */
  range: string;
  empty?: string;
  incomplete?: string;
  month?: string;
  day?: string;
  year?: string;
  ambiguous?: string;
}

export interface TypedLabels {
  /** Name of the typed field. */
  typeLabel: string;
  /** The expected format as visible text, for example "mm/aaaa, por ejemplo 03/2026". Never a placeholder. */
  hint: string;
  errors: TypedErrors;
}

export type PickerLabels = CalendarLabels & TypedLabels;

export type Presentation = "auto" | "popover" | "sheet";

// ---------------------------------------------------------------------------------------------
// Touch detection and overlay

const subscribeCoarse = (cb: () => void) => {
  const q = window.matchMedia("(pointer: coarse)");
  q.addEventListener("change", cb);
  return () => q.removeEventListener("change", cb);
};
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribeCoarse,
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );
}

interface OverlayCtx {
  sheet: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
}
const OverlayContext = createContext<OverlayCtx | null>(null);

/** Wraps the element the popover aligns to. A no-op in the sheet. */
export function PickerAnchor({ children }: { children: ReactElement }) {
  const ctx = useContext(OverlayContext);
  if (!ctx || ctx.sheet) return children;
  return <Popover.Anchor asChild>{children}</Popover.Anchor>;
}

/** The button that opens the panel: a Radix trigger in a popover, a plain toggle in the sheet. */
export function PickerTrigger({ children, disabled }: { children: ReactElement<{ onClick?: (e: React.MouseEvent) => void }>; disabled?: boolean }) {
  const ctx = useContext(OverlayContext);
  if (!ctx) return children;
  if (!ctx.sheet) {
    return (
      <Popover.Trigger asChild disabled={disabled}>
        {children}
      </Popover.Trigger>
    );
  }
  return cloneElement(children as ReactElement<Record<string, unknown>>, {
    "aria-haspopup": "dialog",
    "aria-expanded": ctx.open,
    disabled,
    onClick: (e: React.MouseEvent) => {
      (children.props.onClick as ((e: React.MouseEvent) => void) | undefined)?.(e);
      ctx.setOpen(!ctx.open);
    },
  });
}

export interface PickerOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presentation: Presentation;
  /** Name of the popover and the sheet. */
  title: string;
  closeLabel: string;
  /** The control that holds a `PickerTrigger`. */
  field: ReactNode;
  /** The panel. It is mounted only while open, so it starts fresh every time. */
  panel: ReactNode;
  t: MotionTier;
  align?: "start" | "center" | "end";
}

export function PickerOverlay({ open, onOpenChange, presentation, title, closeLabel, field, panel, t, align = "center" }: PickerOverlayProps) {
  const coarse = useCoarsePointer();
  const sheet = presentation === "sheet" || (presentation === "auto" && coarse);
  const ctx: OverlayCtx = { sheet, open, setOpen: onOpenChange };

  if (sheet) {
    return (
      <OverlayContext.Provider value={ctx}>
        {field}
        <BottomSheet open={open} onOpenChange={onOpenChange} title={title} closeLabel={closeLabel}>
          <div className="mx-auto w-fit pb-2">{panel}</div>
        </BottomSheet>
      </OverlayContext.Provider>
    );
  }
  return (
    <OverlayContext.Provider value={ctx}>
      <Popover.Root open={open} onOpenChange={onOpenChange}>
        {field}
        <AnimatePresence>
          {open && (
            <Popover.Portal forceMount key="pop">
              <Popover.Content
                forceMount
                asChild
                align={align}
                sideOffset={8}
                collisionPadding={8}
                aria-label={title}
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <m.div
                  className="z-50 origin-(--radix-popover-content-transform-origin) rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-surface) p-3 shadow-(--elevation-3) outline-none"
                  initial={{ opacity: 0, y: t.distance(-6), scale: t.scaleFrom(0.96) }}
                  animate={{ opacity: 1, y: 0, scale: 1, transition: t.enter }}
                  exit={{ opacity: 0, y: t.distance(-4), scale: t.scaleFrom(0.96), transition: t.exit }}
                >
                  {panel}
                </m.div>
              </Popover.Content>
            </Popover.Portal>
          )}
        </AnimatePresence>
      </Popover.Root>
    </OverlayContext.Provider>
  );
}

// ---------------------------------------------------------------------------------------------
// Small pieces

const SLIDE_PX = 10;

export function Arrow({ dir }: { dir: "left" | "right" | "down" }) {
  const d = dir === "left" ? "M12 4l-6 6 6 6" : dir === "right" ? "M8 4l6 6-6 6" : "M5 7.5l5 5 5-5";
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="rtl:-scale-x-100">
      <path d={d} />
    </svg>
  );
}

export const iconButton = cn(
  "kit-focus inline-flex size-10 shrink-0 items-center justify-center rounded-(--radius-control) border border-(--color-outline) bg-(--color-surface) text-(--color-on-surface) transition-[scale,background-color] duration-75 ease-out hover:bg-(--color-surface-container) active:scale-[0.97] active:bg-(--color-border-subtle) motion-reduce:active:scale-100 aria-disabled:cursor-not-allowed aria-disabled:opacity-(--state-disabled-content) aria-disabled:hover:bg-(--color-surface) aria-disabled:active:scale-100",
  coarseTarget,
);

/* Sliding content: the keyed child enters from the side it moves toward, the old one leaves the other way.
   `dir` 0 is a plain cross-fade (a view change). */
function slideVariants(t: MotionTier): Variants {
  return {
    enter: (dir: -1 | 0 | 1) => ({ opacity: 0, x: t.distance(dir * SLIDE_PX) }),
    center: { opacity: 1, x: 0, transition: t.enter },
    exit: (dir: -1 | 0 | 1) => ({ opacity: 0, x: t.distance(-dir * SLIDE_PX), transition: t.exit }),
  };
}

export function Slide({ id, dir, t, className, children }: { id: string; dir: -1 | 0 | 1; t: MotionTier; className?: string; children: ReactNode }) {
  return (
    <span className={cn("grid overflow-hidden", className)}>
      <AnimatePresence initial={false} custom={dir}>
        <SlideItem key={id} dir={dir} t={t}>
          {children}
        </SlideItem>
      </AnimatePresence>
    </span>
  );
}

function SlideItem({ dir, t, children }: { dir: -1 | 0 | 1; t: MotionTier; children: ReactNode }) {
  const present = useIsPresent();
  return (
    <m.span
      className="col-start-1 row-start-1 flex items-center justify-center"
      variants={slideVariants(t)}
      custom={dir}
      initial="enter"
      animate="center"
      exit="exit"
      aria-hidden={present ? undefined : true}
    >
      {children}
    </m.span>
  );
}

function cellClass(o: { selected: boolean; now: boolean; off: boolean; muted?: boolean }) {
  return cn(
    "kit-focus relative w-full rounded-(--radius-control) px-1 text-sm transition-[scale,background-color] duration-75 ease-out outline-offset-[-2px] active:scale-[0.97] motion-reduce:active:scale-100",
    o.selected
      ? "bg-(--color-primary) font-semibold text-(--color-on-primary) hover:bg-(--color-primary-hover) active:bg-(--color-primary-pressed)"
      : cn(o.muted ? "text-(--color-on-surface-muted)" : "text-(--color-on-surface)", !o.off && "hover:bg-(--color-surface-container) active:bg-(--color-border-subtle)"),
    o.now && !o.selected && "border border-(--color-primary) text-(--color-primary)",
    o.off && "cursor-not-allowed opacity-(--state-disabled-content) active:scale-100",
  );
}

type View = "day" | "month" | "year";
const pageStart = (year: number) => Math.floor(year / 10) * 10;

interface GridBase {
  cursor: YMD;
  value: YMD | null;
  now: YMD;
  min?: YMD;
  max?: YMD;
  dir: -1 | 0 | 1;
  t: MotionTier;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
}

const gridMotion = (t: MotionTier, dir: -1 | 0 | 1) => ({ variants: slideVariants(t), custom: dir, initial: "enter", animate: "center", exit: "exit" }) as const;

function DayGrid({ cursor, value, now, min, max, dir, t, onKeyDown, locale, firstDay, onPick }: GridBase & { locale: string; firstDay: number; onPick: (v: YMD) => void }) {
  const present = useIsPresent();
  const { year, month } = cursor;
  const short = weekdayNames(locale, firstDay, "short");
  const long = weekdayNames(locale, firstDay, "long");
  const lead = (weekdayOf({ year, month, day: 1 }) - firstDay + 7) % 7;
  const dim = daysInMonth(year, month);
  return (
    <m.div
      role="grid"
      aria-label={`${monthNames(locale, "long")[month]} ${year}`}
      inert={!present}
      onKeyDown={onKeyDown}
      className="col-start-1 row-start-1 flex flex-col"
      {...gridMotion(t, dir)}
    >
      <div role="row" className="grid h-8 grid-cols-7">
        {short.map((s, i) => (
          <div key={i} role="columnheader" aria-label={long[i]} className="flex items-center justify-center text-xs font-medium text-(--color-on-surface-muted)">
            {s}
          </div>
        ))}
      </div>
      {[0, 1, 2, 3, 4, 5].map((r) => (
        <div role="row" key={r} className="grid h-(--kit-cell) grid-cols-7">
          {[0, 1, 2, 3, 4, 5, 6].map((c) => {
            const day = r * 7 + c - lead + 1;
            if (day < 1 || day > dim) return <div key={c} role="gridcell" aria-hidden="true" />;
            const v: YMD = { year, month, day };
            const isSelected = value !== null && value.year === year && value.month === month && value.day === day;
            const isNow = now.year === year && now.month === month && now.day === day;
            const isCursor = cursor.day === day;
            const off = isOutside(v, min, max, "day");
            return (
              <div role="gridcell" key={c} aria-selected={isSelected} className="flex items-stretch">
                <button
                  type="button"
                  tabIndex={isCursor ? 0 : -1}
                  aria-label={formatLongDate(v, locale)}
                  aria-disabled={off || undefined}
                  aria-current={isNow ? "date" : undefined}
                  data-autofocus={isCursor ? "" : undefined}
                  data-day-cell=""
                  data-year={year}
                  data-month={month}
                  data-day={day}
                  onClick={() => {
                    if (!off) onPick(v);
                  }}
                  className={cn(cellClass({ selected: isSelected, now: isNow, off }), "h-full")}
                >
                  {day}
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </m.div>
  );
}

function MonthGrid({ cursor, value, now, min, max, dir, t, onKeyDown, locale, onPick }: GridBase & { locale: string; onPick: (v: YMD) => void }) {
  const present = useIsPresent();
  const { year } = cursor;
  const short = monthNames(locale, "short");
  const long = monthNames(locale, "long");
  return (
    <m.div
      role="grid"
      aria-label={String(year)}
      inert={!present}
      onKeyDown={onKeyDown}
      className="col-start-1 row-start-1 grid h-full grid-rows-4 gap-1"
      {...gridMotion(t, dir)}
    >
      {[0, 1, 2, 3].map((r) => (
        <div role="row" key={r} className="grid grid-cols-3 gap-1">
          {[0, 1, 2].map((c) => {
            const month = r * 3 + c;
            const v: YMD = { year, month, day: 1 };
            const isSelected = value !== null && value.year === year && value.month === month;
            const isNow = now.year === year && now.month === month;
            const off = isOutside(v, min, max, "month");
            return (
              <div role="gridcell" key={month} aria-selected={isSelected} className="flex items-stretch">
                <button
                  type="button"
                  tabIndex={cursor.month === month ? 0 : -1}
                  aria-label={`${long[month]} ${year}`}
                  aria-disabled={off || undefined}
                  aria-current={isNow ? "date" : undefined}
                  data-autofocus={cursor.month === month ? "" : undefined}
                  data-month-cell=""
                  data-year={year}
                  data-month={month}
                  onClick={() => {
                    if (!off) onPick(v);
                  }}
                  className={cn(cellClass({ selected: isSelected, now: isNow, off }), "min-h-(--kit-cell)")}
                >
                  {short[month]}
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </m.div>
  );
}

function YearGrid({ cursor, value, now, min, max, dir, t, onKeyDown, onPick }: GridBase & { onPick: (year: number) => void }) {
  const present = useIsPresent();
  const start = pageStart(cursor.year);
  return (
    <m.div
      role="grid"
      aria-label={`${start} - ${start + 9}`}
      inert={!present}
      onKeyDown={onKeyDown}
      className="col-start-1 row-start-1 grid h-full grid-rows-4 gap-1"
      {...gridMotion(t, dir)}
    >
      {[0, 1, 2, 3].map((r) => (
        <div role="row" key={r} className="grid grid-cols-3 gap-1">
          {[0, 1, 2].map((c) => {
            const year = start - 1 + r * 3 + c;
            const outsideBounds = year < YEAR_MIN || year > YEAR_MAX;
            const isSelected = value !== null && value.year === year;
            const isNow = now.year === year;
            const off = outsideBounds || isOutside({ year, month: 0, day: 1 }, min, max, "year");
            return (
              <div role="gridcell" key={year} aria-selected={isSelected} className="flex items-stretch">
                <button
                  type="button"
                  tabIndex={cursor.year === year ? 0 : -1}
                  aria-label={String(year)}
                  aria-disabled={off || undefined}
                  aria-current={isNow ? "date" : undefined}
                  data-autofocus={cursor.year === year ? "" : undefined}
                  data-year-cell=""
                  data-year={year}
                  onClick={() => {
                    if (!off) onPick(year);
                  }}
                  className={cn(cellClass({ selected: isSelected, now: isNow, off, muted: year < start || year > start + 9 }), "min-h-(--kit-cell)")}
                >
                  {outsideBounds ? "" : year}
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </m.div>
  );
}

// ---------------------------------------------------------------------------------------------
// Panel

export interface CalendarPanelProps {
  /** "day" opens on the day grid; "month" opens on the month grid and picks a month. */
  mode: "day" | "month";
  locale: string;
  value: YMD | null;
  min?: YMD;
  max?: YMD;
  labels: CalendarLabels;
  onPick: (v: YMD) => void;
  t: MotionTier;
  /** Content above the header (the typed field of the month picker). */
  top?: ReactNode;
}

export function CalendarPanel({ mode, locale, value, min, max, labels, onPick, t, top }: CalendarPanelProps) {
  const base: View = mode === "day" ? "day" : "month";
  const now = todayYMD();
  const [view, setView] = useState<View>(base);
  const [cursor, setCursor] = useState<YMD>(() => value ?? now);
  const [dir, setDir] = useState<-1 | 0 | 1>(0);
  const returnView = useRef<View>(base);
  // The sheet focuses `data-autofocus` itself and remembers the opener; focusing here first would hide the opener from it.
  const inSheet = useContext(OverlayContext)?.sheet ?? false;
  const wantFocus = useRef(!inSheet);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const firstDay = firstWeekday(locale);
  const longMonths = monthNames(locale, "long");

  // Keep keyboard focus on the cursor cell after it moves or the view changes.
  useEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    const where = view === "day" ? `[data-day-cell][data-year="${cursor.year}"][data-month="${cursor.month}"][data-day="${cursor.day}"]` : view === "month" ? `[data-month-cell][data-year="${cursor.year}"][data-month="${cursor.month}"]` : `[data-year-cell][data-year="${cursor.year}"]`;
    rootRef.current?.querySelector<HTMLElement>(`[role="grid"]:not([inert]) ${where}`)?.focus({ preventScroll: true });
  });

  const keyOf = (v: YMD, w: View) => (w === "day" ? v.year * 12 + v.month : w === "month" ? v.year : pageStart(v.year));
  const moveTo = (next: YMD, focus = true) => {
    const n = next.year < YEAR_MIN || next.year > YEAR_MAX ? cursor : next;
    const a = keyOf(cursor, view);
    const b = keyOf(n, view);
    if (a !== b) setDir(b > a ? 1 : -1);
    wantFocus.current = focus;
    setCursor(n);
  };
  const switchView = (next: View, from?: View) => {
    if (from) returnView.current = from;
    setDir(0);
    wantFocus.current = true;
    setView(next);
  };

  const onGridKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    let next: YMD | undefined;
    if (view === "day") {
      const back = (weekdayOf(cursor) - firstDay + 7) % 7;
      if (k === "ArrowLeft") next = addDays(cursor, -1);
      else if (k === "ArrowRight") next = addDays(cursor, 1);
      else if (k === "ArrowUp") next = addDays(cursor, -7);
      else if (k === "ArrowDown") next = addDays(cursor, 7);
      else if (k === "Home") next = addDays(cursor, -back);
      else if (k === "End") next = addDays(cursor, 6 - back);
      else if (k === "PageUp") next = e.shiftKey ? addYears(cursor, -1) : addMonths(cursor, -1);
      else if (k === "PageDown") next = e.shiftKey ? addYears(cursor, 1) : addMonths(cursor, 1);
    } else if (view === "month") {
      const row = Math.floor(cursor.month / 3) * 3;
      if (k === "ArrowLeft") next = addMonths(cursor, -1);
      else if (k === "ArrowRight") next = addMonths(cursor, 1);
      else if (k === "ArrowUp") next = addMonths(cursor, -3);
      else if (k === "ArrowDown") next = addMonths(cursor, 3);
      else if (k === "Home") next = addMonths(cursor, row - cursor.month);
      else if (k === "End") next = addMonths(cursor, row + 2 - cursor.month);
      else if (k === "PageUp") next = addYears(cursor, -1);
      else if (k === "PageDown") next = addYears(cursor, 1);
    } else {
      const index = cursor.year - (pageStart(cursor.year) - 1);
      const row = Math.floor(index / 3) * 3;
      if (k === "ArrowLeft") next = addYears(cursor, -1);
      else if (k === "ArrowRight") next = addYears(cursor, 1);
      else if (k === "ArrowUp") next = addYears(cursor, -3);
      else if (k === "ArrowDown") next = addYears(cursor, 3);
      else if (k === "Home") next = addYears(cursor, row - index);
      else if (k === "End") next = addYears(cursor, row + 2 - index);
      else if (k === "PageUp") next = addYears(cursor, -10);
      else if (k === "PageDown") next = addYears(cursor, 10);
    }
    if (next) {
      e.preventDefault();
      moveTo(next);
    }
  };

  const step = (d: 1 | -1) => moveTo(view === "day" ? addMonths(cursor, d) : view === "month" ? addYears(cursor, d) : addYears(cursor, d * 10), false);
  const prevLabel = view === "day" ? labels.previousMonth : view === "month" ? labels.previousYear : labels.previousDecade;
  const nextLabel = view === "day" ? labels.nextMonth : view === "month" ? labels.nextYear : labels.nextDecade;

  const start = pageStart(cursor.year);
  const liveText = view === "year" ? `${start} - ${start + 9}` : mode === "day" ? `${longMonths[cursor.month]} ${cursor.year}` : String(cursor.year);

  const grid = (() => {
    const common = { cursor, value, now, min, max, dir, t, onKeyDown: onGridKeyDown };
    if (view === "day") return <DayGrid key={`d-${cursor.year}-${cursor.month}`} {...common} locale={locale} firstDay={firstDay} onPick={onPick} />;
    if (view === "month") {
      return (
        <MonthGrid
          key={`m-${cursor.year}`}
          {...common}
          locale={locale}
          onPick={(v) => {
            if (mode === "month") onPick(v);
            else {
              setCursor({ ...cursor, year: v.year, month: v.month, day: Math.min(cursor.day, daysInMonth(v.year, v.month)) });
              switchView("day");
            }
          }}
        />
      );
    }
    return (
      <YearGrid
        key={`y-${start}`}
        {...common}
        onPick={(year) => {
          setCursor({ ...cursor, year, day: Math.min(cursor.day, daysInMonth(year, cursor.month)) });
          switchView(returnView.current);
        }}
      />
    );
  })();

  const headerButton = "kit-focus inline-flex min-h-10 items-center justify-center rounded-(--radius-control) px-3 text-sm font-semibold text-(--color-on-surface) transition-[scale,background-color] duration-75 ease-out hover:bg-(--color-surface-container) active:scale-[0.97] active:bg-(--color-border-subtle) motion-reduce:active:scale-100 aria-expanded:bg-(--color-surface-container)";
  const todayValue = now;
  const todayOff = isOutside(todayValue, min, max, mode === "day" ? "day" : "month");

  return (
    <div ref={rootRef} className="flex w-[calc(var(--kit-cell)*7)] flex-col gap-2 [--kit-cell:40px] pointer-coarse:[--kit-cell:44px]">
      {top}
      <div className="flex items-center justify-between gap-1">
        <button type="button" aria-label={prevLabel} onClick={() => step(-1)} className={iconButton}>
          <Arrow dir="left" />
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-0.5">
          {view === "year" ? (
            <span className="px-3 text-sm font-semibold text-(--color-on-surface)">{`${start} - ${start + 9}`}</span>
          ) : (
            <>
              {mode === "day" && (
                <button
                  type="button"
                  aria-label={`${labels.changeMonth}, ${longMonths[cursor.month]}`}
                  aria-expanded={view === "month"}
                  onClick={() => switchView(view === "month" ? "day" : "month", "day")}
                  className={headerButton}
                >
                  <Slide id={String(cursor.month)} dir={dir} t={t}>
                    <span data-testid="month-name">{longMonths[cursor.month]}</span>
                  </Slide>
                  <span aria-hidden="true" className="ml-1 flex text-(--color-on-surface-variant) [&_svg]:size-4">
                    <Arrow dir="down" />
                  </span>
                </button>
              )}
              <button
                type="button"
                aria-label={`${labels.changeYear}, ${cursor.year}`}
                onClick={() => switchView("year", view)}
                className={headerButton}
              >
                <Slide id={String(cursor.year)} dir={dir} t={t}>
                  <span data-testid="year-text">{cursor.year}</span>
                </Slide>
                <span aria-hidden="true" className="ml-1 flex text-(--color-on-surface-variant) [&_svg]:size-4">
                  <Arrow dir="down" />
                </span>
              </button>
            </>
          )}
        </div>
        <button type="button" aria-label={nextLabel} onClick={() => step(1)} className={iconButton}>
          <Arrow dir="right" />
        </button>
      </div>
      <span aria-live="polite" className="sr-only" data-testid="panel-live">
        {liveText}
      </span>
      <div className="grid h-[calc(var(--kit-cell)*6+2rem)] overflow-hidden">
        <AnimatePresence initial={false} custom={dir}>
          {grid}
        </AnimatePresence>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          aria-disabled={todayOff || undefined}
          onClick={() => {
            if (!todayOff) onPick(mode === "day" ? todayValue : { ...todayValue, day: 1 });
          }}
          className={cn(
            "kit-focus inline-flex min-h-10 items-center rounded-(--radius-control) px-3 text-sm font-medium text-(--color-primary) transition-[scale,background-color] duration-75 ease-out hover:bg-(--color-primary-container) active:scale-[0.97] motion-reduce:active:scale-100 aria-disabled:cursor-not-allowed aria-disabled:opacity-(--state-disabled-content) aria-disabled:hover:bg-transparent",
            coarseTarget,
          )}
        >
          {mode === "day" ? labels.today : labels.thisMonth}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Typed field

export interface TypedFieldProps {
  mode: "day" | "month";
  locale: string;
  value: YMD | null;
  min?: YMD;
  max?: YMD;
  twoDigitYearBase?: number;
  labels: TypedLabels;
  /** Called with a valid in range date, or null when the text was cleared and `allowEmpty` is set. */
  onCommit: (v: YMD | null) => void;
  /** Commit when the field loses focus (the date picker). Off inside the popover of the month picker. */
  commitOnBlur?: boolean;
  allowEmpty?: boolean;
  disabled?: boolean;
  /** Visible label above the field. Leave out when the control already has one. */
  label?: string;
  /** Rendered inside the field box, after the input (the calendar button). */
  adornment?: ReactNode;
  /** Wraps the field box (not the label or the hint), for example in a `PickerAnchor`. */
  wrapBox?: (box: ReactElement) => ReactElement;
  /** An error that comes from the app (required, server). */
  externalError?: string;
  required?: boolean;
  className?: string;
}

export function TypedField({ mode, locale, value, min, max, twoDigitYearBase, labels, onCommit, commitOnBlur = false, allowEmpty = false, disabled, label, adornment, wrapBox, externalError, required, className }: TypedFieldProps) {
  const uid = useId();
  const coarse = useCoarsePointer();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const shown = value ? formatTyped(value, mode, locale) : "";
  const [text, setText] = useState(shown);
  const [error, setError] = useState<string | null>(null);

  // A value that changes while the field is not being typed in (a pick from the grid, the app) replaces the text.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setText(shown);
      setError(null);
    }
  }, [shown]);

  const unit = mode === "day" ? "day" : "month";
  const messageFor = (reason: ParseFailure | "range") => labels.errors[reason] ?? labels.errors.format;

  const check = (raw: string): { value: YMD | null; error: string | null } => {
    const r = parseDateInput(raw, { mode, locale, twoDigitYearBase });
    if (!r.ok) return r.reason === "empty" && allowEmpty ? { value: null, error: null } : { value: null, error: messageFor(r.reason) };
    if (isOutside(r.value, min, max, unit)) return { value: null, error: messageFor("range") };
    return { value: r.value, error: null };
  };

  const submit = () => {
    if (text.trim() === "" && !allowEmpty) {
      setError(null);
      setText(shown);
      return;
    }
    const r = check(text);
    setError(r.error);
    if (r.error) return;
    if (r.value === null) {
      onCommit(null);
      setText("");
      return;
    }
    onCommit(r.value);
    setText(formatTyped(r.value, mode, locale));
  };

  const onChange = (raw: string) => {
    setText(raw);
    // While typing only say something when the text is already a complete date that is not allowed.
    const r = parseDateInput(raw, { mode, locale, twoDigitYearBase });
    setError(r.ok && isOutside(r.value, min, max, unit) ? messageFor("range") : null);
  };

  const shownError = error ?? externalError ?? null;
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;
  const inputId = `${uid}-input`;

  const box = (
    <div
      className={cn(
        "flex min-h-10 items-center rounded-(--radius-control) border bg-(--color-surface) transition-[border-color] duration-75 ease-out focus-within:border-(--color-primary) hover:border-(--color-on-surface-variant)",
        shownError ? "border-(--color-error)" : "border-(--color-outline)",
        disabled && "opacity-(--state-disabled-content)",
      )}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        inputMode={coarse ? "numeric" : "text"}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        required={required}
        aria-label={label ? undefined : labels.typeLabel}
        aria-invalid={shownError ? true : undefined}
        aria-describedby={shownError ? `${hintId} ${errorId}` : hintId}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        onBlur={() => {
          if (commitOnBlur) submit();
        }}
        className="kit-focus min-h-10 min-w-0 flex-1 rounded-(--radius-control) bg-transparent px-3 text-sm text-(--color-on-surface) outline-offset-[-2px] disabled:cursor-not-allowed"
      />
      {adornment}
    </div>
  );

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-(--color-on-surface)">
          {label}
          {required && (
            <span aria-hidden="true" className="ml-0.5 text-(--color-error)">
              *
            </span>
          )}
        </label>
      )}
      {wrapBox ? wrapBox(box) : box}
      <p id={hintId} className="text-xs text-(--color-on-surface-muted)">
        {labels.hint}
      </p>
      <span aria-live="polite" className="sr-only">
        {shownError}
      </span>
      {shownError && (
        <p id={errorId} className="flex items-start gap-1.5 text-sm text-(--color-error)">
          <span aria-hidden="true" className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-(--radius-sm) bg-(--color-error) text-xs font-bold leading-none text-(--color-on-error)">
            !
          </span>
          {shownError}
        </p>
      )}
    </div>
  );
}
