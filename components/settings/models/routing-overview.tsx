"use client";

/**
 * §7.8.1 — unified model-routing surface on `/settings/models`.
 *
 * Replaces the two disconnected cards ("Role routing" + "Agent roles") with
 * one role-centric view that makes the Agent ▸ Role ▸ Model chain visible:
 *
 *   - Each of the 7 configurable roles renders as a card showing its
 *     friendly name, the model it routes to (primary + fallback chain),
 *     its key-source ("Your key" vs "Athena"), AND the agents it powers —
 *     so "which model does the Reviewer use" is answerable without
 *     cross-referencing a second card.
 *   - Editing is a single **bulk mode**: "Edit routing" turns every role row
 *     into a model picker, changes accumulate as a draft, and one **Save**
 *     commits every changed role at once (a sticky action bar tracks the
 *     count). The calm read-only view (chips + Powers) is preserved when not
 *     editing.
 *   - The inverse axis — reassigning a single agent to a different role —
 *     lives in a collapsed "Advanced" section (per-agent, auto-saved).
 *
 * The `embeddings` role is intentionally absent: that model is fixed
 * (`gemini-embedding-001`), free, and platform-managed.
 *
 * Pickers list only chat/vision `(provider, model)` pairs reachable through
 * a saved key OR the shared-pool default — typos can't slip through.
 */

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown, ArrowUp, Brain, ChevronDown, ChevronRight, Code2, Compass, Gauge,
  Pencil, RotateCcw, ScrollText, Trash2, Wrench, Zap,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";
import { ModelChip } from "@/components/settings/models/model-chip";
import {
  api,
  ApiError,
  MODEL_ROLE_ALIASES,
  type AgentRoleBinding,
  type CatalogModel,
  type CatalogProvider,
  type ModelProvider,
  type ModelRoleAlias,
  type RoleBinding,
  type RoleChainEntry,
  type RoleDefault,
} from "@/lib/api/client";


type ConfigurableRole = Exclude<ModelRoleAlias, "embeddings">;

/** Human-facing identity for each LLM role — the slug stays as a secondary
 *  mono label for power users + parity with the backend. */
const ROLE_META: Record<ConfigurableRole, { name: string; blurb: string; icon: LucideIcon }> = {
  planner:             { name: "Planning",       blurb: "Framing, planning & sign-off.",   icon: Compass },
  "heavy-reasoner":    { name: "Deep reasoning", blurb: "The hardest review & analysis.",  icon: Brain },
  "chat-fast":         { name: "Fast chat",      blurb: "Quick interactive replies.",      icon: Zap },
  "long-context":      { name: "Long context",   blurb: "Reading large docs & repos.",     icon: ScrollText },
  "workhorse-cheap":   { name: "Everyday",       blurb: "High-volume, low-cost steps.",    icon: Gauge },
  "code-editor":       { name: "Code editing",   blurb: "Writing & editing code.",         icon: Code2 },
  "code-editor-cheap": { name: "Quick fixes",    blurb: "Cheap code edits & autofix.",     icon: Wrench },
};

const CONFIGURABLE_ROLES = MODEL_ROLE_ALIASES.filter(
  (r): r is ConfigurableRole => r !== "embeddings",
);


/** Friendly agent labels (track-prefixed). Unknown names prettify generically
 *  so a newly-registered agent still renders without a FE change. */
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

function agentLabel(name: string): string {
  return AGENT_LABELS[name] ?? name.replace(/_/g, " ");
}

/** Short label without the track prefix — for the dense "Powers" chips. */
function agentShortLabel(name: string): string {
  const full = agentLabel(name);
  return full.includes("·") ? full.split("·").slice(1).join("·").trim() : full;
}


/** Per-role working copy while in bulk-edit mode. */
interface RoleDraft {
  primary: string; // candidateKey, or "" when unset
  chain: RoleChainEntry[];
}


