/**
 * Toast: ToastProvider, useToast and a stacked, self reflowing list of short messages.
 * Use when: a background action finished or something needs attention without blocking
 * ("Gasto eliminado" with Undo). Prefer Undo in the toast to a confirm dialog. Validation
 * errors are inline, never a toast; do not toast every save. At most 2 lines and 1 action.
 * Tier: momentum (0.35 s, bounce 0.2, exit 0.13 s, enters rising 28 px from the edge it sits at;
 *   the 28 px and the spring are the author's blind vote, the bounce is the tier value).
 *   The reflow when a toast is removed uses the direct spring (bounce 0) so it settles under 300 ms.
 * Primitive: none (custom). The provider owns the queue, the timers and two persistent live
 *   regions; the list uses AnimatePresence popLayout plus `layout="position"` so the others slide
 *   into the gap.
 * Announcing: two visually hidden regions exist from the first render, a polite `role="status"`
 *   and an assertive `role="alert"`, and are filled when a toast is shown or updated. A live
 *   region that is created together with its text is often not announced, so the toast cards
 *   themselves carry no live role. Errors and warnings go to the alert region, the rest to the
 *   status region.
 * Time (WCAG 2.2.1, 2.2.2): errors, warnings and loading never auto dismiss; others use `duration`
 *   (default 5000 ms, null keeps them). A toast with an action (Undo is usually the only way back)
 *   lasts at least `actionMinDuration` (10 s) whatever `duration` asked. Every timer pauses while
 *   the pointer or focus is inside the region and while the window is blurred or hidden.
 * Hotkeys: F8 (`focusHotkey`) moves focus to the newest toast; Alt+Z (`actionHotkey`) runs the action
 *   of the newest toast that has one and dismisses it. The region declares `aria-keyshortcuts`, the
 *   newest action does too and shows the keys next to its label (hidden on touch).
 * Overflow: when a toast pushes the stack over `max`, the oldest auto dismissing toast leaves. Toasts
 *   that persist (errors, warnings, loading, `duration: null`) and toasts with an action are never
 *   expelled: the stack grows past `max` instead.
 * States: enter, exit, variants (neutral, success, info, warning, error, loading) always show an
 *   icon plus words, action and close buttons (rest, hover, focus-visible, press 0.97 in 75 ms,
 *   44 px on touch), a loading toast resolves in place with `update` (its spinner pulses under
 *   reduced motion).
 * Keyboard: Tab reaches action and close buttons (the region is the last thing in the DOM
 *   of the provider); Esc on a focused toast dismisses it; the hotkeys above.
 * Motion: opacity and transform only. Reduced motion: fade only, no rise, no reflow travel.
 * Copy props: closeLabel, regionLabel on the provider; title, description, action.label per toast.
 */
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { cn } from "../lib/cn";
import { coarseTarget, springFor, useMotionTier } from "../motion";

export type ToastVariant = "neutral" | "success" | "info" | "warning" | "error" | "loading";
export type ToastPlacement = "bottom-right" | "bottom-left" | "bottom-center" | "top-right" | "top-left";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** One optional action, for example Undo. Clicking it also dismisses the toast. */
  action?: ToastAction;
  /**
   * Milliseconds before it dismisses itself. null keeps it. Default: 5000, none for warning, error and loading.
   * With an `action` it is raised to the provider's `actionMinDuration` (10 s).
   */
  duration?: number | null;
}

export interface ToastApi {
  /** Shows a toast and returns its id. */
  toast: (options: ToastOptions) => string;
  /** Changes a toast in place (a loading toast becoming a success, for example). */
  update: (id: string, options: Partial<ToastOptions>) => void;
  /** Dismisses one toast, or all when no id is given. */
  dismiss: (id?: string) => void;
}

interface ToastRecord extends ToastOptions {
  id: string;
  /** Bumped by `update`; restarts the timer. */
  rev: number;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>.");
  return api;
}

