"use client";

/**
 * /settings/models — bring-your-own model providers + regional routing.
 *
 * Lets an org point Athena at Anthropic-direct, AWS Bedrock, Azure OpenAI,
 * OpenAI-direct, or Vertex AI for residency / commit-utilization reasons.
 */

import { useEffect, useState } from "react";
import { Cpu, Loader2, Star, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { useSession } from "@/lib/session/SessionProvider";
import { api, ApiError, type ModelProvider } from "@/lib/api/client";
import { cn } from "@/lib/cn";

export default function ModelProvidersPage() {
  const { activeOrgId } = useSession();
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (!activeOrgId) return;
    try { setProviders(await api.modelProviders.list(activeOrgId)); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, [activeOrgId]);

  const setPrimary = async (id: string) => {
    if (!activeOrgId) return;
    try {
      const updated = await api.modelProviders.setPrimary(activeOrgId, id);
      toast.success(`Primary provider set to ${updated.provider} via ${updated.via}.`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't change provider.");
    }
  };

  return (
    <Stack gap="6">
      <Stack gap="1">
        <h1 className="text-2xl font-semibold">Model providers</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Route every LLM call through your preferred provider — direct API or via AWS Bedrock / Azure OpenAI / Vertex for residency. Athena's LiteLLM client picks the model per phase from this list.
        </p>
      </Stack>

      {error && <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]"><p className="text-sm text-[var(--danger)]">{error}</p></Card>}

      {loading ? (
        <Cluster gap="2" align="center"><Loader2 className="size-4 animate-spin text-[var(--text-muted)]" /><span className="text-sm text-[var(--text-muted)]">Loading…</span></Cluster>
      ) : (
        <Grid cols="auto-fit-360" gap="3">
          {providers.map((p) => (
            <Card key={p.id} className={cn(p.status === "primary" && "border-[var(--primary)] ring-1 ring-[var(--primary)]")}>
              <Stack gap="3">
                <Cluster justify="between" align="start">
                  <Cluster gap="2" align="center">
                    <Cpu className="size-5 text-[var(--text-muted)]" />
                    <Stack gap="0">
                      <span className="text-base font-semibold">{p.provider}</span>
                      <span className="text-xs text-[var(--text-muted)]">via {p.via} · {p.region}</span>
                    </Stack>
                  </Cluster>
                  {p.status === "primary" && <span className="rounded-full bg-[var(--primary)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--primary-fg)]"><Star className="mr-1 inline size-3" />Primary</span>}
                  {p.status === "enabled" && <span className="rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--success)]"><CheckCircle2 className="mr-1 inline size-3" />Enabled</span>}
                </Cluster>
                <p className="text-xs text-[var(--text-muted)]">{p.residency_note}</p>
                <Cluster gap="2">
                  {p.enabled_models.map((m) => (
                    <span key={m} className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-mono">{m}</span>
                  ))}
                </Cluster>
                <Cluster justify="between" align="center" className="text-xs">
                  <span className="text-[var(--text-muted)]">{p.request_count.toLocaleString()} requests MTD</span>
                  <span className="text-[var(--text-muted)]">${p.cost_mtd}</span>
                </Cluster>
                {p.status !== "primary" && (
                  <Button variant="outline" size="sm" onClick={() => setPrimary(p.id)}>Set primary</Button>
                )}
              </Stack>
            </Card>
          ))}
        </Grid>
      )}
    </Stack>
  );
}
