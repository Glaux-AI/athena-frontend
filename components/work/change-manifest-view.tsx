"use client";

/**
 * ChangeManifestView - the kind-aware renderer for `change_manifest` /
 * `fix_plan` artifacts (the implementation-plan hard gate). It turns the
 * plan's wall of prose into a scannable view: a "what changes" count chip
 * leads, the Changes table renders as an interactive file-change table (an
 * add/modify/delete badge read from the real Change column), and the
 * surrounding prose (Approach / Risks / Order of work / CHANGE CHECKLIST)
 * renders as ordinary markdown around it.
 *
 * Render-time only: it parses the markdown the model already wrote (zero added
 * tokens) and never infers a change-kind from prose. A body with no
 * recognizable change-table renders whole as markdown - the table + chip are
 * simply absent, not a fallback branch. Badge tokens mirror <DiffView> exactly.
 */

import { useMemo } from "react";
import { FileDiff } from "lucide-react";

import { Cluster, Stack } from "@/components/layout/primitives";
import { Pill, type PillTone } from "@/components/ui/pill";
import { ArtifactMarkdown } from "@/components/work/artifact-markdown";
import {
  cleanCell,
  normalizeChangeKind,
  parseChangeManifest,
  summarizeChanges,
  type ChangeKind,
  type ChangeSummary,
  type ChangeTable as ChangeTableData,
} from "@/lib/work/change-manifest";
import { cn } from "@/lib/cn";

/** add/modify/delete badge tones - mirrors <DiffView> (success/danger), with
 *  `info` for "modify" so the three kinds read distinctly. */
const KIND_TONE: Record<Exclude<ChangeKind, "other">, PillTone> = {
  add: "success",
  modify: "info",
  delete: "danger",
};

export function ChangeManifestView({ body }: { body: string }) {
  const parsed = useMemo(() => parseChangeManifest(body), [body]);
  if (!parsed.table) return <ArtifactMarkdown text={body} />;
  const summary = summarizeChanges(parsed.table);
  return (
    <Stack gap="3" className="min-w-0">
      <ChangeSummaryChip summary={summary} />
      {parsed.before.trim() && <ArtifactMarkdown text={parsed.before} />}
      <ChangeTable table={parsed.table} />
      {parsed.after.trim() && <ArtifactMarkdown text={parsed.after} />}
    </Stack>
  );
}

/** The "what changes" strip: total change count, then the add/modify/delete
 *  breakdown when the plan carried a Change column. Leads the artifact. */
function ChangeSummaryChip({ summary }: { summary: ChangeSummary }) {
  const parts: string[] = [];
  if (summary.added) parts.push(`${summary.added} added`);
  if (summary.modified) parts.push(`${summary.modified} modified`);
  if (summary.removed) parts.push(`${summary.removed} deleted`);
  return (
    <Cluster
      gap="2"
      align="center"
      data-testid="change-summary"
      className="w-fit rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5"
    >
      <FileDiff className="size-4 text-[var(--primary)]" aria-hidden />
      <span className="text-sm font-semibold tabular-nums text-[var(--text)]">
        {summary.total} {summary.total === 1 ? "change" : "changes"}
      </span>
      {parts.length > 0 && (
        <span className="text-xs tabular-nums text-[var(--text-muted)]">{parts.join(" · ")}</span>
      )}
    </Cluster>
  );
}

/** The Changes table, rendered faithful to the columns the model wrote: the
 *  file column is monospaced, the Change column becomes a colored badge, the
 *  rest is plain text. */
function ChangeTable({ table }: { table: ChangeTableData }) {
  return (
    <div
      data-testid="change-table"
      className="min-w-0 overflow-x-auto rounded-lg border border-[var(--border)]"
    >
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
            {table.headers.map((h, j) => (
              <th
                key={j}
                className="px-2.5 py-1.5 text-left text-micro font-semibold uppercase tracking-wide text-[var(--text-subtle)]"
              >
                {cleanCell(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr
              key={ri}
              className="border-b border-[var(--border)] align-top transition-colors duration-150 ease-out last:border-0 hover:bg-[var(--surface-2)]"
            >
              {table.headers.map((_h, ci) => (
                <td
                  key={ci}
                  className={cn(
                    "px-2.5 py-1.5",
                    ci === table.fileIdx
                      ? "whitespace-nowrap font-mono text-[var(--text)]"
                      : "text-[var(--text-muted)]",
                  )}
                >
                  {ci === table.changeIdx ? (
                    <KindBadge raw={row[ci] ?? ""} />
                  ) : (
                    cleanCell(row[ci] ?? "")
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The model's own Change-column word, colored by its normalized kind. An
 *  unrecognized value renders as plain text (no misleading badge). */
function KindBadge({ raw }: { raw: string }) {
  const kind = normalizeChangeKind(raw);
  const label = cleanCell(raw);
  if (kind === "other") {
    return <span className="text-[var(--text-muted)]">{label || "-"}</span>;
  }
  return (
    <Pill size="sm" tone={KIND_TONE[kind]}>
      {label}
    </Pill>
  );
}
