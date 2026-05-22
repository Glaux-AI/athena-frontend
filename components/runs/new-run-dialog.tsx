"use client";

/**
 * NewRunDialog — the two-track "start a task" flow.
 *
 * Step 1 — Choose intent:
 *   ╭──────────────────────────────────╮  ╭──────────────────────────────────╮
 *   │  Create a PRD                    │  │  Implement a change              │
 *   │  Athena drafts a PRD from a      │  │  Pulls a PRD or ticket, plans,    │
 *   │  problem you describe.            │  │  writes code, opens a PR.          │
 *   ╰──────────────────────────────────╯  ╰──────────────────────────────────╯
 *
 * Step 2 — PRD form:
 *   - Capability selector (required)
 *   - Title, Problem, Why now
 *
 * Step 2 — Implement form:
 *   - Capability selector (required)
 *   - Source picker (PRD / Jira / Linear / Raw) — only shows sources whose
 *     integration is connected. Conditional input below per source.
 *   - Title
 *
 * Submits to POST /v1/runs and emits the new run via onCreated.
 */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft, ArrowRight, Check, FileText, Hammer, Loader2,
  AlertTriangle, Sparkles, ChevronDown,
} from "lucide-react";

import { api, ApiError, type Run, type Capability, type Integration } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { useSession } from "@/lib/session/SessionProvider";
import { cn } from "@/lib/cn";
import { toast } from "sonner";

type Step = "choose" | "form-prd" | "form-impl";
type ImplSource = "raw" | "prd" | "jira" | "linear";

interface FormState {
  capability_id: string;
  title: string;
  description: string;
  source: ImplSource;
  link: string;       // jira key / linear id / prd id / etc.
  why_now: string;    // PRD-only
}

const EMPTY_FORM: FormState = {
  capability_id: "",
  title: "",
  description: "",
  source: "raw",
  link: "",
  why_now: "",
};

