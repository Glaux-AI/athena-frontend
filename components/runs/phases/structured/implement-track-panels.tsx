"use client";

/**
 * Implement-track structured panels — body-only sub-sections for the
 * `ImplementStructured` / `ReviewStructured` / `CiStructured` /
 * `PrStructured` wire shapes.
 *
 * Mirrors the spec/plan panels: each is a bordered titled `<section>` (via the
 * shared `Section` helper) with a small uppercase header so the phase body
 * reads as one cohesive surface inside the `PhaseDocumentShell`. Colours come
 * only from OKLCH tokens; every panel renders real data and degrades to an
 * honest empty hint when a field is empty or a payload is still pre-populated.
 */

import { ExternalLink, FileCode2 } from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";
import type {
  CiStructured,
  ImplementStructured,
  PrStructured,
  ReviewStructured,
} from "@/lib/api/client";

/* -------------------------------------------------------------------------- */
/* Section primitives                                                         */
/* -------------------------------------------------------------------------- */

/** A bordered titled region — the shared shell for every structured panel.
 *  Mirrors the `PhaseDocumentShell` depth recipe: a gradient header band with
 *  an inner highlight + hairline divider over a calm surface body. */
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

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-[var(--text-muted)]">{children}</p>;
}

/** A small uppercase sub-heading inside a section. */
function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
      {children}
    </span>
  );
}

