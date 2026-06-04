"use client";

/**
 * §7.8.1 — per-role routing surface on `/settings/models`.
 *
 * For each configurable chat/reasoning role
 * (planner / heavy-reasoner / chat-fast / long-context / workhorse-cheap /
 *  code-editor / code-editor-cheap), the org admin picks a primary
 * `(provider, model)` plus an ordered fallback chain the LLM client walks
 * on `LLMError`. Pickers list only chat/vision `(provider, model)` pairs the
 * org has saved a key for AND that appear in the catalog — typos can't slip
 * through. The `embeddings` role is intentionally NOT shown: the embedding
 * model is fixed (`gemini-embedding-001`), free, and platform-managed
 * (backend-only config), so it's never a per-org choice.
 *
 * Saves on click — no implicit submit on field change to avoid
 * losing a draft mid-edit.
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";
import {
  api,
  ApiError,
  MODEL_ROLE_ALIASES,
  type CatalogProvider,
  type ModelProvider,
  type ModelRoleAlias,
  type RoleBinding,
  type RoleChainEntry,
  type RoleDefault,
} from "@/lib/api/client";


interface RoleRoutingSectionProps {
  orgId: string;
  providers: ModelProvider[];
  catalog: CatalogProvider[];
}

export function RoleRoutingSection({
  orgId, providers, catalog,
}: RoleRoutingSectionProps) {
  const [open, setOpen] = useState(false);
  const [bindings, setBindings] = useState<RoleBinding[]>([]);
  const [defaults, setDefaults] = useState<RoleDefault[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useMemo(() => async () => {
    setLoading(true);
    setError(null);
    try {
      const [b, d] = await Promise.all([
        api.modelRoleBindings.list(orgId),
        api.llmProviders.roleDefaults(),
      ]);
      setBindings(b);
      setDefaults(d);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load bindings.");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { if (open) void refresh(); }, [open, refresh]);

  // Providers the org holds a decryptable key for — drives the BYO/Athena
  // routing badge. Mirrors the backend's key-presence dispatch decision.
  const keyedProviders = useMemo(
    () => new Set(providers.filter((p) => p.has_api_key).map((p) => p.provider)),
    [providers],
  );
  const candidates = useMemo(
    () => buildCandidates(providers, catalog, defaults, keyedProviders),
    [providers, catalog, defaults, keyedProviders],
  );
  const defaultByRole = useMemo(
    () => new Map(defaults.map((d) => [d.role, d])),
    [defaults],
  );

  return (
    <Card variant="elevated">
      <Stack gap="3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <Stack gap="0">
            <span className="text-base font-semibold">Role routing</span>
            <span className="text-xs text-[var(--text-muted)]">
              Per-role primary + fallback chain. The agent walks the
              chain on rate-limit / 5xx.
            </span>
          </Stack>
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        {open && (
          <Stack gap="3">
            {error && (
              <p className="text-xs text-[var(--danger)]">{error}</p>
            )}
            {loading && bindings.length === 0 && <RoleListSkeleton />}
            {!loading && (
              <>
                {candidates.length === 0 && (
                  <p className="text-xs text-[var(--text-muted)]">
                    Showing Athena&apos;s platform defaults. Add a provider
                    with an enabled model below to override any role.
                  </p>
                )}
                {MODEL_ROLE_ALIASES.filter((role) => role !== "embeddings").map((role) => (
                  <RoleRow
                    key={role}
                    role={role}
                    binding={bindings.find((b) => b.role === role) ?? null}
                    defaultModel={defaultByRole.get(role) ?? null}
                    candidates={candidates}
                    keyedProviders={keyedProviders}
                    orgId={orgId}
                    onChanged={refresh}
                  />
                ))}
              </>
            )}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}


interface Candidate {
  provider: string;
  providerDisplay: string;
  model: string;
  modelDisplay: string;
  /**
   * How a role bound to this `(provider, model)` will actually route:
   * `"byo"` when the org holds a saved key for the provider (dispatch goes
   * SDK-direct on that key — `byo_router.resolve_byo_chain`), else
   * `"platform"` (Athena's shared pool). Derived purely from key presence,
   * which is exactly how the backend decides — so the same Gemini model is no
   * longer ambiguous between "your key" and "Athena".
   */
  keySource: "byo" | "platform";
}


