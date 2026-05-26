"use client";

/**
 * §5.29.10 r3 / F-04.10 — Scope-collisions modal-on-load.
 *
 * When a clarification arrives with `origin === "scope_collisions"`,
 * its `metadata` carries a `ScopeCollisionsPayload` snapshot of
 * conflicting work that touches the same code as the current task:
 * open PRs, active branches, and recent main-branch commits.
 *
 * Rather than fold this into the inline clarification widget (which
 * is sized for short answer chips), the conflict snapshot opens its
 * own modal so the user can scan the PR titles + branch authors + commit
 * summaries on one screen, then pick one of four resolutions:
 *
 *   - **coordinate** — pause this run and chat with the other author
 *   - **parallel**   — keep going; we'll deal with the merge later
 *   - **review**     — review the conflicting PRs first, then resume
 *   - **take_over**  — claim the work; close their PRs
 *
 * The picked id submits a `single_choice` answer back to the BE via the
 * existing `clarifications.submit` path. The BE option list for
 * `scope_collisions`-origin clarifications must mirror these four ids;
 * if it doesn't, the modal still works (we don't validate against
 * `clarification.options` — we synthesize the actions client-side per
 * F-04.10's contract).
 */

import { useState } from "react";
import { GitBranch, GitPullRequest, GitCommit, X, AlertTriangle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import type {
  ClarificationAnswer,
  RunClarification,
  ScopeCollisionsPayload,
} from "@/lib/api/client";

/** The four conflict-resolution options surfaced as primary CTAs. */
const ACTIONS: ReadonlyArray<{
  id: string;
  label: string;
  description: string;
  tone: "primary" | "muted";
}> = [
  {
    id: "coordinate",
    label: "Coordinate",
    description: "Pause this run, ping the other authors, resume after sync.",
    tone: "primary",
  },
  {
    id: "parallel",
    label: "Continue in parallel",
    description: "Keep going; surface the merge conflict at PR time.",
    tone: "muted",
  },
  {
    id: "review",
    label: "Review their work first",
    description: "Read the conflicting PRs, then resume informed.",
    tone: "muted",
  },
  {
    id: "take_over",
    label: "Take over",
    description: "Claim the work; their PRs get closed with a note.",
    tone: "muted",
  },
];

function asPayload(metadata: Record<string, unknown> | null): ScopeCollisionsPayload | null {
  if (!metadata) return null;
  // Light shape-check — we don't validate the inner rows, but we do
  // confirm the three arrays exist so the renderer never blows up on
  // a malformed BE payload.
  const m = metadata as Partial<ScopeCollisionsPayload>;
  if (!Array.isArray(m.open_prs) || !Array.isArray(m.active_branches) || !Array.isArray(m.recent_main_commits)) {
    return null;
  }
  return m as ScopeCollisionsPayload;
}

export function ScopeCollisionsModal({
  clarification,
  onSubmit,
  onClose,
}: {
  clarification: RunClarification;
  /** Caller routes the picked action to `clarifications.submit`. */
  onSubmit: (answer: ClarificationAnswer) => Promise<void> | void;
  onClose: () => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const payload = asPayload(clarification.metadata);

  const handle = async (id: string) => {
    setPending(id);
    try {
      await onSubmit({ choice_id: id });
      onClose();
    } finally {
      setPending(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scope-collisions-title"
    >
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-auto">
        <Stack gap="4">
          <Cluster justify="between" align="start">
            <Stack gap="0">
              <Cluster gap="2" align="center">
                <AlertTriangle className="size-4 text-[var(--warning)]" />
                <span id="scope-collisions-title" className="text-base font-semibold">
                  Other work touches this scope
                </span>
              </Cluster>
              <p className="text-xs text-[var(--text-muted)]">
                {clarification.rationale ?? "Athena spotted overlapping changes — pick how to proceed."}
              </p>
            </Stack>
            <button
              onClick={onClose}
              className="text-[var(--text-muted)] hover:text-[var(--text)]"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </Cluster>

          {payload ? (
            <Stack gap="4">
              <CollisionList
                icon={<GitPullRequest className="size-3.5" />}
                title="Open pull requests"
                emptyLabel="No open PRs touch this scope."
                rows={payload.open_prs.map((pr) => ({
                  primary: `#${pr.number} · ${pr.title}`,
                  secondary: `${pr.author} · ${pr.integration} · ${pr.state}`,
                  detail: pr.touches.join(", "),
                  href: pr.url,
                }))}
              />
              <CollisionList
                icon={<GitBranch className="size-3.5" />}
                title="Active branches"
                emptyLabel="No live branches touch this scope."
                rows={payload.active_branches.map((br): CollisionRow => {
                  const row: CollisionRow = {
                    primary: br.name,
                    secondary: `${br.author} · ${br.ahead_of_main} commits ahead`,
                    detail: br.touches.join(", "),
                  };
                  if (br.url) row.href = br.url;
                  return row;
                })}
              />
              <CollisionList
                icon={<GitCommit className="size-3.5" />}
                title="Recent main-branch commits"
                emptyLabel="No recent main commits touch this scope."
                rows={payload.recent_main_commits.map((c) => ({
                  primary: `${c.sha.slice(0, 7)} · ${c.summary}`,
                  secondary: `${c.author} · ${c.when}`,
                  detail: c.touches.join(", "),
                }))}
              />
            </Stack>
          ) : (
            <Card className="border-[var(--border-strong)] bg-[var(--surface-2)]">
              <p className="text-xs text-[var(--text-muted)]">
                Conflict snapshot is unavailable — the slicer didn&apos;t attach
                a payload. Pick an action below using the rationale above.
              </p>
            </Card>
          )}

          <Stack gap="2">
            <span className="text-sm font-semibold">How should Athena proceed?</span>
            <Stack gap="2">
              {ACTIONS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => void handle(a.id)}
                  disabled={pending !== null}
                  className="text-left rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
                >
                  <Cluster justify="between" align="center" gap="2">
                    <Stack gap="0">
                      <span className="text-sm font-medium">{a.label}</span>
                      <span className="text-xs text-[var(--text-muted)]">{a.description}</span>
                    </Stack>
                    {pending === a.id && (
                      <span className="text-xs text-[var(--text-muted)]">Submitting…</span>
                    )}
                  </Cluster>
                </button>
              ))}
            </Stack>
          </Stack>

          <Cluster justify="end" gap="2">
            <Button variant="ghost" onClick={onClose} disabled={pending !== null}>
              Decide later
            </Button>
          </Cluster>
        </Stack>
      </Card>
    </div>
  );
}

export interface CollisionRow {
  primary: string;
  secondary: string;
  detail: string;
  href?: string;
}

function CollisionList({
  icon,
  title,
  rows,
  emptyLabel,
}: {
  icon: React.ReactNode;
  title: string;
  rows: CollisionRow[];
  emptyLabel: string;
}) {
  return (
    <Stack gap="2">
      <Cluster gap="2" align="center">
        <span className="text-[var(--text-muted)]">{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {title}
        </span>
        <span className="text-xs text-[var(--text-subtle)]">{rows.length}</span>
      </Cluster>
      {rows.length === 0 ? (
        <p className="text-xs text-[var(--text-subtle)]">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((r, i) => (
            <li
              key={i}
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs"
            >
              <Stack gap="0">
                {r.href ? (
                  <a
                    href={r.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-sm font-medium underline-offset-2 hover:underline"
                  >
                    {r.primary}
                  </a>
                ) : (
                  <span className="text-sm font-medium">{r.primary}</span>
                )}
                <span className="text-[var(--text-muted)]">{r.secondary}</span>
                {r.detail && (
                  <span className="font-mono text-[10px] text-[var(--text-subtle)]">
                    {r.detail}
                  </span>
                )}
              </Stack>
            </li>
          ))}
        </ul>
      )}
    </Stack>
  );
}