export interface ToastProviderProps {
  children: ReactNode;
  /** Accessible name of the close button. */
  closeLabel: string;
  /** Accessible name of the region that holds the toasts. */
  regionLabel: string;
  placement?: ToastPlacement;
  /** Visible toasts. The oldest auto dismissing one leaves when a new one exceeds it; persistent ones stay. Default 4. */
  max?: number;
  /** Default auto dismiss time in ms. Default 5000. */
  defaultDuration?: number;
  /** Shortest time a toast with an action stays, in ms. Default 10000. */
  actionMinDuration?: number;
  /** Key that moves focus to the newest toast. Default "F8". */
  focusHotkey?: string;
  /** Key that runs the action of the newest actionable toast. Default "Alt+Z". */
  actionHotkey?: string;
}

const placementClasses: Record<ToastPlacement, string> = {
  "bottom-right": "bottom-4 right-4 items-end",
  "bottom-left": "bottom-4 left-4 items-start",
  "bottom-center": "bottom-4 left-1/2 -translate-x-1/2 items-center",
  "top-right": "top-4 right-4 items-end",
  "top-left": "top-4 left-4 items-start",
};

function effectiveDuration(o: ToastOptions, fallback: number, actionMin: number): number | null {
  let d: number | null;
  if (o.duration !== undefined) d = o.duration;
  else {
    const v = o.variant ?? "neutral";
    d = v === "warning" || v === "error" || v === "loading" ? null : fallback;
  }
  return d !== null && o.action ? Math.max(d, actionMin) : d;
}

/** Matches "F8", "Alt+Z", "Ctrl+Shift+K" against a key event (letters by physical key, so Alt+Z works on any layout). */
function matchesHotkey(e: KeyboardEvent, combo: string): boolean {
  const parts = combo.split("+").map((p) => p.trim());
  const key = (parts.pop() ?? "").toLowerCase();
  const has = (...names: string[]) => parts.some((p) => names.includes(p));
  if (e.altKey !== has("Alt") || e.ctrlKey !== has("Ctrl", "Control") || e.shiftKey !== has("Shift") || e.metaKey !== has("Meta", "Cmd")) return false;
  if (key.length === 1) return e.code === `Key${key.toUpperCase()}` || e.code === `Digit${key}` || e.key.toLowerCase() === key;
  return e.key.toLowerCase() === key;
}

let counter = 0;
let liveCounter = 0;

interface LiveMessage {
  id: number;
  text: string;
}

