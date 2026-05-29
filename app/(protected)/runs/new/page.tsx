"use client";

/**
 * /runs/new — confirm a task proposal (or create a run from scratch).
 *
 * Two arrival modes:
 *   1. From a chat `propose_task` CTA — query carries `proposal_id` +
 *      `capability_id` + `kind` + `goal` + `budget_usd`. We pre-fill the
 *      confirm panel; clicking "Start task" POSTs `/v1/runs` with the
 *      `proposal_id` field set so the backend can close the loop on the
 *      originating `chat_messages.task_created` row.
 *   2. Direct nav (no proposal_id) — the existing <NewRunDialog> opens
 *      inline so the user can still launch a run from the run-launcher
 *      flow (capability + intent + form fields).
 *
 * Success → push to /runs/[id].
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { api, ApiError, type Capability } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { NewRunDialog } from "@/components/runs/new-run-dialog";

type ProposalKind = "prd" | "implement" | "quickfix";
const KIND_LABEL: Record<ProposalKind, string> = {
  prd: "PRD",
  implement: "Implement",
  quickfix: "Quick fix",
};

function isProposalKind(value: string | null): value is ProposalKind {
  return value === "prd" || value === "implement" || value === "quickfix";
}

export default function NewRunPage() {
  return (
    <Suspense fallback={<NewRunSkeleton />}>
      <NewRunPageInner />
    </Suspense>
  );
}

function NewRunPageInner() {
  const router = useRouter();
  const params = useSearchParams();

  const proposalId = params?.get("proposal_id") ?? null;
  const capabilityId = params?.get("capability_id") ?? null;
  const kindParam = params?.get("kind");
  const goal = params?.get("goal") ?? "";
  const budgetParam = params?.get("budget_usd");
  const kind: ProposalKind | null = isProposalKind(kindParam) ? kindParam : null;
  const budgetUsd = budgetParam ? Number.parseFloat(budgetParam) : null;

  const hasProposal = Boolean(proposalId && capabilityId && kind && goal);
  const [dialogOpen, setDialogOpen] = useState(!hasProposal);

  if (hasProposal && proposalId && capabilityId && kind) {
    return (
      <ProposalConfirmPanel
        proposalId={proposalId}
        capabilityId={capabilityId}
        kind={kind}
        goal={goal}
        budgetUsd={budgetUsd}
        onCancel={() => router.back()}
      />
    );
  }

  return (
    <Stack gap="6">
      <Stack gap="1">
        <Link
          href="/runs"
          className="inline-flex w-fit items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          <ArrowLeft className="size-3" aria-hidden="true" />
          Tasks
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">New task</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Start a PRD or an Implement run. Athena will pause at every gate.
        </p>
      </Stack>
      <NewRunDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) router.push("/runs");
        }}
        onCreated={(run) => router.push(`/runs/${run.id}`)}
      />
    </Stack>
  );
}

function ProposalConfirmPanel({
  proposalId,
  capabilityId,
  kind,
  goal,
  budgetUsd,
  onCancel,
}: {
  proposalId: string;
  capabilityId: string;
  kind: ProposalKind;
  goal: string;
  budgetUsd: number | null;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const capName = useCapabilityName(capabilityId);

  const intent = useMemo(() => {
    // The BE's `CreateRunIn.intent` is "prd" | "implement" | "quickfix";
    // pass it through as-is so the dispatcher routes the right phase tree.
    return kind;
  }, [kind]);

  const onStart = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const run = await api.runs.create(goal, capabilityId, intent, proposalId);
      toast.success("Task started — Athena is loading context.");
      router.push(`/runs/${run.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't start the task.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack gap="6">
      <Stack gap="1">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex w-fit items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          <ArrowLeft className="size-3" aria-hidden="true" />
          Back
        </button>
        <h1 className="text-2xl font-semibold tracking-tight">Start task</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Athena drafted this proposal from your chat. Review and confirm to spawn the run.
        </p>
      </Stack>

      <Card data-testid="proposal-confirm-panel" className="bg-[var(--surface-2)]">
        <Stack gap="4">
          <Cluster gap="2" align="center">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Proposal
            </span>
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
              {KIND_LABEL[kind]}
            </span>
            {capName && (
              <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
                {capName}
              </span>
            )}
            {budgetUsd !== null && (
              <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
                Budget ${budgetUsd.toFixed(2)}
              </span>
            )}
          </Cluster>

          <Stack gap="1">
            <span className="text-xs font-medium text-[var(--text-muted)]">Goal</span>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text)]">{goal}</p>
          </Stack>

          {error && (
            <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)] p-2">
              <Cluster gap="2" align="center">
                <AlertTriangle className="size-4 text-[var(--danger)]" aria-hidden="true" />
                <p className="text-xs text-[var(--danger)]">{error}</p>
              </Cluster>
            </Card>
          )}

          <Cluster justify="between" align="center">
            <span className="text-xs text-[var(--text-subtle)]">
              <Sparkles className="mr-1 inline size-3 text-[var(--primary)]" aria-hidden="true" />
              Athena pauses at every gate for human approval.
            </span>
            <Cluster gap="2">
              <Button variant="ghost" onClick={onCancel} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={onStart} disabled={submitting} data-testid="proposal-start-btn">
                {submitting && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
                Start task
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </Button>
            </Cluster>
          </Cluster>
        </Stack>
      </Card>
      {/* intent + capability echoed for screen readers / debugging only */}
      <span className="sr-only" data-testid="proposal-intent">{intent}</span>
    </Stack>
  );
}

function useCapabilityName(capabilityId: string): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cap: Capability = await api.capabilities.get(capabilityId);
        if (!cancelled) setName(cap.name);
      } catch {
        if (!cancelled) setName(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [capabilityId]);
  return name;
}

function NewRunSkeleton() {
  return (
    <Stack gap="4">
      <div className="h-8 w-32 animate-pulse rounded bg-[var(--surface-2)]" />
      <div className="h-40 animate-pulse rounded-lg bg-[var(--surface-2)]" />
    </Stack>
  );
}
