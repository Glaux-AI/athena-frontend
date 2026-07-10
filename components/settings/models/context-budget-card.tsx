"use client";

/**
 * <ContextBudgetCard> - the per-org context budget + per-model overrides.
 *
 * The "context budget" is the input-context window (tokens) Athena keeps for a
 * model. Once a request grows past it, Athena automatically compacts older
 * context to fit. Historically a single flat window applied to every model;
 * this card makes it configurable:
 *
 *   - **Default budget** - the org-wide window applied to every model with no
 *     override. Cleared = the Athena platform default.
 *   - **Per-model overrides** - a window for a specific model that beats the
 *     default (e.g. a roomier window for a long-context model).
 *
 * Reads `api.models.contextBudget()` + the org's pickable models
 * (`api.models.enabled()`); writes via `api.models.setContextBudget()`. A model
 * override can't exceed the model's real context window.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Info, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  api,
  ApiError,
  type CatalogProvider,
  type ContextBudgets,
  type EnabledModel,
  type ModelContextBudget,
} from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { focusRing } from "@/components/ui/focus";
import { Pill } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { Stack, Cluster } from "@/components/layout/primitives";
import { ModelSelector } from "@/components/ui/model-selector";
import { cn } from "@/lib/cn";

/** A per-model override being edited. `value` is the raw input string so the
 *  field can be cleared mid-edit; it's parsed to a number on save. */
type Draft = { provider: string; model_id: string; value: string };

