"use client";

/**
 * /mcp/[id] - single MCP server detail.
 *
 * Surfaces everything an admin needs to operate the server:
 *   - Connection card (URL, transport, auth method, egress policy, version)
 *   - Health card (status, latency, error rate, uptime, last check)
 *   - Drift banner - if tool list changed since last review
 *   - Tools list with enable toggle, approval policy, risk classification
 *   - Recent calls (audit preview)
 *   - Disconnect + Delete in a danger zone
 */

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ChevronDown, Plug, RefreshCw, Trash2, AlertTriangle,
  ShieldCheck, KeyRound, Lock, Globe, Link2,
} from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ConfirmDialog } from "@/components/ui/overlay";
import { Pill } from "@/components/ui/pill";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { BrandLogo } from "@/components/brand/brand-logo";
import { McpStatusBadge } from "@/components/mcp/mcp-status-badge";
import {
  api, ApiError,
  type McpServer, type McpTool, type McpToolApproval, type McpToolRisk,
  type McpRecentCall, type Integration,
} from "@/lib/api/client";
import { useSession } from "@/lib/session/SessionProvider";

export default function McpDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { activeOrgId } = useSession();

  const [server, setServer] = useState<McpServer | null>(null);
  const [recent, setRecent] = useState<McpRecentCall[]>([]);
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [srv, calls] = await Promise.all([
          api.mcp.get(id),
          api.mcp.recentCalls(id).catch(() => []),
        ]);
        setServer(srv);
        setRecent(calls);
        if (srv.integration_id && activeOrgId) {
          const ints = await api.integrations.list(activeOrgId).catch(() => []);
          setIntegration(ints.find((i) => i.id === srv.integration_id) ?? null);
        }
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load MCP server");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, activeOrgId]);

  const onToggleTool = async (tool: McpTool, enabled: boolean) => {
    if (!server) return;
    const prev = server;
    setServer({ ...server, tools: server.tools.map((t) => (t.id === tool.id ? { ...t, enabled } : t)) });
    try {
      await api.mcp.toggleTool(server.id, tool.id, enabled);
      toast.success(`${tool.name} ${enabled ? "enabled" : "disabled"}.`);
    } catch (e) {
      setServer(prev);
      toast.error(e instanceof ApiError ? e.message : "Couldn't update tool.");
    }
  };

  const onApprovalChange = async (tool: McpTool, approval: McpToolApproval) => {
    if (!server) return;
    const prev = server;
    setServer({ ...server, tools: server.tools.map((t) => (t.id === tool.id ? { ...t, approval } : t)) });
    try {
      await api.mcp.setToolApproval(server.id, tool.id, approval);
      toast.success(`Approval policy updated.`);
    } catch (e) {
      setServer(prev);
      toast.error(e instanceof ApiError ? e.message : "Couldn't update approval.");
    }
  };

  const onAcknowledgeDrift = async () => {
    if (!server) return;
    try {
      const updated = await api.mcp.acknowledgeDrift(server.id);
      setServer(updated);
      toast.success("Tool list reviewed.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't acknowledge drift.");
    }
  };

  const onTest = async () => {
    if (!server) return;
    setTesting(true);
    try {
      const r = await api.mcp.test(server.id);
      toast[r.ok ? "success" : "error"](`${r.detail} (${r.latency_ms}ms)`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Test failed.");
    } finally {
      setTesting(false);
    }
  };

  /* §5.29.8 row 2 - manual re-discover. Calls the BE `/discover`
   * endpoint with the server's endpoint_url + transport and compares
   * the advertised tool list against what's cached locally. If the
   * count differs, we surface a delta toast so the admin knows to
   * follow up (the existing drift banner already handles the
   * acknowledgement path). For an exact match, a clean toast. */
  const onDiscover = async () => {
    if (!server) return;
    setDiscovering(true);
    try {
      const d = await api.mcp.discover({
        endpoint_url: server.endpoint_url,
        transport: server.transport,
        auth: server.auth,
      });
      const delta = d.tools.length - server.tools.length;
      if (delta === 0) {
        toast.success(`Re-discovered - tool list unchanged (${d.tools.length} tools, version ${d.version}).`);
      } else if (delta > 0) {
        toast.warning(`Re-discovered - ${delta} new tool(s) advertised. The server should flip pending_drift; refresh to see the banner.`);
      } else {
        toast.warning(`Re-discovered - ${-delta} tool(s) removed. Review the difference before agents call them.`);
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Discovery failed.");
    } finally {
      setDiscovering(false);
    }
  };

  /* Pull a live `tools/list` and upsert the cached tool rows so agents
   * can call this server. New tools land with read-heuristic defaults
   * (reads → auto, writes → prompt); existing enabled/approval choices
   * are preserved. Refetches the server so the Tools section updates. */
  const onSyncTools = async () => {
    if (!server) return;
    setSyncing(true);
    try {
      const r = await api.mcp.syncTools(server.id);
      toast[r.synced > 0 ? "success" : "info"](r.detail);
      const updated = await api.mcp.get(server.id);
      setServer(updated);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Tool sync failed.");
    } finally {
      setSyncing(false);
    }
  };

  const onDelete = async () => {
    if (!server) return;
    setDeleting(true);
    try {
      await api.mcp.delete(server.id);
      toast.success(`${server.name} removed.`);
      router.push("/mcp");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Delete failed.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  if (loading) {
    return (
      <Stack gap="6" aria-busy="true" aria-label="Loading MCP server">
        <Cluster justify="between" align="start" gap="3">
          <Stack gap="2">
            <Skeleton className="h-3 w-28 rounded-md" />
            <Cluster gap="3" align="center">
              <Skeleton className="size-10 rounded-md" />
              <Stack gap="1">
                <Skeleton className="h-7 w-56 rounded-md" />
                <Skeleton className="h-3 w-72 rounded-md" />
              </Stack>
            </Cluster>
          </Stack>
          <Skeleton className="h-8 w-36 rounded-md" />
        </Cluster>
        <Grid cols="auto-fit-280" gap="4">
          <Skeleton className="h-44 w-full rounded-md" />
          <Skeleton className="h-44 w-full rounded-md" />
        </Grid>
        <Card>
          <Stack gap="3">
            <Skeleton className="h-4 w-24 rounded-md" />
            <Stack gap="2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-md" />
              ))}
            </Stack>
          </Stack>
        </Card>
        <Card>
          <Stack gap="3">
            <Skeleton className="h-4 w-32 rounded-md" />
            <Stack gap="1">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </Stack>
          </Stack>
        </Card>
      </Stack>
    );
  }
  if (error || !server) {
    return (
      <div className="rounded-lg border border-[var(--border-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]">
        {error ?? "Not found"}
      </div>
    );
  }

  const enabledTools = server.tools.filter((t) => t.enabled).length;

  return (
    <Stack gap="6">
      <Stack gap="3">
        <Link href="/mcp" className="inline-flex w-fit items-center gap-1 rounded text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
          <ArrowLeft className="size-3.5" /> MCP servers
        </Link>
        <Cluster justify="between" align="start" gap="3">
          <Cluster gap="3" align="center">
            <div className="glass-panel flex size-10 items-center justify-center rounded-lg">
              {integration ? <BrandLogo name={integration.name} size={24} /> : <Plug className="size-5 text-[var(--text-muted)]" strokeWidth={2.25} />}
            </div>
            <Stack gap="0.5">
              <h1 className="text-2xl font-semibold tracking-tight">{server.name}</h1>
              <Cluster gap="2" align="center" className="text-xs text-[var(--text-muted)]">
                <span className="font-mono">{server.endpoint_url}</span>
                <span>·</span>
                <span>{server.source === "integration" ? "Integration" : "Custom"}</span>
                {server.version && <><span>·</span><span className="font-mono">v{server.version}</span></>}
              </Cluster>
            </Stack>
          </Cluster>
          <Cluster gap="2">
            <Button variant="outline" onClick={onTest} loading={testing}>
              {!testing && <RefreshCw className="size-4" />}
              Test connection
            </Button>
            <Button variant="outline" onClick={onDiscover} loading={discovering}>
              {!discovering && <RefreshCw className="size-4" />}
              Re-discover tools
            </Button>
            <Button variant="outline" onClick={onSyncTools} loading={syncing}>
              {!syncing && <RefreshCw className="size-4" />}
              Sync tools
            </Button>
          </Cluster>
        </Cluster>
        <hr className="hr-horizon" aria-hidden />
      </Stack>

      {server.pending_drift && (
        <Card className="border-[var(--warning)] bg-[var(--warning-soft)] shadow-[var(--shadow-1)]">
          <Cluster justify="between" align="start" gap="3">
            <Cluster gap="2" align="start">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--warning-ink)]" />
              <Stack gap="1">
                <span className="text-sm font-semibold text-[var(--warning-ink)]">Tool list changed since last review</span>
                <span className="text-xs text-[var(--text-muted)]">
                  The server&apos;s tool catalog drifted from what your team last approved. Review new tools before agents can use them - destructive tools stay disabled by default.
                </span>
              </Stack>
            </Cluster>
            <Button size="sm" onClick={onAcknowledgeDrift}>Mark reviewed</Button>
          </Cluster>
        </Card>
      )}

      <Grid cols="auto-fit-280" gap="4">
        <ConnectionCard server={server} />
        <HealthCard server={server} />
      </Grid>

      <Card variant="elevated" className="overflow-hidden p-0">
        <div className="px-4 py-2.5">
          <Stack gap="0">
            <h2 className="text-sm font-semibold">Tools</h2>
            <span className="text-xs text-[var(--text-muted)]">
              {enabledTools} of {server.tools.length} enabled · last reviewed {server.version_last_reviewed ?? "-"}
            </span>
          </Stack>
        </div>
        <hr className="hr-horizon" aria-hidden />
        <Stack gap="2" as="ul" className="p-4">
          {server.tools.map((t) => (
            <li key={t.id}>
              <ToolRow
                tool={t}
                onToggle={(en) => onToggleTool(t, en)}
                onApprovalChange={(a) => onApprovalChange(t, a)}
              />
            </li>
          ))}
        </Stack>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="px-4 py-2.5">
          <h2 className="text-sm font-semibold">Recent calls</h2>
        </div>
        <hr className="hr-horizon" aria-hidden />
        <div className="p-4">
          {recent.length === 0 ? (
            <EmptyState title="No tool calls yet" description="Agent calls to this server's tools will show up here." />
          ) : (
            <Stack gap="0" as="ul" className="divide-y divide-[var(--border-soft)]">
              {recent.map((c) => (
                <li key={c.id} className="grid grid-cols-[80px_140px_1fr_72px_auto] items-baseline gap-3 py-2 text-sm">
                  <span className="text-xs text-[var(--text-muted)]">{c.when}</span>
                  <span className="truncate font-mono text-xs">{c.tool_name}</span>
                  <span className="truncate text-xs text-[var(--text-muted)]">{c.actor}{c.result_preview ? ` · ${c.result_preview}` : ""}</span>
                  <span className="text-right text-xs font-mono tabular-nums text-[var(--text-muted)]">{c.duration_ms}ms</span>
                  <Pill
                    size="sm"
                    tone={c.status === "ok" ? "success" : c.status === "timeout" ? "warning" : "danger"}
                    className="justify-self-end"
                  >
                    {c.status === "ok" ? "OK" : c.status === "timeout" ? "Timeout" : c.status === "denied" ? "Denied" : "Error"}
                  </Pill>
                </li>
              ))}
            </Stack>
          )}
        </div>
      </Card>

      <Card className="border-[var(--danger)] shadow-[var(--shadow-1)]">
        <Cluster justify="between" align="center" gap="3">
          <Cluster gap="2" align="start">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--danger-ink)]" aria-hidden />
            <Stack gap="0">
              <span className="text-sm font-semibold text-[var(--danger-ink)]">Danger zone</span>
              <span className="text-xs text-[var(--text-muted)]">Removing the server cuts agents off from its tools immediately.</span>
            </Stack>
          </Cluster>
          <Button variant="destructive" onClick={() => setConfirmDelete(true)}><Trash2 className="size-4" />Remove server</Button>
        </Cluster>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => { if (!deleting) setConfirmDelete(false); }}
        onConfirm={() => void onDelete()}
        tone="danger"
        title={`Delete ${server.name}?`}
        description="Athena's agents will lose access to its tools."
        confirmLabel="Remove server"
        loading={deleting}
      />
    </Stack>
  );
}

