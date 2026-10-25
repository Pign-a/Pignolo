/**
 * List: rows you can add, remove and reorder, with the others flowing around the change.
 *
 * Use for short user-editable lists (tasks, items, payees), up to about 10 rows. For
 * comparing columns use a data table; for free-form dragging use DragReorder.
 * Tier: D (direct tier). Radix primitive: none (custom).
 *
 * The component is controlled: `items` in, `onChange(next)` out. Adding is the app's
 * job (any button that puts a new entry in `items`); a row that appears slides in
 * from the left. A removed row slides out to the right in the direct exit time while
 * the rows below close the gap with the spring at once (layout reflow). Deleting
 * many rows by clicking again and again keeps working: the leaving row stops
 * taking clicks the moment it starts leaving, and the reflow settles in about 0.3 s.
 *
 * States: row rest, hover (faint tint, height never changes), focus-visible on every
 * button, active (scale 0.97 in 70 ms), disabled (move up on the first row, move
 * down on the last), empty (title, optional body and action, replaces the list).
 * Reduced motion: no slide and no reflow travel, a quick fade only.
 * Keyboard: Tab through the buttons; Enter or Space presses one. On any control in a
 * row, Delete or Backspace removes the row, and Alt+ArrowUp or Alt+ArrowDown moves it;
 * the buttons carry aria-keyshortcuts ("Delete Backspace", "Alt+ArrowUp", "Alt+ArrowDown")
 * so assistive tech can announce them. After a removal focus lands on the next row's
 * remove button (or the previous one, or the list region when it is now empty). After a
 * move focus stays on the moved row. A polite live region announces removals and moves.
 *
 * Undo: a removal by the keyboard shortcut has no confirmation, so pass `onRemove`. It is
 * called after every removal with the entry, the index it had and how it was removed
 * ("shortcut" or "button"); the app shows an undo toast and, on undo, puts the entry
 * back at that index through its own state. The list never undoes by itself.
 * Touch: the row buttons are 32 px with a mouse and 44 px on coarse pointers.
 *
 * Copy (all from props): labels.list, labels.remove(entry), labels.moveUp(entry),
 * labels.moveDown(entry), labels.removed(entry), labels.moved(entry, position, total),
 * empty.title, empty.body, empty.action. The list has no spinner.
 * Animates transform and opacity only (layout="position" reflow).
 */
"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import * as m from "motion/react-m";
import { AnimatePresence, useIsPresent } from "motion/react";
import { cn } from "../lib/cn";
import { presets, springFor, useMotionTier } from "../motion";

export interface ListEntry {
  id: string;
  label: string;
  /** Optional second line, muted. */
  description?: string;
}

export interface ListLabels<T extends ListEntry> {
  /** Accessible name of the list. */
  list: string;
  remove: (entry: T) => string;
  moveUp: (entry: T) => string;
  moveDown: (entry: T) => string;
  /** Announced after a removal, e.g. "Pagar alquiler quitado". */
  removed: (entry: T) => string;
  /** Announced after a move, e.g. "Pagar alquiler: posición 2 de 5". */
  moved: (entry: T, position: number, total: number) => string;
}

export interface ListEmpty {
  title: string;
  body?: string;
  /** Usually the same button that adds an entry. */
  action?: ReactNode;
}

export interface ListRemoval<T extends ListEntry> {
  entry: T;
  /** Position the entry had, 0 based. Insert it back here to undo. */
  index: number;
  /** "shortcut" is Delete or Backspace on a row control (no confirmation); "button" is the remove button. */
  via: "shortcut" | "button";
}

export interface ListProps<T extends ListEntry> {
  items: T[];
  onChange: (items: T[]) => void;
  /** Called after each removal, so the app can offer undo. */
  onRemove?: (removal: ListRemoval<T>) => void;
  labels: ListLabels<T>;
  empty: ListEmpty;
  /** Show the move up and move down buttons. Default true. */
  reorderable?: boolean;
  className?: string;
}

type Part = "remove" | "up" | "down";

/** Keys that do what the button does from anywhere in the row. Read by assistive tech. */
const shortcuts: Record<Part, string> = {
  remove: "Delete Backspace",
  up: "Alt+ArrowUp",
  down: "Alt+ArrowDown",
};

const icons: Record<Part, ReactNode> = {
  remove: <path d="M5 5l10 10M15 5L5 15" />,
  up: <path d="M5 12.5l5-5 5 5" />,
  down: <path d="M5 7.5l5 5 5-5" />,
};

interface IconButtonProps {
  part: Part;
  label: string;
  disabled?: boolean;
  reduced: boolean;
  onClick: () => void;
  register: (el: HTMLButtonElement | null) => void;
}

function IconButton({ part, label, disabled, reduced, onClick, register }: IconButtonProps) {
  return (
    <m.button
      ref={register}
      type="button"
      data-act={part}
      aria-label={label}
      aria-keyshortcuts={shortcuts[part]}
      disabled={disabled}
      onClick={onClick}
      whileTap={
        reduced || disabled
          ? undefined
          : { scale: presets.press.scale, transition: { duration: presets.press.duration, ease: "easeOut" } }
      }
      className="kit-focus flex size-8 pointer-coarse:size-11 shrink-0 items-center justify-center rounded-(--radius-md) text-(--color-on-surface-variant) hover:bg-(--color-border-subtle) hover:text-(--color-on-surface) active:bg-(--color-border-subtle) disabled:opacity-(--state-disabled-content) disabled:hover:bg-transparent"
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
        {icons[part]}
      </svg>
    </m.button>
  );
}

