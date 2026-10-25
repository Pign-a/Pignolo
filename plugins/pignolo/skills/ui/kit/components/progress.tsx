/**
 * Progress: a bar (`Progress`) and a step tracker (`Steps`).
 *
 * Use: Progress for an operation with a known or unknown length (wait over 1 s:
 * indeterminate; over 3 s: determinate when possible). Steps for a short, ordered flow
 * (2 to 6 stages) where the user needs to know where they are.
 * Tier: T (data): visualDuration 0.45, bounce 0 (foundation values; the lab winner used
 * 0.4 for bars, the 0.05 s gap is not perceptible and one data tier is simpler). The bar
 * grows with scaleX from the left only once it is on screen (one-shot, IntersectionObserver).
 * Steps: connectors fill one by one with the data stagger (90 ms) when several steps are
 * completed at once; going back un-fills with the short exit.
 * Radix: @radix-ui/react-progress for the bar (role="progressbar", aria-valuenow/min/max,
 * no aria-valuenow when indeterminate). Steps is an ordered list with aria-current="step".
 * States: determinate, indeterminate, complete; step complete / current / upcoming.
 * Keyboard: neither is interactive; nothing to focus.
 * Reduced motion: the bar jumps to its value and fades in; the indeterminate bar pulses
 * its opacity instead of sliding; step connectors fade.
 * Copy: `label`, `valueText`, `getValueLabel`, `ariaLabel`, `steps[].label`, `statusLabels`.
 * The bar track is a 2 px-radius rectangle on purpose (no pill shapes).
 * Forced colors (Windows high contrast): backgrounds and inset shadows are dropped there, so the
 * track gets a CanvasText border, the fill and the completed steps use Highlight, connectors
 * GrayText, and step outlines are real borders.
 */
"use client";

import { useId, useRef, type ReactNode } from "react";
import * as RadixProgress from "@radix-ui/react-progress";
import * as m from "motion/react-m";
import { AnimatePresence, useInView } from "motion/react";
import type { Transition } from "motion/react";
import { presets, useMotionTier } from "../motion";
import { cn } from "../lib/cn";

/* ---------------------------------------------------------------- bar */

export interface ProgressProps {
  /** Current value, 0 to `max`. `null` means indeterminate. */
  value: number | null;
  max?: number;
  /** Visible label above the bar. Without it pass `aria-label`. */
  label?: ReactNode;
  /** Visible value text at the right of the label, for example "68 %". */
  valueText?: ReactNode;
  /** Text read by screen readers for the current value, in the app's language. */
  getValueLabel?: (value: number, max: number) => string;
  "aria-label"?: string;
  size?: "sm" | "md";
  className?: string;
}

export function Progress({
  value,
  max = 100,
  label,
  valueText,
  getValueLabel,
  "aria-label": ariaLabel,
  size = "md",
  className,
}: ProgressProps) {
  const t = useMotionTier("data");
  const labelId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.5 });
  const indeterminate = value === null;
  const ratio = indeterminate ? 0 : Math.min(1, Math.max(0, value / max));

  return (
    <div className={cn("w-full", className)}>
      {label || valueText ? (
        <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
          <span id={labelId} className="font-medium text-(--color-on-surface)">
            {label}
          </span>
          {valueText ? <span className="tabular-nums text-(--color-on-surface-variant)">{valueText}</span> : null}
        </div>
      ) : null}
      <RadixProgress.Root
        ref={ref}
        value={value}
        max={max}
        getValueLabel={getValueLabel ? (v, mx) => getValueLabel(v, mx) : undefined}
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel}
        className={cn(
          "relative w-full overflow-hidden rounded-[2px] bg-(--color-border-subtle)",
          "forced-colors:[forced-color-adjust:none] forced-colors:border forced-colors:border-[CanvasText] forced-colors:bg-[Canvas]",
          size === "md" ? "h-2" : "h-1",
        )}
      >
        <RadixProgress.Indicator asChild>
          {indeterminate ? (
            <m.div
              className="absolute inset-y-0 left-0 w-2/5 bg-(--color-primary) forced-colors:bg-[Highlight]"
              initial={t.reduced ? { opacity: 0.4 } : { x: "-100%" }}
              animate={t.reduced ? { opacity: [0.4, 1, 0.4] } : { x: ["-100%", "250%"] }}
              transition={{ duration: t.reduced ? 1.6 : 1.4, ease: "easeInOut", repeat: Infinity }}
            />
          ) : (
            <m.div
              className="h-full w-full origin-left bg-(--color-primary) forced-colors:bg-[Highlight]"
              initial={{ scaleX: 0, opacity: t.reduced ? 0 : 1 }}
              animate={{ scaleX: seen ? ratio : 0, opacity: 1 }}
              transition={{ scaleX: t.spring, opacity: { duration: presets.fade.enter } }}
            />
          )}
        </RadixProgress.Indicator>
      </RadixProgress.Root>
    </div>
  );
}