function ConnectionCard({ server }: { server: McpServer }) {
  return (
    <Card>
      <Stack gap="3">
        <h2 className="text-sm font-semibold">Connection</h2>
        <hr className="hr-horizon" aria-hidden />
        <Stack gap="2" className="text-xs">
          <KvRow label="Transport" value={server.transport.toUpperCase()} />
          <KvRow label="Endpoint" value={<span className="truncate font-mono">{server.endpoint_url}</span>} />
          <KvRow label="Auth" value={<AuthValue server={server} />} />
          {server.auth.last_rotated_at && (
            <KvRow label="Last rotated" value={server.auth.last_rotated_at} />
          )}
          <KvRow label="Egress" value={<EgressValue server={server} />} />
        </Stack>
      </Stack>
    </Card>
  );
}

function HealthCard({ server }: { server: McpServer }) {
  const h = server.health;
  return (
    <Card>
      <Stack gap="3">
        <Cluster justify="between" align="center">
          <h2 className="text-sm font-semibold">Health</h2>
          <McpStatusBadge status={h.status} />
        </Cluster>
        <hr className="hr-horizon" aria-hidden />
        {h.status_message && (
          <p className="text-xs text-[var(--text-muted)]">{h.status_message}</p>
        )}
        <Stack gap="2" className="text-xs">
          <KvRow label="Latency p50" value={h.latency_p50_ms ? `${h.latency_p50_ms}ms` : "-"} />
          <KvRow label="Latency p95" value={h.latency_p95_ms ? `${h.latency_p95_ms}ms` : "-"} />
          <KvRow label="Errors 24h"   value={`${(h.error_rate_24h * 100).toFixed(2)}%`} />
          <KvRow label="Uptime 30d"   value={`${(h.uptime_30d * 100).toFixed(2)}%`} />
          <KvRow label="Last check"   value={new Date(h.last_check_at).toLocaleString()} />
        </Stack>
      </Stack>
    </Card>
  );
}

