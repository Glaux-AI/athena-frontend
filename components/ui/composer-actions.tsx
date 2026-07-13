"use client";

/**
 * <ComposerActionsMenu> - the composer's "+" menu.
 *
 * Replaces the bare paperclip button: a single "+" trigger opens a small
 * popover holding the per-turn composer actions. Today that is "Attach files"
 * (which opens the file dialog, owning the hidden <input> the old
 * AttachmentButton held), a "Web search" toggle that, when on, lets Athena
 * search the public web for the turn, and - when the org unlocked it and the
 * picked model is vision-capable - an "Optical compression" toggle that sends
 * older bulky tool results as page images to save tokens. The trigger shows an
 * accent dot while any of these is armed, so state is legible with the menu
 * closed.
 *
 * Presentational + controlled: the host owns `webSearch` / `onToggleWebSearch`,
 * the optical toggle (`optical` / `onToggleOptical`, shown only when
 * `opticalAvailable`), and the upload drafts (`onFiles`), exactly like the
 * effort / model pickers. Tokens-only; Radix Popover gives focus + Esc-to-close
 * (matching <EffortSelector>). Image attachment stays vision-gated via
 * `canAttachImages`.
 */

import { useRef, useState, type CSSProperties } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, Globe, ImageDown, Info, Paperclip, Plus } from "lucide-react";

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
  optical = false,
  onToggleOptical,
  opticalAvailable = false,
  disabled = false,
}: {
  onFiles: (files: FileList | File[]) => void;
  canAttachImages: boolean;
  webSearch: boolean;
  onToggleWebSearch: (next: boolean) => void;
  /** Per-turn optical-compression toggle. Only rendered when
   *  `opticalAvailable` (org unlocked it AND the picked model is a supported
   *  vision model). */
  optical?: boolean;
  onToggleOptical?: (next: boolean) => void;
  opticalAvailable?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // The trigger dot means "something is armed" - web search or optical.
  const armed = webSearch || (opticalAvailable && optical);

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
              armed ? "text-[var(--primary)]" : "text-[var(--text-muted)]",
            )}
          >
            <Plus className="size-4" />
            {armed && (
              <span
                aria-hidden
                className="star-dot absolute right-1 top-1"
                style={{ "--dot-color": "var(--primary)" } as CSSProperties}
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
              "glass-panel z-[var(--z-popover)] w-[17rem] p-1.5",
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

            {opticalAvailable && (
              <button
                type="button"
                onClick={() => onToggleOptical?.(!optical)}
                aria-pressed={optical}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
                  optical ? "bg-[var(--primary-soft)]" : "hover:bg-[var(--surface-2)]",
                )}
              >
                <ImageDown
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    optical ? "text-[var(--primary)]" : "text-[var(--text-subtle)]",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-sm font-medium text-[var(--text)]">
                    Optical compression
                    <OpticalInfoTip />
                  </span>
                  <span className="block text-xs text-[var(--text-muted)]">
                    {optical
                      ? "On - older bulky results ride as page images this turn"
                      : "Send older bulky results as images to save tokens"}
                  </span>
                </span>
                {optical && (
                  <Check className="mt-0.5 size-4 shrink-0 text-[var(--primary)]" aria-hidden />
                )}
              </button>
            )}
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

/** A small hover/focus info bubble explaining when optical compression helps.
 *  Nested inside the toggle button, so it stops click/keydown from
 *  propagating to the parent (opening the tip must not flip the toggle). */
function OpticalInfoTip() {
  const [open, setOpen] = useState(false);
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        role="button"
        tabIndex={0}
        aria-label="When does optical compression help?"
        onClick={stop}
        onKeyDown={stop}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex text-[var(--text-subtle)] outline-none hover:text-[var(--text)]"
      >
        <Info className="size-3.5" aria-hidden />
      </span>
      {open && (
        <span
          role="tooltip"
          className={cn(
            "glass-panel absolute bottom-full left-1/2 z-[var(--z-tooltip)] mb-1.5 w-72 -translate-x-1/2 p-3",
            "text-xs leading-relaxed text-[var(--text-muted)]",
          )}
        >
          <span className="mb-1 block font-medium text-[var(--text)]">
            Best for long, tool-heavy conversations
          </span>
          Renders older bulky tool results (file reads, logs, search dumps) as
          images, which cost fewer tokens than the same text. Biggest savings on
          long runs that reread lots of context.
          <span className="mt-1.5 block text-[var(--text-subtle)]">
            Works on any vision model (including your own API keys). Claude
            reads imaged text most reliably; smaller or older vision models
            less so. Exact strings (IDs, hashes) always stay text.
          </span>
        </span>
      )}
    </span>
  );
}
