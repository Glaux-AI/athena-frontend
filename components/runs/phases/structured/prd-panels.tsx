"use client";

/**
 * PRD-track structured panels — body-only sub-sections for the four PRD
 * phases (`frame` / `research` / `draft` / `signoff`).
 *
 * Like the spec + plan panels these are bordered titled `<section>`s (not
 * hover cards) so each PRD tab reads as one cohesive surface inside the
 * `PhaseDocumentShell`. Every field binds to the frozen snake_case
 * `Prd*Structured` wire contract in `lib/api/client.ts`:
 *   - FramePanel    → the framing: problem / goals / non-goals / stakeholders
 *                     / risks + a confidence chip + open gaps.
 *   - ResearchPanel → the findings summary + per-finding evidence/gaps/
 *                     confidence rows + citations + outstanding gaps.
 *   - DraftPanel    → section-coverage across the closed 10-key catalogue +
 *                     the unresolved-hallucination-flag indicator.
 *   - SignoffPanel  → the approval readiness header + per-stakeholder
 *                     decisions + blocking rejections + handoff line.
 */

import { ShieldCheck } from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";
import {
  PRD_DRAFT_SECTION_CATALOGUE,
  type PrdDraftAlternative,
  type PrdDraftGoal,
  type PrdDraftScope,
  type PrdDraftStructured,
  type PrdDraftSuccessMetric,
  type PrdFrameStructured,
  type PrdResearchStructured,
  type PrdSignoffStructured,
} from "@/lib/api/client";

/* -------------------------------------------------------------------------- */
/* Section primitives (mirrored from spec-panels)                             */
/* -------------------------------------------------------------------------- */

/** A bordered titled region — the shared shell for every structured panel. */
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
      className="rounded-md border border-[var(--border)] p-3"
    >
      <Stack gap="2.5">
        <Cluster justify="between" align="center" className="gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {title}
          </span>
          {meta ? (
            <span className="text-[10px] text-[var(--text-subtle)]">{meta}</span>
          ) : null}
        </Cluster>
        {children}
      </Stack>
    </section>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-[var(--text-muted)]">{children}</p>;
}

/** A small uppercase sub-heading inside a section (e.g. "Goals"). */
function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
      {children}
    </span>
  );
}

/** A small neutral confidence chip — the BE emits a free-form label
 *  (`high` / `medium` / `low` / null). Rendered muted so it reads as
 *  metadata, not a status verdict. */
function ConfidenceChip({ value }: { value: string | null }) {
  if (!value) return null;
  return (
    <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
      {value} confidence
    </span>
  );
}

/** A wrap of plain text bullets — used for goals / non-goals / risks / gaps.
 *  Empty list renders the supplied muted fallback line. */
function BulletList({
  items,
  empty,
}: {
  items: string[];
  empty: string;
}) {
  if (items.length === 0) return <EmptyLine>{empty}</EmptyLine>;
  return (
    <ul className="flex flex-col gap-1">
      {items.map((it, i) => (
        <li key={`${i}-${it}`} className="flex items-start gap-1.5 text-xs">
          <span aria-hidden className="mt-0.5 text-[var(--text-subtle)]">
            ·
          </span>
          <span className="min-w-0 break-words text-[var(--text)]">{it}</span>
        </li>
      ))}
    </ul>
  );
}

/** A wrap of small chips — used for stakeholders / evidence / citations. */
function ChipWrap({
  items,
  empty,
  mono,
}: {
  items: string[];
  empty?: string;
  mono?: boolean;
}) {
  if (items.length === 0) {
    return empty ? <EmptyLine>{empty}</EmptyLine> : null;
  }
  return (
    <Cluster gap="1.5">
      {items.map((it, i) => (
        <span
          key={`${i}-${it}`}
          className={cn(
            "rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-[var(--text)]",
            mono ? "font-mono text-[11px]" : "text-xs",
          )}
        >
          {it}
        </span>
      ))}
    </Cluster>
  );
}

/* -------------------------------------------------------------------------- */
/* FramePanel                                                                 */
/* -------------------------------------------------------------------------- */

