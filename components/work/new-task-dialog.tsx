"use client";

/**
 * NewTaskDialog - create a work item on the recursive-Task spine.
 *
 * A Task is a work item first (Work OS rehaul W1): the plain `task` type is
 * the FIRST, pre-selected choice ("track any work - no AI workflow attached");
 * the 8 railed types group under an "AI workflows" divider, each with its
 * honest outcome line. Every type shares the same fields; only the stage
 * sequence differs (server-side, per type):
 *
 *   - Type     (required) - `task` or one of the 8 AI workflows.
 *   - Title    (required)
 *   - Domain   (optional) - top-level scope; "No domain" = inbox / unscoped.
 *   - Description (optional markdown problem statement).
 *   - Details  (collapsed) - assignee, priority, target date, labels, team,
 *              cycle (the picked team's open cycles), estimate.
 *   - Budget   (optional) - AI spend cap for this task's stages.
 *
 * Creating a task spends no credit (no AI runs at create - stages start
 * `locked`/`ready` and the agent only runs when you hand it a stage). "Run
 * with Athena" is hidden for the rail-less `task`. Submits to POST /v1/tasks
 * and emits the new task via onCreated, which navigates to the detail page.
 */

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  api,
  ApiError,
  type Cycle,
  type DesignSystemSummary,
  type Domain,
  type Label,
  type Member,
  type Task,
  type TaskCreateInput,
  type TaskPriority,
  type TaskType,
  type Team,
} from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Select } from "@/components/ui/select";
import { AttachmentButton, AttachmentChips, useAttachmentDrafts } from "@/components/ui/attachment-picker";
import { Cluster, Grid, Stack } from "@/components/layout/primitives";
import { MemberPicker } from "@/components/ui/member-picker";
import { LabelsControl } from "@/components/work/property-controls";
import { labelColorClass, splitLabelKey } from "@/lib/work/label-meta";
import { TASK_TYPE_META } from "@/lib/work/task-meta";
import { useSession } from "@/lib/session/SessionProvider";
import { cn } from "@/lib/cn";

/** The 8 railed types - rendered under the "AI workflows" divider. The plain
 *  `task` renders first, on its own. */
const RAILED_TYPE_ORDER: TaskType[] = [
  "feature",
  "implementation",
  "design",
  "bug",
  "incident",
  "spike",
  "chore",
  "test",
];

/** Max length for a task title (hard-capped at the input). */
const TITLE_MAX = 150;

const PRIORITY_ORDER: TaskPriority[] = ["low", "medium", "high", "urgent"];
const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

interface FormState {
  type: TaskType;
  title: string;
  // A task can span multiple domains. Three states:
  //   - domainIds non-empty       -> use exactly those.
  //   - domainIds empty + noDomain -> explicit "No domain" (inbox).
  //   - domainIds empty + !noDomain -> untouched; Athena infers on create.
  domainIds: string[];
  noDomain: boolean;
  body: string;
  // Details (collapsed) fields.
  assignee: string | null;
  priority: TaskPriority | null;
  target_date: string; // "" = no date; ISO yyyy-mm-dd from the date input
  labelIds: string[];
  teamId: string | null;
  cycleId: string | null;
  estimate: string; // raw input; parsed on submit
  budget: string; // raw input; parsed on submit
  // "Run with Athena" - delegate execution to Athena's driver at creation.
  // Off by default: you own it and run each stage yourself (AI on request).
  // Hidden (and never sent) for the rail-less `task`.
  runWithAthena: boolean;
}

const EMPTY_FORM: FormState = {
  type: "task",
  title: "",
  domainIds: [],
  noDomain: false,
  body: "",
  assignee: null,
  priority: null,
  target_date: "",
  labelIds: [],
  teamId: null,
  cycleId: null,
  estimate: "",
  budget: "",
  runWithAthena: false,
};

/** Pre-fill values folded over the empty form when the dialog opens - e.g.
 *  a chat `propose_task` CTA landing on `/work?new=1&…`. Pass a stable
 *  reference (state / memo); it's a dependency of the open-reset effect. */
export interface NewTaskDefaults {
  type?: TaskType;
  title?: string;
  body?: string;
  domain_id?: string;
}

