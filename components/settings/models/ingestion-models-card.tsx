"use client";

/**
 * <IngestionModelsCard> - the two configurable per-org ingestion models.
 *
 * Ingestion reads the org's repos and writes its knowledge base on two text
 * tiers, each independently configurable:
 *
 *   1. **Per-file summaries** - the high-volume tier (runs once per file).
 *   2. **Deep synthesis** - the low-volume, quality-critical tier (the
 *      architecture + repo / domain / org overview narrative).
 *
 * Reads `api.models.ingestion()` (the org's picks + the Athena defaults) and
 * the org's pickable models (`api.models.enabled()`); writes via
 * `api.models.setIngestion()`. Each tier defaults to an Athena-hosted model
 * (pre-selected) and is reset to it with "Use Athena default". The EMBEDDING
 * model is intentionally NOT here - it's fixed/platform/hidden.
 *
 * Picking a "Your key" (BYOK) model bills that tier to the org's own provider
 * key instead of Athena credit - and takes ingestion off the credit ledger, so
 * a credit-paused sync resumes once both tiers point at the org's key.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Info, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import {
  api,
  ApiError,
  type CatalogProvider,
  type EnabledModel,
  type IngestModelPick,
  type IngestModels,
  type ModelSelection,
} from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { ModelSelector } from "@/components/ui/model-selector";
import { cn } from "@/lib/cn";

type TierKey = "file" | "synthesis";

const TIER_COPY: Record<TierKey, { label: string; hint: string }> = {
  file: {
    label: "Per-file summaries",
    hint:
      "Reads each file and writes its summary - the high-volume tier that runs once per file, so its cost scales with repo size. A fast, inexpensive model is usually the right choice here.",
  },
  synthesis: {
    label: "Deep synthesis",
    hint:
      "Writes the architecture and repo / domain / org overviews from the whole knowledge graph. Low-volume but quality-critical, so a stronger model pays off here.",
  },
};

/** A stored pick (or the Athena default) as a `<ModelSelector>` value. */
function toSelection(pick: IngestModelPick): ModelSelection {
  return { provider: pick.provider, model: pick.model_id, source: pick.source };
}

/** Is this tier currently on its Athena default (no explicit org pick)? */
function isDefault(pick: IngestModelPick | null): boolean {
  return pick === null;
}

/** Build an `EnabledModel`-shaped row for an Athena-default pick so the picker
 *  can always display + re-select the default even when the org never switched
 *  that model on in the enabled-models registry. Uses the catalog for display
 *  detail when present, else falls back to the model id (so a selected default
 *  never renders as an empty "Select model"). */
function defaultAsEnabled(
  pick: IngestModelPick,
  catalog: CatalogProvider[],
): EnabledModel {
  const cm = catalog.find((p) => p.id === pick.provider)?.models.find((m) => m.id === pick.model_id);
  return {
    id: pick.model_id,
    provider: pick.provider,
    display_name: cm?.display_name ?? pick.model_id,
    source: "athena",
    supports_tools: cm?.supports_tools ?? true,
    supports_vision: cm?.supports_vision ?? false,
    thinking: cm?.thinking ?? false,
    thinking_optional: cm?.thinking_optional ?? false,
    context_window: cm?.context_window ?? 0,
    input_price: cm?.input_price ?? null,
    output_price: cm?.output_price ?? null,
    model_type: cm?.model_type ?? "chat",
    enabled: true,
  };
}

