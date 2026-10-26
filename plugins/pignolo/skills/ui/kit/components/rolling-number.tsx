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
 * settles in about 0.8 s) and each gets a 2 px blur that clears as it lands. It rolls only
 * when the value changes after it mounted (`animateOnMount` rolls the first value in from
 * zero); with `instant` a new value just lands.
 *
 * More or fewer characters: every character is a slot with a stable key. A slot that
 * appears (99 to 100, a thousands separator, the decimal point and its digits, a sign) grows
 * from width 0 while it fades in, and its digit rolls in from 0; a slot that goes away
 * (100 to 99, 1.000 to 999) shrinks to width 0 while it fades out, quicker than the entry.
 * Keys: integer digits count from the decimal point leftwards, fraction digits rightwards,
 * grouping separators by the digits to their right, prefix and suffix symbols by their own
 * character, so a "$" or a " km" never re-enters when the digits around it change. The
 * decimal point is read from the text: the last separator when it differs from the grouping
 * one, or occurs once and is not followed by exactly three digits. Width is animated here on
 * purpose (a layout exception to transform and opacity only: the neighbours must close the gap
 * smoothly); with `instant` or under reduced motion a slot appears and goes at once, only fading.
 *
 * States: rest, changing (interruptible: a new value mid-roll retargets with the
 * velocity kept), instant. Not interactive, so no hover, press or focus states.
 * Reduced motion: no sliding, no blur and no width animation, each digit cross-fades.
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
 * visible text, `className` sets size. Animates transform and opacity, the 2 px entry blur the
 * lab winner used, and slot width when the character count changes (documented exceptions).
 */
"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import * as m from "motion/react-m";
import { AnimatePresence, animate, type Transition } from "motion/react";
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

const isDigit = (c: string | undefined): boolean => c !== undefined && c >= "0" && c <= "9";

/** Index of the decimal separator in `chars`, or -1. See the header for the rule. */
function findDecimal(chars: string[]): number {
  // Only characters that touch a digit on both sides are separators ("$ 1" has a space, not a separator).
  const mids: number[] = [];
  chars.forEach((c, i) => {
    if (!isDigit(c) && isDigit(chars[i - 1]) && isDigit(chars[i + 1])) mids.push(i);
  });
  const lastAt = mids[mids.length - 1];
  if (lastAt === undefined) return -1;
  const last = chars[lastAt];
  if (mids.some((i) => chars[i] !== last)) return lastAt;
  if (mids.length > 1) return -1;
  let after = 0;
  for (let i = lastAt + 1; isDigit(chars[i]); i++) after += 1;
  return after === 3 ? -1 : lastAt;
}

/** A stable key per character slot, so a slot keeps its identity while the text around it grows or shrinks. */
function slotKeys(chars: string[]): string[] {
  const firstDigit = chars.findIndex((c) => isDigit(c));
  const lastDigit = chars.reduce((at, c, i) => (isDigit(c) ? i : at), -1);
  const dec = findDecimal(chars);
  const keys: string[] = new Array(chars.length).fill("");
  // Integer digits and grouping separators, counted from the decimal point (or the last digit) leftwards.
  let intRight = 0;
  for (let i = (dec >= 0 ? dec : lastDigit + 1) - 1; i >= firstDigit && firstDigit >= 0; i--) {
    const c = chars[i] ?? "";
    if (isDigit(c)) {
      keys[i] = "i" + intRight;
      intRight += 1;
    } else keys[i] = "g" + intRight + c;
  }
  if (dec >= 0) {
    keys[dec] = "dec";
    let frac = 0;
    for (let i = dec + 1; i <= lastDigit; i++) {
      const c = chars[i] ?? "";
      keys[i] = isDigit(c) ? "f" + frac++ : "h" + frac + c;
    }
  }
  // Prefix and suffix symbols are keyed by the character itself (and how many of it came before).
  const seen = new Map<string, number>();
  chars.forEach((c, i) => {
    if (keys[i] !== "") return;
    const tag = i < firstDigit || firstDigit < 0 ? "p" : "s";
    const n = (seen.get(tag + c) ?? 0) + 1;
    seen.set(tag + c, n);
    keys[i] = tag + n + c;
  });
  return keys;
}

interface SlotProps {
  children: ReactNode;
  /** True on the figure's first render: its slots are simply there, they do not grow in. */
  first: boolean;
  instant: boolean;
  reduced: boolean;
  grow: Transition;
  exit: Transition;
}

/** One character slot: grows from width 0 and fades in when it appears, shrinks and fades out when it goes. */
function Slot({ children, first, instant, reduced, grow, exit }: SlotProps) {
  const still = reduced || instant;
  return (
    <m.span
      data-slot=""
      className="inline-flex overflow-hidden"
      initial={first ? false : { width: 0, opacity: 0 }}
      animate={{
        width: "auto",
        opacity: 1,
        transition: still
          ? { width: { duration: 0 }, opacity: { duration: instant ? 0 : presets.fade.enter } }
          : { width: grow, opacity: { duration: 0.2, ease: "easeOut" } },
      }}
      exit={{
        width: 0,
        opacity: 0,
        transition: still ? { width: { duration: 0 }, opacity: { duration: instant ? 0 : presets.fade.exit } } : exit,
      }}
    >
      {children}
    </m.span>
  );
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
  const tier = useMotionTier("data");
  const reduced = tier.reduced;
  const grow: Transition = { type: "spring", visualDuration: Math.min(0.3, tier.tier.visualDuration), bounce: 0 };

  // Not AnimatePresence initial={false}: that would also switch off the digits' own roll from zero.
  const firstRender = useRef(true);
  useEffect(() => {
    firstRender.current = false;
  }, []);

  /** Digit values of the last committed render, by slot key. */
  const committed = useRef<Map<string, number> | null>(null);

  const { cells, digits } = useMemo(() => {
    const chars = Array.from(text);
    const keys = slotKeys(chars);
    const before = committed.current;
    let changing = 0;
    chars.forEach((c, i) => {
      if (isDigit(c) && before?.get(keys[i] ?? "") !== Number(c)) changing += 1;
    });
    const step = changing > 1 ? Math.min(presets.numberStagger, STAGGER_SPAN / (changing - 1)) : 0;
    let changed = 0;
    const out: Cell[] = chars.map((char, i) => {
      const key = keys[i] ?? String(i);
      if (!isDigit(char)) return { key, char, digit: null, delay: 0, fromZero: false };
      const digit = Number(char);
      const known = before?.get(key);
      const isChanged = known === undefined || known !== digit;
      const delay = reduced || instant || !isChanged ? 0 : changed * step;
      if (isChanged) changed += 1;
      const fromZero = before === null ? animateOnMount : known === undefined;
      return { key, char, digit, delay, fromZero };
    });
    const map = new Map<string, number>();
    out.forEach((c) => {
      if (c.digit !== null) map.set(c.key, c.digit);
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
        <AnimatePresence>
          {cells.map((c) => (
            <Slot key={c.key} first={firstRender.current} instant={instant} reduced={reduced} grow={grow} exit={tier.exit}>
              {c.digit === null ? (
                <span className={cn("inline-block whitespace-pre", CELL)}>{c.char}</span>
              ) : (
                <Digit digit={c.digit} delay={c.delay} fromZero={c.fromZero} instant={instant} />
              )}
            </Slot>
          ))}
        </AnimatePresence>
      </span>
    </span>
  );
}
