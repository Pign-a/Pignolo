/**
 * BottomSheet: a panel that slides up from the bottom edge and can be dragged down to dismiss.
 * Use when: a short task or a set of options on a narrow screen (share, filters, pick). On
 * wide screens a Modal reads better. Not for long forms or navigation.
 * Tier: momentum (spring 0.35 s, bounce 0.2 when the user drags or the sheet settles with
 *   inertia; rubber band 0.55; release projected 0.2 s ahead). The exit is 0.16 s: a large overlay
 *   leaves in 150 to 180 ms, longer than the 0.13 s of the tier.
 * Primitive: @radix-ui/react-dialog (focus trap, Esc, aria, scroll lock). Mount is delayed
 *   until the exit finishes, so Dialog `open` follows an internal `mounted` flag.
 * Motion: the sheet translates on y from its own height; the backdrop opacity follows the
 *   sheet position, also while dragging. Dragging starts on the header only (the body scrolls
 *   normally). Pulling up past the rest position meets a rubber band. On release the position
 *   is projected 0.2 s ahead with the pointer velocity: past half the height it dismisses
 *   (the spring keeps the velocity), otherwise it springs back with that velocity. Closing with
 *   the button, Esc or the backdrop uses the faster exit tween. Opening mid exit retargets.
 *   Transform and opacity only. Reduced motion: no travel, cross-fade; dragging still follows
 *   the pointer and releases without a spring.
 * Pull up: the sheet body reaches 120 px below the viewport edge (`-bottom-30` plus `pb-30`, the same size
 *   as the rubber band, as iOS sheets do), so pulling it up past the rest position never shows the page
 *   under it or cuts the sheet off; the visible height, the dismiss threshold and the closed position all
 *   discount that extra. The body scrolls with the kit's `kit-scroll` thin scrollbar (tokens.css), not the
 *   browser default.
 * Round 1 lab bug: focus() scrolled the overflow container. Here the sheet root is
 *   `overflow: clip` (it cannot be scrolled by focus) and every focus call passes preventScroll.
 * States: closed, open, dragging (grab cursor), settling; close button and footer buttons rest,
 *   hover, focus-visible, press (0.97 in 75 ms).
 * Keyboard: focus moves inside and is trapped; Esc and the close button dismiss (there is no
 *   keyboard drag, the close button is the equivalent); focus returns to the opener afterwards.
 *   `preventDismiss` turns off Esc, the backdrop and the drag; the close button still closes.
 *   Initial focus: `initialFocusRef`, else an element with `data-autofocus`, else the first control
 *   of the body, else the sheet.
 * Copy props: title, description, closeLabel, children, footer.
 */
"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { animate, useMotionValue, useTransform } from "motion/react";
import type { AnimationPlaybackControls } from "motion/react";
import * as m from "motion/react-m";
import { cn } from "../lib/cn";
import { presets, project, rubberBand, tier, useMotionTier } from "../motion";

export interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  /** Buttons row at the bottom. */
  footer?: ReactNode;
  /** Accessible name of the close button. */
  closeLabel: string;
  /** Turns off Esc, the backdrop and the drag (unsaved changes). The close button still closes. */
  preventDismiss?: boolean;
  /** Element to focus on open. Default: `[data-autofocus]`, else the first control of the body. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
}

/** A large overlay leaves in 150 to 180 ms. */
const SHEET_EXIT = 0.16;
/** Extra distance past the sheet height so the shadow leaves the screen too. */
const CLEARANCE = 24;
/** How far the rubber band can stretch, in px. */
const BAND = 120;
/** The sheet body reaches this far below the viewport edge (as iOS sheets do), so pulling up never opens a gap. Keep equal to -bottom-30 / pb-30 below (7.5 rem = 120 px). */
const EXTRA = BAND;

/** Momentum spring that starts with the given velocity (px/s). */
const spring = (velocity: number) => {
  const mt = tier("momentum");
  return { type: "spring" as const, visualDuration: mt.visualDuration, bounce: mt.bounce, velocity };
};

