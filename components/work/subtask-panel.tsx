"use client";

/**
 * SubtaskPanel (SUB-4) - a task's subtasks in execution (topological) order,
 * each row marked **Ready** (every prerequisite is done) or **Waiting on** the
 * specific tasks it needs first. The order + readiness come from the
 * dependency-aware `/subtree` read; the user sees a sequence and a plain-language
 * reason, never a bare dim row (legible, never magic).
 *
 * Manual breakdown (Work OS rehaul W8): when the panel is given a `taskId`
 * (+ `onChanged`), it grows an "Add subtask" quick-row at the foot (title +
 * type, defaulting to the plain `task`) and a "Blocked by" section - the
 * parent task's own coordination edges, each removable, plus a small
 * search-org-tasks picker to add one. Decompose is no longer the only way to
 * get children. Read-only callers (the film) just omit the extras.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import { Ban, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";

import {
  ApiError,
  api,
  type SubtaskNode,
  type Task,
  type TaskType,
} from "@/lib/api/client";
import { Cluster, Stack } from "@/components/layout/primitives";
import { TaskStatusPill } from "@/components/ui/task-status-pill";
import { TaskIdChip } from "@/components/work/task-id-chip";
import { TASK_TYPE_META } from "@/lib/work/task-meta";
import { cn } from "@/lib/cn";

/** Create-order for the quick-row's type select - plain `task` first (W1). */
const SUBTASK_TYPE_ORDER: TaskType[] = [
  "task",
  "feature",
  "implementation",
  "design",
  "bug",
  "incident",
  "spike",
  "chore",
  "test",
];

export function SubtaskPanel({
  subtasks,
  loading,
  taskId,
  dependsOn,
  onChanged,
}: {
  subtasks: SubtaskNode[];
  loading: boolean;
  /** The parent task - enables the add-subtask + dependency affordances. */
  taskId?: string;
  /** The parent task's own blockers (`task.depends_on`). */
  dependsOn?: string[];
  /** Re-fetch the subtree/task after a create / dep change. */
  onChanged?: () => void | Promise<void>;
}) {
  const editable = Boolean(taskId && onChanged);
  if (loading && subtasks.length === 0) {
    return (
      <div className="flex flex-col gap-1.5" aria-hidden>
        {[0, 1].map((i) => (
          <div key={i} className="h-11 animate-pulse rounded-md bg-[var(--surface-2)]" />
        ))}
      </div>
    );
  }
  return (
    <Stack gap="2.5">
      {subtasks.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">
          {editable
            ? "None yet - add one below, or let Athena break this down. Pieces appear in the order they can be worked."
            : "None yet - when Athena breaks this down, the pieces appear here in the order they can be worked, each marked Ready or waiting on what comes first."}
        </p>
      ) : (
        <Stack gap="1.5" as="ul">
          {subtasks.map((node) => (
            <SubtaskRow key={node.id} node={node} />
          ))}
        </Stack>
      )}
      {editable && taskId && onChanged && (
        <>
          <AddSubtaskRow taskId={taskId} onChanged={onChanged} />
          <BlockedBySection
            taskId={taskId}
            dependsOn={dependsOn ?? []}
            onChanged={onChanged}
          />
        </>
      )}
    </Stack>
  );
}

function SubtaskRow({ node }: { node: SubtaskNode }) {
  const Icon = TASK_TYPE_META[node.type as TaskType]?.Icon ?? TASK_TYPE_META.chore.Icon;
  const state = readiness(node);
  // The blockers line renders its own links, so it sits OUTSIDE the row's Link
  // (anchors must not nest) - both share the li's border/hover treatment.
  return (
    <li className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] transition-colors hover:border-[var(--border-strong)]">
      <Link href={`/work/${node.id}`} className="flex flex-col gap-1 px-2.5 py-1.5">
        <div className="flex items-center gap-2">
          <Icon className="size-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
          <TaskIdChip id={node.display_id} />
          <span className="min-w-0 flex-1 truncate text-sm text-[var(--text)]">{node.title}</span>
          <TaskStatusPill status={node.status} />
        </div>
        {state === "ready" && (
          <span className="ml-5 inline-flex w-fit items-center rounded-full bg-[var(--success-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--success-ink)]">
            Ready
          </span>
        )}
      </Link>
      {state === "waiting" && (
        <div className="ml-5 flex items-center gap-1.5 px-2.5 pb-1.5 text-[11px] text-[var(--text-muted)]">
          <span className="rounded-full bg-[var(--warning-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--warning-ink)]">
            Waiting
          </span>
          <span className="min-w-0 truncate">
            on{" "}
            {node.blocked_by.map((blocker, i) => (
              <span key={blocker.id}>
                {i > 0 ? ", " : null}
                <Link href={`/work/${blocker.id}`} className="hover:underline">
                  {blocker.display_id ? `${blocker.display_id} ` : ""}
                  {blocker.title}
                </Link>
              </span>
            ))}
          </span>
        </div>
      )}
    </li>
  );
}

/** Ready / Waiting / nothing - suppressed once a subtask is terminal or already
 *  moving (readiness is only meaningful for not-yet-started work). */
function readiness(node: SubtaskNode): "ready" | "waiting" | null {
  if (node.status === "done" || node.status === "cancelled") return null;
  if (!node.ready) return "waiting";
  if (node.status === "backlog" || node.status === "triage" || node.status === "todo") {
    return "ready";
  }
  return null;
}

/** The manual-breakdown quick-row: title + type (default `task`), creating a
 *  child via `parent_id`. Enter submits; the row clears and the parent
 *  refreshes the subtree. */
