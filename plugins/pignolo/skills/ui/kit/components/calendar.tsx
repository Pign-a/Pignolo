/**
 * Calendar parts shared by MonthPicker, DatePicker and DateRangePicker: the panel (day grid, 3 x 4
 * month grid, year grid per decade), the typed field, and the overlay (popover on desktop, bottom
 * sheet on touch). Not meant to be used alone; use `MonthPicker`, `DatePicker` or `DateRangePicker`.
 * Use when: never directly. See month-picker.tsx, date-picker.tsx and date-range-picker.tsx.
 * Tier: direct (0.22 s, bounce 0, exit 0.1 s).
 * Design (research 2026-10-25, sources in references/patterns/date-and-month-picker.md): NN/g and
 *   GOV.UK say a calendar suits dates near today and typing suits far ones, so a typed field is
 *   always there; the header is `<  [March] [2026]  >` with the month and the year as TWO buttons;
 *   the month button opens a 3 x 4 month grid, the year button a 12 year grid per decade with
 *   decade arrows; the grid REPLACES the calendar body (no popup inside a popup).
 * Size: the day grid always has 6 week rows. Days of the neighbour months fill the first and last
 *   row (muted, pickable), so no month leaves a gap above the Today button, and the month and year
 *   grids take exactly the height of the day grid: the panel never resizes between views or months.
 *   Popover: cells 40 px (44 px on a coarse pointer), width 7 cells (14 cells + gap for 2 months).
 *   Sheet: the panel fills the sheet (a sheet 520 px wide at most, centered), cells 48 px, text 16 px.
 * Primitive: @radix-ui/react-popover (dialog semantics, Esc, focus return) or BottomSheet when the
 *   primary pointer is coarse; grids are role="grid" with a roving tabindex.
 * Field: the typed field is the kit TextField (floating label). The whole field is the control: a click
 *   anywhere on it opens the popover without taking the caret away, typing keeps working while it is
 *   open, ArrowDown or Alt+ArrowDown opens it from the keyboard and, when it is open, moves focus into
 *   the grid. Esc closes and focus returns to where it was (the input, or the calendar button). The
 *   hover wash and border cover the box and the calendar button together.
 * Scroll: the popover is non-modal: the page keeps scrolling with the wheel and the popover follows
 *   its field (it hides when the field leaves the viewport). Only the sheet is a dialog that locks scroll.
 * Keyboard (WAI-ARIA APG date picker dialog; normative for the day grid): arrows move a day or a
 *   week, Home and End the start and end of the week, PageUp and PageDown a month, Shift+PageUp and
 *   Shift+PageDown a year, a shorter month clamps to its last day, Enter or Space picks, Esc closes
 *   and focus returns to the trigger. Month grid: arrows move a month or 3 months (rows of 3),
 *   Home and End the row, PageUp and PageDown a year. Year grid: arrows move a year or 3 years,
 *   Home and End the row, PageUp and PageDown a decade (these two grids are an inference, the APG
 *   has no month or year grid).
 * Range: `min` and `max` disable cells but keep them focusable (aria-disabled), so keyboard users
 *   can still travel and hear why. Dates are plain year, month, day numbers: no local midnight.
 *   Range mode (`range` prop): a continuous band between the two ends with rounded caps (the band
 *   breaks at the end of each week row), a lighter preview of the band under the pointer or the
 *   focused day before the second pick, and `minNights` of cells after the start disabled.
 * Motion: month changes slide 10 px and fade from the side they move toward; view changes
 *   cross-fade. Transform and opacity only. Reduced motion: fade only.
 * Forced colors: selected ends are Highlight, the band is Mark, the preview is a dashed outline.
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
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
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
  fromOrdinal,
  isOutside,
  monthIndex,
  monthNames,
  ordinalOf,
  parseDateInput,
  todayYMD,
  weekdayNames,
  weekdayOf,
  type ParseFailure,
  type YMD,
} from "../lib/date-input";
import { coarseTarget, type MotionTier } from "../motion";
import { BottomSheet } from "./bottom-sheet";
import { TextField } from "./text-field";

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
// Media queries and overlay

const subscribeMedia = (query: string) => (cb: () => void) => {
  const q = window.matchMedia(query);
  q.addEventListener("change", cb);
  return () => q.removeEventListener("change", cb);
};
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    subscribeMedia(query),
    () => window.matchMedia(query).matches,
    () => false,
  );
}
export function useCoarsePointer(): boolean {
  return useMediaQuery("(pointer: coarse)");
}

/** How the panel was opened: the calendar button, a click on the field, or the keyboard. */
type OpenSource = "trigger" | "field" | "key";

