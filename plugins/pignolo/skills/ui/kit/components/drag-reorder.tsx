/**
 * DragReorder: rows you reorder by dragging a handle, with the arrow keys, or with
 * Move up and Move down buttons.
 *
 * Use when the order is the point (priorities, a checklist, display order) and the
 * list is short (about 3 to 10 rows with equal height). For add/remove rows without
 * dragging use List. Tier: M (momentum tier, 0.35 s, bounce 0.2: a dragged row has
 * inertia). Radix primitive: none (custom).
 *
 * Every drag has a single-pointer alternative (WCAG 2.5.7 Dragging Movements): each row
 * shows a Move up and a Move down button. They move the row one slot with the same
 * slide as a drag, announce the new position, and keep focus on the pressed button
 * (or on its twin when the pressed one is now at the end of the list).
 *
 * Controlled: `items` in, `onReorder(next)` out. It is called as soon as the dragged
 * row crosses a neighbour, so the other rows slide out of the way while you drag.
 * Physics: past the first or last slot the row follows the pointer through a rubber
 * band (factor 0.55). On release the pointer velocity of the last 100 ms is projected
 * 0.2 s ahead to pick the slot, and the row settles there with that velocity kept.
 * A drag can be grabbed again while it is still settling.
 *
 * States: rest, hover (row tint and Move button tint; the handle stays quiet: only the grab cursor,
 * no background or color change on hover or while held), focus-visible (handle, buttons),
 * dragging (row lifts to 1.03 with a soft shadow and sits above the others), disabled
 * (`disabled` prop: handle and buttons inert, no tint; Move up on the first row and
 * Move down on the last are disabled too). Reduced motion: the row still follows the pointer
 * (that is the user's own movement) but the lift, slide and settle become instant.
 * Keyboard: Tab to a handle; ArrowUp or ArrowDown moves that row one slot, Home and
 * End send it to the first or last slot. Focus stays on the handle. The visible hint
 * (`labels.hint`, required) says so and describes the handle. After every move, a polite
 * live region says where the row is now. Enter or Space presses a move button.
 * The handle is a real button (name from `labels.grip`), touch-action none so a finger
 * can drag it. Handle and move buttons are 36 and 32 px with a mouse, 44 px on coarse
 * pointers. DOM order follows the visual order once a drag ends (it is held steady
 * during the drag so pointer capture survives).
 *
 * Copy (all from props): labels.list, labels.grip(item), labels.moveUp(item),
 * labels.moveDown(item), labels.moved(item, position, total), labels.hint (the visible
 * instruction, required: the keyboard path must be discoverable).
 * Rows need a fixed height (`rowHeight`, default 48, so 44 px touch buttons fit) and
 * `gap` (default 8): positions are computed from them. Animates transform and opacity
 * only (translate, scale).
 */
"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import * as m from "motion/react-m";
import { animate, useMotionValue } from "motion/react";
import { cn } from "../lib/cn";
import { project, rubberBand, useMotionTier } from "../motion";

export interface DragItem {
  id: string;
  label: string;
  description?: string;
}

export interface DragReorderLabels<T extends DragItem> {
  /** Accessible name of the list. */
  list: string;
  /** Accessible name of the handle, e.g. "Mover Pagar alquiler". */
  grip: (item: T) => string;
  /** Accessible name of the Move up button, e.g. "Subir Pagar alquiler". */
  moveUp: (item: T) => string;
  /** Accessible name of the Move down button, e.g. "Bajar Pagar alquiler". */
  moveDown: (item: T) => string;
  /** Announced after a move, e.g. "Pagar alquiler: posición 2 de 5". */
  moved: (item: T, position: number, total: number) => string;
  /** Visible instruction under the list, e.g. "Arrastrá el asa o usá las flechas". Required: it also describes the handle. */
  hint: string;
}

