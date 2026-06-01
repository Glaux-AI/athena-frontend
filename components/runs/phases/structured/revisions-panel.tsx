/**
 * RevisionsPanel — a compact revision log shared by the spec + plan phase
 * bodies. Each row reads `v{version} · {who_kind} · {relative date}`. Newest
 * first (we sort by version descending so the BE ordering doesn't matter).
 *
 * Body-only and self-effacing: an empty log renders nothing so the phase body
 * doesn't carry a dangling heading.
 */

import { History } from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { formatRelativeTime } from "@/lib/utils/format";
import type { PhaseRevision } from "@/lib/api/client";

export function RevisionsPanel({ revisions }: { revisions: PhaseRevision[] }) {
  if (revisions.length === 0) return null;
  const ordered = [...revisions].sort((a, b) => b.version - a.version);
  return (
    <section data-testid="revisions-panel">
      <Stack gap="2" className="rounded-md border border-[var(--border)] p-3">
        <Cluster gap="1.5" align="center">
          <History className="size-3.5 text-[var(--text-muted)]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Revisions
          </span>
        </Cluster>
        <ul className="flex flex-col gap-1">
          {ordered.map((r) => (
            <li
              key={r.version}
              className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-muted)]"
            >
              <span className="font-mono font-semibold text-[var(--text)]">v{r.version}</span>
              <span aria-hidden>·</span>
              <span>{r.who_kind}</span>
              <span aria-hidden>·</span>
              <span>{formatRelativeTime(r.created_at)}</span>
            </li>
          ))}
        </ul>
      </Stack>
    </section>
  );
}
