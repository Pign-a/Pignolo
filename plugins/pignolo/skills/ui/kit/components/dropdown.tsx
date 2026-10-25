/**
 * Dropdown: a value picker that replaces the native <select>.
 * Use when: the user picks one value from 6 or more options (2 options: radios, 3 to 5:
 * segmented control). A menu of actions is a different control.
 * Tier: direct (about 0.2 s, no spring overshoot, no per item stagger; exit 0.1 s). It is a
 *   CSS keyframe animation driven by the tier numbers, see Motion below for why.
 * Primitive: @radix-ui/react-select with position="popper". This is the WAI-ARIA APG
 *   select-only combobox: the trigger is a button with role="combobox" (aria-expanded,
 *   aria-controls, aria-required, aria-invalid are all valid on it), the popup is a
 *   role="listbox" of role="option" items. Radix renders a hidden native <select> inside a
 *   <form>, so `name`, `required`, form reset, autofill and constraint validation work with no
 *   extra input. Outside a form no native element is rendered.
 * States: rest, hover (border darkens), focus-visible ring, press (CSS scale 0.97 in 75 ms),
 *   open (chevron flips), highlighted option (a highlight slides between options), selected
 *   (check), disabled (trigger and single options), read only (a read-only text input named by
 *   the label, no chevron), loading (a disabled spinner option plus a polite live region), empty
 *   (a disabled option with the empty text), error (red border, mark, message).
 * Keyboard (APG): Enter, Space, ArrowDown or ArrowUp on the trigger opens with focus on the
 *   selected option; ArrowUp/ArrowDown/Home/End move (no wrap, like a native select); typing
 *   letters jumps to the matching option, also on the closed trigger; Enter or Space picks;
 *   Esc closes and returns focus to the trigger; Tab picks the focused option, closes and moves
 *   on. The listbox is modal like a native select: while it is open the page behind ignores the
 *   pointer, so an outside click only closes it.
 * Motion: opacity, transform (scale from 0.94, 6 px away from the trigger) only; the highlight
 *   moves with y. Radix Select must keep its items mounted while closed (they feed the native
 *   <select> and the typeahead on the closed trigger), so the popup cannot be force mounted
 *   under AnimatePresence. Radix Presence delays the unmount until a CSS animation ends, so the
 *   enter and exit are keyframes (injected once through a hoisted <style>).
 *   Reduced motion: fade only, no travel, highlight jumps.
 * Copy props: label, placeholder, helperText, error, loadingLabel, emptyLabel,
 *   options[].label. Nothing else is visible text.
 */
"use client";

import { useCallback, useId, useRef, useState } from "react";
import * as Select from "@radix-ui/react-select";
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
  /** Posts the value with a form (Radix renders a native select inside a <form>). */
  name?: string;
  disabled?: boolean;
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

const TABBABLE = "a[href], button, input, select, textarea, [tabindex]";

/** The next (or previous) tabbable element after `from`, in document order. */
function adjacentTabbable(from: HTMLElement, dir: 1 | -1): HTMLElement | undefined {
  const all = Array.from(document.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (el) =>
      el === from ||
      (el.tabIndex >= 0 &&
        !el.hasAttribute("disabled") &&
        !el.hasAttribute("data-radix-focus-guard") &&
        el.getClientRects().length > 0 &&
        !el.closest("[role='listbox']")),
  );
  return all[all.indexOf(from) + dir];
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

function Spinner() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" className="animate-spin text-(--color-primary) motion-reduce:animate-pulse" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M10 3a7 7 0 1 0 7 7" />
    </svg>
  );
}

