"use client";

/**
 * SettingsPageHeader — the shared page-level header for every
 * `/settings/*` surface.
 *
 * The first depth sweep left settings pages with a bare `h1` + muted
 * paragraph, which read flat against the dense forms below. This gives
 * every settings page the same considered page header the rest of the
 * app uses: a subtle gradient band + inner-highlight + a hairline
 * divider (mirrors the gold-standard `phase-document-shell` header band),
 * with an optional right-aligned action slot.
 *
 * Presentation only — it takes a title, optional subtitle, and optional
 * action node. No data, no behavior.
 */

import { type ReactNode } from "react";

import { Cluster, Stack } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";

interface SettingsPageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned header action (e.g. an "Add" CTA or a status badge). */
  action?: ReactNode;
  /** Heading element + size. Defaults to an `h1` at the page scale. */
  as?: "h1" | "h2";
  className?: string;
}

export function SettingsPageHeader({
  title,
  subtitle,
  action,
  as = "h1",
  className,
}: SettingsPageHeaderProps) {
  const Heading = as;
  return (
    <Cluster
      justify="between"
      align="start"
      gap="3"
      as="header"
      className={cn(
        "rounded-t-lg border-b border-[var(--border)] bg-gradient-to-b from-[var(--surface-2)] to-transparent px-1 pb-4 pt-1 shadow-[var(--inner-highlight)]",
        className,
      )}
    >
      <Stack gap="1" className="min-w-0">
        <Heading
          className={cn(
            "tracking-tight",
            as === "h1" ? "text-2xl font-semibold" : "text-xl font-semibold",
          )}
        >
          {title}
        </Heading>
        {subtitle ? (
          <p className="text-sm text-[var(--text-muted)]">{subtitle}</p>
        ) : null}
      </Stack>
      {action ? <div className="shrink-0">{action}</div> : null}
    </Cluster>
  );
}