export function RoutingOverview({
  orgId, providers, catalog,
}: {
  orgId: string;
  providers: ModelProvider[];
  catalog: CatalogProvider[];
}) {
  const [agents, setAgents] = useState<AgentRoleBinding[]>([]);
  const [bindings, setBindings] = useState<RoleBinding[]>([]);
  const [defaults, setDefaults] = useState<RoleDefault[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Bulk-edit mode + per-role draft. `null` drafts → view mode.
  const [drafts, setDrafts] = useState<Record<string, RoleDraft> | null>(null);
  const [saving, setSaving] = useState(false);
  const editMode = drafts !== null;

  const refresh = useMemo(
    () => async () => {
      setError(null);
      try {
        const [a, b, d] = await Promise.all([
          api.agentRoleBindings.list(orgId),
          api.modelRoleBindings.list(orgId),
          api.llmProviders.roleDefaults(),
        ]);
        setAgents(a);
        setBindings(b);
        setDefaults(d);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Couldn't load routing.");
      } finally {
        setLoading(false);
      }
    },
    [orgId],
  );

  useEffect(() => { void refresh(); }, [refresh]);

  const keyedProviders = useMemo(
    () => new Set(providers.filter((p) => p.has_api_key).map((p) => p.provider)),
    [providers],
  );
  const candidates = useMemo(
    () => buildCandidates(providers, catalog, defaults, keyedProviders),
    [providers, catalog, defaults, keyedProviders],
  );
  const bindingByRole = useMemo(
    () => new Map(bindings.map((b) => [b.role, b])),
    [bindings],
  );
  const defaultByRole = useMemo(
    () => new Map(defaults.map((d) => [d.role, d])),
    [defaults],
  );
  const agentsByRole = useMemo(() => {
    const m = new Map<ModelRoleAlias, AgentRoleBinding[]>();
    for (const a of agents) {
      const list = m.get(a.role) ?? [];
      list.push(a);
      m.set(a.role, list);
    }
    return m;
  }, [agents]);

  const enterEdit = () => {
    const next: Record<string, RoleDraft> = {};
    for (const role of CONFIGURABLE_ROLES) {
      const b = bindingByRole.get(role) ?? null;
      const d = defaultByRole.get(role) ?? null;
      if (b) {
        next[role] = {
          primary: candidateKey(b.primary_provider, b.primary_model),
          chain: b.fallback_chain,
        };
      } else {
        next[role] = { primary: defaultCandidateKey(d, candidates), chain: [] };
      }
    }
    setDrafts(next);
    setAdvancedOpen(false);
  };

  const cancelEdit = () => setDrafts(null);

  const setDraft = (role: string, patch: Partial<RoleDraft>) => {
    setDrafts((prev) => (prev ? { ...prev, [role]: { ...prev[role]!, ...patch } } : prev));
  };

  // What will actually be written per role, given the draft vs stored state.
  const actionByRole = useMemo(() => {
    const m = new Map<ConfigurableRole, RoleSaveAction>();
    if (!drafts) return m;
    for (const role of CONFIGURABLE_ROLES) {
      m.set(role, computeAction(drafts[role] ?? { primary: "", chain: [] }, bindingByRole.get(role) ?? null, defaultByRole.get(role) ?? null));
    }
    return m;
  }, [drafts, bindingByRole, defaultByRole]);

  const changedRoles = useMemo(
    () => CONFIGURABLE_ROLES.filter((r) => (actionByRole.get(r)?.type ?? "none") !== "none"),
    [actionByRole],
  );

  const saveAll = async () => {
    if (changedRoles.length === 0) return;
    setSaving(true);
    const results = await Promise.allSettled(
      changedRoles.map((role) => {
        const action = actionByRole.get(role)!;
        if (action.type === "put") {
          return api.modelRoleBindings.put(orgId, role, {
            primary_provider: action.primary.provider,
            primary_model: action.primary.model,
            fallback_chain: action.chain,
          });
        }
        return api.modelRoleBindings.delete(orgId, role);
      }),
    );
    setSaving(false);
    const failed = results.filter((r) => r.status === "rejected").length;
    const ok = changedRoles.length - failed;
    if (ok > 0) toast.success(`Saved ${ok} routing change${ok === 1 ? "" : "s"}.`);
    if (failed > 0) toast.error(`${failed} change${failed === 1 ? "" : "s"} couldn't be saved.`);
    await refresh();
    if (failed === 0) setDrafts(null);
  };

  return (
    <Card variant="elevated">
      <Stack gap="4">
        <Cluster justify="between" align="start" className="flex-wrap gap-2">
          <Stack gap="0">
            <span className="text-base font-semibold">How Athena uses AI</span>
            <span className="text-xs text-[var(--text-muted)]">
              {editMode
                ? "Pick the model behind each kind of work, then save."
                : "The model behind each kind of work, and the agents it powers."}
            </span>
          </Stack>
          <Cluster gap="2" align="center">
            <FlowLegend />
            {!editMode && (
              <Button
                variant="outline"
                size="sm"
                onClick={enterEdit}
                disabled={loading}
              >
                <Pencil className="mr-1 size-3.5" />
                Edit routing
              </Button>
            )}
          </Cluster>
        </Cluster>

        {error && <p className="text-xs text-[var(--danger)]">{error}</p>}

        {loading ? (
          <RoutingSkeleton />
        ) : (
          <>
            <Stack gap="2">
              {CONFIGURABLE_ROLES.map((role) =>
                editMode ? (
                  <RoleEditRow
                    key={role}
                    role={role}
                    draft={drafts[role] ?? { primary: "", chain: [] }}
                    defaultModel={defaultByRole.get(role) ?? null}
                    poweredAgents={agentsByRole.get(role) ?? []}
                    candidates={candidates}
                    keyedProviders={keyedProviders}
                    changed={(actionByRole.get(role)?.type ?? "none") !== "none"}
                    onPrimary={(v) => setDraft(role, { primary: v })}
                    onChain={(c) => setDraft(role, { chain: c })}
                    onReset={() =>
                      setDraft(role, {
                        primary: defaultCandidateKey(defaultByRole.get(role) ?? null, candidates),
                        chain: [],
                      })
                    }
                  />
                ) : (
                  <RoleCardView
                    key={role}
                    role={role}
                    binding={bindingByRole.get(role) ?? null}
                    defaultModel={defaultByRole.get(role) ?? null}
                    poweredAgents={agentsByRole.get(role) ?? []}
                    catalog={catalog}
                    keyedProviders={keyedProviders}
                  />
                ),
              )}
            </Stack>

            {editMode ? (
              <SaveBar
                changedCount={changedRoles.length}
                saving={saving}
                onCancel={cancelEdit}
                onSave={saveAll}
              />
            ) : (
              <AdvancedAgentOverrides
                open={advancedOpen}
                onToggle={() => setAdvancedOpen((v) => !v)}
                agents={agents}
                bindingByRole={bindingByRole}
                defaultByRole={defaultByRole}
                catalog={catalog}
                orgId={orgId}
                onChanged={refresh}
              />
            )}
          </>
        )}
      </Stack>
    </Card>
  );
}


function FlowLegend() {
  return (
    <Cluster
      gap="1"
      align="center"
      className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-[11px] text-[var(--text-muted)]"
      aria-hidden
    >
      <span className="font-medium text-[var(--text)]">Agent</span>
      <ChevronRight className="size-3" />
      <span className="font-medium text-[var(--text)]">Role</span>
      <ChevronRight className="size-3" />
      <span className="font-medium text-[var(--text)]">Model</span>
    </Cluster>
  );
}


function SaveBar({
  changedCount, saving, onCancel, onSave,
}: {
  changedCount: number;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void | Promise<void>;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Routing changes"
      className="glass sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-lg border border-[var(--border-strong)] px-3 py-2 shadow-[var(--shadow-2)]"
    >
      <span className="text-xs text-[var(--text-muted)]">
        {changedCount === 0
          ? "No changes yet"
          : `${changedCount} role${changedCount === 1 ? "" : "s"} changed`}
      </span>
      <Cluster gap="2" align="center">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={onSave}
          disabled={saving || changedCount === 0}
        >
          {saving
            ? "Saving…"
            : changedCount === 0
              ? "Save changes"
              : `Save ${changedCount} change${changedCount === 1 ? "" : "s"}`}
        </Button>
      </Cluster>
    </div>
  );
}


// ------------------------------------------------------------- RoleCardView

function RoleCardView({
  role, binding, defaultModel, poweredAgents, catalog, keyedProviders,
}: {
  role: ConfigurableRole;
  binding: RoleBinding | null;
  defaultModel: RoleDefault | null;
  poweredAgents: AgentRoleBinding[];
  catalog: CatalogProvider[];
  keyedProviders: Set<string>;
}) {
  const meta = ROLE_META[role];
  const Icon = meta.icon;

  const chain: RoleChainEntry[] = binding
    ? [{ provider: binding.primary_provider, model: binding.primary_model }, ...binding.fallback_chain]
    : defaultModel
      ? [{ provider: defaultModel.provider, model: defaultModel.model }]
      : [];
  const keyed = chain[0] ? keyedProviders.has(chain[0].provider) : false;
  const isCustom = binding ? !isPlatformDefault(binding, defaultModel) : false;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 transition-colors hover:border-[var(--border-strong)]">
      <Stack gap="2.5">
        <Cluster justify="between" align="start" className="gap-2">
          <Cluster gap="2" align="center" className="min-w-0">
            <RoleIcon Icon={Icon} />
            <Stack gap="0" className="min-w-0">
              <Cluster gap="1.5" align="baseline">
                <span className="text-sm font-semibold">{meta.name}</span>
                <span className="font-mono text-[10px] text-[var(--text-subtle)]">{role}</span>
              </Cluster>
              <ModelChainDisplay chain={chain} catalog={catalog} />
            </Stack>
          </Cluster>
          <SourceBadge keyed={keyed} custom={isCustom} />
        </Cluster>
        <PowersRow agents={poweredAgents} />
      </Stack>
    </div>
  );
}


