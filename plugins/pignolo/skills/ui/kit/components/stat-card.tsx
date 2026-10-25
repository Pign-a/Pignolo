/**
 * StatCard: one KPI. A label that says what is measured, the headline figure, a
 * trend mark and a helper line.
 *
 * Use when a single number answers a daily question (balance, open tasks, revenue
 * this month). One headline per card, 3 to 4 cards in a band. For a drill-down pass
 * `onClick`: the whole card becomes the one button (no other controls inside).
 * Tier: T for the figure (RollingNumber, data tier). The card itself has no spring: the
 * press is the kit's CSS press (scale 0.97 in 70 ms) and hover changes color and a soft
 * shadow only, never a lift. Radix primitive: none.
 *
 * States: rest (flat, hairline, no shadow), hover/press/focus-visible (only when
 * clickable: tint plus elevation 1 on hover), loading (skeleton at final size, shown after
 * `skeletonDelayMs`, default 1000, so a fast load never flashes it), empty (a plain mark
 * plus one line, never a zero), error (message plus retry, no stale number).
 * Keyboard: Tab to the card and Enter or Space when clickable; the retry button in
 * the error state is a normal button, 44 px on coarse pointers.
 * Trend: an arrow icon AND words. Color on the icon is a secondary cue; the text
 * always states the direction, so nothing depends on color. `upIsGood` flips which
 * direction reads as good (expenses going down is good).
 * Reading order for screen readers: the label names the group; the figure (announced
 * with the label as its context, "Ingresos del mes: $ 1.284.560") and the trend follow.
 * `instant` lands a new value without rolling, for figures that refresh by themselves.
 *
 * Copy (all from props): label, trend.label, helper, emptyText, emptyMark,
 * loadingLabel, error.message, error.retryLabel. The figure comes from `format`.
 * The headline uses tabular figures because RollingNumber needs equal digit widths
 * while the digits roll.
 */
"use client";

import { useId, type HTMLAttributes, type MouseEvent, type ReactNode, type Ref } from "react";
import { cn } from "../lib/cn";
import { coarseTarget, pressClass } from "../motion";
import { RollingNumber } from "./rolling-number";
import { Skeleton, SkeletonRegion } from "./skeleton";

export type TrendDirection = "up" | "down" | "flat";

export interface StatCardTrend {
  direction: TrendDirection;
  /** Words that carry the direction, e.g. "Sube 8 % frente al mes anterior". */
  label: string;
  /** Whether up is the good direction. Default true. */
  upIsGood?: boolean;
}

export interface StatCardError {
  message: string;
  retryLabel: string;
  onRetry: () => void;
}

export interface StatCardProps {
  /** What is measured, 1 to 3 words: "Ingresos del mes". */
  label: string;
  /** The headline figure. null means there is no data yet. */
  value: number | null;
  format?: (value: number) => string;
  trend?: StatCardTrend;
  helper?: string;
  loading?: boolean;
  /** Announced while loading. */
  loadingLabel?: string;
  error?: StatCardError;
  /** Shown instead of the figure when value is null. */
  emptyMark?: string;
  /** One line under the mark when value is null: "Todavía no hay ventas". */
  emptyText?: string;
  /** Makes the whole card a button (drill-down). */
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  animateOnMount?: boolean;
  /** Land new values without rolling (automatic refreshes). */
  instant?: boolean;
  /** Milliseconds the loading skeleton waits before showing. Default 1000; 0 shows it at once. Used with loadingLabel. */
  skeletonDelayMs?: number;
  className?: string;
  /** Forwarded to the clickable button, so the card can be an `asChild` trigger of a Radix primitive. */
  ref?: Ref<HTMLButtonElement>;
}

type Passthrough = Omit<
  HTMLAttributes<HTMLButtonElement>,
  keyof StatCardProps | "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "style"
>;

const arrow: Record<TrendDirection, ReactNode> = {
  up: <path d="M10 15.5v-11M5 9.5l5-5 5 5" />,
  down: <path d="M10 4.5v11M5 10.5l5 5 5-5" />,
  flat: <path d="M4.5 10h11" />,
};

