/**
 * Dropdown: a value picker that replaces the native <select>.
 * Use when: the user picks one value from 6 or more options (2 options: radios, 3 to 5:
 * segmented control). A menu of actions is a different control.
 * Tier: direct (about 0.2 s, no spring overshoot, no per item stagger; exit 0.1 s). It is a
 *   CSS keyframe animation driven by the tier numbers, see Motion below for why.
 * Primitive: @radix-ui/react-popover, non modal, wrapped as the WAI-ARIA APG select-only
 *   combobox. The trigger is a button with role="combobox" (aria-expanded, aria-controls,
 *   aria-required, aria-invalid, aria-activedescendant), the popup is a role="listbox" of
 *   role="option" rows. DOM focus never leaves the trigger: the highlighted row is
 *   announced through aria-activedescendant, so opening, closing, Esc and Tab need no focus
 *   juggling. A visually hidden native <select> mirrors the value, so `name`, `required`, form
 *   reset, autofill and constraint validation work like a native one (an invalid required
 *   dropdown focuses its trigger). Why not Radix Select: it always locks page scroll and
 *   makes the page inert, with no switch to turn that off (radix-ui/primitives issue 1159).
 * Scrolling: the popup NEVER locks the page. A wheel or touch scroll over the page scrolls
 *   the page; the popup stays attached to its trigger while it moves, flips above it when
 *   there is no room below, and closes when the trigger leaves the viewport entirely. Over
 *   the list, the wheel scrolls the list and stops at its ends (overscroll contain) instead
 *   of dragging the page along. Only a modal dialog locks scroll, not a picker.
 * States: rest, hover (border darkens), focus-visible ring, open (chevron flips, primary
 *   border), highlighted option (a highlight slides between options), selected (check),
 *   disabled (trigger and single options), read only (a filled, bordered field with the value
 *   in full contrast and a muted lock mark: no chevron, no hover, no open, still focusable and
 *   selectable; clearly not the faded disabled look), loading (a disabled spinner option plus a
 *   polite live region), empty (a disabled option with the empty text), error (red border, mark,
 *   message). There is no press scale on the trigger: the popup opening is the feedback, and a
 *   squeeze at the same moment read as a glitch (measured: it only showed on some opens).
 * Keyboard (APG): Enter, Space, ArrowDown or ArrowUp on the trigger open on the selected
 *   option; Home/End open on the first/last; ArrowUp/ArrowDown/Home/End/PageUp/PageDown move
 *   (no wrap, like a native select); typing letters jumps to the matching option, also on the
 *   closed trigger, where it changes the value without opening; Enter or Space picks; Esc closes
 *   without changing; Tab picks the highlighted option, closes and moves on; a click anywhere
 *   outside closes (and still reaches what it hit, since the page is not inert).
 * Motion: opacity, transform (scale from 0.94, 6 px away from the trigger) only; the highlight
 *   moves with y. Radix Presence delays the unmount until a CSS animation ends, so the enter and
 *   exit are keyframes (injected once through a hoisted <style>).
 *   Reduced motion: fade only, no travel, highlight jumps.
 * Copy props: label, placeholder, helperText, error, loadingLabel, emptyLabel,
 *   options[].label. Nothing else is visible text.
 */
"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import * as m from "motion/react-m";
import { cn } from "../lib/cn";
import { useMotionTier } from "../motion";

export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface DropdownProps {
  /** Always visible label. Never a placeholder. */
  label: string;
  options: readonly DropdownOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Shown in the trigger while nothing is chosen. */
  placeholder?: string;
  /** Posts the value with a form (a hidden native select carries it). */
  name?: string;
  disabled?: boolean;
  /** Shows the value in a filled, bordered, non interactive field. Still focusable and copyable. */
  readOnly?: boolean;
  /** Marks the control required for assistive tech and for form validation inside a <form>. */
  required?: boolean;
  helperText?: string;
  /** Error message. Turns the border red and adds a mark. */
  error?: string;
  loading?: boolean;
  /** Text of the spinner row while `loading`. */
  loadingLabel?: string;
  /** Text shown when there are no options. */
  emptyLabel?: string;
  className?: string;
}

