"use client";

/**
 * §7.8.1 — "Add provider" sheet, opened from `/settings/models`.
 *
 * Three steps in one dialog (no wizard chrome — single render path):
 *   1. Pick a provider from the catalog.
 *   2. Pick which models on that provider to enable.
 *   3. Paste an API key (optional — empty saves the row without a key,
 *      matching the BE which lets an admin pre-configure routing
 *      before adding credentials).
 *
 * Plaintext key is sent only on submit, never logged, and the input is
 * cleared on save/cancel.
 */

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, KeyRound, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { priceLabel, rateLabel } from "@/lib/models/format";
import {
  api,
  ApiError,
  type CatalogProvider,
} from "@/lib/api/client";

type TierFilter = "all" | "free" | "paid" | "mixed";

export function AddProviderSheet({
  open,
  orgId,
  existingProviders,
  onClose,
  onCreated,
}: {
  open: boolean;
  orgId: string;
  existingProviders: string[];
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--overlay)] backdrop-blur-sm" />
        <Dialog.Content
          role="dialog"
          aria-labelledby="add-provider-title"
          data-testid="add-provider-sheet"
          className="fixed left-1/2 top-1/2 z-50 w-[min(720px,calc(100%-2rem))] max-h-[min(720px,calc(100vh-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl focus:outline-none"
        >
          {open ? (
            <AddProviderBody
              orgId={orgId}
              existingProviders={existingProviders}
              onClose={onClose}
              onCreated={onCreated}
            />
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}


function AddProviderBody({
  orgId,
  existingProviders,
  onClose,
  onCreated,
}: {
  orgId: string;
  existingProviders: string[];
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const [catalog, setCatalog] = useState<CatalogProvider[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState<TierFilter>("all");

  useEffect(() => {
    let cancelled = false;
    api.llmProviders.catalog()
      .then((data) => { if (!cancelled) setCatalog(data); })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e instanceof ApiError ? e.message : "Couldn't load provider catalog.");
      });
    return () => { cancelled = true; };
  }, []);

  const selected = catalog?.find((p) => p.id === selectedId) ?? null;
  const taken = new Set(existingProviders);
  const filtered = (catalog ?? [])
    .filter((p) => (tier === "all" ? true : p.tier_hint === tier))
    .filter((p) => (search ? p.display_name.toLowerCase().includes(search.toLowerCase()) : true));

  const submit = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await api.modelProviders.create(orgId, {
        provider: selected.id,
        enabled_models: Array.from(enabled),
        ...(apiKey.length >= 8 ? { api_key: apiKey } : {}),
      });
      toast.success(`Added ${selected.display_name}.`);
      setApiKey("");
      setEnabled(new Set());
      setSelectedId(null);
      await onCreated();
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't add provider.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <Stack gap="3" className="p-5">
        <Header onClose={onClose} />
        <p className="text-sm text-[var(--danger)]">{loadError}</p>
      </Stack>
    );
  }
  if (catalog === null) {
    return (
      <Stack gap="3" className="p-5" aria-busy="true">
        <Header onClose={onClose} />
        <div className="h-4 w-40 animate-pulse rounded-md bg-[var(--surface-2)]" />
        <div className="h-32 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
      </Stack>
    );
  }

  return (
    <Stack gap="0">
      <Header onClose={onClose} />
      <div className="grid grid-cols-[260px_1fr] divide-x divide-[var(--border-soft)]">
        <ProviderList
          providers={filtered}
          selectedId={selectedId}
          taken={taken}
          search={search}
          tier={tier}
          onSearch={setSearch}
          onTier={setTier}
          onSelect={(id) => { setSelectedId(id); setEnabled(new Set()); }}
        />
        <ProviderDetail
          provider={selected}
          enabled={enabled}
          apiKey={apiKey}
          submitting={submitting}
          alreadyAdded={selected ? taken.has(selected.id) : false}
          onToggleModel={(id) => setEnabled((s) => toggleSet(s, id))}
          onApiKey={setApiKey}
          onSubmit={submit}
        />
      </div>
    </Stack>
  );
}