export function IngestionModelsCard({ catalog }: { catalog: CatalogProvider[] }) {
  const [config, setConfig] = useState<IngestModels | null>(null);
  const [enabledModels, setEnabledModels] = useState<EnabledModel[]>([]);
  const [saving, setSaving] = useState<TierKey | null>(null);

  const refresh = useCallback(async () => {
    const [cfg, enabled] = await Promise.all([
      api.models.ingestion(),
      api.models.enabled(),
    ]);
    setConfig(cfg);
    // Ingestion is background / org-wide - personal subscription models are
    // chat-only and must never run it, so drop that rung from the picker.
    setEnabledModels(enabled.filter((m) => m.source !== "subscription"));
  }, []);

  useEffect(() => {
    void refresh().catch(() => {
      /* the parent page surfaces load errors; this card stays quiet */
    });
  }, [refresh]);

  // The effective pick per tier: the org's explicit pick, else the Athena
  // default (so a value is always selected and the card never reads empty).
  const effective = useMemo<Record<TierKey, IngestModelPick> | null>(() => {
    if (!config) return null;
    return {
      file: config.file ?? config.file_default,
      synthesis: config.synthesis ?? config.synthesis_default,
    };
  }, [config]);

  // The picker set: the org's enabled models PLUS the two Athena defaults (so a
  // default that was never switched on in the registry is still selectable).
  const models = useMemo<EnabledModel[]>(() => {
    if (!config) return enabledModels;
    const merged = [...enabledModels];
    for (const pick of [config.file_default, config.synthesis_default]) {
      const present = merged.some(
        (m) => m.provider === pick.provider && m.id === pick.model_id && m.source === "athena",
      );
      if (present) continue;
      merged.push(defaultAsEnabled(pick, catalog));
    }
    return merged;
  }, [config, enabledModels, catalog]);

  const save = async (tier: TierKey, pick: IngestModelPick | null) => {
    if (!config) return;
    const next: { file: IngestModelPick | null; synthesis: IngestModelPick | null } = {
      file: config.file,
      synthesis: config.synthesis,
      [tier]: pick,
    };
    setSaving(tier);
    try {
      const updated = await api.models.setIngestion(next);
      setConfig(updated);
      toast.success(
        pick
          ? `${TIER_COPY[tier].label} model updated.`
          : `${TIER_COPY[tier].label} reset to the Athena default.`,
      );
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't update the ingestion model.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card>
      <Stack gap="4">
        <Stack gap="1">
          <h2 className="text-sm font-semibold text-[var(--text)]">Ingestion models</h2>
          <p className="text-xs text-[var(--text-muted)]">
            The models Athena uses to read your repos and build your knowledge base. Defaults to
            Athena-hosted models. Pick a model under &ldquo;Your key&rdquo; to bill that tier to
            your own provider key instead of Athena credit. The embedding model is fixed and
            managed by Athena.
          </p>
        </Stack>
        {!config || !effective ? (
          <IngestionModelsSkeleton />
        ) : (
          <Stack gap="3">
            {(["file", "synthesis"] as TierKey[]).map((tier) => {
              const pick = effective[tier];
              const onDefault = isDefault(config[tier]);
              const defaultPick = tier === "file" ? config.file_default : config.synthesis_default;
              return (
                <Cluster
                  key={tier}
                  justify="between"
                  align="center"
                  className="flex-wrap gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                >
                  <Cluster gap="1.5" align="center" className="min-w-0">
                    <span className="text-sm font-medium text-[var(--text)]">
                      {TIER_COPY[tier].label}
                    </span>
                    <InfoHint text={TIER_COPY[tier].hint} />
                    {onDefault && (
                      <span className="rounded-full bg-[var(--surface-3)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-subtle)]">
                        Default
                      </span>
                    )}
                  </Cluster>
                  <Cluster gap="2" align="center">
                    {!onDefault && (
                      <button
                        type="button"
                        onClick={() => void save(tier, null)}
                        disabled={saving === tier}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
                        title={`Reset ${TIER_COPY[tier].label} to the Athena default (${defaultPick.model_id}).`}
                      >
                        <RotateCcw className="size-3" aria-hidden />
                        Use Athena default
                      </button>
                    )}
                    <ModelSelector
                      models={models}
                      value={toSelection(pick)}
                      onChange={(sel) =>
                        void save(tier, {
                          provider: sel.provider,
                          model_id: sel.model,
                          source: sel.source === "byok" ? "byok" : "athena",
                        })
                      }
                      disabled={saving === tier}
                      align="end"
                    />
                  </Cluster>
                </Cluster>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

/** A small hover/focus info bubble carrying the tier's plain-language hint
 *  (mirrors the glass-tooltip pattern in `<EnabledModelsManager>`). */
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
            "glass absolute left-0 top-full z-50 mt-1 w-64 rounded-xl p-3",
            "text-xs leading-relaxed text-[var(--text-muted)] shadow-[var(--shadow-3)]",
          )}
        >
          {text}
        </span>
      )}
    </span>
  );
}

function IngestionModelsSkeleton() {
  return (
    <Stack gap="3" aria-busy="true" aria-label="Loading ingestion models">
      {[0, 1].map((i) => (
        <Cluster
          key={i}
          justify="between"
          align="center"
          className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
        >
          <div className="h-4 w-32 animate-pulse rounded-md bg-[var(--surface-3)]" />
          <div className="h-8 w-40 animate-pulse rounded-md bg-[var(--surface-3)]" />
        </Cluster>
      ))}
    </Stack>
  );
}
