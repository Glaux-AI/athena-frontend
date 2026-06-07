"use client";

/**
 * <Modal> / <SidePanel> — the shared overlay chrome for the Task surface.
 *
 * Both wrap Radix Dialog (focus-trap, scroll-lock, Esc, overlay-click-close,
 * and aria Title/Description wiring — all free) and dress it in Athena tokens:
 * `<Modal>` is a centered glass card; `<SidePanel>` is an edge drawer. This is
 * the reusable replacement for the hand-rolled modal chrome (backdrop + Esc +
 * useId + focus juggling) the run-flow modals each re-implemented.
 *
 * Controlled: pass `open` + `onClose`. Enter animations live in globals.css
 * (Tailwind v4 has no @config here) and collapse under prefers-reduced-motion
 * via the global rule.
 */

import { type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/cn";

const MODAL_SIZE = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" } as const;
const PANEL_WIDTH = { sm: "sm:max-w-sm", md: "sm:max-w-md", lg: "sm:max-w-xl" } as const;

function Overlay() {
  return (
    <Dialog.Overlay className="animate-overlay-in fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-sm" />
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
            "glass animate-modal-in fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl shadow-[var(--shadow-3)] focus:outline-none",
            MODAL_SIZE[size],
            className,
          )}
        >
          <div className="px-5 pt-5">
            <Header title={title} description={description} />
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer != null && (
            <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function SidePanel({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  side = "right",
  width = "md",
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  side?: "right" | "left";
  width?: keyof typeof PANEL_WIDTH;
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
          {...(description == null ? { "aria-describedby": undefined } : {})}
          className={cn(
            "fixed inset-y-0 z-50 flex w-[calc(100vw-3rem)] flex-col bg-[var(--surface)] shadow-[var(--shadow-3)] focus:outline-none",
            side === "right"
              ? "animate-panel-in-right right-0 border-l border-[var(--border)]"
              : "animate-panel-in-left left-0 border-r border-[var(--border)]",
            PANEL_WIDTH[width],
            className,
          )}
        >
          <div className="border-b border-[var(--border)] px-5 py-4">
            <Header title={title} description={description} />
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer != null && (
            <div className="border-t border-[var(--border)] px-5 py-3">{footer}</div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
