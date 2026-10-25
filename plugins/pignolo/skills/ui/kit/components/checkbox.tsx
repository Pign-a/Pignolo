/**
 * Checkbox with a drawn tick (and a drawn dash for the indeterminate state).
 *
 * Use: pick any number of options, or a choice confirmed later by a Save button.
 * Tier: D (direct, bounce 0). The tick draws with a 200 ms ease-out (SVG pathLength, a documented
 * exception to transform and opacity in CHECKLIST.md) and un-draws in 80 ms; the box fill is an
 * opacity layer. Press is CSS (not whileTap): the box scales to 0.92 (a 20 px target needs more
 * than 0.97 to be felt) in 75 ms.
 * Target: the 20 px box has an invisible hit area of 24 px (WCAG 2.2 target size minimum) and 44 px
 * on `pointer: coarse` (coarseHit); the label row is at least 44 px tall and also toggles it.
 * Forced colors (Windows high contrast): the inset shadow border does not render there, so a real
 * 1.5 px CanvasText border takes over, Highlight fills the checked box, HighlightText draws the tick.
 * Radix: @radix-ui/react-checkbox (role="checkbox", aria-checked incl. "mixed", form input).
 * States: rest, hover, focus-visible (kit-focus), press, checked, indeterminate, invalid, disabled.
 * Keyboard: Tab to focus, Space toggles (Radix).
 * Reduced motion: the tick fades in, nothing is drawn or scaled.
 * Copy: `label` and `description` props; without a visible label pass `aria-label`.
 */
"use client";

import { useId, type ComponentPropsWithoutRef, type ReactNode } from "react";
import * as RadixCheckbox from "@radix-ui/react-checkbox";
import * as m from "motion/react-m";
import { AnimatePresence } from "motion/react";
import { coarseHit, presets, useMotionTier } from "../motion";
import { cn } from "../lib/cn";
import { useControllable } from "../lib/controllable";

export type CheckedState = boolean | "indeterminate";

type RootProps = Omit<
  ComponentPropsWithoutRef<typeof RadixCheckbox.Root>,
  "children" | "asChild" | "checked" | "defaultChecked" | "onCheckedChange"
>;

export interface CheckboxProps extends RootProps {
  checked?: CheckedState;
  defaultChecked?: CheckedState;
  onCheckedChange?: (checked: CheckedState) => void;
  label?: ReactNode;
  description?: ReactNode;
  /** Draws the box in the error color. Put the message in `description`. */
  invalid?: boolean;
}

const TICK = "M5 10.5l3.2 3.2L15 6.5";
const DASH = "M5.5 10h9";

export function Checkbox({
  checked: checkedProp,
  defaultChecked = false,
  onCheckedChange,
  label,
  description,
  invalid = false,
  id,
  className,
  disabled,
  ...rest
}: CheckboxProps) {
  const t = useMotionTier("direct");
  const autoId = useId();
  const boxId = id ?? autoId;
  const descId = `${boxId}-desc`;
  const [checked, setChecked] = useControllable<CheckedState>(checkedProp, defaultChecked, onCheckedChange);
  const on = checked !== false;

  const box = (
    <RadixCheckbox.Root
      {...rest}
      id={boxId}
      checked={checked}
      disabled={disabled}
      onCheckedChange={setChecked}
      aria-invalid={invalid || undefined}
      aria-describedby={description ? descId : rest["aria-describedby"]}
      asChild
    >
      <button
        type="button"
        className={cn(
          "kit-focus group relative inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-(--radius-sm)",
          coarseHit,
          "transition-[scale] duration-200 ease-(--ease-decelerate) active:scale-[0.92] active:duration-75 active:ease-out motion-reduce:active:scale-100 disabled:active:scale-100",
          "forced-colors:[forced-color-adjust:none] forced-colors:border-[1.5px] forced-colors:border-[CanvasText] forced-colors:shadow-none forced-colors:hover:shadow-none forced-colors:disabled:border-[GrayText]",
          invalid
            ? "shadow-[inset_0_0_0_1.5px_var(--color-error)]"
            : "shadow-[inset_0_0_0_1.5px_var(--color-border-strong)] hover:shadow-[inset_0_0_0_1.5px_var(--color-on-surface-variant)]",
          "disabled:cursor-not-allowed disabled:opacity-(--state-disabled-content)",
          className,
        )}
      >
        <m.span
          aria-hidden="true"
          className={cn(
            "absolute inset-0 rounded-(--radius-sm)",
            invalid ? "bg-(--color-error)" : "bg-(--color-primary) group-hover:bg-(--color-primary-hover)",
            "forced-colors:bg-[Highlight] forced-colors:group-hover:bg-[Highlight] forced-colors:group-disabled:bg-[GrayText]",
          )}
          initial={false}
          animate={{ opacity: on ? 1 : 0 }}
          transition={on ? t.enter : t.exit}
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="relative size-5 text-(--color-on-primary) forced-colors:text-[HighlightText]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <AnimatePresence initial={false}>
            {on ? (
              <m.path
                key={checked === "indeterminate" ? "dash" : "tick"}
                d={checked === "indeterminate" ? DASH : TICK}
                initial={t.reduced ? { opacity: 0 } : { pathLength: 0 }}
                animate={
                  t.reduced
                    ? { opacity: 1, transition: { duration: presets.fade.enter } }
                    : { pathLength: 1, transition: { duration: 0.2, ease: "easeOut" } }
                }
                exit={
                  t.reduced
                    ? { opacity: 0, transition: { duration: presets.fade.exit } }
                    : { pathLength: 0, transition: { duration: 0.08, ease: "easeIn" } }
                }
              />
            ) : null}
          </AnimatePresence>
        </svg>
      </button>
    </RadixCheckbox.Root>
  );

  if (!label && !description) return box;

  return (
    <div className="flex min-h-(--target-recommended) items-start gap-3 py-2.5">
      <div className="pt-px">{box}</div>
      <div className="min-w-0">
        <label
          htmlFor={boxId}
          className={cn(
            "block cursor-pointer text-sm font-medium leading-5 text-(--color-on-surface)",
            disabled && "cursor-not-allowed text-(--color-on-surface-muted)",
          )}
        >
          {label}
        </label>
        {description ? (
          <p
            id={descId}
            className={cn("mt-0.5 text-sm", invalid ? "text-(--color-error)" : "text-(--color-on-surface-variant)")}
          >
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
