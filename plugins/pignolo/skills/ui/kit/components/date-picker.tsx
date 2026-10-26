/**
 * DatePicker: pick a day. Replaces the native date input.
 * Use when: the value is a date. Near dates come from the calendar, far ones (a birthday) from typing
 *   or from the month and year buttons of the calendar header. For a month use MonthPicker, for a
 *   stay or a period use DateRangePicker.
 * Tier: direct (0.22 s, bounce 0, exit 0.1 s).
 * Primitive: shared calendar parts (calendar.tsx): the kit TextField (floating label) with the
 *   calendar button inside the same box, a Radix popover (or the kit BottomSheet when the pointer is
 *   coarse) with the day grid. The header `<  [Marzo] [2026]  >` has two buttons: the month opens a
 *   3 x 4 month grid, the year a 12 year grid per decade with decade arrows; the grid replaces the body.
 * Opening: the whole field is one control. A click or tap anywhere on it opens the calendar (the
 *   caret stays in the input and typing keeps working), the calendar button toggles it and moves the
 *   focus to the day, ArrowDown or Alt+ArrowDown on the focused input opens it (ArrowDown again moves
 *   into the grid). Enter in the input commits the typed date and closes. Esc closes and returns focus.
 *   Hover washes the box and the button together. On touch the field opens the sheet instead of the
 *   keyboard, and the sheet has its own typed field at the top.
 * Typing: always available, and the first way in. es-AR accepts 5/3/26, 5-3-2026, 05.03.2026,
 *   5 mar 2026, 5 de marzo de 2026, 2026-03-05, 05032026 (day, month, year; en-US is month first).
 *   Two digit years are 20xx (`twoDigitYearBase`). Anything unclear or impossible (31/4, 29/2 of a
 *   common year) shows an error and is never guessed. The format is helper text, not a placeholder.
 *   Enter or leaving the field commits; an empty field clears the value.
 * Size: the calendar always has 6 week rows (days of the next and previous month fill them), so the
 *   Today button sits right under the grid and the panel never changes height. In the sheet the panel
 *   fills a sheet up to 520 px wide with 48 px cells.
 * Keyboard: see calendar.tsx (WAI-ARIA APG date picker dialog).
 * Range: `min` and `max` disable days and keep them focusable.
 * Form: pass `name`; a hidden input posts the ISO date (YYYY-MM-DD) or nothing when empty.
 * States: field rest, hover (box and button together), focus (label up, ring), error, disabled;
 *   calendar button rest, hover, focus-visible, press, open; day rest, hover, focus-visible, selected,
 *   today (outlined), out of range, other month (muted).
 * Motion: see calendar.tsx. Reduced motion: cross-fade only.
 * Copy props: label and labels. Names and first weekday come from `locale` (default es-AR).
 */
"use client";

import { useState } from "react";
import { cn } from "../lib/cn";
import { toIsoDate, type YMD } from "../lib/date-input";
import { coarseTarget, useMotionTier } from "../motion";
import { CalendarPanel, PickerField, PickerOverlay, PickerTrigger, TypedField, type PickerLabels, type Presentation } from "./calendar";

export type DateValue = YMD;
export type DatePickerLabels = PickerLabels;

export interface DatePickerProps {
  /** Label inside the field; it rises when the field is focused or filled. */
  label: string;
  labels: DatePickerLabels;
  value?: DateValue | null;
  defaultValue?: DateValue | null;
  onValueChange?: (value: DateValue | null) => void;
  min?: DateValue;
  max?: DateValue;
  /** BCP 47 tag for names, first weekday and the order of typed numbers. Default "es-AR". */
  locale?: string;
  disabled?: boolean;
  required?: boolean;
  /** An error that comes from the app. Typing errors are produced by the field itself. */
  error?: string;
  /** Posts the ISO date (YYYY-MM-DD) with a form. */
  name?: string;
  /** Two digit years typed as yy become base + yy. Default 2000 (a fixed pivot, never guessed). */
  twoDigitYearBase?: number;
  /** "auto" opens a bottom sheet on touch (`pointer: coarse`) and a popover otherwise. */
  presentation?: Presentation;
  className?: string;
}

export function CalendarIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4.5" width="14" height="12" rx="2.5" />
      <path d="M3 8.5h14M7 3v3M13 3v3" />
    </svg>
  );
}

/** The calendar button inside the field box. */
export function CalendarButton({ label, disabled }: { label: string; disabled?: boolean }) {
  return (
    <PickerTrigger disabled={disabled}>
      <button
        type="button"
        aria-label={label}
        className={cn(
          "kit-focus inline-flex size-8 shrink-0 items-center justify-center rounded-(--radius-md) text-(--color-on-surface-variant) transition-[scale,background-color] duration-75 ease-out hover:bg-(--color-border-subtle) active:scale-[0.97] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-expanded:bg-(--color-border-subtle)",
          coarseTarget,
        )}
      >
        <CalendarIcon />
      </button>
    </PickerTrigger>
  );
}

export function DatePicker({
  label,
  labels,
  value: controlled,
  defaultValue = null,
  onValueChange,
  min,
  max,
  locale = "es-AR",
  disabled = false,
  required = false,
  error,
  name,
  twoDigitYearBase,
  presentation = "auto",
  className,
}: DatePickerProps) {
  const t = useMotionTier("direct");
  const [inner, setInner] = useState<DateValue | null>(defaultValue);
  const value = controlled !== undefined ? controlled : inner;
  const [open, setOpen] = useState(false);
  const [picks, setPicks] = useState(0);

  const commit = (next: DateValue | null) => {
    if (controlled === undefined) setInner(next);
    onValueChange?.(next);
  };

  const field = (
    <PickerField disabled={disabled}>
      <TypedField
        mode="day"
        locale={locale}
        value={value}
        min={min}
        max={max}
        twoDigitYearBase={twoDigitYearBase}
        labels={labels}
        label={label}
        required={required}
        disabled={disabled}
        externalError={error}
        allowEmpty={!required}
        commitOnBlur
        resetToken={picks}
        adornment={<CalendarButton label={labels.choose} disabled={disabled} />}
        onCommit={(v) => {
          commit(v);
          setOpen(false);
        }}
      />
    </PickerField>
  );

  const panel = (
    <CalendarPanel
      mode="day"
      locale={locale}
      value={value}
      min={min}
      max={max}
      labels={labels}
      onPick={(v) => {
        commit(v);
        setPicks((n) => n + 1);
        setOpen(false);
      }}
      t={t}
      sheetTop={
        <TypedField
          mode="day"
          locale={locale}
          value={value}
          min={min}
          max={max}
          twoDigitYearBase={twoDigitYearBase}
          labels={labels}
          allowEmpty={!required}
          onCommit={(v) => {
            commit(v);
            setOpen(false);
          }}
        />
      }
    />
  );

  return (
    <div className={cn("w-full max-w-xs", className)}>
      <PickerOverlay open={open} onOpenChange={setOpen} presentation={presentation} title={labels.choose} closeLabel={labels.close} field={field} panel={panel} t={t} align="start" />
      {name !== undefined && value && <input type="hidden" name={name} value={toIsoDate(value)} />}
    </div>
  );
}