function AuthValue({ server }: { server: McpServer }) {
  const a = server.auth;
  if (a.method === "none") return <Cluster gap="1.5" align="center"><span className="uppercase tracking-wide">None</span></Cluster>;
  if (a.method === "bearer") return <Cluster gap="1.5" align="center"><KeyRound className="size-3" /><span>Bearer {a.bearer_hint && <span className="font-mono">{a.bearer_hint}</span>}</span></Cluster>;
  if (a.method === "oauth") return <Cluster gap="1.5" align="center"><ShieldCheck className="size-3" /><span>OAuth {a.oauth_connected_as && <>· <span className="font-mono">{a.oauth_connected_as}</span></>}</span></Cluster>;
  if (a.method === "mtls") return <Cluster gap="1.5" align="center"><Lock className="size-3" /><span>mTLS {a.mtls_cert_subject && <>· <span className="font-mono">{a.mtls_cert_subject}</span></>}</span></Cluster>;
  return <Cluster gap="1.5" align="center"><Link2 className="size-3" /><span>Header {a.header_name && <span className="font-mono">{a.header_name}</span>}</span></Cluster>;
}

function EgressValue({ server }: { server: McpServer }) {
  if (server.egress_policy === "vpc_peered") return <Cluster gap="1.5" align="center"><Lock className="size-3" />VPC-peered {server.egress_region && <>· {server.egress_region}</>}</Cluster>;
  if (server.egress_policy === "region_pinned") return <Cluster gap="1.5" align="center"><Globe className="size-3" />Region-pinned {server.egress_region && <>· {server.egress_region}</>}</Cluster>;
  return <Cluster gap="1.5" align="center"><Globe className="size-3" />Public internet</Cluster>;
}

