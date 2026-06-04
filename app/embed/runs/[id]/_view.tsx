"use client";

/**
 * §7 — `/embed/runs/[id]` presentational shell + helpers.
 *
 * Moved out of `page.tsx` so the route file only exports the default
 * route entry (Next.js App Router forbids non-default + non-reserved
 * exports from `page.tsx`). Underscore-prefixed filenames are ignored
 * by the Next routing layer, so this file is safe to import from both
 * the route and unit tests.
 *
 * Renders a slimmed-down version of `/runs/[id]`:
 *
 *   - Run goal + capability + status pill + cost spent.
 *   - Read-only phase rail (no Approve / Reject buttons).
 *   - Live activity timeline (mirrors the in-app LiveActivityStrip,
 *     default-expanded so embed viewers don't have to click).
 *   - Sophia mood derived from current status — but no toggle, no chat.
 *   - "Open in Athena →" CTA that lands on `/runs/{id}` (or, for
 *     anonymous viewers, on `/login?returnTo=/runs/{id}`).
 *
 * What's deliberately absent:
 *   - No Approve / Reject / Cancel / Improve buttons.
 *   - No comment composer.
 *   - No clarifications surface.
 *   - No phase content tabs.
 *
 * Private-org fallback:
 *   If the BE returns 403 (the run lives in an org the viewer isn't a
 *   member of) we render a friendly "This run is private" empty state
 *   with a "Sign in to view" CTA. Per the embed task spec — v1 serves
 *   authenticated viewers cleanly and gates org-private content behind
 *   a sign-in bounce; a `share_token` BE feature is phase-14 follow-up.
 */