export function ToastProvider({
  children,
  closeLabel,
  regionLabel,
  placement = "bottom-right",
  max = 4,
  defaultDuration = 5000,
  actionMinDuration = 10000,
  focusHotkey = "F8",
  actionHotkey = "Alt+Z",
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [windowActive, setWindowActive] = useState(true);
  const [live, setLive] = useState<{ polite?: LiveMessage; assertive?: LiveMessage }>({});
  const regionRef = useRef<HTMLElement | null>(null);
  const toastsRef = useRef<ToastRecord[]>([]);
  toastsRef.current = toasts;
  const t = useMotionTier("momentum");
  const top = placement.startsWith("top");
  const paused = hovered || focused || !windowActive;

  const dismiss = useCallback((id?: string) => {
    setToasts((list) => (id === undefined ? [] : list.filter((x) => x.id !== id)));
  }, []);

  const announce = useCallback((o: ToastOptions) => {
    const kind = o.variant === "error" || o.variant === "warning" ? "assertive" : "polite";
    const text = [o.title, o.description].filter(Boolean).join(". ");
    setLive((l) => ({ ...l, [kind]: { id: ++liveCounter, text } }));
  }, []);

  // A focused toast that is removed fires no blur: release the focus pause when focus is no longer inside.
  useEffect(() => {
    if (focused && !regionRef.current?.contains(document.activeElement)) setFocused(false);
  }, [toasts, focused]);

  // The announcement stays in the regions for a few seconds so a screen reader can reach it, then empties them.
  useEffect(() => {
    const id = window.setTimeout(() => setLive({}), 6000);
    return () => window.clearTimeout(id);
  }, [live]);

  const toast = useCallback(
    (options: ToastOptions) => {
      const id = `toast-${++counter}`;
      const keeps = (x: ToastOptions) => x.action !== undefined || effectiveDuration(x, defaultDuration, actionMinDuration) === null;
      setToasts((list) => {
        const next = [...list, { ...options, id, rev: 0 }];
        let over = next.length - max;
        while (over > 0) {
          // The oldest one that is allowed to go (never the new one, never one that persists or has an action).
          const i = next.findIndex((x, idx) => idx < next.length - 1 && !keeps(x));
          if (i < 0) break;
          next.splice(i, 1);
          over--;
        }
        return next;
      });
      announce(options);
      return id;
    },
    [max, defaultDuration, actionMinDuration, announce],
  );

  const update = useCallback(
    (id: string, options: Partial<ToastOptions>) => {
      const current = toastsRef.current.find((x) => x.id === id);
      if (current) announce({ ...current, ...options });
      setToasts((list) => list.map((x) => (x.id === id ? { ...x, ...options, rev: x.rev + 1 } : x)));
    },
    [announce],
  );

  const api = useMemo<ToastApi>(() => ({ toast, update, dismiss }), [toast, update, dismiss]);

  // Hotkeys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (matchesHotkey(e, focusHotkey)) {
        const target = regionRef.current?.querySelector<HTMLElement>(top ? "li:first-child button" : "li:last-child button");
        if (!target) return;
        e.preventDefault();
        target.focus();
      } else if (matchesHotkey(e, actionHotkey)) {
        const list = toastsRef.current;
        for (let i = list.length - 1; i >= 0; i--) {
          const record = list[i];
          if (record?.action) {
            e.preventDefault();
            record.action.onClick();
            dismiss(record.id);
            return;
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [top, focusHotkey, actionHotkey, dismiss]);

  // Pause when the user leaves the window: they cannot read or act on the toast from elsewhere.
  useEffect(() => {
    const on = () => setWindowActive(true);
    const off = () => setWindowActive(false);
    const visibility = () => setWindowActive(!document.hidden);
    window.addEventListener("focus", on);
    window.addEventListener("blur", off);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("focus", on);
      window.removeEventListener("blur", off);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  // Bottom placements keep the newest closest to the edge it enters from; top placements put it first.
  const ordered = top ? [...toasts].reverse() : toasts;
  const enterY = t.distance(top ? -28 : 28);
  const exitY = t.distance(top ? -10 : 10);
  const hotkeyOwner = [...toasts].reverse().find((x) => x.action)?.id;

  return (
    <ToastContext.Provider value={api}>
      {children}
      <section
        ref={regionRef}
        aria-label={regionLabel}
        aria-keyshortcuts={focusHotkey}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
        }}
        className={cn("pointer-events-none fixed z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col", placementClasses[placement])}
      >
        <ol className="pointer-events-none m-0 flex w-full list-none flex-col gap-2 p-0">
          <AnimatePresence initial={false} mode="popLayout">
            {ordered.map((record) => (
              <m.li
                key={record.id}
                layout="position"
                className="pointer-events-auto"
                initial={{ opacity: 0, y: enterY }}
                animate={{ opacity: 1, y: 0, transition: t.enter }}
                exit={{ opacity: 0, y: exitY, transition: t.exit }}
                transition={{ layout: t.reduced ? { duration: 0 } : springFor("direct") }}
              >
                <ToastCard
                  record={record}
                  paused={paused}
                  closeLabel={closeLabel}
                  fallbackDuration={defaultDuration}
                  actionMin={actionMinDuration}
                  hotkey={record.id === hotkeyOwner ? actionHotkey : undefined}
                  onDismiss={() => dismiss(record.id)}
                />
              </m.li>
            ))}
          </AnimatePresence>
        </ol>
      </section>
      {/* Persistent live regions: they exist before any text is put in them. */}
      <div role="status" aria-live="polite" aria-atomic="true" data-toast-live="polite" className="sr-only">
        {live.polite && <p key={live.polite.id}>{live.polite.text}</p>}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true" data-toast-live="assertive" className="sr-only">
        {live.assertive && <p key={live.assertive.id}>{live.assertive.text}</p>}
      </div>
    </ToastContext.Provider>
  );
}

const variantColor: Record<Exclude<ToastVariant, "neutral" | "loading">, string> = {
  success: "text-(--color-success)",
  info: "text-(--color-primary)",
  warning: "text-(--color-warning)",
  error: "text-(--color-error)",
};

function StatusIcon({ variant }: { variant: ToastVariant }) {
  if (variant === "neutral") return null;
  const common = { viewBox: "0 0 20 20", width: 20, height: 20, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
  let glyph: ReactNode;
  if (variant === "success") glyph = (<><circle cx="10" cy="10" r="7.5" /><path d="M6.8 10.3l2.3 2.3 4.2-4.6" /></>);
  else if (variant === "error") glyph = (<><circle cx="10" cy="10" r="7.5" /><path d="M7.5 7.5l5 5M12.5 7.5l-5 5" /></>);
  else if (variant === "warning") glyph = (<><path d="M10 3.5l7 12.5H3z" /><path d="M10 8.5v3.2M10 13.8v.1" /></>);
  else if (variant === "info") glyph = (<><circle cx="10" cy="10" r="7.5" /><path d="M10 9v4.5M10 6.6v.1" /></>);
  else glyph = <path d="M10 3a7 7 0 1 0 7 7" />;
  return (
    <m.span
      aria-hidden="true"
      className={cn("mt-px flex shrink-0", variant === "loading" ? "text-(--color-primary)" : variantColor[variant])}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.14, ease: "easeOut" } }}
    >
      <svg {...common} className={variant === "loading" ? "animate-spin motion-reduce:animate-pulse" : undefined}>
        {glyph}
      </svg>
    </m.span>
  );
}

