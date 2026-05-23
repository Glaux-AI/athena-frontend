"use client";

/**
 * ScopeCollisionsModal — F-04.10 (depends on Phase 04 Task 04.15 slicer).
 *
 * Shown as a modal-on-load (not a row) when the spec phase emits a
 * system-authored clarification with `origin === "scope_collisions"`.
 * Collisions are load-bearing because they signal active work that may
 * conflict with the user's scope; this surface forces an explicit choice.
 *
 * Body renders the slicer payload (`ScopeCollisionsPayload`) — open PRs,
 * active branches, recent main commits in the user's scope — and four
 * options: Coordinate, Parallel, Review, Take over. The user picks an
 * option and the answer routes back through the existing clarify endpoint
 * (`api.runs.clarifications.submit`) — the modal itself doesn't talk to
 * the API directly so it stays composable.
 */

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ExternalLink,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Pause,
  Play,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { RunClarification, ScopeCollisionsPayload } from "@/lib/api/client";

type CollisionChoice = "coordinate" | "parallel" | "review" | "take_over";

interface ChoiceMeta {
  id: CollisionChoice;
  label: string;
  description: string;
  icon: typeof Pause;
  tone: "primary" | "warning" | "muted" | "danger";
  /** Long-form hint surfaced as caption under the radio. */
  caption: string;
}

const CHOICES: ChoiceMeta[] = [
  {
    id: "coordinate",
    label: "Coordinate",
    description: "Wait for these to merge before continuing.",
    icon: Pause,
    tone: "primary",
    caption: "Safer. Athena pauses the spec and watches for the conflicting work to land.",
  },
  {
    id: "parallel",
    label: "Parallel",
    description: "Proceed knowing there will be conflicts (risky).",
    icon: Play,
    tone: "warning",
    caption: "Faster, but expect rebase conflicts. Use when timelines force overlap.",
  },
  {
    id: "review",
    label: "Review",
    description: "Open the items, then decide.",
    icon: Search,
    tone: "muted",
    caption: "Pop open each link in a new tab; come back here to confirm a choice.",
  },
  {
    id: "take_over",
    label: "Take over",
    description: "Close conflicting items and continue.",
    icon: ShieldCheck,
    tone: "danger",
    caption: "Heavy hammer — politely closes the PRs / branches listed above. Use sparingly.",
  },
];

export interface ScopeCollisionsModalProps {
  open: boolean;
  /** The clarification carrying `origin === "scope_collisions"`. */
  clarification: RunClarification | null;
  /** Submit handler — forwards the user's choice id + optional note. */
  onSubmit: (choice: CollisionChoice, note: string | null) => Promise<void> | void;
  onClose: () => void;
}

/**
 * Type guard for the slicer payload — keeps the loose `metadata` field on
 * `RunClarification` from leaking into the UI surface.
 */
function extractScopeCollisionsPayload(c: RunClarification | null): ScopeCollisionsPayload | null {
  if (!c || !c.metadata) return null;
  const m = c.metadata as Partial<ScopeCollisionsPayload>;
  if (!Array.isArray(m.open_prs) && !Array.isArray(m.active_branches) && !Array.isArray(m.recent_main_commits)) {
    return null;
  }
  return {
    open_prs: m.open_prs ?? [],
    active_branches: m.active_branches ?? [],
    recent_main_commits: m.recent_main_commits ?? [],
  };
}

