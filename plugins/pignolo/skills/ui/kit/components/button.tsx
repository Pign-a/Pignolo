/**
 * Button. Variants: primary, secondary, tertiary (ghost), danger, danger-ghost.
 * Sizes sm 32 / md 40 / lg 48 px. Optional leading and trailing icon, loading, icon-only.
 *
 * Use: one primary per area; secondary pairs with it; tertiary for the rest;
 * danger only for the destructive step (danger-ghost when it is one of several choices).
 * Tier: D (direct, bounce 0). No Motion on the button: hover changes color only (no lift), and
 * press is CSS (pressClass: scale 0.97 in 70 ms, ease back in 200 ms), not whileTap, so the
 * button is safe as an asChild trigger of Radix menus and popovers (Enter would fire a
 * synthetic pointerdown through whileTap and toggle them twice).
 * Touch: on `pointer: coarse` the hit area grows to 44 px (coarseTarget).
 * Radix: none (native button).
 * States: rest, hover (one step darker), focus-visible (kit-focus ring), active/press,
 * disabled, loading (spinner replaces the leading icon or sits before the label, label stays,
 * width is held, aria-busy + aria-disabled keep focus on the button).
 * Keyboard: Enter and Space, as a native button.
 * Copy: all text comes from props (`children`, `aria-label`, `loadingLabel`).
 * Icon-only needs `aria-label` (enforced by the type).
 */
"use client";

import { useLayoutEffect, useRef, type ButtonHTMLAttributes, type ReactNode, type Ref } from "react";
import { coarseTarget, pressClass } from "../motion";
import { cn } from "../lib/cn";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger" | "danger-ghost";
export type ButtonSize = "sm" | "md" | "lg";

type Native = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;

interface BaseProps extends Native {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  loading?: boolean;
  /** Screen reader text announced while loading, in the app's language. */
  loadingLabel?: string;
  ref?: Ref<HTMLButtonElement>;
}

export type ButtonProps = BaseProps &
  (
    | { iconOnly?: false; children: ReactNode }
    | { iconOnly: true; "aria-label": string; children: ReactNode }
  );

const variantClass: Record<ButtonVariant, string> = {
  primary:
    "bg-(--color-primary) text-(--color-on-primary) hover:bg-(--color-primary-hover) active:bg-(--color-primary-pressed)",
  secondary:
    "bg-(--color-surface-container) text-(--color-on-surface) hover:bg-(--color-border-subtle) active:bg-(--color-border-strong)/30",
  tertiary:
    "bg-transparent text-(--color-primary) hover:bg-(--color-primary-container) active:bg-(--color-primary-container)",
  danger:
    "bg-(--color-error) text-(--color-on-error) hover:bg-[color-mix(in_srgb,var(--color-error)_88%,var(--color-on-surface))] active:bg-[color-mix(in_srgb,var(--color-error)_76%,var(--color-on-surface))]",
  "danger-ghost":
    "bg-transparent text-(--color-error) hover:bg-(--color-error-container) active:bg-(--color-error-container)",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-base gap-2",
};
const iconOnlySize: Record<ButtonSize, string> = { sm: "size-8", md: "size-10", lg: "size-12" };

function Spinner() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4 shrink-0 animate-spin motion-reduce:animate-pulse"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="8" cy="8" r="6" opacity="0.25" />
      <path d="M14 8a6 6 0 0 0-6-6" />
    </svg>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  leadingIcon,
  trailingIcon,
  loading = false,
  loadingLabel,
  iconOnly = false,
  disabled,
  className,
  children,
  onClick,
  type = "button",
  style,
  ref,
  ...rest
}: ButtonProps) {
  const inner = useRef<HTMLButtonElement | null>(null);
  const width = useRef<number | undefined>(undefined);

  // Remember the resting width so the button does not jump when the spinner appears.
  useLayoutEffect(() => {
    if (!loading && inner.current) width.current = inner.current.offsetWidth;
  });

  const inert = disabled || loading;

  return (
    <button
      {...rest}
      ref={(node: HTMLButtonElement | null) => {
        inner.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      type={type}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      onClick={loading ? undefined : onClick}
      style={{ ...style, width: loading ? width.current : style?.width }}
      className={cn(
        "kit-focus relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium",
        coarseTarget,
        "rounded-(--radius-control) disabled:pointer-events-none disabled:opacity-(--state-disabled-content)",
        variant === "secondary" && "border border-(--color-border-subtle)",
        variantClass[variant],
        iconOnly ? iconOnlySize[size] : sizeClass[size],
        !inert && pressClass,
        loading && "cursor-progress",
        className,
      )}
    >
      {loading && iconOnly ? (
        <Spinner />
      ) : (
        <>
          {loading ? <Spinner /> : leadingIcon}
          {children}
          {!loading && trailingIcon}
        </>
      )}
      {loading && loadingLabel ? (
        <span role="status" className="sr-only">
          {loadingLabel}
        </span>
      ) : null}
    </button>
  );
}
