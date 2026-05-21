"use client";

/**
 * TopBar — fixed 56px header. Hosts the Wordmark (+ Sophia), workspace
 * switcher, ⌘K trigger, notifications, avatar. See UX standard §6.
 */

import { Bell, Command, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/layout/wordmark";
import { cn } from "@/lib/cn";

export function TopBar({ className }: { className?: string }) {
  return (
    <header
      className={cn(
        "flex h-14 w-full shrink-0 items-center justify-between gap-3 border-b px-4",
        "border-[var(--border)] bg-[var(--surface)]",
        "sticky top-0 z-30",
        className
      )}
    >
      <div className="flex items-center gap-4">
        <Wordmark />
        <WorkspaceSwitcher />
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          aria-label="Open command palette (⌘K)"
          className="text-[var(--text-muted)]"
        >
          <Command className="size-4" />
          <span className="hidden sm:inline">Search</span>
          <kbd className="ml-1 hidden rounded border bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-subtle)] sm:inline">
            ⌘K
          </kbd>
        </Button>

        <Button variant="ghost" size="sm" aria-label="Notifications">
          <Bell className="size-4" />
        </Button>

        <UserMenuButton />
      </div>
    </header>
  );
}

function WorkspaceSwitcher() {
  return (
    <button
      type="button"
      className="hidden items-center gap-1.5 rounded-md px-2 py-1 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] md:inline-flex"
    >
      <span className="inline-flex size-5 items-center justify-center rounded bg-[var(--primary-soft)] text-[10px] font-semibold text-[var(--primary)]">
        AD
      </span>
      <span className="font-medium text-[var(--text)]">Athena Dev</span>
      <ChevronDown className="size-3.5 text-[var(--text-subtle)]" />
    </button>
  );
}

function UserMenuButton() {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      aria-label="Open user menu"
    >
      <span className="inline-flex size-7 items-center justify-center rounded-full bg-[var(--primary)] text-xs font-semibold text-[var(--primary-fg)]">
        D
      </span>
    </button>
  );
}