export function FramePanel({ frame }: { frame: PrdFrameStructured }) {
  return (
    <Section
      title="Framing"
      meta={frame.frame_summary ? undefined : "problem · goals · stakeholders"}
      data-testid="frame-panel"
    >
      <Stack gap="3">
        {/* Problem statement — the most prominent element of the frame. */}
        <Stack gap="1">
          <SubHeading>Problem statement</SubHeading>
          {frame.problem_statement ? (
            <p className="text-sm font-medium text-[var(--text)]">
              {frame.problem_statement}
            </p>
          ) : (
            <EmptyLine>No problem statement yet.</EmptyLine>
          )}
        </Stack>

        {frame.frame_summary ? (
          <p className="text-xs text-[var(--text-subtle)]">{frame.frame_summary}</p>
        ) : null}

        {frame.confidence ? (
          <Cluster gap="2" align="center">
            <ConfidenceChip value={frame.confidence} />
          </Cluster>
        ) : null}

        <Stack gap="1.5">
          <SubHeading>Goals</SubHeading>
          <BulletList items={frame.goals} empty="No goals captured." />
        </Stack>

        <Stack gap="1.5">
          <SubHeading>Non-goals</SubHeading>
          <BulletList items={frame.non_goals} empty="No non-goals captured." />
        </Stack>

        <Stack gap="1.5">
          <SubHeading>Stakeholders</SubHeading>
          <ChipWrap items={frame.stakeholders} empty="No stakeholders listed." />
        </Stack>

        <Stack gap="1.5">
          <SubHeading>Risks</SubHeading>
          <BulletList items={frame.risks} empty="No risks flagged." />
        </Stack>

        {frame.gaps.length > 0 && (
          <Stack gap="1.5" className="border-t border-[var(--border)] pt-2">
            <SubHeading>Open questions / gaps</SubHeading>
            <BulletList items={frame.gaps} empty="" />
          </Stack>
        )}
      </Stack>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* ResearchPanel                                                              */
/* -------------------------------------------------------------------------- */

export function ResearchPanel({ research }: { research: PrdResearchStructured }) {
  return (
    <Section
      title="Research"
      meta={
        research.findings.length > 0
          ? `${research.findings.length} finding${research.findings.length === 1 ? "" : "s"}`
          : undefined
      }
      data-testid="research-panel"
    >
      <Stack gap="3">
        {/* Findings summary prose + an overall confidence chip. */}
        {(research.findings_summary || research.confidence) && (
          <Cluster justify="between" align="start" className="gap-2">
            {research.findings_summary ? (
              <p className="min-w-0 text-sm text-[var(--text)]">
                {research.findings_summary}
              </p>
            ) : (
              <span />
            )}
            <ConfidenceChip value={research.confidence} />
          </Cluster>
        )}

        <Stack gap="2" as="ul">
          {research.findings.length === 0 ? (
            <EmptyLine>No findings recorded.</EmptyLine>
          ) : (
            research.findings.map((f, i) => (
              <li
                key={`${i}-${f.finding.slice(0, 24)}`}
                className="rounded-md border border-[var(--border)] p-2.5"
              >
                <Stack gap="1.5">
                  <Cluster justify="between" align="start" className="gap-2">
                    <span className="min-w-0 break-words text-sm font-medium text-[var(--text)]">
                      {f.finding}
                    </span>
                    <ConfidenceChip value={f.confidence} />
                  </Cluster>

                  {f.evidence.length > 0 && (
                    <Cluster gap="1" align="center">
                      <span className="text-[10px] text-[var(--text-subtle)]">
                        evidence
                      </span>
                      <ChipWrap items={f.evidence} mono />
                    </Cluster>
                  )}

                  {f.gaps.length > 0 && (
                    <p className="text-xs text-[var(--text-subtle)]">
                      Gaps: {f.gaps.join("; ")}
                    </p>
                  )}
                </Stack>
              </li>
            ))
          )}
        </Stack>

        <Stack gap="1.5">
          <SubHeading>Citations</SubHeading>
          <ChipWrap items={research.citations} empty="No citations." mono />
        </Stack>

        {research.outstanding_gaps.length > 0 && (
          <Stack gap="1.5" className="border-t border-[var(--border)] pt-2">
            <SubHeading>Outstanding gaps</SubHeading>
            <BulletList items={research.outstanding_gaps} empty="" />
          </Stack>
        )}
      </Stack>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* DraftPanel                                                                 */
/* -------------------------------------------------------------------------- */

/** Pretty-print a section catalogue key (`success_metrics` → "Success
 *  metrics"). */
function sectionLabel(key: string): string {
  const spaced = key.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** A small neutral chip for a trailing metric/target value. */
function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded-md bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">
      {children}
    </span>
  );
}

/** Goals — `{goal, metric}` rows; the mapped metric (when present) trails as
 *  a chip. Renders nothing when the drafter grounded no goals. */
function DraftGoals({ goals }: { goals: PrdDraftGoal[] }) {
  if (goals.length === 0) return null;
  return (
    <Stack gap="1.5">
      <SubHeading>Goals</SubHeading>
      <Stack gap="1" as="ul">
        {goals.map((g, i) => (
          <li
            key={`${i}-${g.goal.slice(0, 24)}`}
            className="flex items-start justify-between gap-2 text-xs"
          >
            <span className="min-w-0 break-words text-[var(--text)]">{g.goal}</span>
            {g.metric ? <MetaChip>{g.metric}</MetaChip> : null}
          </li>
        ))}
      </Stack>
    </Stack>
  );
}

/** Success metrics — `{metric, target, signal}` rows. */
function DraftMetrics({ metrics }: { metrics: PrdDraftSuccessMetric[] }) {
  if (metrics.length === 0) return null;
  return (
    <Stack gap="1.5">
      <SubHeading>Success metrics</SubHeading>
      <Stack gap="1.5" as="ul">
        {metrics.map((m, i) => (
          <li key={`${i}-${m.metric.slice(0, 24)}`} className="text-xs">
            <Cluster justify="between" align="start" className="gap-2">
              <span className="min-w-0 break-words font-medium text-[var(--text)]">
                {m.metric}
              </span>
              {m.target ? <MetaChip>{m.target}</MetaChip> : null}
            </Cluster>
            {m.signal ? (
              <span className="text-[var(--text-subtle)]">via {m.signal}</span>
            ) : null}
          </li>
        ))}
      </Stack>
    </Stack>
  );
}

/** Scope ladder — two labelled lists (in / out), each shown only when it has
 *  content. */
function DraftScopeLadder({ scope }: { scope: PrdDraftScope | null }) {
  if (!scope || (scope.in_scope.length === 0 && scope.out_of_scope.length === 0)) {
    return null;
  }
  return (
    <Stack gap="1.5">
      <SubHeading>Scope</SubHeading>
      {scope.in_scope.length > 0 ? (
        <Stack gap="1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--success)]">
            In scope
          </span>
          <BulletList items={scope.in_scope} empty="" />
        </Stack>
      ) : null}
      {scope.out_of_scope.length > 0 ? (
        <Stack gap="1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-subtle)]">
            Out of scope
          </span>
          <BulletList items={scope.out_of_scope} empty="" />
        </Stack>
      ) : null}
    </Stack>
  );
}

/** Alternatives — `{option, why_not, chosen}` rows; the chosen option gets a
 *  success pill and bold weight. */
function DraftAlternatives({ alternatives }: { alternatives: PrdDraftAlternative[] }) {
  if (alternatives.length === 0) return null;
  return (
    <Stack gap="1.5">
      <SubHeading>Alternatives considered</SubHeading>
      <Stack gap="1.5" as="ul">
        {alternatives.map((a, i) => (
          <li
            key={`${i}-${a.option.slice(0, 24)}`}
            className="rounded-md border border-[var(--border)] p-2"
          >
            <Stack gap="0.5">
              <Cluster justify="between" align="center" className="gap-2">
                <span
                  className={cn(
                    "min-w-0 break-words text-xs text-[var(--text)]",
                    a.chosen && "font-semibold",
                  )}
                >
                  {a.option}
                </span>
                {a.chosen ? (
                  <span
                    data-testid="alternative-chosen"
                    className="shrink-0 rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--success-ink)]"
                  >
                    chosen
                  </span>
                ) : null}
              </Cluster>
              {a.why_not ? (
                <span className="text-xs text-[var(--text-subtle)]">{a.why_not}</span>
              ) : null}
            </Stack>
          </li>
        ))}
      </Stack>
    </Stack>
  );
}

export function DraftPanel({ draft }: { draft: PrdDraftStructured }) {
  const present = new Set(draft.sections);
  const presentCount = PRD_DRAFT_SECTION_CATALOGUE.filter((k) =>
    present.has(k),
  ).length;
  const total = PRD_DRAFT_SECTION_CATALOGUE.length;
  const flagsClear = draft.conli_flags_remaining <= 0;

  return (
    <Section
      title="Draft"
      meta={`${presentCount}/${total} sections`}
      data-testid="draft-panel"
    >
      <Stack gap="3">
        {/* Agent-generated structured components (each omitted when empty). */}
        <DraftGoals goals={draft.goals} />
        <DraftMetrics metrics={draft.success_metrics} />
        <DraftScopeLadder scope={draft.scope} />
        <DraftAlternatives alternatives={draft.alternatives} />

        {/* Section coverage across the full closed catalogue. */}
        <Stack gap="1.5">
          <SubHeading>Section coverage</SubHeading>
          <Cluster gap="1.5">
            {PRD_DRAFT_SECTION_CATALOGUE.map((key) => {
              const has = present.has(key);
              return (
                <span
                  key={key}
                  data-present={has}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[11px] font-medium",
                    has
                      ? "bg-[var(--success-soft)] text-[var(--success-ink)]"
                      : "border border-dashed border-[var(--border)] text-[var(--text-subtle)]",
                  )}
                >
                  {sectionLabel(key)}
                </span>
              );
            })}
          </Cluster>
        </Stack>

        {/* Unresolved hallucination-flag (CONLI) indicator. */}
        <Cluster gap="2" align="center">
          {flagsClear ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--success-ink)]">
              <ShieldCheck className="size-3" />0 unresolved hallucination flags
            </span>
          ) : (
            <span className="rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--warning-ink)]">
              {draft.conli_flags_remaining} unresolved hallucination flag
              {draft.conli_flags_remaining === 1 ? "" : "s"}
            </span>
          )}
        </Cluster>
      </Stack>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* SignoffPanel                                                               */
