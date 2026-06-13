"use client";

/**
 * SuggestedNext (SUG-3) - Athena's follow-up proposals after a task's final stage.
 * Each shows the proposed task + the **rationale** and **source** it is grounded
 * in; the user accepts (→ a real child task on the spine) or dismisses. Athena
 * proposes, the user decides - nothing is created without a click (ADR-027 #19).
 * Renders nothing when there are no pending proposals (additive, never clutter).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  ApiError,
  api,
  type TaskSuggestion,
  type TaskType,
} from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Cluster, Stack } from "@/components/layout/primitives";
import { TASK_TYPE_META } from "@/lib/work/task-meta";

export function SuggestedNext({
  taskId,
  suggestions,
  onChanged,
}: {
  taskId: string;
  suggestions: TaskSuggestion[];
  onChanged: () => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <Card>
      <Stack gap="3">
        <Cluster gap="2" align="center" className="border-b border-[var(--border)] pb-2.5">
          <Sparkles className="size-4 text-[var(--primary)]" aria-hidden />
          <span className="text-sm font-semibold">Suggested next</span>
          <span className="text-xs text-[var(--text-muted)]">Athena proposes - you decide</span>
        </Cluster>
        <Stack gap="2" as="ul">
          {suggestions.map((s) => (
            <SuggestionRow
              key={s.id}
              taskId={taskId}
              suggestion={s}
              onChanged={onChanged}
            />
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}

function SuggestionRow({
  taskId,
  suggestion,
  onChanged,
}: {
  taskId: string;
  suggestion: TaskSuggestion;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "dismiss" | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(suggestion.proposed_title);
  const [body, setBody] = useState(suggestion.proposed_body);
  const Icon =
    TASK_TYPE_META[suggestion.proposed_type as TaskType]?.Icon ??
    TASK_TYPE_META.chore.Icon;

  const accept = async () => {
    setBusy("accept");
    try {
      // Edit-and-accept: only override when the user opened the editor.
      const payload = editing ? { title: title.trim(), body: body.trim() } : {};
      const task = await api.tasks.acceptSuggestion(taskId, suggestion.id, payload);
      toast.success(`${task.display_id} created`, {
        description: editing ? title.trim() : suggestion.proposed_title,
        action: { label: "Open", onClick: () => router.push(`/work/${task.id}`) },
      });
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't create the task");
      setBusy(null);
    }
  };

  const dismiss = async () => {
    setBusy("dismiss");
    try {
      await api.tasks.dismissSuggestion(taskId, suggestion.id);
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't dismiss it");
      setBusy(null);
    }
  };

  return (
    <li className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <Stack gap="2">
        <div className="flex items-center gap-2">
          <Icon className="size-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
          {editing ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Task title"
              className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--text)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
          ) : (
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text)]">
              {suggestion.proposed_title}
            </span>
          )}
        </div>
        <p className="text-xs leading-relaxed text-[var(--text-muted)]">
          <span className="font-medium text-[var(--text-subtle)]">Why: </span>
          {suggestion.rationale}
        </p>
        {editing ? (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Scope / description…"
            aria-label="Task scope"
            className="min-h-[64px] w-full resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
        ) : suggestion.source_refs && suggestion.source_refs.length > 0 ? (
          <Cluster gap="1.5" align="center" className="flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
              Based on
            </span>
            {suggestion.source_refs.map((r, i) => (
              <span
                key={`${i}-${r.id}`}
                className="rounded-full bg-[var(--surface-3)] px-1.5 py-0.5 text-[11px] text-[var(--text-muted)]"
              >
                {r.label || r.kind}
              </span>
            ))}
          </Cluster>
        ) : null}
        <Cluster gap="2" align="center">
          <Button
            variant="secondary"
            size="sm"
            onClick={accept}
            loading={busy === "accept"}
            disabled={busy !== null || (editing && !title.trim())}
          >
            {editing ? "Create task" : "Accept"}
          </Button>
          {!editing && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(true)}
              disabled={busy !== null}
            >
              Edit
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={editing ? () => setEditing(false) : dismiss}
            loading={busy === "dismiss"}
            disabled={busy !== null}
          >
            {editing ? "Cancel" : "Dismiss"}
          </Button>
        </Cluster>
      </Stack>
    </li>
  );
}
