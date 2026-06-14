"use client";

/**
 * StageComposer - the one chat-style action surface at the foot of a stage's
 * conversation. It replaces the old multi-card `StageActions`: every state of
 * the stage FSM resolves to ONE composer (a bordered card with an input on top
 * and a controls row underneath, mirroring the chat composer), so running,
 * steering, approving, and requesting changes all happen in the same place with
 * a single click - never a second box to re-type into.
 *
 *   ready | failed | rejected → "Run with Athena" (optional steer) + a quiet
 *       "Do it manually" path. A stage sent back shows the reviewer's note as a
 *       read-only chip (it is already folded into the next run server-side via
 *       the gate-feedback channel) - it is NOT pre-filled into the steer box,
 *       which is what used to double-post it to the thread and double-count it
 *       in the brief.
 *   running   → a live "Athena is working" row with Stop.
 *   waiting   → the clarify checkpoint (batched questions + answers).
 *   in_review → ONE composer: type an optional note, then Approve & advance OR
 *       Request changes (the same note rides the reject). The decompose plan and
 *       new-repo diff gates stay consequence-explicit.
 *   approved  → a calm settled bar (reopen the whole step; edit the deliverable
 *       above to revise it, which re-derives downstream).
 *
 * AI-OPTIONAL invariant: every stage is completable with ZERO AI. The manual
 * author path is always reachable, and when Athena AI is unavailable
 * (`ai_unavailable`) it is promoted to primary with an explanatory note.
 */

import { useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CornerUpLeft,
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
  type ClarifyAnswerItem,
  type ClarifyQuestion,
  type ModelSelection,
  type StageRunInput,
  type TaskStage,
  type ThreadInputRequest,
} from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AttachmentButton, AttachmentChips, useAttachmentDrafts } from "@/components/ui/attachment-picker";
import { Cluster, Stack } from "@/components/layout/primitives";
import { ContextChips } from "@/components/work/context-chips";
import { EffortSelector } from "@/components/ui/effort-selector";
import { ModelSelector } from "@/components/ui/model-selector";
import { useEnabledModels } from "@/hooks/use-enabled-models";
import { restoreModelSelection, storeModel, usePersistedEffort } from "@/lib/prefs/run-prefs";
import {
  SUBTASK_PLAN_EDIT_ERROR,
  newRepoFromDiffBody,
  subtaskPlanItemCount,
} from "@/lib/work/subtask-plan";
import { cn } from "@/lib/cn";

