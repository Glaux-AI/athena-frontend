"use client";

/**
 * ClarificationModal — F-04.14 full-screen modal for clarifications with
 * `origin in {system, scope_collisions, stale_knowledge}` AND
 * `priority === 'blocker'`. Used at phase open when the user hasn't seen the
 * pause card yet and the agent can't proceed.
 *
 * Reuses ClarificationPauseCard's content shape but inside a modal scrim so
 * the user can't keep scrolling without answering. Closing without answering
 * is intentionally hard — only an explicit Defer/Skip path resolves the
 * pause. The user can still hit Esc; we treat that as "I want to read the
 * page" and dismiss with no resolution — the next render re-mounts the
 * modal if the clarifications are still pending.
 */

import { useEffect } from "react";
import { X } from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import type {
  ClarificationAnswer,
  RunClarification,
} from "@/lib/api/client";
import { ClarificationPauseCard, type PauseSubmitContext } from "./clarification-pause-card";

export interface ClarificationModalProps {
  open: boolean;
  clarifications: RunClarification[];
  onSubmit: (ctx: PauseSubmitContext) => Promise<void> | void;
  onSubmitBatch?: (answers: Array<{ qid: string; answer: ClarificationAnswer }>) => Promise<void> | void;
  onSkip?: (qid: string, phaseKey: string) => Promise<void> | void;
  onDefer?: (qid: string, phaseKey: string) => Promise<void> | void;
  /** Title shown above the card. Default "Athena paused — answer to continue". */
  title?: string;
  onClose: () => void;
}

export function ClarificationModal({
  open,
  clarifications,
  onSubmit,
  onSubmitBatch,
  onSkip,
  onDefer,
  title = "Athena paused — answer to continue",
  onClose,
}: ClarificationModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || clarifications.length === 0) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
      >
        <Cluster
          justify="between"
          align="center"
          className="border-b border-[var(--border)] px-4 py-3"
        >
          <Stack gap="0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Clarification required
            </span>
            <h2 className="text-base font-semibold">{title}</h2>
          </Stack>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <X className="size-4" />
          </button>
        </Cluster>
        <div className="flex-1 overflow-y-auto p-4">
          <ClarificationPauseCard
            clarifications={clarifications}
            onSubmit={onSubmit}
            {...(onSubmitBatch ? { onSubmitBatch } : {})}
            {...(onSkip ? { onSkip } : {})}
            {...(onDefer ? { onDefer } : {})}
          />
        </div>
      </div>
    </div>
  );
}
