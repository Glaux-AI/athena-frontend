"use client";

/**
 * StageWorklog — the foldable "Athena's work" log for the selected stage.
 *
 * Thin adapter over the shared <AgentActivity> surface (components/agent/
 * agent-activity.tsx — ONE activity component across chat + tasks). This file
 * owns only the task-specific row sourcing; presentation, fold/roll-up,
 * motion, and the friendly tool vocabulary live in the shared component.
 *
 * Rows merge two sources:
 *   1. The persisted work ledger (`api.tasks.ledger(id, {stage})`,
 *      `LedgerStep[]`) — what the agent already did (refs only, never bodies).
 *      tool_call ↔ tool_result rows pair by call id into ONE row.
 *   2. Live appends from the task SSE stream's `agent_step` / `tool_call` /
 *      `tool_result` events for this stage — deduped against the persisted
 *      ledger by `step_id` (agent steps) AND call id (tools), so the mid-run
 *      ledger refetch never doubles a row.
 *
 * Refs only, never bodies — the detail lives in its natural home and is pulled
 * on demand (product-work-driver-design.md §9).
 */

import { useMemo } from "react";

import { AgentActivity, type ActivityRow } from "@/components/agent/agent-activity";
import type { LedgerStep } from "@/lib/api/client";
import type { TaskEvent } from "@/features/work/use-task-stream";

/** Pair persisted tool_call ↔ tool_result ledger rows by call id into one
 *  row per call (args + "→ result"), and project everything onto the shared
 *  ActivityRow shape. */
function ledgerRows(steps: LedgerStep[]): ActivityRow[] {
  const resultByCall = new Map<string, LedgerStep>();
  for (const s of steps) {
    if (s.kind === "tool_result" && s.call_id) resultByCall.set(s.call_id, s);
  }
  const rows: ActivityRow[] = [];
  for (const s of steps) {
    if (s.kind === "tool_result" && s.call_id && resultByCall.has(s.call_id)) {
      // Folded into its tool_call row below — no standalone result row.
      continue;
    }
    const isToolCall = s.kind === "tool_call";
    const result = isToolCall && s.call_id ? resultByCall.get(s.call_id) : undefined;
    const row: ActivityRow = {
      key: `led-${s.id}`,
      kind: isToolCall || s.kind === "tool_result" ? "tool" : s.kind,
      toolName: s.tool_name,
      summary: s.summary,
      inputRefs: s.input_refs ?? [],
      outputRefs: [...(s.output_refs ?? []), ...(result?.output_refs ?? [])],
      status: s.status === "error" || result?.status === "error" ? "error" : "ok",
      order: s.seq,
      live: false,
    };
    if (result?.summary) row.resultSummary = result.summary;
    rows.push(row);
  }
  return rows;
}

/** Live rows carry their pairing/dedup keys alongside the shared shape. */
interface LiveActivityRow extends ActivityRow {
  stepId: string | null;
  callId: string | null;
}

/** Project the live SSE events for this stage onto rows, pairing
 *  tool_call ↔ tool_result by id and dropping the standalone result row once
 *  its call has folded in the summary. */
function liveRows(
  events: TaskEvent[],
  stageKey: string,
  baseOrder: number,
): LiveActivityRow[] {
  // First pass: index tool_result summaries by their call id.
  const resultById = new Map<string, { summary: string }>();
  for (const ev of events) {
    if (ev.event !== "tool_result") continue;
    const id = String(ev.data["id"] ?? "");
    if (!id) continue;
    resultById.set(id, { summary: String(ev.data["summary"] ?? "") });
  }

  const rows: LiveActivityRow[] = [];
  let i = 0;
  for (const ev of events) {
    // Only events scoped to this stage (events without a stage hint fall
    // through to the active stage — the merged stream is already task-scoped).
    const stepStage = typeof ev.data["stage"] === "string" ? (ev.data["stage"] as string) : null;
    if (stepStage !== null && stepStage !== stageKey) continue;

    if (ev.event === "agent_step") {
      rows.push({
        key: `ev-${ev.id || `${baseOrder}-${i}`}`,
        kind: String(ev.data["kind"] ?? ""),
        toolName: null,
        summary: String(ev.data["text"] ?? ev.data["kind"] ?? ""),
        status: "ok",
        order: baseOrder + i,
        live: true,
        stepId: String(ev.data["step_id"] ?? "") || null,
        callId: null,
      });
      i += 1;
    } else if (ev.event === "tool_call") {
      const id = String(ev.data["id"] ?? "");
      const result = id ? resultById.get(id) : undefined;
      const row: LiveActivityRow = {
        key: `ev-${ev.id || `${baseOrder}-${i}`}`,
        kind: "tool",
        toolName: String(ev.data["name"] ?? "tool"),
        summary: String(ev.data["args_summary"] ?? ""),
        // The paired result resolves the call's status; unpaired = running.
        status: result ? "ok" : "running",
        order: baseOrder + i,
        live: true,
        stepId: String(ev.data["step_id"] ?? "") || null,
        callId: id || null,
      };
      if (result?.summary) row.resultSummary = result.summary;
      rows.push(row);
      i += 1;
    }
    // tool_result rows are folded into their tool_call above — no standalone row.
  }
  return rows;
}

export function StageWorklog({
  stageTitle,
  ledger,
  ledgerLoading,
  events,
  stageKey,
  status,
  isRunning = false,
}: {
  stageTitle: string;
  /** Persisted work ledger for this stage (seed). */
  ledger: LedgerStep[];
  ledgerLoading: boolean;
  /** Live task-stream events (the cockpit's full event list — we filter here). */
  events: TaskEvent[];
  stageKey: string;
  /** Stream connection status — drives the live dot. */
  status: "connecting" | "open" | "closed" | "error";
  /** The selected stage is actively running — auto-expand; on settle the
   *  shared component rolls the log up (the receipts stay one click away). */
  isRunning?: boolean;
}) {
  const rows = useMemo(() => {
    const seeded = ledgerRows(ledger);
    // Dedup live twins against the persisted ledger: agent steps by the
    // ledger row id the BE stamps on every event (`step_id`), tool rows by
    // call id. Without the step_id half, every plan/reason/said row rendered
    // twice the moment the mid-run ledger refetch landed.
    const persistedIds = new Set(ledger.map((s) => s.id));
    const persistedCallIds = new Set(
      ledger.map((s) => s.call_id).filter((c): c is string => Boolean(c)),
    );
    const baseOrder = (seeded.at(-1)?.order ?? 0) + 1;
    const live = liveRows(events, stageKey, baseOrder).filter((r) => {
      if (r.stepId && persistedIds.has(r.stepId)) return false;
      if (r.callId && persistedCallIds.has(r.callId)) return false;
      return true;
    });
    return [...seeded, ...live].sort((a, b) => a.order - b.order);
  }, [ledger, events, stageKey]);

  return (
    <AgentActivity
      headline={
        <>
          <span className="text-[var(--text-muted)]">Athena&apos;s work</span>
          <span className="text-[var(--text-subtle)]"> · </span>
          <span>{stageTitle}</span>
        </>
      }
      rows={rows}
      live={isRunning}
      resetKey={stageKey}
      connection={status}
      loading={ledgerLoading}
      emptyText={
        "No steps yet. When Athena runs this stage, every step it takes shows up here — or do the step manually and it stays a clean, empty log."
      }
    />
  );
}
