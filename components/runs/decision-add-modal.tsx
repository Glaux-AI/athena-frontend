"use client";

/**
 * DecisionAddModal — F-04.7 "+ Add decision" modal.
 *
 * Pick scope (global / section / selection), enter title + body, pick impact.
 * Selection scope is omitted in the lite version because it requires an
 * active selection in a doc viewer — call sites that have a selection use
 * the section variant with the anchor pre-filled.
 */

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type {
  RunDecisionCreateRequest,
  RunDecisionImpact,
  RunDecisionScopeKind,
} from "@/lib/api/client";

export interface DecisionAddModalProps {
  open: boolean;
  /** Optional anchor presets — when scope is "section", populate the anchor
   * picker. Each entry is `{ anchor_id, label }`. */
  sectionAnchors?: Array<{ anchor_id: string; label: string; doc_id: string | null }>;
  onSubmit: (body: RunDecisionCreateRequest) => Promise<void> | void;
  onClose: () => void;
}

const IMPACT_OPTIONS: { id: RunDecisionImpact; label: string; description: string }[] = [
  { id: "low",    label: "Low",    description: "Local context note." },
  { id: "medium", label: "Medium", description: "Worth keeping in mind." },
  { id: "high",   label: "High",   description: "Athena must conform; loud in next outputs." },
];

const SCOPE_OPTIONS: { id: RunDecisionScopeKind; label: string; description: string }[] = [
  { id: "global",  label: "Global",  description: "Applies to the entire run." },
  { id: "section", label: "Section", description: "Pinned to one document section." },
];

export function DecisionAddModal({ open, sectionAnchors, onSubmit, onClose }: DecisionAddModalProps) {
  const [scopeKind, setScopeKind] = useState<RunDecisionScopeKind>("global");
  const [anchor, setAnchor] = useState<string>("");
  const [docId, setDocId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [impact, setImpact] = useState<RunDecisionImpact>("medium");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setScopeKind("global");
    setAnchor("");
    setDocId(null);
    setTitle("");
    setBody("");
    setImpact("medium");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const canSubmit = title.trim().length > 0 && body.trim().length > 0 && (scopeKind !== "section" || anchor);

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const payload: RunDecisionCreateRequest = {
        title: title.trim(),
        body: body.trim(),
        scope_kind: scopeKind,
        impact,
      };
      if (scopeKind === "section") {
        payload.scope_section_anchor = anchor;
        payload.scope_doc_id = docId;
      }
      await onSubmit(payload);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add decision"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
      >
        <Cluster justify="between" align="center" className="border-b border-[var(--border)] px-4 py-3">
          <Stack gap="0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Decision
            </span>
            <h2 className="text-base font-semibold">Add a decision</h2>
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
          <Stack gap="3">
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
                      "flex-1 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                      scopeKind === s.id
                        ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                        : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]",
                    )}
                    data-scope={s.id}
                  >
                    <div className="font-semibold">{s.label}</div>
                    <div className="text-xs text-[var(--text-muted)]">{s.description}</div>
                  </button>
                ))}
              </Cluster>
            </Stack>

            {scopeKind === "section" && (
              <Stack gap="1">
                <label htmlFor="dec-anchor" className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  Section anchor
                </label>
                {sectionAnchors && sectionAnchors.length > 0 ? (
                  <Card className="p-2">
                    <Stack gap="1" as="ul">
                      {sectionAnchors.map((a) => (
                        <li key={a.anchor_id}>
                          <button
                            type="button"
                            onClick={() => { setAnchor(a.anchor_id); setDocId(a.doc_id); }}
                            aria-pressed={anchor === a.anchor_id}
                            className={cn(
                              "w-full rounded-md border px-2 py-1.5 text-left text-xs transition-colors",
                              anchor === a.anchor_id
                                ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                                : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]",
                            )}
                          >
                            {a.label}
                            <span className="ml-2 font-mono text-[var(--text-subtle)]">{a.anchor_id.slice(0, 12)}</span>
                          </button>
                        </li>
                      ))}
                    </Stack>
                  </Card>
                ) : (
                  <input
                    id="dec-anchor"
                    type="text"
                    value={anchor}
                    onChange={(e) => setAnchor(e.target.value)}
                    placeholder="anchor id (e.g. section-3)"
                    className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  />
                )}
              </Stack>
            )}

            <Stack gap="1">
              <label htmlFor="dec-title" className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                Title
              </label>
              <input
                id="dec-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="One-line headline for this decision"
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
            </Stack>

            <Stack gap="1">
              <label htmlFor="dec-body" className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                Body
              </label>
              <textarea
                id="dec-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Markdown supported. Explain the why."
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
                      "flex-1 rounded-md border px-2 py-1.5 text-left text-xs transition-colors",
                      impact === i.id
                        ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                        : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]",
                    )}
                    data-impact={i.id}
                  >
                    <div className="font-semibold">{i.label}</div>
                    <div className="text-[var(--text-muted)]">{i.description}</div>
                  </button>
                ))}
              </Cluster>
            </Stack>
          </Stack>
        </div>
        <Cluster justify="end" align="center" className="border-t border-[var(--border)] px-4 py-3">
          <Cluster gap="2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleSubmit} disabled={!canSubmit} loading={submitting}>
              Add decision
            </Button>
          </Cluster>
        </Cluster>
      </div>
    </div>
  );
}
