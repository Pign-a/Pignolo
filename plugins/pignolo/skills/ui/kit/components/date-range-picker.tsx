/**
 * DateRangePicker: pick a start and an end date (a stay, a trip, a report period).
 * Use when: the value is two dates in order. For one day use DatePicker, for a month MonthPicker.
 * Tier: direct (0.22 s, bounce 0, exit 0.1 s).
 * Primitive: shared calendar parts (calendar.tsx): two kit TextFields (start, end) that act as one
 *   control with the calendar button inside the end field, a Radix popover (or the kit BottomSheet
 *   when the pointer is coarse) with the calendar. Two months side by side from 768 px wide, one
 *   month on narrow screens and always one in the sheet.
 * Selecting: the first click sets the start, the second sets the end and closes. Between them every
 *   hovered (or keyboard focused) day previews the band; a click before the start moves the start;
 *   days closer to the start than `minNights` cannot be the end. With both ends set, a click starts a
 *   new range. Month, year and arrow navigation keep working while selecting.
 * Band: a continuous band of `--color-primary-container` between the ends, solid ends with rounded
 *   outer caps; the band breaks at the end of each week row with rounded caps. The preview is the same
 *   band at 55%, with an outlined end. Forced colors: ends Highlight, band Mark, preview dashed.
 * Typing: two fields, one per date, same es-AR formats as DatePicker. A start after the current end
 *   moves the end out (the end field empties); an end before the start (or closer than `minNights`)
 *   shows an error and is not committed. Enter or leaving a field commits it; Enter closes the calendar.
 * Opening: a click anywhere on either field, ArrowDown or Alt+ArrowDown, or the calendar button.
 *   Typing keeps working while it is open. Esc closes and returns focus.
 * Keyboard: see calendar.tsx. Enter or Space on a day sets the start, then the end.
 * Range: `min` and `max` disable days and keep them focusable; `minNights` (default 0).
 * Form: pass `name`; hidden inputs `name-start` and `name-end` post ISO dates (YYYY-MM-DD).
 * Names: the fields are named by `labels.startLabel` and `labels.endLabel` ("Desde", "Hasta"), and
 *   the start and end cells say it too (`labels.startAnnounce`, `labels.endAnnounce`).
 * Copy props: label and labels (including `nights`, a function from the count to the text).
 */
"use client";

import { useState } from "react";
import { cn } from "../lib/cn";
import { ordinalOf, toIsoDate, type YMD } from "../lib/date-input";
import { useMotionTier } from "../motion";
import { CalendarButton } from "./date-picker";
import { CalendarPanel, PickerField, PickerOverlay, TypedField, useDescribeId, useMediaQuery, type PickerLabels, type Presentation, type TypedErrors } from "./calendar";

export interface DateRange {
  start: YMD | null;
  end: YMD | null;
}

export interface DateRangeErrors extends TypedErrors {
  /** The end is before the start. */
  order?: string;
  /** The end is closer to the start than `minNights`. */
  minNights?: string;
}

export interface DateRangeLabels extends Omit<PickerLabels, "errors"> {
  errors: DateRangeErrors;
  /** Name and label of the start field, for example "Desde". */
  startLabel: string;
  /** Name and label of the end field, for example "Hasta". */
  endLabel: string;
  /** Added to the start cell for a screen reader, for example "fecha de inicio". */
  startAnnounce: string;
  /** Added to the end cell for a screen reader, for example "fecha de fin". */
  endAnnounce: string;
  /** Button that clears both dates. */
  clear: string;
  /** The length of the range as text, for example (n) => `${n} noches`. Leave out to show nothing. */
  nights?: (count: number) => string;
}

export interface DateRangePickerProps {
  /** Accessible name of the group of two fields. */
  label: string;
  labels: DateRangeLabels;
  value?: DateRange;
  defaultValue?: DateRange;
  onValueChange?: (value: DateRange) => void;
  min?: YMD;
  max?: YMD;
  /** The end must be at least this many days after the start. Default 0 (the same day is fine). */
  minNights?: number;
  /** BCP 47 tag for names, first weekday and the order of typed numbers. Default "es-AR". */
  locale?: string;
  disabled?: boolean;
  /** An error that comes from the app. Typing errors are produced by the fields themselves. */
  error?: string;
  /** Posts `name-start` and `name-end` (YYYY-MM-DD) with a form. */
  name?: string;
  twoDigitYearBase?: number;
  /** "auto" opens a bottom sheet on touch (`pointer: coarse`) and a popover otherwise. */
  presentation?: Presentation;
  /** Months side by side in the popover. "auto" shows 2 from 768 px wide. */
  months?: 1 | 2 | "auto";
  className?: string;
}

const EMPTY: DateRange = { start: null, end: null };

