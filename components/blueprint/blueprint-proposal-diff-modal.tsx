"use client";

/**
 * BlueprintProposalDiffModal — three-column diff (Current / Proposed / Your Edit)
 * with Accept · Edit & Accept · Reject controls.
 *
 * Per knowledge-model.md §5.4 + F-04.3. This is the load-bearing UI for the
 * approval-gated AI-update flow — every accept here mutates a Blueprint section,
 * every reject sets a 14-day content cooldown server-side.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, X, Edit3, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { Stack, Cluster } from "@/components/layout/primitives";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type {
  BlueprintSection,
  BlueprintSectionProposal,
} from "@/lib/api/client";

export interface BlueprintProposalDiffModalProps {
  open: boolean;
  proposals: BlueprintSectionProposal[];
  /** Resolver — given a section key, return the current section body. The
   * page already has these cached, so we accept a lookup rather than refetching. */
  resolveCurrentSection: (sectionKey: string) => BlueprintSection | null;
  onAccept: (proposal: BlueprintSectionProposal) => Promise<void>;
  onEditAndAccept: (proposal: BlueprintSectionProposal, edited: string) => Promise<void>;
  onReject: (proposal: BlueprintSectionProposal, reason: string) => Promise<void>;
  onClose: () => void;
}

export function BlueprintProposalDiffModal({
  open,
  proposals,
  resolveCurrentSection,
  onAccept,
  onEditAndAccept,
  onReject,
  onClose,
}: BlueprintProposalDiffModalProps) {
  const pending = useMemo(() => proposals.filter((p) => p.status === "pending"), [proposals]);
  const [idx, setIdx] = useState(0);
  const [edited, setEdited] = useState<string>("");
  const [rejectReason, setRejectReason] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [busy, setBusy] = useState<"accept" | "edit-accept" | "reject" | null>(null);

  const current = pending[idx];
  const section = current ? resolveCurrentSection(current.section_key) : null;

  // Seed the editable text whenever the current proposal changes.
  useEffect(() => {
    if (current) {
      setEdited(current.proposed_body_markdown ?? "");
      setEditMode(false);
      setRejectReason("");
    }
  }, [current?.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Clamp idx if a proposal goes away (e.g., user accepted one).
  useEffect(() => {
    if (idx >= pending.length && pending.length > 0) setIdx(pending.length - 1);
  }, [pending.length, idx]);

  if (!open) return null;

  // No pending proposals — auto-close
  if (pending.length === 0 || !current) {
    return (
      <div
        className="fixed inset-0 z-40 flex items-center justify-center bg-[var(--overlay)] p-4"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label="No pending proposals"
      >
        <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
          <Stack gap="3">
            <h2 className="text-base font-semibold">No proposals to review</h2>
            <p className="text-sm text-[var(--text-muted)]">
              All caught up. Athena will queue new proposals here as sync detects changes.
            </p>
            <Cluster justify="end">
              <Button onClick={onClose}>Close</Button>
            </Cluster>
          </Stack>
        </Card>
      </div>
    );
  }

  const doAccept = async () => {
    setBusy("accept");
    try { await onAccept(current); toast.success("Proposal accepted."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't accept."); }
    finally { setBusy(null); }
  };

  const doEditAccept = async () => {
    setBusy("edit-accept");
    try { await onEditAndAccept(current, edited); toast.success("Edit-and-accept saved."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save."); }
    finally { setBusy(null); }
  };

  const doReject = async () => {
    setBusy("reject");
    try { await onReject(current, rejectReason); toast.success("Proposal rejected."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't reject."); }
    finally { setBusy(null); }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-stretch justify-center bg-[var(--overlay)] p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Review proposed updates"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-6xl flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-xl"
      >
        {/* Header */}
        <Cluster justify="between" align="center" className="border-b border-[var(--border)] px-4 py-3">
          <Cluster gap="3" align="center">
            <Stack gap="0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                Proposal {idx + 1} of {pending.length}
              </span>
              <h2 className="text-base font-semibold">
                {section?.title ?? current.section_key}
              </h2>
            </Stack>
            <Cluster gap="1" align="center">
              <button
                type="button"
                onClick={() => setIdx((i) => Math.max(0, i - 1))}
                disabled={idx === 0}
                className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--surface-2)] disabled:opacity-40"
                aria-label="Previous proposal"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setIdx((i) => Math.min(pending.length - 1, i + 1))}
                disabled={idx === pending.length - 1}
                className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--surface-2)] disabled:opacity-40"
                aria-label="Next proposal"
              >
                <ChevronRight className="size-4" />
              </button>
            </Cluster>
          </Cluster>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <X className="size-4" />
          </button>
        </Cluster>

        {/* Meta strip */}
        <Cluster gap="3" align="center" className="border-b border-[var(--border)] px-4 py-2 text-xs text-[var(--text-muted)]">
          <span><strong>Reason:</strong> {current.reason}</span>
          <span aria-hidden>·</span>
          <span><strong>Diff:</strong> {current.diff_summary}</span>
          <span aria-hidden>·</span>
          <span>proposed {formatIso(current.proposed_at)}</span>
        </Cluster>

        {/* 3-column diff */}
        <div className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 md:grid-cols-3">
          <DiffColumn
            title="Current"
            subtitle={`v${section?.current_version ?? "—"}`}
            body={section?.body_markdown ?? ""}
            tone="surface-2"
          />
          <DiffColumn
            title="Proposed"
            subtitle="Athena"
            body={current.proposed_body_markdown ?? ""}
            tone="info"
          />
          <Stack gap="1">
            <Cluster justify="between" align="center">
              <Cluster gap="2" align="center">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  Your edit
                </h3>
                <button
                  type="button"
                  onClick={() => setEditMode((m) => !m)}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
                >
                  <Edit3 className="size-3" />
                  {editMode ? "Done editing" : "Edit"}
                </button>
              </Cluster>
            </Cluster>
            {editMode ? (
              <textarea
                value={edited}
                onChange={(e) => setEdited(e.target.value)}
                rows={20}
                className="w-full flex-1 rounded-md border border-[var(--primary)] bg-[var(--primary-soft)] px-3 py-2 font-mono text-[11px] leading-relaxed text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
            ) : (
              <pre className="flex-1 overflow-y-auto whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--primary-soft)] p-3 font-mono text-[11px] leading-relaxed text-[var(--text)]">
                {edited || "(start editing to override the proposed text)"}
              </pre>
            )}
          </Stack>
        </div>

        {/* Reject reason */}
        <div className="border-t border-[var(--border)] px-4 py-3">
          <label className="block text-xs text-[var(--text-muted)]">
            <span className="mb-1 inline-block">Reject reason (optional, recorded in audit)</span>
            <input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Why does this proposal not work?"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
          </label>
        </div>

        {/* Actions */}
        <Cluster justify="end" gap="2" className="border-t border-[var(--border)] px-4 py-3">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button
            variant="destructive"
            onClick={doReject}
            loading={busy === "reject"}
          >
            <X className="size-3.5" />
            Reject
          </Button>
          <Button
            variant="outline"
            onClick={doEditAccept}
            loading={busy === "edit-accept"}
            disabled={!editMode || edited === (current.proposed_body_markdown ?? "")}
            title={!editMode ? "Switch to Edit mode first" : undefined}
          >
            <Edit3 className="size-3.5" />
            Edit &amp; Accept
          </Button>
          <Button onClick={doAccept} loading={busy === "accept"}>
            <Check className="size-3.5" />
            Accept
          </Button>
        </Cluster>
      </div>
    </div>
  );
}

function DiffColumn({
  title,
  subtitle,
  body,
  tone,
}: {
  title: string;
  subtitle: string;
  body: string;
  tone: "surface-2" | "info";
}) {
  return (
    <Stack gap="1">
      <Cluster gap="2" align="center">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
          {title}
        </h3>
        <span className="text-[10px] text-[var(--text-subtle)]">{subtitle}</span>
      </Cluster>
      <pre
        className={cn(
          "flex-1 overflow-y-auto whitespace-pre-wrap rounded-md border border-[var(--border)] p-3 font-mono text-[11px] leading-relaxed text-[var(--text)]",
          tone === "info" ? "bg-[var(--info-soft)]" : "bg-[var(--surface-2)]",
        )}
      >
        {body || "(empty)"}
      </pre>
    </Stack>
  );
}

function formatIso(iso: string): string {
  try { return new Date(iso).toLocaleString(); }
  catch { return iso; }
}