export function NewRunDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (run: Run) => void;
}) {
  const { activeOrgId } = useSession();
  const [step, setStep] = useState<Step>("choose");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);

  useEffect(() => {
    if (!open || !activeOrgId) return;
    setStep("choose");
    setForm(EMPTY_FORM);
    setServerError(null);
    void Promise.all([
      api.capabilities.list().then(setCapabilities).catch(() => {}),
      api.integrations.list(activeOrgId).then(setIntegrations).catch(() => {}),
    ]);
  }, [open, activeOrgId]);

  /* Which work-management sources are usable today (= integration connected). */
  const sourceOptions = useMemo(() => {
    const opts: { id: ImplSource; label: string; hint: string; available: boolean; helperLink?: string }[] = [
      {
        id: "prd", label: "Existing PRD",
        hint: "Pick a PRD already drafted in Athena.",
        available: true,
      },
      {
        id: "jira", label: "Jira ticket",
        hint: "Paste an ACME-NNNN key.",
        available: integrations.some((i) => i.id === "int_jira" && i.status === "connected"),
        helperLink: "/settings/integrations",
      },
      {
        id: "linear", label: "Linear issue",
        hint: "Paste an ENG-NNN id.",
        available: integrations.some((i) => i.id === "int_linear" && i.status === "connected"),
        helperLink: "/settings/integrations",
      },
      {
        id: "raw", label: "Plain text",
        hint: "Describe the change inline.",
        available: true,
      },
    ];
    return opts;
  }, [integrations]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setServerError(null);
    if (!form.capability_id) { setServerError("Pick a capability before continuing."); return; }
    if (!form.title.trim())  { setServerError("Give the task a title.");                 return; }

    setSubmitting(true);
    try {
      const goal = step === "form-prd"
        ? `${form.title.trim()}\n\nProblem:\n${form.description}\n\nWhy now:\n${form.why_now}`
        : composeImplGoal(form);
      const run = await api.runs.create(goal, form.capability_id);
      toast.success(step === "form-prd" ? "PRD task started — Athena is framing the problem." : "Task started — Athena is loading context.");
      onCreated(run);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Couldn't start the task.");
    } finally {
      setSubmitting(false);
    }
  };

  const headline = step === "choose"   ? "Start a new task"
                 : step === "form-prd" ? "Create a PRD"
                                       : "Implement a change";
  const subline  = step === "choose"   ? "Tell Athena what you want. Approve the work as it lands at each gate."
                 : step === "form-prd" ? "Athena will draft the PRD from your problem statement."
                                       : "Athena will read the source, plan, write code, and open a PR.";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--overlay)] backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out" />
        <Dialog.Content
          className="animate-modal-in fixed left-1/2 top-1/2 z-50 w-[min(640px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl focus:outline-none"
          aria-describedby="new-run-desc"
        >
          <Stack gap="4">
            <Stack gap="1">
              <Cluster gap="2" align="center">
                {step !== "choose" && (
                  <button
                    onClick={() => setStep("choose")}
                    className="-ml-1 text-[var(--text-muted)] hover:text-[var(--text)]"
                    aria-label="Back to track choice"
                  >
                    <ArrowLeft className="size-4" />
                  </button>
                )}
                <Dialog.Title className="text-lg font-semibold">{headline}</Dialog.Title>
              </Cluster>
              <Dialog.Description id="new-run-desc" className="text-sm text-[var(--text-muted)]">
                {subline}
              </Dialog.Description>
            </Stack>

            {step === "choose" && (
              <Grid cols="2" gap="3">
                <ChoiceCard
                  icon={FileText}
                  title="Create a PRD"
                  description="Athena drafts the PRD: framing, research, options, sign-off."
                  exampleLabel="Best when…"
                  exampleHint="the problem is clear but the solution isn't yet."
                  onClick={() => setStep("form-prd")}
                />
                <ChoiceCard
                  icon={Hammer}
                  title="Implement a change"
                  description="From a PRD / ticket / description, Athena plans + writes code + opens a PR."
                  exampleLabel="Best when…"
                  exampleHint="the solution is agreed and you want code."
                  onClick={() => setStep("form-impl")}
                />
              </Grid>
            )}

            {step === "form-prd" && (
              <form onSubmit={submit}>
                <Stack gap="3">
                  <CapabilityPicker capabilities={capabilities} value={form.capability_id} onChange={(id) => setForm({ ...form, capability_id: id })} />
                  <TextField label="Title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} placeholder="Self-serve order pause for hospitality customers" autoFocus />
                  <TextareaField label="Problem" rows={4} value={form.description} onChange={(v) => setForm({ ...form, description: v })} placeholder="Who is it hurting, how often, what's the evidence?" />
                  <TextareaField label="Why now (optional)" rows={3} value={form.why_now} onChange={(v) => setForm({ ...form, why_now: v })} placeholder="Deadline, blocker, market signal…" />
                  {serverError && <ErrorMessage text={serverError} />}
                  <DialogFooter onCancel={() => onOpenChange(false)} submitting={submitting} submitLabel="Frame the problem" />
                </Stack>
              </form>
            )}

            {step === "form-impl" && (
              <form onSubmit={submit}>
                <Stack gap="3">
                  <CapabilityPicker capabilities={capabilities} value={form.capability_id} onChange={(id) => setForm({ ...form, capability_id: id })} />
                  <SourcePicker sources={sourceOptions} value={form.source} onChange={(s) => setForm({ ...form, source: s, link: "" })} />
                  <SourceInput source={form.source} link={form.link} description={form.description} onLinkChange={(v) => setForm({ ...form, link: v })} onDescriptionChange={(v) => setForm({ ...form, description: v })} />
                  <TextField label="Title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} placeholder="Short summary of the change" />
                  {serverError && <ErrorMessage text={serverError} />}
                  <DialogFooter onCancel={() => onOpenChange(false)} submitting={submitting} submitLabel="Start the task" />
                </Stack>
              </form>
            )}
          </Stack>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ChoiceCard({ icon: Icon, title, description, exampleLabel, exampleHint, onClick }: {
  icon: typeof FileText; title: string; description: string; exampleLabel: string; exampleHint: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-left transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      <Stack gap="3">
        <Cluster gap="2" align="center">
          <div className="flex size-9 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)] group-hover:bg-[var(--primary)] group-hover:text-[var(--primary-fg)]">
            <Icon className="size-4" />
          </div>
          <span className="text-base font-semibold">{title}</span>
        </Cluster>
        <p className="text-sm leading-relaxed text-[var(--text-muted)]">{description}</p>
        <Stack gap="0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{exampleLabel}</span>
          <span className="text-xs italic text-[var(--text-muted)]">{exampleHint}</span>
        </Stack>
        <Cluster gap="1" align="center" className="text-xs font-medium text-[var(--primary)]">
          Continue
          <ArrowRight className="size-3" />
        </Cluster>
      </Stack>
    </button>
  );
}

function CapabilityPicker({ capabilities, value, onChange }: {
  capabilities: Capability[]; value: string; onChange: (id: string) => void;
}) {
  if (capabilities.length === 0) {
    return (
      <Card className="border-[var(--border-strong)] bg-[var(--warning-soft)]">
        <Cluster gap="2" align="center">
          <AlertTriangle className="size-4 text-[var(--warning)]" />
          <span className="text-xs">No capabilities yet — create one in Capabilities before starting a task.</span>
        </Cluster>
      </Card>
    );
  }
  return (
    <Stack gap="1.5" as="div">
      <span className="text-xs font-medium text-[var(--text-muted)]">Capability <span className="text-[var(--danger)]">*</span></span>
      <Grid cols="auto-fit-160" gap="2">
        {capabilities.map((c) => (
          <button
            type="button"
            key={c.id}
            onClick={() => onChange(c.id)}
            className={cn(
              "rounded-md border p-2 text-left text-xs transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              c.id === value
                ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
            )}
          >
            <Cluster justify="between" align="center">
              <span className="font-medium">{c.name}</span>
              {c.id === value && <Check className="size-3 shrink-0" />}
            </Cluster>
            <span className="text-[10px] text-[var(--text-subtle)]">/{c.slug}</span>
          </button>
        ))}
      </Grid>
    </Stack>
  );
}

