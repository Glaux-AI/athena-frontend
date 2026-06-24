"use client";

/**
 * <ComposerActionsMenu> - the composer's "+" menu.
 *
 * Replaces the bare paperclip button: a single "+" trigger opens a small
 * popover holding the per-turn composer actions. Today that is "Attach files"
 * (which opens the file dialog, owning the hidden <input> the old
 * AttachmentButton held) and a "Web search" toggle that, when on, lets Athena
 * search the public web for the turn. The trigger shows an accent dot while web
 * search is armed, so the state is legible with the menu closed.
 *
 * Presentational + controlled: the host owns `webSearch` / `onToggleWebSearch`
 * and the upload drafts (`onFiles`), exactly like the effort / model pickers.
 * Tokens-only; Radix Popover gives focus + Esc-to-close (matching
 * <EffortSelector>). Image attachment stays vision-gated via `canAttachImages`.
 */

import { useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, Globe, Paperclip, Plus } from "lucide-react";

import { cn } from "@/lib/cn";

/** Documents the BE parses + images the BE can hand a vision model. Kept in
 *  sync with the same lists in attachment-picker.tsx. */
const DOC_ACCEPT =
  ".pdf,.docx,.txt,.md,.csv,.json,application/pdf,text/plain,text/markdown,text/csv,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const IMAGE_ACCEPT = "image/png,image/jpeg,image/gif,image/webp";

function acceptFor(canAttachImages: boolean): string {
  return canAttachImages ? `${IMAGE_ACCEPT},${DOC_ACCEPT}` : DOC_ACCEPT;
}

export function ComposerActionsMenu({
  onFiles,
  canAttachImages,
  webSearch,
  onToggleWebSearch,
  disabled = false,
}: {
  onFiles: (files: FileList | File[]) => void;
  canAttachImages: boolean;
  webSearch: boolean;
  onToggleWebSearch: (next: boolean) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label="Add to message"
            title="Attach files or enable web search"
            className={cn(
              "relative inline-flex size-7 shrink-0 items-center justify-center rounded-lg border-transparent bg-transparent transition-colors",
              "hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50",
              "data-[state=open]:bg-[var(--surface-2)] data-[state=open]:text-[var(--text)]",
              webSearch ? "text-[var(--primary)]" : "text-[var(--text-muted)]",
            )}
          >
            <Plus className="size-4" />
            {webSearch && (
              <span
                aria-hidden
                className="absolute right-1 top-1 size-1.5 rounded-full bg-[var(--primary)]"
              />
            )}
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            align="start"
            side="top"
            sideOffset={8}
            className={cn(
              "glass z-50 w-[17rem] rounded-xl p-1.5 shadow-[var(--shadow-3)]",
              "animate-pop-in",
            )}
          >
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                inputRef.current?.click();
              }}
              className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-[var(--surface-2)]"
            >
              <Paperclip className="mt-0.5 size-4 shrink-0 text-[var(--text-subtle)]" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-[var(--text)]">Attach files</span>
                <span className="block text-xs text-[var(--text-muted)]">
                  {canAttachImages ? "Images and documents" : "Documents (pick a vision model for images)"}
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => onToggleWebSearch(!webSearch)}
              aria-pressed={webSearch}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
                webSearch ? "bg-[var(--primary-soft)]" : "hover:bg-[var(--surface-2)]",
              )}
            >
              <Globe
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  webSearch ? "text-[var(--primary)]" : "text-[var(--text-subtle)]",
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-[var(--text)]">Web search</span>
                <span className="block text-xs text-[var(--text-muted)]">
                  {webSearch
                    ? "On - Athena can search the web this turn"
                    : "Let Athena search the web for current info"}
                </span>
              </span>
              {webSearch && (
                <Check className="mt-0.5 size-4 shrink-0 text-[var(--primary)]" aria-hidden />
              )}
            </button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={acceptFor(canAttachImages)}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = ""; // allow re-selecting the same file
        }}
      />
    </>
  );
}
