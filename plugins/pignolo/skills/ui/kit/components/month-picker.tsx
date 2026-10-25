/**
 * MonthPicker: pick a month and year. Replaces the native month input.
 * Use when: the value is a month (reports, budgets, billing periods). For a day use DatePicker.
 *   Near months are one chevron away, far ones come from the year button (decade grid) or from typing.
 * Tier: direct (0.22 s, bounce 0, exit 0.1 s).
 * Primitive: shared calendar parts (calendar.tsx): @radix-ui/react-popover, or the kit BottomSheet
 *   when the primary pointer is coarse; a 3 x 4 month grid and a 12 year grid per decade replace
 *   the body (no popup inside a popup). Keyboard map, grids, range rules and sources are in
 *   calendar.tsx and references/patterns/date-and-month-picker.md.
 * Control: `<  [Octubre 2026 v]  >`. The chevrons step the value without opening anything and
 *   aria-disable at min and max (focus is kept). The popover holds the typed field, the header
 *   `<  [2026]  >` (year button, chevrons step a year), the month grid and an "este mes" button.
 * Typing: always available inside the popover. es-AR accepts 3/26, 03/2026, mar 2026, marzo 2026,
 *   2026-03, 032026; two digit years are 20xx (`twoDigitYearBase`); anything unclear shows an
 *   error and is never guessed. The format is helper text, not a placeholder.
 * Form: pass `name`; a hidden input posts the ISO month (YYYY-MM).
 * Motion: the month text in the trigger slides 10 px and fades from the side it moves toward:
 *   next enters from the right, previous from the left, the old one leaves the other way, faster.
 *   The popover enters from scale 0.96, 6 px up. Transform and opacity only. Reduced motion:
 *   cross-fade, no travel.
 * States: chevrons rest, hover, focus-visible ring, press (0.97 in 75 ms), aria-disabled at the
 *   limits; trigger rest, hover, focus-visible, press, open, disabled; month cell rest, hover,
 *   focus-visible, selected (filled), current month (outlined), out of range (aria-disabled, muted,
 *   still focusable). A live region announces the month after every change.
 * Copy props: label and labels (chevrons, trigger, typed field hint and errors, buttons).
 *   Month names and the first weekday come from `locale` (default es-AR).
 */
"use client";

import { useId, useState } from "react";
import { cn } from "../lib/cn";
import { monthIndex, monthNames, toIsoMonth, type YMD } from "../lib/date-input";
import { coarseTarget, useMotionTier } from "../motion";
import { Arrow, CalendarPanel, PickerOverlay, PickerTrigger, Slide, TypedField, iconButton, type PickerLabels, type Presentation } from "./calendar";

export interface MonthValue {
  year: number;
  /** 0 for January to 11 for December. */
  month: number;
}

export type MonthPickerLabels = PickerLabels;

export interface MonthPickerProps {
  /** Visible or accessible name of the whole control. */
  label: string;
  labels: MonthPickerLabels;
  value?: MonthValue;
  defaultValue?: MonthValue;
  onValueChange?: (value: MonthValue) => void;
  min?: MonthValue;
  max?: MonthValue;
  /** BCP 47 tag for month names, first weekday and typed input. Default "es-AR". */
  locale?: string;
  disabled?: boolean;
  /** Posts the ISO month (YYYY-MM) with a form. */
  name?: string;
  /** Two digit years typed as yy become base + yy. Default 2000 (a fixed pivot, never guessed). */
  twoDigitYearBase?: number;
  /** "auto" opens a bottom sheet on touch (`pointer: coarse`) and a popover otherwise. */
  presentation?: Presentation;
  className?: string;
}

const today = (): MonthValue => {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() };
};
const toYMD = (v: MonthValue): YMD => ({ year: v.year, month: v.month, day: 1 });
const fromIndex = (i: number): MonthValue => ({ year: Math.floor(i / 12), month: ((i % 12) + 12) % 12 });

