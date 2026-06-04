"use client";

/**
 * SearchTrigger — the subtle "Search" button in the TopBar that opens
 * the Cmd-K knowledge palette. Dispatches the same global keydown the
 * palette listens for (so this trigger and the keyboard shortcut share
 * one open-path).
 *
 * Hidden on small screens — mobile users use the existing nav button
 * (no dedicated mobile UX here, keep simple per the task constraints).
 */

import { Command, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function SearchTrigger({ className }: { className?: string }) {
  return (
    <Button
      variant="secondary"
      size="sm"
      aria-label="Open knowledge search (⌘K)"
      title="Search knowledge graph (⌘K)"
      className={cn("text-[var(--text-muted)]", className)}
      onClick={() => {
        // Mirror the global Cmd-K shortcut so the trigger and the
        // keyboard shortcut share one open-path. We synthesise the
        // same KeyboardEvent the palette listens for.
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "k", metaKey: true }),
        );
      }}
    >
      <Search className="size-4" aria-hidden />
      <span className="hidden sm:inline">Search</span>
      <kbd className="ml-1 hidden items-center gap-0.5 rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-subtle)] sm:inline-flex">
        <Command className="size-3" aria-hidden />K
      </kbd>
    </Button>
  );
}