import {
  Activity,
  CheckCircle2,
  Circle,
  ExternalLink,
  Eye,
  FileText,
  GitPullRequest,
  Hammer,
  ListTree,
  Lock,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { type RunDetail } from "@/lib/api/client";
import { LiveActivityStrip } from "@/components/runs/live-activity-strip";
import { Stack, Cluster } from "@/components/layout/primitives";
import { Card } from "@/components/ui/card";
import { formatRelativeTime, formatUsd } from "@/lib/utils/format";
import { cn } from "@/lib/cn";

export const IMPL_PHASES: ReadonlyArray<{ key: string; label: string; icon: LucideIcon }> = [
  { key: "spec",      label: "Spec",         icon: FileText       },
  { key: "plan",      label: "Plan",         icon: ListTree       },
  { key: "implement", label: "Implement",    icon: Hammer         },
  { key: "review",    label: "Review",       icon: Eye            },
  { key: "ci",        label: "CI Gate",      icon: ShieldCheck    },
  { key: "pr",        label: "Pull request", icon: GitPullRequest },
];

export const PRD_PHASES: ReadonlyArray<{ key: string; label: string; icon: LucideIcon }> = [
  { key: "frame",    label: "Frame",    icon: Target  },
  { key: "research", label: "Research", icon: Search  },
  { key: "draft",    label: "Draft",    icon: FileText },
  { key: "signoff",  label: "Sign-off", icon: Users   },
];

/* -------------------------------------------------------------------------- */
/* Presentational — exported for unit tests                                   */
/* -------------------------------------------------------------------------- */

/** Pure presentational shell — given a complete `RunDetail`, render the
 *  read-only embed. Exported so unit tests can render it without going
 *  through the SSR / fetch path. When `run` is `null`, the missing
 *  empty state is rendered, matching the route's behaviour. */
export function EmbedRunPage({ run }: { run: RunDetail | null }) {
  if (run === null) return <EmbedRunMissingEmpty />;

  const phases = run.kind === "prd" ? PRD_PHASES : IMPL_PHASES;
  const currentPhaseIdx = Math.min(run.current_phase, phases.length - 1);
  const phaseLabel = phases[currentPhaseIdx]?.label ?? "—";
  const status = runStatusBucket(run);

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <Stack gap="4">
        {/* Header: goal + status pill + Open in Athena CTA */}
        <header className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-2),var(--inner-highlight)] sm:p-5">
          <Cluster gap="2" align="center" className="flex-wrap">
            <RunStatusPill status={status} />
            <span className="text-xs text-[var(--text-muted)]">
              {phaseLabel} · {run.progress}%
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              · spent {formatUsd(run.spent_usd)}
            </span>
            <a
              href={`/runs/${encodeURIComponent(run.id)}`}
              target="_top"
              rel="noopener"
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs font-medium text-[var(--text)] shadow-[var(--shadow-1)] transition-[background-color,box-shadow] duration-200 ease-out hover:bg-[var(--surface-3)] hover:shadow-[var(--shadow-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              Open in Athena
              <ExternalLink className="size-3" aria-hidden />
            </a>
          </Cluster>
          <h1 className="mt-3 text-lg font-bold leading-tight tracking-tight text-[var(--text)] sm:text-xl">
            {run.goal}
          </h1>
          {run.summary && (
            <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
              {run.summary}
            </p>
          )}
          <Cluster gap="2" align="center" className="mt-3 flex-wrap text-xs text-[var(--text-muted)]">
            <span>
              <SophiaInline status={status} />
            </span>
            <span aria-hidden>·</span>
            <span>
              capability <span className="font-mono text-[var(--text)]">{run.capability_id}</span>
            </span>
            <span aria-hidden>·</span>
            <span>opened {formatRelativeTime(run.created_at)}</span>
          </Cluster>
        </header>

        {/* Phase rail — read-only, no buttons */}
        <Card className="p-3 sm:p-4">
          <Stack gap="3">
            <Cluster gap="2" align="center">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Phases
              </span>
            </Cluster>
            <ol
              role="list"
              aria-label="Run phases"
              className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
            >
              {phases.map((p, i) => {
                const isPast = i < run.current_phase;
                const isCurrent = i === run.current_phase;
                const Icon = p.icon;
                return (
                  <li
                    key={p.key}
                    className={cn(
                      "flex flex-col gap-1 rounded-md border p-2 text-xs",
                      isCurrent
                        ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                        : isPast
                        ? "border-[var(--border-strong)] bg-[var(--surface-2)]"
                        : "border-[var(--border)] bg-[var(--surface)]",
                    )}
                  >
                    <Cluster gap="1.5" align="center">
                      <Icon
                        className={cn(
                          "size-3.5",
                          isCurrent
                            ? "text-[var(--primary)]"
                            : isPast
                            ? "text-[var(--text)]"
                            : "text-[var(--text-muted)]",
                        )}
                        aria-hidden
                      />
                      <span className="font-medium">{p.label}</span>
                    </Cluster>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      {isPast ? "Done" : isCurrent ? "In progress" : "Pending"}
                    </span>
                  </li>
                );
              })}
            </ol>
          </Stack>
        </Card>

        {/* Live activity timeline — read-only by construction (no buttons),
         *  rendered default-expanded for embed consumers via the explicit
         *  wrapper below. The LiveActivityStrip's own collapsed state is
         *  fine to keep as a fallback for terminal runs whose SSE has no
         *  events to replay. */}
        <Card className="p-3 sm:p-4">
          <Stack gap="3">
            <Cluster gap="2" align="center">
              <Activity className="size-3.5 text-[var(--text-muted)]" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Activity
              </span>
            </Cluster>
            <LiveActivityStrip
              runId={run.id}
              streamUrl={run.stream_url}
              initialStatus={run.status}
            />
          </Stack>
        </Card>

        {/* Footer attribution */}
        <p className="text-center text-[10px] text-[var(--text-muted)]">
          Read-only Athena embed · activity updates live
        </p>
      </Stack>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty / loading states                                                     */
/* -------------------------------------------------------------------------- */

export function EmbedRunSkeleton() {
  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <Stack gap="4">
        <div className="h-24 animate-pulse rounded-xl bg-[var(--surface-2)]" />
        <div className="h-32 animate-pulse rounded-lg bg-[var(--surface-2)]" />
        <div className="h-16 animate-pulse rounded-lg bg-[var(--surface-2)]" />
      </Stack>
    </div>
  );
}

export function EmbedRunPrivateEmpty({ runId }: { runId: string }) {
  return (
    <div className="mx-auto max-w-md p-4 sm:p-8">
      <Card className="p-6 text-center">
        <Stack gap="3">
          <div className="mx-auto flex size-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] shadow-[var(--shadow-1)]">
            <Lock className="size-5 text-[var(--text-muted)]" aria-hidden />
          </div>
          <Stack gap="1">
            <h1 className="text-sm font-semibold text-[var(--text)]">This run is private.</h1>
            <p className="text-xs text-[var(--text-muted)]">
              Sign in to Athena to view this run if you have access.
            </p>
          </Stack>
          <div className="pt-1">
            <a
              href={`/login?returnTo=${encodeURIComponent(`/runs/${runId}`)}`}
              target="_top"
              rel="noopener"
              className="inline-flex items-center gap-1 rounded-md bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-[var(--primary-fg)] shadow-[var(--shadow-1)] transition-[opacity,box-shadow] duration-200 ease-out hover:opacity-90 hover:shadow-[var(--shadow-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              Sign in to view
              <ExternalLink className="size-3" aria-hidden />
            </a>
          </div>
        </Stack>
      </Card>
    </div>
  );
}

export function EmbedRunMissingEmpty() {
  return (
    <div className="mx-auto max-w-md p-4 sm:p-8">
      <Card className="p-6 text-center">
        <Stack gap="3">
          <div className="mx-auto flex size-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] shadow-[var(--shadow-1)]">
            <XCircle className="size-5 text-[var(--text-muted)]" aria-hidden />
          </div>
          <Stack gap="1">
            <h1 className="text-sm font-semibold text-[var(--text)]">Run not available.</h1>
            <p className="text-xs text-[var(--text-muted)]">
              The link may be wrong, the run may have been deleted, or it&apos;s
              not shareable.
            </p>
          </Stack>
        </Stack>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

export type StatusBucket = "running" | "queued" | "completed" | "failed" | "needs_review";

export function runStatusBucket(run: RunDetail): StatusBucket {
  if (run.status === "running") return "running";
  if (run.status === "queued") return "queued";
  if (run.status === "completed") return "completed";
  if (run.status === "failed" || run.status === "cancelled" || run.status === "gate_rejected") return "failed";
  // awaiting_gate
  return "needs_review";
}

export function RunStatusPill({ status }: { status: StatusBucket }) {
  const cfg: Record<StatusBucket, { label: string; tone: string; Icon: LucideIcon }> = {
    running:      { label: "Running",         tone: "bg-[var(--info-soft)] text-[var(--info-ink)]",       Icon: Sparkles },
    queued:       { label: "Queued",          tone: "bg-[var(--surface-3)] text-[var(--text-muted)]", Icon: Circle    },
    completed:    { label: "Completed",       tone: "bg-[var(--success-soft)] text-[var(--success-ink)]", Icon: CheckCircle2 },
    failed:       { label: "Failed",          tone: "bg-[var(--danger-soft)] text-[var(--danger-ink)]",   Icon: XCircle   },
    needs_review: { label: "Needs review",    tone: "bg-[var(--warning-soft)] text-[var(--warning-ink)]", Icon: Eye       },
  };
  const c = cfg[status];
  return (
    <span
      data-testid="run-status-pill"
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", c.tone)}
    >
      <c.Icon className="size-3" aria-hidden />
      {c.label}
    </span>
  );
}

/** Tiny "Sophia is ..." line — derived from status, no toggle UI.
 *  The 8-mood set lives in `lib/stores/mascot.ts`; here we surface a
 *  read-only verb so embed viewers see the mood without the chat. */
export function SophiaInline({ status }: { status: StatusBucket }) {
  const verbByStatus: Record<StatusBucket, string> = {
    running:      "Sophia is working",
    queued:       "Sophia is waiting",
    completed:    "Sophia is celebrating",
    failed:       "Sophia is taking notes",
    needs_review: "Sophia is reviewing",
  };
  return <span>{verbByStatus[status]}</span>;
}