const APPROVAL_LABEL: Record<McpToolApproval, string> = {
  none: "No approval",
  per_session: "Per session",
  per_call: "Per call",
};

function ToolRow({
  tool, onToggle, onApprovalChange,
}: {
  tool: McpTool;
  onToggle: (enabled: boolean) => void;
  onApprovalChange: (approval: McpToolApproval) => void;
}) {
  return (
    <details className="group rounded-md border border-[var(--border)] bg-[var(--surface)] transition-colors open:border-[var(--border-strong)]">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-3 py-2 transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] [&::-webkit-details-marker]:hidden">
        <ChevronDown className="size-3.5 shrink-0 -rotate-90 text-[var(--text-subtle)] transition-transform group-open:rotate-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold">{tool.name}</span>
        <RiskTag risk={tool.risk} />
        {tool.added_since_review && (
          <Pill size="sm" tone="warning">New since review</Pill>
        )}
        <Pill size="sm" tone={tool.enabled ? "success" : "neutral"} dot live={tool.enabled}>
          {tool.enabled ? `On · ${APPROVAL_LABEL[tool.approval]}` : "Off"}
        </Pill>
      </summary>
      <div className="px-3 pb-3 pl-9">
        <hr className="hr-horizon mb-3" aria-hidden />
        <div className="grid grid-cols-[1fr_140px_120px_60px] items-start gap-4">
          <Stack gap="0.5">
            <span className="text-xs text-[var(--text-muted)]">{tool.description}</span>
            {tool.last_used_at && (
              <span className="mt-0.5 text-micro text-[var(--text-subtle)]">
                {tool.usage_count_30d} calls last 30d · last {tool.last_used_at}
              </span>
            )}
          </Stack>

          <Stack gap="0.5">
            <Eyebrow>Approval</Eyebrow>
            <Select
              size="sm"
              value={tool.approval}
              disabled={!tool.enabled}
              onChange={(e) => onApprovalChange(e.target.value as McpToolApproval)}
              aria-label={`Approval policy for ${tool.name}`}
            >
              <option value="none">No approval</option>
              <option value="per_session">Per session</option>
              <option value="per_call">Per call</option>
            </Select>
          </Stack>

          <Stack gap="0.5">
            <Eyebrow>Risk</Eyebrow>
            <span className="text-xs capitalize">{tool.risk}</span>
          </Stack>

          <Stack gap="0.5" className="items-end">
            <Eyebrow>{tool.enabled ? "On" : "Off"}</Eyebrow>
            <Switch
              checked={tool.enabled}
              onCheckedChange={onToggle}
              aria-label={`Enable ${tool.name}`}
            />
          </Stack>
        </div>
      </div>
    </details>
  );
}

function RiskTag({ risk }: { risk: McpToolRisk }) {
  const map: Record<McpToolRisk, { label: string; tone: "neutral" | "warning" | "danger" }> = {
    read:        { label: "Read",        tone: "neutral" },
    write:       { label: "Write",       tone: "warning" },
    destructive: { label: "Destructive", tone: "danger" },
  };
  const m = map[risk];
  return <Pill size="sm" tone={m.tone}>{m.label}</Pill>;
}

function KvRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-baseline gap-2">
      <dt className="text-micro font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{label}</dt>
      <dd className="text-xs text-[var(--text)]">{value}</dd>
    </div>
  );
}
