"use client";

/**
 * <EnabledModelsManager> — the model-per-action registry surface.
 *
 * Replaces the deleted role→model routing. An org switches catalog models ON;
 * the enabled set is exactly what the `<ModelSelector>` offers at every AI
 * action — the chat composer and each task stage's "Run with Athena". Reads
 * `api.models.enabled()` and toggles via `api.models.setEnabled()`. Embeddings
 * are never listed (the embed model is fixed/platform/hidden).
 */

import { useEffect, useMemo, useState } from "react";
import { Brain, Eye } from "lucide-react";
import { toast } from "sonner";

import {
  api,
  ApiError,
  type CatalogProvider,
  type EnabledModel,
} from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";

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
        for (const r of rows) map[`${r.provider}/${r.id}`] = r.enabled;
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

  // Chat/agent models only — embeddings are fixed/platform and never selectable.
  const providers = useMemo(
    () =>
      catalog
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
          <h2 className="text-sm font-semibold text-[var(--text)]">Enabled models</h2>
          <p className="text-xs text-[var(--text-muted)]">
            Switch on the models your team can pick from. The enabled set is what the model
            selector offers in chat and at every task stage. Models backed by your own key bill
            to you; Athena-hosted models draw from credit.
          </p>
        </Stack>
        <Stack gap="4">
          {providers.map((p) => (
            <Stack key={p.id} gap="2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                {p.display_name}
              </span>
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
                        <span className="text-sm text-[var(--text)]">{m.display_name}</span>
                        {m.thinking_mode !== "none" && (
                          <Brain className="size-3.5 text-[var(--primary)]" aria-label="Thinking" />
                        )}
                        {m.supports_vision && (
                          <Eye className="size-3.5 text-[var(--text-subtle)]" aria-label="Vision" />
                        )}
                      </Cluster>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        disabled={!loaded || pending === key}
                        onClick={() => void toggle(p.id, m.id, !on)}
                        aria-label={`${on ? "Disable" : "Enable"} ${m.display_name}`}
                        className={cn(
                          "relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--surface)]",
                          on ? "bg-[var(--primary)]" : "bg-[var(--surface-3)]",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 size-4 rounded-full bg-[var(--surface)] shadow-[var(--shadow-1)] transition",
                            on ? "translate-x-4" : "translate-x-0.5",
                          )}
                        />
                      </button>
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