// -------------------------------------------------------------- RoleEditRow

function RoleEditRow({
  role, draft, defaultModel, poweredAgents, candidates, keyedProviders,
  changed, onPrimary, onChain, onReset,
}: {
  role: ConfigurableRole;
  draft: RoleDraft;
  defaultModel: RoleDefault | null;
  poweredAgents: AgentRoleBinding[];
  candidates: Candidate[];
  keyedProviders: Set<string>;
  changed: boolean;
  onPrimary: (v: string) => void;
  onChain: (c: RoleChainEntry[]) => void;
  onReset: () => void;
}) {
  const meta = ROLE_META[role];
  const Icon = meta.icon;
  const [showFallbacks, setShowFallbacks] = useState(draft.chain.length > 0);

  const parsed = parseCandidateKey(draft.primary);
  const keyed = parsed ? keyedProviders.has(parsed.provider) : false;
  const atDefault =
    !!defaultModel &&
    !!parsed &&
    parsed.provider.toLowerCase() === defaultModel.provider.toLowerCase() &&
    parsed.model === defaultModel.model &&
    draft.chain.length === 0;

  return (
    <div
      className={cn(
        "rounded-lg border bg-[var(--surface-2)] p-3 transition-colors",
        changed ? "border-[var(--primary)]" : "border-[var(--border)]",
      )}
    >
      <Stack gap="2.5">
        <Cluster justify="between" align="center" className="gap-2">
          <Cluster gap="2" align="center" className="min-w-0">
            <RoleIcon Icon={Icon} />
            <Stack gap="0" className="min-w-0">
              <Cluster gap="1.5" align="baseline">
                <span className="text-sm font-semibold">{meta.name}</span>
                <span className="font-mono text-[10px] text-[var(--text-subtle)]">{role}</span>
                {changed && (
                  <span className="rounded-full bg-[var(--primary-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--primary)]">
                    Changed
                  </span>
                )}
              </Cluster>
              {poweredAgents.length > 0 && (
                <span className="truncate text-[11px] text-[var(--text-subtle)]">
                  Powers {poweredAgents.map((a) => agentShortLabel(a.agent_name)).join(" · ")}
                </span>
              )}
            </Stack>
          </Cluster>
          <Cluster gap="1.5" align="center" className="shrink-0">
            {parsed && <SourceBadge keyed={keyed} custom={false} />}
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              disabled={atDefault}
              aria-label={`Reset ${meta.name} to platform default`}
              title="Reset to platform default"
            >
              <RotateCcw className="size-3.5" />
            </Button>
          </Cluster>
        </Cluster>

        <Cluster gap="2" align="center">
          <CandidateSelect value={draft.primary} candidates={candidates} onChange={onPrimary} />
          <button
            type="button"
            onClick={() => setShowFallbacks((v) => !v)}
            className="flex shrink-0 items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
            aria-expanded={showFallbacks}
          >
            {showFallbacks ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            Fallbacks{draft.chain.length > 0 ? ` (${draft.chain.length})` : ""}
          </button>
        </Cluster>

        {showFallbacks && (
          <FallbackChainEditor
            chain={draft.chain}
            candidates={candidates}
            primary={draft.primary}
            onChange={onChain}
          />
        )}
      </Stack>
    </div>
  );
}


function RoleIcon({ Icon }: { Icon: LucideIcon }) {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--primary-soft)] text-[var(--primary)]">
      <Icon className="size-4" aria-hidden />
    </span>
  );
}


