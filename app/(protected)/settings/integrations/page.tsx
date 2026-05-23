"use client";

/**
 * /settings/integrations — integrations marketplace.
 *
 * Grid of tiles grouped by category. Each tile shows connection status; click
 * "Connect" opens a single uniform wizard that takes either an OAuth click,
 * a paste-the-token field, an upload-SAML-XML file, or AWS keys+region.
 */

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Plug, RotateCw, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { useSession } from "@/lib/session/SessionProvider";
import { api, ApiError, type Integration } from "@/lib/api/client";
import { cn } from "@/lib/cn";

const CATEGORY_ORDER = ["Identity", "SCM", "Work mgmt", "Comms", "Knowledge", "Model provider", "Observability", "Incidents", "Feature flags", "Design", "CRM", "Support", "CI/CD"] as const;

export default function IntegrationsPage() {
  const { activeOrgId } = useSession();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [wizardFor, setWizardFor] = useState<Integration | null>(null);
  const [filter, setFilter] = useState<"all" | "connected" | "available" | "coming_soon">("all");

  const refresh = useCallback(async () => {
    if (!activeOrgId) return;
    setLoading(true);
    try { setIntegrations(await api.integrations.list(activeOrgId)); setError(null); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [activeOrgId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const onDisconnect = async (intId: string) => {
    if (!activeOrgId) return;
    if (!window.confirm("Disconnect this integration? Athena will stop reading from it until you reconnect.")) return;
    try {
      const updated = await api.integrations.disconnect(activeOrgId, intId);
      toast.success(`Disconnected ${updated.name}.`);
      void refresh();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : "Disconnect failed."); }
  };

  const onTestConnection = async (intId: string) => {
    if (!activeOrgId) return;
    setConnecting(intId);
    try {
      const result = await api.integrations.test(activeOrgId, intId);
      if (result.ok) toast.success(`Connection OK · ${result.latency_ms}ms`);
      else toast.error(result.detail);
    } catch (e) { toast.error(e instanceof ApiError ? e.message : "Test failed."); }
    finally { setConnecting(null); }
  };

  const filtered = filter === "all" ? integrations : integrations.filter((i) => i.status === filter);
  const grouped = CATEGORY_ORDER.map((cat) => ({ category: cat, items: filtered.filter((i) => i.category === cat) })).filter((g) => g.items.length > 0);

  return (
    <Stack gap="6">
      <Stack gap="1">
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Connect external systems with the same uniform wizard for every provider — OAuth click, paste a token, upload SAML XML, or AWS keys. {integrations.filter((i) => i.status === "connected").length} of {integrations.length} connected.
        </p>
      </Stack>

      <Cluster gap="2">
        {(["all", "connected", "available", "coming_soon"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-md border px-3 py-1 text-xs font-medium capitalize",
              filter === f
                ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]",
            )}
          >
            {f.replace("_", " ")}
          </button>
        ))}
      </Cluster>

      {error && <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]"><p className="text-sm text-[var(--danger)]">{error}</p></Card>}

      {loading ? (
        <Stack gap="6" aria-busy="true" aria-label="Loading integrations">
          {Array.from({ length: 2 }).map((_, g) => (
            <Stack key={g} gap="3">
              <div className="h-3 w-40 animate-pulse rounded-md bg-[var(--surface-2)]" />
              <Grid cols="auto-fit-280" gap="3">
                {Array.from({ length: 4 }).map((__, i) => (
                  <Card key={i}>
                    <Stack gap="3">
                      <Cluster justify="between" align="start">
                        <Cluster gap="2" align="center">
                          <div className="size-10 animate-pulse rounded-lg bg-[var(--surface-2)]" />
                          <Stack gap="1">
                            <div className="h-4 w-28 animate-pulse rounded-md bg-[var(--surface-2)]" />
                            <div className="h-3 w-20 animate-pulse rounded-md bg-[var(--surface-2)]" />
                          </Stack>
                        </Cluster>
                      </Cluster>
                      <div className="h-3 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
                      <div className="h-3 w-5/6 animate-pulse rounded-md bg-[var(--surface-2)]" />
                      <div className="h-7 w-24 animate-pulse rounded-md bg-[var(--surface-2)]" />
                    </Stack>
                  </Card>
                ))}
              </Grid>
            </Stack>
          ))}
        </Stack>
      ) : grouped.map((g) => (
        <Stack key={g.category} gap="3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{g.category} · {g.items.length}</h2>
          <Grid cols="auto-fit-280" gap="3">
            {g.items.map((it) => (
              <Card key={it.id}>
                <Stack gap="3">
                  <Cluster justify="between" align="start">
                    <Cluster gap="2" align="center">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-[var(--surface-2)] text-sm font-semibold">{it.name.slice(0, 2)}</div>
                      <Stack gap="0">
                        <span className="text-sm font-semibold">{it.name}</span>
                        <span className="text-xs text-[var(--text-muted)]">{it.category}</span>
                      </Stack>
                    </Cluster>
                    <Cluster gap="1.5" align="center">
                      {it.provides_mcp && (
                        <span
                          title="Publishes an MCP server — connecting auto-provisions tools at /mcp"
                          className="inline-flex items-center gap-1 rounded-full bg-[var(--primary-soft)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--primary)]"
                        >
                          MCP
                        </span>
                      )}
                      {it.status === "connected" && <CheckCircle2 className="size-4 text-[var(--success)]" />}
                    </Cluster>
                  </Cluster>
                  <p className="line-clamp-2 text-sm text-[var(--text-muted)]">{it.blurb}</p>
                  {it.status === "connected" ? (
                    <Stack gap="2">
                      <div className="text-xs text-[var(--text-muted)]">
                        <div>{it.connected_as}</div>
                        <div>scope: {it.scope}</div>
                        <div>last sync: {it.last_sync}</div>
                      </div>
                      <Cluster gap="2">
                        <Button variant="outline" size="sm" onClick={() => onTestConnection(it.id)} disabled={connecting === it.id}>
                          {connecting === it.id ? <Loader2 className="size-3 animate-spin" /> : <RotateCw className="size-3" />}
                          Test
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => onDisconnect(it.id)}>Disconnect</Button>
                      </Cluster>
                    </Stack>
                  ) : it.status === "available" ? (
                    <Button size="sm" onClick={() => setWizardFor(it)}>
                      <Plug className="size-3" />
                      Connect
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" disabled>Coming soon</Button>
                  )}
                </Stack>
              </Card>
            ))}
          </Grid>
        </Stack>
      ))}

      {wizardFor && <ConnectWizard integration={wizardFor} onClose={() => setWizardFor(null)} onConnected={() => { setWizardFor(null); void refresh(); }} />}
    </Stack>
  );
}

