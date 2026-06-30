"use client";

/**
 * AgentActivity - THE agent-activity surface, shared by chat and tasks.
 *
 * Chat and the /work cockpit used to run two parallel systems (ChatActivity +
 * ChatToolsRecap vs StageWorklog) with copy-pasted, already-diverged verb/icon
 * maps and raw tool dumps. This component is the single source of truth for
 * how Athena's work renders anywhere in the app:
 *
 *   - one verb/icon map per step kind (`plan` … `delegate`, plus `said` for the
 *     model's visible answer text and `reason` for its actual chain-of-thought);
 *   - one friendly tool vocabulary - every tool call reads as a verb phrase
 *     ("Searching the codebase · query=auth") with the raw tool name one hover
 *     away (title attr), never a Python repr. Detail, simply presented - no
 *     magic, no jargon dump;
 *   - one fold container: auto-expands while the agent is live, then ROLLS UP
 *     on completion (the answer leads; the receipts stay one click away);
 *   - one motion language: new live rows enter with `.animate-row-in`
 *     (globals.css; reduced-motion safe), tool rows settle their icon with a
 *     pop, the live header pulses.
 *
 * The chat and task surfaces stay thin adapters that project their own row
 * sources (`StreamingTurn` / persisted `ChatToolCall[]` / ledger + task SSE)
 * onto `ActivityRow`.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Brain,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Eye,
  GitBranch,
  MessageSquareText,
  PencilLine,
  ScrollText,
  Wrench,
} from "lucide-react";

import type { Ref } from "@/lib/api/client";
import { cn } from "@/lib/cn";

/** One normalized step - every surface projects onto this shape. */
export interface ActivityRow {
  key: string;
  /** plan | reason | said | retrieve | read | draft | write | delegate | tool */
  kind: string;
  /** Raw tool name for tool rows; null for agent-step rows. */
  toolName: string | null;
  /** For tool rows: the args summary. For step rows: the step text. */
  summary: string;
  /** For tool rows: what the call produced ("3 results" / "error: …"). */
  resultSummary?: string;
  inputRefs?: Ref[];
  outputRefs?: Ref[];
  status: "ok" | "running" | "error";
  order: number;
  /** Row arrived over the live stream (gets the entrance animation). */
  live?: boolean;
  /** External-executor attribution ("Claude Code") - names the actor on
   *  `said` rows; absent = Athena. */
  actor?: string | null;
  /** Optional ID for nesting rows (sub-agents). */
  id?: string | undefined;
  /** Optional parent ID for nesting rows (sub-agents). */
  parentId?: string | undefined;
}

const ACTIVITY_KIND_VERB: Record<string, string> = {
  plan: "Planning",
  reason: "Reasoning",
  said: "Athena said",
  retrieve: "Retrieving",
  read: "Reading",
  draft: "Drafting",
  write: "Writing",
  delegate: "Delegating",
};

const ACTIVITY_KIND_ICON: Record<string, typeof Brain> = {
  plan: Brain,
  reason: Brain,
  said: MessageSquareText,
  retrieve: Eye,
  read: Eye,
  draft: PencilLine,
  write: PencilLine,
  delegate: GitBranch,
};

/** Friendly verb phrase per tool - the whole catalog, so a tool call never
 *  renders as a bare snake_case identifier. Unknown tools humanize. */
const TOOL_LABEL: Record<string, string> = {
  hybrid_retrieval: "Searching the codebase",
  lookup_symbol: "Looking up a symbol",
  list_repo_nodes: "Listing repo files",
  graph: "Tracing the code graph",
  get_node_detail: "Inspecting a file's blueprint",
  read_repo_file: "Reading a file",
  grep_repo: "Scanning for literal text",
  read_rules: "Checking the rules",
  search_decisions: "Searching past decisions",
  invoke_skill: "Running a skill",
  doc_resolver: "Searching the org's docs",
  list_blueprint_tocs: "Listing blueprint sections",
  read_blueprint_section: "Reading the blueprint",
  query_org: "Checking org facts",
  review_prior_steps: "Reviewing prior steps",
  review_decisions: "Reviewing your decisions",
  read_artifact: "Reading an artifact",
  read_reference: "Reading a reference",
  list_related_artifacts: "Listing related work",
  get_artifact_provenance: "Tracing provenance",
  submit_stage_result: "Submitting the result",
  submit_subtask_plan: "Submitting the plan",
  propose_code_edits: "Proposing code edits",
  open_pull_request: "Opening the pull request",
  apply_pr_fix: "Pushing the build fix",
  task: "Delegating an investigation",
  ask_clarification: "Asking you a question",
  clarify_scope: "Narrowing the scope",
  propose_task: "Proposing a task",
  propose_domain_note: "Proposing a domain note",
  // Task-spine reads + settings awareness (chat action catalog).
  list_tasks: "Listing tasks",
  get_task: "Reading a task",
  get_task_thread: "Reading a task thread",
  read_my_settings: "Checking your settings",
  // Mutation proposals (each renders a confirm card).
  propose_task_update: "Proposing a task edit",
  propose_task_cancel: "Proposing to cancel a task",
  propose_task_delete: "Proposing to delete a task",
  propose_add_dependency: "Proposing a task link",
  propose_thread_post: "Proposing a task comment",
  propose_run_stage: "Proposing to run a phase",
  propose_refine_stage: "Proposing to refine a phase",
  propose_gate_decision: "Proposing a gate decision",
};

