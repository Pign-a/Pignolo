/**
 * Switch (on/off toggle that applies immediately).
 *
 * Use: a setting that takes effect at once. For a choice confirmed by a Save button use a checkbox.
 * Tier: D (direct: visualDuration 0.22, bounce 0). The thumb travels on the direct spring; while
 * pressed it stretches to 1.15 on x from the edge it sits on (70 ms) and springs back on release.
 * The checked track color is an opacity layer, so only transform and opacity animate.
 * Drag (iOS style): press anywhere on the switch and move sideways: after 3 px the press becomes a drag
 * and the thumb follows the pointer 1:1 along the track, clamped at both ends, as often and in any
 * direction as you like while the button is held; the track color follows the thumb. On release the
 * position is projected 0.2 s ahead with the pointer velocity (`project`): past the middle means on,
 * otherwise off, and the thumb finishes the move on the direct spring carrying that velocity (a short
 * fast flick throws it over, a long slow drag that stays under the middle drops back). The click that
 * the browser sends after a drag is swallowed, so it never toggles twice. Under 3 px of movement it
 * is a plain click. Pointer events on the window (no pointer capture): mouse, touch and pen work, and the
 * drag continues when the pointer leaves the switch. `touch-action: pan-y` lets horizontal drags reach the switch while a
 * vertical swipe still scrolls the page. Right to left: the thumb mirrors (the on side is the left)
 * and dragging left turns it on. A disabled switch cannot be pressed or dragged. Pointer cancel puts
 * the thumb back where the state says. Reduced motion: no stretch, and the release (like a click)
 * moves the thumb with no travel; while the button is held the thumb still follows the pointer, because
 * that is direct manipulation, not an animation.
 * Contrast (WCAG 1.4.11): the off track carries a 1.5 px ring in the outline token (3:1 or more
 * against the page, light and dark); the ring sits under the checked fill, so it needs no animation.
 * Forced colors (Windows high contrast): system colors, Canvas track with a CanvasText border,
 * Highlight when on, GrayText when disabled.
 * Touch: on `pointer: coarse` an invisible hit area brings the 28 px track to 44 px.
 * Radix: @radix-ui/react-switch (role="switch", aria-checked, form input, Space/Enter).
 * States: rest, hover, focus-visible (kit-focus), press (stretch), dragging, checked, disabled.
 * Keyboard: Tab to focus, Space toggles (Radix).
 * Copy: `label` and `description` props; without a visible label pass `aria-label`.
 */
"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ComponentPropsWithoutRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import * as RadixSwitch from "@radix-ui/react-switch";
import { animate, useMotionValue, useTransform } from "motion/react";
import type { AnimationPlaybackControls } from "motion/react";
import * as m from "motion/react-m";
import { presets, project, springFor, tier, useMotionTier } from "../motion";
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
/** A press that moves less than this many px is a click. */
const DRAG_START = 3;

interface DragState {
  id: number;
  startX: number;
  base: number;
  moved: boolean;
  samples: { t: number; x: number }[];
}

