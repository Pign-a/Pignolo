/**
 * Tooltip: a short label for an icon button or a truncated value.
 *
 * Use: show the label of an icon-only control or add one short phrase. Never essential
 * information, never on a disabled button (it cannot be focused), never interactive content.
 * A tooltip DESCRIBES its trigger (Radix sets aria-describedby); it does not name it. An icon-only
 * trigger must carry its own `aria-label` (the tooltip repeats it for sighted users). In
 * development a trigger with no `aria-label`, `aria-labelledby` or text child logs a warning.
 * Tier: D, no delay (lab winner A: tween, delay 0). Enter 120 ms ease-out from 4 px away
 * and scale 0.96 (never below 0.92), exit 80 ms ease-in. Moving from one trigger to
 * the next closes the first (80 ms) and opens the second within about 90 ms: the content is hoverable,
 * so Radix waits for the first pointer move outside the first tip's grace area.
 * Radix: @radix-ui/react-tooltip (role="tooltip", aria-describedby, opens on hover and
 * keyboard focus, closes on Escape, blur, pointer leave and scroll). The content stays open while
 * the pointer is over it (hoverable, WCAG 1.4.13 Content on Hover or Focus: dismissable with
 * Escape, hoverable, persistent). It is force-mounted inside AnimatePresence so the exit can play.
 * States: closed, open on hover, open on focus-visible. The trigger keeps its own states.
 * Keyboard: Tab focuses the trigger and shows the tip, Escape hides it. Radix closes a tip on any
 * scroll, and the browser scrolls a trigger into view right after Tab, so a scroll in the first
 * 400 ms after focus is ignored (otherwise the tip opens and closes in the same frame).
 * Reduced motion: opacity cross-fade only, no travel and no scale.
 * Copy: `content` prop. Mount `<TooltipProvider>` once near the root (or per group).
 */
"use client";

import { isValidElement, useEffect, useRef, useState, type ComponentPropsWithoutRef, type ReactElement, type ReactNode } from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import * as m from "motion/react-m";
import { AnimatePresence } from "motion/react";
import { presets, useMotionTier } from "../motion";
import { cn } from "../lib/cn";

export function TooltipProvider({
  delayDuration = presets.tooltip.delay * 1000,
  skipDelayDuration = 300,
  ...props
}: ComponentPropsWithoutRef<typeof RadixTooltip.Provider>) {
  return <RadixTooltip.Provider delayDuration={delayDuration} skipDelayDuration={skipDelayDuration} {...props} />;
}

export interface TooltipProps {
  /** The short label, in the app's language. */
  content: ReactNode;
  /** One focusable element. It is not wrapped: the tooltip attaches to it. An icon-only one needs `aria-label`. */
  children: ReactElement;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  className?: string;
  /** Controlled open state; leave out to let Radix decide. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const OFFSET = 4;
/** Scrolls this soon after the trigger gains focus are the browser bringing it into view. */
const FOCUS_SCROLL_MS = 400;

function travel(side: NonNullable<TooltipProps["side"]>, px: number): { x: number; y: number } {
  // Start closer to the trigger and settle outward.
  if (side === "top") return { x: 0, y: px };
  if (side === "bottom") return { x: 0, y: -px };
  if (side === "left") return { x: px, y: 0 };
  return { x: -px, y: 0 };
}

declare const process: { env: { NODE_ENV?: string } };

/** Dev-time guard: a tooltip is a description, so an icon-only trigger still needs its own name. */
function warnUnnamedTrigger(child: unknown): void {
  try {
    if (process.env.NODE_ENV === "production") return;
  } catch {
    return; // no process global and no bundler replacement: stay silent
  }
  if (!isValidElement<{ "aria-label"?: string; "aria-labelledby"?: string; children?: ReactNode }>(child)) return;
  const p = child.props;
  const named = p["aria-label"] || p["aria-labelledby"] || typeof p.children === "string";
  if (!named) {
    console.warn("kit Tooltip: the trigger has no aria-label, aria-labelledby or text. A tooltip only describes its trigger; give an icon-only control its own aria-label.");
  }
}

export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  sideOffset = 8,
  className,
  open: openProp,
  onOpenChange,
}: TooltipProps) {
  const t = useMotionTier("direct");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => warnUnnamedTrigger(children), []);
  const [inner, setInner] = useState(false);
  const open = openProp ?? inner;
  const scrollFromFocus = useRef(false);
  const stopWatching = useRef<(() => void) | null>(null);
  useEffect(() => () => stopWatching.current?.(), []);
  // Registered on focus, so it runs before Radix's own scroll listener (added when the tip mounts).
  const watchFocusScroll = () => {
    stopWatching.current?.();
    const onScroll = () => {
      scrollFromFocus.current = true;
      setTimeout(() => (scrollFromFocus.current = false), 0);
    };
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    const timer = setTimeout(() => stopWatching.current?.(), FOCUS_SCROLL_MS);
    stopWatching.current = () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", onScroll, { capture: true });
      stopWatching.current = null;
    };
  };
  const setOpen = (next: boolean) => {
    if (!next && scrollFromFocus.current) return;
    if (openProp === undefined) setInner(next);
    onOpenChange?.(next);
  };

  const from = travel(side, t.distance(OFFSET));
  const out = travel(side, t.distance(OFFSET / 2));
  const scale = t.scaleFrom(0.96);

  return (
    <RadixTooltip.Root open={open} onOpenChange={setOpen} delayDuration={presets.tooltip.delay * 1000}>
      <RadixTooltip.Trigger asChild onFocus={watchFocusScroll}>{children}</RadixTooltip.Trigger>
      <AnimatePresence>
        {open ? (
          <RadixTooltip.Portal forceMount>
            <RadixTooltip.Content forceMount asChild side={side} align={align} sideOffset={sideOffset} collisionPadding={8}>
              <m.div
                key="tooltip"
                style={{ transformOrigin: "var(--radix-tooltip-content-transform-origin)" }}
                className={cn(
                  "z-50 max-w-xs rounded-(--radius-md) bg-(--color-on-surface) px-2.5 py-1.5 text-xs font-medium leading-4 text-(--color-background)",
                  className,
                )}
                initial={{ opacity: 0, x: from.x, y: from.y, scale }}
                animate={{
                  opacity: 1,
                  x: 0,
                  y: 0,
                  scale: 1,
                  transition: { duration: presets.tooltip.enter, ease: "easeOut" },
                }}
                exit={{
                  opacity: 0,
                  x: out.x,
                  y: out.y,
                  scale,
                  transition: { duration: presets.tooltip.exit, ease: "easeIn" },
                }}
              >
                {content}
              </m.div>
            </RadixTooltip.Content>
          </RadixTooltip.Portal>
        ) : null}
      </AnimatePresence>
    </RadixTooltip.Root>
  );
}
