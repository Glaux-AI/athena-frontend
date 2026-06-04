"use client";

/**
 * §7 — `/embed/artifacts/[id]` presentational shell + helpers.
 *
 * Moved out of `page.tsx` so the route file only exports the default
 * route entry (Next.js App Router forbids non-default + non-reserved
 * exports from `page.tsx`). Underscore-prefixed filenames are ignored
 * by the Next routing layer, so this file is safe to import from both
 * the route and unit tests.
 *
 * Surface:
 *   - Document title + kind chip.
 *   - Body rendered via the shared DocShell renderer in view-only mode:
 *     no Edit tab, no History tab, no comments, no Improve drawer.
 *   - Cited sources — each citation chip becomes a link to the source's
 *     own embed URL when the BE supplies one (`citation.embed_url`),
 *     otherwise rendered inert.
 *   - Metadata pill: org name + last-edited timestamp.
 *
 * Private-org fallback:
 *   Same model as `/embed/runs/[id]`: 401/403 → "Sign in to view";
 *   anything else (missing, network) → "Artifact not available".
 *
 * Why we don't reuse `<DocShell>` directly:
 *   DocShell ships with Edit + History tabs, a save handler, and an
 *   improve / approve header-actions slot. For embed we only need its
 *   *body renderer*, so we render the markdown inline using a stripped
 *   DocShell with `onSave={undefined}` would still mount the textarea
 *   in the DOM behind the tab. Inline rendering keeps the embed bundle
 *   small and avoids exposing edit-mode UI to read-only viewers.
 */