export function StageComposer({
  taskId,
  stage,
  /** Count of downstream stages re-derived when an approved artifact is edited
   *  (drives the reopen confirm copy). */
  downstreamCount,
  /** True when an `ai_unavailable` error SSE has landed - promotes the manual
   *  path and shows the guidance. */
  aiUnavailable,
  aiUnavailableMessage,
  /** Re-fetch the stage + artifact after any mutation. */
  onChanged,
  /** After a gate APPROVAL - lets the cockpit advance the reviewer. */
  onApproved,
  /** The moment a run is accepted (202) - optimistic "running". */
  onStarted,
  /** The note from the most recent "request changes" on this stage. Shown
   *  read-only (the backend already folds it into the next run) - never
   *  pre-filled into the steer box. */
  priorRequest,
  /** Called when a gate decision 409s ("this stage isn't awaiting review") - the
   *  displayed `in_review` is stale (already resolved / SSE drift), so the page
   *  stops trusting the live status for this stage and reconciles to the fetch. */
  onStaleGate,
}: {
  taskId: string;
  stage: TaskStage;
  downstreamCount: number;
  aiUnavailable?: boolean;
  aiUnavailableMessage?: string;
  onChanged: () => void | Promise<void>;
  onApproved?: () => void | Promise<void>;
  onStarted?: () => void;
  priorRequest?: string | null;
  onStaleGate?: (stageKey: string) => void;
}) {
  const [busy, setBusy] = useState<
    null | "run" | "approve" | "reject" | "manual" | "stop" | "reopen"
  >(null);
  const [reopenConfirmOpen, setReopenConfirmOpen] = useState(false);
  const [steer, setSteer] = useState("");
  const [note, setNote] = useState("");
  // How hard Athena works this run (tool budget + subagent policy). Flow
  // content, not plumbing - always shown next to Run; balanced default,
  // remembered across refreshes (run-prefs, task scope).
  const [effort, setEffort] = usePersistedEffort("task");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualBody, setManualBody] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  const onManualChange = (v: string) => {
    setManualBody(v);
    if (manualError) setManualError(null);
  };

  // Per-action model pick. Defaults to the org's first enabled model; null
  // falls back to the action default server-side, so a run never depends on a
  // selection. Hidden when there's no real choice (0-1 enabled models).
  const { models } = useEnabledModels();
  const enabledModels = models.filter((m) => m.enabled);
  const [model, setModel] = useState<ModelSelection | null>(null);
  // Images only when the picked run model supports vision; documents always.
  const runSpec = model
    ? models.find((mm) => mm.provider === model.provider && mm.id === model.model)
    : undefined;
  const canAttachImages = runSpec?.supports_vision ?? false;
  const {
    addFiles: addSteerFiles,
    remove: removeSteerFile,
    clear: clearSteerFiles,
    drafts: steerDrafts,
    readyIds: steerReadyIds,
    pending: steerPending,
    hasReadyImage: steerHasImage,
  } = useAttachmentDrafts({ canAttachImages });
  useEffect(() => {
    if (model !== null) return;
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
  // plan into real tasks + dependency edges. The count comes from the working
  // plan body (label-only - a fetch/parse failure falls back to countless copy).
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

  // The diff gate goes consequence-explicit when the change declares a NEW
  // repository (the artifact body carries the backend's banner line).
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
        ...(steerReadyIds.length ? { attachment_ids: steerReadyIds } : {}),
      };
      await api.tasks.runStage(taskId, stage.stage_key, body);
      toast.success("Athena is on it - watch the work above.");
      setSteer("");
      clearSteerFiles();
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
      if (decision === "approve") {
        const isLastStage = downstreamCount === 0;
        toast.success(
          isSubtaskPlan
            ? "Approved - the subtasks are created and on the board."
            : isLastStage
              ? "Approved - task complete."
              : "Approved - the next stage unlocks.",
        );
        setNote("");
        await onChanged();
        await onApproved?.();
        return;
      }
      // Request changes is ONE click: the note is recorded (and folded into the
      // next run via the gate-feedback channel server-side), then Athena re-runs
      // immediately with it - no second "Run" click, no re-typing. When AI is
      // unavailable it just drops back to Ready for a manual redo.
      if (!aiUnavailable) {
        await api.tasks.runStage(taskId, stage.stage_key, {
          effort,
          ...(model ? { model_provider: model.provider, model_id: model.model } : {}),
          ...(model?.source && model.source !== "subscription"
            ? { model_source: model.source }
            : {}),
        });
        toast.success("Changes requested - Athena is redoing it with your note.");
        onStarted?.();
      } else {
        toast.success("Changes requested - the stage is back to Ready to redo by hand.");
      }
      setNote("");
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't record your decision.");
      // A 409 means the displayed gate is stale (already resolved / SSE drift) -
      // tell the page to stop trusting the live status for this stage and refetch
      // so it reconciles instead of leaving a dead button the user keeps clicking.
      if (e instanceof ApiError && e.status === 409) {
        onStaleGate?.(stage.stage_key);
        await onChanged();
      }
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

  // ── running ────────────────────────────────────────────────────────────────
  if (status === "running") {
    return (
      <Card variant="elevated">
        <Cluster gap="2" align="center" justify="between" className="flex-wrap">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text)]">
            <Sparkles className="size-4 animate-pulse text-[var(--primary)]" aria-hidden />
            Athena is working - every step shows up above.
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
      </Card>
    );
  }

  // ── waiting (the clarify checkpoint) ────────────────────────────────────────
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

  // ── in_review (the human gate) - ONE composer, single click ─────────────────
  if (status === "in_review") {
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
          <Cluster gap="2" align="center" className="flex-wrap">
            <span className="rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--warning-ink)]">
              Your call
            </span>
            <span className="text-sm font-semibold">Review the {stage.title}</span>
            <span className="text-sm text-[var(--text-muted)]">
              {aiUnavailable
                ? "Approve it, or send it back - one click."
                : "Approve it, or request changes and Athena redoes it with your note - one click either way."}
            </span>
          </Cluster>
          {newRepoName && (
            <p
              data-testid="gate-new-repo-note"
              className="text-sm font-medium text-[var(--warning-ink)]"
            >
              Approving creates the repository{" "}
              <span className="font-mono">{newRepoName}</span> on GitHub and opens the PR there.
            </p>
          )}
          <ComposerInput
            value={note}
            onChange={setNote}
            placeholder={
              aiUnavailable
                ? "Add a note, or describe the change you want… (optional)"
                : "Describe the change you want - Request changes sends it back and re-runs Athena with it… (optional)"
            }
            controls={
              <>
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
                {!aiUnavailable && (
                  <EffortSelector value={effort} onChange={setEffort} disabled={busy !== null} />
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
              </>
            }
          />
        </Stack>
      </Card>
    );
  }

  // ── approved ────────────────────────────────────────────────────────────────
  if (status === "approved") {
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
            Need a change? Edit the deliverable above - what depends on it re-derives. Or reopen
            the whole step to run it again.
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
          ) : (
            <Cluster gap="2">
              <Button size="sm" variant="outline" onClick={() => setReopenConfirmOpen(true)}>
                <RotateCcw className="size-3.5" />
                Reopen stage
              </Button>
            </Cluster>
          )}
        </Stack>
      </Card>
    );
  }

  // ── ready | failed | rejected - the "run or do it manually" state ───────────
  // A gate "request changes" returns the stage to `ready` (not `rejected`), so a
  // pending prior request is what tells us it was sent back - the CTA reads
  // "Re-run" and the note shows as a read-only chip (already folded into the
  // brief server-side; NEVER pre-filled into the steer box).
  const wasSentBack = !!priorRequest?.trim();
  const isRetry = status === "failed" || status === "rejected" || wasSentBack;
  const runLabel = isRetry ? "Re-run with Athena" : "Run with Athena";

  // Manual author takes over the whole composer when open.
  if (manualOpen) {
    return (
      <Card variant="elevated">
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
      </Card>
    );
  }

  return (
    <Card variant="elevated">
      <Stack gap="3">
        {isRetry && (
          <Cluster gap="2" align="start">
            {status === "failed" ? (
              <XCircle className="mt-0.5 size-4 shrink-0 text-[var(--danger-ink)]" aria-hidden />
            ) : (
              <CornerUpLeft className="mt-0.5 size-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
            )}
            <Stack gap="0.5" className="min-w-0">
              <span className="text-sm font-semibold">
                {status === "failed" ? "This stage didn't finish." : "Sent back for changes."}{" "}
                Run it again, or do it manually.
              </span>
              {wasSentBack && (
                <span className="text-xs text-[var(--text-muted)]">
                  <span className="font-medium text-[var(--text)]">Requested:</span>{" "}
                  {priorRequest}
                  <span className="text-[var(--text-subtle)]">
                    {" "}
                    · Athena folds this into the next run automatically - just hit Re-run.
                  </span>
                </span>
              )}
            </Stack>
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

        {!aiUnavailable && (
          // Exactly what the agent's brief will carry - spot a gap, add it as a
          // steer below BEFORE burning a run.
          <ContextChips taskId={taskId} stageKey={stage.stage_key} />
        )}

        {aiUnavailable ? (
          <Cluster gap="2" align="center">
            <Button
              size="sm"
              variant="primary"
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
        ) : (
          <ComposerInput
            value={steer}
            onChange={setSteer}
            attachmentBar={<AttachmentChips drafts={steerDrafts} onRemove={removeSteerFile} />}
            placeholder={
              isRetry
                ? "Add anything new for the re-run… (optional)"
                : "Steer Athena before it runs - constraints, a link, what to focus on or avoid… (optional)"
            }
            controls={
              <>
                <Button
                  size="sm"
                  loading={busy === "run"}
                  disabled={busy !== null || steerPending || (steerHasImage && !canAttachImages)}
                  title={
                    steerPending
                      ? "Waiting for uploads to finish…"
                      : steerHasImage && !canAttachImages
                        ? "This model can't read images - remove them or pick a vision model."
                        : undefined
                  }
                  onClick={() => void runWithAthena()}
                >
                  <Sparkles className="size-3.5" />
                  {runLabel}
                </Button>
                <AttachmentButton
                  onFiles={addSteerFiles}
                  canAttachImages={canAttachImages}
                  disabled={busy !== null}
                />
                <EffortSelector value={effort} onChange={setEffort} disabled={busy !== null} />
                {enabledModels.length > 1 && (
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
                  variant="ghost"
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
              </>
            }
          />
        )}
      </Stack>
    </Card>
  );
}

// --------------------------------------------------------------------------- //
// ComposerInput - the shared chat-style input frame                           //
// --------------------------------------------------------------------------- //

/** One bordered card: an auto-sizing textarea on top, a wrapping controls row
 *  underneath (the primary CTA + pickers / secondary actions). The single frame
 *  the run state and the gate state both render, so the whole stage flow reads
 *  as one composer. */
function ComposerInput({
  value,
  onChange,
  placeholder,
  controls,
  attachmentBar,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  controls: ReactNode;
  /** Attachment chips strip rendered above the textarea (inside the frame). */
  attachmentBar?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--border)] bg-[var(--surface)]",
        "transition-[border-color,box-shadow] duration-200 ease-out",
        "focus-within:border-[var(--border-accent)] focus-within:shadow-[var(--shadow-2)]",
        disabled && "opacity-60",
      )}
    >
      {attachmentBar}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        rows={2}
        className="input-bare max-h-[200px] min-h-[56px] w-full resize-y bg-transparent px-3.5 pb-1 pt-3 text-sm leading-relaxed text-[var(--text)] placeholder:text-[var(--text-subtle)] outline-none disabled:cursor-not-allowed"
      />
      <Cluster gap="2" align="center" className="flex-wrap px-2.5 pb-2.5 pt-1">
        {controls}
      </Cluster>
    </div>
  );
}

