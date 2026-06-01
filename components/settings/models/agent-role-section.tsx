"use client";

/**
 * Per-agent → LLM-role surface on `/settings/models`.
 *
 * Each Athena phase agent (PRD Framer, Implementer, Reviewer, …) runs on
 * one of the 8 canonical roles. This card lets an org reassign any agent's
 * role; the concrete model behind each role is configured on the
 * Role-routing card above. The design reuses the per-role routing rather
 * than a direct agent→model map.
 *
 * One dropdown per agent, saved on change — there's a single field per row
 * so there's no draft to lose. "Reset" clears the override (revert to the
 * code default).
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";
import {
  api,
  ApiError,
  MODEL_ROLE_ALIASES,
  type AgentRoleBinding,
  type ModelRoleAlias,
} from "@/lib/api/client";


/** Friendly labels for the known agents; an unknown name prettifies
 *  generically so a newly-registered agent still renders without a FE
 *  change (the BE returns the full roster). */
const AGENT_LABELS: Record<string, string> = {
  prd_framer: "PRD · Framer",
  prd_researcher: "PRD · Researcher",
  prd_drafter: "PRD · Drafter",
  prd_signoff: "PRD · Sign-off",
  spec_author: "Implement · Spec Author",
  plan_author: "Implement · Plan Author",
  implementer: "Implement · Implementer",
  reviewer: "Implement · Reviewer",
  ci_coordinator: "Implement · CI Coordinator",
  pr_author: "Implement · PR Author",
  autofixer: "Implement · Autofixer",
  quickfix: "Quick-fix",
  chat: "Chat",
  ingestor: "Ingestor",
};


/** Optional one-line "what this agent controls" blurb, shown under the
 *  label. Only agents with an entry get a description — the rest render
 *  the bare row, so a newly-registered agent still appears without a FE
 *  change. */
const AGENT_DESCRIPTIONS: Record<string, string> = {
  chat: "Model behind the interactive chat assistant.",
  ingestor:
    "Model used to build knowledge during repo ingestion (per-file dossiers, repo understanding, blueprints, glossary).",
};


function agentLabel(name: string): string {
  return AGENT_LABELS[name] ?? name.replace(/_/g, " ");
}


function agentDescription(name: string): string | null {
  return AGENT_DESCRIPTIONS[name] ?? null;
}


export function AgentRoleSection({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false);
  const [bindings, setBindings] = useState<AgentRoleBinding[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useMemo(() => async () => {
    setLoading(true);
    setError(null);
    try {
      setBindings(await api.agentRoleBindings.list(orgId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load agent roles.");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { if (open) void refresh(); }, [open, refresh]);

  return (
    <Card>
      <Stack gap="3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <Stack gap="0">
            <span className="text-base font-semibold">Agent roles</span>
            <span className="text-xs text-[var(--text-muted)]">
              Pick the role each Athena agent runs on. The model behind each
              role is set in Role routing above.
            </span>
          </Stack>
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        {open && (
          <Stack gap="3">
            {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
            {loading && bindings.length === 0 && <AgentListSkeleton />}
            {!loading &&
              bindings.map((b) => (
                <AgentRoleRow
                  key={b.agent_name}
                  binding={b}
                  orgId={orgId}
                  onChanged={refresh}
                />
              ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}


function AgentRoleRow({
  binding, orgId, onChanged,
}: {
  binding: AgentRoleBinding;
  orgId: string;
  onChanged: () => void | Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  const change = async (role: ModelRoleAlias) => {
    if (role === binding.role) return;
    setSaving(true);
    try {
      await api.agentRoleBindings.put(orgId, binding.agent_name, role);
      toast.success(`${agentLabel(binding.agent_name)} → ${role}.`);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't update agent role.");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    try {
      await api.agentRoleBindings.delete(orgId, binding.agent_name);
      toast.success(`${agentLabel(binding.agent_name)} reverted to default.`);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't reset agent role.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Cluster
      justify="between"
      align="center"
      className="rounded-md border border-[var(--border-soft)] p-3"
    >
      <Stack gap="0">
        <span className="text-sm font-medium">{agentLabel(binding.agent_name)}</span>
        {agentDescription(binding.agent_name) && (
          <span className="text-[11px] text-[var(--text-muted)]">
            {agentDescription(binding.agent_name)}
          </span>
        )}
        <Cluster gap="1" align="center" className="text-[11px]">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 font-medium",
              binding.is_overridden
                ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                : "bg-[var(--surface-2)] text-[var(--text-muted)]",
            )}
          >
            {binding.is_overridden ? "Custom" : "Default"}
          </span>
          <span className="font-mono text-[var(--text-muted)]">
            default: {binding.default_role}
          </span>
        </Cluster>
      </Stack>
      <Cluster gap="2" align="center">
        <select
          value={binding.role}
          disabled={saving}
          onChange={(e) => void change(e.target.value as ModelRoleAlias)}
          aria-label={`Role for ${agentLabel(binding.agent_name)}`}
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
        >
          {MODEL_ROLE_ALIASES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        {binding.is_overridden && (
          <Button
            variant="ghost"
            size="sm"
            onClick={reset}
            disabled={saving}
            aria-label={`Reset ${agentLabel(binding.agent_name)} to default`}
          >
            <RotateCcw className="size-3.5" />
          </Button>
        )}
      </Cluster>
    </Cluster>
  );
}


function AgentListSkeleton() {
  return (
    <Stack gap="2" aria-busy="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-14 w-full animate-pulse rounded-md bg-[var(--surface-2)]"
        />
      ))}
    </Stack>
  );
}
