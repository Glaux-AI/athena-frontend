"use client";

/**
 * <EnabledModelsManager> - the model-per-action registry surface.
 *
 * Replaces the deleted role→model routing. An org switches catalog models ON;
 * the enabled set is exactly what the `<ModelSelector>` offers at every AI
 * action - the chat composer and each task stage's "Run with Athena". Reads
 * `api.models.enabled()` and toggles via `api.models.setEnabled()`. Embeddings
 * are never listed (the embed model is fixed/platform/hidden).
 */

import { useEffect, useMemo, useState } from "react";
import { Brain, Eye } from "lucide-react";
import { toast } from "sonner";

import {
  api,
  ApiError,
  type CatalogModel,
  type CatalogProvider,
  type EnabledModel,
} from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Switch } from "@/components/ui/switch";
import { Stack, Cluster } from "@/components/layout/primitives";
import { priceLabel, rateLabel } from "@/lib/models/format";

export function EnabledModelsManager({ catalog }: { catalog: CatalogProvider[] }) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.models
      .enabled()
      .then((rows: EnabledModel[]) => {
        if (cancelled) return;
        const map: Record<string, boolean> = {};
        // Only the athena rung - the same (provider, model) can also be live
        // as a `byok` row (always enabled=true), which must not flip these
        // platform-credit toggles.
        for (const r of rows) {
          if (r.source === "athena") map[`${r.provider}/${r.id}`] = r.enabled;
        }
        setEnabled(map);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Only Athena-hosted providers (the platform proxy holds their key, so they
  // run on credit with NO key) - the "Athena models". BYO-only providers are
  // managed on their own card below, after their key is saved. Embeddings are
  // fixed/platform and never selectable.
  const providers = useMemo(
    () =>
      catalog
        .filter((p) => p.platform_hosted)
        .map((p) => ({
          ...p,
          models: p.models.filter(
            (m) => !m.supports_embeddings && m.model_type !== "embedding",
          ),
        }))
        .filter((p) => p.models.length > 0),
    [catalog],
  );

  const toggle = async (provider: string, modelId: string, next: boolean) => {
    const key = `${provider}/${modelId}`;
    setPending(key);
    setEnabled((e) => ({ ...e, [key]: next })); // optimistic
    try {
      await api.models.setEnabled(provider, modelId, next);
    } catch (err) {
      setEnabled((e) => ({ ...e, [key]: !next })); // revert
      toast.error(err instanceof ApiError ? err.message : "Couldn't update the model.");
    } finally {
      setPending(null);
    }
  };

  return (
    <Card>
      <Stack gap="4">
        <Stack gap="1">
          <h2 className="text-sm font-semibold text-[var(--text)]">Athena models</h2>
          <p className="text-xs text-[var(--text-muted)]">
            Models Athena hosts - usable on your credit with no API key. Switch on the ones your
            team can pick from in chat and at every task stage; hover a model for its pricing and
            details. To use another provider&apos;s models, add its key below - they bill to you
            and appear in the picker too.
          </p>
        </Stack>
        <Stack gap="4">
          {providers.map((p) => (
            <Stack key={p.id} gap="2">
              <Eyebrow>{p.display_name}</Eyebrow>
              <Stack gap="1.5">
                {p.models.map((m) => {
                  const key = `${p.id}/${m.id}`;
                  const on = enabled[key] ?? false;
                  return (
                    <Cluster
                      key={m.id}
                      justify="between"
                      align="center"
                      className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                    >
                      <Cluster gap="2" align="center">
                        <ModelInfo model={m} currency={p.pricing_currency} />
                        {m.thinking_mode !== "none" && (
                          <Brain className="size-3.5 text-[var(--primary)]" aria-label="Thinking" />
                        )}
                        {m.supports_vision && (
                          <Eye className="size-3.5 text-[var(--text-subtle)]" aria-label="Vision" />
                        )}
                      </Cluster>
                      <Switch
                        checked={on}
                        onCheckedChange={(next) => void toggle(p.id, m.id, next)}
                        disabled={!loaded || pending === key}
                        aria-label={`${on ? "Disable" : "Enable"} ${m.display_name}`}
                      />
                    </Cluster>
                  );
                })}
              </Stack>
            </Stack>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}

/** The model's name with a hover/focus tooltip carrying its pricing + details
 *  (mirrors the `<ModelChip>` tooltip pattern; token-styled, no Radix). */
function ModelInfo({ model, currency }: { model: CatalogModel; currency: string }) {
  const [open, setOpen] = useState(false);
  const rate = rateLabel(model.rate_limit);
  const pricing = `${priceLabel(model.input_price, currency)} in · ${priceLabel(model.output_price, currency)} out`;
  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        tabIndex={0}
        role="note"
        aria-label={`${model.display_name}. ${model.description} ${pricing}.`}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="cursor-help text-sm text-[var(--text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        {model.display_name}
      </span>
      {open && (
        <span
          role="tooltip"
          className="glass-panel absolute left-0 top-full z-[var(--z-tooltip)] mt-1 w-72 p-3 text-xs"
        >
          <span className="font-semibold text-[var(--text)]">{model.display_name}</span>
          {model.description && (
            <span className="mt-1 block text-[var(--text-muted)]">{model.description}</span>
          )}
          <span className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-micro">
            <Fact label="Context" value={`${model.context_window.toLocaleString()} tok`} />
            {model.max_output_tokens > 0 && (
              <Fact label="Max output" value={`${model.max_output_tokens.toLocaleString()} tok`} />
            )}
            <Fact label="Pricing" value={pricing} />
            <Fact label="Rate limit" value={rate ?? "See provider notes"} />
          </span>
          <span className="mt-2 block font-mono text-micro text-[var(--text-muted)]">{model.id}</span>
        </span>
      )}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="text-[var(--text)]">{value}</span>
    </>
  );
}
