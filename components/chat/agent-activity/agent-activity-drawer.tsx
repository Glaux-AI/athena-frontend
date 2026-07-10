"use client";

/**
 * AgentActivityDrawer - the full live view of ONE async sub-agent run.
 *
 * Streams the run's activity (tool calls, output, reasoning, status changes)
 * via `useExecutionStream`, and exposes the human-in-the-loop controls the
 * parent agent also has: steer (inject a mid-flight message) and cancel. So the
 * user can see exactly what the sub-agent is doing and intervene cleanly.
 */

import { useState } from "react";
import { Bot, Wrench, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ChatMarkdown } from "@/components/chat/chat-markdown";
import { useStickToBottom } from "@/hooks/use-stick-to-bottom";
import {
  api,
  ApiError,
  type AgentExecution,
  type ExecutionStatus,
} from "@/lib/api/client";
import {
  useExecutionStream,
  type ActivityRow,
} from "@/features/chat/use-execution-stream";

const TERMINAL = new Set<ExecutionStatus>(["completed", "failed", "cancelled"]);

const STATUS_LABEL: Record<ExecutionStatus, string> = {
  queued: "Queued",
  running: "Running",
  steering: "Steering",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function AgentActivityDrawer({
  execution,
  onClose,
  onChanged,
}: {
  execution: AgentExecution;
  onClose: () => void;
  onChanged: () => void;
}) {
  const live = useExecutionStream(execution.id, true);
  const status: ExecutionStatus = live.status ?? execution.status;
  const result = live.result ?? execution.result;
  const error = live.error ?? execution.error;
  const isTerminal = TERMINAL.has(status);

  // Keep the live activity pinned to newest as steps stream in - unless the
  // reader scrolled up to re-read an earlier step.
  const { ref: scrollRef, onScroll } = useStickToBottom<HTMLDivElement>([
    live.rows.length,
    result,
    error,
    status,
  ]);

  const [steer, setSteer] = useState("");
  const [busy, setBusy] = useState(false);

  const doCancel = async () => {
    setBusy(true);
    try {
      await api.agentExecutions.cancel(execution.id);
      toast.success("Cancellation requested");
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't cancel the run.");
    } finally {
      setBusy(false);
    }
  };

  const doSteer = async () => {
    const message = steer.trim();
    if (!message) return;
    setBusy(true);
    try {
      await api.agentExecutions.steer(execution.id, message);
      setSteer("");
      toast.success("Steer message sent");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't steer the run.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[var(--z-drawer)] flex justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-[var(--overlay)]"
        onClick={onClose}
      />
      <aside className="glass-sheet relative flex h-full w-full max-w-md flex-col !rounded-none !rounded-l-2xl border-y-0 border-r-0">
        <header className="relative flex items-start justify-between gap-3 p-4">
          <hr className="hr-horizon absolute inset-x-0 bottom-0" aria-hidden />
          <div className="flex min-w-0 items-start gap-2.5">
            <Bot className="mt-0.5 size-5 shrink-0 text-[var(--text-muted)]" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-[var(--text)]">
                {execution.subagent_name}
              </div>
              <StatusLine status={status} connected={live.connected} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
          >
            <X className="size-4" />
          </button>
        </header>

        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto p-4">
          <Section label="Task">
            <p className="whitespace-pre-wrap text-sm text-[var(--text-muted)]">
              {execution.prompt || "(no prompt)"}
            </p>
          </Section>

          <Section label="Activity">
            {live.rows.length === 0 ? (
              <p className="text-sm text-[var(--text-subtle)]">
                {isTerminal ? "No activity was recorded." : "Waiting for the agent to start…"}
              </p>
            ) : (
              <ol className="space-y-1.5">
                {live.rows.map((r, i) => (
                  <ActivityRowView key={`${r.seq}-${i}`} row={r} />
                ))}
              </ol>
            )}
          </Section>

          {error && (
            <Section label="Error">
              <p className="rounded-lg border border-[var(--border-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]">
                {error}
              </p>
            </Section>
          )}

          {result && (
            <Section label="Result">
              <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
                <ChatMarkdown content={result} />
              </div>
            </Section>
          )}
        </div>

        {!isTerminal && (
          <footer className="relative space-y-2 p-3">
            <hr className="hr-horizon absolute inset-x-0 top-0" aria-hidden />
            <div className="flex items-end gap-2">
              <textarea
                value={steer}
                onChange={(e) => setSteer(e.target.value)}
                placeholder="Steer the agent mid-run…"
                rows={1}
                className="input max-h-28 min-h-9 flex-1 resize-none text-sm"
                data-testid="execution-steer"
              />
              <Button type="button" onClick={doSteer} disabled={busy || !steer.trim()}>
                Send
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={doCancel}
              disabled={busy}
              className="w-full text-[var(--danger-ink)]"
            >
              Cancel run
            </Button>
          </footer>
        )}
      </aside>
    </div>
  );
}

function StatusLine({
  status,
  connected,
}: {
  status: ExecutionStatus;
  connected: boolean;
}) {
  const live = status === "running" || status === "steering" || status === "queued";
  return (
    <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
      {live && (
        <span
          className="star-dot is-live"
          style={{ "--dot-color": "var(--primary)" } as React.CSSProperties}
          aria-hidden
        />
      )}
      <span>{STATUS_LABEL[status]}</span>
      {live && !connected && (
        <span className="text-[var(--text-subtle)]">· reconnecting…</span>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <Eyebrow className="mb-1.5 block">{label}</Eyebrow>
      {children}
    </div>
  );
}

function ActivityRowView({ row }: { row: ActivityRow }) {
  if (row.kind === "tool") {
    return (
      <li className="flex items-center gap-2 text-sm">
        {row.done ? (
          <Wrench className="size-3.5 shrink-0 text-[var(--success-ink)]" />
        ) : (
          <span
            className="star-dot is-live mx-1 shrink-0"
            style={{ "--dot-color": "var(--primary)" } as React.CSSProperties}
            aria-hidden
          />
        )}
        <span className="font-mono text-xs text-[var(--text)]">{row.name}</span>
        {row.summary && (
          <span className="truncate text-xs text-[var(--text-subtle)]">{row.summary}</span>
        )}
      </li>
    );
  }
  if (row.kind === "reasoning") {
    return (
      <li className="whitespace-pre-wrap rounded-md bg-[var(--surface-2)] px-2 py-1 text-xs italic text-[var(--text-subtle)]">
        {row.text}
      </li>
    );
  }
  if (row.kind === "text") {
    return (
      <li className="whitespace-pre-wrap text-sm text-[var(--text-muted)]">{row.text}</li>
    );
  }
  return (
    <li className="text-xs text-[var(--text-subtle)]">
      → {row.status}
    </li>
  );
}
