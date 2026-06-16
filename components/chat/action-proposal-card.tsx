"use client";

/**
 * ActionProposalCard - renders one chat action proposal as an in-chat confirm
 * card (ADR-027 #19: agent suggests, user assents).
 *
 * Chat never mutates state itself. A `propose_*` tool returns an
 * `ActionProposalsPayload` on the assistant message; this card shows what
 * Athena proposes (e.g. "Run the 'plan' stage of FEAT-12") with Confirm /
 * Dismiss. On **Confirm** the FE calls the SAME RBAC-gated `/v1/tasks` endpoint
 * the Work UI uses, so access control is enforced server-side - the card's
 * permission check (`usePermissions().can`) only mirrors it for the CTA's
 * enabled state. The action is applied in place; the card then shows the
 * outcome with a link into `/work`.
 *
 * WCAG 2.1 AA: region with `aria-label`; standard buttons; the disabled CTA
 * keeps a tooltip explaining the permission wall.
 */

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  Link2,
  MessageSquare,
  Pencil,
  Play,
  RefreshCw,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { api, type TaskActionProposal } from "@/lib/api/client";
import { usePermissions } from "@/lib/session/use-permissions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";

type CardStatus = "idle" | "submitting" | "done" | "error";

const ACTION_META: Record<
  TaskActionProposal["action"],
  { Icon: LucideIcon; verb: string; done: string }
> = {
  task_update: { Icon: Pencil, verb: "Apply change", done: "Updated" },
  task_cancel: { Icon: XCircle, verb: "Cancel task", done: "Cancelled" },
  task_delete: { Icon: Trash2, verb: "Delete task", done: "Deleted" },
  task_add_dependency: { Icon: Link2, verb: "Link tasks", done: "Linked" },
  task_thread_post: { Icon: MessageSquare, verb: "Post message", done: "Posted" },
  stage_run: { Icon: Play, verb: "Run phase", done: "Started" },
  stage_refine: { Icon: RefreshCw, verb: "Refine phase", done: "Refining" },
  stage_gate: { Icon: CheckCircle2, verb: "Submit decision", done: "Decided" },
};

/** Call the existing, RBAC-gated endpoint for a confirmed proposal. */
async function applyProposal(p: TaskActionProposal): Promise<void> {
  switch (p.action) {
    case "task_update":
      await api.tasks.patch(p.task_id, p.changes);
      return;
    case "task_cancel":
      await api.tasks.cancel(p.task_id, p.reason, p.note ?? undefined);
      return;
    case "task_delete":
      await api.tasks.delete(p.task_id);
      return;
    case "task_add_dependency":
      await api.tasks.addDependency(p.task_id, {
        depends_on_task_id: p.depends_on_task_id,
        kind: p.dep_kind,
      });
      return;
    case "task_thread_post":
      await api.tasks.postThread(p.task_id, { kind: "user_message", body: p.body });
      return;
    case "stage_run":
      await api.tasks.runStage(p.task_id, p.stage, p.steer ? { steer: p.steer } : undefined);
      return;
    case "stage_refine":
      await api.tasks.refineStage(p.task_id, p.stage, { instruction: p.instruction });
      return;
    case "stage_gate":
      await api.tasks.gateStage(p.task_id, p.stage, {
        decision: p.decision,
        note: p.note,
      });
      return;
  }
}

export function ActionProposalCard({
  proposal,
  disabled = false,
}: {
  proposal: TaskActionProposal;
  /** Streaming / historical context - suppress the action. */
  disabled?: boolean;
}) {
  const p = proposal;
  const { Icon, verb, done } = ACTION_META[p.action];
  const { can } = usePermissions();
  const allowed = can(p.permission);
  const [status, setStatus] = useState<CardStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setStatus("submitting");
    setError(null);
    try {
      await applyProposal(p);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStatus("error");
    }
  };

  return (
    <Card
      variant="elevated"
      role="region"
      aria-label={`Action proposal: ${verb}`}
      className="overflow-hidden p-0"
      data-testid="action-proposal-card"
    >
      <Stack gap="2" className="p-4">
        <Cluster gap="2" align="center" className="flex-wrap">
          <div className="flex size-7 items-center justify-center rounded-md bg-[var(--primary-soft)] text-[var(--primary)] shadow-[var(--shadow-1)]">
            <Icon className="size-4" aria-hidden="true" />
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Athena proposes
          </span>
          <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--text-muted)]">
            {p.task_display_id}
          </span>
        </Cluster>
        <p className="text-sm font-medium leading-snug text-[var(--text)]">{p.summary}</p>
        <p className="truncate text-xs text-[var(--text-subtle)]">{p.task_title}</p>
      </Stack>

      <div className="border-t border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 shadow-[var(--inner-highlight)]">
        {status === "done" ? (
          <Cluster gap="2" align="center" className="flex-wrap">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--success)] bg-[var(--success-soft)] px-2.5 py-1 text-xs font-medium text-[var(--success-ink)]">
              <CheckCircle2 className="size-3" aria-hidden="true" />
              {done}
            </span>
            <Link
              href={`/work/${encodeURIComponent(p.task_id)}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--primary)] no-underline hover:underline"
              data-testid="action-proposal-open"
            >
              Open in Work
              <ArrowUpRight className="size-3" aria-hidden="true" />
            </Link>
          </Cluster>
        ) : !allowed ? (
          <span
            className="text-[11px] text-[var(--text-muted)]"
            title={`Needs the ${p.permission} permission`}
          >
            You do not have permission for this - an org admin must do it.
          </span>
        ) : (
          <Cluster gap="2" align="center" justify="between" className="flex-wrap">
            <span className="text-[11px] text-[var(--text-subtle)]">
              {status === "error" && error
                ? error
                : "You are approving this - Athena pauses at every gate."}
            </span>
            <Cluster gap="2" align="center">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setStatus("done")}
                disabled={disabled || status === "submitting"}
                data-testid="action-proposal-dismiss"
              >
                <X className="size-3" aria-hidden="true" />
                Dismiss
              </Button>
              <Button
                size="sm"
                onClick={confirm}
                loading={status === "submitting"}
                disabled={disabled || status === "submitting"}
                data-testid="action-proposal-confirm"
              >
                {status === "error" ? "Retry" : verb}
              </Button>
            </Cluster>
          </Cluster>
        )}
      </div>
    </Card>
  );
}

/** Stack of confirm cards for an `action_proposals` payload (usually one). */
export function ActionProposalsList({
  proposals,
  disabled = false,
}: {
  proposals: TaskActionProposal[];
  disabled?: boolean;
}) {
  return (
    <Stack gap="2" data-testid="action-proposals">
      {proposals.map((proposal) => (
        <ActionProposalCard
          key={proposal.proposal_id}
          proposal={proposal}
          disabled={disabled}
        />
      ))}
    </Stack>
  );
}