export function DateRangePicker({
  label,
  labels,
  value: controlled,
  defaultValue = EMPTY,
  onValueChange,
  min,
  max,
  minNights = 0,
  locale = "es-AR",
  disabled = false,
  error,
  name,
  twoDigitYearBase,
  presentation = "auto",
  months = "auto",
  className,
}: DateRangePickerProps) {
  const t = useMotionTier("direct");
  const [inner, setInner] = useState<DateRange>(defaultValue);
  const value = controlled ?? inner;
  const [open, setOpen] = useState(false);
  const [picks, setPicks] = useState(0);
  const wide = useMediaQuery("(min-width: 768px)");
  const shownMonths: 1 | 2 = months === "auto" ? (wide ? 2 : 1) : months;
  const hintId = useDescribeId();

  const commit = (next: DateRange) => {
    if (controlled === undefined) setInner(next);
    onValueChange?.(next);
  };

  const fits = (start: YMD, end: YMD) => ordinalOf(end) - ordinalOf(start) >= minNights;

  // A pick from the calendar: start, then end.
  const pick = (v: YMD) => {
    const { start, end } = value;
    if (!start || end || ordinalOf(v) < ordinalOf(start)) {
      commit({ start: v, end: null });
      setPicks((n) => n + 1);
      return;
    }
    if (!fits(start, v)) return;
    commit({ start, end: v });
    setPicks((n) => n + 1);
    setOpen(false);
  };

  const errors = labels.errors;
  const startField = (
    <TypedField
      mode="day"
      locale={locale}
      value={value.start}
      min={min}
      max={max}
      twoDigitYearBase={twoDigitYearBase}
      labels={labels}
      label={labels.startLabel}
      hint={null}
      describedBy={hintId}
      disabled={disabled}
      allowEmpty
      commitOnBlur
      resetToken={picks}
      onCommit={(v) => {
        // A start after the end moves the end out; otherwise the end stays.
        const keepEnd = v && value.end && fits(v, value.end) ? value.end : null;
        commit({ start: v, end: v ? keepEnd : null });
      }}
    />
  );
  const endField = (
    <TypedField
      mode="day"
      locale={locale}
      value={value.end}
      min={min}
      max={max}
      twoDigitYearBase={twoDigitYearBase}
      labels={labels}
      label={labels.endLabel}
      hint={null}
      describedBy={hintId}
      disabled={disabled}
      allowEmpty
      commitOnBlur
      resetToken={picks}
      externalError={error}
      adornment={<CalendarButton label={labels.choose} disabled={disabled} />}
      validate={(v) => {
        if (!value.start) return null;
        if (ordinalOf(v) < ordinalOf(value.start)) return errors.order ?? errors.range;
        return fits(value.start, v) ? null : (errors.minNights ?? errors.range);
      }}
      onCommit={(v) => {
        commit({ start: value.start, end: v });
        if (v) setOpen(false);
      }}
    />
  );

  const field = (
    <PickerField disabled={disabled}>
      <div className="grid gap-x-3 sm:grid-cols-2">
        {startField}
        {endField}
      </div>
      <p id={hintId} className="px-1 text-xs text-(--color-on-surface-variant)">
        {labels.hint}
      </p>
    </PickerField>
  );

  const length = value.start && value.end ? ordinalOf(value.end) - ordinalOf(value.start) : null;
  const footer = (
    <div className="flex min-h-10 items-center justify-between gap-2">
      <span aria-live="polite" data-testid="range-summary" className="px-1 text-sm text-(--color-on-surface-variant)">
        {length !== null && labels.nights ? labels.nights(length) : ""}
      </span>
      <button
        type="button"
        data-testid="range-clear"
        aria-disabled={!value.start && !value.end ? true : undefined}
        onClick={() => {
          if (!value.start && !value.end) return;
          commit(EMPTY);
          setPicks((n) => n + 1);
        }}
        className="kit-focus inline-flex min-h-10 items-center rounded-(--radius-control) px-3 text-sm font-medium text-(--color-primary) transition-[scale,background-color] duration-75 ease-out hover:bg-(--color-primary-container) active:scale-[0.97] motion-reduce:active:scale-100 aria-disabled:cursor-not-allowed aria-disabled:opacity-(--state-disabled-content) aria-disabled:hover:bg-transparent pointer-coarse:min-h-11"
      >
        {labels.clear}
      </button>
    </div>
  );

  const panel = (
    <CalendarPanel
      mode="day"
      locale={locale}
      value={null}
      min={min}
      max={max}
      labels={labels}
      onPick={pick}
      t={t}
      months={shownMonths}
      range={{ start: value.start, end: value.end, minNights, startLabel: labels.startAnnounce, endLabel: labels.endAnnounce }}
      footer={footer}
      sheetTop={
        <div className="grid gap-x-3 sm:grid-cols-2">
          <TypedField mode="day" locale={locale} value={value.start} min={min} max={max} twoDigitYearBase={twoDigitYearBase} labels={labels} label={labels.startLabel} hint={null} allowEmpty onCommit={(v) => commit({ start: v, end: v && value.end && fits(v, value.end) ? value.end : null })} />
          <TypedField
            mode="day"
            locale={locale}
            value={value.end}
            min={min}
            max={max}
            twoDigitYearBase={twoDigitYearBase}
            labels={labels}
            label={labels.endLabel}
            hint={null}
            allowEmpty
            validate={(v) => (value.start && !fits(value.start, v) ? (ordinalOf(v) < ordinalOf(value.start) ? (errors.order ?? errors.range) : (errors.minNights ?? errors.range)) : null)}
            onCommit={(v) => {
              commit({ start: value.start, end: v });
              if (v) setOpen(false);
            }}
          />
        </div>
      }
    />
  );

  return (
    <div role="group" aria-label={label} className={cn("w-full max-w-lg", className)}>
      <PickerOverlay open={open} onOpenChange={setOpen} presentation={presentation} title={labels.choose} closeLabel={labels.close} field={field} panel={panel} t={t} align="start" />
      {name !== undefined && value.start && <input type="hidden" name={`${name}-start`} value={toIsoDate(value.start)} />}
      {name !== undefined && value.end && <input type="hidden" name={`${name}-end`} value={toIsoDate(value.end)} />}
    </div>
  );
}
