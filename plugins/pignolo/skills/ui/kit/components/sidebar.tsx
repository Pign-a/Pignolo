/**
 * Sidebar: collapsible vertical navigation (256 px open, 56 px rail), a drawer below 768 px.
 * Use when: more than 5 sections people revisit often. With fewer, use a top bar.
 * 5 to 8 destinations, at most 3 groups, two tiers at most. Items are links, not actions.
 * Tier: direct, with the sidebar preset: the width spring is 0.16 s, bounce 0. The drawer enters with
 *   the momentum tier (0.35 s, bounce 0.2) and leaves in 0.16 s (a large overlay exits in 150 to 180 ms).
 * Primitive: none for the inline sidebar (semantic nav, ul/li, a or button, aria-current="page"; no
 *   Radix part fits). The rail tooltips are the kit Tooltip; the drawer is @radix-ui/react-dialog.
 * Motion: the width is the one animated layout property (lab choice; a transform would squash the
 *   labels); labels fade out in 0.1 s and in over 0.18 s with a 6 px slide, staggered 18 ms per item
 *   after a 50 ms delay on expand; the current item indicator slides between items with a shared
 *   `layoutId` (transform). Spamming the toggle retargets the spring. Reduced motion: width snaps,
 *   labels fade, indicator jumps, the drawer fades.
 * Toggle: one button with a FIXED label (`toggleLabel`) and `aria-expanded`; the label never changes
 *   with the state (a changing name plus a changing state is read twice). `aria-controls` points at
 *   the collapsible region (header, groups, footer), not at the nav that holds the toggle.
 * Rail: the labels stay in the DOM (accessible name) and the kit Tooltip shows them on hover and on
 *   keyboard focus. Header and footer are `inert` while collapsed, so nothing hidden can be reached.
 *   Tooltips do not apply to touch: the drawer below always shows labels.
 * Drawer: below `drawerBelow` px (default 768) the sidebar is not rendered inline; the app opens it
 *   with `drawerOpen` and `onDrawerOpenChange` (its own menu button) and it shows as a 288 px modal
 *   with an overlay, focus trap, Esc, and focus back to the opener. Choosing an item closes it.
 * Persistence: `collapsed` and `onCollapsedChange` control it; `storageKey` also saves it to
 *   localStorage (read once on load, written on every change, every access in try/catch).
 * States: rest, hover (tint), focus-visible ring inside the item, press (content scales to 0.97 in
 *   75 ms; the indicator does not move), current (tint, semibold, aria-current), disabled (muted, not
 *   focusable), badge (only when actionable).
 * Keyboard: Tab through the toggle, header, items and footer; Enter activates.
 * Copy props: label, toggleLabel, drawerCloseLabel, groups[].label, items[].label/badge.
 *   Pass icons as ReactNode (the kit ships none).
 */
"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { cn } from "../lib/cn";
import { coarseTarget, presets, useMotionTier, type MotionTier } from "../motion";
import { Tooltip, TooltipProvider } from "./tooltip";

export interface SidebarItem {
  id: string;
  label: string;
  icon: ReactNode;
  /** Renders an anchor. Without it, a button that calls `onSelect`. */
  href?: string;
  onSelect?: () => void;
  disabled?: boolean;
  /** Only when it asks for action (for example "3"). */
  badge?: string;
}

export interface SidebarGroup {
  /** Optional visible group name (sentence case, one or two words). */
  label?: string;
  items: readonly SidebarItem[];
}

export interface SidebarState {
  collapsed: boolean;
}

export interface SidebarProps {
  /** Accessible name of the nav landmark. */
  label: string;
  groups: readonly SidebarGroup[];
  /** Id of the current item. Exactly one. */
  currentId: string;
  /** Called when an item is activated. */
  onNavigate?: (id: string) => void;
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Saves the collapsed state in localStorage under this key. Optional; storage errors are ignored. */
  storageKey?: string;
  /** Name of the toggle button, for example "Barra lateral". It does not change with the state. */
  toggleLabel: string;
  /** Product or workspace name area. Fades with the labels and is inert in the rail. */
  header?: ReactNode | ((state: SidebarState) => ReactNode);
  /** Account or settings area at the bottom. Inert in the rail. */
  footer?: ReactNode | ((state: SidebarState) => ReactNode);
  /** Width in px below which the sidebar becomes a drawer. Default 768. */
  drawerBelow?: number;
  drawerOpen?: boolean;
  onDrawerOpenChange?: (open: boolean) => void;
  /** Accessible name of the drawer close button. */
  drawerCloseLabel: string;
  className?: string;
}

