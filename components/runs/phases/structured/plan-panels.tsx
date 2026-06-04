"use client";

/**
 * Plan-phase structured panels — body-only sub-sections for `PlanStructured`.
 *
 * Like the spec panels these are bordered titled `<section>`s (not hover
 * cards) so the plan body reads as one cohesive surface. Covers the subtask /
 * per-stage view, a topologically-layered dependency graph, the per-stage
 * change list, and the consequences / impact analysis — all bound to the
 * frozen snake_case `PlanStructured` wire fields.
 */

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, FileCode2 } from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";
import type { PlanConsequences, PlanStage, StructuredRiskLevel } from "@/lib/api/client";

import { RiskPill } from "./risk-pill";

/* -------------------------------------------------------------------------- */
/* Section primitives                                                         */
/* -------------------------------------------------------------------------- */

function Section({
  title,
  meta,
  children,
  "data-testid": testid,
}: {
  title: string;
  meta?: string | undefined;
  children: React.ReactNode;
  "data-testid"?: string;
}) {
  return (
    <section
      data-testid={testid}
      className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-1)]"
    >
      <Cluster
        justify="between"
        align="center"
        className="gap-2 border-b border-[var(--border)] bg-gradient-to-b from-[var(--surface-2)] to-[var(--surface)] px-3 py-2 shadow-[var(--inner-highlight)]"
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {title}
        </span>
        {meta ? (
          <span className="text-[10px] text-[var(--text-subtle)]">{meta}</span>
        ) : null}
      </Cluster>
      <Stack gap="2.5" className="p-3">{children}</Stack>
    </section>
  );
}

/** Small `stage_id` node chip — the unit of the dependency graph + depends-on. */
function StageChip({
  id,
  tone = "muted",
}: {
  id: string;
  tone?: "muted" | "primary";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-semibold",
        tone === "primary"
          ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
          : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)]",
      )}
    >
      {id}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* SubtasksPanel                                                              */
/* -------------------------------------------------------------------------- */

/**
 * SubtasksPanel — one row per stage with the stage id, title, RiskPill,
 * estimated LoC, acceptance sub-line, and depends-on chips. The per-stage
 * `files_in_scope` are folded in as an expandable "files" sub-list so the
 * change list stays visible without a separate panel duplicating it.
 */
