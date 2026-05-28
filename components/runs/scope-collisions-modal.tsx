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
 *
 * Behaviour contract per F-04.10:
 *   - Modal is intentionally sticky: clicking the backdrop and pressing
 *     Escape are no-ops. The user must engage with the picker. Defer / Skip
 *     route through the inline pause UI under the modal; the only escape
 *     hatches from this modal itself are Submit and Cancel.
 *   - Submit is disabled until a choice is selected.
 *   - The four options form a radio group (arrow-keys cycle, Space / Enter
 *     selects).
 */

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { GitBranch, GitPullRequest, GitCommit, AlertTriangle, ExternalLink } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";
import type {
  ClarificationAnswer,
  RunClarification,
  ScopeCollisionsPayload,
} from "@/lib/api/client";

/** The four conflict-resolution options surfaced as primary CTAs. */
const ACTIONS = [
  {
    id: "coordinate",
    label: "Coordinate",
    description: "Pause this run; ping the open-PR author to align.",
  },
  {
    id: "parallel",
    label: "Parallel",
    description: "Proceed in parallel; declare you'll handle a non-overlapping slice.",
  },
  {
    id: "review",
    label: "Review",
    description: "Stop and review the open work before continuing.",
  },
  {
    id: "take_over",
    label: "Take over",
    description: "Override the open work; rebase the existing PR to your direction.",
  },
] as const satisfies ReadonlyArray<{ id: string; label: string; description: string }>;

type ActionId = (typeof ACTIONS)[number]["id"];