/* -------------------------------------------------------------------------- */

/** Map the sign-off status verb to a tone class for the header chip. */
const SIGNOFF_STATUS_TONE: Record<string, string> = {
  collecting: "bg-[var(--info-soft)] text-[var(--info-ink)]",
  ready_for_handoff: "bg-[var(--success-soft)] text-[var(--success-ink)]",
  blocked: "bg-[var(--danger-soft)] text-[var(--danger-ink)]",
  handed_off: "bg-[var(--surface-2)] text-[var(--text-muted)]",
};

function StatusChip({ status }: { status: string | null }) {
  if (!status) return null;
  const tone =
    SIGNOFF_STATUS_TONE[status] ?? "bg-[var(--surface-2)] text-[var(--text-muted)]";
  return (
    <span
      data-testid="signoff-status"
      data-status={status}
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        tone,
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

/** A per-stakeholder decision pill. */
function DecisionPill({ decision }: { decision: string }) {
  const tone =
    decision === "approve"
      ? "bg-[var(--success-soft)] text-[var(--success-ink)]"
      : decision === "reject"
        ? "bg-[var(--danger-soft)] text-[var(--danger-ink)]"
        : "bg-[var(--surface-2)] text-[var(--text-muted)]";
  const label = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "pending";
  return (
    <span
      data-testid="decision-pill"
      data-decision={decision}
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        tone,
      )}
    >
      {label}
    </span>
  );
}