export function ScopeCollisionsModal({
  open,
  clarification,
  onSubmit,
  onClose,
}: ScopeCollisionsModalProps) {
  const [choice, setChoice] = useState<CollisionChoice | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showAllCommits, setShowAllCommits] = useState(false);

  useEffect(() => {
    if (open) {
      setChoice(null);
      setNote("");
      setShowAllCommits(false);
    }
  }, [open, clarification?.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !clarification) return null;

  const payload = extractScopeCollisionsPayload(clarification);
  const handleSubmit = async () => {
    if (!choice || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(choice, note.trim() ? note.trim() : null);
    } finally {
      setSubmitting(false);
    }
  };

  const commitsShown = showAllCommits
    ? payload?.recent_main_commits ?? []
    : (payload?.recent_main_commits ?? []).slice(0, 3);
  const extraCommits = (payload?.recent_main_commits.length ?? 0) - commitsShown.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Heads up — others are working in your scope"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
      >
        <Cluster justify="between" align="center" className="border-b border-[var(--border)] px-4 py-3">
          <Cluster gap="2" align="center">
            <AlertTriangle className="size-4 text-[var(--warning)]" aria-hidden />
            <Stack gap="0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                Scope collision
              </span>
              <h2 className="text-base font-semibold">Heads up — others are working in your scope</h2>
            </Stack>
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

        <div className="flex-1 overflow-y-auto p-4">
          <Stack gap="4">
            {clarification.rationale && (
              <p className="text-sm text-[var(--text-muted)]">{clarification.rationale}</p>
            )}

            {!payload && (
              <Card className="border-[var(--border-strong)] bg-[var(--surface-2)]">
                <p className="text-sm text-[var(--text-muted)]">
                  The slicer hasn&apos;t attached a structured payload to this clarification — pick an option below to continue.
                </p>
              </Card>
            )}

            {payload && payload.open_prs.length > 0 && (
              <Card>
                <Stack gap="2">
                  <Cluster gap="2" align="center">
                    <GitPullRequest className="size-4 text-[var(--warning)]" aria-hidden />
                    <span className="text-sm font-semibold">
                      {payload.open_prs.length} open PR{payload.open_prs.length === 1 ? "" : "s"}
                    </span>
                  </Cluster>
                  <Stack gap="2" as="ul">
                    {payload.open_prs.map((pr) => (
                      <li key={`${pr.integration}-${pr.number}`} className="rounded-md border border-[var(--border)] p-2 text-sm">
                        <Cluster justify="between" align="start">
                          <Stack gap="0" className="min-w-0">
                            <Cluster gap="2" align="center" className="flex-wrap">
                              <a
                                href={pr.url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium text-[var(--primary)] hover:underline"
                              >
                                #{pr.number} {pr.title}
                              </a>
                              <span className={cn(
                                "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                                pr.state === "draft"
                                  ? "bg-[var(--surface-2)] text-[var(--text-muted)]"
                                  : "bg-[var(--info-soft)] text-[var(--info)]",
                              )}>{pr.state}</span>
                            </Cluster>
                            <span className="text-xs text-[var(--text-muted)]">by {pr.author}</span>
                            {pr.touches.length > 0 && (
                              <span className="mt-1 block text-[11px] text-[var(--text-subtle)]">
                                Touches: <code className="font-mono">{pr.touches.join(", ")}</code>
                              </span>
                            )}
                          </Stack>
                          <a
                            href={pr.url}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-2 inline-flex items-center gap-1 rounded-md p-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
                          >
                            <ExternalLink className="size-3" />
                            Open
                          </a>
                        </Cluster>
                      </li>
                    ))}
                  </Stack>
                </Stack>
              </Card>
            )}

            {payload && payload.active_branches.length > 0 && (
              <Card>
                <Stack gap="2">
                  <Cluster gap="2" align="center">
                    <GitBranch className="size-4 text-[var(--warning)]" aria-hidden />
                    <span className="text-sm font-semibold">
                      {payload.active_branches.length} active branch{payload.active_branches.length === 1 ? "" : "es"}
                    </span>
                  </Cluster>
                  <Stack gap="2" as="ul">
                    {payload.active_branches.map((b) => (
                      <li key={b.name} className="rounded-md border border-[var(--border)] p-2 text-sm">
                        <Stack gap="0">
                          <code className="font-mono text-[var(--text)]">{b.name}</code>
                          <span className="text-xs text-[var(--text-muted)]">
                            by {b.author} · {b.ahead_of_main} commit{b.ahead_of_main === 1 ? "" : "s"} ahead of main
                          </span>
                          {b.touches.length > 0 && (
                            <span className="mt-0.5 text-[11px] text-[var(--text-subtle)]">
                              Touches: <code className="font-mono">{b.touches.join(", ")}</code>
                            </span>
                          )}
                        </Stack>
                      </li>
                    ))}
                  </Stack>
                </Stack>
              </Card>
            )}

            {payload && payload.recent_main_commits.length > 0 && (
              <Card>
                <Stack gap="2">
                  <Cluster gap="2" align="center">
                    <GitCommit className="size-4 text-[var(--text-muted)]" aria-hidden />
                    <span className="text-sm font-semibold">
                      {payload.recent_main_commits.length} recent main commit{payload.recent_main_commits.length === 1 ? "" : "s"} in your scope (last 7 days)
                    </span>
                  </Cluster>
                  <Stack gap="1" as="ul">
                    {commitsShown.map((c) => (
                      <li key={c.sha} className="rounded-md border border-[var(--border)] p-2 text-xs">
                        <Cluster gap="2" align="center" className="flex-wrap">
                          <code className="rounded bg-[var(--code-bg)] px-1.5 py-0.5 font-mono text-[10px]">
                            {c.sha.slice(0, 7)}
                          </code>
                          <span className="text-[var(--text)]">{c.summary}</span>
                        </Cluster>
                        <span className="text-[11px] text-[var(--text-subtle)]">
                          by {c.author} · {c.when}
                        </span>
                      </li>
                    ))}
                  </Stack>
                  {extraCommits > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAllCommits(true)}
                      className="text-xs text-[var(--primary)] hover:underline"
                    >
                      Expand {extraCommits} more commit{extraCommits === 1 ? "" : "s"}
                    </button>
                  )}
                </Stack>
              </Card>
            )}

            <Stack gap="2">
              <span className="text-sm font-semibold">How would you like to proceed?</span>
              <Stack gap="1.5" as="ul">
                {CHOICES.map((c) => {
                  const selected = choice === c.id;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setChoice(c.id)}
                        aria-pressed={selected}
                        data-choice-id={c.id}
                        className={cn(
                          "w-full rounded-md border p-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                          selected
                            ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                            : "border-[var(--border)] hover:border-[var(--border-strong)]",
                        )}
                      >
                        <Cluster gap="2" align="center">
                          <span className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded-full border",
                            selected ? "border-[var(--primary)] bg-[var(--primary)]" : "border-[var(--border-strong)]",
                          )}>
                            {selected && <span className="size-1.5 rounded-full bg-[var(--primary-fg)]" />}
                          </span>
                          <c.icon className="size-3.5 text-[var(--text-muted)]" aria-hidden />
                          <span className="font-semibold">{c.label}</span>
                          <span className="text-[var(--text-muted)]">— {c.description}</span>
                        </Cluster>
                        <p className="ml-6 mt-0.5 text-xs text-[var(--text-muted)]">{c.caption}</p>
                      </button>
                    </li>
                  );
                })}
              </Stack>
            </Stack>

            <Stack gap="1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]" htmlFor="scope-coll-note">
                Note for the team (optional)
              </label>
              <textarea
                id="scope-coll-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Why this choice? Surfaces in the decision list."
                className="resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
            </Stack>
          </Stack>
        </div>

        <Cluster justify="between" align="center" className="border-t border-[var(--border)] px-4 py-3">
          <span className="text-xs text-[var(--text-muted)]">Pick an option, then submit to resume the spec phase.</span>
          <Cluster gap="2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!choice}
              loading={submitting}
            >
              Submit answer
            </Button>
          </Cluster>
        </Cluster>
      </div>
    </div>
  );
}
