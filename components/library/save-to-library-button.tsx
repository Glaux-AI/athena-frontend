"use client";

/**
 * SaveToLibraryButton - the ONE small subtle save affordance (locked decision
 * §12.4): an icon-only button that opens the prefilled PublishArtifactSheet.
 * Shared across chat messages, pins, attachment chips, and cockpit artifact
 * cards; callers pass their hover-reveal classes, the affordance itself never
 * nudges or banners.
 */

import { useState } from "react";
import { BookmarkPlus } from "lucide-react";

import {
  PublishArtifactSheet,
  type PublishSource,
} from "@/components/library/publish-artifact-sheet";
import { cn } from "@/lib/cn";

export function SaveToLibraryButton({
  source,
  className,
}: {
  source: PublishSource;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Save to Library"
        title="Save to Library"
        onClick={() => setOpen(true)}
        className={cn(
          "rounded p-1 text-[var(--text-subtle)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          className,
        )}
      >
        <BookmarkPlus className="size-3.5" aria-hidden />
      </button>
      {open && (
        <PublishArtifactSheet open={open} onClose={() => setOpen(false)} source={source} />
      )}
    </>
  );
}
