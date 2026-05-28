/**
 * AdrsReferencedCard — renders the list of ADRs referenced by this repo's
 * code (resolved via the KG `documents` projection — see
 * `RepoKnowledge.adrs_referenced`).
 *
 * Each row links to `/decisions/{id}` — the unified detail page resolves
 * the id against org / capability / repo scope tables so the same target
 * works regardless of where the ADR lives.
 */

import Link from "next/link";
import { ScrollText } from "lucide-react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Stack, Cluster } from "@/components/layout/primitives";
import type { AdrRef } from "@/lib/api/client";

const STATUS_TONE: Record<AdrRef["status"], string> = {
  accepted:    "bg-[var(--success-soft)] text-[var(--success)]",
  proposed:    "bg-[var(--info-soft)] text-[var(--info)]",
  superseded:  "bg-[var(--surface-2)] text-[var(--text-muted)]",
  deprecated:  "bg-[var(--warning-soft)] text-[var(--warning)]",
};

export interface AdrsReferencedCardProps {
  adrs: readonly AdrRef[];
}

export function AdrsReferencedCard({ adrs }: AdrsReferencedCardProps) {
  if (adrs.length === 0) {
    return (
      <EmptyState
        icon={<ScrollText className="size-6" aria-hidden />}
        title="No ADRs referenced by this repo's code yet."
        description="When the ingestion pass discovers code that cites an ADR (by id, path, or doc-link), the matches surface here."
      />
    );
  }

  return (
    <Card data-testid="repo-adrs-referenced">
      <Stack gap="2">
        <Cluster gap="2" align="center">
          <ScrollText className="size-4 text-[var(--primary)]" aria-hidden />
          <span className="text-sm font-semibold">ADRs referenced from this repo&apos;s code</span>
          <span className="ml-auto text-xs text-[var(--text-muted)]">{adrs.length}</span>
        </Cluster>
        <Stack gap="1" as="ul">
          {adrs.map((a) => (
            <li
              key={a.id}
              className="rounded border border-[var(--border)] p-2 text-xs"
            >
              <Link
                href={`/decisions/${encodeURIComponent(a.id)}`}
                className="block no-underline hover:opacity-80"
              >
                <Cluster gap="2" align="center">
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${STATUS_TONE[a.status]}`}
                  >
                    {a.status}
                  </span>
                  <span className="font-semibold text-[var(--text)]">{a.title}</span>
                  <code className="truncate font-mono text-[10px] text-[var(--text-subtle)]" title={a.path}>
                    {a.path}
                  </code>
                  <span className="ml-auto text-[10px] tabular-nums text-[var(--text-subtle)]">
                    {a.date}
                  </span>
                </Cluster>
              </Link>
            </li>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}