function useValue(controlled: string | undefined, initial: string | undefined, onChange?: (v: string) => void) {
  const [inner, setInner] = useState<string | undefined>(initial);
  const value = controlled !== undefined ? controlled : inner;
  const set = useCallback(
    (v: string) => {
      if (controlled === undefined) setInner(v);
      onChange?.(v);
    },
    [controlled, onChange],
  );
  return [value, set] as const;
}

/* Enter and exit of the popup. Radix Presence waits for these animations before it unmounts. */
const KEYFRAMES = `
@keyframes kit-dd-in-down{from{opacity:0;transform:translateY(-6px) scale(.94)}to{opacity:1;transform:none}}
@keyframes kit-dd-in-up{from{opacity:0;transform:translateY(6px) scale(.94)}to{opacity:1;transform:none}}
@keyframes kit-dd-out-down{from{opacity:1;transform:none}to{opacity:0;transform:translateY(-4px) scale(.94)}}
@keyframes kit-dd-out-up{from{opacity:1;transform:none}to{opacity:0;transform:translateY(4px) scale(.94)}}
@keyframes kit-dd-fade-in{from{opacity:0}to{opacity:1}}
@keyframes kit-dd-fade-out{from{opacity:1}to{opacity:0}}
.kit-dd[data-state=open][data-side=bottom]{animation:kit-dd-in-down var(--kit-dd-in) var(--ease-decelerate) both}
.kit-dd[data-state=open][data-side=top]{animation:kit-dd-in-up var(--kit-dd-in) var(--ease-decelerate) both}
.kit-dd[data-state=closed][data-side=bottom]{animation:kit-dd-out-down var(--kit-dd-out) var(--ease-accelerate) both}
.kit-dd[data-state=closed][data-side=top]{animation:kit-dd-out-up var(--kit-dd-out) var(--ease-accelerate) both}
@media (prefers-reduced-motion:reduce){
.kit-dd[data-state=open][data-side]{animation-name:kit-dd-fade-in}
.kit-dd[data-state=closed][data-side]{animation-name:kit-dd-fade-out}
}
`;

function Chevron({ open, reduced }: { open: boolean; reduced: boolean }) {
  return (
    <m.span
      aria-hidden="true"
      className="flex shrink-0 text-(--color-on-surface-variant)"
      animate={{ rotate: open ? 180 : 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }}
    >
      <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 7.5l5 5 5-5" />
      </svg>
    </m.span>
  );
}

function CheckMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 10.5l3.5 3.5 7.5-8" />
    </svg>
  );
}

function LockMark() {
  return (
    <svg aria-hidden="true" data-readonly-mark="" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-(--color-on-surface-muted)">
      <rect x="4.5" y="9" width="11" height="7.5" rx="1.8" />
      <path d="M7 9V6.8a3 3 0 0 1 6 0V9" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" className="animate-spin text-(--color-primary) motion-reduce:animate-pulse" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M10 3a7 7 0 1 0 7 7" />
    </svg>
  );
}

const STATUS_VALUE = "__kit-status__";
const itemClass =
  "relative z-10 flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-(--radius-md) px-3 text-sm text-(--color-on-surface) aria-disabled:cursor-not-allowed aria-disabled:opacity-(--state-disabled-content) aria-selected:font-semibold";

/** Type-ahead buffer lifetime, ms. */
const TYPEAHEAD_MS = 500;

/** Index of the next enabled option whose label starts with `buffer`, searching from `from`. -1 when none. */
function matchOption(options: readonly DropdownOption[], buffer: string, from: number): number {
  const q = buffer.toLowerCase();
  const repeated = q.length > 1 && [...q].every((c) => c === q[0]);
  const needle = repeated ? (q[0] ?? q) : q;
  // One letter (or the same letter again) cycles on from the current option; a longer prefix may keep it.
  const start = needle.length === 1 ? from + 1 : Math.max(from, 0);
  for (let i = 0; i < options.length; i++) {
    const idx = (start + i) % options.length;
    const o = options[idx];
    if (o && !o.disabled && o.label.toLowerCase().startsWith(needle)) return idx;
  }
  return -1;
}

