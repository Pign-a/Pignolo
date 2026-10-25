/**
 * DatePicker: pick a day. Replaces the native date input.
 * Use when: the value is a date. Near dates come from the calendar, far ones (a birthday) from typing
 *   or from the month and year buttons of the calendar header. For a month use MonthPicker.
 * Tier: direct (0.22 s, bounce 0, exit 0.1 s).
 * Primitive: shared calendar parts (calendar.tsx): a typed text field with the calendar button inside
 *   the same box, a Radix popover (or the kit BottomSheet when the pointer is coarse) with the day
 *   grid. The header `<  [Marzo] [2026]  >` has two buttons: the month opens a 3 x 4 month grid,
 *   the year a 12 year grid per decade with decade arrows; the grid replaces the body.
 * Typing: always available, and the first way in. es-AR accepts 5/3/26, 5-3-2026, 05.03.2026,
 *   5 mar 2026, 5 de marzo de 2026, 2026-03-05, 05032026 (day, month, year; en-US is month first).
 *   Two digit years are 20xx (`twoDigitYearBase`). Anything unclear or impossible (31/4, 29/2 of a
 *   common year) shows an error and is never guessed. The format is helper text, not a placeholder.
 *   Enter or leaving the field commits; an empty field clears the value.
 * Keyboard: see calendar.tsx (WAI-ARIA APG date picker dialog).
 * Range: `min` and `max` disable days and keep them focusable.
 * Form: pass `name`; a hidden input posts the ISO date (YYYY-MM-DD) or nothing when empty.
 * States: field rest, hover, focus-within (border and ring), error, disabled; calendar button rest,
 *   hover, focus-visible, press, open; day rest, hover, focus-visible, selected, today (outlined),
 *   out of range.
 * Motion: see calendar.tsx. Reduced motion: cross-fade only.
 * Copy props: label and labels. Names and first weekday come from `locale` (default es-AR).
 */
"use client";

import { useId, useState } from "react";
import { cn } from "../lib/cn";
import { toIsoDate, type YMD } from "../lib/date-input";
import { coarseTarget, useMotionTier } from "../motion";
import { CalendarPanel, PickerAnchor, PickerOverlay, PickerTrigger, TypedField, type PickerLabels, type Presentation } from "./calendar";

export type DateValue = YMD;
export type DatePickerLabels = PickerLabels;

export interface DatePickerProps {
  /** Always visible label. */
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

function CalendarIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4.5" width="14" height="12" rx="2.5" />
      <path d="M3 8.5h14M7 3v3M13 3v3" />
    </svg>
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
  const uid = useId();
  const t = useMotionTier("direct");
  const [inner, setInner] = useState<DateValue | null>(defaultValue);
  const value = controlled !== undefined ? controlled : inner;
  const [open, setOpen] = useState(false);

  const commit = (next: DateValue | null) => {
    if (controlled === undefined) setInner(next);
    onValueChange?.(next);
  };

  const button = (
    <PickerTrigger disabled={disabled}>
      <button
        type="button"
        aria-label={labels.choose}
        className={cn(
          "kit-focus mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-(--radius-md) text-(--color-on-surface-variant) transition-[scale,background-color] duration-75 ease-out hover:bg-(--color-surface-container) active:scale-[0.97] motion-reduce:active:scale-100 disabled:cursor-not-allowed aria-expanded:bg-(--color-surface-container)",
          coarseTarget,
        )}
      >
        <CalendarIcon />
      </button>
    </PickerTrigger>
  );

  const field = (
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
          adornment={button}
          wrapBox={(box) => <PickerAnchor>{box}</PickerAnchor>}
          onCommit={commit}
        />
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
        setOpen(false);
      }}
      t={t}
    />
  );

  return (
    <div className={cn("w-full max-w-xs", className)} id={`${uid}-root`}>
      <PickerOverlay open={open} onOpenChange={setOpen} presentation={presentation} title={labels.choose} closeLabel={labels.close} field={field} panel={panel} t={t} align="start" />
      {name !== undefined && value && <input type="hidden" name={name} value={toIsoDate(value)} />}
    </div>
  );
}