import {
  Book,
  Clock,
  ExternalLink,
  FileText,
  GitPullRequest,
  Lock,
  Target,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { type RunDocument, type RunDocumentCitation } from "@/lib/api/client";
import { Stack, Cluster } from "@/components/layout/primitives";
import { Card } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/utils/format";
import { cn } from "@/lib/cn";

/* -------------------------------------------------------------------------- */
/* Presentational — exported for unit tests                                   */
/* -------------------------------------------------------------------------- */

/** Pure presentational shell — render the artifact body given a complete
 *  `RunDocument`. Exported so unit tests can render it without an API call.
 *  When `artifact` is `null`, renders the missing empty state. */
export function EmbedArtifactPage({ artifact }: { artifact: RunDocument | null }) {
  if (artifact === null) return <EmbedArtifactMissingEmpty />;
  const kindMeta = artifactKindMeta(artifact.kind);

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <Stack gap="4">
        {/* Header */}
        <header className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-2),var(--inner-highlight)] sm:p-5">
          <Cluster gap="2" align="center" className="flex-wrap">
            <span
              data-testid="artifact-kind-chip"
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                kindMeta.tone,
              )}
            >
              <kindMeta.Icon className="size-3" aria-hidden />
              {kindMeta.label}
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                artifact.status === "approved"
                  ? "bg-[var(--success-soft)] text-[var(--success-ink)]"
                  : artifact.status === "needs-review"
                  ? "bg-[var(--warning-soft)] text-[var(--warning-ink)]"
                  : "bg-[var(--primary-soft)] text-[var(--primary)]",
              )}
            >
              {artifact.status.replace("-", " ")}
            </span>
            <span className="text-xs text-[var(--text-muted)]">· {artifact.version}</span>
            <a
              href={`/runs/${encodeURIComponent(artifact.run_id)}`}
              target="_top"
              rel="noopener"
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs font-medium text-[var(--text)] shadow-[var(--shadow-1)] transition-[background-color,box-shadow] duration-200 ease-out hover:bg-[var(--surface-3)] hover:shadow-[var(--shadow-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              Open in Athena
              <ExternalLink className="size-3" aria-hidden />
            </a>
          </Cluster>
          <h1 className="mt-3 text-lg font-bold leading-tight tracking-tight text-[var(--text)] sm:text-xl">
            {artifact.title}
          </h1>
          <Cluster gap="2" align="center" className="mt-2 flex-wrap text-xs text-[var(--text-muted)]">
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2 py-0.5">
              {artifact.org_name}
            </span>
            <span aria-hidden>·</span>
            <Cluster gap="1" align="center">
              <Clock className="size-3" aria-hidden />
              <span>edited {formatRelativeTime(artifact.last_edited_at)}</span>
              {artifact.last_edited_by && (
                <span className="text-[var(--text-subtle)]">by {artifact.last_edited_by}</span>
              )}
            </Cluster>
          </Cluster>
        </header>

        {/* Body */}
        <Card className="p-4 sm:p-5">
          <article
            data-testid="artifact-body"
            className="prose prose-sm max-w-none text-sm leading-relaxed text-[var(--text)]"
          >
            {artifact.body ? (
              <div
                className="prose prose-sm max-w-none text-sm leading-relaxed [&_code]:rounded [&_code]:bg-[var(--code-bg)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] [&_h1]:mb-3 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-semibold [&_p]:mb-3 [&_p]:text-[var(--text-muted)] [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-[var(--text-muted)] [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-[var(--code-bg)] [&_pre]:p-2 [&_pre]:font-mono [&_pre]:text-[12px]"
                dangerouslySetInnerHTML={{ __html: artifact.body }}
              />
            ) : artifact.markdown ? (
              <ArtifactMarkdown markdown={artifact.markdown} />
            ) : (
              <p className="text-sm text-[var(--text-muted)]">No content yet.</p>
            )}
          </article>
        </Card>

        {/* Citations */}
        {artifact.citations && artifact.citations.length > 0 && (
          <Card className="p-3 sm:p-4">
            <Stack gap="2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Cited sources
              </span>
              <ul className="flex flex-wrap gap-1.5">
                {artifact.citations.map((c, i) => (
                  <li key={`${c.label}-${i}`}>
                    <CitationChip citation={c} />
                  </li>
                ))}
              </ul>
            </Stack>
          </Card>
        )}

        <p className="text-center text-[10px] text-[var(--text-muted)]">
          Read-only Athena embed
        </p>
      </Stack>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Internals                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Minimal, embed-only markdown renderer. The full DocShell renderer in
 * `components/docs/doc-shell.tsx` handles annotations + per-section edit
 * indicators that the embed surface deliberately suppresses. We keep
 * this implementation small (~30 lines) so the embed bundle stays
 * compact and the read-only contract is easy to read at a glance.
 *
 * Supported:
 *   - `#`/`##`/`###` headings
 *   - paragraphs
 *   - `- ` / `* ` bullet lists
 *   - fenced code blocks (```)
 *   - inline `code` and **bold**
 */
function ArtifactMarkdown({ markdown }: { markdown: string }) {
  const blocks = splitMarkdown(markdown);
  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === "heading") {
          const cls = "m-0 mb-2 mt-4 first:mt-0 text-[var(--text)] font-semibold";
          if (b.level === 1) return <h1 key={i} className={cn(cls, "text-base")}>{b.text}</h1>;
          if (b.level === 2) return <h2 key={i} className={cn(cls, "text-sm")}>{b.text}</h2>;
          return <h3 key={i} className={cn(cls, "text-sm")}>{b.text}</h3>;
        }
        if (b.kind === "code") {
          return (
            <pre key={i} className="overflow-x-auto rounded-md bg-[var(--code-bg)] p-2 font-mono text-[12px]">
              <code>{b.text}</code>
            </pre>
          );
        }
        if (b.kind === "list") {
          return (
            <ul key={i} className="mb-3 list-disc pl-5 text-[var(--text-muted)]">
              {b.items.map((it, j) => (
                <li key={j}>{renderInline(it)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="mb-3 text-[var(--text-muted)]">
            {renderInline(b.text)}
          </p>
        );
      })}
    </>
  );
}

type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "code"; text: string }
  | { kind: "list"; items: string[] };

function splitMarkdown(md: string): Block[] {
  const lines = md.split("\n");
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    // Fenced code
    if (line.startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        body.push(lines[i] ?? "");
        i++;
      }
      if (i < lines.length) i++; // consume closing ```
      out.push({ kind: "code", text: body.join("\n") });
      continue;
    }
    // Heading
    const h = line.match(/^(#{1,3})\s+(.+?)\s*$/);
    if (h) {
      const level = h[1]!.length as 1 | 2 | 3;
      out.push({ kind: "heading", level, text: h[2]! });
      i++;
      continue;
    }
    // List
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^[-*]\s+/, ""));
        i++;
      }
      out.push({ kind: "list", items });
      continue;
    }
    // Blank line — skip
    if (line.trim() === "") {
      i++;
      continue;
    }
    // Paragraph — accumulate until blank line / next block
    const para: string[] = [line];
    i++;
    while (
      i < lines.length
      && (lines[i] ?? "").trim() !== ""
      && !(lines[i] ?? "").startsWith("```")
      && !/^(#{1,3})\s+/.test(lines[i] ?? "")
      && !/^[-*]\s+/.test(lines[i] ?? "")
    ) {
      para.push(lines[i] ?? "");
      i++;
    }
    out.push({ kind: "paragraph", text: para.join(" ") });
  }
  return out;
}

