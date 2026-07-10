"use client";

/**
 * ActivityThread - the task page's main-column "Activity & comments" (the
 * cockpit's old right-rail DecisionSidebar, evolved for Work OS rehaul W2/W8;
 * the file keeps its historical name).
 *
 * Renders the task's `ThreadEntry[]` (the clarification system generalized -
 * the transparent record + decision log that feeds the knowledge graph).
 * Every human input and every logged Athena decision lives here:
 *
 *   input_request (pending)  → a STAGE GATE (gate_key set) renders as a quiet
 *       "waiting on your review" pointer - gates are resolved in the stage
 *       panel, never answered here. A genuine agent question (no gate_key)
 *       renders the inline composer; answers post via `api.tasks.answerInput`.
 *   approval | rejection | decision → a logged decision row.
 *   artifact_ref             → "Authored / Revised <kind> v<version>".
 *   agent_message | user_message | steer | comment → a message row with the
 *       author's avatar; @mentions in bodies render highlighted.
 *
 * One thread, two voices: the foot composer posts `comment` by default (human
 * discussion - notifies owner/watchers, resolves @mentions server-side, never
 * auto-folded into agent context). When the task is railed AND delegated /
 * running, a small Comment | Steer toggle appears - Steer posts kind `steer`
 * (the instruction channel; text-only here, the stage composer keeps the
 * model/effort steer). Typing `@` offers a small member list; picking inserts
 * a single-token handle (the email local-part when the display name has
 * spaces - the backend parser matches both, case-insensitively).
 */

import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
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
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Pill } from "@/components/ui/pill";
import { Segmented } from "@/components/ui/segmented";
import { focusRing } from "@/components/ui/focus";
import { Cluster, Stack } from "@/components/layout/primitives";
import { ActorAvatar } from "@/components/mascot/actor-avatar";
import { formatDateTime } from "@/lib/utils/format";
import { cn } from "@/lib/cn";

const KIND_LABEL: Record<ThreadEntry["kind"], string> = {
  agent_message: "Athena",
  user_message: "Message",
  steer: "Steer",
  comment: "Comment",
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

export function ActivityThread({
  taskId,
  entries,
  isLoading,
  onChanged,
  memberById,
  meId,
  members,
  canSteer,
}: {
  taskId: string;
  entries: ThreadEntry[];
  isLoading: boolean;
  /** Re-fetch the thread after an answer / comment / steer posts. */
  onChanged: () => void | Promise<void>;
  /** Org members keyed by user id - resolves WHO approved/steered. Any org
   *  member can act on a task, so a human author renders their real name;
   *  "You" is reserved for the signed-in user's own entries. */
  memberById: Map<string, Member>;
  meId: string | null;
  /** The org roster - feeds the composer's @mention assist. */
  members: Member[];
  /** True when the task is railed AND (delegated to Athena or a stage is
   *  running) - shows the Comment | Steer segmented toggle. */
  canSteer: boolean;
}) {
  const pendingCount = useMemo(
    () => entries.filter((e) => e.kind === "input_request" && e.status === "pending").length,
    [entries],
  );
  // The thread grows fast (every decision + steer + artifact ref). Show the most
  // recent entries; older ones fold behind a "See earlier" toggle so the column
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
        <CardHeader rule className="mb-0">
          <Cluster justify="between" align="center">
            <Cluster gap="2" align="center">
              <MessageCircle
                className={cn(
                  "size-4",
                  pendingCount > 0 ? "text-[var(--warning-ink)]" : "text-[var(--text-muted)]",
                )}
                aria-hidden
              />
              <span className="text-sm font-semibold">Activity &amp; comments</span>
              {pendingCount > 0 && (
                <Pill size="sm" tone="warning" dot>
                  {pendingCount} pending
                </Pill>
              )}
            </Cluster>
            <span className="text-xs text-[var(--text-muted)]">{entries.length}</span>
          </Cluster>
        </CardHeader>

        {isLoading && entries.length === 0 ? (
          <Stack gap="2" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-12 rounded-md" />
            ))}
          </Stack>
        ) : entries.length === 0 ? (
          <EmptyState
            className="py-6"
            icon={<MessageCircle className="size-5" aria-hidden />}
            title="Nothing yet"
            description="Comments, decisions, and steers all land here as the task moves - one transparent record, humans and Athena together."
          />
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

        <ThreadComposer
          taskId={taskId}
          members={members}
          meId={meId}
          canSteer={canSteer}
          onPosted={onChanged}
        />
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
            <Eyebrow className="text-[var(--warning-ink)]">Waiting on your review</Eyebrow>
            <span className="ml-auto shrink-0 whitespace-nowrap text-micro text-[var(--text-muted)]">
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
            <Eyebrow className="text-[var(--warning-ink)]">Athena needs your input</Eyebrow>
            <span className="ml-auto shrink-0 whitespace-nowrap text-micro text-[var(--text-muted)]">
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
          <Eyebrow className={ink}>{KIND_LABEL[entry.kind]}</Eyebrow>
          <span className="ml-auto shrink-0 whitespace-nowrap text-micro text-[var(--text-muted)]">
            {formatDateTime(entry.created_at)}
          </span>
        </Cluster>
        {entry.body && <ClampText text={entry.body} className="mt-1.5" />}
        <p className="mt-1 text-micro text-[var(--text-muted)]">by {who}</p>
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
          <span className="ml-auto shrink-0 whitespace-nowrap text-micro text-[var(--text-muted)]">
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
          <span className="ml-auto shrink-0 whitespace-nowrap text-micro text-[var(--text-muted)]">
            {formatDateTime(entry.created_at)}
          </span>
        </Cluster>
        {entry.body && <ClampText text={entry.body} className="mt-1.5" />}
      </li>
    );
  }

  // Plain message / steer / comment.
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
          <Pill size="sm">{kindLabel}</Pill>
          <span className="ml-auto shrink-0 whitespace-nowrap text-micro text-[var(--text-muted)]">
            {formatDateTime(entry.created_at)}
          </span>
        </Cluster>
        {entry.body && <ClampText text={entry.body} mentions />}
      </Stack>
    </li>
  );
}

