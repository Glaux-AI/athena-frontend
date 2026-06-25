"use client";

/**
 * /settings/models - bring-your-own model providers + per-org routing.
 *
 * Three surfaces stacked on the page:
 *
 *   1. **Header + Add-provider CTA** - opens the catalog picker sheet.
 *      The catalog drives which providers can be added; an org can save
 *      keys for any of the 14 catalog entries (4 paid + 10 free-tier).
 *   2. **Enabled models** (`<EnabledModelsManager>`) - the model-per-action
 *      registry that replaced the old role→model routing. An org switches
 *      catalog models ON; the enabled set is exactly what `<ModelSelector>`
 *      offers at every AI action. Reads `api.models.enabled()` / toggles via
 *      `api.models.setEnabled()`.
 *   3. **Provider cards grid** - existing card surface, now extended
 *      with an expand-to-drill-down per-model usage table.
 *
 * §7.8 - per-provider BYO API key surface stayed put. Plaintext is sent
 * on `PATCH /model-providers/{id}` and AEAD-encrypted server-side; the
 * wire shape returned NEVER contains the plaintext, only
 * `{has_api_key, api_key_last4}`. Stored keys render as `•••• ABCD` with
 * a "Revoke" CTA that hits `DELETE .../api-key`.
 *
 * §7.8.1 - provider catalog + dynamic role bindings + per-model usage.
 * Catalog is the FE-facing label source - when a card's `provider`
 * field matches a catalog id, we render the catalog `display_name`;
 * otherwise we render the raw string (preserves legacy display for
 * pre-catalog rows).
 */

import { useCallback, useEffect, useState } from "react";
import { Cpu, Star, CheckCircle2, KeyRound, Plus, ChevronDown, ChevronUp, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { useSession } from "@/lib/session/SessionProvider";
import {
  api,
  ApiError,
  type CatalogProvider,
  type ModelProvider,
} from "@/lib/api/client";
import { cn } from "@/lib/cn";

import { AddProviderSheet } from "@/components/settings/models/add-provider-sheet";
import { EditModelsSheet } from "@/components/settings/models/edit-models-sheet";
import { ModelChip } from "@/components/settings/models/model-chip";
import { ProviderUsageDrilldown } from "@/components/settings/models/provider-usage-drilldown";
import { EnabledModelsManager } from "@/components/settings/models/enabled-models-manager";
import { IngestionModelsCard } from "@/components/settings/models/ingestion-models-card";
import { SlackAgentModelCard } from "@/components/settings/models/slack-agent-model-card";
import { ContextBudgetCard } from "@/components/settings/models/context-budget-card";
import { SubscriptionModelsCard } from "@/components/settings/models/subscription-models-card";

export default function ModelProvidersPage() {
  const { activeOrgId } = useSession();
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [catalog, setCatalog] = useState<CatalogProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!activeOrgId) return;
    try {
      const [p, c] = await Promise.all([
        api.modelProviders.list(activeOrgId),
        api.llmProviders.catalog(),
      ]);
      setProviders(p);
      setCatalog(c);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const setPrimary = async (id: string) => {
    if (!activeOrgId) return;
    try {
      const updated = await api.modelProviders.setPrimary(activeOrgId, id);
      toast.success(`Primary provider set to ${providerDisplayName(updated, catalog)}.`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't change provider.");
    }
  };

  return (
    <Stack gap="6">
      <SettingsPageHeader
        title="Model providers"
        subtitle="Bring your own API key for any provider. BYO traffic is never charged."
        action={
          <Button
            variant="default"
            size="sm"
            onClick={() => setAddOpen(true)}
            disabled={!activeOrgId}
          >
            <Plus className="mr-1 size-3.5" />
            Add provider
          </Button>
        }
      />

      {error && (
        <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger-ink)]">{error}</p>
        </Card>
      )}

      {!loading && activeOrgId && <EnabledModelsManager catalog={catalog} />}

      {/* The two configurable ingestion models (per-file summaries + deep
          synthesis). Embeddings stay fixed/platform and aren't shown. */}
      {!loading && activeOrgId && <IngestionModelsCard catalog={catalog} />}

      {/* The @Athena Slack bot's answer model (ADR-092). Any Athena or BYOK
          model; defaults to the platform chat default. */}
      {!loading && activeOrgId && <SlackAgentModelCard catalog={catalog} />}

      {/* The per-org context budget: a default window + per-model overrides
          that drive when Athena auto-compacts a model's context. */}
      {!loading && activeOrgId && <ContextBudgetCard catalog={catalog} />}

      {/* Personal rung - the current user's connected AI subscriptions
          (chat-only models from their own plan). Org cards follow below. */}
      {!loading && activeOrgId && <SubscriptionModelsCard catalog={catalog} />}

      {loading ? (
        <ProvidersSkeleton />
      ) : (
        <Grid cols="auto-fit-360" gap="3">
          {providers.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              catalog={catalog}
              orgId={activeOrgId!}
              onChanged={refresh}
              onSetPrimary={() => setPrimary(p.id)}
            />
          ))}
        </Grid>
      )}

      {activeOrgId && (
        <AddProviderSheet
          open={addOpen}
          orgId={activeOrgId}
          existingProviders={providers.map((p) => p.provider)}
          onClose={() => setAddOpen(false)}
          onCreated={refresh}
        />
      )}
    </Stack>
  );
}


