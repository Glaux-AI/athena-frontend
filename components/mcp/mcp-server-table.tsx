"use client";

/**
 * McpServerTable - list-view table of MCP servers (readiness §6 r3).
 *
 * Columns: name, source chip, status badge, tool count, last health
 * check (relative time), and a link to the detail page. The whole row
 * is a `<button>` that navigates to `/mcp/{id}` via `useRouter().push`,
 * and the name cell renders a focusable anchor for keyboard navigation
 * + assistive tech.
 *
 * Sort: clicking a column header toggles asc/desc on that key.
 * Integration-sourced rows surface an inline "Open integration" link
 * back to `/settings/integrations` so admins can manage the credential
 * upstream rather than from the MCP catalog.
 *
 * Renders `<EmptyState>` when `servers.length === 0`.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpRight, ChevronsUpDown } from "lucide-react";

import type { McpServer } from "@/lib/api/client";
import { EmptyState } from "@/components/ui/empty-state";
import { McpSourceChip } from "@/components/mcp/mcp-source-chip";
import { McpStatusBadge } from "@/components/mcp/mcp-status-badge";
import { cn } from "@/lib/cn";

type SortKey = "name" | "source" | "status" | "tools" | "last_health_check";
type SortDir = "asc" | "desc";

function sortServers(servers: McpServer[], key: SortKey, dir: SortDir): McpServer[] {
  const factor = dir === "asc" ? 1 : -1;
  const copy = [...servers];
  copy.sort((a, b) => {
    if (key === "name") return a.name.localeCompare(b.name) * factor;
    if (key === "source") return a.source.localeCompare(b.source) * factor;
    if (key === "status") return a.health.status.localeCompare(b.health.status) * factor;
    if (key === "tools") return (a.tools.length - b.tools.length) * factor;
    return (
      (Date.parse(a.health.last_check_at) - Date.parse(b.health.last_check_at)) *
      factor
    );
  });
  return copy;
}

function SortHeader({
  label,
  sortKey,
  current,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  current: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
}) {
  const isActive = current.key === sortKey;
  const Icon = !isActive ? ChevronsUpDown : current.dir === "asc" ? ArrowUp : ArrowDown;
  const ariaSort: "ascending" | "descending" | "none" = isActive
    ? current.dir === "asc"
      ? "ascending"
      : "descending"
    : "none";
  return (
    <th scope="col" aria-sort={ariaSort} className="py-2 pr-3 text-left font-semibold">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${label}${isActive ? ` (${current.dir})` : ""}`}
        className="inline-flex items-center gap-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        {label}
        <Icon className="size-3" aria-hidden="true" />
      </button>
    </th>
  );
}

export function McpServerTable({ servers }: { servers: McpServer[] }) {
  const router = useRouter();
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "name",
    dir: "asc",
  });

  const sorted = useMemo(() => sortServers(servers, sort.key, sort.dir), [servers, sort]);

  const onSort = (key: SortKey) => {
    setSort((cur) =>
      cur.key === key
        ? { key, dir: cur.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  };

  if (servers.length === 0) {
    return (
      <EmptyState
        title="No MCP servers connected yet"
        description="Connect a new MCP server to expose its tools to Athena's agents - org-scoped, with per-tool approval policy."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
      <table
        className="w-full border-collapse text-sm"
        aria-label="MCP servers"
      >
        <thead className="bg-[var(--surface-2)] text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
          <tr>
            <SortHeader label="Name" sortKey="name" current={sort} onSort={onSort} />
            <SortHeader label="Source" sortKey="source" current={sort} onSort={onSort} />
            <SortHeader label="Status" sortKey="status" current={sort} onSort={onSort} />
            <SortHeader label="Tools" sortKey="tools" current={sort} onSort={onSort} />
            <SortHeader label="Last check" sortKey="last_health_check" current={sort} onSort={onSort} />
            <th scope="col" className="py-2 pr-3 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((server) => (
            <tr
              key={server.id}
              data-testid={`mcp-server-row-${server.id}`}
              onClick={() => router.push(`/mcp/${encodeURIComponent(server.id)}`)}
              className={cn(
                "cursor-pointer border-t border-[var(--border)] transition-colors",
                "hover:bg-[var(--surface-2)] focus-within:bg-[var(--surface-2)]",
              )}
            >
              <td className="py-2 pr-3">
                <Link
                  href={`/mcp/${encodeURIComponent(server.id)}`}
                  onClick={(e) => e.stopPropagation()}
                  className="font-semibold text-[var(--text)] hover:underline focus-visible:outline-none focus-visible:underline"
                >
                  {server.name}
                </Link>
              </td>
              <td className="py-2 pr-3">
                <McpSourceChip source={server.source} />
              </td>
              <td className="py-2 pr-3">
                <McpStatusBadge status={server.health.status} />
              </td>
              <td className="py-2 pr-3 font-mono tabular-nums">{server.tools.length}</td>
              <td
                className="py-2 pr-3 text-xs text-[var(--text-muted)]"
                title={server.health.last_check_at}
              >
                {server.health.last_check_at}
              </td>
              <td className="py-2 pr-3 text-right">
                {server.source === "integration" ? (
                  <Link
                    href={`/settings/integrations${server.integration_id ? `?focus=${encodeURIComponent(server.integration_id)}` : ""}`}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Open integration for ${server.name}`}
                    data-testid="mcp-open-integration-link"
                    className="inline-flex items-center gap-1 text-xs text-[var(--primary)] hover:underline focus-visible:outline-none focus-visible:underline"
                  >
                    Open integration
                    <ArrowUpRight className="size-3" aria-hidden="true" />
                  </Link>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
