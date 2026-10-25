/**
 * Bars: a column chart whose bars grow one by one once the chart scrolls into view.
 *
 * Use to compare a few values across categories (up to about 12 categories, up to 3
 * series). For a trend over time with many points use a line chart; for a single
 * headline use StatCard. Tier: T for the reveal (data tier, 0.45 s, bounce 0), stagger
 * 90 ms, shortened so the last bar starts within 0.6 s however many bars there are
 * (18 bars: 35 ms apart). New data after the reveal glides the heights with the direct
 * tier (0.22 s, bounce 0), all together, no stagger. Radix primitive: none (custom).
 *
 * Data viz rules applied: one hue per series, in fixed order from the chart tokens
 * (`--chart-1` to `--chart-3` in chart-tokens.css, validated with the dataviz palette
 * validator; never cycled), never color alone: a legend names every series (hidden for
 * a single series, the title names it), series after the first also carry a diagonal
 * hatch, a single series prints its value on top of each bar, and a data table is one
 * button away (that table is the relief the light palette's sub-3:1 slots require).
 * Bars are at most 24 px thick, 4 px rounded at the data end, square at the baseline,
 * with a 2 px gap between neighbours. Gridlines are hairlines. Text uses text tokens,
 * never the series color. Negative values are drawn as zero.
 *
 * States: rest, in-view growth, data change, hover and focus-visible on a category (tint
 * plus a tooltip with every series value when there are 2 or more), table open or
 * closed, empty (a message instead of the plot). Reduced motion: bars fade in, no
 * growth, no stagger, and new data jumps. Forced colors: bars, swatches and hatch opt out
 * of forced color adjustment and use the system colors the tokens map to.
 * Keyboard: the plot is one Tab stop (roving tabindex); ArrowLeft, ArrowRight, Home and
 * End move between categories and open that category's tooltip; Esc hides the tooltip
 * and leaves focus where it is; Tab goes on to the table button; Enter or Space toggles
 * the table. The tooltip is hoverable (the pointer can move onto it without closing it)
 * and dismissible (WCAG 1.4.13). Each category is role="img" with a label such as
 * "Ene: Ingresos $ 45". Replay with `replayKey`.
 *
 * Copy (all from props): title, categories, series[].label, categoryHeader,
 * showTableLabel, hideTableLabel, emptyLabel. Values are written by `format`
 * (full, for labels and the table) and `formatTick` (short, for the axis). The axis
 * re-scales at once when the data changes; the bars glide to it.
 * Motion: the reveal animates scaleY and opacity only (the lab allows scaleY on bars).
 * Documented exception: after the reveal, a data change animates each bar's height (a
 * layout property), so the value above it and its hit area follow the bar. Never on
 * scroll, hover or reveal. Touch: the table button is 44 px on coarse pointers.
 */
"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import * as m from "motion/react-m";
import { AnimatePresence, useInView } from "motion/react";
import { cn } from "../lib/cn";
import { coarseTarget, springFor, useMotionTier } from "../motion";

export interface BarSeries {
  id: string;
  label: string;
  /** One value per category, same order as `categories`. */
  values: number[];
  /** CSS color. Defaults to the chart token for the series position. Do not use the status colors. */
  color?: string;
}

export interface BarsProps {
  title: string;
  categories: string[];
  series: BarSeries[];
  format?: (value: number) => string;
  /** Shorter format for the axis ticks. Defaults to `format`. */
  formatTick?: (value: number) => string;
  /** Plot height in px. */
  height?: number;
  /** Header of the first table column: "Mes". */
  categoryHeader: string;
  showTableLabel: string;
  hideTableLabel: string;
  /** Shown instead of the plot when there is no data. */
  emptyLabel?: string;
  /** Change this value to play the growth again. */
  replayKey?: string | number;
  className?: string;
}

const defaultFormat = (value: number): string => new Intl.NumberFormat().format(value);

/**
 * Chart tokens in fixed order, never cycled. The fallback after each comma is used only
 * when chart-tokens.css is not loaded, so a chart still draws in neutral kit colors.
 */