function buildCandidates(
  providers: ModelProvider[],
  catalog: CatalogProvider[],
  defaults: RoleDefault[],
  keyedProviders: Set<string>,
): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const add = (
    provider: string, providerDisplay: string, model: string, modelDisplay: string,
  ) => {
    const k = candidateKey(provider, model);
    if (seen.has(k)) return;
    seen.add(k);
    out.push({
      provider, providerDisplay, model, modelDisplay,
      keySource: keyedProviders.has(provider) ? "byo" : "platform",
    });
  };

  // Only chat/vision models are configurable. Embeddings are platform-managed
  // (fixed `gemini-embedding-001`, free) so embedding-type models are never
  // pickable for any role.
  const isChat = (modelType: string) => modelType !== "embedding";

  // 1. Models on a saved provider key (BYO — routed SDK-direct with the key).
  for (const p of providers) {
    const catalogEntry = catalog.find((c) => c.id === p.provider);
    if (!catalogEntry) continue;
    for (const modelId of p.enabled_models) {
      const catalogModel = catalogEntry.models.find((mm) => mm.id === modelId);
      if (catalogModel && isChat(catalogModel.model_type)) {
        add(p.provider, catalogEntry.display_name, modelId, catalogModel.display_name);
      }
    }
  }

  // 2. The shared-pool (platform-default) provider's full catalog — reachable
  //    through Athena's own key via the proxy, so a role can be switched to any
  //    of these WITHOUT the org saving a BYO key (see byo_router.resolve_proxy_model).
  const sharedProviderIds = new Set(defaults.map((d) => d.provider.toLowerCase()));
  for (const catalogEntry of catalog) {
    if (!sharedProviderIds.has(catalogEntry.id)) continue;
    for (const m of catalogEntry.models) {
      if (!isChat(m.model_type)) continue;
      add(catalogEntry.id, catalogEntry.display_name, m.id, m.display_name);
    }
  }
  return out;
}


function RoleRow({
  role, binding, defaultModel, candidates, keyedProviders, orgId, onChanged,
}: {
  role: ModelRoleAlias;
  binding: RoleBinding | null;
  defaultModel: RoleDefault | null;
  candidates: Candidate[];
  keyedProviders: Set<string>;
  orgId: string;
  onChanged: () => void | Promise<void>;
}) {
  const [primary, setPrimary] = useState<string>(
    binding ? candidateKey(binding.primary_provider, binding.primary_model) : ""
  );
  const [chain, setChain] = useState<RoleChainEntry[]>(binding?.fallback_chain ?? []);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    setPrimary(
      binding ? candidateKey(binding.primary_provider, binding.primary_model) : ""
    );
    setChain(binding?.fallback_chain ?? []);
  }, [binding]);

  const dirty = useMemo(() => {
    const stored = binding
      ? {
          primary: candidateKey(binding.primary_provider, binding.primary_model),
          chain: binding.fallback_chain.map((e) => candidateKey(e.provider, e.model)).join(","),
        }
      : { primary: "", chain: "" };
    const current = {
      primary,
      chain: chain.map((e) => candidateKey(e.provider, e.model)).join(","),
    };
    return stored.primary !== current.primary || stored.chain !== current.chain;
  }, [binding, primary, chain]);

  const save = async () => {
    if (!primary) {
      toast.error("Pick a primary model first.");
      return;
    }
    const parsed = parseCandidateKey(primary);
    if (parsed === null) return;
    setSaving(true);
    try {
      await api.modelRoleBindings.put(orgId, role, {
        primary_provider: parsed.provider,
        primary_model: parsed.model,
        fallback_chain: chain,
      });
      toast.success(`Updated routing for ${role}.`);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save binding.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!binding) return;
    setRemoving(true);
    try {
      await api.modelRoleBindings.delete(orgId, role);
      toast.success(`Cleared routing for ${role}.`);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't clear binding.");
    } finally {
      setRemoving(false);
    }
  };

  // A binding that equals the role's platform default (e.g. the rows seeded
  // at org-create) reads as "Platform default", not "Custom". Key-source is
  // orthogonal: only a binding can route BYO (no binding → shared pool).
  const effective = binding
    ? {
        label: isPlatformDefault(binding, defaultModel) ? "Platform default" : "Custom",
        provider: binding.primary_provider,
        model: binding.primary_model,
        keyed: keyedProviders.has(binding.primary_provider),
      }
    : defaultModel
      ? { label: "Platform default", provider: defaultModel.provider, model: defaultModel.model, keyed: false }
      : null;

  return (
    <Stack gap="2" className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 transition-colors hover:border-[var(--border-strong)]">
      <Cluster justify="between" align="center">
        <span className="font-mono text-xs font-semibold">{role}</span>
        {binding && (
          <Button
            variant="ghost"
            size="sm"
            onClick={remove}
            disabled={removing}
            aria-label={`Clear binding for ${role}`}
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </Cluster>
      {effective && (
        <Cluster gap="1" align="center" className="text-[11px]">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 font-medium",
              effective.label === "Custom"
                ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                : "bg-[var(--surface-2)] text-[var(--text-muted)]",
            )}
          >
            {effective.label}
          </span>
          <span className="font-mono text-[var(--text-muted)]">
            {effective.provider} · {effective.model}
          </span>
          {binding && (
            <span
              className={cn(
                "rounded px-1.5 py-0.5 font-medium",
                effective.keyed
                  ? "bg-[var(--info-soft)] text-[var(--info-ink)]"
                  : "bg-[var(--surface-2)] text-[var(--text-muted)]",
              )}
              title={
                effective.keyed
                  ? "Routes through your saved provider key (billed to you)"
                  : "Routes through Athena's shared pool (uses Athena credit)"
              }
            >
              {effective.keyed ? "Your key" : "Athena"}
            </span>
          )}
        </Cluster>
      )}
      {candidates.length > 0 ? (
        <>
          <Stack gap="1">
            <label className="text-[11px] text-[var(--text-muted)]">
              {binding ? "Primary" : "Override primary"}
            </label>
            <CandidateSelect
              value={primary}
              candidates={candidates}
              onChange={setPrimary}
            />
          </Stack>
          <FallbackChainEditor
            chain={chain}
            candidates={candidates}
            primary={primary}
            onChange={setChain}
          />
          <Cluster justify="end" gap="2">
            <Button
              variant="default"
              size="sm"
              onClick={save}
              disabled={saving || !dirty || !primary}
            >
              {saving ? "Saving…" : "Save routing"}
            </Button>
          </Cluster>
        </>
      ) : null}
    </Stack>
  );
}