export function friendlyToolLabel(name: string | null | undefined): string {
  if (!name) return "Using a tool";
  const known = TOOL_LABEL[name];
  if (known) return known;
  const words = name.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Using a tool";
}

/** Live-headline verb for a step kind ("Athena is planning…"). */
export function activityHeadlineVerb(kind: string | null | undefined): string {
  const verb = (kind && ACTIVITY_KIND_VERB[kind]) || "Working";
  return verb === "Athena said" ? "Answering" : verb;
}

export function AgentActivity({
  headline,
  rows,
  live,
  resetKey,
  connection,
  defaultExpanded = false,
  maxHeightClass = "max-h-64",
  emptyText,
  loading = false,
}: {
  /** Header line, e.g. "Athena's work · Draft" or "Athena is reasoning…". */
  headline: ReactNode;
  rows: ActivityRow[];
  /** The agent is streaming NOW - auto-expands; the live→settled edge ROLLS
   *  the log up (collapse), keeping the step count as the receipt. */
  live: boolean;
  /** Scopes the roll-up edge - switching context (another stage) must not
   *  collapse the log the user is looking at. */
  resetKey?: string;
  /** Stream connection health dot (task cockpit); omit to hide. */
  connection?: "connecting" | "open" | "closed" | "error";
  defaultExpanded?: boolean;
  maxHeightClass?: string;
  emptyText?: string;
  loading?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded || live);
  const scrollRef = useRef<HTMLDivElement>(null);
  // The key that was live last render - collapse only when THAT key settles.
  const liveKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const key = resetKey ?? "";
    if (live) {
      liveKeyRef.current = key;
      setExpanded(true);
      return;
    }
    if (liveKeyRef.current === key && liveKeyRef.current !== null) {
      // Roll up: the run this log was streaming just finished.
      liveKeyRef.current = null;
      setExpanded(false);
    }
  }, [live, resetKey]);

  // Auto-scroll the expanded log to newest when rows arrive.
  useEffect(() => {
    if (!expanded || !scrollRef.current) return;
    const el = scrollRef.current;
    const nearBottom = el.scrollHeight - el.clientHeight - el.scrollTop < 80;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [rows, expanded]);

  const count = rows.length;

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)] shadow-[var(--shadow-1)]">
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          // The default live-agent indicator: a soft accent glow sweeps left→right
          // across the header's background while the agent is streaming.
          live && "athena-working",
        )}
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <span
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-md",
            live
              ? "bg-[var(--primary-soft)] text-[var(--primary)]"
              : "bg-[var(--surface-3)] text-[var(--text-muted)]",
          )}
        >
          <ScrollText className={cn("size-3", live && "animate-pulse")} aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-[var(--text)]">{headline}</span>
        <span className="hidden shrink-0 items-center gap-2 text-xs text-[var(--text-muted)] sm:flex">
          {count > 0 && (
            <span className="tabular-nums">
              {count} step{count === 1 ? "" : "s"}
            </span>
          )}
          {connection && (
            <>
              <span
                className={cn(
                  "ml-1 size-1.5 rounded-full",
                  connection === "open"
                    ? "animate-pulse bg-[var(--success)]"
                    : connection === "error"
                      ? "bg-[var(--danger)]"
                      : "bg-[var(--text-muted)]",
                )}
                aria-hidden
              />
              <span className="sr-only">
                {connection === "open" ? "Live" : connection === "error" ? "Reconnecting" : "Idle"}
              </span>
            </>
          )}
        </span>
        {expanded ? (
          <ChevronUp className="size-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
        )}
      </button>

      {expanded && (
        <div
          ref={scrollRef}
          className={cn("overflow-auto border-t border-[var(--border)] px-3 py-3", maxHeightClass)}
          // Announce only newly-appended steps while live - never the whole
          // list (a context switch swaps every row; announcing floods the SR).
          aria-live={live ? "polite" : "off"}
          aria-relevant="additions"
        >
          {loading && count === 0 ? (
            <div className="flex flex-col gap-2" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-5 animate-pulse rounded bg-[var(--surface-3)]" />
              ))}
            </div>
          ) : count === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">{emptyText ?? "No steps yet."}</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {(() => {
                const rootRows: ActivityRow[] = [];
                const childrenMap = new Map<string, ActivityRow[]>();
                rows.forEach(r => {
                  if (r.parentId && rows.some(parent => parent.id === r.parentId)) {
                    const children = childrenMap.get(r.parentId) || [];
                    children.push(r);
                    childrenMap.set(r.parentId, children);
                  } else {
                    rootRows.push(r);
                  }
                });
                return rootRows.map(row => (
                  <ActivityRowView key={row.key} row={row} childrenMap={childrenMap} />
                ));
              })()}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

