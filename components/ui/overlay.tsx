"use client";

/**
 * <Modal> + <ConfirmDialog> - the shared overlay chrome.
 *
 * Wraps Radix Dialog (focus-trap, scroll-lock, Esc, overlay-click-close,
 * and aria Title/Description wiring - all free) and dresses it in the
 * Nightglass sheet tier: `.glass-sheet` (24px blur, denser fill, glint).
 * The scrim carries a faint starfield - dimming the app literally reveals
 * the night sky behind it.
 *
 * <ConfirmDialog> is the one destructive-action grammar: it replaces
 * window.confirm(), inline danger panels, and bespoke type-the-slug dialogs.
 *
 * Controlled: pass `open` + `onClose`. Enter animations live in globals.css
 * (Tailwind v4 has no @config here) and collapse under prefers-reduced-motion
 * via the global rule.
 */

import { useEffect, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/cn";
import { Button } from "./button";
import { inputFocus } from "./focus";

const MODAL_SIZE = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
} as const;

function Overlay() {
  return (
    <Dialog.Overlay className="animate-overlay-in fixed inset-0 z-[var(--z-overlay)] bg-[var(--overlay)] backdrop-blur-sm">
      <span className="starfield opacity-50" aria-hidden="true" />
    </Dialog.Overlay>
  );
}

function Header({
  title,
  description,
}: {
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Dialog.Title className="text-base font-semibold text-[var(--text)]">
          {title}
        </Dialog.Title>
        {description != null && (
          <Dialog.Description className="mt-1 text-xs text-[var(--text-muted)]">
            {description}
          </Dialog.Description>
        )}
      </div>
      <Dialog.Close asChild>
        <button
          type="button"
          aria-label="Close"
          className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-[var(--text-subtle)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <X className="size-4" aria-hidden />
        </button>
      </Dialog.Close>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof MODAL_SIZE;
  className?: string;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Overlay />
        <Dialog.Content
          // Opt out of Radix's describedby requirement when no description is
          // rendered (avoids the dev warning); auto-wired when one is present.
          {...(description == null ? { "aria-describedby": undefined } : {})}
          className={cn(
            "glass-sheet animate-modal-in fixed left-1/2 top-1/2 z-[var(--z-overlay)] flex max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col focus:outline-none",
            MODAL_SIZE[size],
            className,
          )}
        >
          <div className="px-5 pt-5">
            <Header title={title} description={description} />
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer != null && (
            <div className="flex justify-end gap-2 px-5 pb-4 pt-1">
              <hr className="hr-horizon absolute left-5 right-5 -mt-1" aria-hidden />
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * ConfirmDialog - the one destructive/consequential-action confirm.
 * `typeToConfirm` (e.g. the org slug) gates the button for irreversible acts.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  body,
  tone = "danger",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  typeToConfirm,
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Optional extra content between description and actions. */
  body?: ReactNode;
  tone?: "danger" | "warning" | "default";
  confirmLabel?: string;
  cancelLabel?: string;
  /** Require typing this exact string before confirm enables. */
  typeToConfirm?: string;
  loading?: boolean;
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);
  const blocked = typeToConfirm != null && typed !== typeToConfirm;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "destructive" : "primary"}
            size="sm"
            onClick={onConfirm}
            disabled={blocked}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {body}
        {typeToConfirm != null && (
          <label className="flex flex-col gap-1.5 text-xs text-[var(--text-muted)]">
            <span>
              Type <span className="font-mono font-semibold text-[var(--text)]">{typeToConfirm}</span> to confirm
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className={cn(
                "input-bare h-9 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] transition-[border-color,box-shadow]",
                inputFocus,
              )}
            />
          </label>
        )}
      </div>
    </Modal>
  );
}
