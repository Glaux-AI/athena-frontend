"use client";

/**
 * SearchTrigger - the subtle "Search" button in the TopBar that opens the
 * global ⌘K command palette (search / jump to anything across the app).
 * Dispatches the same global keydown the palette listens for (so this
 * trigger and the keyboard shortcut share one open-path).
 *
 * The kbd chip shows the platform's real chord: ⌘K on Apple hardware,
 * Ctrl K everywhere else. Detected after mount (SSR renders the ⌘ default,
 * then corrects) so server and first client paint agree - no hydration
 * mismatch.
 *
 * Hidden on small screens - mobile users use the existing nav button
 * (no dedicated mobile UX here, keep simple per the task constraints).
 */

import { useEffect, useState } from "react";
import { Command, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function SearchTrigger({ className }: { className?: string }) {
  const [isMac, setIsMac] = useState(true);

  useEffect(() => {
    const ua = `${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`;
    setIsMac(/mac|iphone|ipad|ipod/i.test(ua));
  }, []);

  const chord = isMac ? "⌘K" : "Ctrl K";

  return (
    <Button
      variant="secondary"
      size="sm"
      aria-label={`Search (${chord})`}
      title={`Search & jump to anything (${chord})`}
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
      <kbd className="ml-1 hidden items-center gap-0.5 rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-micro text-[var(--text-subtle)] sm:inline-flex">
        {isMac ? (
          <>
            <Command className="size-3" aria-hidden />K
          </>
        ) : (
          "Ctrl K"
        )}
      </kbd>
    </Button>
  );
}
