/**
 * Pignolo UI kit: motion tiers and presets.
 *
 * Every kit component declares one tier in its header comment. A tier is a
 * spring (visualDuration + bounce, both Motion spring options) plus an exit
 * time. Values are the author's blind choice (motion-and-microinteractions.md)
 * and mirror design.md `pignolo.motion.springs`. If the app's design.md says
 * otherwise, call `configureTiers()` once at startup; design.md wins.
 *
 * Reduced motion: wrap the app once in `KitMotionProvider` (MotionConfig
 * reducedMotion="user"). Per the Motion docs that disables transform and layout
 * animations and keeps opacity. `useMotionTier` also swaps the spring for a
 * quick opacity cross-fade and zeroes distances, so intent is explicit.
 *
 * Rules: transform and opacity only, exit faster than enter, never scale an
 * entry from below 0.92, interruptible (springs keep velocity when retargeted).
 *
 * CSS fallback (comment only): a spring can be approximated with a `linear()`
 * easing plus `@starting-style`, but CSS cannot carry velocity when
 * interrupted, so drag, lists and overlays use Motion.
 */
import { useMemo } from "react";
import { useReducedMotion } from "motion/react";
import type { MotionProps, Transition } from "motion/react";

export type TierName = "direct" | "momentum" | "data";

export interface Tier {
  /** Spring visualDuration, seconds (Motion spring option). */
  visualDuration: number;
  /** Spring bounce, 0 to 1. */
  bounce: number;
  /** Exit duration, seconds. Always shorter than visualDuration. */
  exit: number;
  /** Delay between siblings, seconds. 0 means no stagger. */
  stagger: number;
}

const defaults: Readonly<Record<TierName, Tier>> = {
  direct: { visualDuration: 0.22, bounce: 0.15, exit: 0.1, stagger: 0 },
  momentum: { visualDuration: 0.35, bounce: 0.2, exit: 0.13, stagger: 0 },
  // Exit 0.2 is the lab value for data; the sheet gives none.
  data: { visualDuration: 0.45, bounce: 0, exit: 0.2, stagger: 0.09 },
};

/** Live tiers. Read through `tier()` or `useMotionTier`. */
const live: Record<TierName, Tier> = {
  direct: { ...defaults.direct },
  momentum: { ...defaults.momentum },
  data: { ...defaults.data },
};

/** Override tiers from the app's design.md (pignolo.motion.springs). Call once at startup. */
export function configureTiers(overrides: Partial<Record<TierName, Partial<Tier>>>): void {
  (Object.keys(overrides) as TierName[]).forEach((name) => {
    live[name] = { ...live[name], ...overrides[name] };
  });
}

export function tier(name: TierName): Readonly<Tier> {
  return live[name];
}

/** Fixed numbers used by individual components. Seconds unless the name says px/scale. */
export const presets = {
  press: { scale: 0.97, duration: 0.07 },
  /** Hover lift in px, negative is up. Controls 2, cards 3. */
  hover: { control: -2, card: -3 },
  tooltip: { enter: 0.12, exit: 0.08, delay: 0 },
  /** Sidebar collapse: preferred 0.16 s, bounce 0. */
  sidebar: { visualDuration: 0.16, bounce: 0 },
  /** Edge resistance factor for drag, and how far ahead the release is projected (seconds). */
  drag: { rubberBand: 0.55, projection: 0.2 },
  /** Entry scale. Never below `scaleFloor`. */
  entryScale: 0.95,
  scaleFloor: 0.92,
  /** Stagger between menu items, seconds. */
  menuStagger: 0.03,
  /** Stagger for rolling digits, seconds (bars use the data tier, 0.09). */
  numberStagger: 0.05,
  /** Blur on number entry, px. */
  numberBlur: 2,
  /** Reduced motion cross-fade, seconds. */
  fade: { enter: 0.12, exit: 0.1 },
  /** Items must finish reflowing within this many seconds when a list changes. */
  reflowMax: 0.3,
} as const;

/** Spring for transform properties. */
export function springFor(t: TierName | Tier): Transition {
  const v = typeof t === "string" ? live[t] : t;
  return { type: "spring", visualDuration: v.visualDuration, bounce: v.bounce };
}

/** Enter transition: spring for transforms, a short ease-out for opacity. */
export function enterFor(t: TierName | Tier, reduced = false): Transition {
  if (reduced) return { duration: presets.fade.enter, ease: "easeOut" };
  const v = typeof t === "string" ? live[t] : t;
  return {
    default: springFor(v),
    opacity: { duration: Math.min(0.18, v.visualDuration * 0.9), ease: "easeOut" },
  };
}

/** Exit transition: short and ease-in, never slower than the enter. */
export function exitFor(t: TierName | Tier, reduced = false): Transition {
  if (reduced) return { duration: presets.fade.exit, ease: "easeIn" };
  const v = typeof t === "string" ? live[t] : t;
  return { duration: v.exit, ease: "easeIn" };
}

/** Scale to start an entry from. Clamped to the floor; 1 when reduced. */
export function entryScale(reduced: boolean, wanted: number = presets.entryScale): number {
  return reduced ? 1 : Math.max(presets.scaleFloor, wanted);
}

/**
 * iOS-style rubber band: `overshoot` px past an edge become a smaller visual
 * offset that approaches `dimension` asymptotically. `c` is `presets.drag.rubberBand`.
 */
export function rubberBand(overshoot: number, dimension: number, c: number = presets.drag.rubberBand): number {
  if (overshoot <= 0 || dimension <= 0) return 0;
  return (1 - 1 / ((overshoot * c) / dimension + 1)) * dimension;
}

/** Where a release at `velocity` (px/s) would land `seconds` later. */
export function project(position: number, velocity: number, seconds: number = presets.drag.projection): number {
  return position + velocity * seconds;
}

export interface MotionTier {
  name: TierName;
  reduced: boolean;
  tier: Readonly<Tier>;
  /** Spring for transforms. Under reduced motion, the cross-fade. */
  spring: Transition;
  enter: Transition;
  exit: Transition;
  /** Pass a travel distance in px; returns 0 under reduced motion. */
  distance: (px: number) => number;
  /** Entry scale, clamped to 0.92; 1 under reduced motion. */
  scaleFrom: (wanted?: number) => number;
  /** Delay for the i-th sibling; 0 under reduced motion. */
  delay: (index: number) => number;
}

/** Tier transitions that respect the user's reduced motion setting. */
export function useMotionTier(name: TierName): MotionTier {
  const reduced = useReducedMotion() ?? false;
  return useMemo<MotionTier>(() => {
    const t = live[name];
    return {
      name,
      reduced,
      tier: t,
      spring: reduced ? { duration: presets.fade.enter, ease: "easeOut" } : springFor(t),
      enter: enterFor(t, reduced),
      exit: exitFor(t, reduced),
      distance: (px) => (reduced ? 0 : px),
      scaleFrom: (wanted) => entryScale(reduced, wanted),
      delay: (index) => (reduced ? 0 : index * t.stagger),
    };
  }, [name, reduced]);
}

type PressProps = Pick<MotionProps, "whileTap" | "whileHover" | "transition">;

/**
 * Press and hover feedback for a touchable element. Press goes to 0.97 in 70 ms,
 * release and hover use the direct spring. Spread on an `m.*` element.
 */
export function pressProps(reduced: boolean, lift: number = presets.hover.control): PressProps {
  if (reduced) return {};
  return {
    whileTap: { scale: presets.press.scale, transition: { duration: presets.press.duration, ease: "easeOut" } },
    whileHover: { y: lift, transition: springFor("direct") },
    transition: springFor("direct"),
  };
}