export function NewTaskDialog({
  open,
  onOpenChange,
  onCreated,
  defaultDomainId,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (task: Task) => void;
  /** Pre-select a domain (e.g. when opened from a domain's board). */
  defaultDomainId?: string;
  defaults?: NewTaskDefaults | null;
}) {
  const { activeOrgId, me } = useSession();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // "Let Athena suggest" - in-flight flag + the ids Athena proposed (a sparkle
  // marks them in the picker so the user sees what was AI-picked).
  const [suggesting, setSuggesting] = useState(false);
  const [suggestedIds, setSuggestedIds] = useState<string[]>([]);
  // Design tasks only: the saved design systems available for the chosen domain
  // and the ones picked to ground this design (a design can mix several; empty =
  // no fixed token set).
  const [designSystems, setDesignSystems] = useState<DesignSystemSummary[]>([]);
  const [designTokenSetIds, setDesignTokenSetIds] = useState<string[]>([]);
  // The per-stage model is chosen later (at run time), so the dialog allows
  // both images and documents; the backend shows images only to vision-capable
  // stages and folds document text into every stage's brief.
  const {
    addFiles: addAttachments,
    remove: removeAttachment,
    clear: clearAttachments,
    drafts: attachmentDrafts,
    readyIds: attachmentReadyIds,
    pending: attachPending,
  } = useAttachmentDrafts({ canAttachImages: true });

  useEffect(() => {
    if (!open || !activeOrgId) return;
    clearAttachments();
    const prefillDomain = defaults?.domain_id ?? defaultDomainId ?? "";
    setForm({
      ...EMPTY_FORM,
      type: defaults?.type ?? EMPTY_FORM.type,
      // A pre-filled title (e.g. from a chat propose_task CTA) can exceed the
      // cap, which the input's maxLength wouldn't catch - clamp it here too.
      title: (defaults?.title ?? EMPTY_FORM.title).slice(0, TITLE_MAX),
      body: defaults?.body ?? EMPTY_FORM.body,
      domainIds: prefillDomain ? [prefillDomain] : [],
    });
    setSuggestedIds([]);
    setDesignTokenSetIds([]);
    setDetailsOpen(false);
    setServerError(null);
    void api.domains
      .list()
      .then(setDomains)
      .catch(() => setDomains([]));
    // The Details section's vocabularies - all soft-fail (additive).
    void api.teams
      .list()
      .then(setTeams)
      .catch(() => setTeams([]));
    void api.labels
      .list()
      .then(setLabels)
      .catch(() => setLabels([]));
    void api.members
      .list(activeOrgId)
      .then((all) => setMembers(all.filter((m) => m.deactivated_at === null)))
      .catch(() => setMembers([]));
  }, [open, activeOrgId, defaultDomainId, defaults, clearAttachments]);

  // Cycle options follow the picked team (a cycle belongs to one team).
  useEffect(() => {
    if (!open || !form.teamId) {
      setCycles([]);
      return;
    }
    let cancelled = false;
    void api.cycles
      .listForTeam(form.teamId)
      .then((c) => {
        if (!cancelled) setCycles(c);
      })
      .catch(() => {
        if (!cancelled) setCycles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, form.teamId]);

  // Design tasks: list the saved design systems for the chosen domain (or all
  // org systems when 0 or many domains are picked). Re-fetches as the domain
  // changes so the picker always reflects "tokens for the selected domain".
  useEffect(() => {
    if (!open || form.type !== "design") {
      setDesignSystems([]);
      return;
    }
    const domainId = form.domainIds.length === 1 ? form.domainIds[0] : undefined;
    let cancelled = false;
    void api.design
      .listSystems(domainId)
      .then((s) => {
        if (!cancelled) setDesignSystems(s);
      })
      .catch(() => {
        if (!cancelled) setDesignSystems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, form.type, form.domainIds]);

  // If the domain changed, drop any picked systems no longer offered.
  useEffect(() => {
    setDesignTokenSetIds((ids) => {
      const next = ids.filter((id) => designSystems.some((s) => s.id === id));
      return next.length === ids.length ? ids : next;
    });
  }, [designSystems]);

  const toggleDomain = (id: string) =>
    setForm((f) => ({
      ...f,
      noDomain: false,
      domainIds: f.domainIds.includes(id)
        ? f.domainIds.filter((d) => d !== id)
        : [...f.domainIds, id],
    }));

  const selectNoDomain = () =>
    setForm((f) => ({ ...f, domainIds: [], noDomain: true }));

  const suggestDomains = async () => {
    if (!form.title.trim()) {
      setServerError("Add a title first so Athena can suggest domains.");
      return;
    }
    setSuggesting(true);
    try {
      const trimmedBody = form.body.trim();
      const res = await api.tasks.suggestDomains({
        type: form.type,
        title: form.title.trim(),
        ...(trimmedBody ? { body: trimmedBody } : {}),
      });
      const ids = res.suggestions.map((s) => s.domain_id);
      if (ids.length === 0) {
        toast.info(
          res.available
            ? "Athena didn't find a clear domain match - pick manually."
            : "Domain suggestions aren't available right now - pick manually.",
        );
        return;
      }
      setSuggestedIds(ids);
      setForm((f) => ({ ...f, domainIds: ids, noDomain: false }));
      toast.success(
        `Athena suggested ${ids.length} domain${ids.length === 1 ? "" : "s"}.`,
      );
    } catch {
      toast.error("Couldn't reach Athena for suggestions - pick manually.");
    } finally {
      setSuggesting(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setServerError(null);
    if (!form.title.trim()) {
      setServerError("Give the task a title.");
      return;
    }
    let budget_usd: number | null = null;
    if (form.budget.trim()) {
      const parsed = Number(form.budget);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setServerError("Budget must be a positive dollar amount.");
        return;
      }
      budget_usd = parsed;
    }
    let estimate_points: number | null = null;
    if (form.estimate.trim()) {
      const parsed = Number(form.estimate);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setServerError("Estimate must be a positive number of points.");
        return;
      }
      estimate_points = parsed;
    }

    const trimmedBody = form.body.trim();
    // Domain contract: a non-empty set is sent as-is; an explicit "No domain"
    // sends `[]` (inbox); leaving it untouched OMITS domain_ids so the server
    // infers them from the title/body.
    const domainPart: Pick<TaskCreateInput, "domain_ids"> | object =
      form.domainIds.length > 0
        ? { domain_ids: form.domainIds }
        : form.noDomain
          ? { domain_ids: [] }
          : {};
    // Optional string keys are `string`, not `string | undefined`, under
    // exactOptionalPropertyTypes - omit each key entirely when unset rather
    // than assigning `undefined`.
    const payload: TaskCreateInput = {
      type: form.type,
      title: form.title.trim(),
      priority: form.priority,
      target_date: form.target_date || null,
      budget_usd,
      ...domainPart,
      ...(trimmedBody ? { body: trimmedBody } : {}),
      ...(form.assignee ? { assignee: form.assignee } : {}),
      ...(form.labelIds.length ? { label_ids: form.labelIds } : {}),
      ...(form.teamId ? { owning_team_id: form.teamId } : {}),
      ...(form.cycleId ? { cycle_id: form.cycleId } : {}),
      ...(estimate_points !== null ? { estimate_points } : {}),
      ...(attachmentReadyIds.length ? { attachment_ids: attachmentReadyIds } : {}),
      // A plain task has no stages to run - never send the delegation flag.
      ...(form.type !== "task" && form.runWithAthena ? { ai_delegated: true } : {}),
      ...(form.type === "design" && designTokenSetIds.length
        ? { design_token_set_ids: designTokenSetIds }
        : {}),
    };

    setSubmitting(true);
    try {
      const task = await api.tasks.create(payload);
      toast.success(
        task.type === "task"
          ? `${task.display_id} created.`
          : `${task.display_id} created - ${TASK_TYPE_META[task.type].label} ready to drive.`,
      );
      onCreated(task);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Couldn't create the task.");
    } finally {
      setSubmitting(false);
    }
  };

  // How many Details fields are set - the collapsed header's quiet summary.
  const detailsSetCount = [
    form.assignee,
    form.priority,
    form.target_date,
    form.labelIds.length > 0 ? "y" : null,
    form.teamId,
    form.cycleId,
    form.estimate.trim() || null,
  ].filter(Boolean).length;

  const railed = form.type !== "task";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-overlay-in fixed inset-0 z-[var(--z-overlay)] bg-[var(--overlay)] backdrop-blur-sm">
          <span className="starfield opacity-50" aria-hidden="true" />
        </Dialog.Overlay>
        <Dialog.Content
          className="glass-sheet animate-modal-in fixed left-1/2 top-1/2 z-[var(--z-overlay)] max-h-[calc(100vh-2rem)] w-[min(640px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-6 focus:outline-none"
          aria-describedby="new-task-desc"
        >
          <form onSubmit={submit}>
            <Stack gap="4">
              <Stack gap="1">
                <Dialog.Title className="text-lg font-semibold">New task</Dialog.Title>
                <Dialog.Description id="new-task-desc" className="text-sm text-[var(--text-muted)]">
                  Track any work - or hand a piece of it to Athena.
                </Dialog.Description>
              </Stack>

              <TypePicker
                value={form.type}
                onChange={(type) => setForm({ ...form, type })}
              />

              <p
                aria-live="polite"
                className="-mt-1.5 flex items-start gap-1.5 text-xs text-[var(--text-muted)]"
              >
                <Sparkles className="mt-0.5 size-3 shrink-0 text-[var(--primary)]" aria-hidden />
                <span>{TASK_TYPE_META[form.type].outcome}</span>
              </p>

              <TextField
                label="Title"
                required
                value={form.title}
                onChange={(v) => setForm({ ...form, title: v })}
                placeholder="Self-serve order pause for hospitality customers"
                autoFocus
                maxLength={TITLE_MAX}
              />

              <DomainPicker
                domains={domains}
                selected={form.domainIds}
                noDomain={form.noDomain}
                suggestedIds={suggestedIds}
                onToggle={toggleDomain}
                onSelectNone={selectNoDomain}
                onSuggest={suggestDomains}
                suggesting={suggesting}
                canSuggest={Boolean(form.title.trim()) && domains.length > 0}
              />

              {form.type === "design" && (
                <DesignTokenPicker
                  systems={designSystems}
                  selectedIds={designTokenSetIds}
                  onToggle={(id) =>
                    setDesignTokenSetIds((ids) =>
                      id === null
                        ? []
                        : ids.includes(id)
                          ? ids.filter((x) => x !== id)
                          : [...ids, id],
                    )
                  }
                />
              )}

              <TextareaField
                label="Description (optional)"
                rows={4}
                value={form.body}
                onChange={(v) => setForm({ ...form, body: v })}
                placeholder="Who is it hurting, how often, what's the evidence? Markdown supported."
              />

              <Stack gap="1.5">
                <Cluster gap="2" align="center">
                  <span className="text-xs font-medium text-[var(--text-muted)]">
                    Attachments (optional)
                  </span>
                  <AttachmentButton onFiles={addAttachments} canAttachImages />
                </Cluster>
                <AttachmentChips drafts={attachmentDrafts} onRemove={removeAttachment} />
              </Stack>

              {/* Details - the planning facts, collapsed so quick capture stays
                  quick. Everything here is also editable later on the task page. */}
              <Stack gap="2.5" className="rounded-lg border border-[var(--border)] p-3">
                <button
                  type="button"
                  aria-expanded={detailsOpen}
                  onClick={() => setDetailsOpen((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  <span className="text-xs font-medium text-[var(--text-muted)]">
                    Details
                    {detailsSetCount > 0 && (
                      <span className="ml-1.5 text-[var(--text-subtle)]">
                        {detailsSetCount} set
                      </span>
                    )}
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-3.5 text-[var(--text-subtle)] transition-transform",
                      detailsOpen && "rotate-180",
                    )}
                    aria-hidden
                  />
                </button>
                {detailsOpen && (
                  <Stack gap="3">
                    <Grid cols="2" gap="3">
                      <Stack gap="1.5">
                        <span className="text-xs font-medium text-[var(--text-muted)]">
                          Assignee
                        </span>
                        <MemberPicker
                          members={members}
                          value={form.assignee}
                          placeholder="Unassigned"
                          onSelect={(m) => setForm({ ...form, assignee: m.user_id })}
                          {...(me && form.assignee !== me.id
                            ? {
                                header: (close: () => void) => (
                                  <PickerActionRow
                                    onClick={() => {
                                      close();
                                      setForm({ ...form, assignee: me.id });
                                    }}
                                  >
                                    Assign to me
                                  </PickerActionRow>
                                ),
                              }
                            : {})}
                          {...(form.assignee
                            ? {
                                footer: (close: () => void) => (
                                  <PickerActionRow
                                    onClick={() => {
                                      close();
                                      setForm({ ...form, assignee: null });
                                    }}
                                  >
                                    Unassign
                                  </PickerActionRow>
                                ),
                              }
                            : {})}
                        />
                      </Stack>
                      <EstimateField
                        value={form.estimate}
                        onChange={(v) => setForm({ ...form, estimate: v })}
                      />
                    </Grid>
                    <Grid cols="2" gap="3">
                      <PriorityPicker
                        value={form.priority}
                        onChange={(p) => setForm({ ...form, priority: p })}
                      />
                      <DateField
                        label="Target date"
                        value={form.target_date}
                        onChange={(v) => setForm({ ...form, target_date: v })}
                      />
                    </Grid>
                    <LabelsField
                      labels={labels}
                      selected={form.labelIds}
                      onToggle={(id, next) =>
                        setForm((f) => ({
                          ...f,
                          labelIds: next
                            ? [...f.labelIds, id]
                            : f.labelIds.filter((x) => x !== id),
                        }))
                      }
                    />
                    {teams.length > 0 && (
                      <Grid cols="2" gap="3">
                        <Stack gap="1.5">
                          <label
                            htmlFor="new-task-team"
                            className="text-xs font-medium text-[var(--text-muted)]"
                          >
                            Team
                          </label>
                          <Select
                            id="new-task-team"
                            value={form.teamId ?? ""}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                teamId: e.target.value || null,
                                cycleId: null,
                              })
                            }
                          >
                            <option value="">No team</option>
                            {teams.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </Select>
                        </Stack>
                        {form.teamId && (
                          <Stack gap="1.5">
                            <label
                              htmlFor="new-task-cycle"
                              className="text-xs font-medium text-[var(--text-muted)]"
                            >
                              Cycle
                            </label>
                            <Select
                              id="new-task-cycle"
                              value={form.cycleId ?? ""}
                              onChange={(e) =>
                                setForm({ ...form, cycleId: e.target.value || null })
                              }
                            >
                              <option value="">Backlog (no sprint)</option>
                              {cycles
                                .filter((c) => c.state !== "completed")
                                .map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name} ({c.state})
                                  </option>
                                ))}
                            </Select>
                          </Stack>
                        )}
                      </Grid>
                    )}
                  </Stack>
                )}
              </Stack>

              <BudgetField
                value={form.budget}
                onChange={(v) => setForm({ ...form, budget: v })}
              />

              {railed && (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                  <input
                    type="checkbox"
                    checked={form.runWithAthena}
                    onChange={(e) => setForm({ ...form, runWithAthena: e.target.checked })}
                    className="mt-0.5 size-4 accent-[var(--primary)]"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--text)]">
                      <Sparkles className="size-3.5 text-[var(--primary)]" aria-hidden />
                      Run with Athena
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                      The Athena driver works each ready stage. Leave off to drive
                      it yourself - you own it either way, and every hard gate
                      still waits for your approval.
                    </span>
                  </span>
                </label>
              )}

              {serverError && <ErrorMessage text={serverError} />}

              <Cluster justify="between" align="center">
                <span className="text-xs text-[var(--text-subtle)]">
                  {railed ? (
                    <>
                      <Sparkles className="mr-1 inline size-3 text-[var(--primary)]" />
                      Athena pauses at every gate for your approval.
                    </>
                  ) : (
                    "No AI workflow - you move it to done."
                  )}
                </span>
                <Cluster gap="2">
                  <Dialog.Close asChild>
                    <Button type="button" variant="ghost">
                      Cancel
                    </Button>
                  </Dialog.Close>
                  <Button
                    type="submit"
                    disabled={submitting || attachPending}
                    title={attachPending ? "Waiting for uploads to finish…" : undefined}
                  >
                    {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
                    Create task
                  </Button>
                </Cluster>
              </Cluster>
            </Stack>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TypePicker({
  value,
  onChange,
}: {
  value: TaskType;
  onChange: (t: TaskType) => void;
}) {
  return (
    <Stack gap="1.5">
      <span id="new-task-type-label" className="text-xs font-medium text-[var(--text-muted)]">
        Type <span className="text-[var(--danger)]">*</span>
      </span>
      <div role="radiogroup" aria-labelledby="new-task-type-label" aria-required="true">
        <Stack gap="2">
          {/* The plain work item leads - most work needs no AI workflow. */}
          <TypeOption
            type="task"
            selected={value === "task"}
            onPick={() => onChange("task")}
            subtitle="Track any work - no AI workflow attached"
            wide
          />
          <Cluster gap="2" align="center" className="mt-0.5">
            <span className="hr-horizon flex-1" aria-hidden />
            <Eyebrow>AI workflows</Eyebrow>
            <span className="hr-horizon flex-1" aria-hidden />
          </Cluster>
          <Grid cols="auto-fit-140" gap="2">
            {RAILED_TYPE_ORDER.map((type) => (
              <TypeOption
                key={type}
                type={type}
                selected={type === value}
                onPick={() => onChange(type)}
              />
            ))}
          </Grid>
        </Stack>
      </div>
    </Stack>
  );
}

function TypeOption({
  type,
  selected,
  onPick,
  subtitle,
  wide = false,
}: {
  type: TaskType;
  selected: boolean;
  onPick: () => void;
  subtitle?: string;
  wide?: boolean;
}) {
  const { label, Icon } = TASK_TYPE_META[type];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
      onClick={onPick}
      className={cn(
        "rounded-md border p-2 text-left text-xs transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        wide && "w-full",
        selected
          ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
          : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
      )}
    >
      <Cluster gap="1.5" align="center">
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="font-medium">{label}</span>
        {selected && <Check className="ml-auto size-3 shrink-0" />}
      </Cluster>
      {subtitle && (
        <span className="mt-0.5 block text-micro text-[var(--text-subtle)]">{subtitle}</span>
      )}
    </button>
  );
}