function AddSubtaskRow({
  taskId,
  onChanged,
}: {
  taskId: string;
  onChanged: () => void | Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("task");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await api.tasks.create({ type, title: trimmed, parent_id: taskId });
      setTitle("");
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't add the subtask.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <input
        type="text"
        value={title}
        disabled={busy}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a subtask…"
        aria-label="New subtask title"
        className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60"
      />
      <select
        value={type}
        disabled={busy}
        onChange={(e) => setType(e.target.value as TaskType)}
        aria-label="Subtask type"
        className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1.5 text-xs text-[var(--text)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60"
      >
        {SUBTASK_TYPE_ORDER.map((t) => (
          <option key={t} value={t}>
            {TASK_TYPE_META[t].label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={busy || !title.trim()}
        aria-label="Add subtask"
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-40"
      >
        <Plus className="size-3.5" aria-hidden />
      </button>
    </form>
  );
}

/** The parent task's own coordination edges: what THIS task waits on. Each
 *  blocker row resolves to `display_id · title` (soft-fail to a bare link) and
 *  removes via the deps endpoint; "Blocked by +" opens a search-org-tasks
 *  picker that adds one (the API rejects self-edges and cycles). */
function BlockedBySection({
  taskId,
  dependsOn,
  onChanged,
}: {
  taskId: string;
  dependsOn: string[];
  onChanged: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  // id → compact summary, fetched per blocker (usually 0-3 rows).
  const [byId, setById] = useState<Map<string, { display_id: string; title: string }>>(
    () => new Map(),
  );

  useEffect(() => {
    let cancelled = false;
    const missing = dependsOn.filter((id) => !byId.has(id));
    if (missing.length === 0) return;
    void Promise.all(
      missing.map(async (id) => {
        try {
          const t = await api.tasks.get(id);
          return [id, { display_id: t.display_id, title: t.title }] as const;
        } catch {
          return null; // unreadable blocker - the row falls back to a bare link
        }
      }),
    ).then((pairs) => {
      if (cancelled) return;
      setById((prev) => {
        const next = new Map(prev);
        for (const p of pairs) if (p) next.set(p[0], p[1]);
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(dependsOn)]);

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await api.tasks.removeDependency(taskId, { depends_on_task_id: id });
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't remove the blocker.");
    } finally {
      setBusy(false);
    }
  };

  const add = async (id: string) => {
    setBusy(true);
    try {
      await api.tasks.addDependency(taskId, { depends_on_task_id: id });
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't add the blocker.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap="1.5">
      <Cluster gap="1.5" align="center" justify="between">
        <Cluster gap="1.5" align="center">
          <Ban className="size-3 text-[var(--text-muted)]" aria-hidden />
          <span className="text-[11px] font-medium text-[var(--text-muted)]">Blocked by</span>
        </Cluster>
        <BlockerPicker
          excludeIds={[taskId, ...dependsOn]}
          disabled={busy}
          onPick={(t) => void add(t.id)}
        />
      </Cluster>
      {dependsOn.length === 0 ? (
        <p className="text-[11px] text-[var(--text-subtle)]">
          Nothing - this task can start any time.
        </p>
      ) : (
        <Stack gap="1" as="ul">
          {dependsOn.map((id) => {
            const info = byId.get(id);
            return (
              <li
                key={id}
                className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1"
              >
                <Link
                  href={`/work/${id}`}
                  className="min-w-0 flex-1 truncate text-xs text-[var(--text)] hover:underline"
                >
                  {info ? (
                    <>
                      <span className="text-[var(--text-muted)]">{info.display_id}</span>{" "}
                      {info.title}
                    </>
                  ) : (
                    "View blocking task"
                  )}
                </Link>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(id)}
                  aria-label={`Remove blocker${info ? ` ${info.display_id}` : ""}`}
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded text-[var(--text-subtle)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-40"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </li>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}

/** Debounce for the blocker search (server ILIKE on title + display id). */
const SEARCH_DEBOUNCE_MS = 200;

/** "Blocked by +" - a small popover that searches org tasks and picks one. */
function BlockerPicker({
  excludeIds,
  disabled,
  onPick,
}: {
  excludeIds: string[];
  disabled: boolean;
  onPick: (task: Task) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Task[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    setSearching(true);
    const handle = setTimeout(() => {
      void api.tasks
        .list({ ...(q ? { q } : {}), limit: 8 })
        .then((tasks) => {
          setResults(tasks.filter((t) => !excludeIds.includes(t.id)));
        })
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, JSON.stringify(excludeIds)]);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setQuery("");
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="Add a blocker"
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)]",
            "transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-40",
          )}
        >
          <Plus className="size-3" aria-hidden />
          Add
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={4}
          className="glass animate-modal-in z-50 w-72 rounded-lg border border-[var(--border)] p-1 shadow-[var(--shadow-3)] focus:outline-none"
        >
          <div className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
            <Search className="size-3.5 shrink-0 text-[var(--text-subtle)]" aria-hidden />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tasks by title or id…"
              aria-label="Search tasks to block on"
              className="w-full bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none"
            />
          </div>
          <div className="mt-1 max-h-56 overflow-y-auto">
            {searching && results.length === 0 ? (
              <div className="space-y-1 p-1" aria-hidden>
                {[0, 1].map((i) => (
                  <div key={i} className="h-7 animate-pulse rounded bg-[var(--surface-2)]" />
                ))}
              </div>
            ) : results.length === 0 ? (
              <p className="px-2 py-2 text-xs text-[var(--text-muted)]">
                No tasks match{query.trim() ? ` "${query.trim()}"` : ""}.
              </p>
            ) : (
              results.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onPick(t);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  <TaskIdChip id={t.display_id} />
                  <span className="min-w-0 flex-1 truncate text-xs text-[var(--text)]">
                    {t.title}
                  </span>
                </button>
              ))
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
