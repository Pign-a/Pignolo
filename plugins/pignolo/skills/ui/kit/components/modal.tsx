/**
 * Modal and ConfirmModal: a short, infrequent task or decision that blocks the flow.
 * Use when: a form of under 5 inputs, or a decision that is serious or irreversible.
 * Routine news belongs in a toast; long forms belong on a page. Prefer Undo to asking.
 * Tier: direct (0.22 s, bounce 0) to enter; the exit is 0.16 s, not the 0.1 s of a control: a
 *   large overlay leaves in 150 to 180 ms.
 * Primitive: @radix-ui/react-dialog (focus trap, aria-modal, Esc, scroll lock, focus return),
 *   mounted through AnimatePresence + forceMount so the exit can play.
 * Motion: backdrop fades (0.18 s in, 0.16 s out); the panel enters from scale 0.96, 8 px below, and
 *   leaves faster (scale 0.96, 4 px, 0.16 s). Transform and opacity only. Reopening mid exit
 *   retargets the spring. Reduced motion: cross-fade only (0.12 s in, 0.1 s out), no scale or travel.
 * ResponsiveDialog: the same props; a centered Modal on a wide screen with a fine pointer, the kit
 *   BottomSheet below 640 px or when the primary pointer is coarse. In the sheet the footer buttons
 *   stack full width with the primary first and the error shows above them.
 * Layout: the body scrolls when it is taller than the viewport and clips what sticks out of its box, so it
 *   has 8 px of bottom padding (and 24 px at the sides): the focus ring of the last control (4 px outside
 *   the control) is never cut. Checked in the interaction test with a bounding box assertion.
 * States: panel open/closed, buttons rest/hover/focus-visible/press (0.97 in 75 ms)/loading/
 *   disabled, close button hover/focus-visible, error message above the footer. The loading
 *   spinner spins, and pulses under reduced motion.
 * Keyboard: focus moves into the dialog and is trapped; Esc and the X close; Tab cycles;
 *   ConfirmModal focuses Cancel when destructive, the confirm button otherwise; focus
 *   returns to the opener after the exit. `preventDismiss` turns off Esc and outside click.
 * Copy props: title, description, children, footer, closeLabel, confirmLabel, cancelLabel,
 *   error. Footer order is Cancel then the primary, right aligned, never Yes/No.
 */
"use client";

import { useRef, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { cn } from "../lib/cn";
import { coarseTarget, pressClass, useMotionTier } from "../motion";
import { BottomSheet } from "./bottom-sheet";

/** A large overlay leaves in 150 to 180 ms. */
const MODAL_EXIT = 0.16;
const sizes = { sm: "max-w-[400px]", md: "max-w-[480px]", lg: "max-w-[640px]" } as const;

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Short verb phrase naming the object, for example "Eliminar proyecto". */
  title: string;
  /** What is lost and whether undo exists. Up to 3 lines. */
  description?: string;
  /** Optional form or content. */
  children?: ReactNode;
  /** Buttons row, right aligned. Use `ModalButton`. */
  footer?: ReactNode;
  /** Accessible name of the X button. */
  closeLabel: string;
  size?: keyof typeof sizes;
  /** Error message above the footer. Entered values stay. */
  error?: string;
  /** Turns off Esc and outside click (unsaved changes). The X still closes. */
  preventDismiss?: boolean;
  /** Element to focus on open. Default: first tabbable inside. */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" className="animate-spin motion-reduce:animate-pulse" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M10 3a7 7 0 1 0 7 7" />
    </svg>
  );
}

export interface ModalButtonProps extends Omit<React.ComponentPropsWithoutRef<"button">, "children"> {
  variant?: "primary" | "secondary" | "danger";
  /** Spinner replaces nothing: it sits before the label, width stays. Click is ignored while loading. */
  loading?: boolean;
  children: ReactNode;
  ref?: RefObject<HTMLButtonElement | null>;
}