function Header({ onClose }: { onClose: () => void }) {
  return (
    <Cluster
      justify="between"
      align="center"
      className="border-b border-[var(--border-soft)] px-5 py-3"
    >
      <Stack gap="0">
        <h2 id="add-provider-title" className="text-base font-semibold">
          Add provider
        </h2>
        <p className="text-xs text-[var(--text-muted)]">
          Bring your own API key for any provider in the catalog.
        </p>
      </Stack>
      <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
        <X className="size-4" />
      </Button>
    </Cluster>
  );
}


function ProviderList({
  providers, selectedId, taken, search, tier,
  onSearch, onTier, onSelect,
}: {
  providers: CatalogProvider[];
  selectedId: string | null;
  taken: Set<string>;
  search: string;
  tier: TierFilter;
  onSearch: (v: string) => void;
  onTier: (v: TierFilter) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <Stack gap="2" className="max-h-[600px] overflow-y-auto p-3">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search providers…"
          className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] py-1 pl-7 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
        />
      </div>
      <Cluster gap="1">
        {(["all", "free", "paid", "mixed"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onTier(t)}
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
              tier === t
                ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-fg)]"
                : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            {t}
          </button>
        ))}
      </Cluster>
      {providers.length === 0 && (
        <p className="px-2 text-xs text-[var(--text-muted)]">
          No providers match.
        </p>
      )}
      {providers.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onSelect(p.id)}
          aria-pressed={selectedId === p.id}
          className={`flex flex-col items-start gap-0.5 rounded-md border px-2 py-1.5 text-left text-xs transition ${
            selectedId === p.id
              ? "border-[var(--primary)] bg-[var(--primary-soft)]"
              : "border-[var(--border-soft)] hover:border-[var(--border)] hover:bg-[var(--surface-2)]"
          }`}
        >
          <Cluster justify="between" align="center" className="w-full">
            <span className="font-semibold">{p.display_name}</span>
            <TierChip tier={p.tier_hint} />
          </Cluster>
          <Cluster gap="2" align="center">
            <span className="text-[10px] text-[var(--text-muted)]">
              {p.models.length} model{p.models.length === 1 ? "" : "s"}
            </span>
            {taken.has(p.id) && (
              <span className="text-[10px] text-[var(--text-muted)]">· already added</span>
            )}
          </Cluster>
        </button>
      ))}
    </Stack>
  );
}


function ProviderDetail({
  provider, enabled, apiKey, submitting, alreadyAdded,
  onToggleModel, onApiKey, onSubmit,
}: {
  provider: CatalogProvider | null;
  enabled: Set<string>;
  apiKey: string;
  submitting: boolean;
  alreadyAdded: boolean;
  onToggleModel: (id: string) => void;
  onApiKey: (v: string) => void;
  onSubmit: () => void | Promise<void>;
}) {
  if (provider === null) {
    return (
      <Stack gap="2" className="items-center justify-center p-8 text-center">
        <p className="text-sm text-[var(--text-muted)]">
          Pick a provider on the left to enable models and add a key.
        </p>
      </Stack>
    );
  }
  return (
    <Stack gap="3" className="max-h-[600px] overflow-y-auto p-4">
      <Stack gap="0">
        <Cluster justify="between" align="center">
          <h3 className="text-sm font-semibold">{provider.display_name}</h3>
          <TierChip tier={provider.tier_hint} />
        </Cluster>
        {provider.requires_openai_compat && (
          <p className="text-[11px] text-[var(--text-muted)]">
            Routes via OpenAI-compatible adapter (custom api_base).
          </p>
        )}
      </Stack>
      {(provider.pricing_notes || provider.rate_limit_notes) && (
        <Stack gap="1" className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-2)] p-2">
          {provider.pricing_notes && (
            <p className="text-[11px] text-[var(--text-muted)]">
              <span className="font-semibold text-[var(--text)]">Pricing</span>
              {" · "}
              {provider.pricing_unit.replace(/_/g, " ")} ({provider.pricing_currency}).{" "}
              {provider.pricing_notes}
            </p>
          )}
          {provider.rate_limit_notes && (
            <p className="text-[11px] text-[var(--text-muted)]">
              <span className="font-semibold text-[var(--text)]">Rate limits</span>
              {" · "}
              {provider.rate_limit_notes}
            </p>
          )}
        </Stack>
      )}
      <Stack gap="1">
        <p className="text-xs font-semibold text-[var(--text)]">
          Models to enable
        </p>
        <p className="text-[11px] text-[var(--text-muted)]">
          Pick the models you want this key to be used for. You can change this later.
        </p>
        <ModelCheckboxList
          provider={provider}
          enabled={enabled}
          onToggleModel={onToggleModel}
        />
      </Stack>
      <Stack gap="1">
        <label htmlFor="add-provider-key" className="text-xs font-semibold">
          API key
        </label>
        <p className="text-[11px] text-[var(--text-muted)]">
          Optional — leave blank to add the provider without a key. The
          plaintext is encrypted at rest and never returned by the API.
        </p>
        <Cluster gap="2" align="center">
          <KeyRound className="size-3.5 text-[var(--text-muted)]" />
          <input
            id="add-provider-key"
            type="password"
            value={apiKey}
            onChange={(e) => onApiKey(e.target.value)}
            placeholder="Paste your key"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
          />
        </Cluster>
      </Stack>
      {alreadyAdded && (
        <p className="rounded-md border border-[var(--border-soft)] bg-[var(--warning-soft)] px-2 py-1 text-[11px] text-[var(--warning)]">
          You already have a {provider.display_name} provider configured.
          Adding another creates a second row.
        </p>
      )}
      <Cluster justify="end" gap="2">
        <Button
          variant="default"
          size="sm"
          onClick={onSubmit}
          disabled={submitting || (apiKey.length > 0 && apiKey.length < 8)}
        >
          {submitting ? "Adding…" : "Add provider"}
        </Button>
      </Cluster>
    </Stack>
  );
}


