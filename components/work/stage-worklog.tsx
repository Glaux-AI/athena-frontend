"use client";

/**
 * StageWorklog — the foldable "Athena's work" log for the selected stage.
 *
 * Clones the run `LiveActivityStrip` machinery (collapsible, `max-h-64`
 * auto-scroll on new rows, `KIND_ICON` / `KIND_VERB` maps). Its row list is a
 * merge of two sources:
 *   1. The persisted work ledger (`api.tasks.ledger(id, {stage})`,
 *      `LedgerStep[]`) — what the agent already did (refs only, never bodies).
 *   2. Live appends derived from the task SSE stream's `agent_step` /
 *      `tool_call` / `tool_result` events for this stage.
 *
 * Persisted ledger rows already carry their `Ref` input/output refs and their
 * tool name; live rows are thinner (the typed re-fetch backfills detail). We
 * pair `tool_call` ↔ `tool_result` by call id so a completed call renders its
 * result summary inline. Refs render as small token chips (kind + label).
 *
 * Refs only, never bodies — the detail lives in its natural home and is pulled
 * on demand (product-work-driver-design.md §9).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Brain,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Eye,
  GitBranch,
  PencilLine,
  ScrollText,
  Wrench,
} from "lucide-react";

import type { LedgerStep, Ref } from "@/lib/api/client";
import type { TaskEvent } from "@/features/work/use-task-stream";
import { cn } from "@/lib/cn";

const KIND_ICON: Record<string, typeof Brain> = {
  plan: Brain,
  reason: Brain,
  retrieve: Eye,
  read: Eye,
  draft: PencilLine,
  write: PencilLine,
  delegate: GitBranch,
  tool_call: Wrench,
  tool_result: Wrench,
};

const KIND_VERB: Record<string, string> = {
  plan: "Planning",
  reason: "Reasoning",
  retrieve: "Retrieving",
  read: "Reading",
  draft: "Drafting",
  write: "Writing",
  delegate: "Delegating",
};

/** A normalized worklog row — the common shape persisted ledger rows and live
 *  SSE rows are both projected onto so the renderer is single-path. */
interface WorklogRow {
  key: string;
  kind: string;
  /** Tool name for tool_call / tool_result; null otherwise. */
  toolName: string | null;
  summary: string;
  inputRefs: Ref[];
  outputRefs: Ref[];
  status: string;
  /** call_id for pairing tool_call ↔ tool_result; null otherwise. */
  callId: string | null;
  /** Persisted rows sort by seq; live rows by arrival. */
  order: number;
  live: boolean;
}

function ledgerToRow(step: LedgerStep): WorklogRow {
  return {
    key: `led-${step.id}`,
    kind: step.kind,
    toolName: step.tool_name,
    summary: step.summary,
    inputRefs: step.input_refs ?? [],
    outputRefs: step.output_refs ?? [],
    status: step.status,
    callId: step.call_id,
    order: step.seq,
    live: false,
  };
}

/** Project the live SSE events for this stage onto worklog rows, pairing
 *  tool_call ↔ tool_result by id and dropping the standalone result row once
 *  its call has folded in the summary. */