function SourcePicker({ sources, value, onChange }: {
  sources: { id: ImplSource; label: string; hint: string; available: boolean; helperLink?: string }[];
  value: ImplSource; onChange: (s: ImplSource) => void;
}) {
  return (
    <Stack gap="1.5">
      <span className="text-xs font-medium text-[var(--text-muted)]">Source</span>
      <Grid cols="auto-fit-140" gap="2">
        {sources.map((s) => (
          <button
            type="button"
            key={s.id}
            onClick={() => s.available && onChange(s.id)}
            disabled={!s.available}
            className={cn(
              "rounded-md border p-2 text-left text-xs transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              !s.available
                ? "cursor-not-allowed border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-subtle)] opacity-70"
                : s.id === value
                  ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                  : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
            )}
          >
            <Cluster justify="between" align="center">
              <span className="font-medium">{s.label}</span>
              {!s.available && <span className="text-[9px] uppercase tracking-wider text-[var(--text-subtle)]">Not connected</span>}
              {s.available && s.id === value && <Check className="size-3 shrink-0" />}
            </Cluster>
            <span className="text-[10px] text-[var(--text-subtle)]">{s.hint}</span>
            {!s.available && s.helperLink && (
              <a href={s.helperLink} className="mt-1 inline-block text-[10px] font-medium text-[var(--primary)] underline-offset-2 hover:underline">
                Connect →
              </a>
            )}
          </button>
        ))}
      </Grid>
    </Stack>
  );
}

function SourceInput({ source, link, description, onLinkChange, onDescriptionChange }: {
  source: ImplSource; link: string; description: string;
  onLinkChange: (v: string) => void; onDescriptionChange: (v: string) => void;
}) {
  if (source === "raw") {
    return <TextareaField label="Describe the change" rows={4} value={description} onChange={onDescriptionChange} placeholder="e.g. Add unsubscribe link to the payment-failure email." />;
  }
  if (source === "prd") {
    return <PrdSelect value={link} onChange={onLinkChange} />;
  }
  const ph = source === "jira" ? "ACME-1234" : "ENG-789";
  return <TextField label={source === "jira" ? "Jira key" : "Linear id"} value={link} onChange={onLinkChange} placeholder={ph} mono />;
}

function PrdSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [prds, setPrds] = useState<Run[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const list = await api.runs.list();
        setPrds(list.filter((r) => r.intent === "generate_prd"));
      } catch { /* ignore */ }
    })();
  }, []);
  return (
    <Stack gap="1.5">
      <span className="text-xs font-medium text-[var(--text-muted)]">PRD to implement</span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="block w-full appearance-none rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        >
          <option value="">Pick a PRD…</option>
          {prds.map((p) => <option key={p.id} value={p.id}>{p.goal.split("\n")[0]}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]" />
      </div>
    </Stack>
  );
}

function TextField({ label, value, onChange, placeholder, autoFocus, mono }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean; mono?: boolean;
}) {
  return (
    <Stack gap="1.5">
      <span className="text-xs font-medium text-[var(--text-muted)]">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={cn(
          "rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]",
          mono && "font-mono",
        )}
      />
    </Stack>
  );
}

function TextareaField({ label, rows, value, onChange, placeholder }: {
  label: string; rows: number; value: string; onChange: (v: string) => void; placeholder?: string;
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
        <AlertTriangle className="size-4 text-[var(--danger)]" />
        <p className="text-xs text-[var(--danger)]">{text}</p>
      </Cluster>
    </Card>
  );
}

function DialogFooter({ onCancel, submitting, submitLabel }: {
  onCancel: () => void; submitting: boolean; submitLabel: string;
}) {
  return (
    <Cluster justify="between" align="center">
      <span className="text-xs text-[var(--text-subtle)]">
        <Sparkles className="mr-1 inline size-3 text-[var(--primary)]" />
        Athena will pause at every gate for human approval.
      </span>
      <Cluster gap="2">
        <Dialog.Close asChild>
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        </Dialog.Close>
        <Button type="submit" disabled={submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          {submitLabel}
        </Button>
      </Cluster>
    </Cluster>
  );
}

function composeImplGoal(form: FormState): string {
  const head = form.title.trim();
  if (form.source === "raw")    return `${head}\n\n${form.description}`;
  if (form.source === "prd")    return `${head}\n\nImplements PRD: ${form.link}`;
  if (form.source === "jira")   return `${head}\n\nFrom Jira: ${form.link}`;
  if (form.source === "linear") return `${head}\n\nFrom Linear: ${form.link}`;
  return head;
}