export interface DragReorderProps<T extends DragItem> {
  items: T[];
  onReorder: (items: T[]) => void;
  labels: DragReorderLabels<T>;
  /** Row height in px. Default 48 (44 px touch buttons fit inside the border). */
  rowHeight?: number;
  /** Space between rows in px. Default 8. */
  gap?: number;
  disabled?: boolean;
  className?: string;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

interface Sample {
  t: number;
  y: number;
}

interface DragState {
  startY: number;
  base: number;
  index: number;
  raw: number;
  samples: Sample[];
  /** Removes the window listeners of this drag. */
  release: () => void;
}

type Part = "grip" | "up" | "down";

const moveIcons: Record<"up" | "down", ReactNode> = {
  up: <path d="M5 12.5l5-5 5 5" />,
  down: <path d="M5 7.5l5 5 5-5" />,
};

const moveButtonClass =
  "kit-focus relative flex size-8 pointer-coarse:size-11 shrink-0 items-center justify-center rounded-(--radius-md) text-(--color-on-surface-variant) hover:bg-(--color-border-subtle) hover:text-(--color-on-surface) active:bg-(--color-border-subtle) disabled:opacity-(--state-disabled-content) disabled:hover:bg-transparent";

interface RowProps<T extends DragItem> {
  item: T;
  slot: number;
  count: number;
  pitch: number;
  rowHeight: number;
  disabled: boolean;
  gripLabel: string;
  upLabel: string;
  downLabel: string;
  hintId: string;
  moveTo: (id: string, index: number) => void;
  onDragStart: (id: string) => void;
  onDragEnd: (id: string, index: number) => void;
  onKey: (id: string, key: "up" | "down" | "first" | "last", from: Part) => void;
  registerControl: (id: string, part: Part, el: HTMLButtonElement | null) => void;
}

function DragRow<T extends DragItem>({
  item,
  slot,
  count,
  pitch,
  rowHeight,
  disabled,
  gripLabel,
  upLabel,
  downLabel,
  hintId,
  moveTo,
  onDragStart,
  onDragEnd,
  onKey,
  registerControl,
}: RowProps<T>) {
  const t = useMotionTier("momentum");
  const y = useMotionValue(slot * pitch);
  const [lifted, setLifted] = useState(false);
  const drag = useRef<DragState | null>(null);
  const run = useRef<ReturnType<typeof animate> | null>(null);
  const target = useRef(slot * pitch);
  const slotRef = useRef(slot);
  slotRef.current = slot;

  const go = (to: number, velocity = 0) => {
    run.current?.stop();
    target.current = to;
    run.current = animate(
      y,
      to,
      t.reduced
        ? { duration: 0 }
        : { type: "spring", visualDuration: t.tier.visualDuration, bounce: t.tier.bounce, velocity },
    );
  };

  // Another row moved: slide to the new slot, unless a release is already settling there.
  useEffect(() => {
    if (drag.current || target.current === slot * pitch) return;
    go(slot * pitch);
  }, [slot, pitch]);

  const maxY = (count - 1) * pitch;

  const up = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    document.body.style.cursor = "";
    d.release();
    const first = d.samples[0];
    const last = d.samples[d.samples.length - 1];
    const dt = first && last ? (last.t - first.t) / 1000 : 0;
    const velocity = first && last && dt > 0.01 ? (last.y - first.y) / dt : 0;
    const dest = clamp(Math.round(project(d.raw, velocity) / pitch), 0, count - 1);
    if (dest !== d.index) moveTo(item.id, dest);
    go(dest * pitch, velocity);
    setLifted(false);
    onDragEnd(item.id, dest);
  };

  const move = (clientY: number) => {
    const d = drag.current;
    if (!d) return;
    const raw = d.base + (clientY - d.startY);
    d.raw = raw;
    const band = pitch * 2;
    y.set(raw < 0 ? -rubberBand(-raw, band) : raw > maxY ? maxY + rubberBand(raw - maxY, band) : raw);
    const now = performance.now();
    d.samples.push({ t: now, y: clientY });
    while (d.samples.length > 2 && now - (d.samples[0]?.t ?? now) > 100) d.samples.shift();
    const next = clamp(Math.round(raw / pitch), 0, count - 1);
    if (next !== d.index) {
      d.index = next;
      moveTo(item.id, next);
    }
  };

