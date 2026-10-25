/**
 * Card: one concept (item, plan, project) with a short summary and one next step.
 *
 * Use: 2 to 4 short facts and one next step. To compare or scan many items use a table
 * or list. Two modes, never both on one card:
 *   - interactive: the whole card is the action (`onPress` or `href`); no buttons inside.
 *   - actions: a static card with a footer `primaryAction` (one, rightmost), an optional
 *     `secondaryAction`, and a `destructiveAction` kept apart in the top-right corner
 *     (never beside the primary). With several secondary actions swap that corner
 *     for the kit dropdown.
 * Tier: D (direct, bounce 0), CSS only: no Motion on the card. Hover changes the shadow only (no
 * lift): a soft elevation layer fades in over 200 ms (opacity). Press (interactive mode only)
 * scales to 0.985 in 75 ms: half the 0.97 of a button, because the target is large.
 * Radix: none (native button, anchor or div).
 * States: rest (hairline, flat), hover (soft shadow, in actions mode too; the chevron nudges 2 px),
 * focus-visible (kit-focus), press, disabled (no hover, muted), loading (skeleton of the
 * same size), actions in loading via `primaryAction.loading`.
 * Keyboard: interactive mode is a single Tab stop, Enter or Space activates (link: Enter).
 * Actions mode: Tab visits the destructive and footer buttons in reading order.
 * Reduced motion: no press and no chevron nudge, the shadow still fades.
 * Copy: every visible string is a prop (`title`, `description`, facts, action labels,
 * `loadingLabel`). Depends on ./button for the footer buttons.
 */
"use client";

import type { HTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../lib/cn";
import { Button } from "./button";

export interface CardFact {
  label: ReactNode;
  value: ReactNode;
}

export interface CardAction {
  label: string;
  onPress: () => void;
  loading?: boolean;
  loadingLabel?: string;
}

interface SharedProps {
  title: ReactNode;
  /** Up to two lines; longer text is clipped. */
  description?: ReactNode;
  /** 2 to 4 short facts. */
  facts?: readonly CardFact[];
  /** Extra body content below the facts. */
  children?: ReactNode;
  disabled?: boolean;
  /** Show a skeleton of the same size instead of the content. */
  loading?: boolean;
  /** Screen reader text while loading, in the app's language. */
  loadingLabel?: string;
  /** Heading level of the title in actions mode (interactive cards are a single control). */
  headingLevel?: 2 | 3 | 4;
  className?: string;
  /** Forwarded to the root element, so the card can be an `asChild` trigger of a Radix primitive. */
  ref?: Ref<HTMLElement>;
}

interface WithActions extends SharedProps {
  onPress?: undefined;
  href?: undefined;
  primaryAction?: CardAction;
  secondaryAction?: CardAction;
  /** Kept apart from the primary, top-right. `label` names the icon button. */
  destructiveAction?: CardAction;
}

interface WithPress extends SharedProps {
  onPress: () => void;
  href?: undefined;
  primaryAction?: never;
  secondaryAction?: never;
  destructiveAction?: never;
}

interface WithHref extends SharedProps {
  href: string;
  onPress?: undefined;
  primaryAction?: never;
  secondaryAction?: never;
  destructiveAction?: never;
}

type Passthrough = Omit<
  HTMLAttributes<HTMLElement>,
  keyof SharedProps | "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "style"
>;

export type CardProps = (WithActions | WithPress | WithHref) & Passthrough;

// Press is CSS, not whileTap (see pressClass in motion.ts); half the 0.97 because the target is large.
const pressCard =
  "transition-[scale] duration-200 ease-(--ease-decelerate) active:scale-[0.985] active:duration-75 active:ease-out motion-reduce:active:scale-100";

function Chevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="size-5 shrink-0 text-(--color-on-surface-muted) transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 4l6 6-6 6" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="size-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.5 6h11M8 6V4.5h4V6M6 6l.6 9.5h6.8L14 6" />
    </svg>
  );
}

function Skeleton() {
  return (
    <div aria-hidden="true" className="flex animate-pulse flex-col gap-3 motion-reduce:animate-none">
      <div className="h-4 w-2/5 rounded-(--radius-sm) bg-(--color-border-subtle)" />
      <div className="h-3 w-4/5 rounded-(--radius-sm) bg-(--color-border-subtle)" />
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3">
        <div className="h-8 rounded-(--radius-sm) bg-(--color-border-subtle)" />
        <div className="h-8 rounded-(--radius-sm) bg-(--color-border-subtle)" />
      </div>
    </div>
  );
}