// --------------------------------------------------------------------------- //
// ClarifyCard - the clarify checkpoint (stage status `waiting`)                //
// --------------------------------------------------------------------------- //

/** Normalise a request to typed questions. New payloads carry `items`; older
 *  ones only had plain-string `questions`/`question` - coerce those to `text`. */
function clarifyItems(request: ThreadInputRequest | null): ClarifyQuestion[] {
  if (request?.items && request.items.length > 0) return request.items;
  const prompts =
    request?.questions && request.questions.length > 0
      ? request.questions
      : request?.question
        ? [request.question]
        : [];
  return prompts.map((prompt, i) => ({
    id: `q${i + 1}`,
    prompt,
    type: "text" as const,
  }));
}

/** Is a (required) question answered? Drives the send guard. */
function clarifyAnswered(q: ClarifyQuestion, a: ClarifyAnswerItem | undefined): boolean {
  if (!a) return false;
  switch (q.type) {
    case "single_select":
      return !!a.choice_id;
    case "multi_select":
      return !!a.choice_ids && a.choice_ids.length > 0;
    case "boolean":
      return a.boolean !== undefined;
    case "number":
      return a.numeric !== undefined && !Number.isNaN(a.numeric);
    default:
      return !!a.text && a.text.trim().length > 0;
  }
}

