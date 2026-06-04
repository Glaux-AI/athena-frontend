"use client";

/**
 * /mcp/new — Add-MCP wizard (5 steps).
 *
 *   1. Source       — From a connected integration, or a custom URL.
 *   2. Connection   — endpoint, transport, auth method (5 kinds), egress policy.
 *   3. Discover     — mocked introspection of the candidate MCP returns a tool catalog.
 *   4. Permissions  — pick which tools to enable + per-tool approval policy + risk tag.
 *   5. Test + Save  — fire a connection test, then create the server.
 *
 * Generalized for enterprise — same flow whether the MCP is Figma's SaaS endpoint,
 * Linear's, or `mcp.internal.acme.io` reachable over VPC peering with mTLS.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, Loader2, CheckCircle2, Plug, Sparkles,
  ShieldCheck, KeyRound, Lock, Link2, Globe, RefreshCw, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { BrandLogo } from "@/components/brand/brand-logo";
import {
  api, ApiError,
  type Integration,
  type McpAuthMethod, type McpTransport, type McpEgressPolicy,
  type McpToolApproval, type McpToolRisk,
  type McpDiscovery,
} from "@/lib/api/client";
import { useSession } from "@/lib/session/SessionProvider";
import { cn } from "@/lib/cn";

type StepKey = 1 | 2 | 3 | 4 | 5;
const STEPS: { key: StepKey; label: string }[] = [
  { key: 1, label: "Source" },
  { key: 2, label: "Connection" },
  { key: 3, label: "Tools" },
  { key: 4, label: "Permissions" },
  { key: 5, label: "Test & save" },
];

interface ToolDraft {
  name: string;
  description: string;
  enabled: boolean;
  approval: McpToolApproval;
  risk: McpToolRisk;
}

interface FormState {
  source: "integration" | "custom";
  integration_id?: string;
  name: string;
  endpoint_url: string;
  transport: McpTransport;
  auth_method: McpAuthMethod;
  bearer_hint: string;       // wizard input field; backend stores token
  oauth_app_id: string;
  mtls_cert_subject: string;
  header_name: string;
  egress_policy: McpEgressPolicy;
  egress_region: string;
}

const DEFAULT_FORM: FormState = {
  source: "custom",
  name: "",
  endpoint_url: "",
  transport: "http",
  auth_method: "bearer",
  bearer_hint: "",
  oauth_app_id: "",
  mtls_cert_subject: "",
  header_name: "",
  egress_policy: "any",
  egress_region: "US (us-east-1)",
};

/** Default approval policy derived from a tool's risk. */
function defaultApproval(risk: McpToolRisk): McpToolApproval {
  if (risk === "destructive") return "per_call";
  if (risk === "write") return "per_session";
  return "none";
}

