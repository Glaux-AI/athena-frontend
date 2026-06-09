"use client";

/**
 * NewTaskDialog — create a task on the recursive-Task spine.
 *
 * One step. Unlike the old two-track run dialog, every task type shares the
 * same fields; only the stage sequence differs (server-side, per type). So the
 * form is flat:
 *
 *   - Type     (required) — the 7 task types; drives the stage sequence.
 *   - Title    (required)
 *   - Domain   (optional) — top-level scope; "No domain" = inbox / unscoped.
 *   - Details  (optional markdown problem statement / description).
 *   - Priority (optional) — board ordering / triage.
 *   - Budget   (optional) — AI spend cap for this task's stages.
 *
 * Creating a task spends no credit (no AI runs at create — stages start
 * `locked`/`ready` and the agent only runs when you hand it a stage). Submits to
 * POST /v1/tasks and emits the new task via onCreated, which navigates to the
 * cockpit.
 */

import { useEffect, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Check, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import {
  api,
  ApiError,
  type Domain,
  type Task,
  type TaskCreateInput,
  type TaskPriority,
  type TaskType,
} from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Cluster, Grid, Stack } from "@/components/layout/primitives";
import { TASK_TYPE_META } from "@/lib/work/task-meta";
import { useSession } from "@/lib/session/SessionProvider";
import { cn } from "@/lib/cn";

const TASK_TYPE_ORDER: TaskType[] = [
  "feature",
  "implementation",
  "design",
  "bug",
  "incident",
  "spike",
  "chore",
];

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
  domain_id: string; // "" = no domain (inbox)
  body: string;
  priority: TaskPriority | null;
  budget: string; // raw input; parsed on submit
}

const EMPTY_FORM: FormState = {
  type: "feature",
  title: "",
  domain_id: "",
  body: "",
  priority: null,
  budget: "",
};

/** Pre-fill values folded over the empty form when the dialog opens — e.g.
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
  const { activeOrgId } = useSession();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !activeOrgId) return;
    setForm({
      ...EMPTY_FORM,
      type: defaults?.type ?? EMPTY_FORM.type,
      title: defaults?.title ?? EMPTY_FORM.title,
      body: defaults?.body ?? EMPTY_FORM.body,
      domain_id: defaults?.domain_id ?? defaultDomainId ?? "",
    });
    setServerError(null);
    void api.domains
      .list()
      .then(setDomains)
      .catch(() => setDomains([]));
  }, [open, activeOrgId, defaultDomainId, defaults]);

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

    const trimmedBody = form.body.trim();
    // `body` is an optional `string` (not `string | undefined`) under
    // exactOptionalPropertyTypes — omit the key entirely when empty rather than
    // assigning `undefined`.
    const payload: TaskCreateInput = {
      type: form.type,
      title: form.title.trim(),
      domain_id: form.domain_id || null,
      priority: form.priority,
      budget_usd,
      ...(trimmedBody ? { body: trimmedBody } : {}),
    };

    setSubmitting(true);
    try {
      const task = await api.tasks.create(payload);
      toast.success(`Task created — ${TASK_TYPE_META[task.type].label} ready to drive.`);
      onCreated(task);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Couldn't create the task.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-overlay-in fixed inset-0 z-40 bg-[var(--overlay)] backdrop-blur-sm" />
        <Dialog.Content
          className="glass animate-modal-in fixed left-1/2 top-1/2 z-50 w-[min(640px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--border)] p-6 shadow-[var(--shadow-3)] focus:outline-none"
          aria-describedby="new-task-desc"
        >
          <form onSubmit={submit}>
            <Stack gap="4">
              <Stack gap="1">
                <Dialog.Title className="text-lg font-semibold">New task</Dialog.Title>
                <Dialog.Description id="new-task-desc" className="text-sm text-[var(--text-muted)]">
                  Describe the work. Drive each stage yourself, or hand it to Athena.
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
              />

              <DomainPicker
                domains={domains}
                value={form.domain_id}
                onChange={(id) => setForm({ ...form, domain_id: id })}
              />

              <TextareaField
                label="Details (optional)"
                rows={4}
                value={form.body}
                onChange={(v) => setForm({ ...form, body: v })}
                placeholder="Who is it hurting, how often, what's the evidence? Markdown supported."
              />

              <Grid cols="2" gap="3">
                <PriorityPicker
                  value={form.priority}
                  onChange={(p) => setForm({ ...form, priority: p })}
                />
                <BudgetField
                  value={form.budget}
                  onChange={(v) => setForm({ ...form, budget: v })}
                />
              </Grid>

              {serverError && <ErrorMessage text={serverError} />}

              <Cluster justify="between" align="center">
                <span className="text-xs text-[var(--text-subtle)]">
                  <Sparkles className="mr-1 inline size-3 text-[var(--primary)]" />
                  Athena pauses at every gate for your approval.
                </span>
                <Cluster gap="2">
                  <Dialog.Close asChild>
                    <Button type="button" variant="ghost">
                      Cancel
                    </Button>
                  </Dialog.Close>
                  <Button type="submit" disabled={submitting}>
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
        <Grid cols="auto-fit-140" gap="2">
          {TASK_TYPE_ORDER.map((type) => {
            const { label, Icon } = TASK_TYPE_META[type];
            const selected = type === value;
            return (
              <button
                type="button"
                key={type}
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => onChange(type)}
                className={cn(
                  "rounded-md border p-2 text-left text-xs transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
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
              </button>
            );
          })}
        </Grid>
      </div>
    </Stack>
  );
}

function DomainPicker({
  domains,
  value,
  onChange,
}: {
  domains: Domain[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <Stack gap="1.5">
      <span className="text-xs font-medium text-[var(--text-muted)]">Domain</span>
      <Grid cols="auto-fit-160" gap="2">
        <button
          type="button"
          onClick={() => onChange("")}
          aria-pressed={value === ""}
          className={cn(
            "rounded-md border p-2 text-left text-xs transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
            value === ""
              ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
              : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
          )}
        >
          <Cluster justify="between" align="center">
            <span className="font-medium">No domain</span>
            {value === "" && <Check className="size-3 shrink-0" />}
          </Cluster>
          <span className="text-[10px] text-[var(--text-subtle)]">Inbox / unscoped</span>
        </button>
        {domains.map((d) => (
          <button
            type="button"
            key={d.id}
            onClick={() => onChange(d.id)}
            aria-pressed={d.id === value}
            className={cn(
              "rounded-md border p-2 text-left text-xs transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              d.id === value
                ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
            )}
          >
            <Cluster justify="between" align="center">
              <span className="font-medium">{d.name}</span>
              {d.id === value && <Check className="size-3 shrink-0" />}
            </Cluster>
            <span className="text-[10px] text-[var(--text-subtle)]">/{d.slug}</span>
          </button>
        ))}
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

function TextField({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  required?: boolean;
}) {
  return (
    <Stack gap="1.5">
      <span className="text-xs font-medium text-[var(--text-muted)]">
        {label}
        {required && <span className="text-[var(--danger)]"> *</span>}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
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
    <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)] p-2">
      <Cluster gap="2" align="center">
        <AlertTriangle className="size-4 text-[var(--danger-ink)]" />
        <p className="text-xs text-[var(--danger-ink)]">{text}</p>
      </Cluster>
    </Card>
  );
}
