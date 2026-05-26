"use client";

/**
 * /settings/integrations — integrations marketplace.
 *
 * Grid of tiles grouped by category. Each tile shows connection status; click
 * "Connect" opens a single uniform wizard that takes either an OAuth click,
 * a paste-the-token field, an upload-SAML-XML file, or AWS keys+region.
 *
 * Demo mode (`config.isMock`):
 *   - Available integrations: "Connect" is disabled with a Demo-mode tooltip.
 *   - Connected integrations: Disconnect / Test buttons are hidden; the tile
 *     becomes a read-only details card.
 *   - A banner at the top of the page explains the read-only posture.
 */

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Github, Lock, Loader2, Plug, RotateCw, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { useSession } from "@/lib/session/SessionProvider";
import { api, ApiError, type Integration, type JsonSchema } from "@/lib/api/client";
import { config } from "@/lib/config";
import { cn } from "@/lib/cn";

const CATEGORY_ORDER = ["Identity", "SCM", "Work mgmt", "Comms", "Knowledge", "Model provider", "Observability", "Incidents", "Feature flags", "Design", "CRM", "Support", "CI/CD"] as const;

/** F-07.1 — the framework status set the FE now renders. `connected` covers
 * both "credentials stored" and "actively synced" for the tile chrome (the
 * checkmark icon, the action buttons); we treat `active` as a synonym for
 * UX purposes. `degraded` / `revoked` surface as warning chrome. */
type StatusFilter = "all" | "available" | "connected" | "active" | "degraded" | "revoked" | "coming_soon";
const STATUS_FILTERS: readonly StatusFilter[] = ["all", "available", "connected", "active", "degraded", "revoked", "coming_soon"] as const;

/** Tiles render the same action set whenever the integration has credentials —
 * the distinction between `connected` (verify() just passed) and `active`
 * (last sync within freshness window) is informational, not functional. */
const STATUS_HAS_CREDENTIALS = (s: Integration["status"]): boolean =>
  s === "connected" || s === "active" || s === "degraded";

export default function IntegrationsPage() {
  // useSearchParams must sit inside a Suspense boundary for Next 15's
  // static prerender pass (same pattern /login uses).
  return (
    <Suspense fallback={null}>
      <IntegrationsPageContent />
    </Suspense>
  );
}

