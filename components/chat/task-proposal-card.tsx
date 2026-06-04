"use client";

/**
 * TaskProposalCard — renders the `propose_task` envelope inside a chat thread.
 *
 * The chat sub-agent calls `propose_task` instead of spawning runs directly
 * (per ADR-027 #19 — agent suggests, user assents). The backend persists the
 * envelope on a `task_created` ChatMessage and the FE renders this card from
 * `message.payload`. Clicking "Start task" deep-links to `/runs/new` with the
 * proposal_id so the user can confirm + tweak before the run is minted.
 *
 * WCAG 2.1 AA: the card is a `<section>` with `aria-label`; the CTA is a
 * standard `<Button>` link (keyboard reachable + screen-reader visible).
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, FileText, Hammer, Wrench, Info } from "lucide-react";

import type { TaskProposalPayload } from "@/lib/api/client";
import { api } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { formatUsd } from "@/lib/utils/format";

const KIND_ICON = {
  prd: FileText,
  implement: Hammer,
  quickfix: Wrench,
} as const;

const KIND_LABEL = {
  prd: "PRD",
  implement: "Implement",
  quickfix: "Quick fix",
} as const;

const GOAL_TRUNCATE_AT = 200;

export function TaskProposalCard({
  proposal,
  spawnedRunId,
}: {
  proposal: TaskProposalPayload;
  /** When set, the user already clicked the CTA and a run was minted —
   *  the card renders a "Task X created" pill instead of the Start CTA. */
  spawnedRunId?: string | null;
}) {
  const Icon = KIND_ICON[proposal.kind] ?? FileText;
  const kindLabel = KIND_LABEL[proposal.kind] ?? proposal.kind;
  const truncatedGoal =
    proposal.goal.length > GOAL_TRUNCATE_AT
      ? `${proposal.goal.slice(0, GOAL_TRUNCATE_AT).trimEnd()}…`
      : proposal.goal;
  const capabilityName = useCapabilityName(proposal.capability_id);
  const ctaText = proposal.cta_text || "Start task";

  return (
    <Card
      variant="elevated"
      role="region"
      aria-label={`Task proposal: ${kindLabel}`}
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
          <KindChip label={kindLabel} />
          {capabilityName && <CapabilityChip name={capabilityName} />}
          <BudgetChip usd={proposal.budget_usd} />
        </Cluster>

        <p className="text-sm leading-relaxed text-[var(--text)]">
          {truncatedGoal}
        </p>
      </Stack>

      <div className="border-t border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 shadow-[var(--inner-highlight)]">
        {spawnedRunId ? (
          <Link
            href={`/runs/${encodeURIComponent(spawnedRunId)}`}
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
              <span>Clicking confirms — Athena pauses at every gate.</span>
            </Cluster>
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
          </Cluster>
        )}
      </div>
    </Card>
  );
}

/** Resolve `capability_id` → display name. Cheap GET; failure falls back
 *  to a truncated UUID so the card still renders. */
function useCapabilityName(capabilityId: string): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const caps = await api.capabilities.list();
        if (cancelled) return;
        const found = caps.find((c) => c.id === capabilityId);
        setName(found ? found.name : capabilityId.slice(0, 8));
      } catch {
        if (!cancelled) setName(capabilityId.slice(0, 8));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [capabilityId]);
  return name;
}

function KindChip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
      {label}
    </span>
  );
}

function CapabilityChip({ name }: { name: string }) {
  return (
    <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
      {name}
    </span>
  );
}

function BudgetChip({ usd }: { usd: number }) {
  const formatted = formatUsd(usd);
  return (
    <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
      Budget {formatted}
    </span>
  );
}