/* -------------------------------------------------------------- steps */

export interface ProgressStep {
  id: string;
  label: ReactNode;
}

export interface StepsProps {
  steps: readonly ProgressStep[];
  /** Zero-based index of the current step. `steps.length` means all steps are done. */
  current: number;
  /** Accessible name of the list. */
  ariaLabel: string;
  /** Read by screen readers before each label, in the app's language. */
  statusLabels: { complete: string; current: string; upcoming: string };
  className?: string;
}

const TICK = "M6 11l3.2 3.2L15 7.5";

const delayed = (tr: Transition, delay: number): Transition => ({ ...tr, delay });

export function Steps({ steps, current, ariaLabel, statusLabels, className }: StepsProps) {
  const t = useMotionTier("data");
  const previous = useRef(current);
  const from = Math.min(previous.current, current);
  previous.current = current;

  return (
    <ol aria-label={ariaLabel} className={cn("flex w-full", className)}>
      {steps.map((step, i) => {
        const done = i < current;
        const isCurrent = i === current;
        const status = done ? statusLabels.complete : isCurrent ? statusLabels.current : statusLabels.upcoming;
        // Steps completed together fill one after another; undoing is quick and unstaggered.
        const wait = done ? t.delay(Math.max(0, i - from)) : 0;
        const last = i === steps.length - 1;
        return (
          <li
            key={step.id}
            aria-current={isCurrent ? "step" : undefined}
            className="relative flex min-w-0 flex-1 flex-col items-center gap-2 text-center"
          >
            {!last ? (
              <span
                aria-hidden="true"
                className="absolute left-1/2 top-3.5 h-0.5 w-full -translate-y-1/2 bg-(--color-border-subtle) forced-colors:[forced-color-adjust:none] forced-colors:bg-[GrayText]"
              >
                <m.span
                  className="block h-full w-full origin-left bg-(--color-primary) forced-colors:bg-[Highlight]"
                  initial={false}
                  animate={{ scaleX: done ? 1 : 0, opacity: t.reduced ? (done ? 1 : 0) : 1 }}
                  transition={
                    done
                      ? { scaleX: delayed(t.spring, wait), opacity: { duration: presets.fade.enter } }
                      : { duration: t.tier.exit, ease: "easeIn" }
                  }
                />
              </span>
            ) : null}
            <span
              aria-hidden="true"
              className={cn(
                "relative z-10 grid size-7 place-items-center rounded-(--radius-md) bg-(--color-surface) text-xs font-semibold",
                isCurrent
                  ? "text-(--color-primary) shadow-[inset_0_0_0_2px_var(--color-primary)]"
                  : "text-(--color-on-surface-muted) shadow-[inset_0_0_0_1.5px_var(--color-border-subtle)]",
                done && "shadow-none",
                "forced-colors:[forced-color-adjust:none] forced-colors:border-2 forced-colors:border-[CanvasText] forced-colors:bg-[Canvas] forced-colors:text-[CanvasText] forced-colors:shadow-none",
                isCurrent && "forced-colors:border-[Highlight]",
              )}
            >
              <m.span
                className="absolute inset-0 rounded-(--radius-md) bg-(--color-primary) forced-colors:-inset-0.5 forced-colors:bg-[Highlight]"
                initial={false}
                animate={{ opacity: done ? 1 : 0 }}
                transition={done ? { duration: 0.18, ease: "easeOut", delay: wait } : { duration: t.tier.exit }}
              />
              {done ? null : <span className="relative tabular-nums">{i + 1}</span>}
              <svg
                viewBox="0 0 20 20"
                className="absolute size-5 text-(--color-on-primary) forced-colors:text-[HighlightText]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <AnimatePresence initial={false}>
                  {done ? (
                    <m.path
                      key="tick"
                      d={TICK}
                      initial={t.reduced ? { opacity: 0 } : { pathLength: 0 }}
                      animate={
                        t.reduced
                          ? { opacity: 1, transition: { duration: presets.fade.enter, delay: wait } }
                          : { pathLength: 1, transition: { duration: 0.2, ease: "easeOut", delay: wait + 0.08 } }
                      }
                      exit={{ opacity: 0, transition: { duration: 0.08 } }}
                    />
                  ) : null}
                </AnimatePresence>
              </svg>
            </span>
            <span
              className={cn(
                "px-1 text-xs leading-4",
                isCurrent ? "font-medium text-(--color-on-surface)" : "text-(--color-on-surface-muted)",
              )}
            >
              <span className="sr-only">{status}: </span>
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
