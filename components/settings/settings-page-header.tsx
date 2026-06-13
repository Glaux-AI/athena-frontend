"use client";

/**
 * SettingsPageHeader - the shared page-level header for every
 * `/settings/*` surface.
 *
 * A clean, consistent page header for every settings surface: title +
 * subtitle sit flush to the page content edge (so they align with the
 * cards below), with a hairline bottom divider for separation and an
 * optional right-aligned action slot. The card-style gradient header
 * band stays where it belongs - inside framed `Card` panels (see the
 * gold-standard `phase-document-shell`) - not on a frameless page header.
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
        "border-b border-[var(--border)] pb-5",
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
