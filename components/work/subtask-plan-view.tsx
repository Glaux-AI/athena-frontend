"use client";

/**
 * SubtaskPlanView (SUB-3) — the Decompose stage's reviewable breakdown plan,
 * rendered legibly at the gate. Each proposed piece shows its type, title, scope,
 * and — in plain words — whether it can start in parallel or waits on another
 * piece. The human approves it (→ the tasks + dependency edges are created) or
 * sends it back via the thread. Read-only here; inline editing is a follow-up.
 *
 * The artifact body is the plan JSON (`{ items: [...] }`). A body that does not
 * parse falls back to raw text rather than throwing (never a blank gate).
 */

import { useMemo } from "react";
import { ArrowDownRight, GitFork } from "lucide-react";

import type { TaskType } from "@/lib/api/client";
import { Stack } from "@/components/layout/primitives";
import { TASK_TYPE_META } from "@/lib/work/task-meta";

interface PlanItem {
  ref: string;
  type: string;
  title: string;
  body?: string;
  depends_on?: string[];
}

export function SubtaskPlanView({ body }: { body: string }) {
  const items = useMemo(() => parsePlan(body), [body]);
  if (items === null) {
    return (
      <pre className="max-h-[460px] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-xs leading-relaxed text-[var(--text)]">
        <code className="font-mono">{body}</code>
      </pre>
    );
  }
  const titleByRef = new Map(items.map((it) => [it.ref, it.title]));
  const sequential = items.filter((it) => (it.depends_on ?? []).length > 0).length;
  return (
    <Stack gap="2.5">
      <p className="text-xs text-[var(--text-muted)]">
        Athena proposes <span className="font-medium text-[var(--text)]">{items.length}</span>{" "}
        {items.length === 1 ? "task" : "tasks"}
        {sequential > 0 ? (
          <>
            {" "}— <span className="font-medium text-[var(--text)]">{sequential}</span> wait on
            others, the rest can run in parallel. Approve to create them with these
            dependencies, or send it back.
          </>
        ) : (
          <> — all independent. Approve to create them, or send it back.</>
        )}
      </p>
      <Stack gap="2" as="ol">
        {items.map((it) => (
          <PlanRow key={it.ref} item={it} titleByRef={titleByRef} />
        ))}
      </Stack>
    </Stack>
  );
}

function PlanRow({
  item,
  titleByRef,
}: {
  item: PlanItem;
  titleByRef: Map<string, string>;
}) {
  const Icon = TASK_TYPE_META[item.type as TaskType]?.Icon ?? TASK_TYPE_META.chore.Icon;
  const label = TASK_TYPE_META[item.type as TaskType]?.label ?? item.type;
  const waits = (item.depends_on ?? []).map((r) => titleByRef.get(r) ?? r);
  return (
    <li className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <Stack gap="1.5">
        <div className="flex items-center gap-2">
          <Icon className="size-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text)]">
            {item.title}
          </span>
          <span className="shrink-0 rounded-full bg-[var(--surface-3)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            {label}
          </span>
        </div>
        {item.body?.trim() ? (
          <p className="text-xs leading-relaxed text-[var(--text-muted)]">{item.body.trim()}</p>
        ) : null}
        <DependencyChip waits={waits} />
      </Stack>
    </li>
  );
}

function DependencyChip({ waits }: { waits: string[] }) {
  if (waits.length === 0) {
    return (
      <span className="inline-flex w-fit items-center gap-1 text-[11px] text-[var(--text-subtle)]">
        <GitFork className="size-3" aria-hidden />
        Can start in parallel
      </span>
    );
  }
  return (
    <span className="inline-flex max-w-full items-start gap-1 text-[11px] text-[var(--text-muted)]">
      <ArrowDownRight className="mt-px size-3 shrink-0" aria-hidden />
      <span className="min-w-0">After: {waits.join(", ")}</span>
    </span>
  );
}

function parsePlan(body: string): PlanItem[] | null {
  try {
    const data = JSON.parse(body) as { items?: PlanItem[] };
    return Array.isArray(data?.items) ? data.items : null;
  } catch {
    return null;
  }
}