const WIDTH_OPEN = 256;
const WIDTH_RAIL = 56;
/** A large overlay leaves in 150 to 180 ms. */
const DRAWER_EXIT = 0.16;

function readStored(key: string | undefined): boolean | undefined {
  if (!key) return undefined;
  try {
    const v = window.localStorage.getItem(key);
    return v === "true" ? true : v === "false" ? false : undefined;
  } catch {
    return undefined;
  }
}

function writeStored(key: string | undefined, value: boolean) {
  if (!key) return;
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    /* private mode or blocked site data: the state just does not persist */
  }
}

function useMaxWidth(px: number): boolean {
  return useSyncExternalStore(
    (cb) => {
      const q = window.matchMedia(`(max-width: ${px - 1}px)`);
      q.addEventListener("change", cb);
      return () => q.removeEventListener("change", cb);
    },
    () => window.matchMedia(`(max-width: ${px - 1}px)`).matches,
    () => false,
  );
}

function ToggleIcon({ collapsed, reduced }: { collapsed: boolean; reduced: boolean }) {
  return (
    <m.span
      aria-hidden="true"
      className="flex"
      initial={false}
      animate={{ scaleX: collapsed ? -1 : 1 }}
      transition={reduced ? { duration: 0 } : { duration: 0.16, ease: "easeOut" }}
    >
      <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="14" height="12" rx="3" />
        <path d="M8 4v12" />
      </svg>
    </m.span>
  );
}

const itemBase =
  "kit-focus group relative flex h-10 w-full items-center rounded-(--radius-md) px-[9px] text-sm outline-offset-[-2px] transition-colors duration-(--duration-fast)";

interface BodyProps {
  uid: string;
  groups: readonly SidebarGroup[];
  currentId: string;
  collapsed: boolean;
  /** The drawer shows labels and no tooltips. */
  drawer: boolean;
  t: MotionTier;
  header: SidebarProps["header"];
  footer: SidebarProps["footer"];
  regionId: string;
  onChoose: (id: string, item: SidebarItem) => void;
  /** Index to start label staggering from (the toggle takes the first). */
  firstIndex: number;
}

function withTip(tip: boolean, content: string, child: ReactElement): ReactElement {
  return (
    <Tooltip content={content} side="right" open={tip ? undefined : false}>
      {child}
    </Tooltip>
  );
}

