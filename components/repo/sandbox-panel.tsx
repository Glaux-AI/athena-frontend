"use client";

/**
 * SandboxPanel - the repo Sandbox tab (ADR-086-A full-autonomy redesign).
 *
 * One click "Configure with AI" provisions the per-tenant, deny-all-egress jail,
 * runs the repo's build + tests once on the sandbox machine, and writes a compact
 * repo guideline + a list of known issues the agent reuses. The whole setup is a
 * LIVE feed - the user sees exactly what the agent is doing, never a black box.
 * The user picks which model drives the sandbox; failures (compile errors, failing
 * tests) are surfaced as issues the user can mark "ignored" so the next change is
 * not blocked on a known problem.
 *
 * Self-contained: fetches its own status/profile/issues on mount and polls the
 * activity feed while setup is in flight.
 */

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  AlertTriangle, Boxes, CheckCircle2, ChevronRight, CircleDot, EyeOff, Eye,
  Lock, Settings2, ShieldCheck, Sparkles, Wand2, Wrench, XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { api, ApiError } from "@/lib/api/client";
import type {
  EnabledModel, SandboxActivity, SandboxConfig, SandboxDetect, SandboxIssue,
  SandboxProfile, SandboxService, SandboxSpec, SandboxStatus,
} from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { Stack, Cluster } from "@/components/layout/primitives";
import { formatRelativeTime } from "@/lib/utils/format";
import { cn } from "@/lib/cn";
import { SandboxLogViewer } from "./sandbox-log-viewer";

type DerivedState =
  | "disabled" | "unconfigured" | "configuring" | "ready" | "failed";

function deriveState(
  status: SandboxStatus | null, profile: SandboxProfile | null,
): DerivedState {
  if (!status || status.state === "disabled") return "disabled";
  if (profile?.status === "configuring") return "configuring";
  if (profile?.status === "ready") return "ready";
  if (profile?.status === "failed") return "failed";
  return "unconfigured";
}

function DenyAllFooter() {
  return (
    <Cluster className="items-center gap-2 text-xs text-[var(--text-muted)]">
      <ShieldCheck className="h-3.5 w-3.5 text-[var(--success)]" aria-hidden />
      <span>
        Full autonomy inside the jail - the agent can run any command - but with
        NO internet access. Per-tenant isolated. Every change still needs your
        approval before a PR.
      </span>
    </Cluster>
  );
}