function PowersRow({ agents }: { agents: AgentRoleBinding[] }) {
  if (agents.length === 0) {
    return (
      <span className="text-[11px] text-[var(--text-subtle)]">
        Not used by any agent yet.
      </span>
    );
  }
  const shown = agents.slice(0, 4);
  const extra = agents.length - shown.length;
  return (
    <Cluster gap="1.5" align="center" className="flex-wrap">
      <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-subtle)]">
        Powers
      </span>
      {shown.map((a) => (
        <span
          key={a.agent_name}
          className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]"
        >
          {agentShortLabel(a.agent_name)}
        </span>
      ))}
      {extra > 0 && (
        <span className="text-[11px] text-[var(--text-subtle)]">+{extra} more</span>
      )}
    </Cluster>
  );
}


function ModelChainDisplay({
  chain, catalog,
}: {
  chain: RoleChainEntry[];
  catalog: CatalogProvider[];
}) {
  if (chain.length === 0) {
    return <span className="text-xs text-[var(--text-muted)]">No model configured.</span>;
  }
  return (
    <Cluster gap="1" align="center" className="flex-wrap">
      {chain.map((entry, i) => {
        const cm = findCatalogModel(catalog, entry.provider, entry.model);
        return (
          <Cluster key={candidateKey(entry.provider, entry.model)} gap="1" align="center">
            {i > 0 && <ChevronRight className="size-3 text-[var(--text-subtle)]" aria-label="falls back to" />}
            {cm ? (
              <ModelChip model={cm} />
            ) : (
              <span
                className="rounded-full bg-[var(--surface)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-muted)]"
                title={`${entry.provider} · ${entry.model}`}
              >
                {entry.model}
              </span>
            )}
          </Cluster>
        );
      })}
    </Cluster>
  );
}


