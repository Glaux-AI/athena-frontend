"use client";

/**
 * /mcp/[id] — single MCP server detail.
 *
 * Surfaces everything an admin needs to operate the server:
 *   - Connection card (URL, transport, auth method, egress policy, version)
 *   - Health card (status, latency, error rate, uptime, last check)
 *   - Drift banner — if tool list changed since last review
 *   - Tools list with enable toggle, approval policy, risk classification
 *   - Recent calls (audit preview)
 *   - Disconnect + Delete in a danger zone
 */

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, Plug, RefreshCw, Trash2, AlertTriangle,
  ShieldCheck, KeyRound, Lock, Globe, Link2,
  CircleDot,
} from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { BrandLogo } from "@/components/brand/brand-logo";
import {
  api, ApiError,
  type McpServer, type McpStatus, type McpTool, type McpToolApproval, type McpToolRisk,
  type McpRecentCall, type Integration,
} from "@/lib/api/client";
import { useSession } from "@/lib/session/SessionProvider";
import { cn } from "@/lib/cn";

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

  /* §5.29.8 row 2 — manual re-discover. Calls the BE `/discover`
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
        toast.success(`Re-discovered — tool list unchanged (${d.tools.length} tools, version ${d.version}).`);
      } else if (delta > 0) {
        toast.warning(`Re-discovered — ${delta} new tool(s) advertised. The server should flip pending_drift; refresh to see the banner.`);
      } else {
        toast.warning(`Re-discovered — ${-delta} tool(s) removed. Review the difference before agents call them.`);
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Discovery failed.");
    } finally {
      setDiscovering(false);
    }
  };

  const onDelete = async () => {
    if (!server) return;
    if (!confirm(`Delete ${server.name}? Athena's agents will lose access to its tools.`)) return;
    try {
      await api.mcp.delete(server.id);
      toast.success(`${server.name} removed.`);
      router.push("/mcp");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Delete failed.");
    }
  };

  if (loading) {
    return (
      <Stack gap="6" aria-busy="true" aria-label="Loading MCP server">
        <Cluster justify="between" align="start" gap="3">
          <Stack gap="2">
            <div className="h-3 w-28 animate-pulse rounded-md bg-[var(--surface-2)]" />
            <Cluster gap="3" align="center">
              <div className="size-10 animate-pulse rounded-md bg-[var(--surface-2)]" />
              <Stack gap="1">
                <div className="h-7 w-56 animate-pulse rounded-md bg-[var(--surface-2)]" />
                <div className="h-3 w-72 animate-pulse rounded-md bg-[var(--surface-2)]" />
              </Stack>
            </Cluster>
          </Stack>
          <div className="h-8 w-36 animate-pulse rounded-md bg-[var(--surface-2)]" />
        </Cluster>
        <Grid cols="auto-fit-280" gap="4">
          <div className="h-44 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
          <div className="h-44 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
        </Grid>
        <Card>
          <Stack gap="3">
            <div className="h-4 w-24 animate-pulse rounded-md bg-[var(--surface-2)]" />
            <Stack gap="2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-14 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
              ))}
            </Stack>
          </Stack>
        </Card>
        <Card>
          <Stack gap="3">
            <div className="h-4 w-32 animate-pulse rounded-md bg-[var(--surface-2)]" />
            <Stack gap="1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-6 w-full animate-pulse rounded bg-[var(--surface-2)]" />
              ))}
            </Stack>
          </Stack>
        </Card>
      </Stack>
    );
  }
  if (error || !server) {
    return (
      <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
        <p className="text-sm text-[var(--danger-ink)]">{error ?? "Not found"}</p>
      </Card>
    );
  }

  const enabledTools = server.tools.filter((t) => t.enabled).length;

  return (
    <Stack gap="6">
      <Cluster justify="between" align="start" gap="3">
        <Stack gap="2">
          <Link href="/mcp" className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
            <ArrowLeft className="size-3.5" /> MCP servers
          </Link>
          <Cluster gap="3" align="center">
            <div className="flex size-10 items-center justify-center rounded-md bg-[var(--surface-2)]">
              {integration ? <BrandLogo name={integration.name} size={24} /> : <Plug className="size-5 text-[var(--text-muted)]" strokeWidth={2.25} />}
            </div>
            <Stack gap="0">
              <h1 className="text-2xl font-semibold tracking-tight">{server.name}</h1>
              <Cluster gap="2" align="center" className="text-xs text-[var(--text-muted)]">
                <span className="font-mono">{server.endpoint_url}</span>
                <span>·</span>
                <span>{server.source === "integration" ? "Integration" : "Custom"}</span>
                {server.version && <><span>·</span><span className="font-mono">v{server.version}</span></>}
              </Cluster>
            </Stack>
          </Cluster>
        </Stack>
        <Cluster gap="2">
          <Button variant="outline" onClick={onTest} disabled={testing}>
            {testing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Test connection
          </Button>
          <Button variant="outline" onClick={onDiscover} disabled={discovering}>
            {discovering ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Re-discover tools
          </Button>
        </Cluster>
      </Cluster>

      {server.pending_drift && (
        <Card className="border-[var(--warning)] bg-[var(--warning-soft)]">
          <Cluster justify="between" align="start" gap="3">
            <Cluster gap="2" align="start">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--warning-ink)]" />
              <Stack gap="1">
                <span className="text-sm font-semibold text-[var(--warning-ink)]">Tool list changed since last review</span>
                <span className="text-xs text-[var(--text-muted)]">
                  The server&apos;s tool catalog drifted from what your team last approved. Review new tools before agents can use them — destructive tools stay disabled by default.
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

      <Card>
        <Stack gap="4">
          <Cluster justify="between" align="center">
            <Stack gap="0">
              <h2 className="text-base font-semibold">Tools</h2>
              <span className="text-xs text-[var(--text-muted)]">
                {enabledTools} of {server.tools.length} enabled · last reviewed {server.version_last_reviewed ?? "—"}
              </span>
            </Stack>
          </Cluster>
          <Stack gap="2" as="ul">
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
        </Stack>
      </Card>

      <Card>
        <Stack gap="3">
          <h2 className="text-base font-semibold">Recent calls</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No tool calls yet.</p>
          ) : (
            <Stack gap="1" as="ul">
              {recent.map((c) => (
                <li key={c.id} className="grid grid-cols-[80px_140px_1fr_72px_80px] items-baseline gap-3 border-b border-[var(--border)] py-2 last:border-b-0 text-sm">
                  <span className="text-xs text-[var(--text-muted)]">{c.when}</span>
                  <span className="truncate font-mono text-xs">{c.tool_name}</span>
                  <span className="truncate text-xs text-[var(--text-muted)]">{c.actor}{c.result_preview ? ` · ${c.result_preview}` : ""}</span>
                  <span className="text-right text-xs font-mono tabular-nums text-[var(--text-muted)]">{c.duration_ms}ms</span>
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-center",
                    c.status === "ok" ? "bg-[var(--success-soft)] text-[var(--success-ink)]"
                    : c.status === "timeout" ? "bg-[var(--warning-soft)] text-[var(--warning-ink)]"
                    : "bg-[var(--danger-soft)] text-[var(--danger-ink)]"
                  )}>{c.status}</span>
                </li>
              ))}
            </Stack>
          )}
        </Stack>
      </Card>

      <Card className="border-[var(--border-strong)]">
        <Cluster justify="between" align="center" gap="3">
          <Stack gap="0">
            <span className="text-sm font-semibold">Danger zone</span>
            <span className="text-xs text-[var(--text-muted)]">Removing the server cuts agents off from its tools immediately.</span>
          </Stack>
          <Button variant="destructive" onClick={onDelete}><Trash2 className="size-4" />Remove server</Button>
        </Cluster>
      </Card>
    </Stack>
  );
}

function ConnectionCard({ server }: { server: McpServer }) {
  return (
    <Card>
      <Stack gap="3">
        <h2 className="text-sm font-semibold">Connection</h2>
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
          <StatusDot status={h.status} />
        </Cluster>
        {h.status_message && (
          <p className="text-xs text-[var(--text-muted)]">{h.status_message}</p>
        )}
        <Stack gap="2" className="text-xs">
          <KvRow label="Latency p50" value={h.latency_p50_ms ? `${h.latency_p50_ms}ms` : "—"} />
          <KvRow label="Latency p95" value={h.latency_p95_ms ? `${h.latency_p95_ms}ms` : "—"} />
          <KvRow label="Errors 24h"   value={`${(h.error_rate_24h * 100).toFixed(2)}%`} />
          <KvRow label="Uptime 30d"   value={`${(h.uptime_30d * 100).toFixed(2)}%`} />
          <KvRow label="Last check"   value={new Date(h.last_check_at).toLocaleString()} />
        </Stack>
      </Stack>
    </Card>
  );
}

function StatusDot({ status }: { status: McpStatus }) {
  const map: Record<McpStatus, { color: string; label: string }> = {
    connected:      { color: "text-[var(--success)]",  label: "Connected" },
    degraded:       { color: "text-[var(--warning)]",  label: "Degraded" },
    error:          { color: "text-[var(--danger)]",   label: "Error" },
    disconnected:   { color: "text-[var(--text-muted)]", label: "Disconnected" },
    pending_review: { color: "text-[var(--info)]",     label: "Pending review" },
  };
  const m = map[status];
  return (
    <Cluster gap="1.5" align="center" className="text-xs">
      <CircleDot className={cn("size-3.5", m.color)} />
      <span className="font-semibold">{m.label}</span>
    </Cluster>
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

function ToolRow({
  tool, onToggle, onApprovalChange,
}: {
  tool: McpTool;
  onToggle: (enabled: boolean) => void;
  onApprovalChange: (approval: McpToolApproval) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_140px_120px_60px] items-start gap-4 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 transition-colors hover:bg-[var(--surface-2)]">
      <Stack gap="0.5">
        <Cluster gap="2" align="center">
          <span className="font-mono text-sm font-semibold">{tool.name}</span>
          <RiskTag risk={tool.risk} />
          {tool.added_since_review && (
            <span className="rounded-full bg-[var(--warning-soft)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--warning-ink)]">
              new since review
            </span>
          )}
        </Cluster>
        <span className="text-xs text-[var(--text-muted)]">{tool.description}</span>
        {tool.last_used_at && (
          <span className="mt-0.5 text-[10.5px] text-[var(--text-subtle)]">
            {tool.usage_count_30d} calls last 30d · last {tool.last_used_at}
          </span>
        )}
      </Stack>

      <Stack gap="0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Approval</span>
        <select
          value={tool.approval}
          disabled={!tool.enabled}
          onChange={(e) => onApprovalChange(e.target.value as McpToolApproval)}
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text)] focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-50"
        >
          <option value="none">No approval</option>
          <option value="per_session">Per session</option>
          <option value="per_call">Per call</option>
        </select>
      </Stack>

      <Stack gap="0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Risk</span>
        <span className="text-xs capitalize">{tool.risk}</span>
      </Stack>

      <label className="inline-flex cursor-pointer flex-col items-end gap-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
          {tool.enabled ? "On" : "Off"}
        </span>
        <Toggle checked={tool.enabled} onChange={onToggle} />
      </label>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
        checked ? "bg-[var(--primary)]" : "bg-[var(--surface-3)]"
      )}
    >
      <span
        className={cn(
          "inline-block size-4 rounded-full bg-[var(--primary-fg)] shadow transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

function RiskTag({ risk }: { risk: McpToolRisk }) {
  const map: Record<McpToolRisk, { label: string; cls: string }> = {
    read:        { label: "Read",        cls: "bg-[var(--surface-2)] text-[var(--text-muted)]" },
    write:       { label: "Write",       cls: "bg-[var(--warning-soft)] text-[var(--warning-ink)]" },
    destructive: { label: "Destructive", cls: "bg-[var(--danger-soft)] text-[var(--danger-ink)]" },
  };
  const m = map[risk];
  return (
    <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider", m.cls)}>
      {m.label}
    </span>
  );
}

function KvRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-baseline gap-2">
      <dt className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-[var(--text-subtle)]">{label}</dt>
      <dd className="text-xs text-[var(--text)]">{value}</dd>
    </div>
  );
}