function liveRows(events: TaskEvent[], stageKey: string, baseOrder: number): WorklogRow[] {
  // First pass: index tool_result summaries by their call id.
  const resultById = new Map<string, { summary: string; refCount: number }>();
  for (const ev of events) {
    if (ev.event !== "tool_result") continue;
    const id = String(ev.data["id"] ?? "");
    if (!id) continue;
    resultById.set(id, {
      summary: String(ev.data["summary"] ?? ""),
      refCount: typeof ev.data["ref_count"] === "number" ? (ev.data["ref_count"] as number) : 0,
    });
  }

  const rows: WorklogRow[] = [];
  let i = 0;
  for (const ev of events) {
    // Only events scoped to this stage (events without a step/stage hint fall
    // through to the active stage — the merged stream is already task-scoped).
    const stepStage = typeof ev.data["stage"] === "string" ? (ev.data["stage"] as string) : null;
    if (stepStage !== null && stepStage !== stageKey) continue;

    if (ev.event === "agent_step") {
      rows.push({
        key: `ev-${ev.id || `${baseOrder}-${i}`}`,
        kind: String(ev.data["kind"] ?? ""),
        toolName: null,
        summary: String(ev.data["text"] ?? ev.data["kind"] ?? ""),
        inputRefs: [],
        outputRefs: [],
        status: "ok",
        callId: null,
        order: baseOrder + i,
        live: true,
      });
      i += 1;
    } else if (ev.event === "tool_call") {
      const id = String(ev.data["id"] ?? "");
      const result = id ? resultById.get(id) : undefined;
      const args = String(ev.data["args_summary"] ?? "");
      rows.push({
        key: `ev-${ev.id || `${baseOrder}-${i}`}`,
        kind: "tool_call",
        toolName: String(ev.data["name"] ?? "tool"),
        summary: result ? result.summary || args : args,
        inputRefs: [],
        outputRefs: [],
        // The paired result resolves the call's status; unpaired = still running.
        status: result ? "ok" : "running",
        callId: id || null,
        order: baseOrder + i,
        live: true,
      });
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
}) {
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    const seeded = ledger.map(ledgerToRow);
    // Live rows that aren't already in the persisted ledger (the typed re-fetch
    // backfills, so once a step is persisted we drop its live twin by call id).
    const persistedCallIds = new Set(seeded.map((r) => r.callId).filter(Boolean));
    const baseOrder = (seeded.at(-1)?.order ?? 0) + 1;
    const live = liveRows(events, stageKey, baseOrder).filter(
      (r) => !(r.callId && persistedCallIds.has(r.callId)),
    );
    return [...seeded, ...live].sort((a, b) => a.order - b.order);
  }, [ledger, events, stageKey]);

  // Auto-scroll the expanded log to newest when rows arrive.
  useEffect(() => {
    if (!expanded || !scrollRef.current) return;
    const el = scrollRef.current;
    const nearBottom = el.scrollHeight - el.clientHeight - el.scrollTop < 80;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [rows, expanded]);

  const stepCount = rows.length;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] shadow-[var(--shadow-1)]">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-3)]"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-controls="stage-worklog-body"
      >
        <ScrollText
          className={cn(
            "size-4 shrink-0",
            status === "open" ? "text-[var(--primary)]" : "text-[var(--text-muted)]",
          )}
          aria-hidden
        />
        <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
          <span className="text-[var(--text-muted)]">Athena&apos;s work</span>
          <span className="text-[var(--text-subtle)]">·</span>
          <span className="truncate text-[var(--text)]">{stageTitle}</span>
        </span>
        <span className="hidden shrink-0 items-center gap-2 text-xs text-[var(--text-muted)] sm:flex">
          {stepCount > 0 && (
            <span>
              {stepCount} step{stepCount === 1 ? "" : "s"}
            </span>
          )}
          <span
            className={cn(
              "ml-1 size-1.5 rounded-full",
              status === "open"
                ? "animate-pulse bg-[var(--success)]"
                : status === "error"
                ? "bg-[var(--danger)]"
                : "bg-[var(--text-muted)]",
            )}
            aria-hidden
            title={status === "open" ? "Live" : status === "error" ? "Reconnecting" : "Idle"}
          />
        </span>
        {expanded ? (
          <ChevronUp className="size-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
        )}
      </button>

      {expanded && (
        <div
          id="stage-worklog-body"
          ref={scrollRef}
          className="max-h-64 overflow-auto border-t border-[var(--border)] px-3 py-3"
          aria-live="polite"
        >
          {ledgerLoading && rows.length === 0 ? (
            <div className="flex flex-col gap-2" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-5 animate-pulse rounded bg-[var(--surface-3)]" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              No steps yet. When Athena runs this stage, every step it takes shows up here —
              or do the step manually and it stays a clean, empty log.
            </p>
          ) : (
            <ol className="flex flex-col gap-2">
              {rows.map((row) => (
                <WorklogRowView key={row.key} row={row} />
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

function WorklogRowView({ row }: { row: WorklogRow }) {
  const Icon = KIND_ICON[row.kind] ?? Brain;
  const isTool = row.kind === "tool_call" || row.kind === "tool_result";
  const verb = KIND_VERB[row.kind];

  return (
    <li className={cn("flex items-start gap-2 text-sm", isTool && "ml-6")}>
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          row.status === "error"
            ? "text-[var(--danger)]"
            : isTool
            ? "text-[var(--text-muted)]"
            : "text-[var(--primary)]",
        )}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        {isTool ? (
          <span className="font-mono text-xs text-[var(--text-muted)]">
            {row.toolName ?? "tool"}
            {row.summary && <span className="text-[var(--text)]"> · {row.summary}</span>}
            {row.status === "running" && (
              <span className="ml-1.5 text-[var(--info-ink)]">running…</span>
            )}
          </span>
        ) : (
          <span>
            {verb && <span className="text-[var(--text-muted)]">{verb}: </span>}
            <span className="text-[var(--text)]">{row.summary}</span>
          </span>
        )}
        {(row.inputRefs.length > 0 || row.outputRefs.length > 0) && (
          <span className="mt-1 flex flex-wrap items-center gap-1">
            {row.inputRefs.map((r, i) => (
              <RefChip key={`in-${i}-${r.id}`} refItem={r} direction="in" />
            ))}
            {row.outputRefs.map((r, i) => (
              <RefChip key={`out-${i}-${r.id}`} refItem={r} direction="out" />
            ))}
          </span>
        )}
        {row.status === "error" && (
          <span className="mt-1 flex items-center gap-1 text-xs text-[var(--danger-ink)]">
            <CircleAlert className="size-3" aria-hidden />
            step failed
          </span>
        )}
      </span>
    </li>
  );
}

/** A small token chip for one provenance `Ref` (kind + label). Input refs read
 *  "←", output refs read "→" so the direction of the data is legible. */
function RefChip({ refItem, direction }: { refItem: Ref; direction: "in" | "out" }) {
  const label = refItem.label || refItem.id;
  return (
    <span
      className={cn(
        "inline-flex max-w-[220px] items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        direction === "out"
          ? "bg-[var(--success-soft)] text-[var(--success-ink)]"
          : "bg-[var(--surface-3)] text-[var(--text-muted)]",
      )}
      title={`${refItem.kind}: ${label}`}
    >
      <span aria-hidden>{direction === "out" ? "→" : "←"}</span>
      <span className="uppercase tracking-wider opacity-70">{refItem.kind}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}