function IntegrationsPageContent() {
  const { activeOrgId } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [wizardFor, setWizardFor] = useState<Integration | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [githubStarting, setGithubStarting] = useState(false);

  const refresh = useCallback(async () => {
    if (!activeOrgId) return;
    setLoading(true);
    try { setIntegrations(await api.integrations.list(activeOrgId)); setError(null); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [activeOrgId]);

  useEffect(() => { void refresh(); }, [refresh]);

  /**
   * Read the post-callback query that the BE 302-redirects to after the
   * server-side GitHub OAuth round-trip:
   *   - `?connected=github` → success toast + refresh the integrations list
   *   - `?error=oauth_failed` → failure toast (BE intentionally omits any
   *     upstream payload so we don't leak GitHub's response body)
   *
   * After surfacing the result we strip the query so a back-button reload
   * doesn't re-toast.
   */
  useEffect(() => {
    const connected = searchParams.get("connected");
    const oauthError = searchParams.get("error");
    if (connected === "github") {
      toast.success("GitHub connected — Athena can now read your repos.");
      void refresh();
      router.replace("/settings/integrations");
    } else if (oauthError === "oauth_failed") {
      toast.error(
        "GitHub authorization failed. Check the OAuth App's callback URL " +
        "matches the API origin, then try again.",
      );
      router.replace("/settings/integrations");
    }
  }, [searchParams, refresh, router]);

  /**
   * Locate the server-side GitHub OAuth integration row (per §6.2):
   *   - live shape (real BE): `provider === "github"` AND
   *     `config.connect_kind === "oauth"` (set by `github_oauth.py:callback`).
   *   - mock shape: irrelevant here; the card hides itself in mock mode.
   */
  const githubOauthIntegration = integrations.find(
    (i) =>
      i.provider === "github" &&
      (i.config?.["connect_kind"] === "oauth") &&
      STATUS_HAS_CREDENTIALS(i.status),
  );

  const onStartGithubOauth = async () => {
    if (config.isMock) {
      toast.info("OAuth is disabled in demo mode.");
      return;
    }
    setGithubStarting(true);
    try {
      const { authorize_url } = await api.integrations.githubOauth.start({
        return_to: "/settings/integrations",
      });
      // Top-level navigation — does NOT carry the Bearer token. The
      // state cookie set on the POST response is what authenticates
      // the eventual /callback request.
      window.location.assign(authorize_url);
    } catch (e) {
      setGithubStarting(false);
      toast.error(e instanceof ApiError ? e.message : "Couldn't start GitHub OAuth.");
    }
  };

  const onDisconnect = async (intId: string) => {
    if (!activeOrgId) return;
    if (!window.confirm("Disconnect this integration? Athena will stop reading from it until you reconnect.")) return;
    try {
      // BE returns 204 No Content; mock returns the updated row. Capture
      // a friendly label from local state before we refresh so we can
      // still show "Disconnected <name>" in the toast.
      const integ = integrations.find((i) => i.id === intId);
      await api.integrations.disconnect(activeOrgId, intId);
      toast.success(`Disconnected ${integ?.name ?? "integration"}.`);
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
  const connectedCount = integrations.filter((i) => STATUS_HAS_CREDENTIALS(i.status)).length;

  return (
    <Stack gap="6">
      <Stack gap="1">
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Connect external systems with the same uniform wizard for every provider — OAuth click, paste a token, upload SAML XML, or AWS keys. {connectedCount} of {integrations.length} connected.
        </p>
      </Stack>

      {config.isMock && (
        <Card className="border-[var(--info)] bg-[var(--info-soft)]">
          <Cluster gap="2" align="start">
            <Lock className="size-4 shrink-0 text-[var(--info)]" />
            <Stack gap="0">
              <span className="text-sm font-semibold text-[var(--info)]">Demo mode · integrations are read-only</span>
              <span className="text-xs text-[var(--info)]">
                New integrations can&apos;t be connected, and existing connections can&apos;t be modified. Hover any tile to see the realistic config schema the connect wizard requires in production.
              </span>
            </Stack>
          </Cluster>
        </Card>
      )}

      {!config.isMock && (
        <GithubRepoAccessCard
          connected={githubOauthIntegration ?? null}
          onConnect={() => void onStartGithubOauth()}
          pending={githubStarting}
          // Conditional spread satisfies `exactOptionalPropertyTypes`
          // (the prop is omitted entirely rather than passed undefined).
          {...(githubOauthIntegration
            ? { onDisconnect: () => void onDisconnect(githubOauthIntegration.id) }
            : {})}
        />
      )}

      <Cluster gap="2">
        {STATUS_FILTERS.map((f) => (
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
                      <StatusBadge status={it.status} />
                    </Cluster>
                  </Cluster>
                  <p className="line-clamp-2 text-sm text-[var(--text-muted)]">{it.blurb}</p>
                  {STATUS_HAS_CREDENTIALS(it.status) ? (
                    <Stack gap="2">
                      <div className="text-xs text-[var(--text-muted)]">
                        <div>{it.connected_as}</div>
                        {it.scope && <ScopeChips scope={it.scope} />}
                        {it.last_sync && <div>last sync: {it.last_sync}</div>}
                      </div>
                      {config.isMock ? (
                        <Cluster gap="1.5" align="center" className="text-[10px] text-[var(--text-subtle)]">
                          <Lock className="size-3" />
                          <span>Read-only in demo</span>
                        </Cluster>
                      ) : (
                        <Cluster gap="2">
                          <Button variant="outline" size="sm" onClick={() => onTestConnection(it.id)} disabled={connecting === it.id}>
                            {connecting === it.id ? <Loader2 className="size-3 animate-spin" /> : <RotateCw className="size-3" />}
                            Test
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => onDisconnect(it.id)}>Disconnect</Button>
                        </Cluster>
                      )}
                    </Stack>
                  ) : it.status === "available" ? (
                    config.isMock ? (
                      <Button size="sm" variant="ghost" disabled title="New integrations are disabled in demo mode.">
                        <Lock className="size-3" />
                        Demo · disabled
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => setWizardFor(it)}>
                        <Plug className="size-3" />
                        Connect
                      </Button>
                    )
                  ) : it.status === "pending" ? (
                    <Button size="sm" variant="ghost" disabled>
                      <Loader2 className="size-3 animate-spin" />
                      Awaiting authorization…
                    </Button>
                  ) : it.status === "revoked" ? (
                    config.isMock ? (
                      <Button size="sm" variant="ghost" disabled>
                        <Lock className="size-3" />
                        Demo · disabled
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => setWizardFor(it)}>
                        <Plug className="size-3" />
                        Reconnect
                      </Button>
                    )
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
  const [schema, setSchema] = useState<JsonSchema | null>(null);

  // §5.14 r2 — fetch the BE adapter's config schema once the wizard
  // opens. Lookups for unknown providers + non-OAuth flows benefit;
  // OAuth + GitHub-App redirects still show the redirect CTA because
  // their fields end up as a synthetic [] after `schemaToFields` skips
  // every property (all marked `readOnly` in those schemas).
  useEffect(() => {
    if (!activeOrgId || !integration.provider) return;
    let cancelled = false;
    const kind: "source_control" | "work" | "chat" | "mcp" =
      integration.category === "SCM" ? "source_control"
      : integration.category === "Work mgmt" ? "work"
      : integration.category === "Comms" ? "chat"
      : "source_control";
    api.integrations
      .getSchema(activeOrgId, integration.provider, kind)
      .then((s) => {
        if (!cancelled) setSchema(s);
      })
      .catch(() => {
        // 404 / network failure — silently fall back to static fields.
        if (!cancelled) setSchema(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeOrgId, integration.provider, integration.category]);

  const onSubmit = async () => {
    if (!activeOrgId) return;
    setPending(true);
    setError(null);
    try {
      // §5.16 r2 / §5.17 / §5.18 — provider-redirect flows go through
      // `oauth/initiate` + a top-level navigate to the provider. The
      // post-redirect callback at
      // `/settings/integrations/oauth-callback` runs `oauth/complete`.
      // The plain `connect` POST stays as the path for credential-bearing
      // wizard shapes (token / pat / key / saml / aws / endpoint /
      // keypair / webhook) that submit a config bag inline.
      const isProviderRedirectFlow =
        (integration.connect_kind === "github_app" && integration.provider === "github") ||
        (integration.connect_kind === "oauth" &&
          (integration.provider === "gitlab" || integration.provider === "bitbucket"));
      if (isProviderRedirectFlow && integration.provider) {
        const { authorize_url } = await api.integrations.oauth.initiate(
          activeOrgId,
          integration.provider,
          "source_control",
          { return_to: "/settings/integrations" },
        );
        // Top-level navigation hands control to the provider. We never come
        // back here — the post-redirect lands on the callback page.
        window.location.assign(authorize_url);
        return;
      }

      await api.integrations.connect(activeOrgId, integration.id, { config });
      toast.success(`Connected ${integration.name}.`);
      onConnected();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Connection failed");
    } finally {
      setPending(false);
    }
  };

  const fields = fieldsFor(integration, schema);

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
            {fields.length === 0 ? (
              <Card className="border-[var(--border)] bg-[var(--surface-2)]">
                <Stack gap="2">
                  <p className="text-sm font-semibold">Authorize {integration.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {integration.connect_kind === "github_app"
                      ? "Install the Athena GitHub App on your organization. You'll pick which repos to grant access to during install."
                      : "We'll redirect you to the provider to authorize Athena. Pick the workspace and scopes during sign-in."}
                  </p>
                </Stack>
              </Card>
            ) : (
              fields.map((f) => (
                <label key={f.key} className="flex flex-col gap-1 text-sm">
                  <Cluster gap="1" align="center">
                    <span className="text-[var(--text-muted)]">{f.label}</span>
                    {f.required && <span className="text-[var(--danger)]">*</span>}
                  </Cluster>
                  <input
                    type={f.type}
                    value={config[f.key] ?? ""}
                    onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  />
                  {f.help && <span className="text-xs text-[var(--text-subtle)]">{f.help}</span>}
                </label>
              ))
            )}
          </Stack>

          {error && <p className="text-sm text-[var(--danger)]" role="alert">{error}</p>}

          <Cluster gap="2" justify="end">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={onSubmit} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}
              {fields.length === 0
                ? (integration.connect_kind === "github_app" ? "Install GitHub App" : "Start authorization")
                : "Connect"}
            </Button>
          </Cluster>
        </Stack>
      </Card>
    </div>
  );
}

interface ConnectField {
  key: string;
  label: string;
  type: string;
  placeholder: string;
  /** Optional help line rendered as a small caption under the input. */
  help?: string;
  /** Optional regex hint shown as `pattern` (not enforced; informational). */
  pattern?: string;
  required?: boolean;
}

/**
 * Connect-wizard fields per integration. Where a provider has a quirky
 * real-prod input signature (Azure OpenAI's deployment id, Notion's
 * integration token format, Zendesk's subdomain + email pair, etc.), we
 * override the generic `connect_kind` schema with the real signature so
 * a non-mock build actually wires up cleanly.
 *
 * The map is keyed by `integration.id` first; if no override is present,
 * we fall back to the per-`connect_kind` defaults below.
 */
const FIELDS_BY_INTEGRATION_ID: Record<string, ConnectField[]> = {
  int_notion: [
    { key: "integration_token", label: "Integration token", type: "password", required: true,
      placeholder: "secret_••••••••••••",
      help: "Internal integration token from notion.so/my-integrations. Lumen's Athena integration then needs to be shared with the pages/databases you want indexed." },
  ],
  int_confluence: [
    { key: "base_url", label: "Workspace URL", type: "url", required: true,
      placeholder: "https://your-company.atlassian.net",
      help: "Your Atlassian Cloud workspace URL." },
    { key: "email", label: "Atlassian account email", type: "email", required: true,
      placeholder: "you@your-company.com" },
    { key: "api_token", label: "API token", type: "password", required: true,
      placeholder: "Generated from id.atlassian.com/manage-profile/security/api-tokens",
      help: "Confluence uses email + API token, not a single bearer credential." },
  ],
  int_zendesk: [
    { key: "subdomain", label: "Zendesk subdomain", type: "text", required: true,
      placeholder: "your-company", help: "The slug in https://<subdomain>.zendesk.com." },
    { key: "email", label: "Agent email (with /token suffix)", type: "email", required: true,
      placeholder: "agent@your-company.com/token",
      help: "Zendesk's API-token auth requires the /token suffix on the email." },
    { key: "api_token", label: "API token", type: "password", required: true,
      placeholder: "From Admin Centre → Apps and integrations → APIs" },
  ],
  int_datadog: [
    { key: "site", label: "Datadog site", type: "text", required: true,
      placeholder: "datadoghq.com",
      help: "One of: datadoghq.com (US1), us3.datadoghq.com, us5.datadoghq.com, datadoghq.eu, ap1.datadoghq.com." },
    { key: "api_key", label: "API key", type: "password", required: true,
      placeholder: "32-character hex string from Organization Settings → API Keys" },
    { key: "application_key", label: "Application key", type: "password", required: true,
      placeholder: "From Organization Settings → Application Keys" },
  ],
  int_pagerduty: [
    { key: "api_key", label: "REST API key", type: "password", required: true,
      placeholder: "From PagerDuty → Integrations → API Access Keys",
      help: "Use a read+write key scoped to the services Athena should incident on." },
    { key: "default_service_id", label: "Default service id (optional)", type: "text",
      placeholder: "PXXXXXX",
      help: "If set, Athena pages this service when no service_id is provided in the rule." },
  ],
  int_sentry: [
    { key: "org_slug", label: "Sentry org slug", type: "text", required: true,
      placeholder: "your-company",
      help: "The slug in https://sentry.io/<org_slug>/." },
    { key: "auth_token", label: "Auth token", type: "password", required: true,
      placeholder: "From Settings → Auth Tokens. Scopes: project:read, project:write." },
  ],
  int_launchdarkly: [
    { key: "project_key", label: "Project key", type: "text", required: true,
      placeholder: "default" },
    { key: "environment_key", label: "Environment key", type: "text", required: true,
      placeholder: "production" },
    { key: "api_token", label: "API access token", type: "password", required: true,
      placeholder: "From Account Settings → Authorization. Needs writer role for flag toggles." },
  ],
  int_figma: [
    { key: "personal_access_token", label: "Personal access token", type: "password", required: true,
      placeholder: "figd_•••••••",
      help: "From figma.com/settings → Personal access tokens. Scopes: files:read, file_comments:write." },
    { key: "team_id", label: "Team id (optional)", type: "text",
      placeholder: "123456789012345678",
      help: "Restrict Athena's library access to a single Figma team." },
  ],
  int_salesforce: [],
  int_anthropic: [
    { key: "api_key", label: "Anthropic API key", type: "password", required: true,
      placeholder: "sk-ant-•••••••",
      help: "From console.anthropic.com/account/keys. Lumen rotates this every 90 days." },
  ],
  int_openai: [
    { key: "api_key", label: "OpenAI API key", type: "password", required: true,
      placeholder: "sk-proj-•••••••",
      help: "From platform.openai.com/api-keys." },
    { key: "organization_id", label: "Organization id (optional)", type: "text",
      placeholder: "org-•••••••",
      help: "Only required if the key is associated with multiple orgs." },
  ],
  int_azure_openai: [
    { key: "endpoint", label: "Azure resource endpoint", type: "url", required: true,
      placeholder: "https://my-resource.openai.azure.com",
      help: "From Azure portal → your Azure OpenAI resource → Keys and Endpoint." },
    { key: "api_key", label: "Resource key", type: "password", required: true,
      placeholder: "From the same Keys and Endpoint page." },
    { key: "api_version", label: "API version", type: "text", required: true,
      placeholder: "2024-10-21",
      help: "Use the latest GA version your deployment supports." },
    { key: "deployment_id", label: "Default deployment id", type: "text", required: true,
      placeholder: "gpt-5-prod",
      help: "Azure routes by deployment id, not model name. Required." },
  ],
  int_bedrock: [
    { key: "role_arn", label: "IAM role ARN", type: "text", required: true,
      placeholder: "arn:aws:iam::123456789012:role/AthenaBedrock",
      help: "Athena will assume this role via STS. Needs bedrock:InvokeModel + bedrock:InvokeModelWithResponseStream." },
    { key: "region", label: "AWS region", type: "text", required: true,
      placeholder: "us-east-1" },
    { key: "external_id", label: "External id (optional)", type: "text",
      placeholder: "Random UUID generated by Lumen",
      help: "Recommended for cross-account assume-role. Provided by Lumen during onboarding." },
  ],
  int_gitlab: [
    { key: "base_url", label: "GitLab base URL", type: "url", required: true,
      placeholder: "https://gitlab.com",
      help: "Use https://gitlab.com for SaaS or your self-managed URL." },
    { key: "personal_access_token", label: "Personal access token", type: "password", required: true,
      placeholder: "glpat-•••••••",
      help: "Scopes required: api, read_repository." },
  ],
  int_jira_dc: [
    { key: "base_url", label: "Jira base URL", type: "url", required: true,
      placeholder: "https://jira.your-company.example" },
    { key: "personal_access_token", label: "Personal access token", type: "password", required: true,
      placeholder: "From your Jira profile → Personal Access Tokens",
      help: "Jira DC PATs include the username — no separate username field needed." },
  ],
  int_teams: [
    { key: "webhook_url", label: "Incoming webhook URL", type: "url", required: true,
      placeholder: "https://your-tenant.webhook.office.com/webhookb2/...",
      help: "From Teams channel → Workflows → 'Post to a channel when a webhook request is received'." },
    { key: "default_channel_id", label: "Default channel id (optional)", type: "text",
      placeholder: "19:•••••@thread.tacv2",
      help: "If set, Athena routes notifications to this channel when no channel is specified." },
  ],
};

/**
 * §5.14 r2 — render fields from the BE adapter's JSON Schema when no
 * static override is present. Keeps the static map as the primary source
 * of truth for placeholder + help copy; schema-derived fields fill the
 * gap for providers ops added without touching the FE.
 *
 * Heuristics: `format: "uri"` → url input; `format: "email"` → email;
 * key name matches /token|secret|key|password|credential/ → password;
 * `readOnly: true` properties (e.g. GitHub's `installation_id`) are
 * skipped — the BE writes them post-callback.
 */
function schemaToFields(schema: JsonSchema | null): ConnectField[] | null {
  if (!schema || !schema.properties) return null;
  const required = new Set(schema.required ?? []);
  const out: ConnectField[] = [];
  for (const [key, prop] of Object.entries(schema.properties)) {
    if (prop.readOnly) continue;
    const isSecretByName = /token|secret|key|password|credential/i.test(key);
    const inputType: ConnectField["type"] =
      prop.writeOnly || isSecretByName ? "password"
      : prop.format === "uri" ? "url"
      : prop.format === "email" ? "email"
      : "text";
    const field: ConnectField = {
      key,
      label: prop.title ?? key,
      type: inputType,
      placeholder: prop.description ?? "",
      required: required.has(key),
    };
    if (prop.description) field.help = prop.description;
    if (prop.pattern) field.pattern = prop.pattern;
    out.push(field);
  }
  return out;
}

function fieldsFor(integration: Integration, schema: JsonSchema | null = null): ConnectField[] {
  const override = FIELDS_BY_INTEGRATION_ID[integration.id];
  if (override) return override;

  const schemaFields = schemaToFields(schema);
  if (schemaFields && schemaFields.length > 0) return schemaFields;

  switch (integration.connect_kind) {
    case "oauth":
    case "github_app":
      // OAuth + GitHub App flows are server-side redirects. The FE renders
      // a "Start authorization" CTA instead of fields. The wizard still
      // POSTs an empty config so the mock can flip to `connected`.
      return [];
    case "token":
      return [
        { key: "api_token", label: "API token", type: "password", required: true,
          placeholder: "Paste the token from the provider's admin UI" },
        { key: "base_url",  label: "Workspace URL (optional)", type: "url",
          placeholder: "https://your-workspace.example" },
      ];
    case "pat":
      return [
        { key: "personal_access_token", label: "Personal access token", type: "password", required: true,
          placeholder: "Generated from your provider's profile" },
        { key: "base_url", label: "Base URL", type: "url", required: true,
          placeholder: "https://provider.your-company.example" },
      ];
    case "key":
      return [{ key: "api_key", label: "API key", type: "password", required: true, placeholder: "sk-... or equivalent" }];
    case "keypair":
      return [
        { key: "api_key", label: "API key", type: "password", required: true, placeholder: "API key" },
        { key: "app_key", label: "Application key", type: "password", required: true, placeholder: "Application / project key" },
      ];
    case "saml":
      return [
        { key: "metadata_url", label: "Metadata URL", type: "url", required: true,
          placeholder: "https://idp.example.com/saml/metadata" },
        { key: "group_attribute", label: "Group attribute name", type: "text",
          placeholder: "groups",
          help: "The SAML attribute that lists group memberships. Defaults to 'groups'." },
      ];
    case "endpoint":
      return [
        { key: "endpoint", label: "Endpoint URL", type: "url", required: true,
          placeholder: "https://my-resource.example.com" },
        { key: "api_key", label: "API key", type: "password", required: true,
          placeholder: "Resource key" },
      ];
    case "aws":
      return [
        { key: "role_arn", label: "IAM role ARN", type: "text", required: true,
          placeholder: "arn:aws:iam::123456789012:role/AthenaBedrock" },
        { key: "region", label: "Region", type: "text", required: true, placeholder: "us-east-1" },
      ];
    case "webhook":
      return [
        { key: "webhook_url", label: "Incoming webhook URL", type: "url", required: true,
          placeholder: "https://example.webhook.office.com/..." },
      ];
    default:
      return [{ key: "credential", label: "Credential", type: "password", required: true,
        placeholder: "Provider-specific credential" }];
  }
}

/**
 * §5.29.1 — server-side GitHub OAuth card for repo access.
 *
 * Distinct from the marketplace "GitHub App" tile: this card drives the
 * user-token OAuth flow (Authorization Code grant), which is what
 * `LOCAL_DEV.md` recommends for dev-mode against a real GitHub account.
 *
 * Two states:
 *   - **Connected**: shows `account_login` from `config.account_login`,
 *     connected_at, scope, and a Disconnect button.
 *   - **Not connected**: shows the value proposition + a single CTA that
 *     POSTs `/v1/integrations/github/oauth/start` and navigates the
 *     browser to the returned `authorize_url`.
 *
 * The card renders prominently above the marketplace grid so the dev-mode
 * walkthrough is one click from the page. Hidden in mock mode.
 */
function GithubRepoAccessCard({
  connected,
  onConnect,
  onDisconnect,
  pending,
}: {
  connected: Integration | null;
  onConnect: () => void;
  onDisconnect?: () => void;
  pending: boolean;
}) {
  if (connected) {
    // BE-shape reads: `config.account_login` is set by github_oauth.callback;
    // `connected_as` is the FE-mock shape and may be absent in live.
    const login =
      (connected.config?.["account_login"] as string | undefined) ??
      connected.connected_as;
    const connectedAt = connected.connected_at;
    return (
      <Card className="border-[var(--success)] bg-[var(--success-soft)]">
        <Stack gap="3">
          <Cluster justify="between" align="center">
            <Cluster gap="2" align="center">
              <CheckCircle2 className="size-5 text-[var(--success)]" />
              <Stack gap="0">
                <span className="text-sm font-semibold">GitHub repo access · Connected</span>
                <span className="text-xs text-[var(--text-muted)]">
                  {login
                    ? `Signed in as @${login}`
                    : "Athena can read your repositories via the OAuth token."}
                  {connectedAt && ` · connected ${connectedAt}`}
                </span>
              </Stack>
            </Cluster>
            {onDisconnect && (
              <Button variant="ghost" size="sm" onClick={onDisconnect}>
                Disconnect
              </Button>
            )}
          </Cluster>
          <p className="text-xs text-[var(--text-muted)]">
            The OAuth access token is stored AAD-encrypted server-side. It is
            never sent to your browser — verify in DevTools that no request
            to <code className="font-mono">localhost:3000</code> carries it.
          </p>
        </Stack>
      </Card>
    );
  }
  return (
    <Card className="border-[var(--primary)] bg-[var(--primary-soft)]">
      <Stack gap="3">
        <Cluster gap="2" align="start">
          <Github className="size-5 shrink-0 text-[var(--primary)]" />
          <Stack gap="0">
            <span className="text-sm font-semibold">Connect GitHub for repo access</span>
            <span className="text-xs text-[var(--text-muted)]">
              Recommended for dev mode. Server-side OAuth — the token is exchanged
              backend-to-backend with github.com, stored encrypted, and never
              touches the frontend.
            </span>
          </Stack>
        </Cluster>
        <Cluster gap="2" align="center">
          <Button onClick={onConnect} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Github className="size-4" />}
            {pending ? "Redirecting to GitHub…" : "Connect GitHub"}
          </Button>
          <span className="text-xs text-[var(--text-subtle)]">
            Scope: <code className="font-mono">repo read:user user:email</code>
          </span>
        </Cluster>
      </Stack>
    </Card>
  );
}

/** F-07.1 — coloured pill summarising the integration's lifecycle state. */
function StatusBadge({ status }: { status: Integration["status"] }) {
  const tone: Record<Integration["status"], string> = {
    available:    "bg-[var(--surface-2)]      text-[var(--text-muted)]",
    coming_soon:  "bg-[var(--surface-2)]      text-[var(--text-subtle)]",
    pending:      "bg-[var(--info-soft)]      text-[var(--info)]",
    connected:    "bg-[var(--success-soft)]   text-[var(--success)]",
    active:       "bg-[var(--success-soft)]   text-[var(--success)]",
    degraded:     "bg-[var(--warning-soft)]   text-[var(--warning)]",
    revoked:      "bg-[var(--danger-soft)]    text-[var(--danger)]",
  };
  const label: Record<Integration["status"], string> = {
    available:    "Available",
    coming_soon:  "Coming soon",
    pending:      "Pending",
    connected:    "Connected",
    active:       "Active",
    degraded:     "Needs reauth",
    revoked:      "Revoked",
  };
  if (status === "available" || status === "coming_soon") return null;
  return (
    <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider", tone[status])}>
      {label[status]}
    </span>
  );
}

/** F-07.5 — render the structured `IntegrationScope` as readable chips. */
function ScopeChips({ scope }: { scope: NonNullable<Integration["scope"]> }) {
  const kindLabel: Record<typeof scope.kind, string> = {
    repos: "repos",
    projects: "projects",
    channels: "channels",
    workspaces: "workspaces",
    models: "models",
    other: "items",
  };
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span>scope:</span>
      <span className="font-medium text-[var(--text)]">
        {scope.count} {kindLabel[scope.kind]}
      </span>
      {scope.preview.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {scope.preview.map((p) => (
            <span key={p} className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px]">
              {p}
            </span>
          ))}
          {scope.more > 0 && <span className="text-[var(--text-subtle)]">+{scope.more} more</span>}
        </span>
      )}
    </div>
  );
}