/** `@handle` tokens in comment/message bodies - display-name or email
 *  local-part shaped (the backend parser's vocabulary). */
const MENTION_RE = /@[A-Za-z0-9][A-Za-z0-9._-]*/g;

/** Wrap `@handle` tokens in a subtle primary-tinted span. */
function withMentions(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(MENTION_RE)) {
    const at = match.index ?? -1;
    if (at < 0) continue;
    // Only a token at the start or after whitespace is a mention (an email
    // mid-word, e.g. "a@b.com", is not).
    if (at > 0 && !/\s/.test(text[at - 1] ?? "")) continue;
    if (at > last) parts.push(text.slice(last, at));
    parts.push(
      <span
        key={`m-${at}`}
        className="rounded bg-[var(--primary-soft)] px-0.5 font-medium text-[var(--primary)]"
      >
        {match[0]}
      </span>,
    );
    last = at + match[0].length;
  }
  if (parts.length === 0) return text;
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** A thread entry body, clamped to a few lines with a per-row "more / less"
 *  toggle so a long steer or decision note never balloons the column. Short
 *  bodies render plainly with no button. `mentions` highlights @handles. */
function ClampText({
  text,
  className,
  mentions = false,
}: {
  text: string;
  className?: string;
  mentions?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const long = text.length > BODY_CLAMP_AT;
  const shown = long && !open ? `${text.slice(0, BODY_CLAMP_AT).trimEnd()}…` : text;
  return (
    <p className={cn("text-sm text-[var(--text)] whitespace-pre-wrap", className)}>
      {mentions ? withMentions(shown) : shown}
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

/** The single-token handle inserted for a picked member: the display name
 *  when it has no spaces, else the email local-part (the backend parser
 *  matches both, case-insensitively). */
function mentionHandle(m: Member): string {
  if (m.display_name && !/\s/.test(m.display_name)) return m.display_name;
  const local = m.email.split("@")[0];
  return local || m.display_name.replace(/\s+/g, "");
}

/** The @-token under the caret, or null when the caret isn't in one. */
function mentionTokenAt(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const match = /(^|\s)@([A-Za-z0-9._-]*)$/.exec(before);
  if (!match) return null;
  const start = caret - match[2]!.length - 1; // index of the "@"
  return { start, query: match[2]! };
}

/** How many mention suggestions the assist shows at once. */
const MENTION_SUGGESTIONS_CAP = 6;

/**
 * The thread's foot composer. Posts `comment` by default; the Comment | Steer
 * segmented toggle appears only when steering makes sense (`canSteer`). Steer
 * here is text-only - the stage composer keeps the model/effort steer. Meta+
 * Enter submits; typing `@` offers a small member list (click to insert).
 */
function ThreadComposer({
  taskId,
  members,
  meId,
  canSteer,
  onPosted,
}: {
  taskId: string;
  members: Member[];
  meId: string | null;
  canSteer: boolean;
  onPosted: () => void | Promise<void>;
}) {
  const [mode, setMode] = useState<"comment" | "steer">("comment");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // canSteer can flip off mid-session (stage settles) - never post a steer then.
  const kind = canSteer && mode === "steer" ? "steer" : "comment";

  const suggestions = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return members
      .filter((m) => m.user_id !== meId)
      .filter(
        (m) =>
          !q ||
          m.display_name.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q),
      )
      .slice(0, MENTION_SUGGESTIONS_CAP);
  }, [mention, members, meId]);

  const syncMention = (value: string, caret: number | null) => {
    setMention(caret === null ? null : mentionTokenAt(value, caret));
  };

  const insertMention = (m: Member) => {
    if (!mention) return;
    const handle = mentionHandle(m);
    const caret = textareaRef.current?.selectionStart ?? text.length;
    const next = `${text.slice(0, mention.start)}@${handle} ${text.slice(caret)}`;
    setText(next);
    setMention(null);
    // Put the caret right after the inserted handle.
    const pos = mention.start + handle.length + 2;
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    });
  };

  const submit = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await api.tasks.postThread(taskId, { kind, body });
      setText("");
      setMention(null);
      await onPosted();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't post that.");
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape" && mention) {
      e.preventDefault();
      setMention(null);
      return;
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <Stack gap="1.5" className="border-t border-[var(--border)] pt-3">
      {canSteer && (
        <Segmented
          ariaLabel="Post as"
          value={mode}
          onChange={setMode}
          className="w-fit"
          options={[
            { value: "comment", label: "Comment" },
            {
              value: "steer",
              label: "Steer",
              icon: <Sparkles className="size-3" aria-hidden />,
            },
          ]}
        />
      )}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={text}
          rows={3}
          disabled={busy}
          onChange={(e) => {
            setText(e.target.value);
            syncMention(e.target.value, e.target.selectionStart);
          }}
          onClick={(e) => syncMention(text, e.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            // Delay so a click on a suggestion row lands before the list hides.
            setTimeout(() => setMention(null), 150);
          }}
          placeholder={
            kind === "steer"
              ? "Tell Athena what to change or focus on…"
              : "Write a comment… @ mentions a teammate"
          }
          aria-label={kind === "steer" ? "Steer Athena" : "Write a comment"}
          className="min-h-[64px] w-full resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60"
        />
        {mention && suggestions.length > 0 && (
          <div
            role="listbox"
            aria-label="Mention a teammate"
            className="glass-panel absolute bottom-full left-0 z-[var(--z-popover)] mb-1 w-64 p-1"
          >
            {suggestions.map((m) => (
              <button
                key={m.user_id}
                type="button"
                role="option"
                aria-selected={false}
                // onMouseDown so the pick beats the textarea's blur.
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(m);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <ActorAvatar name={m.display_name} size={20} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[var(--text)]">{m.display_name}</span>
                  <span className="block truncate text-xs text-[var(--text-muted)]">
                    @{mentionHandle(m)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <Cluster justify="between" align="center">
        <span className="text-micro text-[var(--text-subtle)]">
          {kind === "steer"
            ? "Steers guide Athena's next model call - they never advance a gate."
            : "Comments notify the owner and watchers. @mentions notify that person."}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={busy}
          disabled={busy || !text.trim()}
          onClick={() => void submit()}
        >
          <Send className="size-3.5" />
          {kind === "steer" ? "Steer Athena" : "Comment"}
        </Button>
      </Cluster>
    </Stack>
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
        <Eyebrow className="text-[var(--warning-ink)]">{KIND_LABEL.input_request}</Eyebrow>
        {req.blocking && (
          <Pill size="sm" tone="warning" dot>
            Blocking
          </Pill>
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
              className={cn(
                "rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--text)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] disabled:opacity-50",
                focusRing,
              )}
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