export function Switch({
  checked: checkedProp,
  defaultChecked = false,
  onCheckedChange,
  label,
  description,
  id,
  className,
  disabled,
  onClick,
  onPointerDown,
  ...rest
}: SwitchProps) {
  const t = useMotionTier("direct");
  const autoId = useId();
  const switchId = id ?? autoId;
  const descId = `${switchId}-desc`;
  const [checked, setChecked] = useControllable(checkedProp, defaultChecked, onCheckedChange);
  const [pressed, setPressed] = useState(false);
  const [rtl, setRtl] = useState(false);
  const [rev, setRev] = useState(0);
  const stretch = pressed && !t.reduced && !disabled;

  const rootRef = useRef<HTMLButtonElement | null>(null);
  // Thumb position along the track, 0 (start) to TRAVEL (end), whatever the writing direction.
  const x = useMotionValue(checked ? TRAVEL : 0);
  const fill = useMotionValue(checked ? 1 : 0);
  const sign = useMotionValue(1);
  const shown = useTransform(() => x.get() * sign.get());
  const playing = useRef<AnimationPlaybackControls[]>([]);
  const drag = useRef<DragState | null>(null);
  const settleTo = useRef<number | null>(null);
  const swallowUntil = useRef(0);
  const stopListening = useRef<(() => void) | null>(null);
  const reducedRef = useRef(t.reduced);
  reducedRef.current = t.reduced;

  const stopAll = () => {
    playing.current.forEach((p) => p.stop());
    playing.current = [];
  };
  const play = (...controls: AnimationPlaybackControls[]) => {
    playing.current.push(...controls);
  };

  useLayoutEffect(() => {
    const isRtl = !!rootRef.current && getComputedStyle(rootRef.current).direction === "rtl";
    setRtl(isRtl);
    sign.set(isRtl ? -1 : 1);
  });

  // Bring the thumb and the track to the state: on a click, a keyboard toggle, a controlled change or
  // when a drag ended (the release already started its own move with the pointer velocity).
  useLayoutEffect(() => {
    const target = checked ? TRAVEL : 0;
    if (settleTo.current !== null) {
      const started = settleTo.current;
      settleTo.current = null;
      if (started === target) return;
    }
    stopAll();
    if (reducedRef.current) {
      x.set(target);
      play(animate(fill, checked ? 1 : 0, checked ? { duration: presets.fade.enter, ease: "easeOut" } : { duration: presets.fade.exit, ease: "easeIn" }));
      return;
    }
    play(animate(x, target, springFor("direct")));
    play(animate(fill, checked ? 1 : 0, checked ? { duration: 0.18, ease: "easeOut" } : { duration: t.tier.exit, ease: "easeIn" }));
  }, [checked, rev, x, fill, t.tier.exit]);

  useEffect(
    () => () => {
      stopAll();
      stopListening.current?.();
    },
    [],
  );

  const velocityOf = (d: DragState, pos: number, now: number) => {
    d.samples.push({ t: now, x: pos });
    while (d.samples.length > 2 && now - (d.samples[0]?.t ?? now) > 100) d.samples.shift();
    const a = d.samples[0];
    const b = d.samples[d.samples.length - 1];
    if (!a || !b) return 0;
    const dt = (b.t - a.t) / 1000;
    return dt > 0.01 ? (b.x - a.x) / dt : 0;
  };

  const finish = (cancelled: boolean) => {
    setPressed(false);
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    stopListening.current?.();
    if (!d.moved) return; // a plain click: Radix toggles in its click handler
    swallowUntil.current = performance.now() + 150;
    const pos = x.get();
    const v = cancelled ? 0 : velocityOf(d, pos, performance.now());
    const next = cancelled ? checked : project(pos, v) > TRAVEL / 2;
    const target = next ? TRAVEL : 0;
    settleTo.current = target;
    stopAll();
    if (reducedRef.current) {
      x.set(target);
      fill.set(next ? 1 : 0);
    } else {
      const dt = tier("direct");
      play(animate(x, target, { type: "spring" as const, visualDuration: dt.visualDuration, bounce: dt.bounce, velocity: v }));
      play(animate(fill, next ? 1 : 0, { duration: 0.14, ease: "easeOut" }));
    }
    if (next !== checked) setChecked(next);
    setRev((r) => r + 1);
  };

  const handleMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const dir = sign.get();
    if (!d.moved) {
      if (Math.abs(e.clientX - d.startX) < DRAG_START) return;
      d.moved = true;
      stopAll();
    }
    const pos = Math.min(TRAVEL, Math.max(0, d.base + (e.clientX - d.startX) * dir));
    velocityOf(d, pos, performance.now());
    x.set(pos);
    fill.set(pos / TRAVEL);
  };
  // Kept in a ref so the window listeners always call the latest closure (checked, setChecked).
  const moveRef = useRef(handleMove);
  moveRef.current = handleMove;
  const finishRef = useRef(finish);
  finishRef.current = finish;

  // Window listeners instead of setPointerCapture: they work for mouse, touch and pen, and also when
  // the pointer leaves the switch during the drag.
  const handlePointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    onPointerDown?.(e);
    setPressed(true);
    if (disabled || e.defaultPrevented || (e.pointerType === "mouse" && e.button !== 0)) return;
    const isRtl = getComputedStyle(e.currentTarget).direction === "rtl";
    sign.set(isRtl ? -1 : 1);
    swallowUntil.current = 0;
    stopListening.current?.();
    drag.current = { id: e.pointerId, startX: e.clientX, base: x.get(), moved: false, samples: [{ t: performance.now(), x: x.get() }] };
    const move = (ev: PointerEvent) => moveRef.current(ev);
    const up = (ev: PointerEvent) => {
      if (ev.pointerId === drag.current?.id) finishRef.current(ev.type === "pointercancel");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    stopListening.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      stopListening.current = null;
    };
  };

  const control = (
    <RadixSwitch.Root
      {...rest}
      ref={rootRef}
      id={switchId}
      checked={checked}
      disabled={disabled}
      onCheckedChange={setChecked}
      aria-describedby={description ? descId : rest["aria-describedby"]}
      onClick={(e) => {
        // The click that follows a drag must not toggle the switch a second time.
        if (performance.now() < swallowUntil.current) {
          e.preventDefault();
          swallowUntil.current = 0;
          return;
        }
        onClick?.(e);
      }}
      onPointerDown={handlePointerDown}
      className={cn(
        "kit-focus group relative inline-flex h-7 w-12 shrink-0 cursor-pointer touch-pan-y items-center rounded-(--radius-full)",
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
        style={{ opacity: fill }}
      />
      <RadixSwitch.Thumb asChild>
        <m.span
          className="pointer-events-none absolute start-0.5 top-0.5 size-6 rounded-(--radius-full) bg-(--color-on-primary) shadow-(--elevation-1) forced-colors:bg-[CanvasText] forced-colors:shadow-none forced-colors:group-data-[state=checked]:bg-[HighlightText] forced-colors:group-disabled:bg-[GrayText]"
          style={{ x: shown, transformOrigin: checked !== rtl ? "100% 50%" : "0% 50%" }}
          initial={false}
          animate={{ scaleX: stretch ? 1.15 : 1 }}
          transition={{ scaleX: stretch ? { duration: 0.07, ease: "easeOut" } : springFor("direct") }}
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
