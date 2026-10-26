/**
 * Skeleton: placeholder shapes with a loading shimmer, sized like the final content.
 *
 * Use for tables, cards, lists and KPI figures while data loads, especially a whole page
 * or several modules at once (NN/g, Skeleton Screens 101, 2023: skeletons for full-page
 * loads under 10 s). For a single small module (one card, a chart, a video, a button)
 * prefer a spinner: NN/g says spinners are typically best on a single module. Under 1 s
 * neither helps, so show nothing. Over 10 s use a progress bar. Never a skeleton for
 * toasts, menus, dropdown items or the modal itself.
 * Tier: none. The shimmer is a decorative loop (1.2 s, linear), not a spring.
 * Radix primitive: none.
 *
 * Parts: `Skeleton` (one block), `SkeletonText` (several lines, the last one shorter)
 * and `SkeletonRegion` (the wrapper that tells assistive tech something is loading and
 * owns the delay: `delayMs`, default 1000). During the delay the blocks are in the DOM but
 * invisible, so they reserve their space and nothing shifts when they appear; a load
 * that ends first never draws them. Pass `delayMs={0}` to show at once.
 *
 * States: waiting (delay), loading (it is a state, not a control). Reduced motion: the
 * shimmer is removed and the blocks stay a static muted fill.
 * Keyboard: not focusable. Screen readers: blocks are aria-hidden; the region is a
 * status with the `label` text (available during the delay too), and aria-busy.
 *
 * Arrival (when the load ends): content that replaces a skeleton is not always welcome with a
 * flourish. `useReveal` and `SkeletonSwap` decide and draw it. `reveal`: "auto" (default) animates
 * only the FIRST time a single figure or module goes from waiting (skeleton, error, empty) to
 * content: the skeleton fades out as the content fades in, 0.2 s, and a number also rolls in from
 * zero ("roll"). It does NOT animate a refresh of something already shown (it was visible before,
 * the user is not waiting, a flourish would be noise), nor a first mount that already has its
 * content, nor list rows (they never use it). "roll" and "fade" force the animation for a
 * figure the user is waiting on after an action; "none" never animates. Under reduced motion the
 * only animation left is the fade. The rule lives in `useReveal`: arrival = content shown right
 * after a state without content; auto = arrival and nothing was shown before.
 *
 * Copy: `SkeletonRegion` takes `label` (for example "Cargando ingresos").
 * Animates transform only (the sweep is a translateX); the arrival fade animates opacity.
 */
"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import * as m from "motion/react-m";
import { AnimatePresence } from "motion/react";
import { cn } from "../lib/cn";
import { useMotionTier } from "../motion";

/** Seconds for one pass of the sweep. Lab value for loops. */
const SWEEP = 1.2;

const radiusClass = {
  sm: "rounded-(--radius-sm)",
  md: "rounded-(--radius-md)",
  lg: "rounded-(--radius-lg)",
} as const;

export interface SkeletonProps {
  /** Width and height come from className or style so the block matches the final content. */
  className?: string;
  style?: CSSProperties;
  radius?: keyof typeof radiusClass;
  /** Stagger the sweep of siblings by this many seconds. */
  delay?: number;
}

export function Skeleton({ className, style, radius = "md", delay = 0 }: SkeletonProps) {
  const t = useMotionTier("direct");
  return (
    <span
      aria-hidden="true"
      data-skeleton=""
      style={style}
      className={cn(
        "relative block overflow-hidden bg-(--color-surface-container)",
        radiusClass[radius],
        className,
      )}
    >
      {t.reduced ? null : (
        <m.span
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-on-surface) 7%, transparent), transparent)",
          }}
          initial={{ x: "-100%" }}
          animate={{ x: "100%" }}
          transition={{ duration: SWEEP, ease: "linear", repeat: Infinity, delay }}
        />
      )}
    </span>
  );
}

export interface SkeletonTextProps {
  lines?: number;
  /** Line height in px. 14px text sits well on 12. */
  lineHeight?: number;
  className?: string;
}

export function SkeletonText({ lines = 3, lineHeight = 12, className }: SkeletonTextProps) {
  return (
    <span aria-hidden="true" className={cn("flex flex-col gap-(--space-2)", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          radius="sm"
          delay={i * 0.1}
          style={{ height: lineHeight, width: i === lines - 1 && lines > 1 ? "60%" : "100%" }}
        />
      ))}
    </span>
  );
}

/** Milliseconds before a skeleton shows. Loads under 1 s never flash one (NN/g response time limits). */
const DEFAULT_DELAY_MS = 1000;

export interface SkeletonRegionProps {
  /** Announced to assistive tech, in the app's language. */
  label: string;
  children: ReactNode;
  /** Wait this long before showing the blocks. Default 1000; 0 shows them at once. */
  delayMs?: number;
  className?: string;
}

export function SkeletonRegion({ label, children, delayMs = DEFAULT_DELAY_MS, className }: SkeletonRegionProps) {
  const [shown, setShown] = useState(delayMs <= 0);
  useEffect(() => {
    if (delayMs <= 0) {
      setShown(true);
      return;
    }
    setShown(false);
    const id = window.setTimeout(() => setShown(true), delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs]);

  return (
    <div role="status" aria-busy="true" className={cn(shown ? undefined : "invisible", className)}>
      <span className="visible sr-only">{label}</span>
      {children}
    </div>
  );
}

export type RevealMode = "auto" | "roll" | "fade" | "none";

/**
 * How content that has just replaced a waiting state (skeleton, error, empty) should arrive.
 * Returns "none" on every render except the one right after the content appears. See the header.
 */
export function useReveal(hasContent: boolean, reveal: RevealMode = "auto"): "roll" | "fade" | "none" {
  const before = useRef<boolean | null>(null);
  const shown = useRef(false);
  const arrived = hasContent && before.current === false;
  const wasShown = shown.current;
  useEffect(() => {
    before.current = hasContent;
    if (hasContent) shown.current = true;
  });
  if (!arrived) return "none";
  if (reveal === "auto") return wasShown ? "none" : "roll";
  return reveal;
}

const swapVariants = {
  in: (animated: boolean) => ({ opacity: animated ? 0 : 1 }),
  rest: (animated: boolean) => ({ opacity: 1, transition: animated ? { duration: 0.2, ease: "easeOut" as const } : { duration: 0 } }),
  out: (animated: boolean) => ({ opacity: 0, transition: animated ? { duration: 0.1, ease: "easeIn" as const } : { duration: 0 } }),
};

export interface SkeletonSwapProps {
  /** Changes when the content kind changes (loading, error, empty, value). */
  swapKey: string;
  /** Cross-fade this change (the skeleton fades out while the content fades in). */
  animated: boolean;
  children: ReactNode;
}

/**
 * Swaps one block for another. Animated: the old block leaves 0.1 s (out of the flow, so nothing
 * jumps) while the new one fades in 0.2 s. Not animated: the swap is instant. The parent must be
 * positioned (relative).
 */
export function SkeletonSwap({ swapKey, animated, children }: SkeletonSwapProps) {
  return (
    <AnimatePresence initial={false} mode="popLayout" custom={animated}>
      <m.span key={swapKey} custom={animated} variants={swapVariants} initial="in" animate="rest" exit="out" className="block">
        {children}
      </m.span>
    </AnimatePresence>
  );
}