const SERIES_COLORS = [
  "var(--chart-1, var(--color-primary))",
  "var(--chart-2, var(--color-on-surface-variant))",
  "var(--chart-3, var(--color-outline))",
  "var(--chart-4, var(--color-on-surface-muted))",
  "var(--chart-5, var(--color-outline))",
  "var(--chart-6, var(--color-on-surface))",
] as const;

/** Series after the first get a hatch so identity never rests on color alone. */
const HATCH_ANGLES = [null, 45, 135] as const;

/** Marks keep their colors under forced colors; the hatch gaps become Canvas so the stripes still show. */
const markClass = "forced-colors:[forced-color-adjust:none] forced-colors:[--bars-hatch:Canvas]";

function fillStyle(color: string, index: number): { backgroundColor: string; backgroundImage?: string } {
  const angle = HATCH_ANGLES[index % HATCH_ANGLES.length] ?? null;
  if (angle === null) return { backgroundColor: color };
  return {
    backgroundColor: color,
    backgroundImage: `repeating-linear-gradient(${angle}deg, transparent 0 3px, var(--bars-hatch, color-mix(in srgb, var(--color-surface) 45%, transparent)) 3px 5px)`,
  };
}

function niceScale(max: number, intervals = 4): { top: number; ticks: number[] } {
  if (!(max > 0)) return { top: 1, ticks: [0, 1] };
  const raw = max / intervals;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / magnitude;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * magnitude;
  const count = Math.ceil(max / step - 1e-9);
  const ticks = Array.from({ length: count + 1 }, (_, i) => Math.round(i * step * 1e9) / 1e9);
  return { top: ticks[ticks.length - 1] ?? step, ticks };
}

/** The last bar of a reveal starts no later than this many seconds after the first. */
const SWEEP_CAP = 0.6;

