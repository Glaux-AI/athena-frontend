"use client";

/**
 * ViewsBar - the row of board-view chips above the toolbar. Built-in smart
 * views (Athena-seeded) plus the user's personal saved views; clicking one
 * applies its slice, the matching one is highlighted, and personal views carry
 * a delete affordance. "Save view" snapshots the current filters under a name.
 */

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Bookmark, Plus, X } from "lucide-react";

import { cn } from "@/lib/cn";
import type { BoardFilters } from "@/components/board/board-toolbar";
import {
  BUILTIN_VIEWS,
  type SavedView,
  viewMatches,
} from "@/lib/work/saved-views";

export function ViewsBar({
  filters,
  savedViews,
  onApply,
  onSave,
  onDelete,
}: {
  filters: BoardFilters;
  savedViews: SavedView[];
  onApply: (config: Partial<BoardFilters>) => void;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 pr-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
        <Bookmark className="size-3" aria-hidden />
        Views
      </span>
      {BUILTIN_VIEWS.map((v) => (
        <ViewChip
          key={v.id}
          label={v.name}
          active={viewMatches(filters, v.config)}
          onClick={() => onApply(v.config)}
        />
      ))}
      {savedViews.map((v) => (
        <ViewChip
          key={v.id}
          label={v.name}
          active={viewMatches(filters, v.config)}
          onClick={() => onApply(v.config)}
          onDelete={() => onDelete(v.id)}
        />
      ))}
      <SaveViewButton onSave={onSave} />
    </div>
  );
}

function ViewChip({
  label,
  active,
  onClick,
  onDelete,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  onDelete?: () => void;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border text-xs transition-colors",
        active
          ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
          : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cn(
          "rounded-full px-2.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          onDelete && "pr-1",
        )}
      >
        {label}
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete view ${label}`}
          className="mr-1 rounded-full p-0.5 text-[var(--text-subtle)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <X className="size-3" aria-hidden />
        </button>
      )}
    </span>
  );
}

function SaveViewButton({ onSave }: { onSave: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setName("");
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-subtle)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <Plus className="size-3" aria-hidden />
          Save view
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="glass animate-modal-in z-50 w-64 rounded-lg border border-[var(--border)] p-2 shadow-[var(--shadow-3)] focus:outline-none"
        >
          <form onSubmit={submit} className="flex flex-col gap-2">
            <label className="text-[11px] font-medium text-[var(--text-muted)]">
              Save the current filters as a view
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Payments at risk"
              autoFocus
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
            <button
              type="submit"
              disabled={name.trim() === ""}
              className="self-end rounded-md bg-[var(--primary)] px-2.5 py-1 text-xs font-medium text-[var(--primary-fg)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
            >
              Save
            </button>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