/**
 * The bordered, scrollable model-checkbox list for one provider. Shared
 * between the "Add provider" sheet (above) and the per-card "Edit models"
 * sheet so both render identical model rows (tooltip facts, pricing,
 * thinking/tools badges). `enabled` is the set of currently-checked model
 * ids; `onToggleModel` flips one id.
 */
export function ModelCheckboxList({
  provider, enabled, onToggleModel,
}: {
  provider: CatalogProvider;
  enabled: Set<string>;
  onToggleModel: (id: string) => void;
}) {
  return (
    <Stack gap="1" className="max-h-72 overflow-y-auto rounded-md border border-[var(--border-soft)] p-2">
      {provider.models.map((m) => {
        const checked = enabled.has(m.id);
        return (
          <label
            key={m.id}
            className="flex items-start gap-2 rounded-md px-2 py-1 hover:bg-[var(--surface-2)]"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggleModel(m.id)}
              className="mt-1"
            />
            <Stack gap="0">
              <Cluster gap="2" align="center">
                <span className="text-xs font-medium">{m.display_name}</span>
                <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                  {m.model_type}
                </span>
                {m.supports_vision && (
                  <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                    vision
                  </span>
                )}
                {m.supports_tools && (
                  <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                    tools
                  </span>
                )}
                {m.thinking && (
                  <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[var(--primary)]">
                    thinking
                  </span>
                )}
              </Cluster>
              {m.description && (
                <span className="text-[11px] text-[var(--text-muted)]">{m.description}</span>
              )}
              <span className="font-mono text-[10px] text-[var(--text-muted)]">
                {m.id} · {m.context_window.toLocaleString()} ctx
                {m.thinking &&
                  (m.non_thinking_variant
                    ? ` · non-thinking: ${m.non_thinking_variant}`
                    : m.thinking_optional
                      ? " · thinking optional"
                      : " · always thinking")}
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">
                {priceLabel(m.input_price, provider.pricing_currency)} in
                {" · "}
                {priceLabel(m.output_price, provider.pricing_currency)} out
                {rateLabel(m.rate_limit) ? ` · ${rateLabel(m.rate_limit)}` : ""}
              </span>
            </Stack>
          </label>
        );
      })}
    </Stack>
  );
}


function TierChip({ tier }: { tier: "free" | "paid" | "mixed" }) {
  const style =
    tier === "free"
      ? "bg-[var(--success-soft)] text-[var(--success)]"
      : tier === "paid"
        ? "bg-[var(--surface-2)] text-[var(--text-muted)]"
        : "bg-[var(--primary-soft)] text-[var(--primary)]";
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${style}`}
    >
      {tier}
    </span>
  );
}


export function toggleSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}