export function Bars({
  title,
  categories,
  series,
  format = defaultFormat,
  formatTick,
  height = 200,
  categoryHeader,
  showTableLabel,
  hideTableLabel,
  emptyLabel,
  replayKey,
  className,
}: BarsProps) {
  const t = useMotionTier("data");
  const glide = useMotionTier("direct");
  const plotRef = useRef<HTMLDivElement>(null);
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);
  const inView = useInView(plotRef, { once: true, amount: 0.35 });
  const [tableOpen, setTableOpen] = useState(false);
  const tableId = useId();
  const tick = formatTick ?? format;

  // Tooltip: opened by the pointer or by keyboard focus, dismissed by Esc until it closes or moves on.
  const [hover, setHover] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [roving, setRoving] = useState(0);
  const openCol = hover ?? focused;

  useEffect(() => {
    if (openCol === null) {
      setDismissed(null);
      return;
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setDismissed(openCol);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openCol]);

  const n = categories.length;
  const cleaned = series.map((s) => ({ ...s, values: categories.map((_, i) => Math.max(0, s.values[i] ?? 0)) }));
  const top = niceScale(Math.max(0, ...cleaned.flatMap((s) => s.values)));
  const multi = cleaned.length > 1;
  const barCount = n * cleaned.length;
  const stagger = barCount > 1 ? Math.min(t.tier.stagger, SWEEP_CAP / (barCount - 1)) : 0;
  const colorOf = (s: BarSeries, i: number): string => s.color ?? SERIES_COLORS[Math.min(i, SERIES_COLORS.length - 1)] ?? SERIES_COLORS[0];
  const stop = Math.min(roving, Math.max(0, n - 1));

  if (n === 0 || cleaned.length === 0) {
    return (
      <figure className={cn("m-0", className)}>
        <figcaption className="text-sm font-medium text-(--color-on-surface)">{title}</figcaption>
        <p className="mt-(--space-3) rounded-(--radius-lg) border border-dashed border-(--color-border-subtle) p-(--space-6) text-sm text-(--color-on-surface-muted)">
          {emptyLabel ?? ""}
        </p>
      </figure>
    );
  }

  const grow = (index: number) => {
    const delay = t.reduced ? 0 : index * stagger;
    return {
      initial: t.reduced ? { opacity: 0 } : { scaleY: 0.02, opacity: 0 },
      animate: inView ? { scaleY: 1, opacity: 1 } : t.reduced ? { opacity: 0 } : { scaleY: 0.02, opacity: 0 },
      transition: t.reduced
        ? { duration: 0.12, ease: "easeOut" as const }
        : {
            scaleY: { type: "spring" as const, visualDuration: t.tier.visualDuration, bounce: t.tier.bounce, delay },
            opacity: { duration: Math.min(0.18, t.tier.visualDuration * 0.9), ease: "easeOut" as const, delay },
          },
    };
  };

  const columns = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = columnRefs.current.indexOf(event.target as HTMLDivElement);
    if (current < 0) return;
    const next =
      event.key === "ArrowRight" ? current + 1 : event.key === "ArrowLeft" ? current - 1 : event.key === "Home" ? 0 : event.key === "End" ? n - 1 : null;
    if (next === null) return;
    event.preventDefault();
    const index = Math.min(n - 1, Math.max(0, next));
    setRoving(index);
    setFocused(index);
    columnRefs.current[index]?.focus();
  };

  return (
    <figure className={cn("m-0", className)}>
      <figcaption className="text-sm font-medium text-(--color-on-surface)">{title}</figcaption>

      {multi ? (
        <ul className="mt-(--space-2) flex flex-wrap gap-x-(--space-4) gap-y-(--space-1) text-sm text-(--color-on-surface-variant)">
          {cleaned.map((s, si) => (
            <li key={s.id} className="flex items-center gap-(--space-2)">
              <span
                aria-hidden="true"
                className={cn("size-3 shrink-0 rounded-[2px]", markClass)}
                style={fillStyle(colorOf(s, si), si)}
              />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-(--space-3) flex pt-6">
        <div className="relative w-14 shrink-0 text-xs text-(--color-on-surface-muted)" style={{ height }} aria-hidden="true">
          {top.ticks.map((v) => (
            <span
              key={v}
              className="absolute right-(--space-2) translate-y-1/2 whitespace-nowrap tabular-nums"
              style={{ bottom: `${(v / top.top) * 100}%` }}
            >
              {tick(v)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div ref={plotRef} className="relative" style={{ height }}>
            {top.ticks.map((v) => (
              <div
                key={v}
                aria-hidden="true"
                className="absolute inset-x-0 border-t border-(--color-border-subtle)"
                style={{ bottom: `${(v / top.top) * 100}%` }}
              />
            ))}
            <div
              key={replayKey}
              className="absolute inset-0 grid"
              style={columns}
              role="group"
              aria-label={title}
              onKeyDown={moveFocus}
            >
              {categories.map((cat, ci) => {
                const summary = cleaned.map((s) => `${s.label} ${format(s.values[ci] ?? 0)}`).join(", ");
                const anchor = ci < n / 2 ? "left-0" : "right-0";
                const open = openCol === ci && dismissed !== ci;
                return (
                  <div
                    key={cat}
                    ref={(el) => {
                      columnRefs.current[ci] = el;
                    }}
                    data-bars-column=""
                    role="img"
                    tabIndex={ci === stop ? 0 : -1}
                    aria-label={`${cat}: ${summary}`}
                    onPointerEnter={() => setHover(ci)}
                    onPointerLeave={() => setHover(null)}
                    onFocus={(event) => {
                      setRoving(ci);
                      if (event.currentTarget.matches(":focus-visible")) setFocused(ci);
                    }}
                    onBlur={() => setFocused(null)}
                    className="kit-focus relative flex items-end justify-center gap-0.5 rounded-(--radius-sm) hover:bg-(--color-surface-container)"
                  >
                    {cleaned.map((s, si) => {
                      const value = s.values[ci] ?? 0;
                      const g = grow(ci * cleaned.length + si);
                      return (
                        <m.div
                          key={s.id}
                          className="relative max-w-6 min-w-0 flex-1"
                          initial={false}
                          animate={{ height: `${(value / top.top) * 100}%` }}
                          transition={glide.reduced ? { duration: 0 } : springFor("direct")}
                        >
                          <m.div
                            data-bars-bar=""
                            aria-hidden="true"
                            className={cn("absolute inset-0 origin-bottom", markClass)}
                            style={{ ...fillStyle(colorOf(s, si), si), borderTopLeftRadius: 4, borderTopRightRadius: 4 }}
                            {...g}
                          />
                          {multi ? null : (
                            <m.span
                              data-bars-value=""
                              aria-hidden="true"
                              className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 text-xs whitespace-nowrap text-(--color-on-surface-variant) tabular-nums"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: inView ? 1 : 0 }}
                              transition={{
                                duration: 0.18,
                                ease: "easeOut",
                                delay: t.reduced ? 0 : ci * stagger + 0.15,
                              }}
                            >
                              {format(value)}
                            </m.span>
                          )}
                        </m.div>
                      );
                    })}
                    {multi ? (
                      <div
                        aria-hidden="true"
                        className={cn(
                          "absolute bottom-full z-10 w-max pb-1 transition-opacity duration-[120ms]",
                          open ? "opacity-100" : "pointer-events-none opacity-0",
                          anchor,
                        )}
                      >
                        <div className="rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-surface) p-(--space-2) text-xs text-(--color-on-surface) shadow-(--elevation-2)">
                          <p className="mb-(--space-1) font-medium">{cat}</p>
                          <ul className="flex flex-col gap-(--space-1)">
                            {cleaned.map((s, si) => (
                              <li key={s.id} className="flex items-center gap-(--space-2) text-(--color-on-surface-variant)">
                                <span
                                  className={cn("size-2.5 shrink-0 rounded-[2px]", markClass)}
                                  style={fillStyle(colorOf(s, si), si)}
                                />
                                <span>{s.label}</span>
                                <span className="ml-auto pl-(--space-3) tabular-nums text-(--color-on-surface)">
                                  {format(s.values[ci] ?? 0)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-(--space-2) grid text-center text-xs text-(--color-on-surface-muted)" style={columns} aria-hidden="true">
            {categories.map((cat) => (
              <span key={cat} className="truncate px-px">
                {cat}
              </span>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        aria-expanded={tableOpen}
        aria-controls={tableId}
        onClick={() => setTableOpen((o) => !o)}
        className={cn(
          "kit-focus -ml-(--space-2) mt-(--space-3) min-h-(--target-min) rounded-(--radius-md) px-(--space-2) text-sm font-medium text-(--color-primary) hover:bg-(--color-primary-container) active:bg-(--color-primary-container)",
          coarseTarget,
        )}
      >
        {tableOpen ? hideTableLabel : showTableLabel}
      </button>

      <div id={tableId}>
        <AnimatePresence initial={false}>
          {tableOpen ? (
            <m.div
              key="table"
              className="mt-(--space-2) overflow-x-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: t.enter }}
              exit={{ opacity: 0, transition: t.exit }}
            >
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">{title}</caption>
                <thead>
                  <tr className="border-b border-(--color-border-subtle) text-left text-(--color-on-surface-variant)">
                    <th scope="col" className="py-(--space-2) pr-(--space-4) font-medium">
                      {categoryHeader}
                    </th>
                    {cleaned.map((s) => (
                      <th key={s.id} scope="col" className="py-(--space-2) pl-(--space-4) text-right font-medium">
                        {s.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {categories.map((cat, ci) => (
                    <tr key={cat} className="border-b border-(--color-border-subtle) text-(--color-on-surface)">
                      <th scope="row" className="py-(--space-2) pr-(--space-4) text-left font-normal">
                        {cat}
                      </th>
                      {cleaned.map((s) => (
                        <td key={s.id} className="py-(--space-2) pl-(--space-4) text-right tabular-nums">
                          {format(s.values[ci] ?? 0)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </m.div>
          ) : null}
        </AnimatePresence>
      </div>
    </figure>
  );
}