function SidebarBody({ uid, groups, currentId, collapsed, drawer, t, header, footer, regionId, onChoose, firstIndex }: BodyProps) {
  const state: SidebarState = { collapsed };
  const indicatorSpring = t.reduced ? ({ duration: 0 } as const) : ({ type: "spring", visualDuration: presets.sidebar.visualDuration, bounce: 0 } as const);
  const labelMotion = (index: number) => ({
    initial: false as const,
    animate: { opacity: collapsed ? 0 : 1, x: collapsed ? t.distance(-6) : 0 },
    transition: t.reduced
      ? { duration: 0.12, ease: "easeOut" as const }
      : { duration: collapsed ? presets.fade.exit : 0.18, ease: "easeOut" as const, delay: collapsed ? 0 : 0.05 + index * 0.018 },
  });
  let labelIndex = firstIndex;
  const tip = collapsed && !drawer;

  return (
    <div id={regionId} className="flex min-h-0 flex-1 flex-col gap-1">
      {header && (
        <m.div
          data-sidebar-header=""
          inert={collapsed}
          className="overflow-hidden whitespace-nowrap px-[17px] py-2 text-sm font-semibold text-(--color-on-surface)"
          {...labelMotion(labelIndex++)}
        >
          {typeof header === "function" ? header(state) : header}
        </m.div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden px-2">
        {groups.map((group, gi) => {
          const groupLabelId = `${uid}-g${gi}`;
          return (
            <div key={gi} className="flex flex-col gap-0.5">
              {group.label && (
                <m.p id={groupLabelId} className="h-6 px-[9px] text-xs whitespace-nowrap text-(--color-on-surface-muted)" {...labelMotion(labelIndex++)}>
                  {group.label}
                </m.p>
              )}
              <ul aria-labelledby={group.label ? groupLabelId : undefined} className="m-0 flex list-none flex-col gap-0.5 p-0">
                {group.items.map((item) => {
                  const current = item.id === currentId;
                  const idx = labelIndex++;
                  const common = {
                    "aria-current": current ? ("page" as const) : undefined,
                    // The name is explicit (label, then the badge) so the rail tooltip only describes it.
                    "aria-label": item.badge ? `${item.label}, ${item.badge}` : item.label,
                    className: cn(
                      itemBase,
                      drawer && coarseTarget,
                      current ? "font-semibold text-(--color-on-primary-container)" : "text-(--color-on-surface-variant) hover:bg-(--color-surface-container) hover:text-(--color-on-surface) active:bg-(--color-border-subtle)",
                      item.disabled && "cursor-not-allowed opacity-(--state-disabled-content) hover:bg-transparent active:bg-transparent",
                    ),
                  };
                  const body = (
                    <>
                      {current && (
                        <m.span
                          aria-hidden="true"
                          data-sidebar-indicator=""
                          layoutId={`${uid}-current`}
                          className="absolute inset-0 rounded-(--radius-md) bg-(--color-primary-container)"
                          transition={indicatorSpring}
                        />
                      )}
                      <span className="relative z-10 flex min-w-0 flex-1 items-center gap-3 transition-[scale] duration-75 ease-out group-active:scale-[0.97] motion-reduce:group-active:scale-100">
                        <span className="flex size-5 shrink-0 items-center justify-center">{item.icon}</span>
                        <m.span className="min-w-0 flex-1 truncate text-left whitespace-nowrap" {...labelMotion(idx)}>
                          {item.label}
                        </m.span>
                        {item.badge && (
                          <m.span
                            className="shrink-0 rounded-(--radius-sm) bg-(--color-primary) px-1.5 py-0.5 text-xs font-medium text-(--color-on-primary)"
                            {...labelMotion(idx)}
                          >
                            {item.badge}
                          </m.span>
                        )}
                      </span>
                    </>
                  );
                  const control = item.href ? (
                    <a
                      href={item.href}
                      {...common}
                      aria-disabled={item.disabled || undefined}
                      tabIndex={item.disabled ? -1 : undefined}
                      onClick={(e) => {
                        if (item.disabled) {
                          e.preventDefault();
                          return;
                        }
                        onChoose(item.id, item);
                      }}
                    >
                      {body}
                    </a>
                  ) : (
                    <button type="button" {...common} disabled={item.disabled} onClick={() => onChoose(item.id, item)}>
                      {body}
                    </button>
                  );
                  return <li key={item.id}>{drawer ? control : withTip(tip, item.label, control)}</li>;
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {footer && (
        <m.div
          data-sidebar-footer=""
          inert={collapsed}
          className="overflow-hidden whitespace-nowrap border-t border-(--color-border-subtle) px-[17px] pt-3 pb-1 text-sm text-(--color-on-surface-variant)"
          {...labelMotion(labelIndex++)}
        >
          {typeof footer === "function" ? footer(state) : footer}
        </m.div>
      )}
    </div>
  );
}

export function Sidebar({
  label,
  groups,
  currentId,
  onNavigate,
  collapsed: controlled,
  defaultCollapsed = false,
  onCollapsedChange,
  storageKey,
  toggleLabel,
  header,
  footer,
  drawerBelow = 768,
  drawerOpen = false,
  onDrawerOpenChange,
  drawerCloseLabel,
  className,
}: SidebarProps) {
  const uid = useId();
  const regionId = `${uid}-region`;
  const t = useMotionTier("direct");
  const tm = useMotionTier("momentum");
  const small = useMaxWidth(drawerBelow);
  const [inner, setInner] = useState(() => readStored(storageKey) ?? defaultCollapsed);
  const collapsed = controlled ?? inner;
  const opener = useRef<HTMLElement | null>(null);

  const setCollapsed = (next: boolean) => {
    if (controlled === undefined) setInner(next);
    writeStored(storageKey, next);
    onCollapsedChange?.(next);
  };

  // A controlled sidebar with a storageKey: tell the app what was saved, once, on load.
  useEffect(() => {
    if (controlled === undefined || !storageKey) return;
    const stored = readStored(storageKey);
    if (stored !== undefined && stored !== controlled) onCollapsedChange?.(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const widthSpring = t.reduced
    ? ({ duration: 0 } as const)
    : ({ type: "spring", visualDuration: presets.sidebar.visualDuration, bounce: presets.sidebar.bounce } as const);
  const toggleLabelMotion = {
    initial: false as const,
    animate: { opacity: collapsed ? 0 : 1, x: collapsed ? t.distance(-6) : 0 },
    transition: t.reduced ? { duration: 0.12, ease: "easeOut" as const } : { duration: collapsed ? presets.fade.exit : 0.18, ease: "easeOut" as const, delay: collapsed ? 0 : 0.05 },
  };

  if (small) {
    const closeDrawer = () => onDrawerOpenChange?.(false);
    return (
      <Dialog.Root open={drawerOpen} onOpenChange={onDrawerOpenChange}>
        <AnimatePresence>
          {drawerOpen && (
            <Dialog.Portal forceMount key="drawer">
              <Dialog.Overlay forceMount asChild>
                <m.div
                  data-sidebar-overlay=""
                  className="fixed inset-0 z-50 bg-[color-mix(in_srgb,var(--color-on-surface)_40%,transparent)]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { duration: tm.reduced ? 0.12 : 0.18, ease: "easeOut" } }}
                  exit={{ opacity: 0, transition: { duration: DRAWER_EXIT, ease: "easeIn" } }}
                />
              </Dialog.Overlay>
              <Dialog.Content
                forceMount
                asChild
                aria-describedby={undefined}
                onOpenAutoFocus={() => {
                  opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
                }}
                onCloseAutoFocus={(e) => {
                  e.preventDefault();
                  if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
                }}
              >
                <m.div
                  className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col gap-1 border-r border-(--color-border-subtle) bg-(--color-surface) py-2 shadow-(--elevation-4) outline-none"
                  initial={{ opacity: tm.reduced ? 0 : 1, x: tm.distance(-WIDTH_OPEN - 32) }}
                  animate={{ opacity: 1, x: 0, transition: tm.enter }}
                  exit={{ opacity: tm.reduced ? 0 : 1, x: tm.distance(-WIDTH_OPEN - 32), transition: { duration: DRAWER_EXIT, ease: "easeIn" } }}
                >
                  <Dialog.Title className="sr-only">{label}</Dialog.Title>
                  <div className="flex justify-end px-2">
                    <Dialog.Close asChild>
                      <button
                        type="button"
                        aria-label={drawerCloseLabel}
                        className={cn(
                          "kit-focus inline-flex size-10 items-center justify-center rounded-(--radius-control) text-(--color-on-surface-variant) transition-[scale,background-color] duration-75 ease-out hover:bg-(--color-surface-container) active:scale-[0.97] active:bg-(--color-border-subtle) motion-reduce:active:scale-100",
                          coarseTarget,
                        )}
                      >
                        <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                          <path d="M5 5l10 10M15 5L5 15" />
                        </svg>
                      </button>
                    </Dialog.Close>
                  </div>
                  <nav aria-label={label} className="flex min-h-0 flex-1 flex-col">
                    <SidebarBody
                      uid={uid}
                      groups={groups}
                      currentId={currentId}
                      collapsed={false}
                      drawer
                      t={t}
                      header={header}
                      footer={footer}
                      regionId={regionId}
                      firstIndex={0}
                      onChoose={(id, item) => {
                        item.onSelect?.();
                        onNavigate?.(id);
                        closeDrawer();
                      }}
                    />
                  </nav>
                </m.div>
              </Dialog.Content>
            </Dialog.Portal>
          )}
        </AnimatePresence>
      </Dialog.Root>
    );
  }

  return (
    <TooltipProvider>
      <m.nav
        aria-label={label}
        className={cn(
          "flex h-full shrink-0 flex-col gap-1 overflow-hidden rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-surface) py-2",
          className,
        )}
        initial={false}
        animate={{ width: collapsed ? WIDTH_RAIL : WIDTH_OPEN }}
        transition={widthSpring}
      >
        <div className="px-2">
          {withTip(
            collapsed,
            toggleLabel,
            <button
              type="button"
              aria-label={toggleLabel}
              aria-expanded={!collapsed}
              aria-controls={regionId}
              onClick={() => setCollapsed(!collapsed)}
              className={cn(itemBase, "text-(--color-on-surface-variant) hover:bg-(--color-surface-container) active:bg-(--color-border-subtle)")}
            >
              <span className="relative z-10 flex items-center gap-3 transition-[scale] duration-75 ease-out group-active:scale-[0.97] motion-reduce:group-active:scale-100">
                <span className="flex size-5 shrink-0 items-center justify-center">
                  <ToggleIcon collapsed={collapsed} reduced={t.reduced} />
                </span>
                <m.span className="whitespace-nowrap" {...toggleLabelMotion}>
                  {toggleLabel}
                </m.span>
              </span>
            </button>,
          )}
        </div>
        <SidebarBody
          uid={uid}
          groups={groups}
          currentId={currentId}
          collapsed={collapsed}
          drawer={false}
          t={t}
          header={header}
          footer={footer}
          regionId={regionId}
          firstIndex={1}
          onChoose={(id, item) => {
            item.onSelect?.();
            onNavigate?.(id);
          }}
        />
      </m.nav>
    </TooltipProvider>
  );
}