export function SubtasksPanel({ stages }: { stages: PlanStage[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Section
      title="Stages"
      meta={stages.length > 0 ? `${stages.length} stage${stages.length === 1 ? "" : "s"}` : undefined}
      data-testid="subtasks-panel"
    >
      {stages.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">No stages planned.</p>
      ) : (
        <Stack gap="2" as="ol">
          {stages.map((s, i) => {
            const open = expanded.has(s.stage_id);
            const hasFiles = s.files_in_scope.length > 0;
            return (
              <li
                key={s.stage_id}
                className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2.5 transition-colors duration-200 ease-out hover:border-[var(--border-strong)]"
              >
                <Cluster justify="between" align="center" className="gap-2">
                  <Cluster gap="2" align="center" className="min-w-0">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[10px] font-semibold text-[var(--primary)]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <StageChip id={s.stage_id} tone="primary" />
                    <span className="truncate text-sm font-semibold">{s.title}</span>
                  </Cluster>
                  <Cluster gap="2" align="center" className="shrink-0">
                    <span className="text-xs text-[var(--text-muted)]">
                      ~{s.estimated_loc} LoC
                    </span>
                    <RiskPill level={s.risk_level} />
                  </Cluster>
                </Cluster>

                {s.acceptance ? (
                  <p className="mt-1.5 text-xs text-[var(--text-subtle)]">{s.acceptance}</p>
                ) : null}

                {s.depends_on.length > 0 && (
                  <Cluster gap="1" align="center" className="mt-1.5">
                    <span className="text-[10px] text-[var(--text-subtle)]">
                      ↳ depends on
                    </span>
                    {s.depends_on.map((d) => (
                      <StageChip key={d} id={d} />
                    ))}
                  </Cluster>
                )}

                {hasFiles && (
                  <div className="mt-1.5">
                    <button
                      type="button"
                      onClick={() => toggle(s.stage_id)}
                      aria-expanded={open}
                      className="inline-flex w-fit items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
                    >
                      {open ? (
                        <ChevronDown className="size-3" />
                      ) : (
                        <ChevronRight className="size-3" />
                      )}
                      {s.files_in_scope.length} file
                      {s.files_in_scope.length === 1 ? "" : "s"} in scope
                    </button>
                    {open && (
                      <ul className="ml-4 mt-1 flex flex-col gap-0.5">
                        {s.files_in_scope.map((f) => (
                          <li key={f} className="flex items-start gap-1.5 text-xs">
                            <FileCode2 className="mt-0.5 size-3 shrink-0 text-[var(--text-subtle)]" />
                            <code className="break-all font-mono text-[var(--text-muted)]">
                              {f}
                            </code>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </Stack>
      )}
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* DependencyGraph                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Compute topological layers from the `depends_on` DAG. A stage's layer is
 * `1 + max(layer of its deps)`; roots (no deps, or deps not present) sit at
 * layer 0. Cycles or dangling refs degrade gracefully — any stage we can't
 * resolve after a bounded number of passes is pinned to its best-known layer
 * so it still renders.
 */
function computeLayers(stages: PlanStage[]): PlanStage[][] {
  const byId = new Map(stages.map((s) => [s.stage_id, s]));
  const layer = new Map<string, number>();

  // Iterate to a fixpoint, bounded by stage count to defend against cycles.
  for (let pass = 0; pass < stages.length + 1; pass++) {
    let changed = false;
    for (const s of stages) {
      const deps = s.depends_on.filter((d) => byId.has(d));
      const next =
        deps.length === 0
          ? 0
          : 1 + Math.max(...deps.map((d) => layer.get(d) ?? 0));
      if (layer.get(s.stage_id) !== next) {
        layer.set(s.stage_id, next);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const maxLayer = Math.max(0, ...stages.map((s) => layer.get(s.stage_id) ?? 0));
  const rows: PlanStage[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const s of stages) {
    rows[layer.get(s.stage_id) ?? 0]!.push(s);
  }
  return rows;
}

export function DependencyGraph({ stages }: { stages: PlanStage[] }) {
  if (stages.length === 0) {
    return (
      <Section title="Dependency graph" data-testid="dependency-graph">
        <p className="text-xs text-[var(--text-muted)]">No stages to graph.</p>
      </Section>
    );
  }

  const hasDeps = stages.some((s) =>
    s.depends_on.some((d) => stages.some((t) => t.stage_id === d)),
  );
  const layers = computeLayers(stages);

  return (
    <Section
      title="Dependency graph"
      meta={hasDeps ? `${layers.length} layer${layers.length === 1 ? "" : "s"}` : "no dependencies"}
      data-testid="dependency-graph"
    >
      <Stack gap="3">
        {!hasDeps && (
          <p className="text-xs text-[var(--text-muted)]">
            All stages are independent — they can land in any order.
          </p>
        )}

        {/* Layered rows: each row is one execution layer, top-down. */}
        <Stack gap="2">
          {layers.map((row, li) => (
            <div
              key={li}
              className="flex flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2"
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                Layer {li + 1}
              </span>
              <Cluster gap="2" align="center">
                {row.map((s) => (
                  <StageChip key={s.stage_id} id={s.stage_id} tone="primary" />
                ))}
              </Cluster>
            </div>
          ))}
        </Stack>

        {/* Explicit incoming edges for every non-root stage, e.g. S3 ← S1, S2. */}
        {hasDeps && (
          <Stack gap="1" className="border-t border-[var(--border)] pt-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Edges
            </span>
            {stages
              .filter((s) =>
                s.depends_on.some((d) => stages.some((t) => t.stage_id === d)),
              )
              .map((s) => (
                <Cluster key={s.stage_id} gap="1.5" align="center" className="flex-wrap">
                  <StageChip id={s.stage_id} />
                  <span aria-hidden className="text-xs text-[var(--text-subtle)]">
                    ←
                  </span>
                  {s.depends_on
                    .filter((d) => stages.some((t) => t.stage_id === d))
                    .map((d) => (
                      <StageChip key={d} id={d} />
                    ))}
                </Cluster>
              ))}
          </Stack>
        )}
      </Stack>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* ChangeListPanel                                                            */
/* -------------------------------------------------------------------------- */

/**
 * ChangeListPanel — the individual change list grouped by stage. Each group
 * is labelled by its `stage_id` and lists every `files_in_scope` path in a
 * `<code>`. Stages with no files are omitted; an all-empty plan renders a
 * muted line.
 */
export function ChangeListPanel({ stages }: { stages: PlanStage[] }) {
  const withFiles = stages.filter((s) => s.files_in_scope.length > 0);
  return (
    <Section title="Change list" data-testid="change-list-panel">
      {withFiles.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">No file changes listed.</p>
      ) : (
        <Stack gap="2.5">
          {withFiles.map((s) => (
            <Stack key={s.stage_id} gap="1">
              <Cluster gap="2" align="center">
                <StageChip id={s.stage_id} />
                <span className="truncate text-xs font-medium text-[var(--text)]">
                  {s.title}
                </span>
              </Cluster>
              <ul className="ml-1 flex flex-col gap-0.5">
                {s.files_in_scope.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-xs">
                    <FileCode2 className="mt-0.5 size-3 shrink-0 text-[var(--text-subtle)]" />
                    <code className="break-all font-mono text-[var(--text-muted)]">{f}</code>
                  </li>
                ))}
              </ul>
            </Stack>
          ))}
        </Stack>
      )}
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* ConsequencesPanel                                                          */
/* -------------------------------------------------------------------------- */

const SEVERITY_BANNER: Record<StructuredRiskLevel, string> = {
  low: "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success-ink)]",
  medium: "border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
  high: "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
};

export function ConsequencesPanel({
  consequences,
}: {
  consequences: PlanConsequences | null;
}) {
  if (!consequences) {
    return (
      <Section title="Consequences" data-testid="consequences-panel">
        <p className="text-xs text-[var(--text-muted)]">No consequences recorded.</p>
      </Section>
    );
  }

  const { summary, severity, breaking_changes, data_impacts, runtime_risks, mitigations } =
    consequences;

  return (
    <Section title="Consequences" data-testid="consequences-panel">
      <Stack gap="3">
        {severity && (
          <Cluster
            gap="2"
            align="center"
            className={cn(
              "rounded-md border px-2.5 py-1.5",
              SEVERITY_BANNER[severity],
            )}
          >
            <AlertTriangle className="size-4 shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Severity: {severity}
            </span>
          </Cluster>
        )}

        {summary ? <p className="text-sm text-[var(--text)]">{summary}</p> : null}

        {breaking_changes.length > 0 && (
          <ConsequenceList title="Breaking changes">
            {breaking_changes.map((b) => (
              <ConsequenceRow
                key={b.area}
                head={b.area}
                detail={b.detail}
                risk={b.risk}
              />
            ))}
          </ConsequenceList>
        )}

        {data_impacts.length > 0 && (
          <ConsequenceList title="Data impacts">
            {data_impacts.map((d) => (
              <ConsequenceRow
                key={d.entity}
                head={d.entity}
                detail={d.impact}
                risk={d.risk}
              />
            ))}
          </ConsequenceList>
        )}

        {runtime_risks.length > 0 && (
          <ConsequenceList title="Runtime risks">
            {runtime_risks.map((r) => (
              <ConsequenceRow
                key={r.name}
                head={r.name}
                detail={r.detail}
                risk={r.severity}
              />
            ))}
          </ConsequenceList>
        )}

        {mitigations.length > 0 && (
          <ConsequenceList title="Mitigations">
            {mitigations.map((m) => (
              <li key={m.kind} className="text-xs">
                <strong className="font-semibold">{m.kind}</strong>: {m.detail}
              </li>
            ))}
          </ConsequenceList>
        )}
      </Stack>
    </Section>
  );
}

function ConsequenceList({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Stack gap="1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
        {title}
      </span>
      <ul className="flex flex-col gap-1">{children}</ul>
    </Stack>
  );
}

function ConsequenceRow({
  head,
  detail,
  risk,
}: {
  head: string;
  detail: string;
  risk: StructuredRiskLevel;
}) {
  return (
    <li>
      <Cluster justify="between" align="center" className="gap-2 text-xs">
        <span className="min-w-0 break-words">
          <strong className="font-semibold">{head}</strong>: {detail}
        </span>
        <RiskPill level={risk} />
      </Cluster>
    </li>
  );
}
