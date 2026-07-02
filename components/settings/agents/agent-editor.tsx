"use client";

/**
 * <AgentEditor/> - create / edit a custom agent (Agent Registry, AR.1).
 *
 * Built for non-developers first: a GUIDED builder (purpose / goals / rules /
 * tone / output format / examples) compiles deterministically into the runtime
 * system prompt (`lib/agents/spec.ts`), with a raw "Custom prompt" mode as the
 * escape hatch. An AI panel at the top drafts the whole thing from a plain
 * description - same textarea + effort + model UX as the design-tokens
 * generator - autofilling every field and pre-selecting tools.
 *
 * The tool picker only offers what the CALLER may use: the backend catalog is
 * already permission-filtered, and `requires_permission` is re-checked here as
 * defense in depth. The parent owns the list refetch + navigation; this
 * component owns the network write.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Sparkles, Wand2, X } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ModelSelector } from "@/components/ui/model-selector";
import { EffortSelector } from "@/components/ui/effort-selector";
import { Tooltip } from "@/components/ui/tooltip";
import { Segmented } from "@/components/cost/segmented";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { compileAgentPrompt, emptyAgentSpec, normalizeAgentSpec } from "@/lib/agents/spec";
import { useGenerationPoll } from "@/hooks/use-generation";
import { usePermissions } from "@/lib/session/use-permissions";
import { restoreModelSelection, storeModel, usePersistedEffort } from "@/lib/prefs/run-prefs";
import {
  api,
  ApiError,
  type AgentDetail,
  type AgentSpec,
  type AgentToolCatalog,
  type AgentToolRef,
  type AiGeneration,
  type CreateAgentIn,
  type Domain,
  type EnabledModel,
  type GenerateAgentInput,
  type GenerateAgentResult,
  type ModelSelection,
} from "@/lib/api/client";
import { cn } from "@/lib/cn";

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
const EFFORTS = ["fast", "medium", "high", "max"] as const;
type Visibility = "private" | "domain" | "org";
type SpecMode = AgentSpec["mode"];

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

/** Trimmed, non-empty list items (what gets saved + compiled). */
function cleanList(items: string[]): string[] {
  return items.map((i) => i.trim()).filter(Boolean);
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
  const { can } = usePermissions();
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [systemPrompt, setSystemPrompt] = useState(initial?.system_prompt ?? "");
  // The guided builder's structured fields. A NEW agent starts guided; a
  // legacy agent (no stored spec) opens in custom mode - its prompt was
  // hand-written and must not be recompiled over.
  const [spec, setSpec] = useState<AgentSpec>(() => {
    const stored = normalizeAgentSpec(initial?.spec);
    if (stored) return stored;
    return emptyAgentSpec(initial ? "custom" : "guided");
  });
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

  // ------------------------------------------------------------- AI autofill
  const [aiDescription, setAiDescription] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiEffort, setAiEffort] = usePersistedEffort("agent");
  const [aiModel, setAiModel] = useState<ModelSelection | null>(null);
  // The reattach scope: one key per edited agent (or the new-agent slot). A
  // draft is a DURABLE server-side generation the editor polls - leaving the
  // page loses nothing, and a remount reattaches ONLY to a draft started for
  // THIS agent (never another agent's draft applied over this form).
  const draftContextKey = initial?.id ?? "new-agent";
  const applyDraft = useCallback((res: GenerateAgentResult) => {
    setName(res.name);
    if (mode === "create" && !slugTouched) setSlug(slugify(res.name));
    setDescription(res.description);
    setSpec({
      version: 1,
      mode: "guided",
      purpose: res.purpose,
      goals: res.goals,
      rules: res.rules,
      tone: res.tone,
      output_format: res.output_format,
      examples: res.examples,
    });
    // `tool_keys` are the same `kind:ref` selection keys the builder uses,
    // already filtered to the caller's permitted catalog server-side.
    setSelected(new Set(res.tool_keys));
    if (res.warnings && res.warnings.length > 0) toast.warning(res.warnings.join("\n"));
    toast.success("Drafted your agent - review the fields and tools below, then save.");
     
  }, [mode, slugTouched]);

  const onDraftSettled = useCallback((gen: AiGeneration<GenerateAgentResult>) => {
    setAiBusy(false);
    // Never apply a draft meant for a DIFFERENT agent (a stale reattach, or a
    // list race) over this form - context_key is the fence.
    if (gen.context_key && gen.context_key !== draftContextKey) return;
    if (gen.status === "failed") {
      toast.error(gen.error ?? "Couldn't generate right now.");
      return;
    }
    if (gen.status === "completed" && gen.result) applyDraft(gen.result);
  }, [applyDraft, draftContextKey]);
  const draftPoll = useGenerationPoll<GenerateAgentResult>(onDraftSettled);
  // Reattach to THIS agent's in-flight draft on remount (context_key-scoped);
  // stop following (never cancel) on unmount - the row is durable and settles
  // regardless.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await api.generations.list<GenerateAgentResult>({
          kind: "agent_draft",
          active: true,
          contextKey: draftContextKey,
          limit: 1,
        });
        const gen = rows[0];
        if (!cancelled && gen) {
          setAiBusy(true);
          draftPoll.start(gen);
        }
      } catch {
        /* best-effort */
      }
    })();
    return () => {
      cancelled = true;
      draftPoll.stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftContextKey]);

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
        const usable = mdls.filter((m) => m.source !== "subscription");
        setModels(usable);
        setAiModel(restoreModelSelection("agent", usable));
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

  const patchSpec = (p: Partial<AgentSpec>) => setSpec((s) => ({ ...s, ...p }));

  const setSpecMode = (next: SpecMode) => {
    // First switch to the raw editor seeds it with the compiled brief, so
    // "customize the generated prompt" is one click, never a blank page.
    if (next === "custom" && !systemPrompt.trim()) {
      setSystemPrompt(compileAgentPrompt(cleanedSpec()));
    }
    patchSpec({ mode: next });
  };

  const cleanedSpec = (): AgentSpec => ({
    ...spec,
    purpose: spec.purpose.trim(),
    goals: cleanList(spec.goals),
    rules: cleanList(spec.rules),
    tone: spec.tone.trim(),
    output_format: spec.output_format.trim(),
    examples: cleanList(spec.examples),
  });

  const compiledPreview = useMemo(
    () =>
      compileAgentPrompt({
        ...spec,
        goals: cleanList(spec.goals),
        rules: cleanList(spec.rules),
        examples: cleanList(spec.examples),
      }),
    [spec],
  );

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
    if (spec.mode === "guided" && !spec.purpose.trim()) {
      return "Describe what this agent does (the Purpose field).";
    }
    if (spec.mode === "custom" && !systemPrompt.trim()) {
      return "A system prompt is required.";
    }
    return null;
  };

  const hasDraftContent = () =>
    name.trim() !== "" || spec.purpose.trim() !== "" || systemPrompt.trim() !== "";

  const generateDraft = async () => {
    if (!aiDescription.trim()) return;
    if (
      hasDraftContent() &&
      !window.confirm("Replace the current fields and tool selection with the AI draft?")
    ) {
      return;
    }
    setAiBusy(true);
    try {
      const input: GenerateAgentInput = {
        description: aiDescription.trim(),
        ...(aiModel ? { model_provider: aiModel.provider, model_id: aiModel.model } : {}),
        ...(aiModel?.source && aiModel.source !== "subscription"
          ? { model_source: aiModel.source }
          : {}),
        effort: aiEffort,
        context_key: draftContextKey,
      };
      const gen = await api.agents.generate(input);
      if (gen.status === "failed") {
        setAiBusy(false);
        toast.error(gen.error ?? "Couldn't start the draft.");
        return;
      }
      draftPoll.start(gen);
    } catch (e) {
      setAiBusy(false);
      toast.error(e instanceof ApiError ? e.message : "Couldn't generate right now.");
    }
  };

  const sq = searchQuery.toLowerCase();
  const { builtin: BUILTIN_TOOLS = [], skills = [], custom: customTools = [], mcp: mcpTools = [], agents = [] } = catalog || {};
  // Defense in depth: the BE catalog is already permission-filtered, but a
  // tool the caller can't use must never render as pickable.
  const permittedBuiltin = BUILTIN_TOOLS.filter(
    (t) => !t.requires_permission || can(t.requires_permission),
  );
  const filteredBuiltin = permittedBuiltin.filter((t) => t.name.toLowerCase().includes(sq) || t.description.toLowerCase().includes(sq));
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
    const finalSpec = cleanedSpec();
    const payload: CreateAgentIn = {
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || null,
      system_prompt:
        finalSpec.mode === "guided" ? compileAgentPrompt(finalSpec) : systemPrompt,
      spec: finalSpec,
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
          <Stack gap="2" className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <Cluster gap="2" align="center">
              <Sparkles className="size-3.5 shrink-0 text-[var(--primary)]" aria-hidden />
              <span className="text-xs font-medium text-[var(--text-muted)]">
                Generate with AI
              </span>
            </Cluster>
            <textarea
              value={aiDescription}
              onChange={(e) => setAiDescription(e.target.value)}
              disabled={aiBusy}
              placeholder="Describe the agent you want - e.g. 'an agent that answers customer-billing questions from our docs, always cites its sources, and never guesses prices'"
              className="min-h-[64px] w-full resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              data-testid="agent-ai-description"
            />
            <Cluster gap="2" align="center" className="flex-wrap">
              <Button
                type="button"
                size="sm"
                loading={aiBusy}
                disabled={aiBusy || !aiDescription.trim()}
                onClick={() => void generateDraft()}
                data-testid="agent-ai-generate"
              >
                <Wand2 className="size-3.5" />
                Generate
              </Button>
              <EffortSelector value={aiEffort} onChange={setAiEffort} disabled={aiBusy} />
              {models.length > 1 && (
                <ModelSelector
                  models={models}
                  value={aiModel}
                  onChange={(m) => {
                    setAiModel(m);
                    if (m) storeModel("agent", m);
                  }}
                  includeSubscription={false}
                  disabled={aiBusy}
                />
              )}
            </Cluster>
            <span className="text-[11px] text-[var(--text-subtle)]">
              Athena fills in every field below and picks the tools the agent needs - review, tweak, then save.
            </span>
          </Stack>
        </Card>

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
            <Cluster justify="between" align="center" className="border-b border-[var(--border)] pb-2">
              <Stack gap="0">
                <span className="text-sm font-semibold">Instructions</span>
                <span className="text-xs text-[var(--text-muted)]">
                  {spec.mode === "guided"
                    ? "Fill in the fields - Athena compiles them into the agent's instructions."
                    : "Write the agent's full instructions yourself."}
                </span>
              </Stack>
              <Segmented<SpecMode>
                ariaLabel="Instructions mode"
                value={spec.mode}
                onChange={setSpecMode}
                options={[
                  { value: "guided", label: "Guided" },
                  { value: "custom", label: "Custom prompt" },
                ]}
              />
            </Cluster>

            {spec.mode === "guided" ? (
              <Stack gap="4">
                <Field
                  label="What does this agent do?"
                  required
                  helper="Who the agent is and what it's for - write it as instructions to the agent."
                >
                  <textarea
                    value={spec.purpose}
                    onChange={(e) => patchSpec({ purpose: e.target.value })}
                    placeholder="You are a release-notes writer. You turn the week's merged work into clear, friendly release notes anyone in the company can read..."
                    className="input min-h-[90px] leading-relaxed"
                    data-testid="agent-purpose"
                  />
                </Field>
                <ListEditor
                  label="Goals"
                  helper="What a good outcome looks like - one per line."
                  placeholder="e.g. Summarise every merged change in plain language"
                  addLabel="Add goal"
                  items={spec.goals}
                  onChange={(goals) => patchSpec({ goals })}
                  testId="agent-goals"
                />
                <ListEditor
                  label="Rules"
                  helper="Do's and don'ts the agent must follow - the guardrails."
                  placeholder="e.g. Never invent facts - say so when you don't know"
                  addLabel="Add rule"
                  items={spec.rules}
                  onChange={(rules) => patchSpec({ rules })}
                  testId="agent-rules"
                />
                <Field label="Tone & style" helper="The voice the agent answers in.">
                  <input
                    type="text"
                    value={spec.tone}
                    onChange={(e) => patchSpec({ tone: e.target.value })}
                    placeholder="Friendly, concise, plain language."
                    className="input"
                    data-testid="agent-tone"
                  />
                </Field>
                <Field label="Output format" helper="How answers should be structured.">
                  <textarea
                    value={spec.output_format}
                    onChange={(e) => patchSpec({ output_format: e.target.value })}
                    placeholder="Short markdown sections with bullet points; a table when comparing options."
                    className="input min-h-[60px]"
                    data-testid="agent-output-format"
                  />
                </Field>
                <ListEditor
                  label="Examples"
                  helper="Optional: show the agent an ideal behaviour or two."
                  placeholder='e.g. When asked for "last week", group notes by team'
                  addLabel="Add example"
                  items={spec.examples}
                  onChange={(examples) => patchSpec({ examples })}
                  testId="agent-examples"
                />
                <details className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
                  <summary className="cursor-pointer text-xs font-medium text-[var(--text-muted)]">
                    Preview the compiled instructions
                  </summary>
                  <pre className="mt-2 max-h-[280px] overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-[var(--text)]" data-testid="agent-compiled-preview">
                    {compiledPreview || "Fill in the fields above to see the compiled instructions."}
                  </pre>
                </details>
              </Stack>
            ) : (
              <textarea
                value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="You are a release-notes writer. Given a set of merged PRs…"
                className="input min-h-[180px] font-mono text-xs leading-relaxed"
                data-testid="agent-system-prompt"
              />
            )}
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
            <Heading title="Tools" sub="What this agent can do. You can only pick tools your own role grants - the agent acts as its user, never beyond them." />
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

/** A small add/remove list of one-line text rows (goals / rules / examples). */
function ListEditor({
  label, helper, placeholder, addLabel, items, onChange, testId,
}: {
  label: string;
  helper: string;
  placeholder: string;
  addLabel: string;
  items: string[];
  onChange: (items: string[]) => void;
  testId: string;
}) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">{label}</span>
      <Stack gap="1.5">
        {items.map((item, i) => (
          <Cluster key={i} gap="1.5" align="center">
            <input
              type="text"
              value={item}
              onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={placeholder}
              className="input flex-1"
              data-testid={`${testId}-${i}`}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}
            >
              <X className="size-3.5" />
            </Button>
          </Cluster>
        ))}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange([...items, ""])}
            disabled={items.length >= 20}
            data-testid={`${testId}-add`}
          >
            <Plus className="size-3.5" />
            {addLabel}
          </Button>
        </div>
      </Stack>
      <span className="mt-1 block text-[10.5px] text-[var(--text-subtle)]">{helper}</span>
    </div>
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