function ToastCard({
  record,
  paused,
  closeLabel,
  fallbackDuration,
  actionMin,
  hotkey,
  onDismiss,
}: {
  record: ToastRecord;
  paused: boolean;
  closeLabel: string;
  fallbackDuration: number;
  actionMin: number;
  hotkey?: string;
  onDismiss: () => void;
}) {
  const variant = record.variant ?? "neutral";
  const duration = effectiveDuration(record, fallbackDuration, actionMin);
  const remaining = useRef<number | null>(duration);
  const lastRev = useRef(record.rev);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (lastRev.current !== record.rev) {
      lastRev.current = record.rev;
      remaining.current = duration;
    }
    if (duration === null || remaining.current === null || paused) return;
    const left = remaining.current;
    const started = performance.now();
    const id = window.setTimeout(() => dismissRef.current(), left);
    return () => {
      window.clearTimeout(id);
      remaining.current = Math.max(0, left - (performance.now() - started));
    };
  }, [paused, duration, record.rev]);

  return (
    <div
      data-variant={variant}
      data-duration={duration === null ? "persistent" : duration}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onDismiss();
        }
      }}
      className="flex items-start gap-3 rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-surface) py-3 pr-2 pl-4 shadow-(--elevation-3)"
    >
      <StatusIcon key={variant} variant={variant} />
      <div className="min-w-0 flex-1 py-px">
        <p className="m-0 text-sm font-medium text-(--color-on-surface)">{record.title}</p>
        {record.description && <p className="mt-0.5 mb-0 text-sm text-(--color-on-surface-variant)">{record.description}</p>}
      </div>
      {record.action && (
        <button
          type="button"
          aria-keyshortcuts={hotkey}
          onClick={() => {
            record.action?.onClick();
            onDismiss();
          }}
          className={cn(
            "kit-focus inline-flex min-h-8 shrink-0 items-center gap-2 rounded-(--radius-md) px-2.5 text-sm font-medium text-(--color-primary) transition-[scale,background-color] duration-75 ease-out hover:bg-(--color-primary-container) active:scale-[0.97] active:bg-(--color-primary-container) motion-reduce:active:scale-100",
            coarseTarget,
          )}
        >
          {record.action.label}
          {hotkey && (
            <kbd aria-hidden="true" className="rounded-(--radius-sm) border border-(--color-border-subtle) px-1.5 py-px font-sans text-xs font-normal text-(--color-on-surface-muted) pointer-coarse:hidden">
              {hotkey}
            </kbd>
          )}
        </button>
      )}
      <button
        type="button"
        aria-label={closeLabel}
        onClick={onDismiss}
        className={cn(
          "kit-focus inline-flex size-8 shrink-0 items-center justify-center rounded-(--radius-md) text-(--color-on-surface-variant) transition-[scale,background-color] duration-75 ease-out hover:bg-(--color-surface-container) active:scale-[0.97] active:bg-(--color-border-subtle) motion-reduce:active:scale-100",
          coarseTarget,
        )}
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M5 5l10 10M15 5L5 15" />
        </svg>
      </button>
    </div>
  );
}
