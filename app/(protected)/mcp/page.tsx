"use client";

/**
 * /mcp - Model Context Protocol servers, org-scoped.
 *
 * Cards summarize each server's source, status, tool count, auth method,
 * and egress policy. Surfaces drift warnings + per-server "test connection"
 * + an "Add MCP server" CTA opening the wizard at /mcp/new.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus, Plug, AlertTriangle, Search,
  ShieldCheck, KeyRound, Lock, Globe, Link2,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { BrandLogo } from "@/components/brand/brand-logo";
import { McpSourceChip } from "@/components/mcp/mcp-source-chip";
import { McpStatusBadge } from "@/components/mcp/mcp-status-badge";
import { api, ApiError, type McpServer, type McpStatus, type Integration } from "@/lib/api/client";
import { useSession } from "@/lib/session/SessionProvider";

type SourceFilter = "all" | "integration" | "custom";
type StatusFilter = "all" | McpStatus;

export default function McpListPage() {
  const { activeOrgId } = useSession();
  const [servers, setServers] = useState<McpServer[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    (async () => {
      try {
        const list = await api.mcp.list();
        setServers(list);
        if (activeOrgId) {
          const ints = await api.integrations.list(activeOrgId).catch(() => []);
          setIntegrations(ints);
        }
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load MCP servers");
      } finally {
        setLoading(false);
      }
    })();
  }, [activeOrgId]);

  const integrationsByName = useMemo(() => {
    const m: Record<string, Integration> = {};
    for (const i of integrations) m[i.id] = i;
    return m;
  }, [integrations]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return servers.filter((s) => {
      if (sourceFilter !== "all" && s.source !== sourceFilter) return false;
      if (statusFilter !== "all" && s.health.status !== statusFilter) return false;
      if (q && !s.name.toLowerCase().includes(q) && !s.endpoint_url.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [servers, query, sourceFilter, statusFilter]);

  const driftCount = servers.filter((s) => s.pending_drift).length;
  const errorCount = servers.filter((s) => s.health.status === "error").length;

  return (
    <Stack gap="6">
      <Stack gap="5">
        <Cluster justify="between" align="center">
          <Stack gap="1">
            <h1 className="text-2xl font-semibold tracking-tight">MCP servers</h1>
            <p className="text-sm text-[var(--text-muted)]">
              Tools exposed by external systems that Athena&apos;s agents can call. Org-scoped. Connect a custom server, or auto-link one from an integration.
            </p>
          </Stack>
          <Link href="/mcp/new"><Button><Plus className="size-4" />Add MCP server</Button></Link>
        </Cluster>
        <hr className="hr-horizon" aria-hidden />
      </Stack>

      {(driftCount > 0 || errorCount > 0) && (
        <Card className="border-[var(--warning)] bg-[var(--warning-soft)] shadow-[var(--shadow-1)]">
          <Cluster gap="2" align="start">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--warning-ink)]" />
            <Stack gap="1">
              <span className="text-sm font-semibold text-[var(--warning-ink)]">Needs your attention</span>
              <span className="text-xs text-[var(--text-muted)]">
                {errorCount > 0 && <>{errorCount} server{errorCount > 1 ? "s" : ""} in error · </>}
                {driftCount > 0 && <>{driftCount} server{driftCount > 1 ? "s" : ""} with tool-list drift since last review</>}
              </span>
            </Stack>
          </Cluster>
        </Card>
      )}

      {error && (
        <div className="rounded-lg border border-[var(--border-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]">
          {error}
        </div>
      )}

      {/* Filters */}
      <Cluster gap="2" align="center" className="flex-wrap">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or URL…"
            className="w-64 rounded-md border border-[var(--border)] bg-[var(--surface)] py-1.5 pl-8 pr-3 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
        </div>
        <FilterChip
          label="Source"
          value={sourceFilter}
          onChange={(v) => setSourceFilter(v as SourceFilter)}
          options={[
            { value: "all", label: "All" },
            { value: "integration", label: "Integration" },
            { value: "custom", label: "Custom" },
          ]}
        />
        <FilterChip
          label="Status"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
          options={[
            { value: "all", label: "All" },
            { value: "connected", label: "Connected" },
            { value: "degraded", label: "Degraded" },
            { value: "error", label: "Error" },
            { value: "disconnected", label: "Disconnected" },
            { value: "pending_review", label: "Pending review" },
          ]}
        />
      </Cluster>

      {loading ? (
        <Grid cols="auto-fit-360" gap="4" aria-busy="true" aria-label="Loading MCP servers">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="flex h-full flex-col gap-4 p-5">
              <Cluster justify="between" align="start" gap="3">
                <Cluster gap="3" align="center" className="min-w-0">
                  <Skeleton className="size-9 shrink-0 rounded-md" />
                  <Stack gap="1" className="min-w-0">
                    <Skeleton className="h-4 w-32 rounded-md" />
                    <Skeleton className="h-3 w-44 rounded-md" />
                  </Stack>
                </Cluster>
                <Skeleton className="h-4 w-16 rounded-full" />
              </Cluster>
              <Cluster gap="2" align="center">
                <Skeleton className="h-4 w-16 rounded-full" />
                <Skeleton className="h-3 w-12 rounded-md" />
                <Skeleton className="h-3 w-12 rounded-md" />
              </Cluster>
              <Cluster gap="4" className="mt-auto pt-1">
                {Array.from({ length: 3 }).map((__, j) => (
                  <Stack key={j} gap="1">
                    <Skeleton className="h-2 w-12" />
                    <Skeleton className="h-3 w-10" />
                  </Stack>
                ))}
              </Cluster>
            </Card>
          ))}
        </Grid>
      ) : filtered.length === 0 && servers.length === 0 ? (
        <EmptyState
          title="No MCP servers yet"
          description="Add a custom MCP server or connect an integration that publishes one. Athena's agents will then be able to call its tools - gated by your approval policy."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No matches"
          description="Adjust the search or filters to see more results."
        />
      ) : (
        <Grid cols="auto-fit-360" gap="4">
          {filtered.map((s) => (
            <McpCard key={s.id} server={s} integration={s.integration_id ? integrationsByName[s.integration_id] : undefined} />
          ))}
        </Grid>
      )}
    </Stack>
  );
}

