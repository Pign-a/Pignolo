/**
 * Text field with the label inside the box. At rest the label sits in the middle of the field at
 * full size; when the user focuses the field (or it has a value) the label moves to the top left,
 * inside the same box, shrinks to 0.75 and the field grows taller to make room for the text.
 *
 * Use: single-line text, email, password, number, search. Keep the label to 1 to 3 words and put a
 * hint in `helperText`. The label is a real <label htmlFor>, never a placeholder: it stays visible
 * once the field is filled. The placeholder is only an example value and appears once the label has
 * moved up.
 * Tier: D (direct: visualDuration 0.22, bounce 0). The label moves (translate, scale 0.75) and the box
 * grows (height 52 to 60 px, a documented exception in CHECKLIST.md) on the same direct spring, so
 * they travel together. The slot is reserved at the grown height (60 px), so the growth never moves the
 * helper text or the fields below. On focus a 2 px ring (--focus-width, --color-focus-ring) blooms in
 * from scale 0.97 with the enter transition and leaves in 100 ms. The message row is always one
 * line tall, so showing an error never shifts the layout.
 * Radix: none (native input; the label is a real <label htmlFor>).
 * States: rest, hover (border darkens), focus (label up, animated ring), filled, error (red border,
 * mark and message, aria-invalid + aria-describedby), disabled, read-only, helper text.
 * Message: the helper or error sits in a persistent aria-live="polite" region that is always in the DOM
 * (a live region inserted together with its text is often not announced), 20 px tall reserved, linked
 * with aria-describedby; the error also has a mark, so color is never the only signal.
 * Keyboard: native. The ring shows on any focus, since text inputs always need one.
 * Touch: the box is at least 52 px tall, above the 44 px recommended target.
 * Forced colors: the border becomes CanvasText and the ring Highlight.
 * Reduced motion: the label and the height snap, the ring only fades.
 * Copy: `label`, `placeholder`, `helperText`, `error` are props; the error mark is an SVG.
 *
 * Inspiration (what was actually read; items not reached are marked):
 *  - Material Design filled text field with floating label: the label rests inside the container and
 *    moves to the top when focused or populated, staying visible, per the Material Web docs
 *    (github.com/material-components/material-web, docs/components/text-field.md).
 *  - NN/g "Placeholders in Form Fields Are Harmful" (nngroup.com/articles/form-design-placeholders):
 *    placeholders vanish, fail contrast and hide the label while you check or fix an entry; floating
 *    labels are the accepted compromise when space is tight, so the label stays visible once filled.
 *  - Stripe Elements appearance API (docs.stripe.com/elements/appearance-api, floating labels) and its
 *    iOS note: an overlaid label needs pointer-events none so a tap reaches the input (done here).
 *  - Not reachable in this run, so they only informed the proportions and not the text: Apple HIG text
 *    fields, Linear, Vercel Geist and Mercury forms.
 */
"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent, type ComponentPropsWithoutRef, type FocusEvent, type ReactNode, type Ref } from "react";
import * as m from "motion/react-m";
import { AnimatePresence } from "motion/react";
import { springFor, useMotionTier } from "../motion";
import { cn } from "../lib/cn";

type InputProps = Omit<ComponentPropsWithoutRef<"input">, "size" | "children" | "className">;

export interface TextFieldProps extends InputProps {
  label: string;
  helperText?: ReactNode;
  /** Error message. Presence turns the field invalid. */
  error?: ReactNode;
  /** Optional element at the right inside the box, for example a show/hide button. */
  trailing?: ReactNode;
  className?: string;
  ref?: Ref<HTMLInputElement>;
}

/** Box height at rest (label centered) and when the label is up (label on top, text below). */
const REST_H = 52;
const UP_H = 60;
/** Label position (px from the top of the box, text line 24 px tall) and size when it is up. */
const LABEL_LINE = 24;
const LABEL_UP_Y = 6;
const LABEL_REST_Y = 13;
const LABEL_UP_SCALE = 0.75;