/** How many characters of a prose row show before the clamp kicks in. */
const PROSE_CLAMP_AT = 280;

function ActivityRowView({ row, childrenMap }: { row: ActivityRow; childrenMap?: Map<string, ActivityRow[]> | undefined }) {
  const isTool = row.toolName !== null || row.kind === "tool" || row.kind === "tool_call" || row.kind === "tool_result";
  const content = isTool ? <ToolRow row={row} /> : <StepRow row={row} />;
  const children = row.id && childrenMap ? childrenMap.get(row.id) : undefined;

  if (children && children.length > 0) {
    return (
      <li className={cn("text-sm", row.live && "animate-row-in")}>
        <details open className="group">
          <summary className={cn("flex items-start gap-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden", isTool && "ml-6")}>
            <div className="flex items-center gap-1.5 mt-0.5">
              <ChevronDown className="size-3 shrink-0 text-[var(--text-muted)] transition-transform duration-200 group-open:-rotate-180" />
            </div>
            <div className="flex-1 min-w-0 flex items-start gap-2">{content}</div>
          </summary>
          <ul className="flex flex-col gap-2 mt-2 ml-6 border-l border-[var(--border)] pl-3">
            {children.map(child => (
              <ActivityRowView key={child.key} row={child} childrenMap={childrenMap} />
            ))}
          </ul>
        </details>
      </li>
    );
  }

  return (
    <li
      className={cn(
        "flex items-start gap-2 text-sm",
        isTool && "ml-6",
        row.live && "animate-row-in",
      )}
    >
      {content}
    </li>
  );
}

function ToolRow({ row }: { row: ActivityRow }) {
  return (
    <>
      {row.status === "running" ? (
        <Wrench
          className="mt-0.5 size-4 shrink-0 animate-pulse text-[var(--text-muted)]"
          aria-hidden
        />
      ) : row.status === "error" ? (
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-[var(--danger)]" aria-hidden />
      ) : (
        <Check className="animate-pop-in mt-0.5 size-4 shrink-0 text-[var(--success)]" aria-hidden />
      )}
      <span className="min-w-0 flex-1 text-xs">
        <span className="font-medium text-[var(--text)]" title={row.toolName ?? undefined}>
          {friendlyToolLabel(row.toolName)}
        </span>
        {row.summary && <span className="text-[var(--text-muted)]"> · {row.summary}</span>}
        {row.status === "running" ? (
          <span className="ml-1.5 text-[var(--text-muted)]">running…</span>
        ) : (
          row.resultSummary && (
            <span
              className={cn(
                row.resultSummary.startsWith("error")
                  ? "text-[var(--danger)]"
                  : "text-[var(--text-muted)]",
              )}
            >
              {" "}
              → {row.resultSummary}
            </span>
          )
        )}
        <RefChips row={row} />
      </span>
    </>
  );
}

function StepRow({ row }: { row: ActivityRow }) {
  const Icon = ACTIVITY_KIND_ICON[row.kind] ?? Brain;
  // An external executor's `said` rows carry its name ("Claude Code said")
  // so the worklog never mis-attributes another agent's words to Athena.
  const verb =
    row.kind === "said" && row.actor
      ? `${row.actor} said`
      : ACTIVITY_KIND_VERB[row.kind];
  const [open, setOpen] = useState(false);
  const long = row.summary.length > PROSE_CLAMP_AT;
  const isThinking = row.kind === "reason";

  return (
    <>
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          row.status === "error" ? "text-[var(--danger)]" : "text-[var(--primary)]",
        )}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        {verb && <span className="text-[var(--text-muted)]">{verb}: </span>}
        <span
          className={cn(
            isThinking ? "text-[var(--text-muted)]" : "text-[var(--text)]",
            "whitespace-pre-wrap",
          )}
        >
          {long && !open ? `${row.summary.slice(0, PROSE_CLAMP_AT).trimEnd()}…` : row.summary}
        </span>
        {long && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="ml-1.5 text-xs text-[var(--primary)] underline-offset-2 hover:underline"
            aria-expanded={open}
          >
            {open ? "less" : "more"}
          </button>
        )}
        <RefChips row={row} />
        {row.status === "error" && (
          <span className="mt-1 flex items-center gap-1 text-xs text-[var(--danger-ink)]">
            <CircleAlert className="size-3" aria-hidden />
            step failed
          </span>
        )}
      </span>
    </>
  );
}

function RefChips({ row }: { row: ActivityRow }) {
  const inputs = row.inputRefs ?? [];
  const outputs = row.outputRefs ?? [];
  if (inputs.length === 0 && outputs.length === 0) return null;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1">
      {inputs.map((r, i) => (
        <RefChip key={`in-${i}-${r.id}`} refItem={r} direction="in" />
      ))}
      {outputs.map((r, i) => (
        <RefChip key={`out-${i}-${r.id}`} refItem={r} direction="out" />
      ))}
    </span>
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