/** Header/footer rows inside the assignee picker (Assign to me / Unassign). */
function PickerActionRow({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[var(--text)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      {children}
    </button>
  );
}

/** Labels - the LabelsControl popover with a chips trigger, form-styled. */
function LabelsField({
  labels,
  selected,
  onToggle,
}: {
  labels: Label[];
  selected: string[];
  onToggle: (labelId: string, next: boolean) => void;
}) {
  const picked = labels.filter((l) => selected.includes(l.id));
  if (labels.filter((l) => !l.archived).length === 0) return null;
  return (
    <Stack gap="1.5">
      <span className="text-xs font-medium text-[var(--text-muted)]">Labels</span>
      <div className="w-fit">
        <LabelsControl
          value={selected}
          labels={labels}
          onToggle={onToggle}
          trigger={
            picked.length > 0 ? (
              <span className="flex flex-wrap items-center gap-1">
                {picked.map((l) => {
                  const { prefix, value } = splitLabelKey(l.key);
                  return (
                    <span
                      key={l.id}
                      className={cn(
                        "inline-flex items-center rounded px-1.5 py-0.5 text-micro font-medium",
                        labelColorClass(l.color),
                      )}
                    >
                      {prefix && <span className="mr-0.5 opacity-60">{prefix}:</span>}
                      {value}
                    </span>
                  );
                })}
                <span className="text-xs text-[var(--text-subtle)]">Edit</span>
              </span>
            ) : (
              <span className="text-xs text-[var(--text-subtle)]">Add labels</span>
            )
          }
        />
      </div>
    </Stack>
  );
}

function DesignTokenPicker({
  systems,
  selectedIds,
  onToggle,
}: {
  systems: DesignSystemSummary[];
  selectedIds: string[];
  /** Toggle a system in/out; `null` clears the whole selection ("None"). */
  onToggle: (id: string | null) => void;
}) {
  // Large orgs carry dozens of systems - a quick name/description filter keeps
  // the pill grid scannable. Selected systems stay selected even when hidden.
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = q
    ? systems.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.description ?? "").toLowerCase().includes(q),
      )
    : systems;
  const originLabel = (origin: DesignSystemSummary["origin"]) =>
    origin === "ai" ? "AI" : origin === "extracted" ? "From code" : "Manual";
  return (
    <Stack gap="1.5">
      <span className="text-xs font-medium text-[var(--text-muted)]">Design tokens (optional)</span>
      <p className="-mt-0.5 text-micro text-[var(--text-subtle)]">
        Ground this design in one or more saved design systems (mix several for
        different areas), or pick none to design without a fixed token set. Manage
        systems in the Design tokens tab.
      </p>
      {systems.length > 0 && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search design systems"
          aria-label="Search design systems"
          className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
      )}
      <Grid cols="auto-fit-160" gap="2">
        <DesignTokenOption
          active={selectedIds.length === 0}
          title="None"
          subtitle="No fixed token set"
          onClick={() => onToggle(null)}
        />
        {visible.map((s) => (
          <DesignTokenOption
            key={s.id}
            active={selectedIds.includes(s.id)}
            title={s.name}
            subtitle={originLabel(s.origin)}
            description={s.description}
            onClick={() => onToggle(s.id)}
          />
        ))}
      </Grid>
      {q && visible.length === 0 && (
        <p className="text-micro text-[var(--text-subtle)]">
          No design system matches that search.
        </p>
      )}
    </Stack>
  );
}

