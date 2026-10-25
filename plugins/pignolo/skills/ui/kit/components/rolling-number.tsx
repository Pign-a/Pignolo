/**
 * RollingNumber: a figure whose digits roll to the new value when it changes.
 *
 * Use for KPIs, balances and counters where the change itself is information. A figure
 * that refreshes by itself (polling, live counters) should not roll every time: pass
 * `instant`. Tier: T (data tier, 0.45 s, bounce 0). Radix primitive: none (custom).
 *
 * How it works: the value is formatted by the `format` prop (any currency, unit
 * or locale). Every digit of the result is a column of 0 to 9 that slides with a
 * spring; separators, signs and symbols stay still. Changed digits start in order
 * (50 ms apart, shortened so the last one starts within 0.2 s: an eight digit number
 * settles in about 0.8 s) and each gets a 2 px blur that clears as it lands. Digits are
 * keyed from the right, so adding a digit keeps the others in place. It rolls only when
 * the value changes after it mounted (`animateOnMount` rolls the first value in from
 * zero); with `instant` a new value just lands.
 *
 * States: rest, changing (interruptible: a new value mid-roll retargets with the
 * velocity kept), instant. Not interactive, so no hover, press or focus states.
 * Reduced motion: no sliding and no blur, each digit cross-fades.
 * Keyboard: none needed. Screen readers get one text node with the final formatted
 * value (a polite live region, so only the end value is announced, never the
 * intermediate digits), led by the optional `label` so the number comes with its
 * meaning ("Ingresos del mes: $ 1.284.560"). The rolling columns are aria-hidden and
 * user-select none, so copying or finding the figure gets the real number (the label
 * is not selectable, so it is not copied either).
 * Figures are tabular on purpose: equal digit widths keep the columns from shifting
 * while they roll.
 *
 * Copy: `label` (optional, announced only, in the app's language); `format` produces the
 * visible text, `className` sets size. Animates transform and opacity, plus the 2 px entry
 * blur the lab winner used (a documented exception to transform and opacity only).
 */
"use client";

import { useEffect, useMemo, useRef } from "react";
import * as m from "motion/react-m";
import { animate } from "motion/react";
import { cn } from "../lib/cn";
import { presets, useMotionTier } from "../motion";

export interface RollingNumberProps {
  value: number;
  /** Turns the value into the visible text, e.g. an Intl.NumberFormat. Digits 0 to 9 roll, anything else is static. */
  format?: (value: number) => string;
  /** Roll in from zero the first time it renders. Default: show the value at once. */
  animateOnMount?: boolean;
  /** Land a new value at once, with no roll and no blur. Use for automatic refreshes (polling, live counters). */
  instant?: boolean;
  /** What the number is, announced before it by assistive tech: "Ingresos del mes". Not shown, not copied. */
  label?: string;
  /** "polite" announces the final value when it changes; "off" for values that update very often. */
  announce?: "polite" | "off";
  className?: string;
}

const defaultFormat = (value: number): string => new Intl.NumberFormat().format(value);

/** Window height in em. Every column cell and every static character share it. */
const CELL = "h-[1.2em] leading-[1.2em]";

/** The last changing digit starts no later than this many seconds after the first (eight digits settle in about 0.8 s). */
const STAGGER_SPAN = 0.2;

interface DigitProps {
  digit: number;
  delay: number;
  fromZero: boolean;
  instant: boolean;
}

