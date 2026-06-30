"use client";

/**
 * <AgentEditor/> - create / edit a custom agent (Agent Registry, AR.1).
 *
 * One inline form: identity, the user-defined system prompt, an optional pinned
 * model + effort, a tool selection (built-in catalog tools / skills / MCP
 * tools), and a sharing scope (private / domain / org). Fetches its own
 * pickable-tools catalog, enabled models, and domains. The parent owns the
 * list refetch + navigation; this component owns the network write.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ModelSelector } from "@/components/ui/model-selector";
import { Tooltip } from "@/components/ui/tooltip";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import {
  api,
  ApiError,
  type AgentDetail,
  type AgentToolCatalog,
  type AgentToolRef,
  type CreateAgentIn,
  type Domain,
  type EnabledModel,
  type ModelSelection,
} from "@/lib/api/client";
import { cn } from "@/lib/cn";

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
const EFFORTS = ["fast", "medium", "high", "max"] as const;
type Visibility = "private" | "domain" | "org";

function toolKey(t: AgentToolRef): string {
  if (t.kind === "builtin") return `builtin:${t.builtin_name}`;
  if (t.kind === "skill") return `skill:${t.skill_id}`;
  if (t.kind === "mcp") return `mcp:${t.mcp_tool_id}`;
  if (t.kind === "custom") return `custom:${t.custom_tool_id}`;
  if (t.kind === "agent") return `agent:${t.agent_ref_id}`;
  return "";
}

type BuiltinTool = AgentToolCatalog["builtin"][number];

// Display order for the built-in tool groups (the BE returns a `group` per
// tool). Knowledge first (the read ladder), then the action/system groups;
// anything unknown falls to the end.
const BUILTIN_GROUP_ORDER = [
  "Knowledge",
  "Tasks",
  "Stages",
  "Org",
  "Activity",
  "Cost",
  "Conversation",
  "Settings",
  "Web",
] as const;

function groupBuiltins(tools: BuiltinTool[]): [string, BuiltinTool[]][] {
  const byGroup = new Map<string, BuiltinTool[]>();
  for (const t of tools) {
    const g = t.group || "Other";
    const arr = byGroup.get(g);
    if (arr) arr.push(t);
    else byGroup.set(g, [t]);
  }
  const ordered: [string, BuiltinTool[]][] = [];
  for (const g of BUILTIN_GROUP_ORDER) {
    const arr = byGroup.get(g);
    if (arr) {
      ordered.push([g, arr]);
      byGroup.delete(g);
    }
  }
  for (const [g, arr] of byGroup) ordered.push([g, arr]);
  return ordered;
}

export function AgentEditor({
  initial,
  canPublish,
  onCancel,
  onSaved,
}: {
  initial: AgentDetail | null;
  canPublish: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const mode = initial ? "edit" : "create";
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [systemPrompt, setSystemPrompt] = useState(initial?.system_prompt ?? "");
  const [effort, setEffort] = useState<string>(initial?.effort ?? "");
  const [timeoutSeconds, setTimeoutSeconds] = useState<number>(initial?.timeout_seconds ?? 600);
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? "private");
  const [domainIds, setDomainIds] = useState<string[]>(initial?.attached_domains ?? []);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set((initial?.tools ?? []).map(toolKey)),
  );
  const [model, setModel] = useState<ModelSelection | null>(() =>
    initialModelSelection(initial),
  );

  const [catalog, setCatalog] = useState<AgentToolCatalog | null>(null);
  const [models, setModels] = useState<EnabledModel[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [cat, mdls, doms] = await Promise.all([
          api.agents.toolCatalog(),
          api.models.enabled(),
          api.domains.list(),
        ]);
        setCatalog(cat);
        // Agents drive a tool loop, so subscription models are never offered.
        setModels(mdls.filter((m) => m.source !== "subscription"));
        setDomains(doms);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load builder data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const slugError = useMemo<string | null>(() => {
    if (mode === "edit" || !slug) return null;
    return SLUG_PATTERN.test(slug)
      ? null
      : "Lowercase letters, digits, and hyphens (no leading/trailing hyphen).";
  }, [slug, mode]);

  const onNameChange = (v: string) => {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  };

  const toggle = (key: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleDomain = (id: string) =>
    setDomainIds((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));

  const buildTools = (): AgentToolRef[] => {
    const out: AgentToolRef[] = [];
    for (const key of selected) {
      const [kind, ref] = splitKey(key);
      if (kind === "builtin") out.push({ kind, builtin_name: ref });
      else if (kind === "skill") out.push({ kind, skill_id: ref });
      else if (kind === "mcp") out.push({ kind, mcp_tool_id: ref });
      else if (kind === "custom") out.push({ kind, custom_tool_id: ref });
      else if (kind === "agent") out.push({ kind, agent_ref_id: ref });
    }
    return out;
  };

  const validate = (): string | null => {
    if (!name.trim()) return "Name is required.";
    if (mode === "create") {
      if (!slug.trim()) return "Slug is required.";
      if (!SLUG_PATTERN.test(slug)) return "Slug format is invalid.";
    }
    if (!systemPrompt.trim()) return "A system prompt is required.";
    if (visibility === "domain" && domainIds.length === 0) {
      return "Pick at least one domain to share with, or keep the agent private.";
    }
    return null;
  };

  const sq = searchQuery.toLowerCase();
  const { builtin: BUILTIN_TOOLS = [], skills = [], custom: customTools = [], mcp: mcpTools = [], agents = [] } = catalog || {};
  const filteredBuiltin = BUILTIN_TOOLS.filter((t) => t.name.toLowerCase().includes(sq) || t.description.toLowerCase().includes(sq));
  const filteredSkills = skills.filter((s) => s.name.toLowerCase().includes(sq) || s.slug.toLowerCase().includes(sq));
  const filteredAgents = agents.filter((a) => a.id !== initial?.id && (a.name.toLowerCase().includes(sq) || a.slug.toLowerCase().includes(sq) || a.description?.toLowerCase().includes(sq)));
  const filteredMcp = mcpTools.filter((m) => m.name.toLowerCase().includes(sq) || (m.description?.toLowerCase() || "").includes(sq) || m.server.toLowerCase().includes(sq));
  const filteredCustom = customTools.filter((c) => c.name.toLowerCase().includes(sq) || ((c as Record<string, unknown>).description as string | undefined)?.toLowerCase().includes(sq) || false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate();
    if (v) return setError(v);
    setError(null);
    setSubmitting(true);
    const payload: CreateAgentIn = {
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || null,
      system_prompt: systemPrompt,
      model_provider: model?.provider ?? null,
      model_id: model?.model ?? null,
      model_source: (model?.source as CreateAgentIn["model_source"]) ?? null,
      effort: effort || null,
      timeout_seconds: timeoutSeconds,
      visibility,
      tools: buildTools(),
      domain_ids: visibility === "domain" ? domainIds : [],
    };
    try {
      if (initial) await api.agents.update(initial.id, payload);
      else await api.agents.create(payload);
      toast.success(initial ? "Agent updated" : "Agent created");
      onSaved();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to save agent.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} aria-label={mode === "create" ? "Create agent" : "Edit agent"}>
      <Stack gap="4">
        <Card>
          <Stack gap="4">
            <Field label="Name" required>
              <input
                type="text" value={name} className="input"
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="e.g. Release notes writer" data-testid="agent-name"
              />
            </Field>
            <Field label="Slug" required helper="Used in URLs. Lowercase + digits + hyphens.">
              <input
                type="text" value={slug} className="input font-mono"
                disabled={mode === "edit"} aria-invalid={!!slugError}
                onChange={(e) => { setSlug(e.target.value.toLowerCase()); setSlugTouched(true); }}
                placeholder="release-notes-writer" data-testid="agent-slug"
              />
              {slugError && <p className="mt-1 text-xs text-[var(--danger)]">{slugError}</p>}
            </Field>
            <Field label="Description" helper="One-line summary shown in the list + chat picker.">
              <input
                type="text" value={description} className="input"
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this agent is for." data-testid="agent-description"
              />
            </Field>
          </Stack>
        </Card>

        <Card>
          <Stack gap="3">
            <Heading title="System prompt" sub="The instructions that define this agent's behaviour." />
            <textarea
              value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="You are a release-notes writer. Given a set of merged PRs…"
              className="input min-h-[180px] font-mono text-xs leading-relaxed"
              data-testid="agent-system-prompt"
            />
          </Stack>
        </Card>

        <Card>
          <Stack gap="3">
            <Heading title="Model" sub="The model this agent runs on. Leave unset to use the chat default; the picker can still override it per message." />
            <Cluster gap="2" align="center">
              <ModelSelector
                models={models} value={model} onChange={setModel}
                includeSubscription={false}
              />
              {model && (
                <Button type="button" variant="ghost" onClick={() => setModel(null)}>
                  Use default
                </Button>
              )}
            </Cluster>
            <Field label="Effort" helper="How hard the agent works per turn. Default = medium.">
              <select
                value={effort} onChange={(e) => setEffort(e.target.value)}
                className="input capitalize" data-testid="agent-effort"
              >
                <option value="">Default</option>
                {EFFORTS.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="Timeout (minutes)" helper="Maximum time this agent can run before failing (default 10).">
              <input
                type="number" min="1" step="1"
                value={Math.round(timeoutSeconds / 60)}
                onChange={(e) => setTimeoutSeconds(Math.max(1, parseInt(e.target.value, 10)) * 60)}
                className="input" data-testid="agent-timeout"
              />
            </Field>
          </Stack>
        </Card>

        <Card>
          <Stack gap="3">
            <Heading title="Tools" sub="What this agent can do. It still acts as you, so it can never exceed your own access." />
            {loading ? (
              <p className="text-sm text-[var(--text-muted)]">Loading tools…</p>
            ) : (
              <Stack gap="4">
                <input
                  type="text"
                  placeholder="Search tools, skills, or agents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
                />
                {groupBuiltins(filteredBuiltin).map(([groupLabel, groupTools]) => (
                  <ToolGroup key={groupLabel} label={groupLabel}>
                    <Grid cols="auto-fit-220" gap="2">
                      {groupTools.map((t) => (
                        <ToolChip
                          key={t.name} title={t.name} subtitle={t.description}
                          on={selected.has(`builtin:${t.name}`)}
                          onToggle={() => toggle(`builtin:${t.name}`)}
                        />
                      ))}
                    </Grid>
                  </ToolGroup>
                ))}
                {filteredSkills.length > 0 && (
                  <ToolGroup label="Skills">
                    <Grid cols="auto-fit-220" gap="2">
                      {filteredSkills.map((s) => (
                        <ToolChip
                          key={s.id} title={s.name} subtitle={s.slug}
                          on={selected.has(`skill:${s.id}`)}
                          onToggle={() => toggle(`skill:${s.id}`)}
                        />
                      ))}
                    </Grid>
                  </ToolGroup>
                )}
                {filteredAgents.length > 0 && (
                  <ToolGroup label="Agents">
                    <Grid cols="auto-fit-220" gap="2">
                      {filteredAgents.map((a) => (
                        <ToolChip
                          key={a.id} title={a.name} subtitle={a.description || a.slug}
                          on={selected.has(`agent:${a.id}`)}
                          onToggle={() => toggle(`agent:${a.id}`)}
                        />
                      ))}
                    </Grid>
                  </ToolGroup>
                )}
                {filteredMcp.length > 0 && (
                  <ToolGroup label="MCP tools">
                    <Grid cols="auto-fit-220" gap="2">
                      {filteredMcp.map((m) => (
                        <ToolChip
                          key={m.id} title={m.name} subtitle={`${m.server} · ${m.description}`}
                          on={selected.has(`mcp:${m.id}`)}
                          onToggle={() => toggle(`mcp:${m.id}`)}
                        />
                      ))}
                    </Grid>
                  </ToolGroup>
                )}
                {filteredCustom.length > 0 && (
                  <ToolGroup label="Custom tools">
                    <Grid cols="auto-fit-220" gap="2">
                      {filteredCustom.map((c) => (
                        <ToolChip
                          key={c.id}
                          title={c.name}
                          subtitle={
                            c.validation_status === "valid"
                              ? c.kind
                              : `${c.kind} · not validated yet`
                          }
                          on={selected.has(`custom:${c.id}`)}
                          onToggle={() => toggle(`custom:${c.id}`)}
                        />
                      ))}
                    </Grid>
                  </ToolGroup>
                )}
              </Stack>
            )}
          </Stack>
        </Card>

        <Card>
          <Stack gap="3">
            <Heading title="Sharing" sub="Who can use this agent." />
            <Cluster gap="2">
              <ScopeOption label="Private" desc="Only you" on={visibility === "private"} onPick={() => setVisibility("private")} />
              <ScopeOption label="Domains" desc="Members of chosen domains" on={visibility === "domain"} disabled={!canPublish} onPick={() => setVisibility("domain")} />
              <ScopeOption label="Org-wide" desc="Everyone in the org" on={visibility === "org"} disabled={!canPublish} onPick={() => setVisibility("org")} />
            </Cluster>
            {!canPublish && (
              <p className="text-xs text-[var(--text-subtle)]">
                You can build private agents. Sharing needs the &quot;Share custom agents&quot; permission.
              </p>
            )}
            {visibility === "domain" && (
              <Grid cols="auto-fit-220" gap="2">
                {domains.map((d) => (
                  <ToolChip
                    key={d.id} title={d.name} subtitle={d.slug}
                    on={domainIds.includes(d.id)} onToggle={() => toggleDomain(d.id)}
                  />
                ))}
              </Grid>
            )}
          </Stack>
        </Card>

        {error && (
          <Card className="border-[var(--danger)] bg-[var(--danger-soft)]">
            <p className="text-sm text-[var(--danger-ink)]" data-testid="agent-error">{error}</p>
          </Card>
        )}

        <Cluster justify="end" gap="2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>Cancel</Button>
          <Button type="submit" disabled={submitting} data-testid="agent-submit">
            {submitting ? "Saving…" : mode === "create" ? "Create agent" : "Save changes"}
          </Button>
        </Cluster>
      </Stack>
    </form>
  );
}

function Field({
  label, required, helper, children,
}: { label: string; required?: boolean; helper?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
        {label}{required && <span className="text-[var(--danger)]"> *</span>}
      </span>
      {children}
      {helper && <span className="mt-1 block text-[10.5px] text-[var(--text-subtle)]">{helper}</span>}
    </label>
  );
}

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <Stack gap="0" className="border-b border-[var(--border)] pb-2">
      <span className="text-sm font-semibold">{title}</span>
      <span className="text-xs text-[var(--text-muted)]">{sub}</span>
    </Stack>
  );
}

function ToolGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Stack gap="2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{label}</span>
      {children}
    </Stack>
  );
}

function ToolChip({
  title, subtitle, on, onToggle,
}: { title: string; subtitle: string; on: boolean; onToggle: () => void }) {
  const content = (
    <button
      type="button" onClick={onToggle} aria-pressed={on}
      className={cn(
        "flex w-full flex-col items-start gap-0.5 rounded-md border px-2.5 py-1.5 text-left transition-colors",
        on
          ? "border-[var(--primary)] bg-[var(--primary-soft)]"
          : "border-[var(--border)] hover:bg-[var(--surface-2)]",
      )}
    >
      <span className={cn("font-mono text-xs font-medium w-full truncate", on ? "text-[var(--primary)]" : "text-[var(--text)]")}>{title}</span>
      <span className="line-clamp-1 text-[10.5px] text-[var(--text-subtle)] w-full">{subtitle}</span>
    </button>
  );

  return (
    <Tooltip content={subtitle} className="w-full">
      {content}
    </Tooltip>
  );
}

function ScopeOption({
  label, desc, on, disabled, onPick,
}: { label: string; desc: string; on: boolean; disabled?: boolean; onPick: () => void }) {
  return (
    <button
      type="button" onClick={onPick} disabled={disabled} aria-pressed={on}
      className={cn(
        "flex flex-1 flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors",
        on ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--border)] hover:bg-[var(--surface-2)]",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span className={cn("text-sm font-medium", on ? "text-[var(--primary)]" : "text-[var(--text)]")}>{label}</span>
      <span className="text-[10.5px] text-[var(--text-subtle)]">{desc}</span>
    </button>
  );
}

function initialModelSelection(initial: AgentDetail | null): ModelSelection | null {
  if (!initial?.model_provider || !initial?.model_id) return null;
  const provider = initial.model_provider;
  const model = initial.model_id;
  return initial.model_source
    ? { provider, model, source: initial.model_source as "athena" | "byok" | "subscription" }
    : { provider, model };
}

function splitKey(key: string): [AgentToolRef["kind"], string] {
  const i = key.indexOf(":");
  return [key.slice(0, i) as AgentToolRef["kind"], key.slice(i + 1)];
}

function slugify(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}
