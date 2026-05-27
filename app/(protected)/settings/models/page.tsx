"use client";

/**
 * /settings/models — bring-your-own model providers + regional routing.
 *
 * Lets an org point Athena at Anthropic-direct, AWS Bedrock, Azure OpenAI,
 * OpenAI-direct, or Vertex AI for residency / commit-utilization reasons.
 *
 * §7.8 — per-provider BYO API key surface. Plaintext is sent on
 * `PATCH /model-providers/{id}` and AEAD-encrypted server-side; the wire
 * shape returned NEVER contains the plaintext, only
 * `{has_api_key, api_key_last4}`. Stored keys render as `•••• ABCD` with
 * a "Revoke" CTA that hits `DELETE .../api-key`.
 */

import { useCallback, useEffect, useState } from "react";
import { Cpu, Star, CheckCircle2, KeyRound } from "lucide-react";
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

  const refresh = useCallback(async () => {
    if (!activeOrgId) return;
    try { setProviders(await api.modelProviders.list(activeOrgId)); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [activeOrgId]);

  useEffect(() => { void refresh(); }, [refresh]);

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
          Route every LLM call through your preferred provider — direct API or via AWS Bedrock / Azure OpenAI / Vertex for residency. Athena&apos;s LiteLLM client picks the model per phase from this list.
        </p>
      </Stack>

      {error && <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]"><p className="text-sm text-[var(--danger)]">{error}</p></Card>}

      {loading ? (
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
                <ApiKeyRow provider={p} onChange={refresh} />
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

/**
 * Per-provider API key row.
 *
 * Two render modes:
 *   - has_api_key === true  → bullets + last4 chip + "Revoke" CTA
 *   - has_api_key !== true  → collapsed "Add API key" CTA that
 *                              expands into a password input + Save
 *
 * Plaintext is sent only on submit; the input is cleared as soon as
 * the PATCH resolves. The component never logs the value.
 */
function ApiKeyRow({
  provider,
  onChange,
}: {
  provider: ModelProvider;
  onChange: () => void | Promise<void>;
}) {
  const { activeOrgId } = useSession();
  const [expanded, setExpanded] = useState(false);
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const save = async () => {
    if (!activeOrgId || value.length < 8) {
      toast.error("API key must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      await api.modelProviders.patch(activeOrgId, provider.id, { api_key: value });
      toast.success(`API key saved for ${provider.provider}.`);
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
    if (!activeOrgId) return;
    if (!confirm(`Revoke the API key for ${provider.provider}? Future calls will use Athena's shared pool until you save a new key.`)) return;
    setRevoking(true);
    try {
      await api.modelProviders.revokeApiKey(activeOrgId, provider.id);
      toast.success(`API key revoked for ${provider.provider}.`);
      await onChange();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't revoke the key.");
    } finally {
      setRevoking(false);
    }
  };

  if (provider.has_api_key) {
    return (
      <Cluster justify="between" align="center" className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-2)] px-3 py-2 text-xs">
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
        placeholder={provider.provider === "Anthropic" ? "sk-ant-…" : provider.provider === "OpenAI" ? "sk-…" : "Paste your key"}
        autoComplete="off"
        spellCheck={false}
        className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
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
          onClick={() => {
            setExpanded(false);
            setValue("");
          }}
          disabled={submitting}
        >
          Cancel
        </Button>
      </Cluster>
    </Stack>
  );
}
