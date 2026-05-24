/**
 * ScopeHeader — the only canonical home for identity + freshness.
 *
 * Per ADR-073 §4 (zero-duplication canonical-home rule): this component
 * is the only place in the UI that may render:
 *   - the scope's name + slug
 *   - the scope's one-line description
 *   - identity chips (owner, role, edition, etc.)
 *   - the freshness pill
 *
 * Counts (nodes / edges / files / decisions / etc.) do NOT live here —
 * those are the Topology tab header's job. KPI tiles for counts at the
 * top of a page were the root of the "duplicated counts" complaint;
 * they no longer exist.
 *
 * Layout: title + slug (left) | identity chips + freshness pill (right).
 */

import { type ReactNode } from "react";

import { Cluster, Stack } from "@/components/layout/primitives";
import { FreshnessPill, type FreshnessState } from "@/components/scope/freshness-pill";
import { cn } from "@/lib/cn";

export interface IdentityChip {
  label: string;
  value: string;
  /** Optional tooltip. */
  title?: string | undefined;
}

export interface ScopeHeaderProps {
  scope: "org" | "capability" | "repo";
  /** Display name (org name, capability name, repo full_name). */
  name: string;
  /** Slug or stable id rendered as a small mono chip next to the name. */
  slug?: string | null | undefined;
  /** One-line orientation prose under the name. */
  description?: string | null | undefined;
  /** Small chips: owner, role, edition, primary language, etc. Render in
   *  order, right-aligned. Keep to 3–4 max for visual calm. */
  chips?: IdentityChip[] | undefined;
  /** Freshness state — drives the pill. Pass `no_data` if the scope was
   *  never synced. */
  freshness?: FreshnessState | undefined;
  /** Optional freshness detail (e.g. "5 commits behind"); replaces the
   *  pill's default label when present. */
  freshnessDetail?: string | undefined;
  /** Optional freshness tooltip (e.g. last-sync ISO). */
  freshnessTitle?: string | undefined;
  /** Optional right-aligned action slot (e.g. "Sync now" button). */
  actions?: ReactNode | undefined;
  className?: string | undefined;
}

export function ScopeHeader({
  scope,
  name,
  slug,
  description,
  chips,
  freshness,
  freshnessDetail,
  freshnessTitle,
  actions,
  className,
}: ScopeHeaderProps) {
  return (
    <header
      className={cn("flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between", className)}
      data-scope={scope}
    >
      <Stack gap="1" className="min-w-0">
        <Cluster gap="2" align="baseline">
          <h1 className="text-2xl font-semibold tracking-tight truncate" title={name}>
            {name}
          </h1>
          {slug && (
            <code className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-subtle)]">
              {slug}
            </code>
          )}
        </Cluster>
        {description && (
          <p className="text-sm text-[var(--text-muted)] max-w-prose">{description}</p>
        )}
      </Stack>

      <Cluster gap="2" align="center" className="shrink-0 lg:justify-end">
        {chips?.map((c) => (
          <span
            key={`${c.label}-${c.value}`}
            className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]"
            title={c.title}
          >
            <span className="font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{c.label}</span>
            <span className="font-medium text-[var(--text)]">{c.value}</span>
          </span>
        ))}
        {freshness && (
          <FreshnessPill
            state={freshness}
            {...(freshnessDetail !== undefined ? { detail: freshnessDetail } : {})}
            {...(freshnessTitle !== undefined ? { title: freshnessTitle } : {})}
          />
        )}
        {actions}
      </Cluster>
    </header>
  );
}
