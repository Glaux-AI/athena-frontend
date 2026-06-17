"use client";

/**
 * SubtaskPlanView (SUB-3) - the Decompose stage's reviewable breakdown plan,
 * rendered legibly at the gate. Each proposed piece shows its type, title, scope,
 * and - in plain words - whether it can start in parallel or waits on another
 * piece. The human approves it (→ the tasks + dependency edges are created) or
 * sends it back via the thread.
 *
 * It also drives the inline EDIT path (IMPL-18): pass `editable` with `onSave` /
 * `onCancel` and the same plan renders as a structured form - per-item title,
 * details, type, and which sibling tasks it waits on, plus add/remove - so a
 * user can reshape the breakdown without hand-editing JSON. Saving serializes
 * back to the plan body (`{ items: [...] }`) the approve gate materializes.
 *
 * The artifact body is the plan JSON (`{ items: [...] }`). A body that does not
 * parse falls back to raw text rather than throwing (never a blank gate); in
 * edit mode an unparseable/empty body starts from a single blank task.
 */

import { useMemo, useState } from "react";
import { ArrowDownRight, GitFork, Plus, Trash2 } from "lucide-react";

import type { TaskType } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Stack } from "@/components/layout/primitives";
import { TASK_TYPE_META } from "@/lib/work/task-meta";

interface PlanItem {
  ref: string;
  type: string;
  title: string;
  body?: string;
  depends_on?: string[];
}

interface SubtaskPlanViewProps {
  body: string;
  /** Render the structured editor instead of the read-only breakdown (IMPL-18).
   *  When set, `onSave` / `onCancel` drive persistence (the caller writes the
   *  serialized body via `authorArtifact`). */
  editable?: boolean;
  /** Save the edited plan - receives the serialized `{ items: [...] }` body. */
  onSave?: (body: string) => void;
  /** Discard the draft and return to the read view. */
  onCancel?: () => void;
  /** The save is in flight - disables the editor's actions. */
  saving?: boolean;
  /** A save error from the caller (e.g. the author endpoint refused) - shown
   *  alongside the editor's own validation message. */
  error?: string | null;
}

export function SubtaskPlanView(props: SubtaskPlanViewProps) {
  if (props.editable) {
    return (
      <PlanEditor
        initialBody={props.body}
        saving={props.saving ?? false}
        error={props.error ?? null}
        {...(props.onSave ? { onSave: props.onSave } : {})}
        {...(props.onCancel ? { onCancel: props.onCancel } : {})}
      />
    );
  }
  return <PlanReadView body={props.body} />;
}

// --------------------------------------------------------------------------- //
// Read view - the reviewable breakdown at the gate                             //
// --------------------------------------------------------------------------- //