function TrendMark({ trend }: { trend: StatCardTrend }) {
  const goodUp = trend.upIsGood ?? true;
  const tone =
    trend.direction === "flat"
      ? "text-(--color-on-surface-muted)"
      : (trend.direction === "up") === goodUp
        ? "text-(--color-success)"
        : "text-(--color-error)";
  return (
    <p data-stat="trend" className="flex items-center gap-(--space-1) text-sm text-(--color-on-surface-variant)">
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("shrink-0", tone)}
      >
        {arrow[trend.direction]}
      </svg>
      <span>{trend.label}</span>
    </p>
  );
}

const shell =
  "block w-full rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-surface) p-(--space-6) text-left";

export function StatCard({
  label,
  value,
  format,
  trend,
  helper,
  loading = false,
  loadingLabel,
  error,
  emptyMark = "-",
  emptyText,
  onClick,
  animateOnMount = false,
  instant,
  skeletonDelayMs,
  className,
  ref,
  ...rest
}: StatCardProps & Passthrough) {
  const labelId = useId();
  const clickable = Boolean(onClick) && !loading && !error;

  const labelEl = (
    <p id={labelId} className="text-sm text-(--color-on-surface-variant)">
      {label}
    </p>
  );

  let body: ReactNode;
  if (loading) {
    const skeleton = (
      <>
        {labelEl}
        <Skeleton className="mt-(--space-2) h-10 w-40" />
        <Skeleton radius="sm" className="mt-(--space-3) h-3.5 w-32" delay={0.1} />
      </>
    );
    body = loadingLabel ? <SkeletonRegion label={loadingLabel} delayMs={skeletonDelayMs}>{skeleton}</SkeletonRegion> : skeleton;
  } else if (error) {
    body = (
      <>
        {labelEl}
        <p className="mt-(--space-2) flex items-start gap-(--space-2) text-sm text-(--color-on-surface)">
          <span
            aria-hidden="true"
            className="mt-px flex size-4 shrink-0 items-center justify-center rounded-(--radius-sm) bg-(--color-error-container) text-xs font-semibold text-(--color-on-error-container)"
          >
            !
          </span>
          <span>{error.message}</span>
        </p>
        <button
          type="button"
          onClick={error.onRetry}
          className={cn("kit-focus mt-(--space-3) -ml-(--space-2) min-h-(--target-min) rounded-(--radius-md) px-(--space-2) text-sm font-medium text-(--color-primary) hover:bg-(--color-primary-container) active:bg-(--color-primary-container)", coarseTarget)}
        >
          {error.retryLabel}
        </button>
      </>
    );
  } else if (value === null) {
    body = (
      <>
        {labelEl}
        <p data-stat="empty" className="mt-(--space-2) text-4xl leading-tight font-semibold text-(--color-on-surface-muted)">
          {emptyMark}
        </p>
        {emptyText ? <p className="mt-(--space-3) text-sm text-(--color-on-surface-muted)">{emptyText}</p> : null}
      </>
    );
  } else {
    body = (
      <>
        {labelEl}
        <p data-stat="value" className="mt-(--space-2) text-4xl leading-tight font-semibold tracking-tight text-(--color-on-surface)">
          <RollingNumber value={value} format={format} animateOnMount={animateOnMount} instant={instant} label={label} />
        </p>
        {trend ? (
          <div className="mt-(--space-3)">
            <TrendMark trend={trend} />
          </div>
        ) : null}
        {helper ? (
          <p data-stat="helper" className={cn("text-sm text-(--color-on-surface-muted)", trend ? "mt-(--space-1)" : "mt-(--space-3)")}>
            {helper}
          </p>
        ) : null}
      </>
    );
  }

  if (clickable) {
    return (
      <button
        {...rest}
        ref={ref}
        type="button"
        onClick={onClick}
        className={cn(
          shell,
          "kit-focus cursor-pointer hover:bg-(--color-surface-container) hover:shadow-(--elevation-1) active:bg-(--color-surface-container)",
          pressClass,
          className,
        )}
      >
        {body}
      </button>
    );
  }

  return (
    <div role="group" aria-labelledby={labelId} aria-busy={loading || undefined} className={cn(shell, className)}>
      {body}
    </div>
  );
}
