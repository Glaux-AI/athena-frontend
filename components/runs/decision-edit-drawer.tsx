"use client";

/**
 * DecisionEditDrawer — F-04.7 edit-an-existing decision drawer.
 *
 * Editable for rows where `user_editable === true`. PATCH inserts a new row
 * that supersedes the original — the drawer surfaces the supersedure chain
 * so the user knows the original isn't destroyed.
 */

import { useEffect, useState } from "react";
import { CornerUpRight, X } from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type {
  RunDecisionImpact,
  RunDecisionPatchRequest,
  RunDecisionRow,
  RunDecisionScopeKind,
} from "@/lib/api/client";

const IMPACT_OPTIONS: { id: RunDecisionImpact; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
];

const SCOPE_OPTIONS: { id: RunDecisionScopeKind; label: string }[] = [
  { id: "global", label: "Global" },
  { id: "section", label: "Section" },
];

export interface DecisionEditDrawerProps {
  /** Decision being edited; null hides the drawer. */
  decision: RunDecisionRow | null;
  /** Full row history — drives the supersedure chain. */
  history?: RunDecisionRow[];
  onSubmit: (decisionId: string, body: RunDecisionPatchRequest) => Promise<void> | void;
  onClose: () => void;
}

export function DecisionEditDrawer({
  decision,
  history,
  onSubmit,
  onClose,
}: DecisionEditDrawerProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [scopeKind, setScopeKind] = useState<RunDecisionScopeKind>("global");
  const [anchor, setAnchor] = useState("");
  const [impact, setImpact] = useState<RunDecisionImpact>("medium");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!decision) return;
    setTitle(decision.title);
    setBody(decision.body);
    setScopeKind(decision.scope_kind === "selection" ? "section" : decision.scope_kind);
    setAnchor(decision.scope_section_anchor ?? "");
    setImpact(decision.impact);
  }, [decision]);

  useEffect(() => {
    if (!decision) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decision, onClose]);

  if (!decision) return null;

  const dirty =
    title !== decision.title
    || body !== decision.body
    || scopeKind !== decision.scope_kind
    || anchor !== (decision.scope_section_anchor ?? "")
    || impact !== decision.impact;

  const handleSubmit = async () => {
    if (!dirty || submitting) return;
    setSubmitting(true);
    try {
      const payload: RunDecisionPatchRequest = {
        title: title.trim(),
        body: body.trim(),
        scope_kind: scopeKind,
        impact,
      };
      if (scopeKind === "section") payload.scope_section_anchor = anchor || null;
      else payload.scope_section_anchor = null;
      await onSubmit(decision.id, payload);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  // Trace supersedure chain forwards from this row.
  const chain: RunDecisionRow[] = [];
  if (history && history.length > 0) {
    const byId = new Map(history.map((d) => [d.id, d]));
    // Walk back to original.
    let cursor = decision;
    while (cursor.supersedes_decision_id && byId.has(cursor.supersedes_decision_id)) {
      cursor = byId.get(cursor.supersedes_decision_id)!;
      chain.unshift(cursor);
    }
    chain.push(decision);
    // Walk forward from current.
    let next = history.find((d) => d.supersedes_decision_id === decision.id);
    while (next) {
      chain.push(next);
      next = history.find((d) => d.supersedes_decision_id === next!.id);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Edit decision ${decision.id}`}
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/45"
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-xl flex-col border-l border-[var(--border)] bg-[var(--surface)] shadow-2xl"
      >
        <Cluster justify="between" align="center" className="border-b border-[var(--border)] px-4 py-3">
          <Stack gap="0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Decision · {decision.id}
            </span>
            <h2 className="text-base font-semibold">Edit decision</h2>
          </Stack>
          <button type="button" onClick={onClose} aria-label="Close" className="text-[var(--text-muted)] hover:text-[var(--text)]">
            <X className="size-4" />
          </button>
        </Cluster>

        <div className="flex-1 overflow-y-auto p-4">
          <Stack gap="3">
            {chain.length > 1 && (
              <Stack gap="1" className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  Supersedure chain
                </span>
                <Stack gap="0.5" as="ol">
                  {chain.map((d, i) => (
                    <li key={d.id} className="text-xs">
                      <Cluster gap="1" align="center">
                        {i > 0 && <CornerUpRight className="size-3 text-[var(--text-muted)]" aria-hidden />}
                        <code className="font-mono text-[var(--text-subtle)]">{d.id}</code>
                        <span className={cn(d.id === decision.id && "font-semibold text-[var(--text)]")}>
                          {d.title}
                        </span>
                        <span className="text-[var(--text-muted)]">· {d.status}</span>
                      </Cluster>
                    </li>
                  ))}
                </Stack>
              </Stack>
            )}

            <Stack gap="1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Scope</span>
              <Cluster gap="2">
                {SCOPE_OPTIONS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setScopeKind(s.id)}
                    aria-pressed={scopeKind === s.id}
                    className={cn(
                      "flex-1 rounded-md border px-3 py-1.5 text-xs transition-colors",
                      scopeKind === s.id
                        ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                        : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </Cluster>
            </Stack>

            {scopeKind === "section" && (
              <Stack gap="1">
                <label htmlFor="ded-anchor" className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  Section anchor
                </label>
                <input
                  id="ded-anchor"
                  type="text"
                  value={anchor}
                  onChange={(e) => setAnchor(e.target.value)}
                  className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
              </Stack>
            )}

            <Stack gap="1">
              <label htmlFor="ded-title" className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                Title
              </label>
              <input
                id="ded-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
            </Stack>

            <Stack gap="1">
              <label htmlFor="ded-body" className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                Body
              </label>
              <textarea
                id="ded-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={6}
                className="resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
            </Stack>

            <Stack gap="1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Impact</span>
              <Cluster gap="2">
                {IMPACT_OPTIONS.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => setImpact(i.id)}
                    aria-pressed={impact === i.id}
                    className={cn(
                      "flex-1 rounded-md border px-2 py-1.5 text-xs transition-colors",
                      impact === i.id
                        ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                        : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]",
                    )}
                  >
                    {i.label}
                  </button>
                ))}
              </Cluster>
            </Stack>
          </Stack>
        </div>

        <Cluster justify="end" align="center" className="border-t border-[var(--border)] px-4 py-3">
          <Cluster gap="2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleSubmit} disabled={!dirty} loading={submitting}>
              Save changes
            </Button>
          </Cluster>
        </Cluster>
      </aside>
    </div>
  );
}
