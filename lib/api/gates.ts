/**
 * §3.6 r6 — Approval-gate API wrappers (approve / reject / handoff).
 *
 * Per ADR-032 (BE bends to FE) the wire shape is FE-authoritative and
 * snake_case: every endpoint below posts to
 *
 *   POST /v1/runs/{run_id}/gates/{gate_key}/close
 *
 * with one of three canonical payloads:
 *
 *   { outcome: "approved" }
 *   { outcome: "rejected", reason: <string ≥ 10 chars> }
 *   { outcome: "approved", handoff_to: "implement" }
 *
 * The third form is the PRD → Implement handoff: it closes the
 * `prd_signoff_complete` gate as approved AND signals the orchestrator to
 * spin up an Implement-track run from the just-signed-off PRD body.
 *
 * The list endpoint lives in `hooks/use-open-gate.ts` (it powers the
 * banner re-validation); this file is the mutation surface.
 *
 * Per ADR-027 #19 — these endpoints close gates only. Handoff sets a
 * downstream run kind; it does NOT auto-merge a PR.
 */

import { apiFetch } from "@/lib/api/client";

/**
 * Wire shape of a single approval gate. Mirrors the BE `GateOut` model
 * (athena/api/routers/gates.py) plus the FE-authoritative `opened_by_*`
 * and `payload` fields the banner surfaces. The BE returns null for the
 * `opened_by_*` fields on rows pre-dating §3.6 r6.
 */
export interface OpenGate {
  id: string;
  run_id: string;
  phase_key: string | null;
  gate_key: string;
  status: "pending" | "approved" | "rejected" | "expired";
  opened_at: string;
  resolved_at: string | null;
  resolver_user_id: string | null;
  note: string | null;
  opened_by_kind?: "user" | "agent" | "system" | null;
  opened_by_id?: string | null;
  payload?: Record<string, unknown> | null;
}

/** Body of every close call. The three exported helpers narrow the shape. */
export interface GateCloseRequest {
  outcome: "approved" | "rejected";
  reason?: string;
  handoff_to?: "implement";
}

function closeUrl(runId: string, gateKey: string): string {
  return `/v1/runs/${encodeURIComponent(runId)}/gates/${encodeURIComponent(gateKey)}/close`;
}

/**
 * Approve the open gate. Closes it as `approved`; the orchestrator resumes
 * the run on the next agent tick. Returns the updated gate row.
 *
 * Throws `ApiError` on non-2xx.
 */
export function approveGate(runId: string, gateKey: string): Promise<OpenGate> {
  const body: GateCloseRequest = { outcome: "approved" };
  return apiFetch<OpenGate>(closeUrl(runId, gateKey), {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Reject the open gate with a required `reason`. Mirrors the BE 1000-char
 * cap on `note`; the modal enforces a 2000-char ceiling but BE truncates
 * to 1000 to match `GateDecisionIn.note`. Caller must pass a non-empty
 * reason; the modal validates `≥ 10 / ≤ 2000` before calling.
 */
export function rejectGate(
  runId: string,
  gateKey: string,
  reason: string,
): Promise<OpenGate> {
  const body: GateCloseRequest = { outcome: "rejected", reason };
  return apiFetch<OpenGate>(closeUrl(runId, gateKey), {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Close the gate as approved AND signal the PRD → Implement handoff. Only
 * meaningful on `gate_key === 'prd_signoff_complete'`; calling on any other
 * gate is a programming error and the BE returns 422.
 *
 * `handoffTo` is the discriminator the BE switches on; today only
 * `"implement"` is defined.
 */
export function handoffGate(
  runId: string,
  gateKey: string,
  handoffTo: "implement",
): Promise<OpenGate> {
  const body: GateCloseRequest = { outcome: "approved", handoff_to: handoffTo };
  return apiFetch<OpenGate>(closeUrl(runId, gateKey), {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Re-export for callers that want to narrow on `ApiError` (used as a
 * value via `instanceof`) without an extra import from the underlying
 * client module. */
export { ApiError } from "@/lib/api/client";