export function SandboxPanel({ repoId }: { repoId: string }) {
  const [status, setStatus] = useState<SandboxStatus | null>(null);
  const [profile, setProfile] = useState<SandboxProfile | null>(null);
  const [issues, setIssues] = useState<SandboxIssue[]>([]);
  const [activity, setActivity] = useState<SandboxActivity | null>(null);
  const [models, setModels] = useState<EnabledModel[]>([]);
  const [picked, setPicked] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyIssue, setBusyIssue] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await api.repos.sandbox.status(repoId);
      setStatus(s);
      if (s.state !== "disabled") {
        const [p, iss] = await Promise.all([
          api.repos.sandbox.profile(repoId),
          api.repos.sandbox.issues(repoId),
        ]);
        setProfile(p);
        setIssues(iss);
      }
      setError(null);
    } catch {
      setError("Could not load the sandbox status.");
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Load the selectable models once (tool-capable models only - the setup +
  // implement agents need tool calling).
  useEffect(() => {
    void api.models
      .enabled()
      .then((m) => setModels(m.filter((x) => x.supports_tools)))
      .catch(() => setModels([]));
  }, []);

  const state = deriveState(status, profile);

  // While setup runs, poll the activity feed + status so the user watches live.
  useEffect(() => {
    if (state !== "configuring") return;
    let active = true;
    const tick = async () => {
      try {
        const a = await api.repos.sandbox.activity(repoId);
        if (active) setActivity(a);
        if (a.status !== "configuring") await refresh();
      } catch {
        /* transient - keep polling */
      }
    };
    void tick();
    const t = setInterval(() => void tick(), 2500);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [state, repoId, refresh]);

  const configure = useCallback(async () => {
    const model = models.find((m) => m.id === picked) ?? models[0];
    if (!model) {
      setActionError("No tool-capable model is available. Add one in Settings -> Models.");
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await api.repos.sandbox.configure(repoId, {
        model_provider: model.provider,
        model_id: model.id,
        model_source: model.source,
      });
      // Optimistically flip to "configuring" so the live feed shows immediately.
      setProfile({
        status: "configuring", model: model.id, facts: {}, guideline_md: null,
        summary: null, last_setup_at: null, updated_at: new Date().toISOString(),
      });
      setActivity({ status: "configuring", steps: [{ summary: "Queued", status: "running" }], log_tail: "" });
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Could not start setup. Try again.");
    } finally {
      setBusy(false);
    }
  }, [repoId, models, picked]);

  const toggleIssue = useCallback(
    async (issue: SandboxIssue) => {
      const next = issue.status === "ignored" ? "open" : "ignored";
      setBusyIssue(issue.id);
      try {
        const updated = await api.repos.sandbox.patchIssue(repoId, issue.id, next);
        setIssues((list) => list.map((i) => (i.id === updated.id ? updated : i)));
      } catch {
        setActionError("Could not update the issue.");
      } finally {
        setBusyIssue(null);
      }
    },
    [repoId],
  );

  if (loading) {
    return (
      <Stack className="gap-3" aria-busy>
        <div className="h-24 skeleton rounded-lg" />
        <div className="h-40 skeleton rounded-lg" />
      </Stack>
    );
  }
  if (error) {
    return (
      <EmptyState
        icon={<Boxes className="h-6 w-6" />}
        title="Sandbox unavailable"
        description={error}
        action={<Button variant="secondary" onClick={() => void refresh()}>Retry</Button>}
      />
    );
  }

  if (editing) {
    return (
      <ManualRecipe
        repoId={repoId}
        config={null}
        onDone={() => {
          setEditing(false);
          void refresh();
        }}
      />
    );
  }

  if (state === "disabled") {
    return (
      <Stack className="gap-4">
        <EmptyState
          icon={<Lock className="h-6 w-6" />}
          title="Build + test sandbox"
          description={status?.message ?? "The sandbox is available on paid plans."}
        />
        <DenyAllFooter />
      </Stack>
    );
  }

  return (
    <Stack className="gap-4">
      {actionError && <ErrorCard message={actionError} />}

      {state === "unconfigured" && (
        <SetupHero
          models={models}
          picked={picked || models[0]?.id || ""}
          onPick={setPicked}
          onConfigure={() => void configure()}
          onManual={() => setEditing(true)}
          busy={busy}
        />
      )}

      {state === "configuring" && (
        <ConfiguringView
          activity={activity}
          model={profile?.model}
          onRestart={() => void configure()}
          busy={busy}
        />
      )}

      {(state === "ready" || state === "failed") && (
        <ResultView
          state={state}
          profile={profile}
          issues={issues}
          models={models}
          picked={picked || profile?.model || models[0]?.id || ""}
          onPick={setPicked}
          onReconfigure={() => void configure()}
          onToggleIssue={(i) => void toggleIssue(i)}
          busy={busy}
          busyIssue={busyIssue}
        />
      )}

      <DenyAllFooter />
    </Stack>
  );
}

/* ----------------------------------------------------------------------- */
/* Setup hero - pick a model + one click                                    */
/* ----------------------------------------------------------------------- */
function SetupHero({
  models, picked, onPick, onConfigure, onManual, busy,
}: {
  models: EnabledModel[];
  picked: string;
  onPick: (id: string) => void;
  onConfigure: () => void;
  onManual: () => void;
  busy: boolean;
}) {
  return (
    <Card className="p-5">
      <Stack className="gap-4">
        <Stack className="gap-1.5">
          <Cluster className="items-center gap-2">
            <Sparkles className="h-5 w-5 text-[var(--primary)]" aria-hidden />
            <span className="text-base font-semibold text-[var(--text)]">Set up the sandbox with AI</span>
          </Cluster>
          <p className="text-sm text-[var(--text-muted)]">
            Athena spins up an isolated machine, installs your dependencies, builds
            the project, and runs your tests once - then writes a short guide it
            reuses every time it edits this repo. You will see each step live.
          </p>
        </Stack>

        <ModelPicker models={models} value={picked} onChange={onPick} />

        <Cluster className="items-center justify-between gap-3">
          <button
            type="button"
            onClick={onManual}
            className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <Settings2 className="h-3.5 w-3.5" aria-hidden /> Edit the recipe manually instead
          </button>
          <Button onClick={onConfigure} loading={busy} disabled={models.length === 0}>
            <Wand2 className="h-4 w-4" /> Configure with AI
          </Button>
        </Cluster>
      </Stack>
    </Card>
  );
}

function ModelPicker({
  models, value, onChange,
}: { models: EnabledModel[]; value: string; onChange: (id: string) => void }) {
  return (
    <Stack className="gap-1">
      <label className="text-xs font-medium text-[var(--text-muted)]">Model for this sandbox</label>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={models.length === 0}
        className="w-full"
      >
        {models.length === 0 && <option value="">No tool-capable models enabled</option>}
        {models.map((m) => (
          <option key={`${m.provider}:${m.id}:${m.source}`} value={m.id}>
            {m.display_name} {m.source === "byok" ? "(your key)" : m.source === "subscription" ? "(your plan)" : ""}
          </option>
        ))}
      </Select>
      <span className="text-micro text-[var(--text-muted)]">
        This model drives setup and the autonomous edits in this repo&apos;s sandbox.
      </span>
    </Stack>
  );
}

/* ----------------------------------------------------------------------- */
/* Configuring - live activity feed                                         */
/* ----------------------------------------------------------------------- */
function useElapsedSeconds(): number {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return secs;
}

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function ConfiguringView({
  activity, model, onRestart, busy,
}: {
  activity: SandboxActivity | null;
  model: string | null | undefined;
  onRestart: () => void;
  busy: boolean;
}) {
  const steps = activity?.steps ?? [];
  const elapsed = useElapsedSeconds();
  const slow = elapsed > 12 * 60; // most setups finish well under this
  return (
    <Card className="p-5">
      <Stack className="gap-4">
        <Cluster className="items-center justify-between gap-2">
          <Cluster className="items-center gap-2 min-w-0">
            <span
              className="star-dot is-live shrink-0"
              style={{ "--dot-color": "var(--primary)" } as CSSProperties}
              aria-hidden
            />
            <span className="truncate text-sm font-medium text-[var(--text)]">
              Setting up the sandbox{model ? ` with ${model}` : ""}...
            </span>
          </Cluster>
          <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-muted)]">
            {mmss(elapsed)}
          </span>
        </Cluster>

        {/* Indeterminate progress bar - clearly "working", not a fake percentage. */}
        <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
          <div className="h-full w-1/3 animate-sandbox-progress rounded-full bg-[var(--primary)]" />
        </div>

        <p className="text-xs text-[var(--text-muted)]">
          Athena is installing dependencies, building, and running your tests on a
          fresh machine. This usually takes a few minutes. You can leave this page -
          it keeps running in the background.
        </p>

        <Stack className="gap-1.5">
          {steps.length === 0 && (
            <StepRow summary="Starting the sandbox machine..." status="running" />
          )}
          {steps.map((s, i) => (
            <StepRow key={i} summary={s.summary} status={s.status} />
          ))}
        </Stack>

        {activity?.log_tail != null && activity.log_tail !== "" && (
          <SandboxLogViewer text={activity.log_tail} streaming />
        )}

        {slow && (
          <Stack className="gap-2 rounded-md bg-[var(--warning-soft)] p-2.5">
            <Cluster className="items-start gap-2 text-xs text-[var(--warning-ink)]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                This is taking longer than usual (large repos and first-time builds
                can). It keeps running in the background - check back shortly, or
                reload to see the latest progress. If it seems stuck, start over.
              </span>
            </Cluster>
            <Cluster className="justify-end">
              <Button variant="secondary" size="sm" onClick={onRestart} loading={busy}>
                <Wand2 className="h-3.5 w-3.5" /> Start over
              </Button>
            </Cluster>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

function StepRow({ summary, status }: { summary: string; status: string }) {
  const Icon = status === "done" ? CheckCircle2 : status === "failed" ? XCircle : CircleDot;
  const color =
    status === "done" ? "text-[var(--success)]"
      : status === "failed" ? "text-[var(--danger)]"
        : "text-[var(--primary)]";
  return (
    <Cluster className="items-center gap-2 text-sm text-[var(--text)]">
      {status === "running" ? (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden>
          <span
            className="star-dot is-live"
            style={{ "--dot-color": "var(--primary)" } as CSSProperties}
          />
        </span>
      ) : (
        <Icon className={cn("h-4 w-4 shrink-0", color)} aria-hidden />
      )}
      <span className={status === "running" ? "text-[var(--text)]" : "text-[var(--text-muted)]"}>{summary}</span>
    </Cluster>
  );
}

/* ----------------------------------------------------------------------- */
/* Ready / failed - profile, guideline, facts, issues                       */
/* ----------------------------------------------------------------------- */
function ResultView({
  state, profile, issues, models, picked, onPick, onReconfigure, onToggleIssue, busy, busyIssue,
}: {
  state: DerivedState;
  profile: SandboxProfile | null;
  issues: SandboxIssue[];
  models: EnabledModel[];
  picked: string;
  onPick: (id: string) => void;
  onReconfigure: () => void;
  onToggleIssue: (i: SandboxIssue) => void;
  busy: boolean;
  busyIssue: string | null;
}) {
  const ok = state === "ready";
  return (
    <Stack className="gap-4">
      <Card className={cn("p-4", !ok && "border-[var(--danger)]")}>
        <Stack className="gap-3">
          <Cluster className="items-center justify-between gap-3">
            <Cluster className="items-center gap-2">
              {ok ? (
                <CheckCircle2 className="h-4 w-4 text-[var(--success)]" aria-hidden />
              ) : (
                <AlertTriangle className="h-4 w-4 text-[var(--danger)]" aria-hidden />
              )}
              <span className="text-sm font-medium text-[var(--text)]">
                {ok ? "Sandbox ready" : "Setup finished with problems"}
              </span>
              {profile?.model && (
                <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-micro text-[var(--text-muted)]">
                  {profile.model}
                </span>
              )}
            </Cluster>
            {profile?.last_setup_at && (
              <span className="text-micro text-[var(--text-muted)]">
                {formatRelativeTime(profile.last_setup_at)}
              </span>
            )}
          </Cluster>
          {profile?.summary && (
            <p className="text-sm text-[var(--text-muted)]">{profile.summary}</p>
          )}
        </Stack>
      </Card>

      {profile?.guideline_md && (
        <GuidelineCard
          md={profile.guideline_md}
          title={ok ? "Repo guideline" : "How to fix"}
          icon={ok ? Boxes : Wrench}
        />
      )}
      <FactsCard facts={profile?.facts ?? {}} />

      {issues.length > 0 && (
        <IssueList issues={issues} onToggle={onToggleIssue} busyId={busyIssue} />
      )}

      <Card className="p-4">
        <Stack className="gap-3">
          <span className="text-sm font-medium text-[var(--text)]">Re-run setup</span>
          <span className="text-xs text-[var(--text-muted)]">
            Re-validate the build and refresh the guideline (e.g. after dependency
            changes). Pick a different model if you like.
          </span>
          <ModelPicker models={models} value={picked} onChange={onPick} />
          <Cluster className="justify-end">
            <Button variant={ok ? "secondary" : "primary"} onClick={onReconfigure} loading={busy}>
              <Wand2 className="h-4 w-4" /> {ok ? "Reconfigure" : "Try again"}
            </Button>
          </Cluster>
        </Stack>
      </Card>
    </Stack>
  );
}

function GuidelineCard({
  md, title = "Repo guideline", icon: Icon = Boxes,
}: { md: string; title?: string; icon?: LucideIcon }) {
  return (
    <Card className="p-4">
      <Stack className="gap-2">
        <Cluster className="items-center gap-2">
          <Icon className="h-4 w-4 text-[var(--primary)]" aria-hidden />
          <span className="text-sm font-medium text-[var(--text)]">{title}</span>
        </Cluster>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--surface-2)] p-3 font-mono text-micro leading-relaxed text-[var(--text)]">
          {md.trim()}
        </pre>
      </Stack>
    </Card>
  );
}

const FACT_LABELS: { key: string; label: string }[] = [
  { key: "toolchain", label: "Toolchain" },
  { key: "package_managers", label: "Package managers" },
  { key: "build_command", label: "Build" },
  { key: "test_command", label: "Tests" },
  { key: "working_dir", label: "Working dir" },
  { key: "run_notes", label: "Notes" },
];

function FactsCard({ facts }: { facts: Record<string, unknown> }) {
  const rows = FACT_LABELS.map(({ key, label }) => ({ label, value: facts[key] }))
    .filter((r) => r.value != null && r.value !== "");
  if (rows.length === 0) return null;
  return (
    <Card className="p-4">
      <Stack className="gap-2">
        <span className="text-sm font-medium text-[var(--text)]">What Athena learned</span>
        {rows.map((r) => (
          <Cluster key={r.label} className="items-baseline gap-3 text-sm">
            <span className="w-32 shrink-0 text-[var(--text-muted)]">{r.label}</span>
            <span className="font-mono text-[var(--text)]">
              {Array.isArray(r.value) ? r.value.join(", ") : String(r.value)}
            </span>
          </Cluster>
        ))}
      </Stack>
    </Card>
  );
}

/* ----------------------------------------------------------------------- */
/* Known issues with ignore toggles (founder point 6)                       */
/* ----------------------------------------------------------------------- */
function IssueList({
  issues, onToggle, busyId,
}: { issues: SandboxIssue[]; onToggle: (i: SandboxIssue) => void; busyId: string | null }) {
  const open = issues.filter((i) => i.status === "open");
  const ignored = issues.filter((i) => i.status === "ignored");
  return (
    <Card className="p-4">
      <Stack className="gap-3">
        <Cluster className="items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[var(--warning)]" aria-hidden />
          <span className="text-sm font-medium text-[var(--text)]">
            Known issues ({open.length} open{ignored.length ? `, ${ignored.length} ignored` : ""})
          </span>
        </Cluster>
        <p className="text-xs text-[var(--text-muted)]">
          Found while validating the build. Mark an issue &quot;ignore&quot; so the agent
          treats it as a pre-existing problem and is not blocked on it next time.
        </p>
        <Stack className="gap-2">
          {[...open, ...ignored].map((i) => (
            <IssueRow key={i.id} issue={i} onToggle={onToggle} busy={busyId === i.id} />
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}

const KIND_LABEL: Record<SandboxIssue["kind"], string> = {
  compile_error: "Compile error",
  test_failure: "Test failure",
  flaky: "Flaky test",
  env: "Environment",
  other: "Other",
};

function IssueRow({
  issue, onToggle, busy,
}: { issue: SandboxIssue; onToggle: (i: SandboxIssue) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const ignored = issue.status === "ignored";
  return (
    <div
      className={cn(
        "rounded-md border border-[var(--border)] p-2.5",
        ignored ? "opacity-60" : "",
      )}
    >
      <Cluster className="items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <ChevronRight
            className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform", open && "rotate-90")}
            aria-hidden
          />
          <span className="min-w-0">
            <span className="mr-2 rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-micro uppercase tracking-wide text-[var(--text-muted)]">
              {KIND_LABEL[issue.kind]}
            </span>
            <span className="text-sm text-[var(--text)]">{issue.title}</span>
          </span>
        </button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onToggle(issue)}
          loading={busy}
          aria-label={ignored ? "Un-ignore issue" : "Ignore issue"}
        >
          {ignored ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          {ignored ? "Un-ignore" : "Ignore"}
        </Button>
      </Cluster>
      {open && issue.detail && (
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-[var(--surface-2)] p-2 font-mono text-micro text-[var(--text)]">
          {issue.detail}
        </pre>
      )}
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card className="border-[var(--danger)] p-3">
      <Cluster className="items-start gap-2 text-sm text-[var(--text)]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" aria-hidden />
        <span className="text-[var(--text-muted)]">{message}</span>
      </Cluster>
    </Card>
  );
}

/* ----------------------------------------------------------------------- */
/* Manual recipe (advanced) - the original recipe editor                    */
/* ----------------------------------------------------------------------- */
const EMPTY_SPEC: SandboxSpec = {
  base_image: "node-22",
  install_commands: [],
  build_command: null,
  test_command: null,
  test_select_cmd: null,
  working_subdir: null,
  env: {},
  resource_profile: "default",
};

function ManualRecipe({
  repoId, config, onDone,
}: { repoId: string; config: SandboxConfig | null; onDone: () => void }) {
  const [spec, setSpec] = useState<SandboxSpec>(config?.spec ?? EMPTY_SPEC);
  const [detect, setDetect] = useState<SandboxDetect | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config) return;
    setDetecting(true);
    api.repos.sandbox
      .autodetect(repoId)
      .then((d) => {
        setSpec(d.spec);
        setDetect(d);
      })
      .catch(() => setDetect(null))
      .finally(() => setDetecting(false));
  }, [repoId, config]);

  const set = <K extends keyof SandboxSpec>(k: K, v: SandboxSpec[K]) =>
    setSpec((s) => ({ ...s, [k]: v }));
  const low = (f: string) => detect?.low_confidence_fields.includes(f) ?? false;

  const save = async () => {
    setSaving(true);
    try {
      await api.repos.sandbox.putConfig(repoId, { spec, status: "configured" });
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4">
      <Stack className="gap-4">
        <Cluster className="items-center gap-2 text-sm text-[var(--text)]">
          <Settings2 className="h-4 w-4 text-[var(--primary)]" aria-hidden />
          {detecting ? "Detecting your build from the repo..." : "Edit the build recipe"}
        </Cluster>

        {spec.services && spec.services.length > 1 && (
          <DetectedPartsCard services={spec.services} />
        )}

        <RecipeField label="Base image" flag={low("base_image")} hint="A friendly key (node-22) or any pinned public image.">
          <input className={inputCls} value={spec.base_image} onChange={(e) => set("base_image", e.target.value)} placeholder="node-22" />
        </RecipeField>
        <RecipeField label="Install commands" flag={low("install_commands")} hint="One per line. Run during setup (the only network window).">
          <textarea
            className={cn(inputCls, "min-h-[64px]")}
            value={spec.install_commands.join("\n")}
            onChange={(e) => set("install_commands", e.target.value.split("\n").map((l) => l.trim()).filter(Boolean))}
            placeholder="npm ci"
          />
        </RecipeField>
        <RecipeField label="Build command" flag={low("build_command")}>
          <input className={inputCls} value={spec.build_command ?? ""} onChange={(e) => set("build_command", e.target.value || null)} placeholder="npm run build" />
        </RecipeField>
        <RecipeField label="Test command" flag={low("test_command")}>
          <input className={inputCls} value={spec.test_command ?? ""} onChange={(e) => set("test_command", e.target.value || null)} placeholder="npm test" />
        </RecipeField>
        <RecipeField label="Working directory" hint="Optional. Blank = repo root.">
          <input className={inputCls} value={spec.working_subdir ?? ""} onChange={(e) => set("working_subdir", e.target.value || null)} placeholder="(repo root)" />
        </RecipeField>

        <Cluster className="items-center justify-end gap-2">
          <Button variant="secondary" onClick={onDone} disabled={saving}>Cancel</Button>
          <Button onClick={() => void save()} loading={saving} disabled={detecting}>Save recipe</Button>
        </Cluster>
      </Stack>
    </Card>
  );
}

/* Read-only summary of a polyglot monorepo's detected parts. The one image bakes
 * every part; the fields below edit the PRIMARY part. (ADR-086 Inc 5) */
function DetectedPartsCard({ services }: { services: SandboxService[] }) {
  return (
    <Card className="border-[var(--primary)] p-3">
      <Stack className="gap-2">
        <Cluster className="items-center gap-2">
          <Boxes className="h-4 w-4 text-[var(--primary)]" aria-hidden />
          <span className="text-sm font-medium text-[var(--text)]">
            {services.length} build parts detected
          </span>
        </Cluster>
        <p className="text-micro text-[var(--text-muted)]">
          This monorepo has multiple parts. Athena bakes them all into one sandbox
          image and builds + tests each. The fields below edit the primary part.
        </p>
        <Stack className="gap-1">
          {services.map((s, i) => (
            <Cluster key={`${i}-${s.name}`} className="items-baseline gap-2 text-xs">
              <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-medium text-[var(--text)]">
                {s.name}
                {i === 0 ? " (primary)" : ""}
              </span>
              <span className="text-[var(--text-muted)]">
                {s.working_subdir ?? "repo root"} - {s.base_image}
              </span>
            </Cluster>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}

const inputCls = cn(
  "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 font-mono text-sm text-[var(--text)]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
);

function RecipeField({
  label, children, hint, flag,
}: { label: string; children: React.ReactNode; hint?: string; flag?: boolean }) {
  return (
    <Stack className="gap-1">
      <Cluster className="items-center justify-between gap-2">
        <label className="text-xs font-medium text-[var(--text-muted)]">{label}</label>
        {flag && (
          <Cluster className="items-center gap-1 text-micro text-[var(--text-muted)]">
            <AlertTriangle className="h-3 w-3 text-[var(--warning)]" aria-hidden /> double-check
          </Cluster>
        )}
      </Cluster>
      {children}
      {hint && <span className="text-micro text-[var(--text-muted)]">{hint}</span>}
    </Stack>
  );
}
