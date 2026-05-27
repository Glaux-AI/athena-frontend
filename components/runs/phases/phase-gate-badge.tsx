"use client";

/**
 * PhaseGateBadge — small pill rendering the latest gate verdict for the
 * phase tab's document. Used by every phase-* component so the gate
 * surface is consistent across Spec / Plan / Implement / Review / CI / PR.
 */

import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";

import { cn } from "@/lib/cn";
import type { RunPhaseDocument } from "@/lib/api/client";

type GateState = RunPhaseDocument["gate_state"];

const LABEL: Record<GateState, string> = {
  approved: "Approved",
  rejected: "Rejected",
  pending: "Pending",
  idle: "Idle",
};

const TONE: Record<GateState, string> = {
  approved: "bg-[var(--success-soft)] text-[var(--success)]",
  rejected: "bg-[var(--danger-soft)] text-[var(--danger)]",
  pending: "bg-[var(--warning-soft)] text-[var(--warning)]",
  idle: "bg-[var(--surface-2)] text-[var(--text-muted)]",
};

export function PhaseGateBadge({ gateState }: { gateState: GateState }) {
  const Icon =
    gateState === "approved"
      ? CheckCircle2
      : gateState === "rejected"
        ? XCircle
        : gateState === "pending"
          ? Loader2
          : Circle;
  const spin = gateState === "pending" ? "animate-spin" : "";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        TONE[gateState],
      )}
      data-testid="phase-gate-badge"
      data-state={gateState}
    >
      <Icon className={cn("size-3", spin)} aria-hidden />
      {LABEL[gateState]}
    </span>
  );
}
