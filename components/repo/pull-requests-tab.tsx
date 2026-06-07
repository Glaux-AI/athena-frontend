"use client";

/**
 * PullRequestsTab — Phase D contract #4. Renders open PRs for a repo as a
 * proper list (title + #number linking to the PR url, author, head→base
 * branches, draft badge, relative updated time). When the SCM integration
 * isn't connected / the live call failed (`available === false`) it shows a
 * "couldn't load PRs / connect integration" empty state.
 *
 * Data is fetched here (the tab is self-contained) keyed by capId + repoId.
 */

import { useEffect, useState } from "react";
import { GitPullRequest, ExternalLink, GitBranch } from "lucide-react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, type RepoPullRequest } from "@/lib/api/client";
import { formatRelativeTime } from "@/lib/utils/format";

interface PullRequestsTabProps {
  domainId: string;
  repoId: string;
}

export function PullRequestsTab({ domainId, repoId }: PullRequestsTabProps) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [prs, setPrs] = useState<RepoPullRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.domains
      .repoPullRequests(domainId, repoId)
      .then((res) => {
        if (cancelled) return;
        setAvailable(res.available);
        setPrs(res.pull_requests ?? []);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setAvailable(false);
        setError(e instanceof Error ? e.message : "Failed to load pull requests");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [domainId, repoId]);

  if (loading) {
    return (
      <Stack gap="2" aria-busy="true" aria-label="Loading pull requests">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 w-full animate-pulse rounded-lg bg-[var(--surface-2)]" />
        ))}
      </Stack>
    );
  }

  if (available === false) {
    return (
      <EmptyState
        icon={<GitPullRequest className="size-8" aria-hidden />}
        title="Couldn't load pull requests"
        description={
          error
            ? `${error} — connect or re-authorize the source-control integration to see open PRs here.`
            : "Connect the source-control integration for this repo to see its open pull requests here."
        }
      />
    );
  }

  if (prs.length === 0) {
    return (
      <EmptyState
        icon={<GitPullRequest className="size-8" aria-hidden />}
        title="No open pull requests"
        description="Open PRs for this repo will appear here."
      />
    );
  }

  return (
    <Stack gap="3">
      <Cluster gap="2" align="center" className="border-b border-[var(--border)] pb-2">
        <GitPullRequest className="size-4 text-[var(--primary)]" aria-hidden />
        <span className="text-sm font-semibold">Open pull requests</span>
        <span className="text-xs text-[var(--text-muted)]">{prs.length} open</span>
      </Cluster>
      <Stack gap="2" as="ul" data-testid="pull-requests-list">
        {prs.map((pr) => (
          <li key={pr.number}>
            <Card className="transition-[box-shadow,border-color] duration-200 ease-out hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-2)]">
              <Stack gap="1.5">
                <Cluster gap="2" align="center" justify="between" className="flex-wrap">
                  <Cluster gap="2" align="center" className="min-w-0">
                    <a
                      href={pr.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-w-0 items-center gap-1.5 rounded font-medium text-[var(--text)] hover:text-[var(--primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                    >
                      <span className="truncate">{pr.title}</span>
                      <ExternalLink className="size-3 shrink-0 text-[var(--text-subtle)]" aria-hidden />
                    </a>
                    {pr.draft && (
                      <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                        Draft
                      </span>
                    )}
                  </Cluster>
                  <a
                    href={pr.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 font-mono text-xs text-[var(--text-muted)] hover:text-[var(--primary)]"
                  >
                    #{pr.number}
                  </a>
                </Cluster>
                <Cluster gap="3" align="center" className="flex-wrap text-[11px] text-[var(--text-subtle)]">
                  <span>{pr.author}</span>
                  <Cluster gap="1" align="center" className="font-mono text-[10px]">
                    <GitBranch className="size-3" aria-hidden />
                    <span className="text-[var(--text-muted)]">{pr.head_branch}</span>
                    <span aria-hidden>→</span>
                    <span className="text-[var(--text-muted)]">{pr.base_branch}</span>
                  </Cluster>
                  {pr.updated_at && <span>updated {formatRelativeTime(pr.updated_at)}</span>}
                </Cluster>
              </Stack>
            </Card>
          </li>
        ))}
      </Stack>
    </Stack>
  );
}