interface PanelApi {
  focusCursor: () => void;
}

interface OverlayCtx {
  sheet: boolean;
  open: boolean;
  /** Open or close from the calendar button (the opener is the button). */
  setOpen: (open: boolean) => void;
  /** Open from the field. `opener` gets the focus back on close. */
  requestOpen: (source: OpenSource, opener?: HTMLElement | null) => void;
  sourceRef: MutableRefObject<OpenSource>;
  zoneRef: MutableRefObject<HTMLElement | null>;
  panelApi: MutableRefObject<PanelApi | null>;
}
const OverlayContext = createContext<OverlayCtx | null>(null);

/**
 * The field zone: the element the popover aligns to and the click target that opens it. Put the
 * `TypedField`(s) and the `PickerTrigger` inside. In the sheet it only forwards clicks and keys.
 */
export function PickerField({ children, className, disabled }: { children: ReactNode; className?: string; disabled?: boolean }) {
  const ctx = useContext(OverlayContext);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (ctx) ctx.zoneRef.current = ref.current;
  });
  const inBox = (target: EventTarget) => {
    const el = target as Element;
    return !!el.closest?.("[data-field-box]") && !el.closest?.("[data-picker-trigger]");
  };
  const props = {
    ref,
    "data-picker-field": "",
    className: cn(
      // One control: the box wash covers the input and the calendar button together.
      !disabled && "[&_[data-field-box]:hover]:bg-(--color-surface-container) [&_[data-field-box]]:cursor-text [&_[data-field-box]]:transition-[background-color,border-color] [&_[data-field-box]]:duration-75",
      className,
    ),
    onMouseDown: (e: ReactMouseEvent) => {
      // On touch the sheet opens instead of the keyboard: do not focus the input.
      if (ctx?.sheet && !disabled && inBox(e.target)) e.preventDefault();
    },
    onClick: (e: ReactMouseEvent) => {
      if (!ctx || disabled || !inBox(e.target) || ctx.open) return;
      const input = (e.target as Element).closest("[data-field-box]")?.querySelector("input") ?? null;
      ctx.requestOpen("field", ctx.sheet ? null : input);
    },
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
      if (!ctx || disabled) return;
      const target = e.target as HTMLElement;
      if (e.key !== "ArrowDown" || target.tagName !== "INPUT" || e.shiftKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      if (ctx.open) ctx.panelApi.current?.focusCursor();
      else ctx.requestOpen("key", target);
    },
  };
  if (!ctx || ctx.sheet) return <div {...props}>{children}</div>;
  return <Popover.Anchor {...props}>{children}</Popover.Anchor>;
}

