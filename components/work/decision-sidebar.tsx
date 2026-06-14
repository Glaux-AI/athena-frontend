"use client";

/**
 * DecisionSidebar - the cockpit's right-column thread / input log.
 *
 * Renders the task's `ThreadEntry[]` (the clarification system generalized - the
 * transparent record + decision log that feeds the knowledge graph). Every
 * human input and every logged Athena decision lives here:
 *
 *   input_request (pending)  → a STAGE GATE (gate_key set) renders as a quiet
 *       "waiting on your review" pointer - gates are resolved in the stage
 *       panel via `gateStage`, never answered here. A genuine agent question
 *       (no gate_key) renders the inline composer; answers post via
 *       `api.tasks.answerInput`.
 *   approval | rejection | decision → a logged decision row.
 *   artifact_ref            → "Authored / Revised <kind> v<version>".
 *   agent_message | user_message | steer → a plain message row.
 *
 * Read-only log: there is ONE input on the cockpit - the stage composer at the
 * foot of the main column (steer before a run / note at the gate). The thread is
 * the transparent record; pending agent questions still answer inline here.
 */

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Eye,
  FileText,
  MessageCircle,
  Send,
  Sparkles,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import {
  ApiError,
  api,
  type Member,
  type ThreadEntry,
  type ThreadInputAnswer,
} from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Cluster, Stack } from "@/components/layout/primitives";
import { ActorAvatar } from "@/components/mascot/actor-avatar";
import { formatDateTime } from "@/lib/utils/format";
import { cn } from "@/lib/cn";

const KIND_LABEL: Record<ThreadEntry["kind"], string> = {
  agent_message: "Athena",
  user_message: "Message",
  steer: "Steer",
  input_request: "Needs your input",
  input_answer: "Answered",
  decision: "Decision",
  artifact_ref: "Artifact",
  approval: "Approved",
  rejection: "Changes requested",
};

/** How many of the most recent entries the thread shows before "See earlier". */
const THREAD_COLLAPSE_AT = 6;
/** Characters of an entry body shown before the per-row "more" clamp. */
const BODY_CLAMP_AT = 240;

export function DecisionSidebar({
  taskId,
  entries,
  isLoading,
  onChanged,
  memberById,
  meId,
}: {
  taskId: string;
  entries: ThreadEntry[];
  isLoading: boolean;
  /** Re-fetch the thread after an answer / message posts. */
  onChanged: () => void | Promise<void>;
  /** Org members keyed by user id - resolves WHO approved/steered. Any org
   *  member can act on a task, so a human author renders their real name;
   *  "You" is reserved for the signed-in user's own entries. */
  memberById: Map<string, Member>;
  meId: string | null;
}) {
  const pendingCount = useMemo(
    () => entries.filter((e) => e.kind === "input_request" && e.status === "pending").length,
    [entries],
  );
  // The thread grows fast (every decision + steer + artifact ref). Show the most
  // recent entries; older ones fold behind a "See earlier" toggle so the rail
  // stays scannable. A pending input request always stays visible (it needs an
  // answer), so it never hides behind the fold.
  const [showAll, setShowAll] = useState(false);
  const sorted = useMemo(() => [...entries].sort((a, b) => a.seq - b.seq), [entries]);
  const hiddenCount = Math.max(0, sorted.length - THREAD_COLLAPSE_AT);
  // A pending input request hidden behind the fold force-expands the list (it
  // needs an answer) - and the toggle hides in that case so it can't read as a
  // no-op.
  const foldLocked =
    pendingCount > 0 &&
    !sorted
      .slice(-THREAD_COLLAPSE_AT)
      .some((e) => e.kind === "input_request" && e.status === "pending");
  const forceAll = showAll || foldLocked;
  const visible = forceAll ? sorted : sorted.slice(-THREAD_COLLAPSE_AT);

  return (
    <Card>
      <Stack gap="3">
        <Cluster justify="between" align="center" className="border-b border-[var(--border)] pb-2.5">
          <Cluster gap="2" align="center">
            <MessageCircle
              className={cn(
                "size-4",
                pendingCount > 0 ? "text-[var(--warning-ink)]" : "text-[var(--text-muted)]",
              )}
              aria-hidden
            />
            <span className="text-sm font-semibold">Thread · input log</span>
            {pendingCount > 0 && (
              <span className="rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--warning-ink)]">
                {pendingCount} pending
              </span>
            )}
          </Cluster>
          <span className="text-xs text-[var(--text-muted)]">{entries.length}</span>
        </Cluster>

        <p className="text-xs text-[var(--text-muted)]">
          Every human input and every Athena action is captured here, with who - the transparent
          record + decision log that feeds the knowledge graph.
        </p>

        {isLoading && entries.length === 0 ? (
          <Stack gap="2" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-md bg-[var(--surface-2)]" />
            ))}
          </Stack>
        ) : entries.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            Nothing yet. Inputs, decisions, and steers all land here as the task moves.
          </p>
        ) : (
          <Stack gap="2.5">
            {hiddenCount > 0 && !foldLocked && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                aria-expanded={showAll}
                className="self-start rounded text-xs font-medium text-[var(--primary)] transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                {showAll
                  ? "Show fewer"
                  : `See ${hiddenCount} earlier ${hiddenCount === 1 ? "entry" : "entries"}`}
              </button>
            )}
            <Stack gap="2.5" as="ul">
              {visible.map((entry) => (
                <ThreadEntryRow
                  key={entry.id}
                  taskId={taskId}
                  entry={entry}
                  onChanged={onChanged}
                  memberById={memberById}
                  meId={meId}
                />
              ))}
            </Stack>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

