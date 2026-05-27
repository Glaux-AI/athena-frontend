"use client";

/**
 * SectionFeedback — inline 👍 / 👎 widget rendered at the bottom of every
 * artifact section (PRD section, Spec section, Plan stage, Review file
 * block, CI failure block, PR Author body block). Per readiness row 998
 * + §9.6.
 *
 * Wire contract: POSTs to `/v1/feedback` (Agent L). The backend uses the
 * polymorphic `{artifact_kind, artifact_id, section_key, sentiment}`
 * envelope (see `athena/api/routers/feedback.py`); ADR-032 keeps wire
 * field names snake_case. We pin `artifact_kind` to `document_section`
 * because every callsite is rendering a slice of a run's canonical
 * document. The caller passes the runId (for telemetry / re-fetch
 * scoping) and a stable sectionId (which becomes the BE `section_key`).
 *
 * UX:
 *   - Optimistic update so the user sees the chosen mood instantly.
 *   - Rollback on network failure + error toast.
 *   - Re-click the same mood retracts locally; re-clicking the other
 *     mood swaps (BE UPSERT replaces the prior row).
 *   - In-flight clicks ignored — the widget is idempotent under
 *     double-click.
 *   - Both buttons are keyboard-accessible (native button + aria-pressed).
 *
 * The 👍 / 👎 glyphs are the product surface for this widget — the
 * "no emoji in source" rule explicitly carves out these two.
 */

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { api, ApiError, type FeedbackSentiment } from "@/lib/api/client";
import { cn } from "@/lib/cn";

export interface SectionFeedbackProps {
  /** Run id — kept for telemetry parity with the task spec; the BE
   *  endpoint scopes by org + artifact, not by run. */
  runId: string;
  /** Stable id for the section being rated. Becomes the BE `section_key`. */
  sectionId: string;
  /** Document id the section belongs to. Becomes the BE `artifact_id`. */
  artifactId: string;
  /** Optional className for layout overrides at the callsite. */
  className?: string;
}

export function SectionFeedback({
  runId,
  sectionId,
  artifactId,
  className,
}: SectionFeedbackProps) {
  // Local optimistic state — `null` until the user picks. The BE is the
  // source of truth, but we don't render any server-side counts in this
  // widget (those would need a GET + counts envelope; out of scope here).
  const [sentiment, setSentiment] = useState<FeedbackSentiment | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const send = useCallback(
    async (next: FeedbackSentiment) => {
      if (submitting) return; // Double-click guard — single in-flight POST.
      const previous = sentiment;
      // Optimistic — flip the UI first, then send.
      setSentiment(next);
      setSubmitting(true);
      try {
        await api.feedback.record({
          artifact_kind: "document_section",
          artifact_id: artifactId,
          section_key: sectionId,
          sentiment: next,
        });
        toast.success("Thanks for the feedback");
      } catch (e) {
        // Rollback — restore the prior mood + surface the failure.
        setSentiment(previous);
        toast.error(
          e instanceof ApiError ? e.message : "Couldn't record feedback.",
        );
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, sentiment, artifactId, sectionId],
  );

  // `runId` is included in the local data-attribute for E2E selectors;
  // the BE endpoint itself is scoped via org + artifact_id.
  return (
    <div
      className={cn("flex items-center gap-1.5", className)}
      data-testid="section-feedback"
      data-run-id={runId}
      data-section-id={sectionId}
    >
      <span className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
        Was this useful?
      </span>
      <button
        type="button"
        onClick={() => void send("positive")}
        disabled={submitting}
        aria-pressed={sentiment === "positive"}
        aria-label="Mark this section as useful"
        data-action="thumbs-up"
        className={cn(
          "inline-flex h-6 min-w-6 items-center justify-center rounded-md border px-1.5 text-xs",
          "transition-colors duration-150 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          sentiment === "positive"
            ? "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]"
            : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]",
        )}
      >
        <span aria-hidden>👍</span>
      </button>
      <button
        type="button"
        onClick={() => void send("negative")}
        disabled={submitting}
        aria-pressed={sentiment === "negative"}
        aria-label="Mark this section as unhelpful"
        data-action="thumbs-down"
        className={cn(
          "inline-flex h-6 min-w-6 items-center justify-center rounded-md border px-1.5 text-xs",
          "transition-colors duration-150 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          sentiment === "negative"
            ? "border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning)]"
            : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]",
        )}
      >
        <span aria-hidden>👎</span>
      </button>
    </div>
  );
}
