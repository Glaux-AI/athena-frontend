"use client";

/**
 * CrossRepoConnectionsCard — the org-scope "how repos connect" surface.
 *
 * The `OrgKnowledge.cross_repo_edges` summary gives the *count* per
 * `(src_repo, dst_repo, kind)` connection (e.g. `athena-frontend → CONSUMES
 * API → athena-backend ×218`). Each row here expands to the concrete edges
 * behind that count — `src_symbol --[route]--> dst_symbol` (the actual
 * `client.ts → GET /v1/domains → get_domain` path) — lazy-fetched
 * and paginated via `GET /v1/orgs/{org}/knowledge/cross-repo-edges`, so the
 * core knowledge payload stays small even when a connection has thousands of
 * routes.
 *
 * Renders nothing when there are no cross-repo connections. The header's
 * "open in graph →" still jumps to the full cross-repo graph view.
 */

import Link from "next/link";
import { useCallback, useState } from "react";
import { ArrowLeftRight, ArrowRight, ChevronDown, ChevronRight } from "lucide-react";

import { Cluster, Stack } from "@/components/layout/primitives";
import { Card } from "@/components/ui/card";
import { Pagination, PAGE_SIZE_OPTIONS } from "@/components/ui/pagination";
import {
  api,
  ApiError,
  type CrossRepoEdgeDetail,
  type OrgKnowledge,
} from "@/lib/api/client";
import { cn } from "@/lib/cn";

type Connection = OrgKnowledge["cross_repo_edges"]["connections"][number];

const DEFAULT_PAGE_SIZE = 20;

/** `Glaux-AI/athena-backend` → `athena-backend` for compact rows. */
function repoShort(fullName: string): string {
  return fullName.split("/").pop() || fullName;
}

export function CrossRepoConnectionsCard({
  orgId,
  connections,
}: {
  orgId: string;
  connections: Connection[];
}) {
  if (connections.length === 0) return null;
  return (
    <Card>
      <Stack gap="3">
        <Cluster gap="2" align="center">
          <ArrowLeftRight className="size-4 text-[var(--primary)]" aria-hidden />
          <span className="text-sm font-semibold">Cross-repo connections</span>
          <Link
            href="/knowledge/graph"
            className="ml-auto text-xs text-[var(--primary)] no-underline hover:underline"
          >
            open in graph →
          </Link>
        </Cluster>
        <Stack gap="1" as="ul">
          {connections.map((c, i) => (
            <ConnectionRow
              key={`${c.src_repo_id}->${c.dst_repo_id}-${c.kind}-${i}`}
              orgId={orgId}
              connection={c}
            />
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}

function ConnectionRow({
  orgId,
  connection: c,
}: {
  orgId: string;
  connection: Connection;
}) {
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<CrossRepoEdgeDetail[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (p: number, size: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.orgs.crossRepoEdges(orgId, {
          srcRepoId: c.src_repo_id,
          dstRepoId: c.dst_repo_id,
          kind: c.kind,
          offset: p * size,
          limit: size,
        });
        setItems(res.items);
        setTotal(res.total);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load routes.");
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [orgId, c.src_repo_id, c.dst_repo_id, c.kind],
  );

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && items === null && !loading) void load(page, pageSize);
  };

  const kindLabel = c.kind.replace(/_/g, " ");

  return (
    <li>
      <button
        type="button"
        data-testid="cross-repo-connection"
        aria-expanded={expanded}
        onClick={toggle}
        className={cn(
          "grid w-full grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-2 rounded-md border border-[var(--border)] px-2 py-1.5 text-left text-xs",
          "transition-colors duration-150 ease-out hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        )}
        title={`${c.src_repo} ${kindLabel} ${c.dst_repo} (${c.count})`}
      >
        {expanded ? (
          <ChevronDown className="size-3.5 text-[var(--text-subtle)]" aria-hidden />
        ) : (
          <ChevronRight className="size-3.5 text-[var(--text-subtle)]" aria-hidden />
        )}
        <span className="truncate font-mono text-[var(--text-muted)]">{repoShort(c.src_repo)}</span>
        <span className="whitespace-nowrap text-[9px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
          → {kindLabel}
        </span>
        <span className="truncate font-mono text-[var(--text-muted)]">{repoShort(c.dst_repo)}</span>
        <span className="tabular-nums text-[var(--text-subtle)]">×{c.count.toLocaleString()}</span>
      </button>

      {expanded && (
        <div className="mt-1 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
          {error ? (
            <Cluster gap="2" align="center" className="px-1 py-1 text-xs text-[var(--danger-ink)]">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => void load(page, pageSize)}
                className="text-[var(--primary)] hover:underline"
              >
                retry
              </button>
            </Cluster>
          ) : items === null ? (
            <Stack gap="1" aria-hidden>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded-md bg-[var(--surface-2)]" />
              ))}
            </Stack>
          ) : items.length === 0 ? (
            <p className="px-1 py-2 text-xs text-[var(--text-subtle)]">
              No individual routes resolved for this connection.
            </p>
          ) : (
            <Stack gap="2">
              <Stack gap="1" as="ul">
                {items.map((e, i) => (
                  <li
                    key={`${e.route}-${e.src_symbol ?? ""}-${e.dst_symbol ?? ""}-${i}`}
                    className="rounded-md border border-[var(--border)] px-2 py-1.5"
                  >
                    <code
                      className="block truncate font-mono text-xs text-[var(--text)]"
                      title={e.route}
                    >
                      {e.route}
                    </code>
                    <Cluster gap="1.5" align="center" className="mt-0.5 text-[10px] text-[var(--text-subtle)]">
                      <span className="min-w-0 truncate font-mono">{e.src_symbol ?? "—"}</span>
                      <ArrowRight className="size-3 shrink-0" aria-hidden />
                      <span className="min-w-0 truncate font-mono">{e.dst_symbol ?? "—"}</span>
                      {e.transport && (
                        <span className="shrink-0 rounded bg-[var(--surface-2)] px-1 font-semibold uppercase tracking-wider">
                          {e.transport}
                        </span>
                      )}
                    </Cluster>
                  </li>
                ))}
              </Stack>
              {total > PAGE_SIZE_OPTIONS[0] && (
                <Pagination
                  total={total}
                  page={page}
                  pageSize={pageSize}
                  loading={loading}
                  label="routes"
                  onPageChange={(p) => {
                    setPage(p);
                    void load(p, pageSize);
                  }}
                  onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(0);
                    void load(0, size);
                  }}
                />
              )}
            </Stack>
          )}
        </div>
      )}
    </li>
  );
}
