/**
 * Segmented tabs: a short set of views of the same content (period, scope, mode).
 *
 * Use: 2 to 5 equal-weight options with short labels. For many or long labels use a tab bar
 * or a select. Two roles, chosen by the data:
 *   - items with `content`: tabs. Each segment owns a panel (role tablist, tab, tabpanel).
 *   - items without `content`: a filter or mode switch with no panel. A tablist without
 *     tabpanels is wrong ARIA (APG tabs pattern), so it renders as a radio group (role
 *     radiogroup, radio, aria-checked) with the APG radio keys.
 * Tier: D (direct: visualDuration 0.22, bounce 0). The selected pill slides between segments with
 * a local visualDuration 0.3 and bounce 0 (the author tolerates 0.3 s for tabs) on a shared layout
 * (`layoutId`), so it keeps its velocity if you switch again mid-slide. The new panel fades and
 * rises 6 px in on the direct tier; the old one leaves at once (exit faster than enter).
 * Press is CSS (pressClass, 0.97 in 75 ms), not whileTap.
 * Radix: @radix-ui/react-tabs for the tabs role (tablist, tab, tabpanel, roving focus, arrows,
 * Home/End). The radio role is plain buttons with the same keys written by hand (no extra package).
 * States: rest, hover (text color), focus-visible (kit-focus), press, selected, disabled.
 * Keyboard (tabs): Tab enters the list on the selected tab; ArrowLeft/ArrowRight (and Home/End)
 * move and select; Tab leaves to the panel. Keyboard (radio group): Tab enters on the checked
 * radio; Arrow keys (all four) and Home/End move focus and check, skipping disabled, wrapping.
 * Touch: segments grow to 44 px on `pointer: coarse` (coarseTarget).
 * Forced colors: system colors; the selected pill is Highlight with HighlightText.
 * Reduced motion: the pill cross-fades between segments, the panel only fades.
 * Copy: `items[].label`, `items[].content` and `ariaLabel` (names the list).
 * Note: segments are equal width on purpose, so the shared-layout pill never scales.
 */
"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import * as m from "motion/react-m";
import { AnimatePresence, LayoutGroup } from "motion/react";
import { coarseTarget, pressClass, presets, springFor, tier, useMotionTier } from "../motion";
import { cn } from "../lib/cn";
import { useControllable } from "../lib/controllable";

export interface SegmentedItem {
  value: string;
  label: ReactNode;
  /** Panel shown while this segment is selected. Omit when the segments only drive a filter. */
  content?: ReactNode;
  disabled?: boolean;
}

export interface SegmentedTabsProps {
  items: readonly SegmentedItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Accessible name of the list, in the app's language. */
  ariaLabel: string;
  size?: "sm" | "md";
  /** Stretch the list to its container instead of fitting its content. */
  fullWidth?: boolean;
  className?: string;
  panelClassName?: string;
}

export function SegmentedTabs({
  items,
  value: valueProp,
  defaultValue,
  onValueChange,
  ariaLabel,
  size = "md",
  fullWidth = false,
  className,
  panelClassName,
}: SegmentedTabsProps) {
  const t = useMotionTier("direct");
  const groupId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const first = items.find((i) => !i.disabled)?.value ?? "";
  const [value, setValue] = useControllable(valueProp, defaultValue ?? first, onValueChange);
  const hasPanels = items.some((i) => i.content !== undefined);

  const slide = springFor({ ...tier("direct"), visualDuration: 0.3, bounce: 0 });
  const pill =
    "absolute inset-0 -z-10 rounded-(--radius-md) bg-(--color-surface) shadow-(--elevation-1) forced-colors:[forced-color-adjust:none] forced-colors:bg-[Highlight] forced-colors:shadow-none";
  const listClass = cn(
    "relative isolate grid grid-flow-col auto-cols-fr gap-0 rounded-(--radius-control) bg-(--color-surface-container) p-[3px] forced-colors:border forced-colors:border-[CanvasText]",
    fullWidth ? "w-full" : "w-fit",
  );
  const segmentClass = (item: SegmentedItem, active: boolean) =>
    cn(
      "kit-focus relative z-0 inline-flex items-center justify-center whitespace-nowrap rounded-(--radius-md) px-4 font-medium",
      size === "md" ? "h-9 text-sm" : "h-7 text-xs",
      coarseTarget,
      !item.disabled && pressClass,
      active ? "text-(--color-on-surface)" : "text-(--color-on-surface-muted) hover:text-(--color-on-surface)",
      "disabled:cursor-not-allowed disabled:opacity-(--state-disabled-content)",
      "forced-colors:[forced-color-adjust:none] forced-colors:disabled:text-[GrayText]",
      active ? "forced-colors:text-[HighlightText]" : "forced-colors:text-[ButtonText]",
    );
  const pillFor = (active: boolean) =>
    t.reduced ? (
      <AnimatePresence initial={false}>
        {active ? (
          <m.span
            key="pill"
            aria-hidden="true"
            className={pill}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: presets.fade.enter } }}
            exit={{ opacity: 0, transition: { duration: presets.fade.exit } }}
          />
        ) : null}
      </AnimatePresence>
    ) : active ? (
      <m.span aria-hidden="true" layoutId="segmented-pill" className={pill} transition={slide} />
    ) : null;

  // Radio group keys (APG): arrows move focus and check, skipping disabled, wrapping.
  const onRadioKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key) || !listRef.current) return;
    const radios = [...listRef.current.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)')];
    if (radios.length === 0) return;
    e.preventDefault();
    const at = radios.findIndex((r) => r === document.activeElement);
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const next =
      e.key === "Home" ? 0 : e.key === "End" ? radios.length - 1 : (Math.max(at, 0) + step + radios.length) % radios.length;
    const target = radios[next];
    if (!target) return;
    target.focus();
    setValue(target.dataset.value ?? value);
  };

  if (!hasPanels) {
    return (
      <div
        ref={listRef}
        role="radiogroup"
        aria-label={ariaLabel}
        onKeyDown={onRadioKeys}
        className={cn(listClass, className)}
      >
        <LayoutGroup id={groupId}>
          {items.map((item) => {
            const active = item.value === value;
            return (
              <button
                key={item.value}
                type="button"
                role="radio"
                aria-checked={active}
                data-value={item.value}
                tabIndex={active ? 0 : -1}
                disabled={item.disabled}
                onClick={() => setValue(item.value)}
                className={segmentClass(item, active)}
              >
                {pillFor(active)}
                {item.label}
              </button>
            );
          })}
        </LayoutGroup>
      </div>
    );
  }

  return (
    <Tabs.Root value={value} onValueChange={setValue} className={className}>
      <LayoutGroup id={groupId}>
        <Tabs.List aria-label={ariaLabel} className={listClass}>
          {items.map((item) => {
            const active = item.value === value;
            return (
              <Tabs.Trigger key={item.value} value={item.value} disabled={item.disabled} asChild>
                <button type="button" className={segmentClass(item, active)}>
                  {pillFor(active)}
                  {item.label}
                </button>
              </Tabs.Trigger>
            );
          })}
        </Tabs.List>
      </LayoutGroup>

      {items.map((item) => (
        <Tabs.Content key={item.value} value={item.value} className={cn("kit-focus mt-4 rounded-(--radius-md)", panelClassName)}>
          <m.div initial={{ opacity: 0, y: t.distance(6) }} animate={{ opacity: 1, y: 0 }} transition={t.enter}>
            {item.content}
          </m.div>
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
