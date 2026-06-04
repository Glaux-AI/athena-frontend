"use client";

/**
 * McpServerDetail — single-server detail layout (readiness §6 r3).
 *
 * Top: server name + source chip + status badge.
 * Middle: metadata grid (endpoint_url / connected_at / last_health_check / owner).
 * Bottom: two sub-sections — tool catalogue + approval history.
 *
 * The disconnect button is shown only for `source === "custom"` —
 * integration-sourced servers must be disconnected via their owning
 * integration, and we surface an "Open integration" link there instead.
 *
 * Wire fields stay snake_case per ADR-032; this component is a pure
 * presentational layout — fetch + mutate live in the page component
 * and the hooks/api layer.
 */
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Plug, Trash2 } from "lucide-react";

import type { McpRecentCall, McpServer } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { McpApprovalHistoryTable } from "@/components/mcp/mcp-approval-history-table";
import { McpSourceChip } from "@/components/mcp/mcp-source-chip";
import { McpStatusBadge } from "@/components/mcp/mcp-status-badge";
import { McpToolCatalogueTable } from "@/components/mcp/mcp-tool-catalogue-table";

interface Props {
  server: McpServer;
  approvals: McpRecentCall[];
  /** True while the page-level SWR-like fetch is still resolving. The
   *  detail container renders a skeleton block in place of the table
   *  bodies. */
  isLoading?: boolean;
  /** Invoked when the user confirms the disconnect action — page binds
   *  this to `disconnectMcpServer(id)` + router.push("/mcp"). */
  onDisconnect?: () => Promise<void> | void;
}

function MetadataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-baseline gap-3">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--text-subtle)]">
        {label}
      </dt>
      <dd className="text-sm text-[var(--text)]">{value}</dd>
    </div>
  );
}

export function McpServerDetail({
  server,
  approvals,
  isLoading = false,
  onDisconnect,
}: Props) {
  const [disconnecting, setDisconnecting] = useState(false);
  const isCustom = server.source === "custom";
  const isIntegration = server.source === "integration";

  const handleDisconnect = async () => {
    if (!onDisconnect) return;
    if (!window.confirm(`Disconnect ${server.name}? Agents will lose access immediately.`)) {
      return;
    }
    setDisconnecting(true);
    try {
      await onDisconnect();
    } finally {
      setDisconnecting(false);
    }
  };

  const endpointDisplay =
    server.endpoint_url && server.endpoint_url.length > 0 ? server.endpoint_url : "in-process";

  return (
    <Stack gap="6">
      <Cluster justify="between" align="start" gap="3" className="border-b border-[var(--border)] pb-5">
        <Stack gap="2">
          <Cluster gap="3" align="center">
            <div className="flex size-10 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-[var(--inner-highlight)]">
              <Plug className="size-5 text-[var(--text-muted)]" strokeWidth={2.25} aria-hidden="true" />
            </div>
            <Stack gap="0.5">
              <h1 className="text-2xl font-semibold tracking-tight">{server.name}</h1>
              <Cluster gap="2" align="center">
                <McpSourceChip source={server.source} />
                <McpStatusBadge status={server.health.status} />
              </Cluster>
            </Stack>
          </Cluster>
        </Stack>
        {isCustom && onDisconnect && (
          <Button
            variant="destructive"
            onClick={handleDisconnect}
            disabled={disconnecting}
            aria-label={`Disconnect ${server.name}`}
            data-testid="mcp-disconnect-button"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            {disconnecting ? "Disconnecting..." : "Disconnect"}
          </Button>
        )}
        {isIntegration && server.integration_id && (
          <Link
            href={`/settings/integrations?focus=${encodeURIComponent(server.integration_id)}`}
            aria-label="Open the owning integration"
            data-testid="mcp-open-integration-link"
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--primary)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            Open integration
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
        )}
      </Cluster>

      <Card>
        <Stack gap="3">
          <h2 className="border-b border-[var(--border)] pb-2 text-sm font-semibold">Connection</h2>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MetadataRow label="Endpoint" value={<span className="break-all font-mono text-xs">{endpointDisplay}</span>} />
            <MetadataRow label="Connected at" value={<span title={server.created_at}>{server.created_at}</span>} />
            <MetadataRow label="Last health check" value={<span title={server.health.last_check_at}>{server.health.last_check_at}</span>} />
            <MetadataRow
              label="Owner"
              value={
                isIntegration && server.integration_id ? (
                  <Link
                    href={`/settings/integrations?focus=${encodeURIComponent(server.integration_id)}`}
                    data-testid="mcp-owner-integration-link"
                    className="text-[var(--primary)] hover:underline"
                  >
                    Integration · {server.integration_id}
                  </Link>
                ) : (
                  <span className="text-xs text-[var(--text-muted)]">Manually added</span>
                )
              }
            />
          </dl>
        </Stack>
      </Card>

      <Card variant="elevated" className="overflow-hidden p-0">
        <div className="border-b border-[var(--border)] bg-gradient-to-b from-[var(--surface-2)] to-[var(--surface)] px-4 py-2.5 shadow-[var(--inner-highlight)]">
          <h2 className="text-sm font-semibold">Tools ({server.tools.length})</h2>
        </div>
        <div className="p-4">
          {isLoading ? (
            <div
              className="h-24 w-full animate-pulse rounded-md bg-[var(--surface-2)]"
              data-testid="mcp-detail-skeleton"
              aria-label="Loading tools"
            />
          ) : (
            <McpToolCatalogueTable tools={server.tools} />
          )}
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-[var(--border)] bg-gradient-to-b from-[var(--surface-2)] to-[var(--surface)] px-4 py-2.5 shadow-[var(--inner-highlight)]">
          <h2 className="text-sm font-semibold">Recent approval history</h2>
        </div>
        <div className="p-4">
          {isLoading ? (
            <div
              className="h-24 w-full animate-pulse rounded-md bg-[var(--surface-2)]"
              data-testid="mcp-approvals-skeleton"
              aria-label="Loading approvals"
            />
          ) : (
            <McpApprovalHistoryTable approvals={approvals} />
          )}
        </div>
      </Card>
    </Stack>
  );
}
