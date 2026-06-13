"use client";

/**
 * StageActions - the single clear next-action for the selected stage (per the
 * v4 mock: one primary CTA, never a wall of buttons). The CTA is derived from
 * the stage's FSM status:
 *
 *   ready | failed | rejected → "Run with Athena" (POST `api.tasks.runStage`,
 *       with optional pre-run steer text) + a secondary "Do it manually"
 *       affordance (an inline editor → `authorArtifact` then `submitStage`).
 *   running                   → disabled "Athena is working…".
 *   in_review                 → "Approve" / "Request changes"
 *       (`api.tasks.gateStage`, decision approve|reject + optional note).
 *       The decompose plan gate (artifact_kind `subtask_plan`) is consequence-
 *       explicit: approving MATERIALIZES the plan into real tasks + dependency
 *       edges, so its CTA + toast say so (with the task count when the working
 *       plan body parses - see `subtaskPlanItemCount`).
 *   approved                  → a done note; editing the artifact confirms it
 *       re-derives N downstream stages (the backend reopens downstream - the FE
 *       just confirms the cascade).
 *
 * AI-OPTIONAL invariant: every stage is completable with ZERO AI. The manual
 * author → submit → approve path is always reachable, and when Athena AI is
 * unavailable (an `error` SSE event with code `ai_unavailable`) the manual
 * affordance is promoted to primary with an explanatory note.
 */

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  MessageCircleQuestion,
  PenLine,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import {
  ApiError,
  api,
  type ModelSelection,
  type StageRunInput,
  type TaskStage,
  type ThreadInputRequest,
} from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Cluster, Stack } from "@/components/layout/primitives";
import { ContextChips } from "@/components/work/context-chips";
import { EffortSelector } from "@/components/ui/effort-selector";
import { ModelSelector } from "@/components/ui/model-selector";
import { useEnabledModels } from "@/hooks/use-enabled-models";
import { restoreModelSelection, storeModel, usePersistedEffort } from "@/lib/prefs/run-prefs";
import { cn } from "@/lib/cn";

