"use client";

/**
 * SettingsPageHeader - the shared page-level header for every
 * `/settings/*` surface.
 *
 * Nightglass: title + subtitle sit flush to the page content edge (so
 * they align with the cards below), the header closes with an
 * `.hr-horizon` hairline instead of a border, and a low-opacity static
 * starfield band decorates the header itself - the sanctioned L2
 * treatment for a page header (dense content below stays L0).
 *
 * Presentation only - it takes a title, optional subtitle, and optional
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
  /** Render the starfield band behind the header (default on). */
  decorated?: boolean;
  className?: string;
}

export function SettingsPageHeader({
  title,
  subtitle,
  action,
  as = "h1",
  decorated = true,
  className,
}: SettingsPageHeaderProps) {
  const Heading = as;
  return (
    <header className={cn("relative overflow-hidden", className)}>
      {decorated && <div className="starfield opacity-40" aria-hidden="true" />}
      <Cluster justify="between" align="start" gap="3" className="relative pb-5">
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
      <hr className="hr-horizon relative" aria-hidden="true" />
    </header>
  );
}