function ThreadEntryRow({
  taskId,
  entry,
  onChanged,
  memberById,
  meId,
}: {
  taskId: string;
  entry: ThreadEntry;
  onChanged: () => void | Promise<void>;
  memberById: Map<string, Member>;
  meId: string | null;
}) {
  // WHO did this. A human author is named (any org member can approve or
  // steer - a hardcoded "You" misattributed every teammate's decision);
  // "You" only when it really is the signed-in user.
  const who =
    entry.author_kind === "agent"
      ? "Athena"
      : entry.author_kind === "external_agent"
        ? "Coding agent"
        : entry.author_kind === "system"
          ? "System"
          : entry.author_id && meId && entry.author_id === meId
            ? "You"
            : (entry.author_id
                ? memberById.get(entry.author_id)?.display_name
                : undefined) ?? "A teammate";
  // The kind chip for an agent_message says WHO authored it - an external
  // MCP agent's note must not wear the "Athena" label.
  const kindLabel =
    entry.kind === "agent_message" && entry.author_kind === "external_agent"
      ? "Coding agent"
      : KIND_LABEL[entry.kind];

  // Pending input request. A STAGE GATE (gate_key set) is resolved in the
  // stage panel - the thread shows a quiet pointer, never a second answer
  // surface (answering a gate here would consume the row without the FSM
  // transition). Genuine agent questions keep the inline composer.
  if (entry.kind === "input_request" && entry.status === "pending" && entry.input_request) {
    if (entry.input_request.gate_key) {
      return (
        <li className="rounded-md border border-[var(--border)] border-l-2 border-l-[var(--warning)] bg-[var(--surface-2)] p-3">
          <Cluster gap="2" align="center">
            <Eye className="size-3.5 text-[var(--warning-ink)]" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--warning-ink)]">
              Waiting on your review
            </span>
            <span className="ml-auto shrink-0 whitespace-nowrap text-[10px] text-[var(--text-muted)]">
              {formatDateTime(entry.created_at)}
            </span>
          </Cluster>
          <p className="mt-1.5 text-sm">{entry.input_request.question}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Approve or request changes in the stage panel.
          </p>
        </li>
      );
    }
    if (entry.input_request.question_kind === "clarification") {
      // The clarify checkpoint's typed answer card lives in the stage panel -
      // the thread shows a quiet pointer so it is never answered in two places.
      return (
        <li className="rounded-md border border-[var(--border)] border-l-2 border-l-[var(--warning)] bg-[var(--surface-2)] p-3">
          <Cluster gap="2" align="center">
            <MessageCircle className="size-3.5 text-[var(--warning-ink)]" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--warning-ink)]">
              Athena needs your input
            </span>
            <span className="ml-auto shrink-0 whitespace-nowrap text-[10px] text-[var(--text-muted)]">
              {formatDateTime(entry.created_at)}
            </span>
          </Cluster>
          <p className="mt-1.5 text-sm">{entry.input_request.question}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Answer in the stage panel to resume Athena.
          </p>
        </li>
      );
    }
    return (
      <li className="rounded-md border border-[var(--border)] border-l-2 border-l-[var(--warning)] bg-[var(--surface-2)] p-3">
        <InputRequestRow taskId={taskId} entry={entry} onAnswered={onChanged} />
      </li>
    );
  }

  // Logged decisions (approval / rejection / decision) - neutral rows; the
  // icon + label carry the state hue, the container stays calm.
  if (entry.kind === "approval" || entry.kind === "rejection" || entry.kind === "decision") {
    const ink =
      entry.kind === "rejection"
        ? "text-[var(--danger-ink)]"
        : entry.kind === "approval"
        ? "text-[var(--success-ink)]"
        : "text-[var(--text)]";
    return (
      <li className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
        <Cluster gap="2" align="center" className="flex-wrap">
          {entry.kind === "approval" ? (
            <CheckCircle2 className={cn("size-3.5", ink)} aria-hidden />
          ) : entry.kind === "rejection" ? (
            <XCircle className={cn("size-3.5", ink)} aria-hidden />
          ) : (
            <Sparkles className={cn("size-3.5", ink)} aria-hidden />
          )}
          <span className={cn("text-xs font-semibold uppercase tracking-wider", ink)}>
            {KIND_LABEL[entry.kind]}
          </span>
          <span className="ml-auto shrink-0 whitespace-nowrap text-[10px] text-[var(--text-muted)]">
            {formatDateTime(entry.created_at)}
          </span>
        </Cluster>
        {entry.body && <ClampText text={entry.body} className="mt-1.5" />}
        <p className="mt-1 text-[10px] text-[var(--text-muted)]">by {who}</p>
      </li>
    );
  }

  // Artifact reference.
  if (entry.kind === "artifact_ref" && entry.artifact_ref) {
    return (
      <li className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
        <Cluster gap="2" align="center">
          <FileText className="size-3.5 text-[var(--primary)]" aria-hidden />
          <span className="text-sm">
            <span className="text-[var(--text-muted)]">
              {who === "Athena" ? "Authored" : "Revised"}{" "}
            </span>
            <span className="font-medium">{entry.artifact_ref.kind.replace(/_/g, " ")}</span>
          </span>
          <span className="ml-auto shrink-0 whitespace-nowrap text-[10px] text-[var(--text-muted)]">
            {formatDateTime(entry.created_at)}
          </span>
        </Cluster>
      </li>
    );
  }

  // Answered input - a compact resolved row.
  if (entry.kind === "input_request" || entry.kind === "input_answer") {
    return (
      <li className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
        <Cluster gap="2" align="center">
          <CheckCircle2 className="size-3.5 text-[var(--success-ink)]" aria-hidden />
          <span className="text-xs text-[var(--text-muted)]">
            {entry.status === "skipped" ? "Skipped" : "Answered"}
          </span>
          <span className="ml-auto shrink-0 whitespace-nowrap text-[10px] text-[var(--text-muted)]">
            {formatDateTime(entry.created_at)}
          </span>
        </Cluster>
        {entry.body && <ClampText text={entry.body} className="mt-1.5" />}
      </li>
    );
  }

  // Plain message / steer.
  return (
    <li className="flex gap-2.5">
      <ActorAvatar
        name={who}
        agent={entry.author_kind === "agent"}
        externalAgent={entry.author_kind === "external_agent"}
        size={26}
      />
      <Stack gap="0.5" className="min-w-0 flex-1">
        <Cluster gap="2" align="center">
          <span className="text-xs font-semibold">{who}</span>
          <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            {kindLabel}
          </span>
          <span className="ml-auto shrink-0 whitespace-nowrap text-[10px] text-[var(--text-muted)]">
            {formatDateTime(entry.created_at)}
          </span>
        </Cluster>
        {entry.body && <ClampText text={entry.body} />}
      </Stack>
    </li>
  );
}