function SourceBadge({ keyed, custom }: { keyed: boolean; custom: boolean }) {
  return (
    <Cluster gap="1" align="center" className="shrink-0">
      {custom && (
        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-[var(--primary-soft)] text-[var(--primary)]">
          Custom
        </span>
      )}
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
          keyed
            ? "bg-[var(--info-soft)] text-[var(--info-ink)]"
            : "bg-[var(--surface)] text-[var(--text-muted)]",
        )}
        title={
          keyed
            ? "Routes through your saved provider key (billed to you)"
            : "Routes through Athena's shared pool (uses Athena credit)"
        }
      >
        {keyed ? "Your key" : "Athena"}
      </span>
    </Cluster>
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

  const remove = (index: number) => onChange(chain.filter((_, i) => i !== index));

  return (
    <Stack gap="1.5" className="rounded-md border border-dashed border-[var(--border)] p-2">
      <Cluster gap="1" align="baseline">
        <label className="text-[11px] font-medium text-[var(--text-muted)]">Fallbacks</label>
        <span className="text-[11px] text-[var(--text-subtle)]">used in order on rate-limit / 5xx</span>
      </Cluster>
      <Stack gap="1">
        {chain.map((entry, i) => (
          <Cluster
            key={candidateKey(entry.provider, entry.model)}
            justify="between"
            align="center"
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs"
          >
            <Cluster gap="1.5" align="center">
              <span className="flex size-4 items-center justify-center rounded-full bg-[var(--surface-2)] text-[10px] text-[var(--text-muted)]">
                {i + 1}
              </span>
              <span className="font-mono text-[11px]">{entry.provider} · {entry.model}</span>
            </Cluster>
            <Cluster gap="0.5">
              <Button variant="ghost" size="sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                <ArrowUp className="size-3.5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => move(i, 1)} disabled={i === chain.length - 1} aria-label="Move down">
                <ArrowDown className="size-3.5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => remove(i)} aria-label="Remove fallback">
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
          placeholder="Add a fallback…"
        />
        <Button variant="outline" size="sm" onClick={append} disabled={!pendingPick || pendingPick === primary}>
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
      className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
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


// --------------------------------------------------- AdvancedAgentOverrides

function AdvancedAgentOverrides({
  open, onToggle, agents, bindingByRole, defaultByRole, catalog, orgId, onChanged,
}: {
  open: boolean;
  onToggle: () => void;
  agents: AgentRoleBinding[];
  bindingByRole: Map<ModelRoleAlias, RoleBinding>;
  defaultByRole: Map<ModelRoleAlias, RoleDefault>;
  catalog: CatalogProvider[];
  orgId: string;
  onChanged: () => void | Promise<void>;
}) {
  const overrideCount = agents.filter((a) => a.is_overridden).length;
  return (
    <Stack gap="2" className="border-t border-[var(--border)] pt-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between text-left"
        aria-expanded={open}
      >
        <Stack gap="0">
          <Cluster gap="2" align="center">
            <span className="text-sm font-medium">Advanced — assign agents to a role</span>
            {overrideCount > 0 && (
              <span className="rounded-full bg-[var(--primary-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--primary)]">
                {overrideCount} custom
              </span>
            )}
          </Cluster>
          <span className="text-xs text-[var(--text-muted)]">
            Defaults fit most teams. Change the role a single agent runs on.
          </span>
        </Stack>
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
      </button>
      {open && (
        <Stack gap="1.5">
          {agents.map((a) => (
            <AgentOverrideRow
              key={a.agent_name}
              binding={a}
              bindingByRole={bindingByRole}
              defaultByRole={defaultByRole}
              catalog={catalog}
              orgId={orgId}
              onChanged={onChanged}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}


function AgentOverrideRow({
  binding, bindingByRole, defaultByRole, catalog, orgId, onChanged,
}: {
  binding: AgentRoleBinding;
  bindingByRole: Map<ModelRoleAlias, RoleBinding>;
  defaultByRole: Map<ModelRoleAlias, RoleDefault>;
  catalog: CatalogProvider[];
  orgId: string;
  onChanged: () => void | Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  const change = async (role: ModelRoleAlias) => {
    if (role === binding.role) return;
    setSaving(true);
    try {
      await api.agentRoleBindings.put(orgId, binding.agent_name, role);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't update agent.");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    try {
      await api.agentRoleBindings.delete(orgId, binding.agent_name);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't reset agent.");
    } finally {
      setSaving(false);
    }
  };

  const resolved = resolveRoleModel(binding.role, bindingByRole, defaultByRole);
  const resolvedLabel = resolved ? modelDisplayName(catalog, resolved.provider, resolved.model) : null;

  return (
    <Cluster
      justify="between"
      align="center"
      className="gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
    >
      <Stack gap="0" className="min-w-0">
        <span className="truncate text-sm font-medium">{agentLabel(binding.agent_name)}</span>
        {resolvedLabel && (
          <span className="truncate text-[11px] text-[var(--text-subtle)]">→ {resolvedLabel}</span>
        )}
      </Stack>
      <Cluster gap="1.5" align="center" className="shrink-0">
        <select
          value={binding.role}
          disabled={saving}
          onChange={(e) => void change(e.target.value as ModelRoleAlias)}
          aria-label={`Role for ${agentLabel(binding.agent_name)}`}
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          {CONFIGURABLE_ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_META[r].name}</option>
          ))}
        </select>
        {binding.is_overridden ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={reset}
            disabled={saving}
            aria-label={`Reset ${agentLabel(binding.agent_name)} to default`}
          >
            <RotateCcw className="size-3.5" />
          </Button>
        ) : (
          <span className="w-8 text-center text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">def</span>
        )}
      </Cluster>
    </Cluster>
  );
}


function RoutingSkeleton() {
  return (
    <Stack gap="2" aria-busy="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-[72px] w-full animate-pulse rounded-lg bg-[var(--surface-2)]" />
      ))}
    </Stack>
  );
}


// ------------------------------------------------------------------ helpers

interface Candidate {
  provider: string;
  providerDisplay: string;
  model: string;
  modelDisplay: string;
  keySource: "byo" | "platform";
}

type RoleSaveAction =
  | { type: "none" }
  | { type: "delete" }
  | { type: "put"; primary: RoleChainEntry; chain: RoleChainEntry[] };

/** Decide what to write for a role given its draft vs the stored state.
 *  A draft equal to the platform default collapses to "no override" — i.e.
 *  delete an existing binding rather than persisting a redundant row. */
function computeAction(
  draft: RoleDraft,
  binding: RoleBinding | null,
  def: RoleDefault | null,
): RoleSaveAction {
  const parsed = parseCandidateKey(draft.primary);
  const chainKey = (c: RoleChainEntry[]) => c.map((e) => candidateKey(e.provider, e.model)).join(",");

  // Desired end-state: null means "use the platform default" (no binding).
  let desired: { primary: RoleChainEntry; chain: RoleChainEntry[] } | null = null;
  if (parsed) {
    const equalsDefault =
      !!def &&
      parsed.provider.toLowerCase() === def.provider.toLowerCase() &&
      parsed.model === def.model &&
      draft.chain.length === 0;
    if (!equalsDefault) desired = { primary: parsed, chain: draft.chain };
  }

  if (!desired) return binding ? { type: "delete" } : { type: "none" };
  if (!binding) return { type: "put", primary: desired.primary, chain: desired.chain };

  const same =
    candidateKey(binding.primary_provider, binding.primary_model) ===
      candidateKey(desired.primary.provider, desired.primary.model) &&
    chainKey(binding.fallback_chain) === chainKey(desired.chain);
  return same ? { type: "none" } : { type: "put", primary: desired.primary, chain: desired.chain };
}

function buildCandidates(
  providers: ModelProvider[],
  catalog: CatalogProvider[],
  defaults: RoleDefault[],
  keyedProviders: Set<string>,
): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const add = (provider: string, providerDisplay: string, model: string, modelDisplay: string) => {
    const k = candidateKey(provider, model);
    if (seen.has(k)) return;
    seen.add(k);
    out.push({
      provider, providerDisplay, model, modelDisplay,
      keySource: keyedProviders.has(provider) ? "byo" : "platform",
    });
  };

  const isChat = (modelType: string) => modelType !== "embedding";

  // 1. Models on a saved provider key (BYO).
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

  // 2. The shared-pool (platform-default) provider's full catalog.
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

/** The candidate key for a role's platform default, normalised to the casing
 *  the candidate list uses (so the picker shows it as the selected option). */
function defaultCandidateKey(def: RoleDefault | null, candidates: Candidate[]): string {
  if (!def) return "";
  const c = candidates.find(
    (c) => c.provider.toLowerCase() === def.provider.toLowerCase() && c.model === def.model,
  );
  return c ? candidateKey(c.provider, c.model) : "";
}

function resolveRoleModel(
  role: ModelRoleAlias,
  bindingByRole: Map<ModelRoleAlias, RoleBinding>,
  defaultByRole: Map<ModelRoleAlias, RoleDefault>,
): { provider: string; model: string } | null {
  const b = bindingByRole.get(role);
  if (b) return { provider: b.primary_provider, model: b.primary_model };
  const d = defaultByRole.get(role);
  if (d) return { provider: d.provider, model: d.model };
  return null;
}

function findCatalogModel(
  catalog: CatalogProvider[],
  provider: string,
  model: string,
): CatalogModel | null {
  const entry = catalog.find((c) => c.id.toLowerCase() === provider.toLowerCase());
  return entry?.models.find((m) => m.id === model) ?? null;
}

function modelDisplayName(catalog: CatalogProvider[], provider: string, model: string): string {
  return findCatalogModel(catalog, provider, model)?.display_name ?? model;
}

function candidateKey(provider: string, model: string): string {
  return `${provider}|${model}`;
}

function isPlatformDefault(binding: RoleBinding, def: RoleDefault | null): boolean {
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
