"use client";

/**
 * DocShell — the reusable view / edit / history surface for every doc-shaped
 * artifact in Athena: spec.md, plan.md, prd.md, capability.md, runbook.md.
 *
 * Tabs:
 *   - View: rendered markdown (or a fallback `body_html` passed in).
 *   - Edit: textarea + "Save as v{n+1}" CTA.
 *   - History: list of revisions; click one to diff vs. current.
 *
 * The caller owns persistence — `onSave({ markdown, note })` should hit the
 * backend and re-fetch the doc. DocShell handles all the local-state UX.
 *
 * Annotation rendering (F-04.11): when the markdown body contains tokens of
 * the form `[unverified_reference: <kind> '<id>']`, `[new_utility: <name>]`,
 * `[verified_existing: <path:line>]`, the View tab renders them as styled
 * inline annotations with hover tooltips. The transform runs over the
 * markdown source so the `body` HTML fallback isn't required.
 *
 * Per-section "user-edited" decoration (F-04.9): when `sections` carries a
 * list of `DocSectionState` rows, the View tab interleaves a left-rule
 * highlight + an "✎ edited" badge next to each user-edited region. The
 * markdown is split on headings to attribute regions to sections.
 */

import { useEffect, useState, Fragment, type ReactNode } from "react";
import { Check, Clock, Edit3, Eye, History, Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";
import {
  AnnotationTooltip,
  parseAnnotation,
  type AnnotationKind,
} from "@/components/docs/annotation-tooltip";
import { formatRelativeTime } from "@/lib/utils/format";

export interface DocRevision {
  id: string;
  author: string;
  authorKind: "human" | "agent";
  date: string;
  note: string;
  /** Optional one-line "what changed" summary vs. the previous revision. */
  changes?: string;
}

/**
 * F-04.9 — per-section state passed from the run page. Heading-keyed; the
 * doc renderer matches each heading in the markdown body to a row here by
 * `section_key` (slug) or by `anchor_id`. When `user_edited` is true the
 * section body gets a left-rule highlight + an "edited" badge next to the
 * heading. No mutation surface — purely display.
 */
interface DocSectionState {
  /** Stable id for the heading section (anchor_id from `document_section_state`). */
  anchor_id: string;
  /** Heading text used to match against the body. */
  heading: string;
  user_edited: boolean;
  last_edited_by_user_name?: string | null;
  last_edited_at?: string | null;
  /** ID of the run_decisions row, deep-links to the decision pane. */
  last_decision_id?: string | null;
}

interface DocShellProps {
  /** Filename / title to display in the header. */
  doc: string;
  /** Current revision label (e.g. "v3"). */
  version: string;
  /** Approval / draft state. */
  status: "draft" | "needs-review" | "approved";
  /** Pre-rendered HTML for the View tab. If absent, `markdown` is shown verbatim in a <pre>. */
  body?: string | undefined;
  /** Markdown source — what the Edit textarea shows + saves. */
  markdown?: string | undefined;
  /** Revision history (most-recent first). */
  revisions: DocRevision[];
  /** Names of people who approved the current revision. */
  approvedBy?: { name: string; role: string; avatar?: string }[] | undefined;
  /** Called when the user clicks "Save as vN+1". */
  onSave?: ((next: { markdown: string; note: string }) => Promise<void>) | undefined;
  /** Header CTA cluster (Approve / Reopen / Regenerate / Improve…). */
  headerActions?: React.ReactNode;
  /** F-04.9 — per-section state for "user-edited" indicators. Optional. */
  sections?: DocSectionState[] | undefined;
  /** F-04.11 — render `[unverified_reference: …]` etc. as styled tokens. Default `true`. */
  renderAnnotations?: boolean | undefined;
}

type Tab = "view" | "edit" | "history";

export function DocShell({
  doc, version, status, body, markdown, revisions, approvedBy, onSave, headerActions,
  sections,
  renderAnnotations = true,
}: DocShellProps) {
  const [tab, setTab] = useState<Tab>("view");
  const [draft, setDraft] = useState(markdown ?? "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedRevId, setSelectedRevId] = useState<string | null>(revisions[0]?.id ?? null);

  useEffect(() => { setDraft(markdown ?? ""); }, [markdown]);

  const nextVersion = `v${parseInt(version.replace(/^v/, ""), 10) + 1}`;

  const save = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave({ markdown: draft, note: note.trim() || "Manual edit" });
      setTab("view");
      setNote("");
    } finally {
      setSaving(false);
    }
  };

  const selectedRev = revisions.find((r) => r.id === selectedRevId) ?? null;

  return (
    <Card className="p-0">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <Cluster justify="between" align="center">
          <Stack gap="0">
            <Cluster gap="2" align="center">
              <span className="text-sm font-semibold">{doc}</span>
              <span className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                status === "approved" ? "bg-[var(--success-soft)] text-[var(--success)]"
                : status === "needs-review" ? "bg-[var(--warning-soft)] text-[var(--warning)]"
                : "bg-[var(--primary-soft)] text-[var(--primary)]",
              )}>{status.replace("-", " ")}</span>
              <span className="text-xs text-[var(--text-muted)]">· {version}</span>
            </Cluster>
            {approvedBy && approvedBy.length > 0 && (
              <Cluster gap="2" align="center" className="text-xs text-[var(--text-muted)]">
                Approved by{" "}
                {approvedBy.map((a, i) => (
                  <span key={a.name} className="font-medium text-[var(--text)]">
                    {a.name}{i < approvedBy.length - 1 ? "," : ""}
                  </span>
                ))}
              </Cluster>
            )}
          </Stack>
          <Cluster gap="2">{headerActions}</Cluster>
        </Cluster>

        <Cluster gap="0" className="mt-3 -mb-3">
          {([
            { key: "view",    label: "View",    icon: Eye   },
            { key: "edit",    label: "Edit",    icon: Edit3 },
            { key: "history", label: "History", icon: History },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium",
                tab === t.key ? "border-[var(--primary)] text-[var(--primary)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]",
              )}
            >
              <t.icon className="size-3.5" />
              {t.label}
              {t.key === "history" && revisions.length > 0 && (
                <span className="rounded-full bg-[var(--surface-2)] px-1 py-0 text-[9px] text-[var(--text-muted)]">{revisions.length}</span>
              )}
            </button>
          ))}
        </Cluster>
      </div>

      <div className="p-4">
        {tab === "view" && (
          markdown && (renderAnnotations || (sections && sections.length > 0))
            ? <DocBodyRenderer markdown={markdown} sections={sections} renderAnnotations={renderAnnotations} />
            : body
              ? <div className="prose prose-sm max-w-none text-sm leading-relaxed [&_code]:rounded [&_code]:bg-[var(--code-bg)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] [&_h1]:mb-3 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-semibold [&_p]:mb-3 [&_p]:text-[var(--text-muted)] [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-[var(--text-muted)] [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-[var(--code-bg)] [&_pre]:p-2 [&_pre]:font-mono [&_pre]:text-[12px]" dangerouslySetInnerHTML={{ __html: body }} />
              : markdown
                ? <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[var(--text-muted)]">{markdown}</pre>
                : <p className="text-sm text-[var(--text-muted)]">No content yet.</p>
        )}

        {tab === "edit" && (
          <Stack gap="3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={16}
              className="resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-[12px] leading-relaxed focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              placeholder="Markdown…"
            />
            <Stack gap="1.5">
              <span className="text-xs font-medium text-[var(--text-muted)]">Revision note (optional)</span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What did you change and why?"
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
            </Stack>
            <Cluster justify="between" align="center">
              <span className="text-xs text-[var(--text-subtle)]">{draft.length.toLocaleString()} chars · markdown supported</span>
              <Cluster gap="2">
                <Button variant="ghost" onClick={() => { setDraft(markdown ?? ""); setNote(""); setTab("view"); }}>Discard</Button>
                <Button onClick={save} disabled={saving || draft === (markdown ?? "")}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Save as {nextVersion}
                </Button>
              </Cluster>
            </Cluster>
          </Stack>
        )}

        {tab === "history" && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[220px_1fr]">
            <Stack gap="1" as="ul">
              {revisions.length === 0 ? (
                <li className="text-sm text-[var(--text-muted)]">No revisions yet.</li>
              ) : revisions.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setSelectedRevId(r.id)}
                    className={cn(
                      "block w-full rounded-md border p-2 text-left text-xs transition-colors",
                      r.id === selectedRevId
                        ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                        : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]",
                    )}
                  >
                    <Cluster justify="between" align="center">
                      <span className="font-mono font-semibold">{r.id}</span>
                      <Cluster gap="1" align="center">
                        {r.authorKind === "agent"
                          ? <span className="rounded bg-[var(--primary-soft)] px-1 py-0 text-[9px] uppercase tracking-wider text-[var(--primary)]">agent</span>
                          : <span className="rounded bg-[var(--surface-3)] px-1 py-0 text-[9px] uppercase tracking-wider text-[var(--text-muted)]">human</span>}
                      </Cluster>
                    </Cluster>
                    <p className="mt-1 line-clamp-2 text-[var(--text)]">{r.note}</p>
                    {r.changes && (
                      <p className="mt-0.5 line-clamp-2 text-[var(--text-muted)]">
                        <span className="font-semibold uppercase tracking-wider text-[var(--text-subtle)]">changes</span> {r.changes}
                      </p>
                    )}
                    <Cluster gap="1" align="center" className="mt-1 text-[10px] text-[var(--text-subtle)]">
                      <Clock className="size-2.5" />
                      {r.date}
                    </Cluster>
                  </button>
                </li>
              ))}
            </Stack>
            <Card className="bg-[var(--surface-2)]">
              {selectedRev ? (
                <Stack gap="3">
                  <Stack gap="0">
                    <Cluster gap="2" align="center">
                      <span className="font-mono text-sm font-semibold">{selectedRev.id}</span>
                      {selectedRev.id === revisions[0]?.id && (
                        <span className="rounded-full bg-[var(--success-soft)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--success)]"><Check className="mr-0.5 inline size-2.5" />Current</span>
                      )}
                    </Cluster>
                    <span className="text-xs text-[var(--text-muted)]">{selectedRev.author} · {selectedRev.date}</span>
                  </Stack>
                  <p className="text-sm text-[var(--text-muted)]">{selectedRev.note}</p>
                  {selectedRev.changes && (
                    <Stack gap="1" className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">What changed</span>
                      <p className="text-xs text-[var(--text)]">{selectedRev.changes}</p>
                    </Stack>
                  )}
                </Stack>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">Pick a revision on the left.</p>
              )}
            </Card>
          </div>
        )}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Body renderer — annotation tokens + per-section "user-edited" decoration   */