/** A thread entry body, clamped to a few lines with a per-row "more / less"
 *  toggle so a long steer or decision note never balloons the rail (the user's
 *  "collapse the texts" ask). Short bodies render plainly with no button. */
function ClampText({ text, className }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > BODY_CLAMP_AT;
  return (
    <p className={cn("text-sm text-[var(--text)] whitespace-pre-wrap", className)}>
      {long && !open ? `${text.slice(0, BODY_CLAMP_AT).trimEnd()}…` : text}
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="ml-1.5 text-xs font-medium text-[var(--primary)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          {open ? "less" : "more"}
        </button>
      )}
    </p>
  );
}

/** A pending input_request rendered as an answerable affordance. Options →
 *  buttons; otherwise a free-text box. Posts via `api.tasks.answerInput`. */
function InputRequestRow({
  taskId,
  entry,
  onAnswered,
}: {
  taskId: string;
  entry: ThreadEntry;
  onAnswered: () => void | Promise<void>;
}) {
  const req = entry.input_request!;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (answer: ThreadInputAnswer) => {
    setBusy(true);
    try {
      await api.tasks.answerInput(taskId, req.request_id, answer);
      toast.success("Athena will fold your answer in.");
      setText("");
      await onAnswered();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save your answer.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap="2">
      <Cluster gap="2" align="center">
        <MessageCircle className="size-3.5 text-[var(--warning-ink)]" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--warning-ink)]">
          {KIND_LABEL.input_request}
        </span>
        {req.blocking && (
          <span className="rounded-full bg-[var(--warning-soft)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--warning-ink)]">
            Blocking
          </span>
        )}
      </Cluster>
      <p className="text-sm font-medium text-[var(--text)]">{req.question}</p>

      {req.options && req.options.length > 0 ? (
        <Cluster gap="2" className="flex-wrap">
          {req.options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={busy}
              onClick={() => void submit({ request_id: req.request_id, choice_id: opt.id })}
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--text)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] disabled:opacity-50"
            >
              {opt.label}
            </button>
          ))}
        </Cluster>
      ) : (
        <Stack gap="2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Your answer…"
            className="min-h-[56px] w-full resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
          <Cluster>
            <ButtonSend
              disabled={busy || !text.trim()}
              onClick={() => void submit({ request_id: req.request_id, free_text: text.trim() })}
            />
          </Cluster>
        </Stack>
      )}
    </Stack>
  );
}

/** Send button local to the input-request free-text path. Secondary, not a
 *  filled primary - the cockpit's one primary CTA lives in the stage panel
 *  (VIS-1: at most one filled --primary per viewport). */
function ButtonSend({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={onClick}>
      <Send className="size-3.5" />
      Send answer
    </Button>
  );
}

