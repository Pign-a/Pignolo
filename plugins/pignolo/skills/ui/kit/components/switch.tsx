/**
 * Switch (on/off toggle that applies immediately).
 *
 * Use: a setting that takes effect at once. For a choice confirmed by a Save button use a checkbox.
 * Tier: D (direct: visualDuration 0.22, bounce 0). The thumb travels on the direct spring; while
 * pressed it stretches to 1.15 on x from the edge it sits on (70 ms) and springs back on release.
 * The checked track color is an opacity layer, so only transform and opacity animate.
 * Contrast (WCAG 1.4.11): the off track carries a 1.5 px ring in the outline token (3:1 or more
 * against the page, light and dark); the ring sits under the checked fill, so it needs no animation.
 * Forced colors (Windows high contrast): system colors, Canvas track with a CanvasText border,
 * Highlight when on, GrayText when disabled.
 * Touch: on `pointer: coarse` an invisible hit area brings the 28 px track to 44 px.
 * Radix: @radix-ui/react-switch (role="switch", aria-checked, form input, Space/Enter).
 * States: rest, hover, focus-visible (kit-focus), press (stretch), checked, disabled.
 * Keyboard: Tab to focus, Space toggles (Radix).
 * Reduced motion: no travel or stretch, the track cross-fades.
 * Copy: `label` and `description` props; without a visible label pass `aria-label`.
 */
"use client";

import { useId, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import * as RadixSwitch from "@radix-ui/react-switch";
import * as m from "motion/react-m";
import { springFor, useMotionTier } from "../motion";
import { cn } from "../lib/cn";
import { useControllable } from "../lib/controllable";

type RootProps = Omit<
  ComponentPropsWithoutRef<typeof RadixSwitch.Root>,
  "children" | "asChild" | "checked" | "defaultChecked" | "onCheckedChange"
>;

export interface SwitchProps extends RootProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
}

const TRAVEL = 20; // track 48 - thumb 24 - padding 2 + 2

export function Switch({
  checked: checkedProp,
  defaultChecked = false,
  onCheckedChange,
  label,
  description,
  id,
  className,
  disabled,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
  ...rest
}: SwitchProps) {
  const t = useMotionTier("direct");
  const autoId = useId();
  const switchId = id ?? autoId;
  const descId = `${switchId}-desc`;
  const [checked, setChecked] = useControllable(checkedProp, defaultChecked, onCheckedChange);
  const [pressed, setPressed] = useState(false);
  const stretch = pressed && !t.reduced && !disabled;

  const control = (
    <RadixSwitch.Root
      {...rest}
      id={switchId}
      checked={checked}
      disabled={disabled}
      onCheckedChange={setChecked}
      aria-describedby={description ? descId : rest["aria-describedby"]}
      onPointerDown={(e) => {
        setPressed(true);
        onPointerDown?.(e);
      }}
      onPointerUp={(e) => {
        setPressed(false);
        onPointerUp?.(e);
      }}
      onPointerLeave={(e) => {
        setPressed(false);
        onPointerLeave?.(e);
      }}
      onPointerCancel={(e) => {
        setPressed(false);
        onPointerCancel?.(e);
      }}
      className={cn(
        "kit-focus group relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-(--radius-full)",
        "bg-(--color-outline)/35 hover:bg-(--color-outline)/50",
        "before:absolute before:inset-x-0 before:inset-y-0 before:content-[''] pointer-coarse:before:-inset-y-2",
        "disabled:cursor-not-allowed disabled:opacity-(--state-disabled-content)",
        "forced-colors:[forced-color-adjust:none] forced-colors:border-[1.5px] forced-colors:border-[CanvasText] forced-colors:bg-[Canvas] forced-colors:hover:bg-[Canvas] forced-colors:disabled:border-[GrayText]",
        className,
      )}
    >
      <span
        aria-hidden="true"
        data-layer="ring"
        className="absolute inset-0 rounded-(--radius-full) shadow-[inset_0_0_0_1.5px_var(--color-outline)] forced-colors:shadow-none"
      />
      <m.span
        aria-hidden="true"
        data-layer="fill"
        className="absolute inset-0 rounded-(--radius-full) bg-(--color-primary) group-hover:bg-(--color-primary-hover) forced-colors:bg-[Highlight] forced-colors:group-hover:bg-[Highlight] forced-colors:group-disabled:bg-[GrayText]"
        initial={false}
        animate={{ opacity: checked ? 1 : 0 }}
        transition={checked ? t.enter : t.exit}
      />
      <RadixSwitch.Thumb asChild>
        <m.span
          className="pointer-events-none absolute left-0.5 top-0.5 size-6 rounded-(--radius-full) bg-(--color-on-primary) shadow-(--elevation-1) forced-colors:bg-[CanvasText] forced-colors:shadow-none forced-colors:group-data-[state=checked]:bg-[HighlightText] forced-colors:group-disabled:bg-[GrayText]"
          style={{ transformOrigin: checked ? "100% 50%" : "0% 50%" }}
          initial={false}
          animate={{ x: checked ? TRAVEL : 0, scaleX: stretch ? 1.15 : 1 }}
          transition={{
            x: springFor("direct"),
            scaleX: stretch ? { duration: 0.07, ease: "easeOut" } : springFor("direct"),
          }}
        />
      </RadixSwitch.Thumb>
    </RadixSwitch.Root>
  );

  if (!label && !description) return control;

  return (
    <div className="flex min-h-(--target-recommended) items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <label
          htmlFor={switchId}
          className={cn(
            "block cursor-pointer text-sm font-medium text-(--color-on-surface)",
            disabled && "cursor-not-allowed text-(--color-on-surface-muted)",
          )}
        >
          {label}
        </label>
        {description ? (
          <p id={descId} className="mt-0.5 text-sm text-(--color-on-surface-variant)">
            {description}
          </p>
        ) : null}
      </div>
      {control}
    </div>
  );
}