export function Dropdown({
  label,
  options,
  value: controlled,
  defaultValue,
  onValueChange,
  placeholder,
  name,
  disabled = false,
  readOnly = false,
  required = false,
  helperText,
  error,
  loading = false,
  loadingLabel,
  emptyLabel,
  className,
}: DropdownProps) {
  const uid = useId();
  const labelId = `${uid}-label`;
  const valueId = `${uid}-value`;
  const hintId = `${uid}-hint`;
  const listId = `${uid}-list`;
  const optionId = (i: number) => `${uid}-o${i}`;
  const t = useMotionTier("direct");

  const [value, setValue] = useValue(controlled, defaultValue, onValueChange);
  const [open, setOpen] = useState(false);
  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const nativeRef = useRef<HTMLSelectElement | null>(null);
  const optionEls = useRef(new Map<number, HTMLElement>());

  const showStatus = loading || options.length === 0;
  const firstEnabled = () => options.findIndex((o) => !o.disabled);
  const lastEnabled = () => {
    for (let i = options.length - 1; i >= 0; i--) if (!options[i]?.disabled) return i;
    return -1;
  };
  const stepEnabled = (from: number, dir: 1 | -1, count = 1) => {
    let i = from;
    let moved = 0;
    for (let n = from + dir; n >= 0 && n < options.length && moved < count; n += dir) {
      if (!options[n]?.disabled) {
        i = n;
        moved += 1;
      }
    }
    return i;
  };

  /** Highlighted option (aria-activedescendant). -1 means none. */
  const [active, setActive] = useState(-1);
  const byKeyboard = useRef(false);
  const activate = (i: number, keyboard: boolean) => {
    byKeyboard.current = keyboard;
    setActive(i);
  };

  // Highlight that slides between options (it lives inside the scrolling list).
  const [hl, setHl] = useState<{ top: number; height: number; visible: boolean; slide: boolean } | null>(null);

  const openList = (at?: number) => {
    if (disabled || readOnly) return;
    if (showStatus) {
      setOpen(true);
      return;
    }
    const start = at ?? (selected && !selected.disabled ? selectedIndex : firstEnabled());
    activate(start, true);
    setOpen(true);
  };
  const closeList = () => {
    setOpen(false);
    setHl(null);
    setActive(-1);
  };
  const commit = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    setValue(o.value);
    closeList();
  };

  // Keep the highlight box and the scroll position in step with the active option.
  useLayoutEffect(() => {
    const list = listRef.current;
    const el = optionEls.current.get(active);
    if (!open || !list || !el || active < 0) return;
    if (byKeyboard.current) {
      const pad = 6;
      if (el.offsetTop - pad < list.scrollTop) list.scrollTop = el.offsetTop - pad;
      else if (el.offsetTop + el.offsetHeight + pad > list.scrollTop + list.clientHeight) list.scrollTop = el.offsetTop + el.offsetHeight + pad - list.clientHeight;
    }
    setHl((p) => ({ top: el.offsetTop, height: el.offsetHeight, visible: true, slide: p !== null && p.visible }));
  }, [open, active]);

  // A popup that is not modal must not outlive its trigger: close when the trigger leaves the viewport.
  useEffect(() => {
    const trigger = triggerRef.current;
    if (!open || !trigger || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => !e.isIntersecting)) closeList();
    });
    io.observe(trigger);
    return () => io.disconnect();
  }, [open]);

  // Form reset puts the initial value back (the hidden native select is what the form sees).
  useEffect(() => {
    const form = nativeRef.current?.form;
    if (!form) return;
    const onReset = () => window.setTimeout(() => setValue(defaultValue ?? ""), 0);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [defaultValue, setValue]);

  // Type-ahead.
  const typed = useRef({ text: "", timer: 0 });
  const typeAhead = (ch: string) => {
    const ty = typed.current;
    window.clearTimeout(ty.timer);
    ty.text += ch;
    ty.timer = window.setTimeout(() => {
      ty.text = "";
    }, TYPEAHEAD_MS);
    const from = open ? active : selectedIndex;
    const hit = matchOption(options, ty.text, from);
    if (hit < 0) return;
    if (open) activate(hit, true);
    else setValue(options[hit]?.value ?? "");
  };
  useEffect(() => () => window.clearTimeout(typed.current.timer), []);

  const onTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.ctrlKey || e.metaKey) return;
    const k = e.key;
    const typing = typed.current.text !== "" && k === " ";
    if (k.length === 1 && !e.altKey && (k !== " " || typing)) {
      if (showStatus) return;
      e.preventDefault();
      typeAhead(k);
      return;
    }
    if (!open) {
      if (k === "Enter" || k === " " || k === "ArrowDown" || k === "ArrowUp") {
        e.preventDefault();
        openList();
      } else if (k === "Home" || k === "End") {
        e.preventDefault();
        openList(k === "Home" ? firstEnabled() : lastEnabled());
      }
      return;
    }
    switch (k) {
      case "ArrowDown":
        e.preventDefault();
        if (e.altKey) break;
        activate(stepEnabled(active, 1), true);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (e.altKey) commit(active);
        else activate(stepEnabled(active, -1), true);
        break;
      case "PageDown":
        e.preventDefault();
        activate(stepEnabled(active, 1, 10), true);
        break;
      case "PageUp":
        e.preventDefault();
        activate(stepEnabled(active, -1, 10), true);
        break;
      case "Home":
        e.preventDefault();
        activate(firstEnabled(), true);
        break;
      case "End":
        e.preventDefault();
        activate(lastEnabled(), true);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (active >= 0) commit(active);
        else closeList();
        break;
      case "Escape":
        e.preventDefault();
        closeList();
        break;
      case "Tab":
        // A select commits what is highlighted, closes, and lets focus move on by itself.
        if (active >= 0) commit(active);
        else closeList();
        break;
    }
  };

  const hasError = Boolean(error);
  const describedBy = hasError || helperText ? hintId : undefined;
  const shownLabel = selected?.label ?? placeholder ?? "";
  const statusText = open ? (loading ? loadingLabel : options.length === 0 ? emptyLabel : undefined) : undefined;

  let body;
  if (readOnly) {
    body = (
      <div
        data-readonly-field=""
        className="flex min-h-10 w-full items-center gap-2 rounded-(--radius-control) border border-(--color-border-strong) bg-(--color-surface-container) px-3 text-sm text-(--color-on-surface) forced-colors:border-dashed forced-colors:border-[CanvasText]"
      >
        <input
          id={valueId}
          readOnly
          value={shownLabel}
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          className="kit-focus min-h-10 min-w-0 flex-1 cursor-default truncate bg-transparent text-(--color-on-surface) outline-offset-4 select-text"
        />
        <LockMark />
        {name !== undefined && <input type="hidden" name={name} value={value ?? ""} />}
      </div>
    );
  } else {
    body = (
      <Popover.Root open={open} onOpenChange={(next) => (next ? undefined : closeList())} modal={false}>
        <div className="relative">
          <Popover.Anchor asChild>
            <button
              ref={triggerRef}
              type="button"
              role="combobox"
              id={valueId}
              aria-labelledby={labelId}
              aria-describedby={describedBy}
              aria-controls={listId}
              aria-expanded={open}
              aria-required={required || undefined}
              aria-invalid={hasError || undefined}
              aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
              disabled={disabled}
              data-placeholder={selected ? undefined : ""}
              onClick={(e) => {
                // Enter and Space are handled on keydown; their synthetic click has no detail.
                if (e.detail === 0) return;
                if (open) closeList();
                else openList();
              }}
              onKeyDown={onTriggerKeyDown}
              onBlur={(e) => {
                if (open && !listRef.current?.contains(e.relatedTarget as Node | null)) closeList();
              }}
              className={cn(
                "kit-focus flex min-h-10 w-full items-center justify-between gap-2 rounded-(--radius-control) border bg-(--color-surface) px-3 text-left text-sm",
                "transition-[border-color] duration-75 ease-out hover:border-(--color-on-surface-variant) disabled:cursor-not-allowed disabled:opacity-(--state-disabled-content)",
                "text-(--color-on-surface) data-[placeholder]:text-(--color-on-surface-muted)",
                hasError ? "border-(--color-error)" : "border-(--color-outline)",
                open && "border-(--color-primary)",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{selected?.label ?? placeholder}</span>
              <Chevron open={open} reduced={t.reduced} />
            </button>
          </Popover.Anchor>

          {/* Mirror for forms: name, required, reset, autofill and validation behave like a native select. */}
          <select
            ref={nativeRef}
            aria-hidden="true"
            tabIndex={-1}
            name={name}
            required={required}
            disabled={disabled}
            value={value ?? ""}
            onChange={(e) => setValue(e.target.value)}
            onInvalid={(e) => {
              e.preventDefault();
              triggerRef.current?.focus();
            }}
            className="sr-only"
          >
            <option value="" />
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <Popover.Portal>
          <Popover.Content
            ref={listRef}
            role="listbox"
            id={listId}
            aria-labelledby={labelId}
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={8}
            hideWhenDetached
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={(e) => {
              // The trigger toggles by itself; anything else outside just closes.
              if (triggerRef.current?.contains(e.target as Node)) e.preventDefault();
            }}
            onMouseDown={(e) => e.preventDefault()}
            style={{
              ["--kit-dd-in" as string]: `${Math.round(t.tier.visualDuration * 1000)}ms`,
              ["--kit-dd-out" as string]: `${Math.round(t.tier.exit * 1000)}ms`,
            }}
            className="kit-dd kit-scroll relative z-50 max-h-[min(calc(6.5*40px+12px),var(--radix-popover-content-available-height))] min-w-(--radix-popover-trigger-width) origin-(--radix-popover-content-transform-origin) overflow-y-auto overscroll-contain rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-surface) p-1.5 shadow-(--elevation-3) outline-none"
          >
            {hl && (
              <m.span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-1.5 top-0 rounded-(--radius-md) bg-(--color-surface-container)"
                initial={false}
                animate={{ y: hl.top, height: hl.height, opacity: hl.visible ? 1 : 0 }}
                transition={hl.slide && !t.reduced ? t.spring : { y: { duration: 0 }, height: { duration: 0 }, opacity: { duration: 0.12 } }}
              />
            )}
            {showStatus ? (
              <div role="option" aria-disabled="true" aria-selected="false" id={optionId(0)} data-option-value={STATUS_VALUE} className={cn(itemClass, "justify-start")}>
                {loading && <Spinner />}
                <span>{loading ? loadingLabel : emptyLabel}</span>
              </div>
            ) : (
              options.map((o, i) => (
                <div
                  key={o.value}
                  role="option"
                  id={optionId(i)}
                  ref={(el) => {
                    if (el) optionEls.current.set(i, el);
                    else optionEls.current.delete(i);
                  }}
                  aria-selected={i === selectedIndex}
                  aria-disabled={o.disabled || undefined}
                  data-option-value={o.value}
                  data-active={i === active || undefined}
                  onPointerMove={() => {
                    if (!o.disabled && i !== active) activate(i, false);
                  }}
                  onClick={() => commit(i)}
                  className={itemClass}
                >
                  <span>{o.label}</span>
                  {i === selectedIndex && (
                    <span className="flex shrink-0 text-(--color-primary)">
                      <CheckMark />
                    </span>
                  )}
                </div>
              ))
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  }

  return (
    <div className={cn("flex w-full flex-col gap-1.5", className)}>
      <style href="kit-dropdown-keyframes" precedence="medium">
        {KEYFRAMES}
      </style>
      <span id={labelId} className="text-sm font-medium text-(--color-on-surface)">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-(--color-error)">
            *
          </span>
        )}
      </span>
      {body}
      <span role="status" className="sr-only">
        {statusText}
      </span>
      {(hasError || helperText) && (
        <p id={hintId} className={cn("flex items-center gap-1.5 text-sm", hasError ? "text-(--color-error)" : "text-(--color-on-surface-muted)")}>
          {hasError && (
            <span aria-hidden="true" className="inline-flex size-4 shrink-0 items-center justify-center rounded-(--radius-sm) bg-(--color-error) text-xs font-bold leading-none text-(--color-on-error)">
              !
            </span>
          )}
          {hasError ? error : helperText}
        </p>
      )}
    </div>
  );
}