  // The drag listens on window, not on the handle: the row lags behind the pointer at the
  // edges (rubber band), so the pointer can leave the handle, and capture is not guaranteed.
  const down = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled || e.button !== 0 || drag.current) return;
    e.preventDefault();
    const handle = e.currentTarget;
    const pointerId = e.pointerId;
    handle.focus();
    try {
      handle.setPointerCapture(pointerId);
    } catch {
      // Capture is a convenience for touch; the window listeners carry the drag.
    }
    run.current?.stop();
    const onMove = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId === pointerId) move(ev.clientY);
    };
    const onEnd = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId === pointerId) up();
    };
    const release = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    document.body.style.cursor = "grabbing";
    drag.current = {
      startY: e.clientY,
      base: y.get(),
      index: slotRef.current,
      raw: y.get(),
      samples: [{ t: performance.now(), y: e.clientY }],
      release,
    };
    setLifted(true);
    onDragStart(item.id);
  };

  useEffect(
    () => () => {
      if (drag.current) document.body.style.cursor = "";
      drag.current?.release();
    },
    [],
  );

  const key = (e: KeyboardEvent<HTMLButtonElement>) => {
    const map: Record<string, "up" | "down" | "first" | "last"> = {
      ArrowUp: "up",
      ArrowDown: "down",
      Home: "first",
      End: "last",
    };
    const action = map[e.key];
    if (!action || disabled) return;
    e.preventDefault();
    onKey(item.id, action, "grip");
  };

  return (
    <m.li
      data-drag-row=""
      data-lifted={lifted || undefined}
      className="absolute inset-x-0 top-0 list-none"
      style={{ y, height: rowHeight, zIndex: lifted ? 10 : 0 }}
    >
      <m.div
        className={cn(
          "relative flex h-full items-center gap-(--space-2) rounded-(--radius-control) border border-(--color-border-subtle) bg-(--color-surface) pr-(--space-2) pl-(--space-1)",
          !disabled && "hover:bg-(--color-surface-container)",
        )}
        animate={{ scale: lifted && !t.reduced ? 1.03 : 1 }}
        transition={t.spring}
      >
        <m.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-(--radius-control) shadow-(--elevation-3)"
          initial={false}
          animate={{ opacity: lifted ? 1 : 0 }}
          transition={lifted ? { duration: 0.12 } : t.exit}
        />
        <button
          ref={(el) => registerControl(item.id, "grip", el)}
          type="button"
          data-drag-grip=""
          aria-label={gripLabel}
          aria-describedby={hintId}
          disabled={disabled}
          onPointerDown={down}
          onKeyDown={key}
          className={cn(
            "kit-focus relative flex size-9 pointer-coarse:size-11 shrink-0 touch-none items-center justify-center rounded-(--radius-md) text-(--color-on-surface-muted) select-none",
            disabled
              ? "opacity-(--state-disabled-content)"
              : "cursor-grab active:cursor-grabbing",
          )}
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="currentColor">
            <circle cx="7.5" cy="6" r="1.1" />
            <circle cx="12.5" cy="6" r="1.1" />
            <circle cx="7.5" cy="10" r="1.1" />
            <circle cx="12.5" cy="10" r="1.1" />
            <circle cx="7.5" cy="14" r="1.1" />
            <circle cx="12.5" cy="14" r="1.1" />
          </svg>
        </button>
        <span className="relative min-w-0 flex-1">
          <span className="block truncate text-sm text-(--color-on-surface)">{item.label}</span>
          {item.description ? (
            <span className="block truncate text-xs text-(--color-on-surface-muted)">{item.description}</span>
          ) : null}
        </span>
        {(["up", "down"] as const).map((part) => (
          <button
            key={part}
            ref={(el) => registerControl(item.id, part, el)}
            type="button"
            data-act={part}
            aria-label={part === "up" ? upLabel : downLabel}
            disabled={disabled || (part === "up" ? slot === 0 : slot === count - 1)}
            onClick={() => onKey(item.id, part, part)}
            className={moveButtonClass}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {moveIcons[part]}
            </svg>
          </button>
        ))}
      </m.div>
    </m.li>
  );
}