function Digit({ digit, delay, fromZero, instant }: DigitProps) {
  const t = useMotionTier("data");
  const win = useRef<HTMLSpanElement>(null);
  const previous = useRef<number | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = digit;
    if (t.reduced || instant) return;
    const roll = before === null ? fromZero : before !== digit;
    const el = win.current;
    if (!roll || !el) return;
    const blur = animate(
      el,
      { filter: [`blur(${presets.numberBlur}px)`, "blur(0px)"] },
      { duration: Math.min(0.22, t.tier.visualDuration), ease: "easeOut", delay },
    );
    // Clear the inline filter once Motion has committed its final frame, so settled digits keep no filter.
    void blur.then(() => {
      requestAnimationFrame(() => {
        el.style.filter = "";
      });
    });
  }, [digit, delay, fromZero, instant, t.reduced, t.tier.visualDuration]);

  if (t.reduced) {
    return (
      <span className={cn("relative inline-block overflow-hidden", CELL)}>
        <m.span
          key={digit}
          className={cn("block", CELL)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={t.enter}
        >
          {digit}
        </m.span>
      </span>
    );
  }

  return (
    <span ref={win} className={cn("relative inline-block overflow-hidden", CELL)}>
      <m.span
        className="flex flex-col"
        initial={fromZero && !instant ? { y: "0%" } : false}
        animate={{ y: `${-digit * 10}%` }}
        transition={instant ? { duration: 0 } : { type: "spring", visualDuration: t.tier.visualDuration, bounce: t.tier.bounce, delay }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <span key={d} className={cn("block", CELL)}>
            {d}
          </span>
        ))}
      </m.span>
    </span>
  );
}

interface Cell {
  key: string;
  char: string;
  digit: number | null;
  delay: number;
  fromZero: boolean;
}

export function RollingNumber({
  value,
  format = defaultFormat,
  animateOnMount = false,
  instant = false,
  label,
  announce = "polite",
  className,
}: RollingNumberProps) {
  const text = useMemo(() => format(value), [format, value]);
  const reduced = useMotionTier("data").reduced;

  /** Digit values of the last committed render, by position from the right. */
  const committed = useRef<Map<number, number> | null>(null);

  const { cells, digits } = useMemo(() => {
    const chars = Array.from(text);
    const total = chars.filter((c) => c >= "0" && c <= "9").length;
    const before = committed.current;
    let seen = 0;
    let changed = 0;
    let before_seen = 0;
    let changing = 0;
    for (const c of chars) {
      if (c < "0" || c > "9") continue;
      const place = total - 1 - before_seen;
      before_seen += 1;
      if (before?.get(place) !== Number(c)) changing += 1;
    }
    const step = changing > 1 ? Math.min(presets.numberStagger, STAGGER_SPAN / (changing - 1)) : 0;
    const out: Cell[] = chars.map((char, i) => {
      if (char >= "0" && char <= "9") {
        const digit = Number(char);
        const fromRight = total - 1 - seen;
        seen += 1;
        const known = before?.get(fromRight);
        const isChanged = known === undefined || known !== digit;
        const delay = reduced || instant || !isChanged ? 0 : changed * step;
        if (isChanged) changed += 1;
        const fromZero = before === null ? animateOnMount : known === undefined;
        return { key: `d${fromRight}`, char, digit, delay, fromZero };
      }
      return { key: `c${chars.length - 1 - i}${char}`, char, digit: null, delay: 0, fromZero: false };
    });
    const map = new Map<number, number>();
    out.forEach((c) => {
      if (c.digit !== null) map.set(Number(c.key.slice(1)), c.digit);
    });
    return { cells: out, digits: map };
  }, [text, animateOnMount, instant, reduced]);

  useEffect(() => {
    committed.current = digits;
  }, [digits]);

  return (
    <span className={cn("inline-flex tabular-nums", className)}>
      <span className="sr-only" aria-live={announce === "polite" ? "polite" : "off"} aria-atomic="true">
        {label ? <span className="select-none">{label}: </span> : null}
        <span>{text}</span>
      </span>
      <span aria-hidden="true" className="inline-flex select-none">
        {cells.map((c) =>
          c.digit === null ? (
            <span key={c.key} className={cn("inline-block whitespace-pre", CELL)}>
              {c.char}
            </span>
          ) : (
            <Digit key={c.key} digit={c.digit} delay={c.delay} fromZero={c.fromZero} instant={instant} />
          ),
        )}
      </span>
    </span>
  );
}