function McpCard({ server, integration }: { server: McpServer; integration?: Integration | undefined }) {
  const enabledTools = server.tools.filter((t) => t.enabled).length;
  return (
    <Link
      href={`/mcp/${encodeURIComponent(server.id)}`}
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      <Card variant="glass" interactive className="flex h-full flex-col gap-4 p-5">
        {/* Header - logo + name + status */}
        <Cluster justify="between" align="start" gap="3">
          <Cluster gap="3" align="center" className="min-w-0">
            <div className="glass-panel flex size-9 shrink-0 items-center justify-center rounded-md">
              {integration ? <BrandLogo name={integration.name} size={22} /> : <Plug className="size-[18px] text-[var(--text-muted)]" strokeWidth={2.25} />}
            </div>
            <Stack gap="0" className="min-w-0">
              <h2 className="truncate text-base font-semibold leading-tight">{server.name}</h2>
              <span className="truncate font-mono text-micro text-[var(--text-muted)]">{server.endpoint_url}</span>
            </Stack>
          </Cluster>
          <McpStatusBadge status={server.health.status} />
        </Cluster>

        {/* Drift warning */}
        {server.pending_drift && (
          <div className="flex items-start gap-2 rounded-md border border-[var(--warning)] bg-[var(--warning-soft)] px-2.5 py-1.5 text-micro text-[var(--warning-ink)]">
            <AlertTriangle className="mt-0.5 size-3 shrink-0" />
            <span className="font-medium">Tool list changed since last review.</span>
          </div>
        )}

        {/* Meta row */}
        <Cluster gap="2" align="center" className="text-xs text-[var(--text-muted)]">
          <McpSourceChip source={server.source} />
          <span title={`Auth: ${server.auth.method}`}>
            <AuthIcon method={server.auth.method} />
          </span>
          <span title={`Egress: ${server.egress_policy}`}>
            <EgressIcon policy={server.egress_policy} />
          </span>
          {server.version && (
            <span className="font-mono text-micro">v{server.version}</span>
          )}
        </Cluster>

        {/* Stats */}
        <Cluster gap="4" className="mt-auto pt-1">
          <Stat label="Tools" value={`${enabledTools} / ${server.tools.length}`} sub="enabled / total" />
          <Stat label="Latency p50" value={server.health.latency_p50_ms ? `${server.health.latency_p50_ms}ms` : "-"} />
          <Stat label="Errors 24h" value={`${(server.health.error_rate_24h * 100).toFixed(2)}%`} sub={server.health.uptime_30d ? `${(server.health.uptime_30d * 100).toFixed(1)}% uptime` : ""} />
        </Cluster>
      </Card>
    </Link>
  );
}

function AuthIcon({ method }: { method: McpServer["auth"]["method"] }) {
  if (method === "none") return <span className="text-micro">No auth</span>;
  if (method === "bearer") return <Cluster gap="1" align="center"><KeyRound className="size-3" /> <span className="text-micro">Bearer</span></Cluster>;
  if (method === "oauth") return <Cluster gap="1" align="center"><ShieldCheck className="size-3" /> <span className="text-micro">OAuth</span></Cluster>;
  if (method === "mtls") return <Cluster gap="1" align="center"><Lock className="size-3" /> <span className="text-micro">mTLS</span></Cluster>;
  return <Cluster gap="1" align="center"><Link2 className="size-3" /> <span className="text-micro">Header</span></Cluster>;
}

function EgressIcon({ policy }: { policy: McpServer["egress_policy"] }) {
  if (policy === "vpc_peered") return <Cluster gap="1" align="center"><Lock className="size-3" /> <span className="text-micro">VPC</span></Cluster>;
  if (policy === "region_pinned") return <Cluster gap="1" align="center"><Globe className="size-3" /> <span className="text-micro">Region-pinned</span></Cluster>;
  return <Cluster gap="1" align="center"><Globe className="size-3" /> <span className="text-micro">Public</span></Cluster>;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-px">
      <Eyebrow>{label}</Eyebrow>
      <span className="text-sm font-bold tabular-nums">{value}</span>
      {sub && <span className="text-micro text-[var(--text-subtle)]">{sub}</span>}
    </div>
  );
}

function FilterChip<T extends string>({
  label, value, onChange, options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
      <span className="font-medium">{label}</span>
      <Select size="sm" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </Select>
    </label>
  );
}
