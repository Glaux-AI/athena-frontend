"use client";

/**
 * RepoKnowledgePanel — pure presentation surface for per-repo KG data
 * (top_symbols + call_edges + configs + snapshot). Designed to render
 * inline inside an expanded repo row on the Repos tab of the capability
 * page.
 *
 * Data is owned by the caller (parent fetches via
 * `api.capabilities.repoKnowledge`). This component renders only the
 * KG-distinctive slice — the full repo Blueprint sections live on the
 * dedicated `/capabilities/[id]/repos/[repo_id]` route.
 */

import { Cog, GitBranch, GitPullRequest, Hash, ScrollText } from "lucide-react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";
import type { RepoKnowledge } from "@/lib/api/client";

const EDGE_KIND_LABEL: Record<string, string> = {
  calls: "calls",
  imports: "imports",
  extends: "extends",
  implements: "implements",
  references: "refs",
  tested_by: "tested by",
  documented_by: "doc",
  contains: "contains",
  configures: "configures",
};

const SYMBOL_KIND_TONE: Record<string, string> = {
  function:  "bg-[var(--primary-soft)] text-[var(--primary)]",
  method:    "bg-[var(--primary-soft)] text-[var(--primary)]",
  class:     "bg-[var(--surface-2)] text-[var(--text)]",
  interface: "bg-[var(--surface-2)] text-[var(--text-muted)]",
  type:      "bg-[var(--surface-2)] text-[var(--text-muted)]",
  enum:      "bg-[var(--surface-2)] text-[var(--text-muted)]",
};