export function ContextBudgetCard({ catalog }: { catalog: CatalogProvider[] }) {
  const [config, setConfig] = useState<ContextBudgets | null>(null);
  const [enabledModels, setEnabledModels] = useState<EnabledModel[]>([]);
  const [defaultValue, setDefaultValue] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const [cfg, enabled] = await Promise.all([
      api.models.contextBudget(),
      api.models.enabled(),
    ]);
    setConfig(cfg);
    setDefaultValue(
      cfg.default_budget_tokens != null ? String(cfg.default_budget_tokens) : "",
    );
    setDrafts(
      cfg.overrides.map((o) => ({
        provider: o.provider,
        model_id: o.model_id,
        value: String(o.budget_tokens),
      })),
    );
    // Context budget is org-wide; personal subscription models are chat-only and
    // configured elsewhere, so drop that rung from the override picker.
    setEnabledModels(enabled.filter((mm) => mm.source !== "subscription"));
  }, []);

  useEffect(() => {
    void refresh().catch(() => {
      /* the parent page surfaces load errors; this card stays quiet */
    });
  }, [refresh]);

  const platformDefault = config?.platform_default_budget_tokens ?? 200000;

  // The picker's model set, deduped by (provider, model_id) - budget is a model
  // property, the same on either rung, so one row per model is enough.
  const pickerModels = useMemo<EnabledModel[]>(() => {
    const seen = new Set<string>();
    const out: EnabledModel[] = [];
    for (const mm of enabledModels) {
      const key = `${mm.provider}/${mm.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(mm);
    }
    return out;
  }, [enabledModels]);

  const modelLabel = useCallback(
    (provider: string, modelId: string) => {
      const cm = catalog
        .find((p) => p.id === provider)
        ?.models.find((mm) => mm.id === modelId);
      return cm?.display_name ?? modelId;
    },
    [catalog],
  );

  const modelWindow = useCallback(
    (provider: string, modelId: string): number | undefined =>
      catalog
        .find((p) => p.id === provider)
        ?.models.find((mm) => mm.id === modelId)?.context_window,
    [catalog],
  );

  const dirty = useMemo(() => {
    if (!config) return false;
    const a = defaultValue.trim();
    const b = config.default_budget_tokens != null ? String(config.default_budget_tokens) : "";
    if (a !== b) return true;
    if (drafts.length !== config.overrides.length) return true;
    const sortKey = (o: { provider: string; model_id: string }) => `${o.provider}/${o.model_id}`;
    const sortedDrafts = [...drafts].sort((x, y) => sortKey(x).localeCompare(sortKey(y)));
    const sortedSaved = [...config.overrides].sort((x, y) => sortKey(x).localeCompare(sortKey(y)));
    return sortedDrafts.some(
      (d, i) =>
        d.provider !== sortedSaved[i]!.provider ||
        d.model_id !== sortedSaved[i]!.model_id ||
        d.value.trim() !== String(sortedSaved[i]!.budget_tokens),
    );
  }, [config, defaultValue, drafts]);

  const addOverride = (provider: string, modelId: string) => {
    if (drafts.some((d) => d.provider === provider && d.model_id === modelId)) {
      toast.info(`${modelLabel(provider, modelId)} already has an override.`);
      return;
    }
    const seed = defaultValue.trim() || String(platformDefault);
    setDrafts((prev) => [...prev, { provider, model_id: modelId, value: seed }]);
  };

  const setDraftValue = (provider: string, modelId: string, value: string) => {
    setDrafts((prev) =>
      prev.map((d) =>
        d.provider === provider && d.model_id === modelId ? { ...d, value } : d,
      ),
    );
  };

  const removeOverride = (provider: string, modelId: string) => {
    setDrafts((prev) =>
      prev.filter((d) => !(d.provider === provider && d.model_id === modelId)),
    );
  };

  const save = async () => {
    // Default: blank = clear to platform default; else a positive integer.
    let defaultTokens: number | null = null;
    if (defaultValue.trim()) {
      const n = Number(defaultValue);
      if (!Number.isInteger(n) || n < 1000) {
        toast.error("Default budget must be a whole number of at least 1,000 tokens.");
        return;
      }
      defaultTokens = n;
    }
    const overrides: ModelContextBudget[] = [];
    for (const d of drafts) {
      const n = Number(d.value);
      const label = modelLabel(d.provider, d.model_id);
      if (!Number.isInteger(n) || n < 1000) {
        toast.error(`${label}: budget must be a whole number of at least 1,000 tokens.`);
        return;
      }
      const win = modelWindow(d.provider, d.model_id);
      if (win && n > win) {
        toast.error(`${label}: budget exceeds its ${win.toLocaleString()}-token window.`);
        return;
      }
      overrides.push({ provider: d.provider, model_id: d.model_id, budget_tokens: n });
    }
    setSaving(true);
    try {
      const updated = await api.models.setContextBudget({
        default_budget_tokens: defaultTokens,
        overrides,
      });
      setConfig(updated);
      setDefaultValue(
        updated.default_budget_tokens != null ? String(updated.default_budget_tokens) : "",
      );
      setDrafts(
        updated.overrides.map((o) => ({
          provider: o.provider,
          model_id: o.model_id,
          value: String(o.budget_tokens),
        })),
      );
      toast.success("Context budget saved.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save the context budget.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <Stack gap="4">
        <Stack gap="1">
          <h2 className="text-sm font-semibold text-[var(--text)]">Context budget</h2>
          <p className="text-xs text-[var(--text-muted)]">
            How much context Athena keeps for a model. Set a default for every model, and override
            it for specific models. The embedding model is fixed and managed by Athena.
          </p>
        </Stack>

        {!config ? (
          <ContextBudgetSkeleton />
        ) : (
          <Stack gap="4">
            {/* Org-wide default */}
            <Stack gap="1.5">
              <Cluster
                justify="between"
                align="center"
                className="flex-wrap gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
              >
                <Cluster gap="1.5" align="center" className="min-w-0">
                  <span className="text-sm font-medium text-[var(--text)]">Default budget</span>
                  <InfoHint text="Applied to every model without an override. Leave blank to use the Athena default." />
                  {!defaultValue.trim() && (
                    <Pill tone="neutral" size="sm">Default</Pill>
                  )}
                </Cluster>
                <Cluster gap="2" align="center">
                  {defaultValue.trim() && (
                    <button
                      type="button"
                      onClick={() => setDefaultValue("")}
                      disabled={saving}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50",
                        focusRing,
                      )}
                      title="Use the Athena default budget."
                    >
                      <RotateCcw className="size-3" aria-hidden />
                      Use Athena default
                    </button>
                  )}
                  <TokenInput
                    value={defaultValue}
                    onChange={setDefaultValue}
                    placeholder={platformDefault.toLocaleString()}
                    disabled={saving}
                    ariaLabel="Default context budget in tokens"
                  />
                  <span className="text-xs text-[var(--text-subtle)]">tokens</span>
                </Cluster>
              </Cluster>
              {/* The silent hint about the compaction behaviour. */}
              <p className="px-1 text-micro text-[var(--text-subtle)]">
                Athena automatically compacts older context once a request grows past this limit.
              </p>
            </Stack>

            {/* Per-model overrides */}
            <Stack gap="2">
              <Cluster justify="between" align="center" className="flex-wrap gap-2">
                <span className="text-xs font-medium text-[var(--text-muted)]">
                  Per-model overrides
                </span>
                <Cluster gap="1.5" align="center">
                  <span className="text-xs text-[var(--text-subtle)]">
                    <Plus className="mr-0.5 inline size-3" aria-hidden />
                    Add a model
                  </span>
                  <ModelSelector
                    models={pickerModels}
                    value={null}
                    onChange={(sel) => addOverride(sel.provider, sel.model)}
                    disabled={saving}
                    align="end"
                  />
                </Cluster>
              </Cluster>

              {drafts.length === 0 ? (
                <p className="rounded-md border border-[var(--border)] px-3 py-3 text-center text-xs text-[var(--text-subtle)]">
                  No overrides. Every model uses the default budget above.
                </p>
              ) : (
                <Stack gap="2">
                  {drafts.map((d) => {
                    const win = modelWindow(d.provider, d.model_id);
                    return (
                      <Cluster
                        key={`${d.provider}/${d.model_id}`}
                        justify="between"
                        align="center"
                        className="flex-wrap gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                      >
                        <Stack gap="0" className="min-w-0">
                          <span className="truncate text-sm font-medium text-[var(--text)]">
                            {modelLabel(d.provider, d.model_id)}
                          </span>
                          {win ? (
                            <span className="text-micro text-[var(--text-subtle)]">
                              Window {win.toLocaleString()} tokens
                            </span>
                          ) : null}
                        </Stack>
                        <Cluster gap="2" align="center">
                          <TokenInput
                            value={d.value}
                            onChange={(v) => setDraftValue(d.provider, d.model_id, v)}
                            placeholder={(defaultValue.trim() || String(platformDefault))}
                            disabled={saving}
                            ariaLabel={`Context budget for ${modelLabel(d.provider, d.model_id)}`}
                          />
                          <span className="text-xs text-[var(--text-subtle)]">tokens</span>
                          <button
                            type="button"
                            onClick={() => removeOverride(d.provider, d.model_id)}
                            disabled={saving}
                            className={cn(
                              "inline-flex items-center rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-50",
                              focusRing,
                            )}
                            aria-label={`Remove override for ${modelLabel(d.provider, d.model_id)}`}
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                          </button>
                        </Cluster>
                      </Cluster>
                    );
                  })}
                </Stack>
              )}
            </Stack>

            <Cluster justify="end" align="center">
              <Button size="sm" onClick={() => void save()} disabled={saving || !dirty}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </Cluster>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

/** A compact numeric token input matching the settings field styling. */
function TokenInput({
  value,
  onChange,
  placeholder,
  disabled,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={1000}
      step={1000}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      className="w-28 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-right font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}

/** A small hover/focus info bubble (mirrors `<IngestionModelsCard>`). */
function InfoHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="What is this for?"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="text-[var(--text-subtle)] outline-none hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <Info className="size-3.5" aria-hidden />
      </button>
      {open && (
        <span
          role="tooltip"
          className={cn(
            "glass-panel absolute left-0 top-full z-[var(--z-tooltip)] mt-1 w-64 p-3",
            "text-xs leading-relaxed text-[var(--text-muted)]",
          )}
        >
          {text}
        </span>
      )}
    </span>
  );
}

function ContextBudgetSkeleton() {
  return (
    <Stack gap="3" aria-busy="true" aria-label="Loading context budget">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-10 w-full" />
    </Stack>
  );
}