export function TextField({
  label,
  helperText,
  error,
  trailing,
  className,
  id,
  value,
  defaultValue,
  placeholder,
  disabled,
  readOnly,
  onFocus,
  onBlur,
  onChange,
  ref,
  ...rest
}: TextFieldProps) {
  const t = useMotionTier("direct");
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-message`;
  const inner = useRef<HTMLInputElement | null>(null);
  const [focused, setFocused] = useState(false);
  const [typed, setTyped] = useState(() => String(defaultValue ?? "") !== "");

  // Autofill and programmatic values do not fire onChange: read the DOM once after mount.
  useEffect(() => {
    if (inner.current && inner.current.value !== "") setTyped(true);
  }, []);

  const filled = value !== undefined ? String(value) !== "" : typed;
  const up = focused || filled;
  const invalid = error !== undefined && error !== null && error !== false && error !== "";
  const message = invalid ? error : helperText;
  const spring = springFor("direct");

  const handleFocus = (e: FocusEvent<HTMLInputElement>) => {
    setFocused(true);
    onFocus?.(e);
  };
  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    setFocused(false);
    onBlur?.(e);
  };
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setTyped(e.target.value !== "");
    onChange?.(e);
  };

  return (
    <div className={cn("w-full", className)}>
      {/* Reserved slot: as tall as the grown box, so growing never moves what is below. */}
      <div className="relative" style={{ height: UP_H }}>
        <m.div
          data-field-box=""
          className={cn(
            "absolute inset-x-0 top-0 rounded-(--radius-control) border bg-(--color-surface)",
            invalid
              ? "border-(--color-error)"
              : "border-(--color-border-strong) hover:border-(--color-on-surface-variant)",
            readOnly && "bg-(--color-surface-container)",
            disabled && "opacity-(--state-disabled-content)",
            "forced-colors:[forced-color-adjust:none] forced-colors:border-[CanvasText] forced-colors:bg-[Canvas]",
          )}
          initial={false}
          animate={{ height: up ? UP_H : REST_H }}
          transition={t.reduced ? { duration: 0 } : spring}
        >
          <input
            {...rest}
            ref={(node) => {
              inner.current = node;
              if (typeof ref === "function") ref(node);
              else if (ref) ref.current = node;
            }}
            id={inputId}
            value={value}
            defaultValue={defaultValue}
            disabled={disabled}
            readOnly={readOnly}
            placeholder={placeholder}
            aria-invalid={invalid || undefined}
            aria-describedby={message ? messageId : rest["aria-describedby"]}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onChange={handleChange}
            className={cn(
              // Fills the box. The text row is the bottom 24 px of the grown box: 26 px above, 8 px below.
              "absolute inset-0 block w-full appearance-none bg-transparent px-4 pb-2 pt-[26px] text-base leading-6 text-(--color-on-surface) outline-none",
              up ? "placeholder:text-(--color-on-surface-muted)" : "placeholder:text-transparent",
              disabled && "cursor-not-allowed",
              trailing ? "pr-14" : false,
            )}
          />
          <m.label
            htmlFor={inputId}
            className={cn(
              "pointer-events-none absolute left-4 top-0 block origin-top-left whitespace-nowrap text-base leading-6",
              invalid
                ? "text-(--color-error)"
                : focused
                  ? "text-(--color-primary)"
                  : "text-(--color-on-surface-muted)",
              "forced-colors:text-[CanvasText]",
            )}
            style={{ height: LABEL_LINE, transformOrigin: "0% 0%" }}
            initial={false}
            animate={{ y: up ? LABEL_UP_Y : LABEL_REST_Y, scale: up ? LABEL_UP_SCALE : 1 }}
            transition={t.reduced ? { duration: 0 } : spring}
          >
            {label}
          </m.label>
          {trailing ? (
            <m.div
              className="absolute inset-y-0 right-2 flex items-center"
              initial={false}
              animate={{ y: up ? 8 : 0 }}
              transition={t.reduced ? { duration: 0 } : spring}
            >
              {trailing}
            </m.div>
          ) : null}
          <m.span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute -inset-px rounded-(--radius-control) border-solid forced-colors:border-[Highlight]",
              invalid ? "border-(--color-error)" : "border-(--color-focus-ring)",
            )}
            style={{ borderWidth: "var(--focus-width)" }}
            initial={false}
            animate={{ opacity: focused ? 1 : 0, scale: focused || t.reduced ? 1 : 0.97 }}
            transition={focused ? t.enter : t.exit}
          />
        </m.div>
      </div>
      <div id={messageId} aria-live="polite" className="mt-1.5 min-h-5 px-1 text-xs leading-5">
        <AnimatePresence mode="wait" initial={false}>
          {message ? (
            <m.p
              key={invalid ? "error" : "helper"}
              className={cn(
                "flex items-start gap-1.5",
                invalid ? "text-(--color-error)" : "text-(--color-on-surface-variant)",
              )}
              initial={{ opacity: 0, y: t.distance(-4) }}
              animate={{ opacity: 1, y: 0, transition: t.enter }}
              exit={{ opacity: 0, transition: t.exit }}
            >
              {invalid ? (
                <svg aria-hidden="true" viewBox="0 0 16 16" className="mt-[3px] size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <circle cx="8" cy="8" r="6.2" />
                  <path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" />
                </svg>
              ) : null}
              <span>{message}</span>
            </m.p>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