function FallbackChainEditor({
  chain, candidates, primary, onChange,
}: {
  chain: RoleChainEntry[];
  candidates: Candidate[];
  primary: string;
  onChange: (next: RoleChainEntry[]) => void;
}) {
  const [pendingPick, setPendingPick] = useState<string>("");

  const append = () => {
    const parsed = parseCandidateKey(pendingPick);
    if (parsed === null) return;
    if (candidateKey(parsed.provider, parsed.model) === primary) return;
    if (chain.some((e) => candidateKey(e.provider, e.model) === pendingPick)) return;
    onChange([...chain, parsed]);
    setPendingPick("");
  };

  const move = (index: number, direction: -1 | 1) => {
    const next = [...chain];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  };

  const remove = (index: number) => {
    onChange(chain.filter((_, i) => i !== index));
  };

  return (
    <Stack gap="1">
      <label className="text-[11px] text-[var(--text-muted)]">
        Fallback chain (ordered)
      </label>
      {chain.length === 0 && (
        <p className="text-[11px] text-[var(--text-muted)]">
          No fallback configured. The agent raises on primary failure.
        </p>
      )}
      <Stack gap="1">
        {chain.map((entry, i) => (
          <Cluster
            key={candidateKey(entry.provider, entry.model)}
            justify="between"
            align="center"
            className="rounded-md border border-[var(--border)] px-2 py-1 text-xs"
          >
            <span className="font-mono">
              {entry.provider} · {entry.model}
            </span>
            <Cluster gap="1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label="Move up"
              >
                <ArrowUp className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => move(i, 1)}
                disabled={i === chain.length - 1}
                aria-label="Move down"
              >
                <ArrowDown className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => remove(i)}
                aria-label="Remove fallback entry"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </Cluster>
          </Cluster>
        ))}
      </Stack>
      <Cluster gap="2">
        <CandidateSelect
          value={pendingPick}
          candidates={candidates}
          onChange={setPendingPick}
          placeholder="Add a fallback model…"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={append}
          disabled={!pendingPick || pendingPick === primary}
        >
          Add
        </Button>
      </Cluster>
    </Stack>
  );
}


function CandidateSelect({
  value, candidates, onChange, placeholder,
}: {
  value: string;
  candidates: Candidate[];
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      <option value="">{placeholder ?? "Select model…"}</option>
      {candidates.map((c) => (
        <option key={candidateKey(c.provider, c.model)} value={candidateKey(c.provider, c.model)}>
          {c.providerDisplay} · {c.modelDisplay} — {c.keySource === "byo" ? "Your key" : "Athena"}
        </option>
      ))}
    </select>
  );
}


function RoleListSkeleton() {
  return (
    <Stack gap="2" aria-busy="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-20 w-full animate-pulse rounded-md bg-[var(--surface-2)]"
        />
      ))}
    </Stack>
  );
}


function candidateKey(provider: string, model: string): string {
  return `${provider}|${model}`;
}


/** True when a binding points at the role's platform default `(provider, model)`.
 * `RoleDefault.provider` is the catalog *label* ("Google"); the binding stores
 * the catalog *id* ("google"), so compare case-insensitively. */
function isPlatformDefault(
  binding: RoleBinding, def: RoleDefault | null,
): boolean {
  if (!def) return false;
  return (
    binding.primary_provider.toLowerCase() === def.provider.toLowerCase() &&
    binding.primary_model === def.model
  );
}


function parseCandidateKey(key: string): RoleChainEntry | null {
  const i = key.indexOf("|");
  if (i <= 0 || i === key.length - 1) return null;
  return { provider: key.slice(0, i), model: key.slice(i + 1) };
}