function ProviderCard({
  provider, catalog, orgId, onChanged, onSetPrimary,
}: {
  provider: ModelProvider;
  catalog: CatalogProvider[];
  orgId: string;
  onChanged: () => void | Promise<void>;
  onSetPrimary: () => void | Promise<void>;
}) {
  const [showUsage, setShowUsage] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const remove = async () => {
    if (!confirm(
      `Remove ${providerDisplayName(provider, catalog)}? This deletes the provider and its stored key. Any role bindings pointing at it fall back to Athena's shared pool.`
    )) return;
    setDeleting(true);
    try {
      await api.modelProviders.delete(orgId, provider.id);
      toast.success(`Removed ${providerDisplayName(provider, catalog)}.`);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't remove provider.");
    } finally {
      setDeleting(false);
    }
  };

  const catalogEntry = catalog.find((c) => c.id === provider.provider) ?? null;
  const currency = catalogEntry?.pricing_currency ?? "USD";

  return (
    <Card
      className={cn(
        "transition-[box-shadow,border-color] duration-200 ease-out hover:shadow-[var(--shadow-2)]",
        provider.status === "primary"
          ? "border-[var(--primary)] shadow-[var(--shadow-2)] ring-1 ring-[var(--primary)]"
          : "hover:border-[var(--border-strong)]",
      )}
    >
      <Stack gap="3">
        <Cluster justify="between" align="start">
          <Cluster gap="2" align="center">
            <Cpu className="size-5 text-[var(--text-muted)]" />
            <Stack gap="0">
              <span className="text-base font-semibold">
                {providerDisplayName(provider, catalog)}
              </span>
              <span className="text-xs text-[var(--text-muted)]">
                via {provider.via} · {provider.region}
              </span>
            </Stack>
          </Cluster>
          {provider.status === "primary" && (
            <span className="rounded-full bg-[var(--primary)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--primary-fg)]">
              <Star className="mr-1 inline size-3" />Primary
            </span>
          )}
          {provider.status === "enabled" && (
            <span className="rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--success-ink)]">
              <CheckCircle2 className="mr-1 inline size-3" />Enabled
            </span>
          )}
        </Cluster>
        {provider.residency_note && (
          <p className="text-xs text-[var(--text-muted)]">{provider.residency_note}</p>
        )}
        <Stack gap="1">
          <Cluster justify="between" align="center">
            <span className="text-xs font-medium text-[var(--text-muted)]">
              Enabled models
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditOpen(true)}
              aria-label={`Edit models for ${providerDisplayName(provider, catalog)}`}
            >
              <Pencil className="mr-1 size-3.5" />
              Edit models
            </Button>
          </Cluster>
          <Cluster gap="2">
            {provider.enabled_models.length === 0 && (
              <span className="text-xs text-[var(--text-muted)]">
                No models enabled yet.
              </span>
            )}
            {provider.enabled_models.map((m) => {
              const cm = catalogEntry?.models.find((mm) => mm.id === m) ?? null;
              return cm ? (
                <ModelChip key={m} model={cm} currency={currency} />
              ) : (
                <span
                  key={m}
                  className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 font-mono text-[10px]"
                  title={m}
                >
                  {m}
                </span>
              );
            })}
          </Cluster>
        </Stack>
        <Cluster justify="between" align="center" className="text-xs">
          <span className="text-[var(--text-muted)]">
            {provider.request_count.toLocaleString()} requests MTD
          </span>
          {provider.cost_mtd != null && (
            <span className="text-[var(--text-muted)]">${provider.cost_mtd}</span>
          )}
        </Cluster>
        <ApiKeyRow provider={provider} catalog={catalog} orgId={orgId} onChange={onChanged} />
        <button
          type="button"
          onClick={() => setShowUsage((v) => !v)}
          className="flex w-full items-center justify-between rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          aria-expanded={showUsage}
        >
          <span>Per-model usage (MTD)</span>
          {showUsage ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
        {showUsage && (
          <ProviderUsageDrilldown orgId={orgId} providerId={provider.id} />
        )}
        <Cluster gap="2" justify="between" align="center">
          {provider.status !== "primary" ? (
            <Button variant="outline" size="sm" onClick={onSetPrimary}>
              Set primary
            </Button>
          ) : (
            <span />
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={remove}
            disabled={deleting}
            className="text-[var(--danger)]"
            aria-label={`Remove ${providerDisplayName(provider, catalog)}`}
          >
            <Trash2 className="mr-1 size-3.5" />
            {deleting ? "Removing…" : "Remove"}
          </Button>
        </Cluster>
      </Stack>
      <EditModelsSheet
        open={editOpen}
        orgId={orgId}
        provider={provider}
        catalogEntry={catalogEntry}
        providerDisplayName={providerDisplayName(provider, catalog)}
        onClose={() => setEditOpen(false)}
        onSaved={onChanged}
      />
    </Card>
  );
}


function ApiKeyRow({
  provider, catalog, orgId, onChange,
}: {
  provider: ModelProvider;
  catalog: CatalogProvider[];
  orgId: string;
  onChange: () => void | Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const save = async () => {
    if (value.length < 8) {
      toast.error("API key must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      await api.modelProviders.patch(orgId, provider.id, { api_key: value });
      toast.success(`API key saved for ${providerDisplayName(provider, catalog)}.`);
      setValue("");
      setExpanded(false);
      await onChange();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save the key.");
    } finally {
      setSubmitting(false);
    }
  };

  const revoke = async () => {
    if (!confirm(
      `Revoke the API key for ${providerDisplayName(provider, catalog)}? Future calls will use Athena's shared pool until you save a new key.`
    )) return;
    setRevoking(true);
    try {
      await api.modelProviders.revokeApiKey(orgId, provider.id);
      toast.success(`API key revoked for ${providerDisplayName(provider, catalog)}.`);
      await onChange();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't revoke the key.");
    } finally {
      setRevoking(false);
    }
  };

  if (provider.has_api_key) {
    return (
      <Cluster
        justify="between"
        align="center"
        className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs"
      >
        <Cluster gap="2" align="center">
          <KeyRound className="size-3.5 text-[var(--text-muted)]" />
          <span className="font-mono">•••••••••• {provider.api_key_last4 ?? "????"}</span>
        </Cluster>
        <Button variant="ghost" size="sm" onClick={revoke} disabled={revoking}>
          {revoking ? "Revoking…" : "Revoke"}
        </Button>
      </Cluster>
    );
  }
  if (!expanded) {
    return (
      <Button variant="outline" size="sm" onClick={() => setExpanded(true)}>
        <KeyRound className="mr-1 size-3.5" />
        Add API key
      </Button>
    );
  }
  return (
    <Stack gap="2">
      <label className="text-xs text-[var(--text-muted)]" htmlFor={`api-key-${provider.id}`}>
        API key (stored encrypted; never displayed back)
      </label>
      <input
        id={`api-key-${provider.id}`}
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Paste your key"
        autoComplete="off"
        spellCheck={false}
        className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      />
      <Cluster gap="2">
        <Button
          variant="default"
          size="sm"
          onClick={save}
          disabled={submitting || value.length < 8}
        >
          {submitting ? "Saving…" : "Save"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setExpanded(false); setValue(""); }}
          disabled={submitting}
        >
          Cancel
        </Button>
      </Cluster>
    </Stack>
  );
}


function ProvidersSkeleton() {
  return (
    <Grid cols="auto-fit-360" gap="3" aria-busy="true" aria-label="Loading model providers">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <Stack gap="3">
            <Cluster justify="between" align="start">
              <Cluster gap="2" align="center">
                <div className="size-5 animate-pulse rounded bg-[var(--surface-2)]" />
                <Stack gap="1">
                  <div className="h-4 w-32 animate-pulse rounded-md bg-[var(--surface-2)]" />
                  <div className="h-3 w-40 animate-pulse rounded-md bg-[var(--surface-2)]" />
                </Stack>
              </Cluster>
              <div className="h-4 w-16 animate-pulse rounded-full bg-[var(--surface-2)]" />
            </Cluster>
            <div className="h-3 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
            <Cluster gap="2">
              <div className="h-4 w-20 animate-pulse rounded-full bg-[var(--surface-2)]" />
              <div className="h-4 w-16 animate-pulse rounded-full bg-[var(--surface-2)]" />
            </Cluster>
            <Cluster justify="between">
              <div className="h-3 w-28 animate-pulse rounded-md bg-[var(--surface-2)]" />
              <div className="h-3 w-14 animate-pulse rounded-md bg-[var(--surface-2)]" />
            </Cluster>
            <div className="h-7 w-24 animate-pulse rounded-md bg-[var(--surface-2)]" />
          </Stack>
        </Card>
      ))}
    </Grid>
  );
}


function providerDisplayName(
  provider: ModelProvider,
  catalog: CatalogProvider[],
): string {
  return catalog.find((c) => c.id === provider.provider)?.display_name ?? provider.provider;
}