/* -------------------------------------------------------------------------- */

const ANNOTATION_KIND_TOKEN: Record<string, AnnotationKind> = {
  unverified_reference: "unverified_reference",
  verified_existing: "verified_existing",
  new_utility: "new_utility",
};

/**
 * Linearly scan a chunk of plain text for `[<kind>: <content>]` annotations
 * (F-04.11) and produce an interleaved array of strings + AnnotationTooltip
 * elements. Falls back to the input string when no token matches.
 */
function renderTextWithAnnotations(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[(unverified_reference|verified_existing|new_utility):\s*([^\]]+)\]/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let n = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > cursor) out.push(text.slice(cursor, match.index));
    const kind = ANNOTATION_KIND_TOKEN[match[1]!]!;
    const ann = parseAnnotation(kind, match[2]!);
    out.push(
      <AnnotationTooltip key={`${keyPrefix}-ann-${n++}`} annotation={ann}>
        <code className="font-mono text-[12px]">{ann.identifier}</code>
      </AnnotationTooltip>,
    );
    cursor = re.lastIndex;
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return out.length === 0 ? [text] : out;
}

/** Inline markdown: **bold** and `code` — kept minimal and additive over annotations. */
function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*)|(`([^`]+)`)/g;
  let cursor = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > cursor) {
      out.push(...renderTextWithAnnotations(text.slice(cursor, m.index), `${keyPrefix}-${n}`));
    }
    if (m[2] !== undefined) {
      out.push(<strong key={`${keyPrefix}-b-${n++}`}>{renderTextWithAnnotations(m[2], `${keyPrefix}-b-${n}`)}</strong>);
    } else if (m[4] !== undefined) {
      out.push(
        <code key={`${keyPrefix}-c-${n++}`} className="rounded bg-[var(--code-bg)] px-1 py-0.5 font-mono text-[12px]">
          {m[4]}
        </code>,
      );
    }
    cursor = re.lastIndex;
  }
  if (cursor < text.length) {
    out.push(...renderTextWithAnnotations(text.slice(cursor), `${keyPrefix}-${n}`));
  }
  return out;
}

interface SectionBlock {
  /** Heading text without leading "#" markers; null for pre-first-heading prelude. */
  heading: string | null;
  /** Heading depth — 1..6. Null for prelude. */
  level: number | null;
  /** Raw markdown for the body of this section (excludes the heading line). */
  body: string;
}

/** Split markdown by headings so each region can be attributed to a section. */
function splitMarkdownByHeading(md: string): SectionBlock[] {
  const lines = md.split("\n");
  const blocks: SectionBlock[] = [];
  let current: SectionBlock = { heading: null, level: null, body: "" };
  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (m) {
      if (current.heading !== null || current.body.trim().length > 0) blocks.push(current);
      current = { heading: m[2]!, level: m[1]!.length, body: "" };
    } else {
      current.body += (current.body.length > 0 ? "\n" : "") + line;
    }
  }
  blocks.push(current);
  return blocks;
}

function renderBlockBody(body: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const paragraphs = body.split(/\n\n+/);
  let n = 0;
  for (const p of paragraphs) {
    const t = p.trim();
    if (!t) continue;
    if (t.startsWith("```")) {
      const inner = t.replace(/^```[a-z]*\n?/, "").replace(/```$/, "");
      out.push(
        <pre key={`${keyPrefix}-pre-${n++}`} className="overflow-x-auto rounded-md bg-[var(--code-bg)] p-2 font-mono text-[12px]">
          <code>{inner}</code>
        </pre>,
      );
      continue;
    }
    if (/^[-*]\s/.test(t)) {
      const items = t.split(/\n/).filter((l) => /^[-*]\s/.test(l.trim()));
      out.push(
        <ul key={`${keyPrefix}-ul-${n++}`} className="mb-3 list-disc pl-5 text-[var(--text-muted)]">
          {items.map((it, j) => (
            <li key={j}>{renderInlineMarkdown(it.replace(/^[-*]\s+/, ""), `${keyPrefix}-li-${n}-${j}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (/^\d+\.\s/.test(t)) {
      const items = t.split(/\n/).filter((l) => /^\d+\.\s/.test(l.trim()));
      out.push(
        <ol key={`${keyPrefix}-ol-${n++}`} className="mb-3 list-decimal pl-5 text-[var(--text-muted)]">
          {items.map((it, j) => (
            <li key={j}>{renderInlineMarkdown(it.replace(/^\d+\.\s+/, ""), `${keyPrefix}-oli-${n}-${j}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }
    out.push(
      <p key={`${keyPrefix}-p-${n++}`} className="mb-3 text-[var(--text-muted)]">
        {renderInlineMarkdown(t, `${keyPrefix}-inl-${n}`)}
      </p>,
    );
  }
  return out;
}

function DocBodyRenderer({
  markdown,
  sections,
  renderAnnotations,
}: {
  markdown: string;
  sections?: DocSectionState[] | undefined;
  renderAnnotations: boolean;
}) {
  const blocks = splitMarkdownByHeading(markdown);
  const sectionByHeading = new Map<string, DocSectionState>();
  for (const s of sections ?? []) sectionByHeading.set(s.heading.trim().toLowerCase(), s);

  return (
    <div className="prose prose-sm max-w-none text-sm leading-relaxed">
      {blocks.map((b, i) => {
        const matchedSection =
          b.heading != null ? sectionByHeading.get(b.heading.trim().toLowerCase()) : undefined;
        const headingKey = `block-${i}`;
        const HeadingTag = b.level === 1 ? "h1" : b.level === 2 ? "h2" : "h3";
        const headingNode = b.heading != null ? (
          <Cluster justify="between" align="center" className="mb-2 mt-4 first:mt-0">
            <HeadingTag
              className={cn(
                b.level === 1 ? "text-base font-semibold" : b.level === 2 ? "text-sm font-semibold" : "text-sm font-semibold",
                "m-0 text-[var(--text)]",
              )}
            >
              {b.heading}
            </HeadingTag>
            {matchedSection?.user_edited && (
              <span
                title={
                  matchedSection.last_edited_by_user_name
                    ? `Last edited by ${matchedSection.last_edited_by_user_name}${matchedSection.last_decision_id ? ` · decision ${matchedSection.last_decision_id}` : ""}`
                    : "User-edited section"
                }
                data-decision-id={matchedSection.last_decision_id ?? undefined}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--primary-soft)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--primary)]"
              >
                <Edit3 className="size-2.5" aria-hidden />
                Edited
                {matchedSection.last_edited_at && (
                  <span className="font-normal normal-case text-[var(--text-muted)]">
                    · {formatRelativeTime(matchedSection.last_edited_at)}
                  </span>
                )}
              </span>
            )}
          </Cluster>
        ) : null;
        const bodyNodes = renderAnnotations
          ? renderBlockBody(b.body, headingKey)
          : [
              <pre key={`${headingKey}-pre`} className="whitespace-pre-wrap font-sans text-[var(--text-muted)]">
                {b.body}
              </pre>,
            ];
        return (
          <Fragment key={headingKey}>
            {headingNode}
            <div
              className={cn(
                matchedSection?.user_edited &&
                  "border-l-2 border-l-[var(--primary)] pl-3",
              )}
            >
              {bodyNodes}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
