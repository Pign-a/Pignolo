/**
 * Accordion: stacked sections that open and close, to hide secondary content.
 * Use when: 3 to 8 short sections the reader opens one at a time (FAQ, settings groups).
 * Do not hide content people need to compare or that is the point of the page.
 * Tier: a calm spring of its own (visualDuration 0.3 s, bounce 0), because the content has no inertia and
 *   a bounce moved every header below it. Opening uses it; a close that is part of a swap in single mode
 *   uses the very same spring, so the section that closes and the one that opens move in step (same time,
 *   same curve): the headers move once, in one direction, with no overshoot. A lone close (nothing replaces
 *   it) uses the faster momentum exit tween (0.13 s), as exits are faster than enters.
 * Primitive: @radix-ui/react-accordion (single or multiple, aria-expanded, region, arrow keys).
 *   Content is force mounted so the height can animate; closed content is `inert`
 *   (not focusable, not read) once collapsed.
 * Motion: `grid-template-rows` goes 0fr to 1fr (one of the documented layout exceptions: it
 *   avoids measuring content), the inner text only fades (no slide) over 0.18 s starting 40 ms later,
 *   the chevron rotates 180 degrees in 0.2 s. Why not keep the clicked header still: the section that
 *   closes above it has to take its height away, so the header rises by exactly that height; the calm
 *   shared spring makes that one smooth move (a section opened above the open one keeps its header
 *   completely still). Reduced motion: no height travel (rows snap), the text fades in 0.12 s and the
 *   chevron turns instantly.
 * States: rest, hover (tint over the whole row), focus-visible ring (inside the row), press (a darker
 *   tint over the same whole row; no scale, because scaling a wide row left uncovered strips at its
 *   edges), open, disabled. Spamming toggles retargets the spring.
 * Keyboard: Tab to a header, Enter or Space toggles, ArrowUp/ArrowDown move between headers,
 *   Home/End jump to first/last (Radix).
 * Copy props: items[].title and items[].content.
 */
"use client";

import { useState, type ReactNode } from "react";
import * as RadixAccordion from "@radix-ui/react-accordion";
import * as m from "motion/react-m";
import { cn } from "../lib/cn";
import { useMotionTier } from "../motion";

/** Shared by the opening and the swap-closing panel: same time, same curve, no bounce. */
const CALM = { type: "spring", visualDuration: 0.3, bounce: 0 } as const;

export interface AccordionItem {
  value: string;
  title: string;
  content: ReactNode;
  disabled?: boolean;
}

interface BaseProps {
  items: readonly AccordionItem[];
  className?: string;
}

export interface SingleAccordionProps extends BaseProps {
  type?: "single";
  /** A single accordion can close its open section. Default true. */
  collapsible?: boolean;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

export interface MultipleAccordionProps extends BaseProps {
  type: "multiple";
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
}

export type AccordionProps = SingleAccordionProps | MultipleAccordionProps;

function Chevron({ open, reduced }: { open: boolean; reduced: boolean }) {
  return (
    <m.span
      aria-hidden="true"
      className="flex shrink-0 text-(--color-on-surface-variant)"
      initial={false}
      animate={{ rotate: open ? 180 : 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
    >
      <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 7.5l5 5 5-5" />
      </svg>
    </m.span>
  );
}

export function Accordion(props: AccordionProps) {
  const { items, className } = props;
  const t = useMotionTier("momentum");

  const initial = props.type === "multiple" ? (props.defaultValue ?? []) : props.defaultValue ? [props.defaultValue] : [];
  const [inner, setInner] = useState<string[]>(initial);
  const controlled = props.type === "multiple" ? props.value : props.value !== undefined ? [props.value] : undefined;
  const open = controlled ?? inner;

  const commit = (next: string[]) => {
    if (controlled === undefined) setInner(next);
    if (props.type === "multiple") props.onValueChange?.(next);
    else props.onValueChange?.(next[0] ?? "");
  };

  const rows = items.map((item) => {
    const isOpen = open.includes(item.value);
    // Single mode with another section open: this one is closing because that one opened.
    const swapping = !isOpen && props.type !== "multiple" && open.some(Boolean);
    return (
      <RadixAccordion.Item key={item.value} value={item.value} disabled={item.disabled} className="border-b border-(--color-border-subtle) last:border-b-0">
        <RadixAccordion.Header className="m-0 flex">
          <RadixAccordion.Trigger
            className={cn(
              "kit-focus flex min-h-12 flex-1 items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-(--color-on-surface) outline-offset-[-2px]",
              "transition-[background-color] duration-75 ease-out hover:bg-(--color-surface-container) active:bg-(--color-border-subtle)",
              "disabled:cursor-not-allowed disabled:opacity-(--state-disabled-content) disabled:hover:bg-transparent disabled:active:bg-transparent",
            )}
          >
            <span>{item.title}</span>
            <Chevron open={isOpen} reduced={t.reduced} />
          </RadixAccordion.Trigger>
        </RadixAccordion.Header>
        <RadixAccordion.Content forceMount asChild>
          <m.div
            className="grid"
            inert={!isOpen}
            initial={false}
            animate={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
            transition={t.reduced ? { duration: 0 } : isOpen || swapping ? CALM : t.exit}
          >
            <m.div
              className="min-h-0 overflow-hidden"
              initial={false}
              animate={{ opacity: isOpen ? 1 : 0 }}
              transition={isOpen ? { duration: t.reduced ? 0.12 : 0.18, ease: "easeOut", delay: t.reduced ? 0 : 0.04 } : t.exit}
            >
              <div className="px-4 pb-4 text-sm leading-relaxed text-(--color-on-surface-variant)">{item.content}</div>
            </m.div>
          </m.div>
        </RadixAccordion.Content>
      </RadixAccordion.Item>
    );
  });

  const frame = cn("overflow-hidden rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-surface)", className);

  if (props.type === "multiple") {
    return (
      <RadixAccordion.Root type="multiple" value={open} onValueChange={commit} className={frame}>
        {rows}
      </RadixAccordion.Root>
    );
  }
  return (
    <RadixAccordion.Root
      type="single"
      collapsible={props.collapsible ?? true}
      value={open[0] ?? ""}
      onValueChange={(v) => commit(v ? [v] : [])}
      className={frame}
    >
      {rows}
    </RadixAccordion.Root>
  );
}