/** Athena paused mid-stage on batched clarifying questions. Renders one typed
 *  widget per question (choice / multi-choice / yes-no / number / text) and
 *  posts the structured answers to the pending `input_request` - the backend
 *  folds them into the brief, flips the stage back to ready, and re-enqueues. */
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
  const [answers, setAnswers] = useState<Record<string, ClarifyAnswerItem>>({});
  const [sending, setSending] = useState(false);
  // The resuming stage's model decides whether images are shown, so allow both
  // here; documents fold into the brief regardless.
  const {
    addFiles: addAnswerFiles,
    remove: removeAnswerFile,
    clear: clearAnswerFiles,
    drafts: answerDrafts,
    readyIds: answerReadyIds,
    pending: answerPending,
  } = useAttachmentDrafts({ canAttachImages: true });

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

  const items = clarifyItems(request);
  // Each widget owns exactly one value field, so it builds the COMPLETE answer
  // for its question (a full replace, not a merge) - clearing a number is then
  // just an item with no `numeric` key, never an explicit `undefined`.
  const setAnswer = (answer: ClarifyAnswerItem) =>
    setAnswers((prev) => ({ ...prev, [answer.question_id]: answer }));

  const send = async () => {
    if (!request) return;
    const missing = items.filter(
      (q) => q.required !== false && !clarifyAnswered(q, answers[q.id]),
    );
    if (missing.length > 0 && answerReadyIds.length === 0) {
      toast.error(
        `Please answer: ${missing.map((q) => q.prompt).join("; ")}`,
      );
      return;
    }
    setSending(true);
    try {
      const built = items
        .map((q) => answers[q.id])
        .filter((a): a is ClarifyAnswerItem => !!a);
      await api.tasks.answerInput(taskId, request.request_id, {
        request_id: request.request_id,
        answers: built,
        ...(answerReadyIds.length ? { attachment_ids: answerReadyIds } : {}),
      });
      toast.success("Answers sent - Athena resumes with them.");
      clearAnswerFiles();
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
        <Cluster gap="2" align="center" className="flex-wrap">
          <span className="rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--warning-ink)]">
            Your answers
          </span>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <MessageCircleQuestion className="size-4 text-[var(--warning-ink)]" aria-hidden />
            Athena needs a steer before the {stage.title}
          </span>
        </Cluster>
        <p className="text-sm text-[var(--text-muted)]">
          The investigation is done and saved - these answers shape the deliverable. Athena
          resumes with them the moment you send (nothing is redone).
        </p>
        {!loaded ? (
          <div className="h-16 animate-pulse rounded-md bg-[var(--surface-2)]" aria-hidden />
        ) : items.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            The question round was withdrawn or already answered - re-run the stage from the rail,
            or wait for the panel to refresh.
          </p>
        ) : (
          <Stack gap="3.5">
            {items.map((q, i) => (
              <Stack key={q.id} gap="1.5">
                <span className="text-sm font-medium text-[var(--text)]">
                  {items.length > 1 ? `${i + 1}. ` : ""}
                  {q.prompt}
                  {q.required === false ? (
                    <span className="ml-1 text-xs font-normal text-[var(--text-subtle)]">
                      (optional)
                    </span>
                  ) : null}
                </span>
                <ClarifyAnswerWidget
                  question={q}
                  answer={answers[q.id]}
                  onChange={setAnswer}
                />
              </Stack>
            ))}
            <AttachmentChips drafts={answerDrafts} onRemove={removeAnswerFile} />
            <Cluster gap="2" align="center">
              <Button
                size="sm"
                loading={sending}
                disabled={sending || answerPending}
                title={answerPending ? "Waiting for uploads to finish…" : undefined}
                onClick={() => void send()}
              >
                <Send className="size-3.5" />
                Send answers &amp; resume Athena
              </Button>
              <AttachmentButton onFiles={addAnswerFiles} canAttachImages />
            </Cluster>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

const RADIO_CHECK_CLASS = "size-4 shrink-0 accent-[var(--primary)]";
const CLARIFY_INPUT_CLASS =
  "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]";

/** One answer widget, picked by `question.type`. Each builds the COMPLETE
 *  `ClarifyAnswerItem` for its question (one value field set). */
function ClarifyAnswerWidget({
  question,
  answer,
  onChange,
}: {
  question: ClarifyQuestion;
  answer: ClarifyAnswerItem | undefined;
  onChange: (answer: ClarifyAnswerItem) => void;
}) {
  const id = question.id;
  const options = question.options ?? [];

  if (question.type === "single_select") {
    return (
      <Stack gap="1.5">
        {options.map((opt) => (
          <label
            key={opt.id}
            className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text)]"
          >
            <input
              type="radio"
              name={id}
              checked={answer?.choice_id === opt.id}
              onChange={() => onChange({ question_id: id, choice_id: opt.id })}
              className={RADIO_CHECK_CLASS}
            />
            {opt.label}
          </label>
        ))}
      </Stack>
    );
  }

  if (question.type === "multi_select") {
    const current = answer?.choice_ids ?? [];
    return (
      <Stack gap="1.5">
        {options.map((opt) => {
          const checked = current.includes(opt.id);
          return (
            <label
              key={opt.id}
              className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text)]"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  onChange({
                    question_id: id,
                    choice_ids: checked
                      ? current.filter((c) => c !== opt.id)
                      : [...current, opt.id],
                  })
                }
                className={RADIO_CHECK_CLASS}
              />
              {opt.label}
            </label>
          );
        })}
      </Stack>
    );
  }

  if (question.type === "boolean") {
    return (
      <Cluster gap="2">
        <Button
          size="sm"
          variant={answer?.boolean === true ? "primary" : "secondary"}
          onClick={() => onChange({ question_id: id, boolean: true })}
        >
          Yes
        </Button>
        <Button
          size="sm"
          variant={answer?.boolean === false ? "primary" : "secondary"}
          onClick={() => onChange({ question_id: id, boolean: false })}
        >
          No
        </Button>
      </Cluster>
    );
  }

  if (question.type === "number") {
    return (
      <input
        type="number"
        value={answer?.numeric ?? ""}
        onChange={(e) =>
          onChange(
            e.target.value === ""
              ? { question_id: id }
              : { question_id: id, numeric: Number(e.target.value) },
          )
        }
        placeholder="Enter a number…"
        className={CLARIFY_INPUT_CLASS}
      />
    );
  }

  return (
    <textarea
      value={answer?.text ?? ""}
      onChange={(e) => onChange({ question_id: id, text: e.target.value })}
      placeholder="Your answer…"
      className={cn(CLARIFY_INPUT_CLASS, "min-h-[48px] resize-y")}
    />
  );
}

/** Shared plain-textarea editor for the manual authoring path (no rich editor
 *  dependency - the body is plain markdown). */
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