function PlanReadView({ body }: { body: string }) {
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
            {" "}- <span className="font-medium text-[var(--text)]">{sequential}</span> wait on
            others, the rest can run in parallel. Approve to create them with these
            dependencies, or send it back.
          </>
        ) : (
          <> - all independent. Approve to create them, or send it back.</>
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

// --------------------------------------------------------------------------- //
// Edit view - the structured breakdown editor (IMPL-18)                        //
// --------------------------------------------------------------------------- //

const TASK_TYPE_OPTIONS = Object.keys(TASK_TYPE_META) as TaskType[];

function PlanEditor({
  initialBody,
  onSave,
  onCancel,
  saving,
  error,
}: {
  initialBody: string;
  onSave?: (body: string) => void;
  onCancel?: () => void;
  saving: boolean;
  error: string | null;
}) {
  const [items, setItems] = useState<PlanItem[]>(() => {
    const parsed = parsePlan(initialBody);
    if (parsed && parsed.length > 0) {
      return parsed.map((it, i) => normalizeItem(it, i));
    }
    return [blankItem([])];
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const update = (idx: number, patch: Partial<PlanItem>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const remove = (idx: number) =>
    setItems((prev) => {
      const removed = prev[idx]?.ref;
      return prev
        .filter((_, i) => i !== idx)
        .map((it) =>
          removed
            ? { ...it, depends_on: (it.depends_on ?? []).filter((r) => r !== removed) }
            : it,
        );
    });

  const add = () => setItems((prev) => [...prev, blankItem(prev.map((p) => p.ref))]);

  const toggleDep = (idx: number, ref: string) =>
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const cur = it.depends_on ?? [];
        return {
          ...it,
          depends_on: cur.includes(ref) ? cur.filter((r) => r !== ref) : [...cur, ref],
        };
      }),
    );

  const save = () => {
    if (!onSave) return;
    if (items.length === 0) {
      setLocalError("Add at least one task.");
      return;
    }
    if (items.some((it) => !it.title.trim())) {
      setLocalError("Every task needs a title.");
      return;
    }
    setLocalError(null);
    onSave(serializePlan(items));
  };

  const shownError = localError ?? error;

  return (
    <Stack gap="2.5">
      <p className="text-xs text-[var(--text-muted)]">
        Edit the breakdown directly - rename a task, change its type, add or remove one, or
        adjust what it waits on. Saving updates the plan; approve still creates the tasks.
      </p>
      <Stack gap="2" as="ol">
        {items.map((it, idx) => (
          <PlanEditorRow
            key={it.ref}
            item={it}
            index={idx}
            others={items.filter((_, i) => i !== idx)}
            disabled={saving}
            onChange={(patch) => update(idx, patch)}
            onToggleDep={(ref) => toggleDep(idx, ref)}
            onRemove={() => remove(idx)}
          />
        ))}
      </Stack>
      <div>
        <Button size="sm" variant="outline" disabled={saving} onClick={add}>
          <Plus className="size-3.5" />
          Add task
        </Button>
      </div>
      {shownError && (
        <p
          role="alert"
          className="rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]"
        >
          {shownError}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button size="sm" loading={saving} disabled={saving} onClick={save}>
          Save plan
        </Button>
        <Button size="sm" variant="ghost" disabled={saving} onClick={() => onCancel?.()}>
          Cancel
        </Button>
      </div>
    </Stack>
  );
}

function PlanEditorRow({
  item,
  index,
  others,
  disabled,
  onChange,
  onToggleDep,
  onRemove,
}: {
  item: PlanItem;
  index: number;
  others: PlanItem[];
  disabled: boolean;
  onChange: (patch: Partial<PlanItem>) => void;
  onToggleDep: (ref: string) => void;
  onRemove: () => void;
}) {
  const deps = item.depends_on ?? [];
  const fieldClass =
    "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]";
  return (
    <li className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <Stack gap="2">
        <div className="flex items-start gap-2">
          <span className="mt-1.5 shrink-0 text-[11px] font-medium uppercase tracking-wider text-[var(--text-subtle)]">
            {index + 1}
          </span>
          <input
            type="text"
            aria-label="Task title"
            value={item.title}
            disabled={disabled}
            placeholder="Task title"
            onChange={(e) => onChange({ title: e.target.value })}
            className={`${fieldClass} flex-1 font-medium`}
          />
          <select
            aria-label="Task type"
            value={item.type}
            disabled={disabled}
            onChange={(e) => onChange({ type: e.target.value })}
            className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          >
            {TASK_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {TASK_TYPE_META[t].label}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="Remove task"
            disabled={disabled}
            onClick={onRemove}
            className="mt-0.5 shrink-0 rounded p-1 text-[var(--text-subtle)] hover:bg-[var(--surface-3)] hover:text-[var(--danger-ink)] disabled:opacity-50"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </div>
        <textarea
          aria-label="Task details"
          value={item.body ?? ""}
          disabled={disabled}
          placeholder="What this task covers (optional)"
          onChange={(e) => onChange({ body: e.target.value })}
          className={`${fieldClass} min-h-[48px] resize-y leading-relaxed`}
        />
        {others.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-[var(--text-subtle)]">Waits on:</span>
            {others.map((o) => {
              const active = deps.includes(o.ref);
              return (
                <button
                  key={o.ref}
                  type="button"
                  aria-pressed={active}
                  aria-label={`Depends on ${o.title.trim() || o.ref}`}
                  disabled={disabled}
                  onClick={() => onToggleDep(o.ref)}
                  className={`inline-flex max-w-[200px] items-center gap-1 rounded-full px-2 py-0.5 text-[11px] disabled:opacity-50 ${
                    active
                      ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                      : "bg-[var(--surface-3)] text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {active && <ArrowDownRight className="size-3 shrink-0" aria-hidden />}
                  <span className="truncate">{o.title.trim() || o.ref}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <span className="text-[11px] text-[var(--text-subtle)]">
            No other tasks to depend on yet.
          </span>
        )}
      </Stack>
    </li>
  );
}

// --------------------------------------------------------------------------- //
// plan (de)serialization                                                       //
// --------------------------------------------------------------------------- //

function parsePlan(body: string): PlanItem[] | null {
  try {
    const data = JSON.parse(body) as { items?: PlanItem[] };
    return Array.isArray(data?.items) ? data.items : null;
  } catch {
    return null;
  }
}

/** Fill in any missing fields and guarantee a stable, unique `ref` so the row
 *  can key on it and other rows can name it as a dependency. */
function normalizeItem(it: PlanItem, index: number): PlanItem {
  return {
    ref: it.ref || `task-${index + 1}`,
    type: it.type || "chore",
    title: it.title ?? "",
    body: it.body ?? "",
    depends_on: Array.isArray(it.depends_on) ? it.depends_on : [],
  };
}

function blankItem(existing: string[]): PlanItem {
  const taken = new Set(existing);
  let n = existing.length + 1;
  let ref = `task-${n}`;
  while (taken.has(ref)) {
    n += 1;
    ref = `task-${n}`;
  }
  return { ref, type: "implementation", title: "", body: "", depends_on: [] };
}

/** Serialize the draft back to the plan body the approve gate materializes.
 *  Trims text, drops empty bodies, and keeps only dependency refs that still
 *  point at a real sibling (a removed task can't linger as a dangling edge). */
function serializePlan(items: PlanItem[]): string {
  const refs = new Set(items.map((it) => it.ref));
  const out = items.map((it) => {
    const obj: PlanItem = { ref: it.ref, type: it.type, title: it.title.trim() };
    const body = it.body?.trim();
    if (body) obj.body = body;
    const deps = (it.depends_on ?? []).filter((r) => r !== it.ref && refs.has(r));
    if (deps.length > 0) obj.depends_on = deps;
    return obj;
  });
  return JSON.stringify({ items: out }, null, 2);
}