export function DragReorder<T extends DragItem>({
  items,
  onReorder,
  labels,
  rowHeight = 48,
  gap = 8,
  disabled = false,
  className,
}: DragReorderProps<T>) {
  const pitch = rowHeight + gap;
  const hintId = useId();
  const [announcement, setAnnouncement] = useState("");
  /** DOM order held steady while a pointer drag is in progress. */
  const [frozen, setFrozen] = useState<string[] | null>(null);
  const live = useRef(items);
  live.current = items;
  const controls = useRef(new Map<string, HTMLButtonElement>());
  const refocus = useRef<{ id: string; part: Part } | null>(null);

  // Reordering moves DOM nodes, which drops focus; give it back to the control that was in use
  // (or its twin when that one is now disabled at the end of the list, or the handle).
  useLayoutEffect(() => {
    const target = refocus.current;
    if (!target) return;
    refocus.current = null;
    const order: Part[] = target.part === "grip" ? ["grip"] : target.part === "up" ? ["up", "down", "grip"] : ["down", "up", "grip"];
    for (const part of order) {
      const el = controls.current.get(`${target.id}:${part}`);
      if (el && !el.disabled) {
        if (document.activeElement !== el) el.focus();
        return;
      }
    }
  });

  const say = (id: string, index: number) => {
    const item = live.current.find((e) => e.id === id);
    if (item) setAnnouncement(labels.moved(item, index + 1, live.current.length));
  };

  /** Move a row to `index` right now. Safe to call several times before React renders. */
  const moveTo = (id: string, index: number) => {
    const from = live.current.findIndex((e) => e.id === id);
    const item = live.current[from];
    if (!item || from === index) return;
    const next = live.current.slice();
    next.splice(from, 1);
    next.splice(index, 0, item);
    live.current = next;
    onReorder(next);
  };

  const onKey = (id: string, action: "up" | "down" | "first" | "last", origin: Part) => {
    const from = live.current.findIndex((e) => e.id === id);
    const last = live.current.length - 1;
    const to = action === "up" ? from - 1 : action === "down" ? from + 1 : action === "first" ? 0 : last;
    const index = clamp(to, 0, last);
    if (index === from) return;
    refocus.current = { id, part: origin };
    moveTo(id, index);
    say(id, index);
  };

  const ids = items.map((e) => e.id);
  const order = frozen
    ? [...frozen.filter((id) => ids.includes(id)), ...ids.filter((id) => !frozen.includes(id))]
    : ids;

  return (
    <div className={className}>
      <ul
        aria-label={labels.list}
        className="relative m-0 p-0"
        style={{ height: Math.max(0, items.length * pitch - gap) }}
      >
        {order.map((id) => {
          const item = items.find((e) => e.id === id);
          if (!item) return null;
          const slot = items.indexOf(item);
          return (
            <DragRow
              key={id}
              item={item}
              slot={slot}
              count={items.length}
              pitch={pitch}
              rowHeight={rowHeight}
              disabled={disabled}
              gripLabel={labels.grip(item)}
              upLabel={labels.moveUp(item)}
              downLabel={labels.moveDown(item)}
              hintId={hintId}
              moveTo={moveTo}
              onDragStart={() => setFrozen(live.current.map((e) => e.id))}
              onDragEnd={(dragId, index) => {
                refocus.current = { id: dragId, part: "grip" };
                say(dragId, index);
                setFrozen(null);
              }}
              onKey={onKey}
              registerControl={(controlId, part, el) => {
                if (el) controls.current.set(`${controlId}:${part}`, el);
                else controls.current.delete(`${controlId}:${part}`);
              }}
            />
          );
        })}
      </ul>
      <p id={hintId} className="mt-(--space-3) text-sm text-(--color-on-surface-muted)">
        {labels.hint}
      </p>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </div>
  );
}