const buttonBase =
  "kit-focus inline-flex min-h-10 items-center justify-center gap-2 rounded-(--radius-control) px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-(--state-disabled-content) aria-disabled:cursor-progress";
const buttonVariants = {
  primary: "bg-(--color-primary) text-(--color-on-primary) hover:bg-(--color-primary-hover) active:bg-(--color-primary-pressed)",
  secondary:
    "border border-(--color-outline) bg-transparent text-(--color-on-surface) hover:bg-(--color-surface-container) active:bg-(--color-border-subtle)",
  danger:
    "bg-(--color-error) text-(--color-on-error) hover:bg-[color-mix(in_srgb,var(--color-error)_85%,var(--color-on-surface))] active:bg-[color-mix(in_srgb,var(--color-error)_72%,var(--color-on-surface))]",
} as const;

/** Button for modal footers: primary, secondary, danger; loading keeps focus (aria-disabled). */
export function ModalButton({ variant = "secondary", loading = false, className, children, onClick, ref, type = "button", ...rest }: ModalButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      aria-disabled={loading || undefined}
      onClick={(e) => {
        if (loading) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      className={cn(buttonBase, buttonVariants[variant], !loading && !rest.disabled && pressClass, coarseTarget, className)}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  closeLabel,
  size = "md",
  error,
  preventDismiss = false,
  initialFocusRef,
}: ModalProps) {
  const t = useMotionTier("direct");
  const opener = useRef<HTMLElement | null>(null);
  const stop = preventDismiss ? (e: Event) => e.preventDefault() : undefined;
  const backdropEnter = { duration: t.reduced ? 0.12 : 0.18, ease: "easeOut" } as const;
  const exit = t.reduced ? t.exit : ({ duration: MODAL_EXIT, ease: "easeIn" } as const);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount key="modal">
            <Dialog.Overlay forceMount asChild>
              <m.div
                className="fixed inset-0 z-50 bg-[color-mix(in_srgb,var(--color-on-surface)_40%,transparent)]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: backdropEnter }}
                exit={{ opacity: 0, transition: exit }}
              />
            </Dialog.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-4">
              <Dialog.Content
                forceMount
                asChild
                {...(description ? {} : { "aria-describedby": undefined })}
                onEscapeKeyDown={stop}
                onPointerDownOutside={stop}
                onInteractOutside={stop}
                onOpenAutoFocus={(e) => {
                  // No Dialog.Trigger here (the app owns `open`), so remember the opener and give focus back on close.
                  opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
                  if (initialFocusRef) {
                    e.preventDefault();
                    initialFocusRef.current?.focus({ preventScroll: true });
                  }
                }}
                onCloseAutoFocus={(e) => {
                  e.preventDefault();
                  if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
                }}
              >
                <m.div
                  className={cn(
                    "pointer-events-auto relative flex max-h-[calc(100dvh-2rem)] w-full flex-col rounded-(--radius-xl) border border-(--color-border-subtle) bg-(--color-surface) shadow-(--elevation-4) outline-none",
                    sizes[size],
                  )}
                  initial={{ opacity: 0, y: t.distance(8), scale: t.scaleFrom(0.96) }}
                  animate={{ opacity: 1, y: 0, scale: 1, transition: t.enter }}
                  exit={{ opacity: 0, y: t.distance(4), scale: t.scaleFrom(0.96), transition: exit }}
                >
                  <div className="flex flex-col gap-1.5 px-6 pt-6 pr-14">
                    <Dialog.Title className="text-lg font-semibold tracking-tight text-(--color-on-surface)">{title}</Dialog.Title>
                    {description && (
                      <Dialog.Description className="text-sm leading-relaxed text-(--color-on-surface-variant)">{description}</Dialog.Description>
                    )}
                  </div>
                  {/* The body scrolls, so it clips anything outside its box. The bottom padding (8 px) keeps the 4 px focus ring of the last control inside it. */}
                  {children && <div className="kit-scroll min-h-0 overflow-y-auto px-6 pt-4 pb-2">{children}</div>}
                  {error && (
                    <p role="alert" className="mx-6 mt-4 flex items-start gap-2 text-sm text-(--color-error)">
                      <span aria-hidden="true" className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-(--radius-sm) bg-(--color-error) text-xs font-bold leading-none text-(--color-on-error)">
                        !
                      </span>
                      {error}
                    </p>
                  )}
                  {footer && <div className={cn("flex flex-wrap justify-end gap-3 px-6 pb-6", children ? "pt-4" : "pt-6")}>{footer}</div>}
                  {!footer && <div className="pb-6" />}
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      aria-label={closeLabel}
                      className={cn(
                        "kit-focus absolute top-3 right-3 inline-flex size-10 items-center justify-center rounded-(--radius-control) text-(--color-on-surface-variant) transition-[scale,background-color] duration-75 ease-out hover:bg-(--color-surface-container) active:scale-[0.97] active:bg-(--color-border-subtle) motion-reduce:active:scale-100",
                        coarseTarget,
                      )}
                    >
                      <CloseIcon />
                    </button>
                  </Dialog.Close>
                </m.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

export interface ConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What is lost, and whether undo exists. */
  description: string;
  /** Outcome label that matches the title, for example "Eliminar proyecto". */
  confirmLabel: string;
  /** For example "Conservar proyecto". Never "No". */
  cancelLabel: string;
  closeLabel: string;
  /** Called on confirm. Close the modal yourself when done; while `loading` it stays open. */
  onConfirm: () => void;
  /** Destructive: danger button, focus starts on Cancel. */
  destructive?: boolean;
  loading?: boolean;
  error?: string;
}

export function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  closeLabel,
  onConfirm,
  destructive = false,
  loading = false,
  error,
}: ConfirmModalProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      closeLabel={closeLabel}
      size="sm"
      error={error}
      initialFocusRef={destructive ? cancelRef : confirmRef}
      footer={
        <>
          <ModalButton ref={cancelRef} variant="secondary" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </ModalButton>
          <ModalButton ref={confirmRef} variant={destructive ? "danger" : "primary"} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </ModalButton>
        </>
      }
    />
  );
}

