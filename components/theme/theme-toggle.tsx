"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "@/components/theme/theme-provider";

import { cn } from "@/lib/cn";

/** 3-mode theme cycle: system → light → dark → system. Default is system. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <span aria-hidden className={cn("inline-block size-8", className)} />;
  }

  const current = theme ?? "system";
  const next = current === "system" ? "light" : current === "light" ? "dark" : "system";
  const label = current === "system" ? "System" : current === "light" ? "Light" : "Dark";
  const Icon = current === "system" ? Monitor : current === "light" ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${label}. Click to switch to ${next}.`}
      title={`Theme: ${label} · click for ${next}`}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        className,
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}