interface RowBodyProps<T extends ListEntry> {
  entry: T;
  index: number;
  count: number;
  reorderable: boolean;
  labels: ListLabels<T>;
  reduced: boolean;
  onRemove: (via: "shortcut" | "button") => void;
  onMove: (delta: number) => void;
  register: (part: Part, el: HTMLButtonElement | null) => void;
}

/** Content of one row. It knows whether the row is leaving, so a leaving row takes no clicks. */
function RowBody<T extends ListEntry>({
  entry,
  index,
  count,
  reorderable,
  labels,
  reduced,
  onRemove,
  onMove,
  register,
}: RowBodyProps<T>) {
  const present = useIsPresent();
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onRemove("shortcut");
    } else if (reorderable && e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      onMove(e.key === "ArrowUp" ? -1 : 1);
    }
  };
  return (
    <div
      inert={!present}
      onKeyDown={onKeyDown}
      className={cn(
        "flex min-h-12 items-center gap-(--space-2) rounded-(--radius-control) border border-(--color-border-subtle) bg-(--color-surface) py-(--space-2) pr-(--space-2) pl-(--space-4) hover:bg-(--color-surface-container)",
        !present && "pointer-events-none",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-(--color-on-surface)">{entry.label}</span>
        {entry.description ? (
          <span className="block truncate text-xs text-(--color-on-surface-muted)">{entry.description}</span>
        ) : null}
      </span>
      {reorderable ? (
        <>
          <IconButton
            part="up"
            label={labels.moveUp(entry)}
            disabled={index === 0}
            reduced={reduced}
            onClick={() => onMove(-1)}
            register={(el) => register("up", el)}
          />
          <IconButton
            part="down"
            label={labels.moveDown(entry)}
            disabled={index === count - 1}
            reduced={reduced}
            onClick={() => onMove(1)}
            register={(el) => register("down", el)}
          />
        </>
      ) : null}
      <IconButton
        part="remove"
        label={labels.remove(entry)}
        reduced={reduced}
        onClick={() => onRemove("button")}
        register={(el) => register("remove", el)}
      />
    </div>
  );
}

interface Pending {
  id: string | null;
  part: Part;
}

export function List<T extends ListEntry>({
  items,
  onChange,
  onRemove,
  labels,
  empty,
  reorderable = true,
  className,
}: ListProps<T>) {
  const t = useMotionTier("direct");
  const regionRef = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const pending = useRef<Pending | null>(null);
  const [announcement, setAnnouncement] = useState("");

  // Move focus once the new items are in the DOM (a removed row's neighbour, or a moved row).
  useEffect(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    if (p.id === null) {
      regionRef.current?.focus();
      return;
    }
    const order: Part[] = p.part === "remove" ? ["remove"] : p.part === "up" ? ["up", "down"] : ["down", "up"];
    for (const part of order) {
      const el = buttons.current.get(`${p.id}:${part}`);
      if (el && !el.disabled) {
        el.focus();
        return;
      }
    }
  }, [items]);

  const remove = (id: string, via: "shortcut" | "button") => {
    const i = items.findIndex((e) => e.id === id);
    const entry = items[i];
    if (!entry) return;
    const next = items[i + 1] ?? items[i - 1];
    pending.current = { id: next ? next.id : null, part: "remove" };
    setAnnouncement(labels.removed(entry));
    onChange(items.filter((e) => e.id !== id));
    onRemove?.({ entry, index: i, via });
  };

  const move = (id: string, delta: number, part: Part) => {
    const i = items.findIndex((e) => e.id === id);
    const j = i + delta;
    const entry = items[i];
    if (!entry || j < 0 || j >= items.length) return;
    const next = items.slice();
    next.splice(i, 1);
    next.splice(j, 0, entry);
    pending.current = { id, part };
    setAnnouncement(labels.moved(entry, j + 1, items.length));
    onChange(next);
  };

  const register = (id: string, part: Part, el: HTMLButtonElement | null) => {
    const key = `${id}:${part}`;
    if (el) buttons.current.set(key, el);
    else buttons.current.delete(key);
  };

  return (
    <div ref={regionRef} tabIndex={-1} className={cn("outline-none", className)}>
      <ul aria-label={labels.list} className="relative m-0 flex list-none flex-col gap-(--space-2) p-0">
        <AnimatePresence mode="popLayout" initial={false}>
          {items.map((entry, i) => (
            <m.li
              key={entry.id}
              data-list-row=""
              className="has-[>div[inert]]:pointer-events-none"
              layout="position"
              initial={{ opacity: 0, x: t.distance(-14) }}
              animate={{ opacity: 1, x: 0, transition: t.enter }}
              exit={{ opacity: 0, x: t.distance(16), transition: t.exit }}
              transition={{ layout: t.reduced ? { duration: 0 } : springFor("direct") }}
            >
              <RowBody
                entry={entry}
                index={i}
                count={items.length}
                reorderable={reorderable}
                labels={labels}
                reduced={t.reduced}
                onRemove={(via) => remove(entry.id, via)}
                onMove={(d) => move(entry.id, d, d < 0 ? "up" : "down")}
                register={(part, el) => register(entry.id, part, el)}
              />
            </m.li>
          ))}
        </AnimatePresence>
      </ul>

      {items.length === 0 ? (
        <m.div
          data-list-empty=""
          className="rounded-(--radius-lg) border border-dashed border-(--color-border-subtle) p-(--space-6)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.18, ease: "easeOut", delay: t.reduced ? 0 : t.tier.exit } }}
        >
          <p className="text-base font-semibold text-(--color-on-surface)">{empty.title}</p>
          {empty.body ? <p className="mt-(--space-2) text-sm text-(--color-on-surface-variant)">{empty.body}</p> : null}
          {empty.action ? <div className="mt-(--space-4)">{empty.action}</div> : null}
        </m.div>
      ) : null}

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </div>
  );
}