function renderInline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*)|(`([^`]+)`)/g;
  let cursor = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > cursor) out.push(text.slice(cursor, m.index));
    if (m[2] !== undefined) out.push(<strong key={`b-${n++}`}>{m[2]}</strong>);
    else if (m[4] !== undefined) {
      out.push(
        <code key={`c-${n++}`} className="rounded bg-[var(--code-bg)] px-1 py-0.5 font-mono text-[12px]">
          {m[4]}
        </code>,
      );
    }
    cursor = re.lastIndex;
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

/* -------------------------------------------------------------------------- */
/* Citations                                                                  */
/* -------------------------------------------------------------------------- */

function CitationChip({ citation }: { citation: RunDocumentCitation }) {
  const cls =
    "inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-xs font-medium";
  const inner = (
    <>
      <span className="rounded bg-[var(--surface-3)] px-1 py-0 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {citation.kind}
      </span>
      <span className="text-[var(--text)]">{citation.label}</span>
    </>
  );
  if (citation.embed_url) {
    return (
      <a
        href={citation.embed_url}
        target="_top"
        rel="noopener"
        title={citation.title ?? citation.ref ?? citation.label}
        className={cn(cls, "text-[var(--text-muted)] transition-[color,border-color,box-shadow] duration-200 ease-out hover:border-[var(--border-strong)] hover:text-[var(--text)] hover:shadow-[var(--shadow-1)]")}
      >
        {inner}
      </a>
    );
  }
  return (
    <span
      title={citation.title ?? citation.ref ?? citation.label}
      className={cn(cls, "text-[var(--text-muted)]")}
    >
      {inner}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty / loading states                                                     */
/* -------------------------------------------------------------------------- */

export function EmbedArtifactSkeleton() {
  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <Stack gap="4">
        <div className="h-24 animate-pulse rounded-xl bg-[var(--surface-2)]" />
        <div className="h-64 animate-pulse rounded-lg bg-[var(--surface-2)]" />
      </Stack>
    </div>
  );
}

export function EmbedArtifactPrivateEmpty({ artifactId }: { artifactId: string }) {
  return (
    <div className="mx-auto max-w-md p-4 sm:p-8">
      <Card className="p-6 text-center">
        <Stack gap="3">
          <div className="mx-auto flex size-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] shadow-[var(--shadow-1)]">
            <Lock className="size-5 text-[var(--text-muted)]" aria-hidden />
          </div>
          <Stack gap="1">
            <h1 className="text-sm font-semibold text-[var(--text)]">This artifact is private.</h1>
            <p className="text-xs text-[var(--text-muted)]">
              Sign in to Athena to view this document if you have access.
            </p>
          </Stack>
          <div className="pt-1">
            <a
              href={`/login?returnTo=${encodeURIComponent(`/artifacts/${artifactId}`)}`}
              target="_top"
              rel="noopener"
              className="inline-flex items-center gap-1 rounded-md bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-[var(--primary-fg)] shadow-[var(--shadow-1)] transition-[opacity,box-shadow] duration-200 ease-out hover:opacity-90 hover:shadow-[var(--shadow-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              Sign in to view
              <ExternalLink className="size-3" aria-hidden />
            </a>
          </div>
        </Stack>
      </Card>
    </div>
  );
}

export function EmbedArtifactMissingEmpty() {
  return (
    <div className="mx-auto max-w-md p-4 sm:p-8">
      <Card className="p-6 text-center">
        <Stack gap="3">
          <div className="mx-auto flex size-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] shadow-[var(--shadow-1)]">
            <XCircle className="size-5 text-[var(--text-muted)]" aria-hidden />
          </div>
          <Stack gap="1">
            <h1 className="text-sm font-semibold text-[var(--text)]">Artifact not available.</h1>
            <p className="text-xs text-[var(--text-muted)]">
              The link may be wrong, the document may have been deleted, or it&apos;s not shareable.
            </p>
          </Stack>
        </Stack>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Kind chip metadata                                                         */
/* -------------------------------------------------------------------------- */

function artifactKindMeta(kind: RunDocument["kind"]): { label: string; tone: string; Icon: LucideIcon } {
  switch (kind) {
    case "prd":
      return { label: "PRD", tone: "bg-[var(--info-soft)] text-[var(--info-ink)]", Icon: Target };
    case "spec":
      return { label: "Spec", tone: "bg-[var(--primary-soft)] text-[var(--primary)]", Icon: FileText };
    case "plan":
      return { label: "Plan", tone: "bg-[var(--warning-soft)] text-[var(--warning-ink)]", Icon: Book };
    case "review":
      return { label: "Review", tone: "bg-[var(--success-soft)] text-[var(--success-ink)]", Icon: Book };
    case "pr_description":
      return { label: "PR description", tone: "bg-[var(--surface-3)] text-[var(--text-muted)]", Icon: GitPullRequest };
  }
}
