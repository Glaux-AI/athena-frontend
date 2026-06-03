"use client";

/**
 * Per-repo KG snapshot card.
 *
 * Exports `SnapshotCard` — a pure-presentation snapshot (indexed SHA +
 * pending PRs) for one repo. Branch / files / LOC / last-sync are NOT
 * duplicated here — they live on the ScopeHeader slug + TopologyHeader per the
 * ADR-073 canonical-home rule. The caller owns fetching via
 * `api.capabilities.repoKnowledge`. Rendered on the repo Topology tab.
 *
 * History: this module also exported `RepoKnowledgePanel`, a bundle
 * (snapshot + symbols + call_edges + configs) built for the cap-page
 * Repos-tab inline expand. The Phase D knowledge-UX overhaul removed that
 * inline expand; the repo Topology tab is the canonical heavy KG home
 * (ADR-073 §4), rendering the interactive file graph (KnowledgeGraphCanvas)
 * with an inline file-blueprint panel plus a dedicated Configs tab. The panel
 * was dead afterward (only its own test imported it), so it was deleted;
 * only this card — already reused by the Topology tab — survived.
 */

import { GitPullRequest, ScrollText } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";
import type { RepoKnowledge } from "@/lib/api/client";

/**
 * When `pending_prs` is empty, renders an inline "No pending PRs" hint —
 * the repo route surfaces this fact first-class rather than hiding the row.
 */
export function SnapshotCard({ knowledge }: { knowledge: RepoKnowledge }) {
  const snap = knowledge.snapshot;
  return (
    <Card>
      <Stack gap="2">
        <Cluster gap="2" align="center">
          <ScrollText className="size-4 text-[var(--primary)]" aria-hidden />
          <span className="text-sm font-semibold">Snapshot</span>
        </Cluster>
        <Cluster gap="4" align="center" className="flex-wrap text-xs" data-testid="repo-knowledge-snapshot">
          <Stat label="Indexed SHA" value={snap.indexed_sha.slice(0, 7)} mono />
        </Cluster>
        {snap.pending_prs.length > 0 ? (
          <Cluster gap="2" align="center" className="text-[10px]">
            <GitPullRequest className="size-3 text-[var(--text-muted)]" aria-hidden />
            <span className="text-[var(--text-subtle)]">Pending PRs:</span>
            {snap.pending_prs.map((pr) => (
              <code
                key={pr.pr_number}
                className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[var(--text-muted)]"
                title={`PR #${pr.pr_number} · ${pr.changed_files} files`}
              >
                #{pr.pr_number} ({pr.sha.slice(0, 7)})
              </code>
            ))}
          </Cluster>
        ) : (
          <Cluster gap="2" align="center" className="text-[10px] text-[var(--text-subtle)]">
            <GitPullRequest className="size-3" aria-hidden />
            <span>No pending PRs</span>
          </Cluster>
        )}
      </Stack>
    </Card>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <span className="flex items-center gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
        {label}
      </span>
      <span
        className={cn(
          "font-semibold tabular-nums text-[var(--text)]",
          mono && "font-mono text-[10px]",
        )}
      >
        {value}
      </span>
    </span>
  );
}