function DesignTokenOption({
  active,
  title,
  subtitle,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  description?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-md border p-2 text-left text-xs transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        active
          ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
          : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
      )}
    >
      <Cluster justify="between" align="center">
        <span className="truncate font-medium">{title}</span>
        {active && <Check className="size-3 shrink-0" />}
      </Cluster>
      {description && (
        <span className="block truncate text-micro text-[var(--text-muted)]">{description}</span>
      )}
      <span className="text-micro text-[var(--text-subtle)]">{subtitle}</span>
    </button>
  );
}

function DomainPicker({
  domains,
  selected,
  noDomain,
  suggestedIds,
  onToggle,
  onSelectNone,
  onSuggest,
  suggesting,
  canSuggest,
}: {
  domains: Domain[];
  selected: string[];
  noDomain: boolean;
  suggestedIds: string[];
  onToggle: (id: string) => void;
  onSelectNone: () => void;
  onSuggest: () => void;
  suggesting: boolean;
  canSuggest: boolean;
}) {
  // The three states the hint explains: pick-some / explicit-inbox / let-Athena.
  const hint =
    selected.length > 0
      ? `${selected.length} domain${selected.length === 1 ? "" : "s"} selected. A task can span several.`
      : noDomain
        ? "No domain - this task stays in the inbox."
        : "Leave this and Athena will infer the domains from your description.";

  return (
    <Stack gap="1.5">
      <Cluster justify="between" align="center">
        <span className="text-xs font-medium text-[var(--text-muted)]">
          Domains (optional)
        </span>
        <button
          type="button"
          onClick={onSuggest}
          disabled={!canSuggest || suggesting}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-micro font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
            "text-[var(--primary)] hover:bg-[var(--primary-soft)] disabled:opacity-50 disabled:hover:bg-transparent",
          )}
          title={
            canSuggest
              ? "Let Athena pick the domains this task touches"
              : "Add a title first"
          }
        >
          {suggesting ? (
            <Loader2 className="size-3 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="size-3" aria-hidden />
          )}
          Let Athena suggest
        </button>
      </Cluster>
      <p aria-live="polite" className="-mt-0.5 text-micro text-[var(--text-subtle)]">
        {hint}
      </p>
      <Grid cols="auto-fit-160" gap="2">
        <button
          type="button"
          onClick={onSelectNone}
          aria-pressed={noDomain && selected.length === 0}
          className={cn(
            "rounded-md border p-2 text-left text-xs transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
            noDomain && selected.length === 0
              ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
              : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
          )}
        >
          <Cluster justify="between" align="center">
            <span className="font-medium">No domain</span>
            {noDomain && selected.length === 0 && <Check className="size-3 shrink-0" />}
          </Cluster>
          <span className="text-micro text-[var(--text-subtle)]">Inbox / unscoped</span>
        </button>
        {domains.map((d) => {
          const isSelected = selected.includes(d.id);
          const isSuggested = suggestedIds.includes(d.id);
          return (
            <button
              type="button"
              key={d.id}
              onClick={() => onToggle(d.id)}
              aria-pressed={isSelected}
              className={cn(
                "rounded-md border p-2 text-left text-xs transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                isSelected
                  ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                  : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
              )}
            >
              <Cluster justify="between" align="center">
                <span className="font-medium">{d.name}</span>
                {isSelected ? (
                  <Check className="size-3 shrink-0" />
                ) : isSuggested ? (
                  <Sparkles
                    className="size-3 shrink-0 text-[var(--primary)]"
                    aria-label="Suggested by Athena"
                  />
                ) : null}
              </Cluster>
              <span className="text-micro text-[var(--text-subtle)]">/{d.slug}</span>
            </button>
          );
        })}
      </Grid>
    </Stack>
  );
}