interface DragState {
  startY: number;
  base: number;
  raw: number;
  samples: { t: number; y: number }[];
}

export function BottomSheet({ open, onOpenChange, title, description, children, footer, closeLabel, preventDismiss = false, initialFocusRef, className }: BottomSheetProps) {
  const t = useMotionTier("momentum");
  const [mounted, setMounted] = useState(open);
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const y = useMotionValue(typeof window === "undefined" ? 0 : window.innerHeight);
  const fade = useMotionValue(1);
  const size = useRef(0);
  const entered = useRef(false);
  const playing = useRef<AnimationPlaybackControls | null>(null);
  const drag = useRef<DragState | null>(null);
  const exitVelocity = useRef<number | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const reducedRef = useRef(t.reduced);
  reducedRef.current = t.reduced;
  const preventDismissRef = useRef(preventDismiss);
  preventDismissRef.current = preventDismiss;
  const stop = preventDismiss ? (e: Event) => e.preventDefault() : undefined;

  const backdrop = useTransform(() => (reducedRef.current ? fade.get() : Math.min(1, Math.max(0, 1 - y.get() / (size.current || window.innerHeight)))));

  const run = useCallback((controls: AnimationPlaybackControls) => {
    playing.current?.stop();
    playing.current = controls;
    return controls;
  }, []);

  // Mount when asked to open.
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  // Drive the sheet whenever the node exists or `open` changes.
  useLayoutEffect(() => {
    if (!node) return;
    // The body is EXTRA px taller than what shows, because it reaches below the viewport edge.
    const closed = node.offsetHeight - EXTRA + CLEARANCE;
    size.current = closed;
    if (open) {
      exitVelocity.current = null;
      if (!entered.current) {
        entered.current = true;
        y.set(reducedRef.current ? 0 : closed);
        fade.set(reducedRef.current ? 0 : 1);
      }
      if (reducedRef.current) {
        run(animate(y, 0, { duration: 0.12, ease: "easeOut" }));
        run(animate(fade, 1, { duration: presets.fade.enter, ease: "easeOut" }));
      } else {
        run(animate(y, 0, spring(0)));
      }
      return;
    }
    // Closing.
    const done = () => {
      setMounted(false);
      entered.current = false;
    };
    if (reducedRef.current) {
      run(animate(fade, 0, { duration: presets.fade.exit, ease: "easeIn", onComplete: done }));
      return;
    }
    const v = exitVelocity.current;
    exitVelocity.current = null;
    if (v !== null) run(animate(y, closed, { ...spring(v), onComplete: done }));
    else run(animate(y, closed, { duration: SHEET_EXIT, ease: "easeIn", onComplete: done }));
  }, [node, open, y, fade, run]);

  const velocityOf = (d: DragState, clientY: number, now: number) => {
    d.samples.push({ t: now, y: clientY });
    while (d.samples.length > 2 && now - (d.samples[0]?.t ?? now) > 100) d.samples.shift();
    const a = d.samples[0];
    const b = d.samples[d.samples.length - 1];
    if (!a || !b) return 0;
    const dt = (b.t - a.t) / 1000;
    return dt > 0.01 ? (b.y - a.y) / dt : 0;
  };

  // Window listeners instead of setPointerCapture: they work for mouse, touch and pen, and also
  // when the pointer leaves the sheet. The header has touch-action: none so touch does not scroll.
  const stopListening = useRef<(() => void) | null>(null);
  useEffect(() => () => stopListening.current?.(), []);

  const endDrag = (clientY: number) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    stopListening.current?.();
    setDragging(false);
    const v = velocityOf(d, clientY, performance.now());
    const height = size.current - CLEARANCE;
    const projected = project(d.raw, v);
    if (projected > height * 0.5 && !preventDismissRef.current) {
      exitVelocity.current = reducedRef.current ? null : Math.max(v, 0);
      onOpenChange(false);
      return;
    }
    if (reducedRef.current) run(animate(y, 0, { duration: 0.1, ease: "easeOut" }));
    else run(animate(y, 0, spring(v)));
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!open || (e.pointerType === "mouse" && e.button !== 0)) return;
    if ((e.target as HTMLElement).closest("button, a, input, textarea, select")) return;
    playing.current?.stop();
    drag.current = { startY: e.clientY, base: y.get(), raw: y.get(), samples: [{ t: performance.now(), y: e.clientY }] };
    setDragging(true);
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const raw = d.base + (ev.clientY - d.startY);
      d.raw = raw;
      velocityOf(d, ev.clientY, performance.now());
      y.set(raw < 0 ? -rubberBand(-raw, BAND) : raw);
    };
    const up = (ev: PointerEvent) => endDrag(ev.clientY);
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

  return (
    <Dialog.Root
      open={mounted}
      onOpenChange={(next) => {
        if (!next) onOpenChange(false);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <m.div className="fixed inset-0 z-50 bg-[color-mix(in_srgb,var(--color-on-surface)_40%,transparent)]" style={{ opacity: backdrop }} />
        </Dialog.Overlay>
        <Dialog.Content
          asChild
          {...(description ? {} : { "aria-describedby": undefined })}
          onEscapeKeyDown={stop}
          onPointerDownOutside={stop}
          onInteractOutside={stop}
          onOpenAutoFocus={(e) => {
            // Keep the page where it is: focus without scrolling, and remember the opener.
            e.preventDefault();
            opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            const root = e.currentTarget as HTMLElement | null;
            const target =
              initialFocusRef?.current ??
              root?.querySelector<HTMLElement>("[data-autofocus]") ??
              root?.querySelector<HTMLElement>("[data-sheet-content] :is(input, textarea, select, button, a[href])");
            (target ?? root)?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
          }}
        >
          <m.div
            ref={setNode}
            style={{ y, opacity: fade }}
            className={cn(
              "fixed inset-x-0 -bottom-30 z-50 mx-auto flex max-h-[calc(85dvh+7.5rem)] w-full max-w-[560px] flex-col overflow-clip rounded-t-(--radius-xl) border border-b-0 border-(--color-border-subtle) bg-(--color-surface) pb-30 shadow-(--elevation-4) outline-none",
              className,
            )}
          >
            <div
              data-handle=""
              onPointerDown={onPointerDown}
              className={cn("flex touch-none flex-col items-center gap-2 px-6 pt-2 pb-2 select-none", dragging ? "cursor-grabbing" : "cursor-grab")}
            >
              <span aria-hidden="true" className="h-1 w-10 rounded-(--radius-sm) bg-(--color-border-strong)" />
              <div className="flex w-full items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1 pt-1">
                  <Dialog.Title className="text-base font-semibold tracking-tight text-(--color-on-surface)">{title}</Dialog.Title>
                  {description && <Dialog.Description className="text-sm text-(--color-on-surface-variant)">{description}</Dialog.Description>}
                </div>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label={closeLabel}
                    className="kit-focus -mr-2 inline-flex size-10 shrink-0 items-center justify-center rounded-(--radius-control) text-(--color-on-surface-variant) transition-[scale,background-color] duration-75 ease-out hover:bg-(--color-surface-container) active:scale-[0.97] active:bg-(--color-border-subtle) motion-reduce:active:scale-100"
                  >
                    <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M5 5l10 10M15 5L5 15" />
                    </svg>
                  </button>
                </Dialog.Close>
              </div>
            </div>
            {children && <div data-sheet-content="" className="kit-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-2 pb-2">{children}</div>}
            {footer && <div data-sheet-content="" className="flex flex-col gap-2 px-6 pt-4 pb-6">{footer}</div>}
            {!footer && <div className="pb-4" />}
          </m.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
