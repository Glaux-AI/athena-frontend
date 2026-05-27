"use client";

/**
 * §3.6 r6 — GateBannerActions.
 *
 * The three action buttons rendered to the right of the gate metadata in
 * `<GateBanner>`. Approve is single-click optimistic (the button enters a
 * `loading` state and POSTs; toast on failure surfaces the error and the
 * banner re-renders via the `onResolved` re-fetch). Reject opens the
 * `<RejectGateModal>`, which owns its own validation + submit. Handoff is
 * only meaningful on `gate_key === 'prd_signoff_complete'` per
 * `handoffGate()`'s 422 contract, so it's conditionally rendered.
 *
 * `opened_by_kind` / `opened_by_id` are surfaced as `data-*` attributes on
 * the action cluster so downstream consumers (audit log, telemetry, E2E
 * tests) can correlate the actor that opened the gate with the actor that
 * resolved it without a second fetch. Per ADR-027 #19 — closing a gate
 * does NOT auto-merge a PR; the BE just resolves the gate row and lets
 * the orchestrator decide what to do next.
 */

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Check, GitBranch, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Cluster } from "@/components/layout/primitives";
import { RejectGateModal } from "@/components/runs/gates/reject-gate-modal";
import { approveGate, handoffGate, ApiError } from "@/lib/api/gates";

/** Only this gate_key supports the PRD → Implement handoff button. */
export const HANDOFF_GATE_KEY = "prd_signoff_complete";

export function GateBannerActions({
  runId,
  gateKey,
  opened_by_kind,
  opened_by_id,
  onResolved,
}: {
  runId: string;
  gateKey: string;
  /** Surfaced as `data-opened-by-kind` so audit / E2E can correlate the
   *  actor that opened the gate with the actor that resolved it. */
  opened_by_kind: "user" | "agent" | "system" | null;
  opened_by_id: string | null;
  /** Called after a successful approve / reject / handoff so the banner
   *  re-fetches the open-gate list (this gate transitions off the list). */
  onResolved: () => void;
}) {
  const [approving, setApproving] = useState<boolean>(false);
  const [handoffing, setHandoffing] = useState<boolean>(false);
  const [rejectOpen, setRejectOpen] = useState<boolean>(false);

  const handleApprove = useCallback(async () => {
    if (approving || handoffing) return;
    setApproving(true);
    try {
      await approveGate(runId, gateKey);
      toast.success(`Approved ${gateKey}.`);
      onResolved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't approve the gate.");
    } finally {
      setApproving(false);
    }
  }, [runId, gateKey, approving, handoffing, onResolved]);

  const handleHandoff = useCallback(async () => {
    if (approving || handoffing) return;
    setHandoffing(true);
    try {
      await handoffGate(runId, gateKey, "implement");
      toast.success("Spun up an Implement run from this PRD.");
      onResolved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't hand off to Implement.");
    } finally {
      setHandoffing(false);
    }
  }, [runId, gateKey, approving, handoffing, onResolved]);

  const showHandoff = gateKey === HANDOFF_GATE_KEY;
  const anyInflight = approving || handoffing;

  return (
    <>
      <Cluster
        gap="2"
        align="center"
        data-testid="gate-banner-actions"
        data-opened-by-kind={opened_by_kind ?? ""}
        data-opened-by-id={opened_by_id ?? ""}
      >
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setRejectOpen(true)}
          disabled={anyInflight}
          data-action="reject"
          aria-label="Reject this gate"
        >
          <X className="size-3.5" aria-hidden />
          Reject
        </Button>
        {showHandoff && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void handleHandoff()}
            disabled={anyInflight}
            loading={handoffing}
            data-action="handoff"
            aria-label="Approve and hand off to Implement"
          >
            <GitBranch className="size-3.5" aria-hidden />
            Handoff to Implement
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="primary"
          onClick={() => void handleApprove()}
          disabled={anyInflight}
          loading={approving}
          data-action="approve"
          aria-label="Approve this gate"
        >
          <Check className="size-3.5" aria-hidden />
          Approve
        </Button>
      </Cluster>
      {rejectOpen && (
        <RejectGateModal
          runId={runId}
          gateKey={gateKey}
          onClose={() => setRejectOpen(false)}
          onRejected={() => {
            setRejectOpen(false);
            onResolved();
          }}
        />
      )}
    </>
  );
}