function PriorityPicker({
  value,
  onChange,
}: {
  value: TaskPriority | null;
  onChange: (p: TaskPriority | null) => void;
}) {
  return (
    <Stack gap="1.5">
      <span className="text-xs font-medium text-[var(--text-muted)]">Priority</span>
      <Cluster gap="1.5" align="center">
        {PRIORITY_ORDER.map((p) => {
          const selected = p === value;
          return (
            <button
              type="button"
              key={p}
              onClick={() => onChange(selected ? null : p)}
              aria-pressed={selected}
              className={cn(
                "rounded-md border px-2 py-1 text-xs transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                selected
                  ? "border-[var(--primary)] bg-[var(--primary-soft)] font-medium text-[var(--primary)]"
                  : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
              )}
            >
              {PRIORITY_LABEL[p]}
            </button>
          );
        })}
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[var(--text-subtle)] transition-colors hover:text-[var(--text)]"
            aria-label="Clear priority"
          >
            <X className="size-3.5" />
          </button>
        )}
      </Cluster>
    </Stack>
  );
}

function EstimateField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Stack gap="1.5">
      <label htmlFor="new-task-estimate" className="text-xs font-medium text-[var(--text-muted)]">
        Estimate
      </label>
      <input
        id="new-task-estimate"
        type="number"
        inputMode="decimal"
        min={0}
        step="0.5"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Points"
        className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
      />
    </Stack>
  );
}