function asPayload(metadata: Record<string, unknown> | null): ScopeCollisionsPayload | null {
  if (!metadata) return null;
  // Light shape-check — we don't validate the inner rows, but we do
  // confirm the three arrays exist so the renderer never blows up on
  // a malformed BE payload.
  const m = metadata as Partial<ScopeCollisionsPayload>;
  if (
    !Array.isArray(m.open_prs) ||
    !Array.isArray(m.active_branches) ||
    !Array.isArray(m.recent_main_commits)
  ) {
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
  /** "Cancel" — closes the modal but leaves the clarification PENDING.
   * The user must use Defer / Skip on the inline pause UI to dismiss the
   * underlying question. Esc + backdrop click are intentionally ignored
   * so the user engages with the picker. */
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<ActionId | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const radioRefs = useRef<Map<ActionId, HTMLButtonElement>>(new Map());

  const payload = asPayload(clarification.metadata);

  // Trap focus inside the dialog on mount so keyboard users land on the
  // first option (which is also the natural starting point for the radio
  // group's arrow-key navigation).
  useEffect(() => {
    const first = radioRefs.current.get(ACTIONS[0].id);
    first?.focus();
  }, []);

  // Suppress Esc — modal-on-load contract. The user must engage with the
  // picker or use the explicit Cancel button (which itself does not
  // resolve the underlying clarification).
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!selected || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ choice_id: selected });
      // Successful submit — caller (page.tsx) clears the modal by re-fetching
      // clarifications; resolved status means it won't re-open. We don't call
      // onClose() here because submit is the resolution, not a dismissal.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [selected, submitting, onSubmit]);

  /** Radio-group keyboard nav: ArrowDown/Right → next, ArrowUp/Left → prev,
   * Home → first, End → last. Space / Enter handled by the native button. */
  const handleRadioKeyDown = (e: KeyboardEvent<HTMLButtonElement>, currentId: ActionId) => {
    const ids = ACTIONS.map((a) => a.id) as ActionId[];
    const i = ids.indexOf(currentId);
    let nextIdx: number | null = null;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") nextIdx = (i + 1) % ids.length;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") nextIdx = (i - 1 + ids.length) % ids.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = ids.length - 1;
    if (nextIdx === null) return;
    e.preventDefault();
    const nextId = ids[nextIdx]!;
    setSelected(nextId);
    radioRefs.current.get(nextId)?.focus();
  };

  return (
    <div
      // Backdrop click intentionally a no-op — modal is sticky.
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-testid="scope-collisions-modal-backdrop"
    >
      <Card
        className="w-full max-w-3xl max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <Stack gap="4">
          <Stack gap="1">
            <Cluster gap="2" align="center">
              <AlertTriangle className="size-4 text-[var(--warning)]" aria-hidden />
              <span id={titleId} className="text-base font-semibold">
                Other work touches this scope
              </span>
            </Cluster>
            <p id={descriptionId} className="text-xs text-[var(--text-muted)]">
              {clarification.rationale ??
                "Athena spotted overlapping work in this codebase. Pick how to proceed before continuing."}
            </p>
          </Stack>

          {payload ? (
            <Stack gap="4">
              <CollisionList
                icon={<GitPullRequest className="size-3.5" />}
                title="Open pull requests"
                emptyLabel="No open PRs touch this scope."
                rows={payload.open_prs.map((pr): CollisionRow => {
                  const row: CollisionRow = {
                    primary: `#${pr.number} · ${pr.title}`,
                    secondary: `${pr.author} · ${pr.integration} · ${pr.state}`,
                    detail: pr.touches.join(", "),
                  };
                  if (pr.url) row.href = pr.url;
                  return row;
                })}
              />
              <CollisionList
                icon={<GitBranch className="size-3.5" />}
                title="Active branches"
                emptyLabel="No live branches touch this scope."
                rows={payload.active_branches.map((br): CollisionRow => {
                  const row: CollisionRow = {
                    primary: br.name,
                    secondary: `${br.author} · ${br.ahead_of_main} commits ahead of main`,
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
                rows={payload.recent_main_commits.map((c): CollisionRow => ({
                  primary: `${c.sha.slice(0, 7)} · ${c.summary}`,
                  secondary: `${c.author} · ${c.when}`,
                  detail: c.touches.join(", "),
                }))}
              />
            </Stack>
          ) : (
            <Card className="border-[var(--border-strong)] bg-[var(--surface-2)]">
              <p className="text-xs text-[var(--text-muted)]">
                Conflict snapshot is unavailable — the slicer didn&apos;t attach a
                payload. You can still pick a resolution below using the rationale
                above.
              </p>
            </Card>
          )}

          <Stack gap="2">
            <span className="text-sm font-semibold">How should Athena proceed?</span>
            <Stack
              gap="2"
              as="ul"
              className="list-none"
            >
              {ACTIONS.map((a) => {
                const checked = selected === a.id;
                return (
                  <li key={a.id}>
                    <button
                      ref={(el) => {
                        if (el) radioRefs.current.set(a.id, el);
                        else radioRefs.current.delete(a.id);
                      }}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      tabIndex={checked || (selected === null && a.id === ACTIONS[0].id) ? 0 : -1}
                      onClick={() => setSelected(a.id)}
                      onKeyDown={(e) => handleRadioKeyDown(e, a.id)}
                      disabled={submitting}
                      data-option-id={a.id}
                      className={cn(
                        "w-full rounded-md border p-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                        checked
                          ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                          : "border-[var(--border)] hover:border-[var(--border-strong)]",
                        submitting && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <Cluster gap="2" align="center">
                        <span
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded-full border",
                            checked
                              ? "border-[var(--primary)] bg-[var(--primary)]"
                              : "border-[var(--border-strong)]",
                          )}
                          aria-hidden
                        >
                          {checked && <span className="size-1.5 rounded-full bg-[var(--primary-fg)]" />}
                        </span>
                        <Stack gap="0" className="min-w-0">
                          <span className="font-medium">{a.label}</span>
                          <span className="text-xs text-[var(--text-muted)]">
                            {a.description}
                          </span>
                        </Stack>
                      </Cluster>
                    </button>
                  </li>
                );
              })}
            </Stack>
          </Stack>

          {error && (
            <p
              role="alert"
              className="rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]"
            >
              {error}
            </p>
          )}

          <Cluster justify="end" gap="2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={submitting}
              data-action="cancel"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => void handleSubmit()}
              disabled={selected === null || submitting}
              loading={submitting}
              data-action="submit"
            >
              Submit
            </Button>
          </Cluster>
        </Stack>
      </Card>
    </div>
  );
}

interface CollisionRow {
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
        <span className="text-[var(--text-muted)]" aria-hidden>{icon}</span>
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
                    className="inline-flex items-center gap-1 text-sm font-medium underline-offset-2 hover:underline"
                  >
                    {r.primary}
                    <ExternalLink className="size-3" aria-hidden />
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
