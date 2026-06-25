"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";

import {
  api,
  ApiError,
  type CatalogProvider,
  type EnabledModel,
  type ModelSelection,
  type SlackAgentModelPick,
  type SlackAgentModels,
} from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Cluster, Stack } from "@/components/layout/primitives";
import { ModelSelector } from "@/components/ui/model-selector";

/** A stored pick (or the Athena default) as a `<ModelSelector>` value. */
function toSelection(pick: SlackAgentModelPick): ModelSelection {
  return { provider: pick.provider, model: pick.model_id, source: pick.source };
}

/** Build an `EnabledModel`-shaped row for the Athena default so the picker can
 *  always display + re-select it, even when the org never switched that model
 *  on in the enabled-models registry. Mirrors the ingestion card. */
function defaultAsEnabled(
  pick: SlackAgentModelPick,
  catalog: CatalogProvider[],
): EnabledModel {
  const cm = catalog
    .find((p) => p.id === pick.provider)
    ?.models.find((m) => m.id === pick.model_id);
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

export function SlackAgentModelCard({ catalog }: { catalog: CatalogProvider[] }) {
  const [config, setConfig] = useState<SlackAgentModels | null>(null);
  const [enabledModels, setEnabledModels] = useState<EnabledModel[]>([]);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const [cfg, enabled] = await Promise.all([
      api.models.slackAgent(),
      api.models.enabled(),
    ]);
    setConfig(cfg);
    // The Slack agent is an org-wide background agent - personal subscription
    // models are chat-only and can't drive it, so drop that rung from the picker.
    setEnabledModels(enabled.filter((m) => m.source !== "subscription"));
  }, []);

  useEffect(() => {
    void refresh().catch(() => {
      /* the parent page surfaces load errors; this card stays quiet */
    });
  }, [refresh]);

  // The effective pick: the org's explicit pick, else the Athena default (so a
  // value is always selected and the card never reads empty).
  const effective = config ? (config.model ?? config.default) : null;
  const onDefault = config != null && config.model == null;

  // The picker set: the org's enabled models PLUS the Athena default (so the
  // default is selectable even if it was never switched on in the registry).
  const models = useMemo<EnabledModel[]>(() => {
    if (!config) return enabledModels;
    const present = enabledModels.some(
      (m) =>
        m.provider === config.default.provider &&
        m.id === config.default.model_id &&
        m.source === "athena",
    );
    return present
      ? enabledModels
      : [...enabledModels, defaultAsEnabled(config.default, catalog)];
  }, [config, enabledModels, catalog]);

  const save = async (pick: SlackAgentModelPick | null) => {
    if (!config) return;
    setSaving(true);
    try {
      const updated = await api.models.setSlackAgent({ model: pick });
      setConfig(updated);
      toast.success(
        pick
          ? "Slack agent model updated."
          : "Slack agent model reset to the Athena default.",
      );
    } catch (e) {
      toast.error(
        e instanceof ApiError
          ? e.message
          : "Couldn't update the Slack agent model.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <Stack gap="4">
        <Stack gap="1">
          <h2 className="text-sm font-semibold text-[var(--text)]">
            Slack agent model
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            The model the @Athena Slack bot answers with. Pick an Athena-hosted
            model (runs on credit) or one of your own keys (BYOK, billed to you).
          </p>
        </Stack>
        {!config || !effective ? (
          <SlackAgentModelSkeleton />
        ) : (
          <Cluster
            justify="between"
            align="center"
            className="flex-wrap gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
          >
            <Cluster gap="1.5" align="center" className="min-w-0">
              <span className="text-sm font-medium text-[var(--text)]">
                Answer model
              </span>
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
                  onClick={() => void save(null)}
                  disabled={saving}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
                  title="Reset the Slack agent to the Athena default model"
                >
                  <RotateCcw className="size-3" aria-hidden />
                  Use Athena default
                </button>
              )}
              <ModelSelector
                models={models}
                value={toSelection(effective)}
                onChange={(sel) =>
                  void save({
                    provider: sel.provider,
                    model_id: sel.model,
                    source: sel.source === "byok" ? "byok" : "athena",
                  })
                }
                disabled={saving}
                align="end"
              />
            </Cluster>
          </Cluster>
        )}
      </Stack>
    </Card>
  );
}

function SlackAgentModelSkeleton() {
  return (
    <Cluster
      justify="between"
      align="center"
      aria-busy="true"
      aria-label="Loading the Slack agent model"
      className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
    >
      <div className="h-4 w-28 animate-pulse rounded-md bg-[var(--surface-3)]" />
      <div className="h-8 w-40 animate-pulse rounded-md bg-[var(--surface-3)]" />
    </Cluster>
  );
}