function BudgetField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Stack gap="1.5">
      <span className="text-xs font-medium text-[var(--text-muted)]">Budget (optional)</span>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--text-subtle)]">
          $
        </span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.5"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="No cap"
          className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] py-2 pl-6 pr-3 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
      </div>
    </Stack>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Stack gap="1.5">
      <span className="text-xs font-medium text-[var(--text-muted)]">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
      />
    </Stack>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  required,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <Stack gap="1.5">
      <Cluster justify="between" align="center">
        <span className="text-xs font-medium text-[var(--text-muted)]">
          {label}
          {required && <span className="text-[var(--danger)]"> *</span>}
        </span>
        {maxLength !== undefined && (
          <span
            className={cn(
              "text-micro tabular-nums text-[var(--text-subtle)]",
              value.length >= maxLength && "text-[var(--warning-ink)]",
            )}
          >
            {value.length}/{maxLength}
          </span>
        )}
      </Cluster>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        maxLength={maxLength}
        className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
      />
    </Stack>
  );
}

function TextareaField({
  label,
  rows,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  rows: number;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Stack gap="1.5">
      <span className="text-xs font-medium text-[var(--text-muted)]">{label}</span>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
      />
    </Stack>
  );
}

function ErrorMessage({ text }: { text: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-[var(--border-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]"
    >
      <Cluster gap="2" align="center">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        <span>{text}</span>
      </Cluster>
    </div>
  );
}