/** The button that opens the panel: a Radix trigger in a popover, a plain toggle in the sheet. */
export function PickerTrigger({ children, disabled }: { children: ReactElement<{ onClick?: (e: React.MouseEvent) => void }>; disabled?: boolean }) {
  const ctx = useContext(OverlayContext);
  if (!ctx) return children;
  const marked = cloneElement(children as ReactElement<Record<string, unknown>>, { "data-picker-trigger": "" });
  if (!ctx.sheet) {
    return (
      <Popover.Trigger asChild disabled={disabled}>
        {marked}
      </Popover.Trigger>
    );
  }
  return cloneElement(marked, {
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
  /** The control that holds a `PickerField` and a `PickerTrigger`. */
  field: ReactNode;
  /** The panel. It is mounted only while open, so it starts fresh every time. */
  panel: ReactNode;
  t: MotionTier;
  align?: "start" | "center" | "end";
}

export function PickerOverlay({ open, onOpenChange, presentation, title, closeLabel, field, panel, t, align = "center" }: PickerOverlayProps) {
  const coarse = useCoarsePointer();
  const sheet = presentation === "sheet" || (presentation === "auto" && coarse);
  const sourceRef = useRef<OpenSource>("trigger");
  const openerRef = useRef<HTMLElement | null>(null);
  const zoneRef = useRef<HTMLElement | null>(null);
  const panelApi = useRef<PanelApi | null>(null);
  const ctx: OverlayCtx = {
    sheet,
    open,
    setOpen: (next) => {
      if (next && !open) {
        sourceRef.current = "trigger";
        openerRef.current = null;
      }
      onOpenChange(next);
    },
    requestOpen: (source, opener) => {
      if (open) return;
      sourceRef.current = source;
      openerRef.current = opener ?? null;
      onOpenChange(true);
    },
    sourceRef,
    zoneRef,
    panelApi,
  };

  if (sheet) {
    return (
      <OverlayContext.Provider value={ctx}>
        {field}
        <BottomSheet open={open} onOpenChange={onOpenChange} title={title} closeLabel={closeLabel} className="max-w-[520px]!">
          <div className="mx-auto w-full pb-2">{panel}</div>
        </BottomSheet>
      </OverlayContext.Provider>
    );
  }
  return (
    <OverlayContext.Provider value={ctx}>
      <Popover.Root open={open} onOpenChange={ctx.setOpen}>
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
                hideWhenDetached
                aria-label={title}
                onOpenAutoFocus={(e) => e.preventDefault()}
                onInteractOutside={(e) => {
                  // A click on the field (the input, the label, the box) is not an outside click.
                  if (zoneRef.current?.contains(e.target as Node)) e.preventDefault();
                }}
                onCloseAutoFocus={(e) => {
                  // Opened from the field: the focus goes back to the input, not to the calendar button.
                  const opener = openerRef.current;
                  openerRef.current = null;
                  if (opener?.isConnected) {
                    e.preventDefault();
                    opener.focus({ preventScroll: true });
                  }
                }}
              >
                <m.div
                  className="z-50 max-h-(--radix-popover-content-available-height) origin-(--radix-popover-content-transform-origin) overflow-y-auto rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-surface) p-3 shadow-(--elevation-3) outline-none"
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

function cellClass(o: { selected: boolean; now: boolean; off: boolean; muted?: boolean; inBand?: boolean; preview?: boolean }) {
  return cn(
    "kit-focus relative w-full px-1 text-sm group-data-[sheet]/panel:text-base transition-[scale,background-color] duration-75 ease-out outline-offset-[-2px] active:scale-[0.97] motion-reduce:active:scale-100",
    o.inBand ? "rounded-none" : "rounded-(--radius-control)",
    o.selected
      ? "bg-(--color-primary) font-semibold text-(--color-on-primary) hover:bg-(--color-primary-hover) active:bg-(--color-primary-pressed) forced-colors:[forced-color-adjust:none] forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]"
      : o.preview
        ? "border border-(--color-primary) bg-(--color-primary-container) font-semibold text-(--color-on-primary-container) forced-colors:[forced-color-adjust:none] forced-colors:border-dashed forced-colors:border-[Highlight] forced-colors:bg-[Canvas] forced-colors:text-[CanvasText]"
        : o.inBand
          ? "text-(--color-on-primary-container) hover:bg-[color-mix(in_srgb,var(--color-primary)_16%,var(--color-primary-container))] active:bg-[color-mix(in_srgb,var(--color-primary)_24%,var(--color-primary-container))] forced-colors:[forced-color-adjust:none] forced-colors:text-[MarkText]"
          : cn(o.muted ? "text-(--color-on-surface-muted)" : "text-(--color-on-surface)", !o.off && "hover:bg-(--color-surface-container) active:bg-(--color-border-subtle)"),
    o.now && !o.selected && !o.preview && "border border-(--color-primary) text-(--color-primary)",
    o.off && "cursor-not-allowed opacity-(--state-disabled-content) active:scale-100",
  );
}

type View = "day" | "month" | "year";
const pageStart = (year: number) => Math.floor(year / 10) * 10;
const fromIndex = (i: number): { year: number; month: number } => ({ year: Math.floor(i / 12), month: ((i % 12) + 12) % 12 });

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

// ---------------------------------------------------------------------------------------------
// Range

export interface RangeSelection {
  start: YMD | null;
  end: YMD | null;
  /** Cells after the start closer than this many days cannot be the end. Default 0 (a one day range is fine). */
  minNights: number;
  /** Names added to the start and end cells for a screen reader, for example "fecha de inicio". */
  startLabel: string;
  endLabel: string;
}

interface Band {
  /** Ordinal of the start, null when there is none. */
  lo: number | null;
  /** Ordinal of the end or of the previewed end. */
  hi: number | null;
  preview: boolean;
  /** Choosing the end: the start is set and the end is not. */
  selecting: boolean;
  minNights: number;
  startLabel: string;
  endLabel: string;
}

// ---------------------------------------------------------------------------------------------
// Grids

interface BlockProps {
  year: number;
  month: number;
  cursor: YMD;
  value: YMD | null;
  now: YMD;
  min?: YMD;
  max?: YMD;
  locale: string;
  firstDay: number;
  showOutside: boolean;
  band: Band | null;
  onPick: (v: YMD) => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  onPreview: (v: YMD | null) => void;
}

/** One month: weekday header and six week rows. */
function MonthBlock({ year, month, cursor, value, now, min, max, locale, firstDay, showOutside, band, onPick, onKeyDown, onPreview }: BlockProps) {
  const short = weekdayNames(locale, firstDay, "short");
  const long = weekdayNames(locale, firstDay, "long");
  const lead = (weekdayOf({ year, month, day: 1 }) - firstDay + 7) % 7;
  const dim = daysInMonth(year, month);
  const firstOrd = ordinalOf({ year, month, day: 1 });
  const hasBand = band !== null && band.lo !== null && band.hi !== null && band.hi > band.lo;
  return (
    <div
      role="grid"
      aria-label={`${monthNames(locale, "long")[month]} ${year}`}
      aria-multiselectable={band ? true : undefined}
      onKeyDown={onKeyDown}
      onPointerLeave={band ? () => onPreview(null) : undefined}
      className="flex min-w-0 flex-1 flex-col"
    >
      <div role="row" className="grid h-(--kit-head) grid-cols-7">
        {short.map((s, i) => (
          <div key={i} role="columnheader" aria-label={long[i]} className="flex items-center justify-center text-xs font-medium text-(--color-on-surface-muted)">
            {s}
          </div>
        ))}
      </div>
      {[0, 1, 2, 3, 4, 5].map((r) => (
        <div role="row" key={r} className="grid h-(--kit-cell) grid-cols-7">
          {[0, 1, 2, 3, 4, 5, 6].map((c) => {
            const idx = r * 7 + c - lead;
            const inMonth = idx >= 0 && idx < dim;
            if (!inMonth && !showOutside) return <div key={c} role="gridcell" aria-hidden="true" />;
            const v: YMD = inMonth ? { year, month, day: idx + 1 } : fromOrdinal(firstOrd + idx);
            if (v.year < YEAR_MIN || v.year > YEAR_MAX) return <div key={c} role="gridcell" aria-hidden="true" />;
            const ord = firstOrd + idx;
            const isNow = now.year === v.year && now.month === v.month && now.day === v.day;
            const isCursor = inMonth && cursor.day === idx + 1;
            let off = isOutside(v, min, max, "day");

            let pos: "start" | "end" | "in" | null = null;
            let isSelected = value !== null && value.year === v.year && value.month === v.month && value.day === v.day;
            if (band && band.lo !== null) {
              pos = ord === band.lo ? "start" : band.hi !== null && ord === band.hi ? "end" : band.hi !== null && ord > band.lo && ord < band.hi ? "in" : null;
              isSelected = pos === "start" || (pos === "end" && !band.preview);
              if (band.selecting && ord > band.lo && ord < band.lo + band.minNights) off = true;
            }
            const previewEnd = pos === "end" && band !== null && band.preview;
            const edgeStart = c === 0;
            const edgeEnd = c === 6;
            const label = formatLongDate(v, locale);
            const name = pos === "start" && band ? `${label}, ${band.startLabel}` : pos === "end" && band && !band.preview ? `${label}, ${band.endLabel}` : label;
            return (
              <div
                role="gridcell"
                key={c}
                aria-selected={band ? pos !== null && !previewEnd : isSelected}
                className={cn(
                  "flex items-stretch",
                  hasBand && pos === "in" && cn("overflow-hidden", band?.preview ? "bg-[color-mix(in_srgb,var(--color-primary-container)_55%,transparent)] forced-colors:border-y forced-colors:border-dashed forced-colors:border-[Highlight]" : "bg-(--color-primary-container) forced-colors:[forced-color-adjust:none] forced-colors:bg-[Mark] forced-colors:text-[MarkText]", edgeStart && "rounded-l-(--radius-control)", edgeEnd && "rounded-r-(--radius-control)"),
                )}
              >
                <button
                  type="button"
                  tabIndex={isCursor ? 0 : -1}
                  aria-label={name}
                  aria-disabled={off || undefined}
                  aria-current={isNow ? "date" : undefined}
                  data-autofocus={isCursor ? "" : undefined}
                  {...(inMonth ? { "data-day-cell": "" } : { "data-outside-cell": "" })}
                  data-year={v.year}
                  data-month={v.month}
                  data-day={v.day}
                  data-range={pos ? (previewEnd ? "preview-end" : pos) : undefined}
                  onClick={() => {
                    if (!off) onPick(v);
                  }}
                  onPointerEnter={band ? () => onPreview(v) : undefined}
                  onFocus={band ? () => onPreview(v) : undefined}
                  className={cn(
                    cellClass({ selected: isSelected, now: isNow, off, muted: !inMonth, inBand: pos === "in", preview: previewEnd }),
                    "h-full",
                    hasBand && pos === "start" && !edgeEnd && "rounded-r-none",
                    hasBand && pos === "end" && !previewEnd && !edgeStart && "rounded-l-none",
                    previewEnd && !edgeStart && "rounded-l-none",
                  )}
                >
                  {v.day}
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

interface DayGridProps extends GridBase {
  /** Index of the first month shown (year * 12 + month). */
  first: number;
  months: 1 | 2;
  locale: string;
  firstDay: number;
  band: Band | null;
  onPick: (v: YMD) => void;
  onPreview: (v: YMD | null) => void;
}

function DayGrid({ cursor, value, now, min, max, dir, t, onKeyDown, first, months, locale, firstDay, band, onPick, onPreview }: DayGridProps) {
  const present = useIsPresent();
  return (
    <m.div data-view-slide="" inert={!present} className="col-start-1 row-start-1 flex gap-(--kit-gap)" {...gridMotion(t, dir)}>
      {Array.from({ length: months }, (_, i) => {
        const { year, month } = fromIndex(first + i);
        return (
          <MonthBlock
            key={i}
            year={year}
            month={month}
            cursor={cursor}
            value={value}
            now={now}
            min={min}
            max={max}
            locale={locale}
            firstDay={firstDay}
            showOutside={months === 1}
            band={band}
            onPick={onPick}
            onKeyDown={onKeyDown}
            onPreview={onPreview}
          />
        );
      })}
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
      data-view-slide=""
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
      data-view-slide=""
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
  /** Content above the header, only inside the sheet (typed access when the page field is hidden behind it). */
  sheetTop?: ReactNode;
  /** Range mode (day mode only): the band between `start` and `end`, `value` is ignored. */
  range?: RangeSelection;
  /** 2 shows two months side by side (popover only, the sheet always shows one). Default 1. */
  months?: 1 | 2;
  /** Replaces the Today button. */
  footer?: ReactNode;
  /** The panel follows this date when it changes while open (a typed date). Default: `value`. */
  revealDate?: YMD | null;
}

const dateKey = (v: YMD | null | undefined) => (v ? `${v.year}-${v.month}-${v.day}` : "");

export function CalendarPanel({ mode, locale, value, min, max, labels, onPick, t, top, sheetTop, range, months: monthsProp = 1, footer, revealDate }: CalendarPanelProps) {
  const base: View = mode === "day" ? "day" : "month";
  const now = todayYMD();
  const overlay = useContext(OverlayContext);
  const inSheet = overlay?.sheet ?? false;
  const months: 1 | 2 = inSheet || mode === "month" ? 1 : monthsProp;
  const anchorDate = revealDate !== undefined ? revealDate : range ? (range.end ?? range.start) : value;
  const [view, setView] = useState<View>(base);
  // Open on the value; with none, on today, or on the nearest allowed day when today is outside min and max.
  const startAt = (): YMD => anchorDate ?? (min && ordinalOf(now) < ordinalOf(min) ? min : max && ordinalOf(now) > ordinalOf(max) ? max : now);
  const [cursor, setCursor] = useState<YMD>(startAt);
  const [firstState, setFirstState] = useState(() => monthIndex(startAt()));
  const [dir, setDir] = useState<-1 | 0 | 1>(0);
  const [preview, setPreview] = useState<YMD | null>(null);
  const returnView = useRef<View>(base);
  // The sheet focuses `data-autofocus` itself and remembers the opener; focusing here first would hide the opener from it.
  // A click on the field must not take the caret away from the input either.
  const wantFocus = useRef(!inSheet && overlay?.sourceRef.current !== "field");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const firstDay = firstWeekday(locale);
  const longMonths = monthNames(locale, "long");

  const first = months === 2 ? firstState : monthIndex(cursor);

  const cursorSelector = () =>
    view === "day"
      ? `[data-day-cell][data-year="${cursor.year}"][data-month="${cursor.month}"][data-day="${cursor.day}"]`
      : view === "month"
        ? `[data-month-cell][data-year="${cursor.year}"][data-month="${cursor.month}"]`
        : `[data-year-cell][data-year="${cursor.year}"]`;
  const focusCursor = () => rootRef.current?.querySelector<HTMLElement>(`[data-view-slide]:not([inert]) ${cursorSelector()}`)?.focus({ preventScroll: true });

  // Keep keyboard focus on the cursor cell after it moves or the view changes.
  useEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    focusCursor();
  });

  // Let the field move the focus into the grid (ArrowDown while the popover is open).
  const apiRef = useRef(focusCursor);
  apiRef.current = focusCursor;
  useEffect(() => {
    if (!overlay) return;
    const api: PanelApi = { focusCursor: () => apiRef.current() };
    overlay.panelApi.current = api;
    return () => {
      if (overlay.panelApi.current === api) overlay.panelApi.current = null;
    };
  }, [overlay]);

  // A date typed in the field while the panel is open moves the calendar to it.
  const anchorKey = dateKey(anchorDate);
  const seen = useRef(anchorKey);
  useEffect(() => {
    if (seen.current === anchorKey) return;
    seen.current = anchorKey;
    if (!anchorDate) return;
    setDir(monthIndex(anchorDate) > first ? 1 : monthIndex(anchorDate) < first ? -1 : 0);
    setCursor(anchorDate);
    if (months === 2 && (monthIndex(anchorDate) < first || monthIndex(anchorDate) > first + 1)) setFirstState(monthIndex(anchorDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorKey]);

  const keyOf = (v: YMD, w: View) => (w === "day" ? v.year * 12 + v.month : w === "month" ? v.year : pageStart(v.year));
  const inBounds = (v: YMD) => v.year >= YEAR_MIN && v.year <= YEAR_MAX;
  const moveTo = (next: YMD, focus = true) => {
    const n = inBounds(next) ? next : cursor;
    const idx = monthIndex(n);
    const nextFirst = months === 2 ? (idx < firstState ? idx : idx > firstState + 1 ? idx - 1 : firstState) : idx;
    const a = view === "day" ? first : keyOf(cursor, view);
    const b = view === "day" ? nextFirst : keyOf(n, view);
    if (a !== b) setDir(b > a ? 1 : -1);
    wantFocus.current = focus;
    if (months === 2) setFirstState(nextFirst);
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

  const step = (d: 1 | -1) => {
    if (view === "day" && months === 2) {
      const n = addMonths(cursor, d);
      if (!inBounds(n)) return;
      setDir(d);
      wantFocus.current = false;
      setFirstState(firstState + d);
      setCursor(n);
      return;
    }
    moveTo(view === "day" ? addMonths(cursor, d) : view === "month" ? addYears(cursor, d) : addYears(cursor, d * 10), false);
  };
  const prevLabel = view === "day" ? labels.previousMonth : view === "month" ? labels.previousYear : labels.previousDecade;
  const nextLabel = view === "day" ? labels.nextMonth : view === "month" ? labels.nextYear : labels.nextDecade;

  const shown = fromIndex(first);
  const start = pageStart(cursor.year);
  const twin = view === "day" && months === 2;
  const liveText =
    view === "year"
      ? `${start} - ${start + 9}`
      : mode === "day"
        ? twin
          ? `${longMonths[shown.month]} ${shown.year}, ${longMonths[fromIndex(first + 1).month]} ${fromIndex(first + 1).year}`
          : `${longMonths[shown.month]} ${shown.year}`
        : String(cursor.year);

  // Range band.
  let band: Band | null = null;
  if (range && mode === "day") {
    const lo = range.start ? ordinalOf(range.start) : null;
    const selecting = lo !== null && !range.end;
    let hi: number | null = range.end ? ordinalOf(range.end) : null;
    let isPreview = false;
    if (selecting && lo !== null && preview && ordinalOf(preview) >= lo + range.minNights && ordinalOf(preview) > lo) {
      hi = ordinalOf(preview);
      isPreview = true;
    }
    band = { lo, hi, preview: isPreview, selecting, minNights: range.minNights, startLabel: range.startLabel, endLabel: range.endLabel };
  }

  const grid = (() => {
    const common = { cursor, value: range ? null : value, now, min, max, dir, t, onKeyDown: onGridKeyDown };
    if (view === "day") {
      return (
        <DayGrid
          key={`d-${first}`}
          {...common}
          first={first}
          months={months}
          locale={locale}
          firstDay={firstDay}
          band={band}
          onPreview={setPreview}
          onPick={(v) => {
            // A pick from a neighbour month moves the calendar there, and the cursor goes with it.
            const idx = monthIndex(v);
            if (months === 1 && idx !== first) setDir(idx > first ? 1 : -1);
            setCursor(v);
            onPick(v);
          }}
        />
      );
    }
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
              setFirstState(monthIndex(v));
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
          const c = { ...cursor, year, day: Math.min(cursor.day, daysInMonth(year, cursor.month)) };
          setCursor(c);
          setFirstState(monthIndex(c));
          switchView(returnView.current);
        }}
      />
    );
  })();

  const headerButton = "kit-focus inline-flex min-h-10 items-center justify-center rounded-(--radius-control) px-3 text-sm font-semibold text-(--color-on-surface) transition-[scale,background-color] duration-75 ease-out hover:bg-(--color-surface-container) active:scale-[0.97] active:bg-(--color-border-subtle) motion-reduce:active:scale-100 aria-expanded:bg-(--color-surface-container)";
  const todayValue = now;
  const todayOff = isOutside(todayValue, min, max, mode === "day" ? "day" : "month");

  const monthYearButtons = (
    <>
      {mode === "day" && (
        <button
          type="button"
          aria-label={`${labels.changeMonth}, ${longMonths[shown.month]}`}
          aria-expanded={view === "month"}
          onClick={() => {
            if (months === 2 && view === "day") setCursor({ ...shown, day: Math.min(cursor.day, daysInMonth(shown.year, shown.month)) });
            switchView(view === "month" ? "day" : "month", "day");
          }}
          className={headerButton}
        >
          <Slide id={String(shown.month)} dir={dir} t={t}>
            <span data-testid="month-name">{longMonths[shown.month]}</span>
          </Slide>
          <span aria-hidden="true" className="ml-1 flex text-(--color-on-surface-variant) [&_svg]:size-4">
            <Arrow dir="down" />
          </span>
        </button>
      )}
      <button
        type="button"
        aria-label={`${labels.changeYear}, ${view === "day" ? shown.year : cursor.year}`}
        onClick={() => {
          if (months === 2 && view === "day") setCursor({ ...shown, day: Math.min(cursor.day, daysInMonth(shown.year, shown.month)) });
          switchView("year", view);
        }}
        className={headerButton}
      >
        <Slide id={String(view === "day" ? shown.year : cursor.year)} dir={dir} t={t}>
          <span data-testid="year-text">{view === "day" ? shown.year : cursor.year}</span>
        </Slide>
        <span aria-hidden="true" className="ml-1 flex text-(--color-on-surface-variant) [&_svg]:size-4">
          <Arrow dir="down" />
        </span>
      </button>
    </>
  );

  const prevButton = (
    <button type="button" aria-label={prevLabel} onClick={() => step(-1)} className={iconButton}>
      <Arrow dir="left" />
    </button>
  );
  const nextButton = (
    <button type="button" aria-label={nextLabel} onClick={() => step(1)} className={iconButton}>
      <Arrow dir="right" />
    </button>
  );
  const spacer = <span aria-hidden="true" className="size-10 shrink-0 pointer-coarse:size-11" />;
  const second = fromIndex(first + 1);

  const header = twin ? (
    <div className="flex items-center gap-(--kit-gap)">
      <div className="flex min-w-0 flex-1 items-center justify-between gap-1">
        {prevButton}
        <div className="flex min-w-0 flex-1 items-center justify-center gap-0.5">{monthYearButtons}</div>
        {spacer}
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-1">
        {spacer}
        <span data-testid="second-month" className="px-3 text-sm font-semibold text-(--color-on-surface)">{`${longMonths[second.month]} ${second.year}`}</span>
        {nextButton}
      </div>
    </div>
  ) : (
    <div className="flex items-center justify-between gap-1">
      {prevButton}
      <div className="flex min-w-0 flex-1 items-center justify-center gap-0.5">
        {view === "year" ? <span className="px-3 text-sm font-semibold text-(--color-on-surface)">{`${start} - ${start + 9}`}</span> : monthYearButtons}
      </div>
      {nextButton}
    </div>
  );

  return (
    <div
      ref={rootRef}
      data-sheet={inSheet ? "" : undefined}
      data-months={months}
      className={cn(
        "group/panel flex flex-col gap-2 [--kit-gap:1.5rem]",
        inSheet
          ? "w-full [--kit-cell:48px] [--kit-head:2.25rem]"
          : cn("[--kit-cell:40px] [--kit-head:2rem] pointer-coarse:[--kit-cell:44px]", months === 2 ? "w-[calc(var(--kit-cell)*14+var(--kit-gap))]" : "w-[calc(var(--kit-cell)*7)]"),
      )}
    >
      {inSheet && sheetTop}
      {top}
      {header}
      <span aria-live="polite" className="sr-only" data-testid="panel-live">
        {liveText}
      </span>
      {/* Six week rows plus the weekday row: the month and year grids take the same height. */}
      <div className="grid h-[calc(var(--kit-cell)*6+var(--kit-head))] overflow-hidden">
        <AnimatePresence initial={false} custom={dir}>
          {grid}
        </AnimatePresence>
      </div>
      {footer !== undefined ? (
        footer
      ) : (
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
      )}
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
  /** Label inside the box (it rises when the field is focused or filled). Default `labels.typeLabel`. */
  label?: string;
  /** Helper text under the field. Default `labels.hint`; `null` for none (the caller shows one for several fields). */
  hint?: string | null;
  /** The calendar button, inside the box at the right. */
  adornment?: ReactNode;
  /** An error that comes from the app (required, server). */
  externalError?: string;
  /** Extra rule on a complete date: return the message, or null when it is fine (the range order). */
  validate?: (v: YMD) => string | null;
  /** Changes when the app replaced the value with a pick, so a half typed text is dropped. */
  resetToken?: number;
  required?: boolean;
  /** Id of a description outside the field (the shared hint of a range). */
  describedBy?: string;
  className?: string;
}

export function TypedField({ mode, locale, value, min, max, twoDigitYearBase, labels, onCommit, commitOnBlur = false, allowEmpty = false, disabled, label, hint, adornment, externalError, validate, resetToken, required, describedBy, className }: TypedFieldProps) {
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
  }, [shown, resetToken]);

  const unit = mode === "day" ? "day" : "month";
  const messageFor = (reason: ParseFailure | "range") => labels.errors[reason] ?? labels.errors.format;

  const check = (raw: string): { value: YMD | null; error: string | null } => {
    const r = parseDateInput(raw, { mode, locale, twoDigitYearBase });
    if (!r.ok) return r.reason === "empty" && allowEmpty ? { value: null, error: null } : { value: null, error: messageFor(r.reason) };
    if (isOutside(r.value, min, max, unit)) return { value: null, error: messageFor("range") };
    const rule = validate?.(r.value) ?? null;
    if (rule) return { value: null, error: rule };
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
    setError(r.ok ? (isOutside(r.value, min, max, unit) ? messageFor("range") : (validate?.(r.value) ?? null)) : null);
  };

  const shownError = error ?? externalError ?? null;

  return (
    <TextField
      ref={inputRef}
      type="text"
      label={label ?? labels.typeLabel}
      helperText={hint === null ? undefined : (hint ?? labels.hint)}
      error={shownError ?? undefined}
      trailing={adornment}
      value={text}
      inputMode={coarse ? "numeric" : "text"}
      autoComplete="off"
      spellCheck={false}
      disabled={disabled}
      required={required}
      aria-describedby={describedBy}
      className={className}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        }
      }}
      onBlur={(e) => {
        if (!commitOnBlur) return;
        // Moving into the calendar is not leaving: a half typed text must not raise an error there.
        const next = e.relatedTarget as Element | null;
        if (next?.closest?.('[role="dialog"]')) return;
        submit();
      }}
    />
  );
}

/** A stable id for descriptions shared by several fields. */
export function useDescribeId(): string {
  return `${useId()}-hint`;
}
