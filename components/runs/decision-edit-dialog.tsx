"use client";

/**
 * DecisionEditDialog — create or edit a task-level decision on
 * `/runs/[id]`. Per §5.29.10 Item 1 (task-level scope): only Add +
 * Update are wired here. Revert / Escalate live on the cap/repo
 * Decisions tab, not on this inline strip.
 *
 * Wire shape matches the FE client's `RunDecisionCreateRequest` /
 * `RunDecisionPatchRequest`: flat `title`, `body`, `scope_kind`,
 * optional `impact`. The strip displays the lightweight `TaskDecision`
 * shape on read; this dialog round-trips through the richer
 * `decisionList.{create,patch}` endpoints so the user's edit
 * supersedes the original row (append-only semantics).
 */

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";

import {
  api,
  ApiError,
  type RunDecisionImpact,
  type RunDecisionScopeKind,
  type TaskDecision,
} from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Stack } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";

type Mode = "create" | "edit";
const IMPACT_OPTIONS: RunDecisionImpact[] = ["high", "medium", "low"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runId: string;
  mode: Mode;
  /** Required when mode === "edit". */
  existing: TaskDecision | null;
  /** Fired after a successful save so the parent can refresh state. */
  onSaved: () => Promise<void> | void;
}

export function DecisionEditDialog({ open, onOpenChange, runId, mode, existing, onSaved }: Props) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [impact, setImpact] = useState<RunDecisionImpact>("medium");
  const [saving, setSaving] = useState(false);

  // Reset form whenever the dialog (re-)opens.
  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && existing) {
      setTitle(existing.title);
      setBody(existing.body);
      setImpact("medium"); // TaskDecision shape doesn't expose impact; default on edit.
    } else {
      setTitle("");
      setBody("");
      setImpact("medium");
    }
  }, [open, mode, existing]);

  const canSave = title.trim().length > 0 && !saving;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      const scope_kind: RunDecisionScopeKind = "global";
      if (mode === "create") {
        await api.runs.decisionList.create(runId, {
          title: title.trim(),
          body: body.trim(),
          scope_kind,
          impact,
        });
        toast.success("Decision added.");
      } else if (existing) {
        await api.runs.decisionList.patch(runId, existing.id, {
          title: title.trim(),
          body: body.trim(),
          impact,
        });
        toast.success("Decision updated.");
      }
      await onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save decision.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-sm" />
        <Dialog.Content className="glass fixed left-1/2 top-1/2 z-50 w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--border)] p-5 shadow-[var(--shadow-3)]">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <Dialog.Title className="text-base font-semibold">
                {mode === "create" ? "Add decision" : "Edit decision"}
              </Dialog.Title>
              <Dialog.Description className="text-xs text-[var(--text-muted)]">
                Captured in the run&apos;s append-only decisions feed.
              </Dialog.Description>
            </div>
            <Dialog.Close className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--surface-2)]" aria-label="Close">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <form onSubmit={onSubmit}>
            <Stack gap="3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Title</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Use feature flag for staged rollout"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  autoFocus
                  maxLength={200}
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Body</span>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Why this choice, what alternatives were considered, what trade-offs you accept."
                  rows={5}
                  className="w-full resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                />
              </label>

              <div>
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Impact</span>
                <div className="flex flex-wrap gap-1.5">
                  {IMPACT_OPTIONS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setImpact(k)}
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
                        impact === k
                          ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                          : "bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)]",
                      )}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!canSave}>
                  {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  {mode === "create" ? "Add decision" : "Save changes"}
                </Button>
              </div>
            </Stack>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