export function RepoKnowledgePanel({ knowledge }: { knowledge: RepoKnowledge }) {
  const totallyEmpty =
    knowledge.top_symbols.length === 0 &&
    knowledge.call_edges.length === 0 &&
    knowledge.configs.length === 0;

  if (totallyEmpty) {
    return (
      <EmptyState
        icon={<Hash className="size-6" aria-hidden />}
        title="No KG data yet for this repo"
        description="Run Sync to populate symbols, call edges, and configs."
      />
    );
  }

  return (
    <Stack gap="3" className="border-t border-[var(--border)] pt-3" data-testid="repo-knowledge-panel">
      <SnapshotCard knowledge={knowledge} />

      {knowledge.top_symbols.length > 0 && (
        <Card>
          <Stack gap="2">
            <Cluster gap="2" align="center">
              <Hash className="size-4 text-[var(--primary)]" aria-hidden />
              <span className="text-sm font-semibold">Top symbols</span>
              <span className="ml-auto text-xs text-[var(--text-muted)]">
                {knowledge.top_symbols.length} ranked by importance
              </span>
            </Cluster>
            <Stack gap="1" as="ul" data-testid="repo-knowledge-top-symbols">
              {knowledge.top_symbols.map((sym) => (
                <li key={sym.id} className="rounded border border-[var(--border)] p-2 text-xs">
                  <Cluster gap="2" align="center">
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                        SYMBOL_KIND_TONE[sym.kind] ?? "bg-[var(--surface-2)] text-[var(--text-muted)]",
                      )}
                    >
                      {sym.kind}
                    </span>
                    <span className="font-semibold">{sym.name}</span>
                    <code className="truncate font-mono text-[10px] text-[var(--text-subtle)]" title={sym.path}>
                      {sym.path}
                    </code>
                    <span className="ml-auto text-[10px] tabular-nums text-[var(--text-subtle)]">
                      {sym.callers_count} callers · {sym.callees_count} callees
                    </span>
                  </Cluster>
                  <code className="mt-1 block truncate font-mono text-[10px] text-[var(--text-muted)]" title={sym.signature}>
                    {sym.signature}
                  </code>
                  {sym.docstring && (
                    <p className="mt-1 text-[10px] text-[var(--text-muted)]">{sym.docstring}</p>
                  )}
                </li>
              ))}
            </Stack>
          </Stack>
        </Card>
      )}

      {knowledge.call_edges.length > 0 && (
        <Card>
          <Stack gap="2">
            <Cluster gap="2" align="center">
              <GitBranch className="size-4 text-[var(--primary)]" aria-hidden />
              <span className="text-sm font-semibold">Call edges</span>
              <span className="ml-auto text-xs text-[var(--text-muted)]">
                {knowledge.call_edges.length} edges
              </span>
            </Cluster>
            <Stack gap="1" as="ul" data-testid="repo-knowledge-call-edges">
              {knowledge.call_edges.map((e, i) => (
                <li
                  key={`${e.from.id}-${e.to.id}-${i}`}
                  className="grid grid-cols-[1fr_72px_1fr_48px] items-center gap-2 rounded border border-[var(--border)] px-2 py-1 text-[10px]"
                >
                  <span className="truncate font-mono" title={e.from.path}>{e.from.name}</span>
                  <span className="text-center font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                    {EDGE_KIND_LABEL[e.kind] ?? e.kind}
                  </span>
                  <span className="truncate font-mono" title={e.to.path}>{e.to.name}</span>
                  <span className="text-right tabular-nums text-[var(--text-subtle)]" title="occurrences">
                    x{e.occurrences}
                  </span>
                </li>
              ))}
            </Stack>
          </Stack>
        </Card>
      )}

      {knowledge.configs.length > 0 && (
        <Card>
          <Stack gap="2">
            <Cluster gap="2" align="center">
              <Cog className="size-4 text-[var(--primary)]" aria-hidden />
              <span className="text-sm font-semibold">Configs</span>
              <span className="ml-auto text-xs text-[var(--text-muted)]">
                {knowledge.configs.length} discovered
              </span>
            </Cluster>
            <Stack gap="1" as="ul" data-testid="repo-knowledge-configs">
              {knowledge.configs.map((cfg) => (
                <li key={cfg.id} className="rounded border border-[var(--border)] p-2 text-xs">
                  <Cluster gap="2" align="center">
                    <code className="font-mono text-[10px] text-[var(--text)]">{cfg.path}</code>
                    <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                      {cfg.format}
                    </span>
                  </Cluster>
                  <p className="mt-1 text-[10px] text-[var(--text-muted)]">{cfg.summary}</p>
                  {cfg.key_excerpts.length > 0 && (
                    <Cluster gap="1" align="center" className="mt-1 flex-wrap">
                      {cfg.key_excerpts.map((k) => (
                        <code
                          key={k}
                          className="rounded bg-[var(--surface-2)] px-1 py-0.5 font-mono text-[9px] text-[var(--text-muted)]"
                        >
                          {k}
                        </code>
                      ))}
                    </Cluster>
                  )}
                </li>
              ))}
            </Stack>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}

/**
 * Standalone snapshot card. Also rendered on the dedicated repo route
 * (`/capabilities/[id]/repos/[repo_id]`, Topology tab) — exported so
 * the route can reuse the same shape without duplicating styling.
 *
 * When `pending_prs` is empty, renders an inline "No pending PRs" hint
 * (the dedicated route surfaces this fact first-class; the inline panel
 * on the cap-page Repos tab was content to hide the row).
 */
export function SnapshotCard({ knowledge }: { knowledge: RepoKnowledge }) {
  const snap = knowledge.snapshot;
  return (
    <Card>
      <Stack gap="2">
        <Cluster gap="2" align="center">
          <ScrollText className="size-4 text-[var(--primary)]" aria-hidden />
          <span className="text-sm font-semibold">Snapshot</span>
          <span className="ml-auto text-xs text-[var(--text-muted)]">
            {knowledge.repo_full_name} · {knowledge.primary_language}
          </span>
        </Cluster>
        <Cluster gap="4" align="center" className="flex-wrap text-xs" data-testid="repo-knowledge-snapshot">
          <Stat label="Indexed SHA" value={snap.indexed_sha.slice(0, 7)} mono />
          <Stat label="Branch" value={snap.indexed_branch} mono />
          <Stat label="Last full sync" value={snap.last_full_sync} />
          <Stat label="Files" value={knowledge.files_indexed.toLocaleString()} />
          <Stat label="LOC" value={knowledge.loc.toLocaleString()} />
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