const STATUS_VALUE = "__kit-status__";
const itemClass =
  "relative z-10 flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-(--radius-md) px-3 text-sm text-(--color-on-surface) outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-(--state-disabled-content) data-[state=checked]:font-semibold";

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
  const t = useMotionTier("direct");

  const [value, setValue] = useValue(controlled, defaultValue, onValueChange);
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const tabDir = useRef<1 | -1 | 0>(0);

  // Highlight that slides between options (it lives inside the scrolling viewport).
  const [hl, setHl] = useState<{ top: number; height: number; visible: boolean; slide: boolean } | null>(null);
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setHl(null);
  };
  const onContentFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    const item = (e.target as HTMLElement).closest<HTMLElement>('[role="option"]');
    if (!item || item.hasAttribute("data-disabled")) {
      setHl((p) => (p ? { ...p, visible: false } : p));
      return;
    }
    setHl((p) => ({ top: item.offsetTop, height: item.offsetHeight, visible: true, slide: p !== null && p.visible }));
  };

  const hasError = Boolean(error);
  const describedBy = hasError || helperText ? hintId : undefined;
  const shownLabel = selected?.label ?? placeholder ?? "";
  const statusText = open ? (loading ? loadingLabel : options.length === 0 ? emptyLabel : undefined) : undefined;

  let body;
  if (readOnly) {
    body = (
      <>
        <input
          id={valueId}
          readOnly
          value={shownLabel}
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          className="kit-focus min-h-10 w-full rounded-(--radius-control) bg-transparent text-sm text-(--color-on-surface) outline-offset-4"
        />
        {name !== undefined && <input type="hidden" name={name} value={value ?? ""} />}
      </>
    );
  } else {
    const showStatus = loading || options.length === 0;
    body = (
      <Select.Root
        value={value ?? ""}
        onValueChange={setValue}
        open={open}
        onOpenChange={handleOpenChange}
        name={name}
        disabled={disabled}
        required={required}
      >
        <Select.Trigger
          ref={triggerRef}
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          aria-invalid={hasError || undefined}
          className={cn(
            "kit-focus flex min-h-10 w-full items-center justify-between gap-2 rounded-(--radius-control) border bg-(--color-surface) px-3 text-left text-sm",
            "transition-[scale,border-color] duration-75 ease-out hover:border-(--color-on-surface-variant) active:scale-[0.97] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-(--state-disabled-content) disabled:active:scale-100",
            "text-(--color-on-surface) data-[placeholder]:text-(--color-on-surface-muted)",
            hasError ? "border-(--color-error)" : "border-(--color-outline)",
            open && "border-(--color-primary)",
          )}
        >
          <Select.Value placeholder={placeholder} className="min-w-0 flex-1 truncate">
            {selected?.label}
          </Select.Value>
          <Select.Icon className="flex">
            <Chevron open={open} reduced={t.reduced} />
          </Select.Icon>
        </Select.Trigger>

        <Select.Portal>
          <Select.Content
            position="popper"
            align="start"
            sideOffset={6}
            collisionPadding={8}
            onFocus={onContentFocus}
            onKeyDown={(e) => {
              // Radix traps Tab inside the list. A select commits the focused option, closes and moves on.
              if (e.key !== "Tab") return;
              e.preventDefault();
              tabDir.current = e.shiftKey ? -1 : 1;
              const focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[role="option"]');
              const v = focused?.getAttribute("data-option-value");
              if (focused && v !== null && v !== undefined && !focused.hasAttribute("data-disabled") && v !== STATUS_VALUE) setValue(v);
              handleOpenChange(false);
            }}
            onCloseAutoFocus={(e) => {
              const dir = tabDir.current;
              tabDir.current = 0;
              const trigger = triggerRef.current;
              if (dir !== 0 && trigger) {
                e.preventDefault();
                (adjacentTabbable(trigger, dir) ?? trigger).focus();
              }
            }}
            style={{
              ["--kit-dd-in" as string]: `${Math.round(t.tier.visualDuration * 1000)}ms`,
              ["--kit-dd-out" as string]: `${Math.round(t.tier.exit * 1000)}ms`,
            }}
            className="kit-dd z-50 max-h-[min(calc(6.5*40px+12px),var(--radix-select-content-available-height))] min-w-(--radix-select-trigger-width) origin-(--radix-select-content-transform-origin) overflow-hidden rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-surface) shadow-(--elevation-3)"
          >
            <Select.Viewport className="p-1.5 overscroll-contain">
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
                <Select.Item value={STATUS_VALUE} disabled className={cn(itemClass, "justify-start")} data-option-value={STATUS_VALUE}>
                  {loading && <Spinner />}
                  <Select.ItemText>{loading ? loadingLabel : emptyLabel}</Select.ItemText>
                </Select.Item>
              ) : (
                options.map((o) => (
                  <Select.Item key={o.value} value={o.value} disabled={o.disabled} data-option-value={o.value} className={itemClass}>
                    <Select.ItemText>{o.label}</Select.ItemText>
                    <Select.ItemIndicator className="flex shrink-0 text-(--color-primary)">
                      <CheckMark />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))
              )}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
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