export function SignoffPanel({ signoff }: { signoff: PrdSignoffStructured }) {
  // Decision lookup keyed by stakeholder id; absent → pending.
  const decisionFor = new Map(
    signoff.approvals.map((a) => [a.stakeholder_id, a.decision]),
  );

  return (
    <Section title="Sign-off" data-testid="signoff-panel">
      <Stack gap="3">
        {/* Readiness header: approved count + status chip. */}
        <Cluster justify="between" align="center" className="gap-2">
          <span className="text-sm font-semibold text-[var(--text)]">
            {signoff.approved_count}/{signoff.total_count} approved
          </span>
          <StatusChip status={signoff.status} />
        </Cluster>

        {/* Per-stakeholder decision list. */}
        <Stack gap="1.5">
          <SubHeading>Stakeholders</SubHeading>
          {signoff.stakeholders.length === 0 ? (
            <EmptyLine>No stakeholders assigned.</EmptyLine>
          ) : (
            <Stack gap="1" as="ul">
              {signoff.stakeholders.map((sid) => (
                <li key={sid}>
                  <Cluster justify="between" align="center" className="gap-2">
                    <code className="truncate font-mono text-xs text-[var(--text)]">
                      {sid}
                    </code>
                    <DecisionPill decision={decisionFor.get(sid) ?? "none"} />
                  </Cluster>
                </li>
              ))}
            </Stack>
          )}
        </Stack>

        {/* Blocking rejections, with the summarised reason where present. */}
        {signoff.rejections.length > 0 && (
          <Stack gap="1.5" className="border-t border-[var(--border)] pt-2">
            <SubHeading>Blocking rejections</SubHeading>
            <Stack gap="1.5" as="ul">
              {signoff.rejections.map((r, i) => (
                <li
                  key={`${i}-${r.stakeholder_id}`}
                  className="rounded-md border border-[var(--danger-soft)] bg-[var(--danger-soft)] p-2"
                >
                  <Stack gap="0.5">
                    <code className="font-mono text-[11px] font-semibold text-[var(--danger-ink)]">
                      {r.stakeholder_id}
                    </code>
                    <span className="text-xs text-[var(--text)]">
                      {r.summarised_reason ?? r.reason_text}
                    </span>
                  </Stack>
                </li>
              ))}
            </Stack>
          </Stack>
        )}

        {signoff.handoff_target ? (
          <p className="text-xs text-[var(--text-muted)]">
            Handed off to{" "}
            <span className="font-medium text-[var(--text)]">
              {signoff.handoff_target}
            </span>
            .
          </p>
        ) : null}
      </Stack>
    </Section>
  );
}