export function StageActions({
  taskId,
  stage,
  /** Count of downstream stages re-derived when an approved artifact is edited
   *  (the versioning cascade - derived from the rail position). */
  downstreamCount,
  /** True when an `error` SSE event with an AI-unavailable code has landed -
   *  promotes the manual path and shows the "do it manually" guidance. */
  aiUnavailable,
  aiUnavailableMessage,
  /** Called after any mutation so the page re-fetches the stage + artifact. */
  onChanged,
  /** Called the moment a run is accepted (202) so the cockpit can optimistically
   *  flip the stage to "running" - the worker claims a beat later and SSE
   *  reconciles, but the CTA shouldn't sit at "not started" in the meantime. */
  onStarted,
}: {
  taskId: string;
  stage: TaskStage;
  downstreamCount: number;
  aiUnavailable?: boolean;
  aiUnavailableMessage?: string;
  onChanged: () => void | Promise<void>;
  onStarted?: () => void;
}) {
  const [busy, setBusy] = useState<
    null | "run" | "approve" | "reject" | "manual" | "stop" | "reopen"
  >(null);
  const [reopenConfirmOpen, setReopenConfirmOpen] = useState(false);
  const [steer, setSteer] = useState("");
  const [note, setNote] = useState("");
  // How hard Athena works this run (tool budget + subagent policy). Flow content,
  // not plumbing - always shown next to Run; defaults to a balanced middle and
  // the pick is remembered across refreshes (run-prefs, task scope).
  const [effort, setEffort] = usePersistedEffort("task");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualBody, setManualBody] = useState("");
  // Inline validation error for the manual editor (subtask_plan shape check) -
  // cleared the moment the body changes so it never sticks to a fixed draft.
  const [manualError, setManualError] = useState<string | null>(null);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);

  const onManualChange = (v: string) => {
    setManualBody(v);
    if (manualError) setManualError(null);
  };

  // Per-action model pick (the locked "model per AI action" design). Defaults to
  // the org's first enabled model; null falls back to the action default server-
  // side, so a run never depends on a selection.
  const { models } = useEnabledModels();
  // Model choice is plumbing, not flow content - only worth a control when there
  // is an actual choice to make (>1 enabled model). With 0–1 it's hidden and the
  // run uses the org/action default (INT-4 / VIS).
  const enabledModels = models.filter((m) => m.enabled);
  const [model, setModel] = useState<ModelSelection | null>(null);
  useEffect(() => {
    if (model !== null) return;
    // The remembered pick wins when it's still offered (same rung); otherwise
    // the org's first enabled model.
    const restored = restoreModelSelection("task", models);
    if (restored) {
      setModel(restored);
      return;
    }
    const first = models.find((m) => m.enabled);
    if (first) setModel({ provider: first.provider, model: first.id, source: first.source });
  }, [models, model]);

  const status = stage.status;

  // The decompose plan gate is consequence-explicit: approving materializes the
  // plan into real tasks + dependency edges, so the approve CTA and toast say
  // so. The count comes from the working plan body via the existing artifact
  // endpoint (label-only - a fetch/parse failure just falls back to the
  // countless copy, never blocks the gate).
  const isSubtaskPlan = stage.artifact_kind === "subtask_plan";
  const [planCount, setPlanCount] = useState<number | null>(null);
  useEffect(() => {
    if (!isSubtaskPlan || status !== "in_review" || !stage.artifact_id) {
      setPlanCount(null);
      return;
    }
    let cancelled = false;
    void api.tasks
      .artifact(taskId, stage.artifact_id)
      .then((detail) => {
        if (!cancelled) setPlanCount(subtaskPlanItemCount(detail.body));
      })
      .catch(() => {
        /* countless label fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [isSubtaskPlan, status, taskId, stage.artifact_id]);

  // The diff gate goes consequence-explicit too when the change declares a
  // NEW repository - the artifact body carries the backend's banner line
  // ("Approving this gate CREATES the … repository owner/name …"); approving
  // creates that repo on GitHub at raise_pr, so the CTA must say so. Same
  // label-only enrichment contract as the plan count above.
  const isDiffGate = stage.artifact_kind === "diff_set";
  const [newRepoName, setNewRepoName] = useState<string | null>(null);
  useEffect(() => {
    if (!isDiffGate || status !== "in_review" || !stage.artifact_id) {
      setNewRepoName(null);
      return;
    }
    let cancelled = false;
    void api.tasks
      .artifact(taskId, stage.artifact_id)
      .then((detail) => {
        if (!cancelled) setNewRepoName(newRepoFromDiffBody(detail.body));
      })
      .catch(() => {
        /* label-only enrichment */
      });
    return () => {
      cancelled = true;
    };
  }, [isDiffGate, status, taskId, stage.artifact_id]);

  const runWithAthena = async () => {
    setBusy("run");
    try {
      const body: StageRunInput = {
        effort,
        ...(steer.trim() ? { steer: steer.trim() } : {}),
        ...(model ? { model_provider: model.provider, model_id: model.model } : {}),
        ...(model?.source && model.source !== "subscription"
          ? { model_source: model.source }
          : {}),
      };
      await api.tasks.runStage(taskId, stage.stage_key, body);
      toast.success("Athena is on it - watch the work log.");
      setSteer("");
      onStarted?.();
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't start the run.");
    } finally {
      setBusy(null);
    }
  };

  const stopRun = async () => {
    setBusy("stop");
    try {
      await api.tasks.stopStage(taskId, stage.stage_key);
      toast.success("Stopping Athena - it wraps up at the next step.");
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't stop the run.");
    } finally {
      setBusy(null);
    }
  };

  const submitManual = async () => {
    if (!manualBody.trim()) {
      toast.error("Write the artifact first.");
      return;
    }
    // The decompose plan is structured JSON the approve gate materializes into
    // real tasks - a malformed body would degrade the plan render to raw text.
    // Validate the shape client-side before it ever reaches the artifact.
    if (isSubtaskPlan && subtaskPlanItemCount(manualBody) === null) {
      setManualError(SUBTASK_PLAN_EDIT_ERROR);
      return;
    }
    setManualError(null);
    setBusy("manual");
    try {
      await api.tasks.authorArtifact(taskId, stage.stage_key, { body: manualBody.trim() });
      await api.tasks.submitStage(taskId, stage.stage_key);
      toast.success("Saved your work and submitted the stage.");
      setManualOpen(false);
      setManualBody("");
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save your work.");
    } finally {
      setBusy(null);
    }
  };

  const reopenStage = async () => {
    setBusy("reopen");
    try {
      await api.tasks.reopenStage(taskId, stage.stage_key);
      toast.success(
        "Stage reopened - run it again or edit it; it goes through the gate again.",
      );
      setReopenConfirmOpen(false);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't reopen the stage.");
    } finally {
      setBusy(null);
    }
  };

  const gate = async (decision: "approve" | "reject") => {
    setBusy(decision === "approve" ? "approve" : "reject");
    try {
      await api.tasks.gateStage(taskId, stage.stage_key, {
        decision,
        note: note.trim() || null,
      });
      toast.success(
        decision === "approve"
          ? isSubtaskPlan
            ? "Approved - the subtasks are created and on the board."
            : "Approved - the next stage unlocks."
          : "Sent back with your note.",
      );
      setNote("");
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't record your decision.");
    } finally {
      setBusy(null);
    }
  };

  // ── locked ────────────────────────────────────────────────────────────────
  if (status === "locked") {
    return (
      <Card>
        <p className="text-sm text-[var(--text-muted)]">
          Locked - Athena works each step in order, and you gate every one. This stage unlocks
          when the previous one is approved.
        </p>
      </Card>
    );
  }

  // ── running (Athena is working - with a Stop control) ──────────────────────
  if (status === "running") {
    return (
      <Card>
        <Stack gap="2.5">
          <Cluster gap="2" align="center" className="flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text)]">
              <Sparkles className="size-3.5 animate-pulse text-[var(--primary)]" aria-hidden />
              Athena is working…
            </span>
            <Button
              size="sm"
              variant="outline"
              loading={busy === "stop"}
              disabled={busy !== null}
              onClick={() => void stopRun()}
            >
              {busy !== "stop" && <Square className="size-3.5 fill-current" />}
              {busy === "stop" ? "Stopping…" : "Stop Athena"}
            </Button>
          </Cluster>
          <p className="text-sm text-[var(--text-muted)]">
            Every step shows up in the work log below. Stopping keeps the task -
            the step reopens so you can re-run it or finish it by hand.
          </p>
        </Stack>
      </Card>
    );
  }

  // ── waiting (the clarify checkpoint - Athena asked you questions) ──────────
  if (status === "waiting") {
    return (
      <ClarifyCard
        taskId={taskId}
        stage={stage}
        {...(onStarted ? { onStarted } : {})}
        onChanged={onChanged}
      />
    );
  }

  // ── in_review (the human gate) ──────────────────────────────────────────---
  if (status === "in_review") {
    // Consequence-explicit copy on the decompose plan gate - approving CREATES
    // the subtasks, so the CTA never says a generic "advance".
    const approveLabel = isSubtaskPlan
      ? planCount === null
        ? "Approve - create the subtasks"
        : planCount === 1
          ? "Approve - create this task"
          : `Approve - create these ${planCount} tasks`
      : newRepoName
        ? `Approve - create ${newRepoName}`
        : "Approve & advance";
    return (
      // The cockpit's ONE accented card (VIS-2): neutral surface + amber left
      // edge + the small "Your call" chip - never a full warning wash.
      <Card variant="elevated" className="border-l-4 border-l-[var(--warning)]">
        <Stack gap="3">
          <Cluster gap="2" align="center">
            <span className="rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--warning-ink)]">
              Your call
            </span>
            <span className="text-sm font-semibold">
              Review the {stage.title}
            </span>
          </Cluster>
          <p className="text-sm text-[var(--text-muted)]">
            Athena pauses here. Read it, edit if needed, then approve to unlock the next step - or
            send it back with a note. Either way it&apos;s logged on the task.
          </p>
          {newRepoName && (
            <p
              data-testid="gate-new-repo-note"
              className="text-sm font-medium text-[var(--warning-ink)]"
            >
              Approving creates the repository{" "}
              <span className="font-mono">{newRepoName}</span> on GitHub and
              opens the PR there.
            </p>
          )}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note / steer… (e.g. “ok, but cap the window at one cycle”)"
            className="min-h-[64px] w-full resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
          <Cluster gap="2">
            <Button
              size="sm"
              loading={busy === "approve"}
              disabled={busy !== null}
              onClick={() => void gate("approve")}
            >
              <CheckCircle2 className="size-3.5" />
              {approveLabel}
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={busy === "reject"}
              disabled={busy !== null}
              onClick={() => void gate("reject")}
            >
              <RotateCcw className="size-3.5" />
              Request changes
            </Button>
          </Cluster>
        </Stack>
      </Card>
    );
  }

  // ── approved ────────────────────────────────────────────────────────────--
  if (status === "approved") {
    // Done work recedes (VIS-2): a calm neutral card with a green left-edge -
    // not a full success-soft block competing for the eye.
    return (
      <Card className="border-l-4 border-l-[var(--success)]">
        <Stack gap="2.5">
          <Cluster gap="2" align="center">
            <CheckCircle2 className="size-4 text-[var(--success-ink)]" aria-hidden />
            <span className="text-sm font-semibold">
              Approved - recorded as a decision. The next step is unlocked.
            </span>
          </Cluster>
          <p className="text-sm text-[var(--text-muted)]">
            You can still change this - edit the artifact directly, or reopen the stage to run
            the whole step again. Either way, what depends on it re-derives.
          </p>
          {reopenConfirmOpen ? (
            <Card className="border-l-4 border-l-[var(--warning)]">
              <Stack gap="2.5">
                <Cluster gap="2" align="center">
                  <AlertTriangle className="size-4 text-[var(--warning-ink)]" aria-hidden />
                  <span className="text-sm font-semibold">
                    {downstreamCount > 0
                      ? `Reopen this stage? ${downstreamCount} downstream stage${
                          downstreamCount === 1 ? "" : "s"
                        } re-derive too.`
                      : "Reopen this stage?"}
                  </span>
                </Cluster>
                <p className="text-xs text-[var(--text-muted)]">
                  The stage goes back to Ready - re-run it with Athena or edit it yourself, then
                  it passes the gate again. The current artifact and its history stay intact.
                </p>
                <Cluster gap="2">
                  <Button
                    size="sm"
                    loading={busy === "reopen"}
                    disabled={busy !== null}
                    onClick={() => void reopenStage()}
                  >
                    <RotateCcw className="size-3.5" />
                    Reopen stage
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy !== null}
                    onClick={() => setReopenConfirmOpen(false)}
                  >
                    Cancel
                  </Button>
                </Cluster>
              </Stack>
            </Card>
          ) : editConfirmOpen ? (
            <Card className="border-l-4 border-l-[var(--warning)]">
              <Stack gap="2.5">
                <Cluster gap="2" align="center">
                  <AlertTriangle className="size-4 text-[var(--warning-ink)]" aria-hidden />
                  <span className="text-sm font-semibold">
                    {downstreamCount > 0
                      ? `Editing this re-derives ${downstreamCount} downstream stage${
                          downstreamCount === 1 ? "" : "s"
                        } - continue?`
                      : "Edit this approved artifact - continue?"}
                  </span>
                </Cluster>
                <p className="text-xs text-[var(--text-muted)]">
                  Athena reopens and re-runs the downstream stages into new versions. Old versions
                  stay in the history; the AI only ever uses the latest working version.
                </p>
                <ManualEditor
                  value={manualBody}
                  onChange={onManualChange}
                  placeholder="Edit the artifact body…"
                />
                {manualError && (
                  <p
                    role="alert"
                    className="rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]"
                  >
                    {manualError}
                  </p>
                )}
                <Cluster gap="2">
                  <Button
                    size="sm"
                    loading={busy === "manual"}
                    disabled={busy !== null}
                    onClick={() => void submitManual()}
                  >
                    <Send className="size-3.5" />
                    Save &amp; re-derive
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy !== null}
                    onClick={() => setEditConfirmOpen(false)}
                  >
                    Cancel
                  </Button>
                </Cluster>
              </Stack>
            </Card>
          ) : (
            <Cluster gap="2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditConfirmOpen(true);
                  setManualBody("");
                  setManualError(null);
                }}
              >
                <PenLine className="size-3.5" />
                Edit this stage
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setReopenConfirmOpen(true)}
              >
                <RotateCcw className="size-3.5" />
                Reopen stage
              </Button>
            </Cluster>
          )}
        </Stack>
      </Card>
    );
  }

  // ── ready | failed | rejected - the "run or do it manually" state ──────────
  const isRetry = status === "failed" || status === "rejected";
  const runLabel = isRetry ? "Re-run with Athena" : "Run with Athena";

  return (
    <Card variant="elevated">
      <Stack gap="3">
        {isRetry && (
          <Cluster gap="2" align="center">
            <XCircle className="size-4 text-[var(--danger-ink)]" aria-hidden />
            <span className="text-sm font-semibold">
              {status === "failed" ? "This stage didn't finish." : "Sent back for changes."}{" "}
              Run it again, or do it manually.
            </span>
          </Cluster>
        )}

        {aiUnavailable && (
          <Card className="border-l-4 border-l-[var(--warning)]">
            <Cluster gap="2" align="start">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--warning-ink)]" aria-hidden />
              <Stack gap="0.5">
                <span className="text-sm font-semibold">
                  Athena AI is unavailable - you can do this step manually.
                </span>
                {aiUnavailableMessage && (
                  <span className="text-xs text-[var(--text-muted)]">{aiUnavailableMessage}</span>
                )}
              </Stack>
            </Cluster>
          </Card>
        )}

        {!manualOpen && (
          <>
            <p className="text-sm text-[var(--text-muted)]">
              Athena does the legwork and pauses at the gate for your call - or do this step
              yourself. This task never depends on AI.
            </p>
            {!aiUnavailable && (
              // Exactly what the agent's brief will carry - spot a gap, add it
              // as a steer below BEFORE burning a run.
              <ContextChips taskId={taskId} stageKey={stage.stage_key} />
            )}
            {!aiUnavailable && (
              <textarea
                value={steer}
                onChange={(e) => setSteer(e.target.value)}
                placeholder="Optional - steer Athena before it starts: constraints, a link, what to focus on or avoid…"
                className="min-h-[56px] w-full resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
            )}
            <Cluster gap="2" align="center">
              {!aiUnavailable && (
                <Button
                  size="sm"
                  loading={busy === "run"}
                  disabled={busy !== null}
                  onClick={() => void runWithAthena()}
                >
                  <Sparkles className="size-3.5" />
                  {runLabel}
                </Button>
              )}
              {!aiUnavailable && (
                <EffortSelector
                  value={effort}
                  onChange={setEffort}
                  disabled={busy !== null}
                />
              )}
              {!aiUnavailable && enabledModels.length > 1 && (
                <ModelSelector
                  models={models}
                  value={model}
                  onChange={(m) => {
                    setModel(m);
                    storeModel("task", m);
                  }}
                  disabled={busy !== null}
                />
              )}
              <Button
                size="sm"
                variant={aiUnavailable ? "primary" : "ghost"}
                disabled={busy !== null}
                onClick={() => {
                  setManualOpen(true);
                  setManualBody("");
                  setManualError(null);
                }}
              >
                <PenLine className="size-3.5" />
                Do it manually
              </Button>
            </Cluster>
          </>
        )}

        {manualOpen && (
          <Stack gap="2.5">
            <span className="text-sm font-semibold">Author the {stage.title} yourself</span>
            <p className="text-xs text-[var(--text-muted)]">
              Write the artifact body. Saving submits the stage - a hard gate then waits for
              sign-off; a soft gate advances automatically.
            </p>
            <ManualEditor
              value={manualBody}
              onChange={onManualChange}
              placeholder="Write the artifact… (markdown; kn:// and repo:// refs become citations)"
            />
            {manualError && (
              <p
                role="alert"
                className="rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]"
              >
                {manualError}
              </p>
            )}
            <Cluster gap="2">
              <Button
                size="sm"
                loading={busy === "manual"}
                disabled={busy !== null}
                onClick={() => void submitManual()}
              >
                <Send className="size-3.5" />
                Save &amp; submit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() => setManualOpen(false)}
              >
                Cancel
              </Button>
            </Cluster>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

// --------------------------------------------------------------------------- //
// ClarifyCard - the clarify checkpoint (stage status `waiting`)                //
// --------------------------------------------------------------------------- //

/** Athena paused mid-stage on batched clarifying questions. Renders the
 *  questions with one answer box each; "Send answers & resume" posts the
 *  combined answers to the pending `input_request` - the backend folds them
 *  into the brief, flips the stage back to ready, and re-enqueues the run
 *  (one explicit click is both the answer and the start signal). */
function ClarifyCard({
  taskId,
  stage,
  onStarted,
  onChanged,
}: {
  taskId: string;
  stage: TaskStage;
  onStarted?: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const [request, setRequest] = useState<ThreadInputRequest | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [answers, setAnswers] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api.tasks
      .thread(taskId)
      .then((entries) => {
        if (cancelled) return;
        const pending = entries.find(
          (e) =>
            e.kind === "input_request" &&
            e.status === "pending" &&
            e.input_request?.question_kind === "clarification" &&
            e.input_request?.stage === stage.stage_key,
        );
        setRequest(pending?.input_request ?? null);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [taskId, stage.stage_key, stage.gate_input_id]);

  const questions =
    request?.questions && request.questions.length > 0
      ? request.questions
      : request?.question
        ? [request.question]
        : [];

  const send = async () => {
    if (!request) return;
    if (answers.every((a) => !a?.trim())) {
      toast.error("Answer at least one question first.");
      return;
    }
    setSending(true);
    try {
      const combined = questions
        .map((q, i) => `Q: ${q}\nA: ${answers[i]?.trim() || "(no answer - use your judgment)"}`)
        .join("\n\n");
      await api.tasks.answerInput(taskId, request.request_id, {
        request_id: request.request_id,
        free_text: combined,
      });
      toast.success("Answers sent - Athena resumes with them.");
      onStarted?.();
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't send your answers.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card variant="elevated" className="border-l-4 border-l-[var(--warning)]">
      <Stack gap="3">
        <Cluster gap="2" align="center">
          <span className="rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--warning-ink)]">
            Your answers
          </span>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <MessageCircleQuestion className="size-4 text-[var(--warning-ink)]" aria-hidden />
            Athena needs a steer before the {stage.title}
          </span>
        </Cluster>
        <p className="text-sm text-[var(--text-muted)]">
          The investigation is done and saved - these answers shape the deliverable.
          Athena resumes with them the moment you send (nothing is redone).
        </p>
        {!loaded ? (
          <div className="h-16 animate-pulse rounded-md bg-[var(--surface-2)]" aria-hidden />
        ) : questions.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            The question round was withdrawn or already answered - re-run the stage from the
            rail, or wait for the panel to refresh.
          </p>
        ) : (
          <Stack gap="2.5">
            {questions.map((q, i) => (
              <Stack key={`${i}-${q.slice(0, 24)}`} gap="1">
                <span className="text-sm font-medium text-[var(--text)]">
                  {questions.length > 1 ? `${i + 1}. ` : ""}
                  {q}
                </span>
                <textarea
                  value={answers[i] ?? ""}
                  onChange={(e) =>
                    setAnswers((prev) => {
                      const next = [...prev];
                      next[i] = e.target.value;
                      return next;
                    })
                  }
                  placeholder="Your answer… (leave blank to let Athena use its judgment)"
                  className="min-h-[48px] w-full resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
              </Stack>
            ))}
            <Cluster gap="2">
              <Button size="sm" loading={sending} disabled={sending} onClick={() => void send()}>
                <Send className="size-3.5" />
                Send answers &amp; resume Athena
              </Button>
            </Cluster>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

/** Shared plain-textarea editor for the manual authoring path (no rich editor
 *  dependency on the bundle - the body is plain markdown). */
function ManualEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "min-h-[160px] w-full resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2",
        "font-mono text-sm leading-relaxed text-[var(--text)] placeholder:text-[var(--text-subtle)]",
        "focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]",
      )}
    />
  );
}

// --------------------------------------------------------------------------- //
// subtask_plan helpers (the decompose gate)                                    //
// --------------------------------------------------------------------------- //

/** Inline validation message for a hand-edited decompose plan. */
const SUBTASK_PLAN_EDIT_ERROR =
  "The plan must be JSON with an items array - each item needs a title.";

/** Parse a `subtask_plan` body - `{ items: [...] }` where every item is an
 *  object with a non-empty `title` string (the shape `SubtaskPlanView` renders
 *  and the approve gate materializes). Returns the number of tasks approval
 *  would create, or null when the body is not a valid plan (the approve CTA
 *  falls back to countless copy; the manual editor shows
 *  `SUBTASK_PLAN_EDIT_ERROR` instead of submitting). */
export function subtaskPlanItemCount(body: string): number | null {
  try {
    const items = (JSON.parse(body) as { items?: unknown } | null)?.items;
    if (!Array.isArray(items) || items.length === 0) return null;
    const valid = items.every(
      (it: unknown) =>
        typeof it === "object" &&
        it !== null &&
        typeof (it as { title?: unknown }).title === "string" &&
        (it as { title: string }).title.trim().length > 0,
    );
    return valid ? items.length : null;
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------- //
// diff_set helper (the code-review gate)                                       //
// --------------------------------------------------------------------------- //

/** A diff_set whose approval CREATES a repository starts with the backend's
 *  banner line (`new_repo_banner` - BE↔FE contract): extract the
 *  `owner/name` so the gate card + approve CTA go consequence-explicit.
 *  Returns null for a plain diff. */
export function newRepoFromDiffBody(body: string): string | null {
  const m =
    /^Approving this gate CREATES the (?:private|PUBLIC) repository (\S+)/.exec(
      body,
    );
  return m?.[1] ?? null;
}