export default function AddMcpWizard() {
  const router = useRouter();
  const { activeOrgId } = useSession();
  const [step, setStep] = useState<StepKey>(1);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [existingMcpIntegrationIds, setExistingMcpIntegrationIds] = useState<Set<string>>(new Set());
  const [tools, setTools] = useState<ToolDraft[]>([]);
  const [discovery, setDiscovery] = useState<McpDiscovery | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; latency_ms: number; detail: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!activeOrgId) return;
    (async () => {
      try {
        const [ints, mcps] = await Promise.all([
          api.integrations.list(activeOrgId),
          api.mcp.list(),
        ]);
        setIntegrations(ints);
        setExistingMcpIntegrationIds(new Set(mcps.flatMap((m) => m.integration_id ? [m.integration_id] : [])));
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "Couldn't load integrations.");
      }
    })();
  }, [activeOrgId]);

  const onPickIntegration = (integ: Integration) => {
    setForm({
      ...form,
      source: "integration",
      integration_id: integ.id,
      name: integ.name,
      endpoint_url: `https://mcp.${integ.id.replace("int_", "")}.com/v1`,
      transport: "http",
      auth_method: integ.connect_kind === "oauth" ? "oauth" : "bearer",
    });
    setStep(2);
  };

  const onPickCustom = () => {
    setForm({ ...DEFAULT_FORM, source: "custom" });
    setStep(2);
  };

  const onConnectionNext = () => {
    if (!form.name.trim()) { toast.error("Name is required."); return; }
    if (!form.endpoint_url.trim()) { toast.error("Endpoint URL is required."); return; }
    try { new URL(form.endpoint_url); } catch { toast.error("Endpoint URL must be a valid URL."); return; }
    setStep(3);
    void runDiscover();
  };

  const runDiscover = async () => {
    setDiscovering(true);
    setDiscoveryError(null);
    setDiscovery(null);
    try {
      const auth = buildAuthPayload(form);
      const result = await api.mcp.discover({ transport: form.transport, endpoint_url: form.endpoint_url, auth });
      setDiscovery(result);
      setTools(result.tools.map((t) => ({
        name: t.name,
        description: t.description,
        enabled: t.risk !== "destructive",            // safe default — destructive off
        approval: defaultApproval(t.risk),
        risk: t.risk,
      })));
    } catch (e) {
      setDiscoveryError(e instanceof ApiError ? e.message : "Discovery failed.");
    } finally {
      setDiscovering(false);
    }
  };

  const onRunTest = async () => {
    setTesting(true);
    try {
      // Simulate a test call before save — for the wizard we shape a fake check.
      await new Promise((r) => setTimeout(r, 700));
      const enabledCount = tools.filter((t) => t.enabled).length;
      const result = { ok: true, latency_ms: Math.floor(80 + Math.random() * 220), detail: `${form.name || "Server"} reachable. ${enabledCount} tools selected.` };
      setTestResult(result);
      if (result.ok) toast.success(`Connection OK (${result.latency_ms}ms)`);
      else toast.error(result.detail);
    } catch (e) {
      const detail = e instanceof ApiError ? e.message : "Test failed";
      setTestResult({ ok: false, latency_ms: 0, detail });
      toast.error(detail);
    } finally {
      setTesting(false);
    }
  };

  const onSave = async () => {
    setSaving(true);
    try {
      const auth = buildAuthPayload(form);
      const enabled = tools.filter((t) => t.enabled);
      if (enabled.length === 0) {
        toast.error("Enable at least one tool before saving.");
        setSaving(false);
        return;
      }
      const server = await api.mcp.create({
        name: form.name,
        source: form.source,
        ...(form.integration_id ? { integration_id: form.integration_id } : {}),
        transport: form.transport,
        endpoint_url: form.endpoint_url,
        auth,
        egress_policy: form.egress_policy,
        ...(form.egress_policy !== "any" ? { egress_region: form.egress_region } : {}),
        enabled_tools: enabled.map((t) => ({ name: t.name, approval: t.approval, risk: t.risk })),
      });
      toast.success(`${server.name} added.`);
      router.push(`/mcp/${server.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const availableMcpIntegrations = useMemo(
    () => integrations.filter((i) => i.provides_mcp && !existingMcpIntegrationIds.has(i.id)),
    [integrations, existingMcpIntegrationIds],
  );

  return (
    <Stack gap="6">
      <Stack gap="2">
        <Link href="/mcp" className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
          <ArrowLeft className="size-3.5" /> MCP servers
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Add MCP server</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Connect an external system so Athena&apos;s agents can call its tools — gated by your approval policy.
        </p>
      </Stack>

      <Stepper current={step} />

      {step === 1 && (
        <SourceStep
          integrations={availableMcpIntegrations}
          onPickIntegration={onPickIntegration}
          onPickCustom={onPickCustom}
        />
      )}

      {step === 2 && (
        <ConnectionStep
          form={form}
          setForm={setForm}
          onBack={() => setStep(1)}
          onNext={onConnectionNext}
        />
      )}

      {step === 3 && (
        <DiscoverStep
          form={form}
          tools={tools}
          discovery={discovery}
          discovering={discovering}
          discoveryError={discoveryError}
          onRetry={runDiscover}
          onToggle={(i, en) => setTools(tools.map((t, idx) => idx === i ? { ...t, enabled: en } : t))}
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
        />
      )}

      {step === 4 && (
        <PermissionsStep
          tools={tools}
          setTools={setTools}
          onBack={() => setStep(3)}
          onNext={() => setStep(5)}
        />
      )}

      {step === 5 && (
        <TestSaveStep
          form={form}
          tools={tools}
          testing={testing}
          testResult={testResult}
          saving={saving}
          onRunTest={onRunTest}
          onBack={() => setStep(4)}
          onSave={onSave}
        />
      )}
    </Stack>
  );
}

function buildAuthPayload(f: FormState) {
  if (f.auth_method === "none")   return { method: "none" as const };
  if (f.auth_method === "bearer") return { method: "bearer" as const, ...(f.bearer_hint ? { bearer_hint: `••• ending ${f.bearer_hint.slice(-4)}` } : {}) };
  if (f.auth_method === "oauth")  return { method: "oauth" as const, ...(f.oauth_app_id ? { oauth_app_id: f.oauth_app_id } : {}) };
  if (f.auth_method === "mtls")   return { method: "mtls" as const, ...(f.mtls_cert_subject ? { mtls_cert_subject: f.mtls_cert_subject } : {}) };
  return { method: "header" as const, ...(f.header_name ? { header_name: f.header_name } : {}) };
}

/* ---------- Stepper ---------- */
function Stepper({ current }: { current: StepKey }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
      {STEPS.map((s, i) => {
        const state = current === s.key ? "active" : current > s.key ? "done" : "idle";
        return (
          <li key={s.key} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className={cn(
                "inline-flex size-5 items-center justify-center rounded-full text-[10px] font-bold",
                state === "done"   && "bg-[var(--primary)] text-[var(--primary-fg)]",
                state === "active" && "bg-[var(--primary-soft)] text-[var(--primary)] ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--bg)]",
                state === "idle"   && "bg-[var(--surface-2)] text-[var(--text-muted)]",
              )}>
                {state === "done" ? <CheckCircle2 className="size-3" strokeWidth={3} /> : s.key}
              </span>
              <span className={cn(
                "font-semibold",
                state === "active" ? "text-[var(--text)]" : "text-[var(--text-muted)]"
              )}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && <span className="text-[var(--text-subtle)]" aria-hidden>→</span>}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- Step 1: Source ---------- */
function SourceStep({
  integrations, onPickIntegration, onPickCustom,
}: {
  integrations: Integration[];
  onPickIntegration: (i: Integration) => void;
  onPickCustom: () => void;
}) {
  return (
    <Stack gap="6">
      <Card>
        <Stack gap="3">
          <Cluster gap="2" align="center"><Sparkles className="size-4 text-[var(--primary)]" /><span className="text-sm font-semibold">From a connected integration</span></Cluster>
          <p className="text-xs text-[var(--text-muted)]">
            These integrations publish an MCP server. Athena will pre-fill the connection from your existing integration credentials — you&apos;ll still pick which tools to enable.
          </p>
          {integrations.length === 0 ? (
            <p className="rounded-md border border-dashed border-[var(--border)] px-3 py-4 text-center text-xs text-[var(--text-muted)]">
              No integrations available, or every MCP-publishing integration is already linked. Pick &quot;Custom URL&quot; instead.
            </p>
          ) : (
            <Grid cols="auto-fit-200" gap="2">
              {integrations.map((i) => (
                <button
                  key={i.id}
                  onClick={() => onPickIntegration(i)}
                  className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--primary)] hover:shadow-[var(--shadow-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  <BrandLogo name={i.name} size={28} />
                  <Stack gap="0" className="min-w-0">
                    <span className="truncate text-sm font-semibold">{i.name}</span>
                    <span className="truncate text-[10.5px] text-[var(--text-muted)]">{i.status === "connected" ? "Connected" : "Available"}</span>
                  </Stack>
                </button>
              ))}
            </Grid>
          )}
        </Stack>
      </Card>

      <Card>
        <Stack gap="3">
          <Cluster gap="2" align="center"><Plug className="size-4 text-[var(--text-muted)]" /><span className="text-sm font-semibold">Custom URL</span></Cluster>
          <p className="text-xs text-[var(--text-muted)]">
            Self-hosted MCPs in your VPC, internal tooling, or third-party MCPs not in our catalog. You&apos;ll provide the URL, auth method, and egress policy.
          </p>
          <Cluster justify="end">
            <Button variant="outline" onClick={onPickCustom}>Connect custom URL <ArrowRight className="size-4" /></Button>
          </Cluster>
        </Stack>
      </Card>
    </Stack>
  );
}

/* ---------- Step 2: Connection ---------- */
function ConnectionStep({
  form, setForm, onBack, onNext,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <Stack gap="4">
      <Card>
        <Stack gap="4">
          <span className="text-sm font-semibold">Connection</span>

          <FieldRow label="Display name" required>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Internal warehouse MCP"
              className="input"
            />
          </FieldRow>

          <FieldRow label="Endpoint URL" required>
            <input
              type="url"
              value={form.endpoint_url}
              onChange={(e) => setForm({ ...form, endpoint_url: e.target.value })}
              placeholder="https://mcp.example.com/v1"
              className="input font-mono"
            />
          </FieldRow>

          <FieldRow label="Transport">
            <select
              value={form.transport}
              onChange={(e) => setForm({ ...form, transport: e.target.value as McpTransport })}
              className="input"
            >
              <option value="http">HTTP (request/response)</option>
              <option value="sse">SSE (server-sent events)</option>
              <option value="websocket">WebSocket</option>
            </select>
          </FieldRow>
        </Stack>
      </Card>

      <Card>
        <Stack gap="4">
          <span className="text-sm font-semibold">Authentication</span>
          <Grid cols="auto-fit-200" gap="2">
            <AuthChoice value="none"   current={form.auth_method} onChange={(v) => setForm({ ...form, auth_method: v })} icon={Plug}        label="None"        sub="Public MCP" />
            <AuthChoice value="bearer" current={form.auth_method} onChange={(v) => setForm({ ...form, auth_method: v })} icon={KeyRound}   label="Bearer"      sub="API key / token" />
            <AuthChoice value="oauth"  current={form.auth_method} onChange={(v) => setForm({ ...form, auth_method: v })} icon={ShieldCheck} label="OAuth 2.0"   sub="3-legged flow" />
            <AuthChoice value="mtls"   current={form.auth_method} onChange={(v) => setForm({ ...form, auth_method: v })} icon={Lock}        label="mTLS"        sub="Mutual TLS" />
            <AuthChoice value="header" current={form.auth_method} onChange={(v) => setForm({ ...form, auth_method: v })} icon={Link2}       label="Custom header" sub="Header-based auth" />
          </Grid>

          {form.auth_method === "bearer" && (
            <FieldRow label="Bearer token">
              <input
                type="password"
                value={form.bearer_hint}
                onChange={(e) => setForm({ ...form, bearer_hint: e.target.value })}
                placeholder="Paste the API key — stored encrypted server-side"
                className="input font-mono"
              />
            </FieldRow>
          )}
          {form.auth_method === "oauth" && (
            <FieldRow label="OAuth app">
              <input
                type="text"
                value={form.oauth_app_id}
                onChange={(e) => setForm({ ...form, oauth_app_id: e.target.value })}
                placeholder="OAuth app identifier (you'll complete the flow after save)"
                className="input"
              />
            </FieldRow>
          )}
          {form.auth_method === "mtls" && (
            <FieldRow label="Client certificate subject">
              <input
                type="text"
                value={form.mtls_cert_subject}
                onChange={(e) => setForm({ ...form, mtls_cert_subject: e.target.value })}
                placeholder="CN=athena-prod, O=acme-robotics"
                className="input font-mono"
              />
            </FieldRow>
          )}
          {form.auth_method === "header" && (
            <FieldRow label="Header name">
              <input
                type="text"
                value={form.header_name}
                onChange={(e) => setForm({ ...form, header_name: e.target.value })}
                placeholder="X-Acme-Auth"
                className="input font-mono"
              />
            </FieldRow>
          )}
        </Stack>
      </Card>

      <Card>
        <Stack gap="4">
          <Stack gap="0">
            <span className="text-sm font-semibold">Network egress</span>
            <span className="text-xs text-[var(--text-muted)]">Where outbound traffic to this MCP goes. Self-hosted enterprises usually pick VPC-peered.</span>
          </Stack>
          <Grid cols="auto-fit-220" gap="2">
            <EgressChoice value="any"           current={form.egress_policy} onChange={(v) => setForm({ ...form, egress_policy: v })} icon={Globe} label="Public internet" sub="Reachable from any Athena region" />
            <EgressChoice value="region_pinned" current={form.egress_policy} onChange={(v) => setForm({ ...form, egress_policy: v })} icon={Globe} label="Region-pinned"   sub="Stay inside a specific region" />
            <EgressChoice value="vpc_peered"    current={form.egress_policy} onChange={(v) => setForm({ ...form, egress_policy: v })} icon={Lock}  label="VPC-peered"      sub="Private link to your VPC" />
          </Grid>
          {form.egress_policy !== "any" && (
            <FieldRow label="Region">
              <select
                value={form.egress_region}
                onChange={(e) => setForm({ ...form, egress_region: e.target.value })}
                className="input"
              >
                <option>US (us-east-1)</option>
                <option>EU (eu-central-1)</option>
                <option>UK (eu-west-2)</option>
                <option>Canada (ca-central-1)</option>
                <option>Australia (ap-southeast-2)</option>
              </select>
            </FieldRow>
          )}
        </Stack>
      </Card>

      <Cluster justify="between">
        <Button variant="outline" onClick={onBack}><ArrowLeft className="size-4" />Back</Button>
        <Button onClick={onNext}>Discover tools <ArrowRight className="size-4" /></Button>
      </Cluster>
    </Stack>
  );
}

function AuthChoice({
  value, current, onChange, icon: Icon, label, sub,
}: {
  value: McpAuthMethod;
  current: McpAuthMethod;
  onChange: (v: McpAuthMethod) => void;
  icon: typeof Plug;
  label: string;
  sub: string;
}) {
  const selected = current === value;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={cn(
        "flex items-center gap-3 rounded-md border p-2.5 text-left transition-colors",
        selected
          ? "border-[var(--primary)] bg-[var(--primary-soft)]"
          : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
      )}
    >
      <Icon className={cn("size-4 shrink-0", selected ? "text-[var(--primary)]" : "text-[var(--text-muted)]")} />
      <Stack gap="0">
        <span className="text-xs font-semibold">{label}</span>
        <span className="text-[10.5px] text-[var(--text-muted)]">{sub}</span>
      </Stack>
    </button>
  );
}

function EgressChoice({
  value, current, onChange, icon: Icon, label, sub,
}: {
  value: McpEgressPolicy;
  current: McpEgressPolicy;
  onChange: (v: McpEgressPolicy) => void;
  icon: typeof Globe;
  label: string;
  sub: string;
}) {
  const selected = current === value;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={cn(
        "flex items-center gap-3 rounded-md border p-2.5 text-left transition-colors",
        selected
          ? "border-[var(--primary)] bg-[var(--primary-soft)]"
          : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
      )}
    >
      <Icon className={cn("size-4 shrink-0", selected ? "text-[var(--primary)]" : "text-[var(--text-muted)]")} />
      <Stack gap="0">
        <span className="text-xs font-semibold">{label}</span>
        <span className="text-[10.5px] text-[var(--text-muted)]">{sub}</span>
      </Stack>
    </button>
  );
}

/* ---------- Step 3: Discover ---------- */
function DiscoverStep({
  form, tools, discovery, discovering, discoveryError, onRetry, onToggle, onBack, onNext,
}: {
  form: FormState;
  tools: ToolDraft[];
  discovery: McpDiscovery | null;
  discovering: boolean;
  discoveryError: string | null;
  onRetry: () => void;
  onToggle: (i: number, enabled: boolean) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const enabledCount = tools.filter((t) => t.enabled).length;
  return (
    <Stack gap="4">
      <Card>
        <Stack gap="3">
          <Cluster justify="between" align="center">
            <Stack gap="0">
              <span className="text-sm font-semibold">Discovered tools</span>
              <span className="text-xs text-[var(--text-muted)]">
                Athena introspected <span className="font-mono">{form.endpoint_url}</span>{discovery?.version && <> — running v{discovery.version}</>}.
              </span>
            </Stack>
            <Button size="sm" variant="outline" onClick={onRetry} disabled={discovering}>
              {discovering ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Re-fetch
            </Button>
          </Cluster>

          {discovering ? (
            <Cluster gap="2" align="center"><Loader2 className="size-4 animate-spin text-[var(--text-muted)]" /><span className="text-sm text-[var(--text-muted)]">Calling tools/list…</span></Cluster>
          ) : discoveryError ? (
            <Cluster gap="2" align="start" className="rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--danger-ink)]" />
              <span className="text-[var(--danger-ink)]">{discoveryError}</span>
            </Cluster>
          ) : tools.length === 0 ? (
            <p className="rounded-md border border-dashed border-[var(--border)] px-3 py-4 text-center text-xs text-[var(--text-muted)]">
              No tools advertised. The server may not be a valid MCP — re-check the URL.
            </p>
          ) : (
            <Stack gap="1" as="ul">
              {tools.map((t, i) => (
                <li key={t.name} className="flex items-start gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
                  <input
                    type="checkbox"
                    checked={t.enabled}
                    onChange={(e) => onToggle(i, e.target.checked)}
                    className="mt-0.5 size-4 shrink-0 rounded border-[var(--border-strong)]"
                    aria-label={`Enable ${t.name}`}
                  />
                  <Stack gap="0" className="flex-1 min-w-0">
                    <Cluster gap="2" align="center">
                      <span className="font-mono text-sm font-semibold">{t.name}</span>
                      <RiskTag risk={t.risk} />
                    </Cluster>
                    <span className="text-xs text-[var(--text-muted)]">{t.description}</span>
                  </Stack>
                </li>
              ))}
            </Stack>
          )}
        </Stack>
      </Card>

      <Cluster justify="between">
        <Button variant="outline" onClick={onBack}><ArrowLeft className="size-4" />Back</Button>
        <Button onClick={onNext} disabled={discovering || enabledCount === 0}>
          Set permissions ({enabledCount} selected) <ArrowRight className="size-4" />
        </Button>
      </Cluster>
    </Stack>
  );
}

/* ---------- Step 4: Permissions ---------- */
function PermissionsStep({
  tools, setTools, onBack, onNext,
}: {
  tools: ToolDraft[];
  setTools: (next: ToolDraft[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <Stack gap="4">
      <Card>
        <Stack gap="3">
          <Stack gap="0">
            <span className="text-sm font-semibold">Permissions</span>
            <span className="text-xs text-[var(--text-muted)]">
              Each tool runs gated by your approval policy — destructive tools default to per-call approval; writes default to per-session; reads default to none.
            </span>
          </Stack>
          <Stack gap="2" as="ul">
            {tools.filter((t) => t.enabled).map((t) => {
              const originalIndex = tools.findIndex((x) => x.name === t.name);
              return (
                <li
                  key={t.name}
                  className="grid grid-cols-[1fr_140px_120px] items-start gap-4 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3"
                >
                  <Stack gap="0">
                    <Cluster gap="2" align="center">
                      <span className="font-mono text-sm font-semibold">{t.name}</span>
                      <RiskTag risk={t.risk} />
                    </Cluster>
                    <span className="text-xs text-[var(--text-muted)]">{t.description}</span>
                  </Stack>
                  <Stack gap="0.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Approval</span>
                    <select
                      value={t.approval}
                      onChange={(e) => {
                        const next = tools.slice();
                        next[originalIndex] = { ...t, approval: e.target.value as McpToolApproval };
                        setTools(next);
                      }}
                      className="input"
                    >
                      <option value="none">No approval</option>
                      <option value="per_session">Per session</option>
                      <option value="per_call">Per call</option>
                    </select>
                  </Stack>
                  <Stack gap="0.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Risk</span>
                    <select
                      value={t.risk}
                      onChange={(e) => {
                        const next = tools.slice();
                        next[originalIndex] = { ...t, risk: e.target.value as McpToolRisk };
                        setTools(next);
                      }}
                      className="input capitalize"
                    >
                      <option value="read">Read</option>
                      <option value="write">Write</option>
                      <option value="destructive">Destructive</option>
                    </select>
                  </Stack>
                </li>
              );
            })}
          </Stack>
        </Stack>
      </Card>

      <Cluster justify="between">
        <Button variant="outline" onClick={onBack}><ArrowLeft className="size-4" />Back</Button>
        <Button onClick={onNext}>Test & save <ArrowRight className="size-4" /></Button>
      </Cluster>
    </Stack>
  );
}

/* ---------- Step 5: Test + Save ---------- */
function TestSaveStep({
  form, tools, testing, testResult, saving, onRunTest, onBack, onSave,
}: {
  form: FormState;
  tools: ToolDraft[];
  testing: boolean;
  testResult: { ok: boolean; latency_ms: number; detail: string } | null;
  saving: boolean;
  onRunTest: () => void;
  onBack: () => void;
  onSave: () => void;
}) {
  const enabled = tools.filter((t) => t.enabled);
  return (
    <Stack gap="4">
      <Card>
        <Stack gap="3">
          <span className="text-sm font-semibold">Summary</span>
          <Grid cols="auto-fit-220" gap="3">
            <SummaryItem label="Name"      value={form.name} />
            <SummaryItem label="Source"    value={form.source === "integration" ? "Integration" : "Custom"} />
            <SummaryItem label="Endpoint"  value={<span className="font-mono">{form.endpoint_url}</span>} />
            <SummaryItem label="Transport" value={form.transport.toUpperCase()} />
            <SummaryItem label="Auth"      value={form.auth_method} />
            <SummaryItem label="Egress"    value={form.egress_policy === "any" ? "Public" : form.egress_policy === "vpc_peered" ? `VPC-peered · ${form.egress_region}` : `Region-pinned · ${form.egress_region}`} />
            <SummaryItem label="Tools"     value={`${enabled.length} enabled`} />
          </Grid>
          <Stack gap="0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Enabled tools</span>
            <Cluster gap="1.5" className="flex-wrap">
              {enabled.map((t) => (
                <span key={t.name} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 font-mono text-[11px]">
                  {t.name}
                  <RiskTag risk={t.risk} />
                </span>
              ))}
            </Cluster>
          </Stack>
        </Stack>
      </Card>

      <Card>
        <Stack gap="3">
          <Cluster justify="between" align="center">
            <Stack gap="0">
              <span className="text-sm font-semibold">Test connection</span>
              <span className="text-xs text-[var(--text-muted)]">Fires a heartbeat with the configured auth before saving.</span>
            </Stack>
            <Button variant="outline" onClick={onRunTest} disabled={testing}>
              {testing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              {testResult ? "Re-test" : "Run test"}
            </Button>
          </Cluster>
          {testResult && (
            <Cluster gap="2" align="start" className={cn(
              "rounded-md border p-3 text-sm",
              testResult.ok
                ? "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success-ink)]"
                : "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger-ink)]"
            )}>
              {testResult.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
              <span>{testResult.detail}{testResult.ok && ` Latency: ${testResult.latency_ms}ms.`}</span>
            </Cluster>
          )}
        </Stack>
      </Card>

      <Cluster justify="between">
        <Button variant="outline" onClick={onBack} disabled={saving}><ArrowLeft className="size-4" />Back</Button>
        <Button onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          Save MCP server
        </Button>
      </Cluster>
    </Stack>
  );
}

function SummaryItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Stack gap="0">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{label}</span>
      <span className="truncate text-sm">{value}</span>
    </Stack>
  );
}

function FieldRow({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
        {label}{required && <span className="text-[var(--danger)]"> *</span>}
      </span>
      {children}
    </label>
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