/** One file path rendered as a mono `<code>` row with a leading file glyph. */
function FilePathRow({ path }: { path: string }) {
  return (
    <li className="flex items-start gap-1.5 text-xs">
      <FileCode2 className="mt-0.5 size-3 shrink-0 text-[var(--text-subtle)]" />
      <code className="break-all font-mono text-[var(--text-muted)]">{path}</code>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* StatusPill — CI check status → token-coloured chip                         */
/* -------------------------------------------------------------------------- */

/** Map a free-form CI status string to a semantic token pair:
 *    success            → --success
 *    failure / error    → --danger
 *    pending / running  → --warning
 *    anything else      → neutral surface
 *  The match is substring + case-insensitive so we tolerate provider variance
 *  (`completed`, `in_progress`, `action_required`, …) without inventing data. */
function statusTone(status: string): string {
  const s = status.toLowerCase();
  if (/(success|passed|complete)/.test(s)) {
    return "bg-[var(--success-soft)] text-[var(--success-ink)]";
  }
  if (/(fail|error|cancel)/.test(s)) {
    return "bg-[var(--danger-soft)] text-[var(--danger-ink)]";
  }
  if (/(pending|running|queued|progress|waiting)/.test(s)) {
    return "bg-[var(--warning-soft)] text-[var(--warning-ink)]";
  }
  return "bg-[var(--surface-2)] text-[var(--text-muted)]";
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      data-testid="ci-status-pill"
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        statusTone(status),
      )}
    >
      {status}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* StagesPanel — implement.implement + quickfix.implement                     */
/* -------------------------------------------------------------------------- */

/**
 * StagesPanel — the implementation rollup. Full implement track: a
 * "Stages N/total" line + the touched-file list + heal attempts. Quickfix
 * track (no `stages_total`): the `target_file` + `diff_summary` + heal
 * attempts. When neither shape carries content we render an honest hint.
 */
export function StagesPanel({ s }: { s: ImplementStructured }) {
  const isFullTrack = s.stages_total != null;
  const files = s.files_touched ?? [];
  const hasFullContent = isFullTrack || files.length > 0;
  const hasQuickfixContent = Boolean(s.target_file) || Boolean(s.diff_summary);
  const hasContent = hasFullContent || hasQuickfixContent;

  return (
    <Section
      title="Implementation"
      meta={isFullTrack ? `${s.stages_completed ?? 0}/${s.stages_total} stages` : undefined}
      data-testid="stages-panel"
    >
      {!hasContent ? (
        <EmptyLine>No implementation progress recorded yet.</EmptyLine>
      ) : (
        <Stack gap="3">
          {isFullTrack ? (
            <Cluster gap="2" align="center">
              <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--primary)]">
                Stages {s.stages_completed ?? 0}/{s.stages_total}
              </span>
              {s.last_commit_sha ? (
                <code className="font-mono text-xs text-[var(--text-muted)]">
                  {s.last_commit_sha.slice(0, 10)}
                </code>
              ) : null}
            </Cluster>
          ) : null}

          {!isFullTrack && s.target_file ? (
            <Stack gap="1.5">
              <SubHeading>Target file</SubHeading>
              <code className="break-all font-mono text-xs text-[var(--text)]">
                {s.target_file}
              </code>
            </Stack>
          ) : null}

          {!isFullTrack && s.diff_summary ? (
            <Stack gap="1.5">
              <SubHeading>Diff summary</SubHeading>
              <p className="text-xs text-[var(--text-subtle)]">{s.diff_summary}</p>
            </Stack>
          ) : null}

          {files.length > 0 ? (
            <Stack gap="1.5">
              <SubHeading>
                {files.length} file{files.length === 1 ? "" : "s"} touched
              </SubHeading>
              <Stack gap="1" as="ul">
                {files.map((f) => (
                  <FilePathRow key={f} path={f} />
                ))}
              </Stack>
            </Stack>
          ) : null}

          <span className="text-xs text-[var(--text-muted)]">
            Heal attempts: {s.heal_attempts_used}
          </span>
        </Stack>
      )}
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* ReviewFilesPanel — implement.review                                        */
/* -------------------------------------------------------------------------- */

/**
 * ReviewFilesPanel — the reviewed-file list (path + plain-language purpose +
 * any issues), a requirement-coverage list mapping each `R-id` to the files
 * that satisfy it, and the critic-iteration count. Empty `files` degrades to
 * a muted hint.
 */
export function ReviewFilesPanel({ s }: { s: ReviewStructured }) {
  const compliance = Object.entries(s.spec_compliance);

  return (
    <Section
      title="Code review"
      meta={`Critic iterations: ${s.critic_iterations}`}
      data-testid="review-files-panel"
    >
      {s.files.length === 0 ? (
        <EmptyLine>No files reviewed yet.</EmptyLine>
      ) : (
        <Stack gap="3">
          <Stack gap="2" as="ul">
            {s.files.map((f) => (
              <li
                key={f.path}
                className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2 transition-colors duration-200 ease-out hover:border-[var(--border-strong)]"
              >
                <Cluster gap="1.5" align="center" className="min-w-0">
                  <FileCode2 className="size-3 shrink-0 text-[var(--text-subtle)]" />
                  <code className="break-all font-mono text-xs text-[var(--text)]">
                    {f.path}
                  </code>
                </Cluster>
                {f.purpose_pm ? (
                  <p className="mt-1 text-xs text-[var(--text-subtle)]">{f.purpose_pm}</p>
                ) : null}
                {f.issues.length > 0 ? (
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {f.issues.map((issue, i) => (
                      <li
                        key={`${f.path}-issue-${i}`}
                        className="flex items-start gap-1.5 text-xs text-[var(--warning-ink)]"
                      >
                        <span aria-hidden className="mt-0.5 shrink-0">
                          •
                        </span>
                        <span className="min-w-0 break-words">{issue}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </Stack>

          {compliance.length > 0 ? (
            <Stack gap="1.5">
              <SubHeading>Spec compliance</SubHeading>
              <Stack gap="1" as="ul">
                {compliance.map(([reqId, paths]) => (
                  <li key={reqId} className="text-xs">
                    <Cluster gap="1.5" align="baseline" className="flex-wrap">
                      <span className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--text-muted)]">
                        {reqId}
                      </span>
                      {paths.length === 0 ? (
                        <span className="text-[var(--text-subtle)]">
                          no files mapped yet
                        </span>
                      ) : (
                        <span className="min-w-0 break-words text-[var(--text-subtle)]">
                          {paths.join(", ")}
                        </span>
                      )}
                    </Cluster>
                  </li>
                ))}
              </Stack>
            </Stack>
          ) : null}
        </Stack>
      )}
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* CiChecksPanel — ci.state                                                   */
/* -------------------------------------------------------------------------- */

/**
 * CiChecksPanel — one row per CI check (name + token-coloured status pill +
 * optional output summary, with the target_url linked when present) plus the
 * autofix attempts used/cap. Empty `checks` is the truthful pre-P2 state, so
 * we say so rather than fabricate rows.
 */
export function CiChecksPanel({ s }: { s: CiStructured }) {
  return (
    <Section
      title="CI checks"
      meta={`Autofix attempts: ${s.autofix_attempts_used}/${s.autofix_cap}`}
      data-testid="ci-checks-panel"
    >
      {s.checks.length === 0 ? (
        <EmptyLine>No CI checks recorded yet — checks populate once CI runs.</EmptyLine>
      ) : (
        <Stack gap="3">
          {s.commit_sha ? (
            <Cluster gap="1.5" align="center">
              <SubHeading>Commit</SubHeading>
              <code className="font-mono text-xs text-[var(--text-muted)]">
                {s.commit_sha.slice(0, 10)}
              </code>
            </Cluster>
          ) : null}
          <Stack gap="2" as="ul">
            {s.checks.map((c, i) => (
              <li
                key={`${c.name}-${i}`}
                className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2 transition-colors duration-200 ease-out hover:border-[var(--border-strong)]"
              >
                <Cluster justify="between" align="center" className="gap-2">
                  <Cluster gap="2" align="center" className="min-w-0">
                    {c.target_url ? (
                      <a
                        href={c.target_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-w-0 items-center gap-1 truncate text-sm font-medium text-[var(--primary)] hover:underline"
                      >
                        <span className="truncate">{c.name}</span>
                        <ExternalLink className="size-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="truncate text-sm font-medium">{c.name}</span>
                    )}
                  </Cluster>
                  <StatusPill status={c.status} />
                </Cluster>
                {c.output_summary ? (
                  <p className="mt-1 text-xs text-[var(--text-subtle)]">
                    {c.output_summary}
                  </p>
                ) : null}
              </li>
            ))}
          </Stack>
        </Stack>
      )}
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* PrSummaryPanel — pr.authored + quickfix.pr                                 */
/* -------------------------------------------------------------------------- */

/**
 * PrSummaryPanel — the opened PR's title + branch + number, a real link to
 * `pr_url` when non-null (else an honest "PR not opened yet"), the body
 * excerpt and comment-response count when the full implement track supplied
 * them.
 */
export function PrSummaryPanel({ s }: { s: PrStructured }) {
  return (
    <Section
      title="Pull request"
      meta={s.pr_number != null ? `#${s.pr_number}` : undefined}
      data-testid="pr-summary-panel"
    >
      <Stack gap="3">
        {s.pr_title ? (
          <span className="text-sm font-semibold text-[var(--text)]">{s.pr_title}</span>
        ) : null}

        {s.branch_name ? (
          <Cluster gap="1.5" align="center">
            <SubHeading>Branch</SubHeading>
            <code className="break-all font-mono text-xs text-[var(--text-muted)]">
              {s.branch_name}
            </code>
          </Cluster>
        ) : null}

        {s.pr_url ? (
          <a
            href={s.pr_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-1 text-sm font-medium text-[var(--primary)] hover:underline"
          >
            View pull request
            <ExternalLink className="size-3.5 shrink-0" />
          </a>
        ) : (
          <EmptyLine>PR not opened yet.</EmptyLine>
        )}

        {s.pr_body_excerpt ? (
          <Stack gap="1.5">
            <SubHeading>Description</SubHeading>
            <p className="text-xs text-[var(--text-subtle)]">{s.pr_body_excerpt}</p>
          </Stack>
        ) : null}

        {s.feedback_responses != null ? (
          <span className="text-xs text-[var(--text-muted)]">
            Comment responses: {s.feedback_responses}
          </span>
        ) : null}
      </Stack>
    </Section>
  );
}