function ConnectWizard({ integration, onClose, onConnected }: { integration: Integration; onClose: () => void; onConnected: () => void }) {
  const { activeOrgId } = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<Record<string, string>>({});

  const onSubmit = async () => {
    if (!activeOrgId) return;
    setPending(true);
    setError(null);
    try {
      await api.integrations.connect(activeOrgId, integration.id, { config });
      toast.success(`Connected ${integration.name}.`);
      onConnected();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Connection failed");
    } finally {
      setPending(false);
    }
  };

  const fields = fieldsFor(integration);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[var(--overlay)] p-4">
      <Card className="w-full max-w-md">
        <Stack gap="4">
          <Cluster justify="between" align="start">
            <Stack gap="0">
              <span className="text-base font-semibold">Connect {integration.name}</span>
              <span className="text-xs text-[var(--text-muted)]">{integration.category}</span>
            </Stack>
            <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)]"><X className="size-4" /></button>
          </Cluster>

          <Card className="border-[var(--border-strong)] bg-[var(--info-soft)]">
            <Cluster gap="2" align="start">
              <AlertTriangle className="size-4 text-[var(--info)]" />
              <p className="text-xs text-[var(--info)]">{integration.instructions ?? "Provide the credentials below to connect."}</p>
            </Cluster>
          </Card>

          <Stack gap="3">
            {fields.map((f) => (
              <label key={f.key} className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--text-muted)]">{f.label}</span>
                <input
                  type={f.type}
                  value={config[f.key] ?? ""}
                  onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
              </label>
            ))}
          </Stack>

          {error && <p className="text-sm text-[var(--danger)]" role="alert">{error}</p>}

          <Cluster gap="2" justify="end">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={onSubmit} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}
              Connect
            </Button>
          </Cluster>
        </Stack>
      </Card>
    </div>
  );
}

function fieldsFor(integration: Integration): { key: string; label: string; type: string; placeholder: string }[] {
  switch (integration.connect_kind) {
    case "oauth":
      return [{ key: "callback_url", label: "OAuth redirect URL", type: "text", placeholder: "Confirmed — click Connect to authorize" }];
    case "token":
      return [
        { key: "api_token", label: "API token", type: "password", placeholder: "Paste the token from the provider's admin UI" },
        { key: "base_url", label: "Workspace URL (optional)", type: "url", placeholder: "https://your-workspace.example" },
      ];
    case "key":
      return [{ key: "api_key", label: "API key", type: "password", placeholder: "sk-... or equivalent" }];
    case "keypair":
      return [
        { key: "api_key", label: "API key", type: "password", placeholder: "API key" },
        { key: "app_key", label: "Application key", type: "password", placeholder: "Application / project key" },
      ];
    case "saml":
      return [
        { key: "metadata_url", label: "Metadata URL", type: "url", placeholder: "https://idp.example.com/saml/metadata" },
        { key: "group_attribute", label: "Group attribute name", type: "text", placeholder: "groups" },
      ];
    case "endpoint":
      return [
        { key: "endpoint", label: "Endpoint URL", type: "url", placeholder: "https://my-resource.openai.azure.com" },
        { key: "api_key", label: "API key", type: "password", placeholder: "Resource key from Azure portal" },
      ];
    case "aws":
      return [
        { key: "role_arn", label: "IAM role ARN", type: "text", placeholder: "arn:aws:iam::123456789012:role/AthenaBedrock" },
        { key: "region",   label: "Region",       type: "text", placeholder: "us-east-1" },
      ];
    case "webhook":
      return [{ key: "webhook_url", label: "Incoming webhook URL", type: "url", placeholder: "https://example.webhook.office.com/..." }];
    default:
      return [{ key: "credential", label: "Credential", type: "password", placeholder: "Provider-specific credential" }];
  }
}