const SMALL = "(max-width: 639px), (pointer: coarse)";
const subscribeSmall = (cb: () => void) => {
  const q = window.matchMedia(SMALL);
  q.addEventListener("change", cb);
  return () => q.removeEventListener("change", cb);
};

export type ResponsiveDialogProps = ModalProps;

/**
 * The same dialog in the right shape: a centered Modal on a wide screen with a fine pointer, the
 * BottomSheet below 640 px or when the primary pointer is coarse (a thumb reaches the bottom).
 * `size` only applies to the Modal. In the sheet the footer buttons stack full width, primary first.
 */
export function ResponsiveDialog(props: ResponsiveDialogProps) {
  const sheet = useSyncExternalStore(subscribeSmall, () => window.matchMedia(SMALL).matches, () => false);
  if (!sheet) return <Modal {...props} />;
  const { open, onOpenChange, title, description, children, footer, closeLabel, error, preventDismiss, initialFocusRef } = props;
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      closeLabel={closeLabel}
      preventDismiss={preventDismiss}
      initialFocusRef={initialFocusRef}
      footer={
        error || footer ? (
          <>
            {error && (
              <p role="alert" className="flex items-start gap-2 text-sm text-(--color-error)">
                <span aria-hidden="true" className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-(--radius-sm) bg-(--color-error) text-xs font-bold leading-none text-(--color-on-error)">
                  !
                </span>
                {error}
              </p>
            )}
            {footer && <div className="flex flex-col-reverse gap-2 [&>*]:w-full">{footer}</div>}
          </>
        ) : undefined
      }
    >
      {children}
    </BottomSheet>
  );
}