export function Card(props: CardProps) {
  const {
    title,
    description,
    facts,
    children,
    disabled = false,
    loading = false,
    loadingLabel,
    className,
    headingLevel = 3,
    onPress,
    href,
    primaryAction,
    secondaryAction,
    destructiveAction,
    ref,
    onClick,
    ...rest
  } = props;
  const interactive = onPress !== undefined || href !== undefined;
  const live = !disabled && !loading;

  const shell = cn(
    "group relative isolate block w-full rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-surface) p-6 text-left",
    disabled && interactive && "opacity-(--state-disabled-content)",
    interactive && live && "kit-focus cursor-pointer",
    interactive && live && pressCard,
    interactive && !live && "cursor-not-allowed",
    className,
  );

  const dim = disabled && !interactive ? "opacity-(--state-disabled-content)" : "";
  const body = loading ? (
    <>
      <Skeleton />
      {loadingLabel ? (
        <span role="status" className="sr-only">
          {loadingLabel}
        </span>
      ) : null}
    </>
  ) : (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className={cn("min-w-0 flex-1", dim)}>
          <span
            role={interactive ? undefined : "heading"}
            aria-level={interactive ? undefined : headingLevel}
            className="block truncate text-base font-semibold text-(--color-on-surface)"
          >
            {title}
          </span>
          {description ? (
            <span className="mt-1 line-clamp-2 block text-sm leading-5 text-(--color-on-surface-variant)">
              {description}
            </span>
          ) : null}
        </span>
        {interactive ? <Chevron /> : null}
        {destructiveAction ? (
          <Button
            variant="danger-ghost"
            size="sm"
            iconOnly
            aria-label={destructiveAction.label}
            onClick={destructiveAction.onPress}
            loading={destructiveAction.loading}
            loadingLabel={destructiveAction.loadingLabel}
            disabled={disabled}
            className="-mr-2 -mt-1"
          >
            <TrashIcon />
          </Button>
        ) : null}
      </span>
      {facts && facts.length > 0 ? (
        <span className={cn("mt-5 grid grid-cols-2 gap-x-4 gap-y-4", dim)}>
          {facts.map((f, i) => (
            <span key={i} className="block min-w-0">
              <span className="block truncate text-xs text-(--color-on-surface-muted)">{f.label}</span>
              <span className="mt-0.5 block truncate text-base font-semibold tabular-nums text-(--color-on-surface)">
                {f.value}
              </span>
            </span>
          ))}
        </span>
      ) : null}
      {children ? <span className={cn("mt-4 block", dim)}>{children}</span> : null}
      {primaryAction || secondaryAction ? (
        <span className="mt-6 flex items-center justify-end gap-2">
          {secondaryAction ? (
            <Button
              variant="tertiary"
              onClick={secondaryAction.onPress}
              loading={secondaryAction.loading}
              loadingLabel={secondaryAction.loadingLabel}
              disabled={disabled}
            >
              {secondaryAction.label}
            </Button>
          ) : null}
          {primaryAction ? (
            <Button
              onClick={primaryAction.onPress}
              loading={primaryAction.loading}
              loadingLabel={primaryAction.loadingLabel}
              disabled={disabled}
            >
              {primaryAction.label}
            </Button>
          ) : null}
        </span>
      ) : null}
    </>
  );

  const shadow = (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 rounded-(--radius-lg) opacity-0 shadow-(--elevation-2) transition-opacity duration-200",
        live && "group-hover:opacity-100",
      )}
    />
  );

  if (href !== undefined) {
    return (
      <a
        {...rest}
        ref={ref as Ref<HTMLAnchorElement>}
        onClick={onClick}
        href={disabled ? undefined : href}
        aria-disabled={disabled || undefined}
        aria-busy={loading || undefined}
        className={shell}
      >
        {shadow}
        {body}
      </a>
    );
  }
  if (onPress !== undefined) {
    return (
      <button
        {...rest}
        ref={ref as Ref<HTMLButtonElement>}
        type="button"
        disabled={disabled}
        aria-busy={loading || undefined}
        onClick={(e) => {
          onClick?.(e);
          if (!loading) onPress();
        }}
        className={shell}
      >
        {shadow}
        {body}
      </button>
    );
  }
  return (
    <div {...rest} ref={ref as Ref<HTMLDivElement>} onClick={onClick} aria-busy={loading || undefined} className={shell}>
      {shadow}
      {body}
    </div>
  );
}