export function MonthPicker({
  label,
  labels,
  value: controlled,
  defaultValue,
  onValueChange,
  min,
  max,
  locale = "es-AR",
  disabled = false,
  name,
  twoDigitYearBase,
  presentation = "auto",
  className,
}: MonthPickerProps) {
  const uid = useId();
  const t = useMotionTier("direct");
  const [inner, setInner] = useState<MonthValue>(defaultValue ?? today());
  const value = controlled ?? inner;

  const full = monthNames(locale, "long");
  const text = `${full[value.month]} ${value.year}`;

  const inRange = (v: MonthValue) => (min === undefined || monthIndex(v) >= monthIndex(min)) && (max === undefined || monthIndex(v) <= monthIndex(max));

  const [dir, setDir] = useState<1 | -1>(1);
  const commit = (next: MonthValue) => {
    if (!inRange(next) || monthIndex(next) === monthIndex(value)) return;
    setDir(monthIndex(next) > monthIndex(value) ? 1 : -1);
    if (controlled === undefined) setInner(next);
    onValueChange?.(next);
  };
  const step = (d: 1 | -1) => commit(fromIndex(monthIndex(value) + d));
  const canPrev = inRange(fromIndex(monthIndex(value) - 1));
  const canNext = inRange(fromIndex(monthIndex(value) + 1));

  const [open, setOpen] = useState(false);
  const pick = (v: YMD) => {
    commit({ year: v.year, month: v.month });
    setOpen(false);
  };

  const field = (
    <PickerTrigger disabled={disabled}>
      <button
        type="button"
        aria-label={`${labels.choose}, ${text}`}
        className={cn(
          "kit-focus flex min-h-10 min-w-44 items-center justify-center gap-2 rounded-(--radius-control) border border-(--color-outline) bg-(--color-surface) px-3 text-sm font-medium text-(--color-on-surface) transition-[scale,background-color] duration-75 ease-out hover:bg-(--color-surface-container) active:scale-[0.97] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-(--state-disabled-content) disabled:active:scale-100 data-[state=open]:border-(--color-primary) aria-expanded:border-(--color-primary)",
          coarseTarget,
        )}
      >
        <Slide id={`${value.year}-${value.month}`} dir={dir} t={t}>
          <span data-testid="month-text" aria-hidden="true">
            {text}
          </span>
        </Slide>
        <span aria-hidden="true" className="flex text-(--color-on-surface-variant)">
          <Arrow dir="down" />
        </span>
      </button>
    </PickerTrigger>
  );

  const panel = (
    <CalendarPanel
      mode="month"
      locale={locale}
      value={toYMD(value)}
      min={min && toYMD(min)}
      max={max && toYMD(max)}
      labels={labels}
      onPick={pick}
      t={t}
      top={
        <TypedField
          mode="month"
          locale={locale}
          value={toYMD(value)}
          min={min && toYMD(min)}
          max={max && toYMD(max)}
          twoDigitYearBase={twoDigitYearBase}
          labels={labels}
          label={labels.typeLabel}
          onCommit={(v) => {
            if (v) pick(v);
          }}
        />
      }
    />
  );

  return (
    <div role="group" aria-label={label} className={cn("inline-flex items-center gap-2", className)}>
      <button
        type="button"
        aria-label={labels.previousMonth}
        aria-disabled={!canPrev || disabled || undefined}
        onClick={() => {
          if (!disabled) step(-1);
        }}
        className={iconButton}
      >
        <Arrow dir="left" />
      </button>

      <PickerOverlay open={open} onOpenChange={setOpen} presentation={presentation} title={labels.choose} closeLabel={labels.close} field={field} panel={panel} t={t} />

      <button
        type="button"
        aria-label={labels.nextMonth}
        aria-disabled={!canNext || disabled || undefined}
        onClick={() => {
          if (!disabled) step(1);
        }}
        className={iconButton}
      >
        <Arrow dir="right" />
      </button>
      <span id={`${uid}-live`} aria-live="polite" className="sr-only">
        {text}
      </span>
      {name !== undefined && <input type="hidden" name={name} value={toIsoMonth(value)} />}
    </div>
  );
}
