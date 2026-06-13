"use client";

/**
 * TaskTree - the `/work` board's tree view: top-level tasks, each expandable to
 * its subtasks and THEIR subtasks (recursive), in one surface. Children load
 * on demand (lazy `GET /v1/tasks/{id}/children`) the first time a node expands,
 * so a deep tree costs nothing until you open it. Each row opens the cockpit;
 * the owner (a human) shows as an avatar. Presentational + self-fetching per
 * node; the parent supplies the roots + the member lookup for owner avatars.
 */

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, ListTree } from "lucide-react";

import {
  api,
  type Member,
  type Task,
  type TaskChild,
  type TaskStatus,
  type TaskType,
} from "@/lib/api/client";
import { ActorAvatar } from "@/components/mascot/actor-avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { TaskStatusPill } from "@/components/ui/task-status-pill";
import { TaskIdChip } from "@/components/work/task-id-chip";
import { TASK_TYPE_META } from "@/lib/work/task-meta";

/** Normalized node - a root comes from a full `Task`, a descendant from the
 *  compact `TaskChild`; both reduce to this shape for the recursive renderer. */
interface TreeItem {
  id: string;
  displayId: string;
  type: TaskType;
  title: string;
  status: TaskStatus;
  ownerUserId: string | null;
  hasChildren: boolean;
}

const fromTask = (t: Task): TreeItem => ({
  id: t.id,
  displayId: t.display_id,
  type: t.type,
  title: t.title,
  status: t.status,
  ownerUserId: t.owner_user_id,
  hasChildren: t.child_ids.length > 0,
});

const fromChild = (c: TaskChild): TreeItem => ({
  id: c.id,
  displayId: c.display_id,
  type: c.type,
  title: c.title,
  status: c.status,
  ownerUserId: c.owner_user_id,
  hasChildren: c.has_children,
});

const INDENT_PX = 18;

export function TaskTree({
  roots,
  byId,
  onTaskOpen,
  emptyAction,
}: {
  roots: Task[];
  byId: Map<string, Member>;
  onTaskOpen: (id: string) => void;
  emptyAction?: ReactNode;
}) {
  if (roots.length === 0) {
    return (
      <EmptyState
        icon={<ListTree className="size-5" />}
        title="No work here"
        description="Create a task and it'll appear here with its subtasks. Or switch to All / clear a filter to see more."
        {...(emptyAction ? { action: emptyAction } : {})}
      />
    );
  }
  return (
    <div
      aria-label="Tasks and subtasks"
      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5"
    >
      {roots.map((t) => (
        <TreeNode
          key={t.id}
          item={fromTask(t)}
          depth={0}
          byId={byId}
          onTaskOpen={onTaskOpen}
        />
      ))}
    </div>
  );
}

function TreeNode({
  item,
  depth,
  byId,
  onTaskOpen,
}: {
  item: TreeItem;
  depth: number;
  byId: Map<string, Member>;
  onTaskOpen: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<TreeItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const meta = TASK_TYPE_META[item.type];
  const Icon = meta.Icon;
  const owner = item.ownerUserId ? byId.get(item.ownerUserId) ?? null : null;

  const toggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && children === null && !loading) {
      setLoading(true);
      setError(false);
      try {
        const res = await api.tasks.children(item.id);
        setChildren(res.map(fromChild));
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
  };

  const rowPad = depth * INDENT_PX + 4;

  return (
    <div>
      <div
        className="group flex items-center gap-1.5 rounded-md transition-colors hover:bg-[var(--surface-2)]"
        style={{ paddingLeft: rowPad }}
      >
        {item.hasChildren ? (
          <button
            type="button"
            onClick={() => void toggle()}
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse subtasks" : "Expand subtasks"}
            className="inline-flex size-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            {expanded ? (
              <ChevronDown className="size-3.5" aria-hidden />
            ) : (
              <ChevronRight className="size-3.5" aria-hidden />
            )}
          </button>
        ) : (
          <span className="inline-block size-5 shrink-0" aria-hidden />
        )}
        <button
          type="button"
          onClick={() => onTaskOpen(item.id)}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-inset rounded-md"
        >
          <Icon className="size-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
          <TaskIdChip id={item.displayId} />
          <span className="min-w-0 flex-1 truncate text-sm text-[var(--text)] group-hover:underline">
            {item.title}
          </span>
          {owner ? (
            <span title={`Owner: ${owner.display_name}`}>
              <ActorAvatar name={owner.display_name} size={18} className="shrink-0" />
            </span>
          ) : item.ownerUserId ? (
            // Owned, but not resolvable (members loading / removed user) - still
            // show an owned marker so it's distinct from an unowned task.
            <span title="Owner assigned">
              <ActorAvatar name="Member" size={18} className="shrink-0" />
            </span>
          ) : null}
          <TaskStatusPill status={item.status} />
        </button>
      </div>

      {expanded && (
        <div>
          {loading && (
            <div
              className="h-7 animate-pulse rounded-md bg-[var(--surface-2)]"
              style={{ marginLeft: rowPad + 24, marginRight: 8 }}
              aria-hidden
            />
          )}
          {error && (
            <p
              className="py-1.5 text-xs text-[var(--danger-ink)]"
              style={{ paddingLeft: rowPad + 28 }}
            >
              Couldn&apos;t load subtasks - try again.
            </p>
          )}
          {children && children.length === 0 && (
            <p
              className="py-1.5 text-xs text-[var(--text-subtle)]"
              style={{ paddingLeft: rowPad + 28 }}
            >
              No subtasks.
            </p>
          )}
          {children?.map((c) => (
            <TreeNode
              key={c.id}
              item={c}
              depth={depth + 1}
              byId={byId}
              onTaskOpen={onTaskOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}
