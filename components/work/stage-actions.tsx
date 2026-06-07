"use client";

/**
 * StageActions — the single clear next-action for the selected stage (per the
 * v4 mock: one primary CTA, never a wall of buttons). The CTA is derived from
 * the stage's FSM status:
 *
 *   ready | failed | rejected → "Run with Athena" (POST `api.tasks.runStage`,
 *       with optional pre-run steer text) + a secondary "Do it manually"
 *       affordance (an inline editor → `authorArtifact` then `submitStage`).
 *   running                   → disabled "Athena is working…".
 *   in_review                 → "Approve" / "Request changes"
 *       (`api.tasks.gateStage`, decision approve|reject + optional note).
 *   approved                  → a done note; editing the artifact confirms it
 *       re-derives N downstream stages (the backend reopens downstream — the FE
 *       just confirms the cascade).
 *
 * AI-OPTIONAL invariant: every stage is completable with ZERO AI. The manual
 * author → submit → approve path is always reachable, and when Athena AI is
 * unavailable (an `error` SSE event with code `ai_unavailable`) the manual
 * affordance is promoted to primary with an explanatory note.
 */

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  PenLine,
  RotateCcw,
  Send,
  Sparkles,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { ApiError, api, type TaskStage } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Cluster, Stack } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";

export function StageActions({
  taskId,
  stage,
  /** Count of downstream stages re-derived when an approved artifact is edited
   *  (the versioning cascade — derived from the rail position). */
  downstreamCount,
  /** True when an `error` SSE event with an AI-unavailable code has landed —
   *  promotes the manual path and shows the "do it manually" guidance. */
  aiUnavailable,
  aiUnavailableMessage,
  /** Called after any mutation so the page re-fetches the stage + artifact. */
  onChanged,
}: {
  taskId: string;
  stage: TaskStage;
  downstreamCount: number;
  aiUnavailable?: boolean;
  aiUnavailableMessage?: string;
  onChanged: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState<null | "run" | "approve" | "reject" | "manual">(null);
  const [steer, setSteer] = useState("");
  const [note, setNote] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualBody, setManualBody] = useState("");
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);

  const status = stage.status;

  const runWithAthena = async () => {
    setBusy("run");
    try {
      await api.tasks.runStage(taskId, stage.stage_key, steer.trim() ? { steer: steer.trim() } : undefined);
      toast.success("Athena is on it — watch the work log.");
      setSteer("");
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't start the run.");
    } finally {
      setBusy(null);
    }
  };

  const submitManual = async () => {
    if (!manualBody.trim()) {
      toast.error("Write the artifact first.");
      return;
    }
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

  const gate = async (decision: "approve" | "reject") => {
    setBusy(decision === "approve" ? "approve" : "reject");
    try {
      await api.tasks.gateStage(taskId, stage.stage_key, {
        decision,
        note: note.trim() || null,
      });
      toast.success(
        decision === "approve" ? "Approved — the next stage unlocks." : "Sent back with your note.",
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
          Locked — Athena works each step in order, and you gate every one. This stage unlocks
          when the previous one is approved.
        </p>
      </Card>
    );
  }

  // ── running ─────────────────────────────────────────────────────────────--
  if (status === "running") {
    return (
      <Card>
        <Cluster gap="2" align="center">
          <Button size="sm" disabled loading>
            Athena is working…
          </Button>
          <span className="text-sm text-[var(--text-muted)]">
            Every step shows up in the work log below.
          </span>
        </Cluster>
      </Card>
    );
  }

  // ── in_review (the human gate) ──────────────────────────────────────────---
  if (status === "in_review") {
    return (
      <Card variant="elevated" className="border-[var(--warning)] bg-[var(--warning-soft)]">
        <Stack gap="3">
          <Cluster gap="2" align="center">
            <span className="rounded-full bg-[var(--warning)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--warning-fg)]">
              Your call
            </span>
            <span className="text-sm font-semibold text-[var(--warning-ink)]">
              Review the {stage.title}
            </span>
          </Cluster>
          <p className="text-sm text-[var(--text-muted)]">
            Athena pauses here. Read it, edit if needed, then approve to unlock the next step — or
            send it back with a note. Either way it&apos;s logged on the task.
          </p>
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
              Approve &amp; advance
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
    return (
      <Card className="border-[var(--success)] bg-[var(--success-soft)]">
        <Stack gap="2.5">
          <Cluster gap="2" align="center">
            <CheckCircle2 className="size-4 text-[var(--success-ink)]" aria-hidden />
            <span className="text-sm font-semibold text-[var(--success-ink)]">
              Approved — recorded as a decision. The next step is unlocked.
            </span>
          </Cluster>
          <p className="text-sm text-[var(--text-muted)]">
            You can still edit this — but editing an approved artifact re-derives everything that
            depends on it.
          </p>
          {editConfirmOpen ? (
            <Card className="border-[var(--border-strong)] bg-[var(--warning-soft)]">
              <Stack gap="2.5">
                <Cluster gap="2" align="center">
                  <AlertTriangle className="size-4 text-[var(--warning-ink)]" aria-hidden />
                  <span className="text-sm font-semibold text-[var(--warning-ink)]">
                    {downstreamCount > 0
                      ? `Editing this re-derives ${downstreamCount} downstream stage${
                          downstreamCount === 1 ? "" : "s"
                        } — continue?`
                      : "Edit this approved artifact — continue?"}
                  </span>
                </Cluster>
                <p className="text-xs text-[var(--text-muted)]">
                  Athena reopens and re-runs the downstream stages into new versions. Old versions
                  stay in the history; the AI only ever uses the latest working version.
                </p>
                <ManualEditor
                  value={manualBody}
                  onChange={setManualBody}
                  placeholder="Edit the artifact body…"
                />
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
            <Cluster>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditConfirmOpen(true);
                  setManualBody("");
                }}
              >
                <PenLine className="size-3.5" />
                Edit this stage
              </Button>
            </Cluster>
          )}
        </Stack>
      </Card>
    );
  }

  // ── ready | failed | rejected — the "run or do it manually" state ──────────
  const isRetry = status === "failed" || status === "rejected";
  const runLabel = isRetry ? "Re-run with Athena" : "Run with Athena";

  return (
    <Card variant="elevated">
      <Stack gap="3">
        {isRetry && (
          <Cluster gap="2" align="center">
            <XCircle className="size-4 text-[var(--danger-ink)]" aria-hidden />
            <span className="text-sm font-semibold text-[var(--danger-ink)]">
              {status === "failed" ? "This stage didn't finish." : "Sent back for changes."}{" "}
              Run it again, or do it manually.
            </span>
          </Cluster>
        )}

        {aiUnavailable && (
          <Card className="border-[var(--border-strong)] bg-[var(--warning-soft)]">
            <Cluster gap="2" align="start">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--warning-ink)]" aria-hidden />
              <Stack gap="0.5">
                <span className="text-sm font-semibold text-[var(--warning-ink)]">
                  Athena AI is unavailable — you can do this step manually.
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
              Athena does the legwork and pauses at the gate for your call — or do this step
              yourself. This task never depends on AI.
            </p>
            {!aiUnavailable && (
              <textarea
                value={steer}
                onChange={(e) => setSteer(e.target.value)}
                placeholder="Optional — steer Athena before it starts: constraints, a link, what to focus on or avoid…"
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
              <Button
                size="sm"
                variant={aiUnavailable ? "primary" : "outline"}
                disabled={busy !== null}
                onClick={() => {
                  setManualOpen(true);
                  setManualBody("");
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
              Write the artifact body. Saving submits the stage — a hard gate then waits for
              sign-off; a soft gate advances automatically.
            </p>
            <ManualEditor
              value={manualBody}
              onChange={setManualBody}
              placeholder="Write the artifact… (markdown; kn:// and repo:// refs become citations)"
            />
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

/** Shared plain-textarea editor for the manual authoring path (no rich editor
 *  dependency on the bundle — the body is plain markdown). */
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
