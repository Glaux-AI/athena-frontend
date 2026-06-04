"use client";

/**
 * DecisionRecordEditDialog — create or edit a long-lived governance
 * decision (`DecisionRecord`) scoped to a capability or org. Used by the
 * `<DecisionsTab>` on `/capabilities/[id]` (capability scope) and on the
 * org-knowledge surface (org scope).
 *
 * Distinct from the task-level `DecisionEditDialog` in
 * `components/runs/decision-edit-dialog.tsx` — that one rides the
 * `run_decisions` append-only audit feed; this one writes governance
 * records (ADRs / Conventions / Domain notes) that AI agents read on
 * every relevant phase.
 *
 * Backed by `api.{capabilities,orgs}.decisionList.{create,patch}`. The
 * mock side is wired today; BE-side endpoints are §5.29.10 Item 1b
 * deferred work.
 */

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";

import {
  api,
  ApiError,
  type DecisionRecord,
} from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Stack } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";

type Mode = "create" | "edit";
type Scope = "org" | "capability" | "repo";
const KIND_OPTIONS: DecisionRecord["kind"][] = ["ADR", "Convention", "Domain note"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: Scope;
  /** Org id when scope === "org", capability id when scope === "capability". */
  scopeId: string;
  mode: Mode;
  /** Required when mode === "edit". */
  existing: DecisionRecord | null;
  /** Fired after a successful save so the parent can re-fetch the list. */
  onSaved: () => Promise<void> | void;
}

export function DecisionRecordEditDialog({ open, onOpenChange, scope, scopeId, mode, existing, onSaved }: Props) {
  const [kind, setKind] = useState<DecisionRecord["kind"]>("ADR");
  const [tag, setTag] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && existing) {
      setKind(existing.kind);
      setTag(existing.tag);
      setTitle(existing.title);
      setSummary(existing.summary);
    } else {
      setKind("ADR");
      setTag("");
      setTitle("");
      setSummary("");
    }
  }, [open, mode, existing]);

  const canSave = title.trim().length > 0 && tag.trim().length > 0 && !saving;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      const body = {
        title: title.trim(),
        tag: tag.trim(),
        kind,
        summary: summary.trim(),
      };
      const ns = scope === "org" ? api.orgs.decisionList
        : scope === "capability" ? api.capabilities.decisionList
        : api.repos.decisionList;
      if (mode === "create") {
        await ns.create(scopeId, body);
        toast.success("Decision added.");
      } else if (existing) {
        await ns.patch(scopeId, existing.id, body);
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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-3)]">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <Dialog.Title className="text-base font-semibold">
                {mode === "create" ? "Add decision" : "Edit decision"}
              </Dialog.Title>
              <Dialog.Description className="text-xs text-[var(--text-muted)]">
                {scope === "org"
                  ? "Org-wide decision record — visible across every capability."
                  : "Capability-scoped decision record — agents on this capability cite it."}
              </Dialog.Description>
            </div>
            <Dialog.Close className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--surface-2)]" aria-label="Close">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <form onSubmit={onSubmit}>
            <Stack gap="3">
              <div>
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Kind</span>
                <div className="flex flex-wrap gap-1.5">
                  {KIND_OPTIONS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKind(k)}
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                        kind === k
                          ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                          : "bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)]",
                      )}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-[1fr_2fr] gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Tag</span>
                  <input
                    type="text"
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                    placeholder="e.g. ADR-042"
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 font-mono text-xs focus:border-[var(--primary)] focus:outline-none"
                    maxLength={40}
                    required
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Title</span>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="One-line headline for the row"
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm focus:border-[var(--primary)] focus:outline-none"
                    autoFocus
                    maxLength={200}
                    required
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Summary</span>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="What this decision says, why it stands, what trade-offs were accepted."
                  rows={5}
                  className="w-full resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm focus:border-[var(--primary)] focus:outline-none"
                />
              </label>

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
