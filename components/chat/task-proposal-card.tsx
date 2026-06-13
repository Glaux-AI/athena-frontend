"use client";

/**
 * TaskProposalCard — renders the `propose_task` envelope inside a chat thread.
 *
 * The chat agent cannot create tasks; it calls `propose_task` instead (per
 * ADR-027 #19 — agent suggests, user assents). The backend persists the
 * envelope on a `task_created` ChatMessage and the FE renders this card from
 * `message.payload`. Clicking "Start task" calls `onStart`, which opens the
 * New-task dialog **in place** (over the chat) pre-filled from this proposal,
 * so the user confirms + tweaks before the task is minted — no navigation
 * away. "Dismiss" calls `onDismiss` to decline the suggestion (deletes the
 * proposal row server-side). The `cta_url` field on the payload still backs
 * the standalone `/work?new=1&…` deep-link, but this card no longer follows it.
 *
 * WCAG 2.1 AA: the card is a region with `aria-label`; the actions are
 * standard `<button>`s (keyboard reachable + screen-reader visible).
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Info, X } from "lucide-react";

import type { TaskProposalPayload } from "@/lib/api/client";
import { api } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { TASK_TYPE_META } from "@/lib/work/task-meta";

const GOAL_TRUNCATE_AT = 200;

export function TaskProposalCard({
  proposal,
  spawnedRunId,
  onStart,
  onDismiss,
}: {
  proposal: TaskProposalPayload;
  /** When set, the user already clicked the CTA and a task was minted —
   *  the card renders a "Task started" pill instead of the Start CTA. */
  spawnedRunId?: string | null;
  /** Open the New-task dialog in place, pre-filled from this proposal. When
   *  omitted the card falls back to the `cta_url` deep-link (legacy path). */
  onStart?: (proposal: TaskProposalPayload) => void;
  /** Decline the suggestion — removes the proposal. Hidden when omitted. */
  onDismiss?: () => void;
}) {
  const { label: typeLabel, Icon } = TASK_TYPE_META[proposal.type];
  const truncatedGoal =
    proposal.goal.length > GOAL_TRUNCATE_AT
      ? `${proposal.goal.slice(0, GOAL_TRUNCATE_AT).trimEnd()}…`
      : proposal.goal;
  const domainName = useDomainName(proposal.domain_id);
  const ctaText = proposal.cta_text || "Start task";

  return (
    <Card
      variant="elevated"
      role="region"
      aria-label={`Task proposal: ${typeLabel}`}
      className="overflow-hidden p-0"
      data-testid="task-proposal-card"
    >
      <Stack gap="3" className="p-4">
        <Cluster gap="2" align="center" className="flex-wrap">
          <div className="flex size-7 items-center justify-center rounded-md bg-[var(--primary-soft)] text-[var(--primary)] shadow-[var(--shadow-1)]">
            <Icon className="size-4" aria-hidden="true" />
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Athena proposes
          </span>
          <TypeChip label={typeLabel} />
          {domainName && <DomainChip name={domainName} />}
        </Cluster>

        <Stack gap="1">
          <p className="text-sm font-semibold leading-snug text-[var(--text)]">
            {proposal.title}
          </p>
          <p className="text-sm leading-relaxed text-[var(--text-muted)]">
            {truncatedGoal}
          </p>
        </Stack>

        {proposal.stages.length > 0 && (
          <p
            className="text-[11px] leading-relaxed text-[var(--text-subtle)]"
            data-testid="task-proposal-stages"
          >
            {proposal.stages.join(" → ")}
          </p>
        )}
      </Stack>

      <div className="border-t border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 shadow-[var(--inner-highlight)]">
        {spawnedRunId ? (
          <Link
            href={`/work/${encodeURIComponent(spawnedRunId)}`}
            className="inline-flex w-fit items-center gap-1.5 rounded-md border border-[var(--success)] bg-[var(--success-soft)] px-2.5 py-1 text-xs font-medium text-[var(--success-ink)] no-underline transition-colors hover:bg-[var(--surface)]"
            data-testid="task-proposal-spawned-link"
          >
            Task started
            <ArrowUpRight className="size-3" aria-hidden="true" />
          </Link>
        ) : (
          <Cluster gap="2" align="center" justify="between" className="flex-wrap">
            <Cluster gap="1.5" align="center" className="text-[11px] text-[var(--text-muted)]">
              <Info className="size-3 shrink-0" aria-hidden="true" />
              <span>Review + confirm next — Athena pauses at every gate.</span>
            </Cluster>
            <Cluster gap="2" align="center">
              {onDismiss && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onDismiss}
                  data-testid="task-proposal-dismiss"
                >
                  <X className="size-3" aria-hidden="true" />
                  Dismiss
                </Button>
              )}
              {onStart ? (
                <Button
                  size="sm"
                  onClick={() => onStart(proposal)}
                  data-testid="task-proposal-cta"
                >
                  {ctaText}
                  <ArrowUpRight className="size-3" aria-hidden="true" />
                </Button>
              ) : (
                <Link
                  href={proposal.cta_url}
                  className="inline-flex"
                  data-testid="task-proposal-cta"
                >
                  <Button size="sm">
                    {ctaText}
                    <ArrowUpRight className="size-3" aria-hidden="true" />
                  </Button>
                </Link>
              )}
            </Cluster>
          </Cluster>
        )}
      </div>
    </Card>
  );
}

/** Resolve `domain_id` → display name. Cheap GET; failure falls back to a
 *  truncated UUID so the card still renders. Null in → null out (unscoped
 *  proposals show no chip). */
function useDomainName(domainId: string | null): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    if (!domainId) {
      setName(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const caps = await api.domains.list();
        if (cancelled) return;
        const found = caps.find((c) => c.id === domainId);
        setName(found ? found.name : domainId.slice(0, 8));
      } catch {
        if (!cancelled) setName(domainId.slice(0, 8));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [domainId]);
  return name;
}

function TypeChip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
      {label}
    </span>
  );
}

function DomainChip({ name }: { name: string }) {
  return (
    <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
      {name}
    </span>
  );
}
