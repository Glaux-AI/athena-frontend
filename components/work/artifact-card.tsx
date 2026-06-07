"use client";

/**
 * ArtifactCard — renders the selected stage's working artifact.
 *
 * Body: the latest (working) artifact body, rendered paragraph-by-paragraph
 * through `CitationRenderer` so `kn://` / `repo://` references become clickable
 * citation chips. The AI only ever uses this working version — old revisions
 * are never fed into agent context (the version-history list below makes that
 * explicit).
 *
 * "Generated from" expander → `api.tasks.provenance(id, artifactId)` (`Ref[]`):
 * the source pointers of the steps that produced this artifact (lazy; fetched
 * on first open).
 *
 * Version history → `api.tasks.artifactVersions(id, artifactId)`
 * (`ArtifactVersion[]`): a read-only audit list (version + who + when).
 *
 * The card is intentionally read-only — editing/authoring lives in
 * `StageActions` (the manual path). A stage with no artifact yet renders an
 * empty hint instead.
 */

import { useCallback, useEffect, useId, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  FileText,
  History,
  MonitorPlay,
  Sparkles,
} from "lucide-react";

import {
  ApiError,
  api,
  type ArtifactDetail,
  type ArtifactVersion,
  type Ref,
} from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Cluster, Stack } from "@/components/layout/primitives";
import { CitationRenderer } from "@/components/runs/citations/citation-renderer";
import { formatRelativeTime } from "@/lib/utils/format";
import { cn } from "@/lib/cn";

export function ArtifactCard({
  taskId,
  artifactId,
  artifactKind,
  stageTitle,
  /** Bumped by the page when an `artifact_ready` SSE signal lands so the card
   *  re-fetches the freshly-minted working version. */
  refreshKey,
}: {
  taskId: string;
  artifactId: string;
  artifactKind: string | null;
  stageTitle: string;
  refreshKey?: number | undefined;
}) {
  const [detail, setDetail] = useState<ArtifactDetail | null>(null);
  const [versions, setVersions] = useState<ArtifactVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const [body, vers] = await Promise.all([
          api.tasks.artifact(taskId, artifactId),
          api.tasks.artifactVersions(taskId, artifactId).catch(() => [] as ArtifactVersion[]),
        ]);
        if (!cancelled) {
          setDetail(body);
          setVersions(vers);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : "Failed to load artifact");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId, artifactId, refreshKey]);

  if (isLoading) {
    return (
      <Card variant="elevated">
        <Stack gap="3">
          <div className="h-5 w-48 animate-pulse rounded bg-[var(--surface-2)]" />
          <div className="h-4 w-full animate-pulse rounded bg-[var(--surface-2)]" />
          <div className="h-4 w-11/12 animate-pulse rounded bg-[var(--surface-2)]" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--surface-2)]" />
        </Stack>
      </Card>
    );
  }

  if (error || !detail) {
    return (
      <Card variant="elevated" className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
        <p className="text-sm text-[var(--danger-ink)]">{error ?? "This artifact is unavailable."}</p>
      </Card>
    );
  }

  return (
    <Card variant="elevated">
      <Stack gap="3">
        <Cluster justify="between" align="center" className="border-b border-[var(--border)] pb-2.5">
          <Cluster gap="2" align="center">
            <FileText className="size-4 text-[var(--primary)]" aria-hidden />
            <span className="text-sm font-semibold">{stageTitle}</span>
            {artifactKind && (
              <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                {artifactKind.replace(/_/g, " ")}
              </span>
            )}
          </Cluster>
          <span className="text-xs text-[var(--text-muted)]">
            working version · v{detail.version}
          </span>
        </Cluster>

        <ArtifactBody body={detail.body} artifactKind={artifactKind} />

        <ProvenanceExpander taskId={taskId} artifactId={artifactId} refreshKey={refreshKey} />

        <VersionHistory
          versions={versions}
          open={historyOpen}
          onToggle={() => setHistoryOpen((v) => !v)}
        />
      </Stack>
    </Card>
  );
}

// --------------------------------------------------------------------------- //
// Kind-aware body rendering                                                    //
// --------------------------------------------------------------------------- //

type Segment =
  | { type: "prose"; text: string }
  | { type: "code"; lang: string; code: string };

/** Split a markdown body into prose runs and fenced code blocks. A design
 *  artifact's runnable HTML rides in a ```html block; diffs/code ride in their
 *  own fences. An unterminated fence falls through as prose (never throws). */
function parseSegments(body: string): Segment[] {
  const segments: Segment[] = [];
  const fence = /```([\w-]*)\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(body)) !== null) {
    const prose = body.slice(last, m.index);
    if (prose.trim()) segments.push({ type: "prose", text: prose });
    segments.push({ type: "code", lang: (m[1] ?? "").toLowerCase(), code: m[2] ?? "" });
    last = fence.lastIndex;
  }
  const tail = body.slice(last);
  if (tail.trim()) segments.push({ type: "prose", text: tail });
  return segments.length > 0 ? segments : [{ type: "prose", text: body }];
}

const HTML_HINT = /<(!doctype|html|head|body|div|section|main|style|script)/i;

/** Render an artifact body by kind/shape: prose as light markdown, code in a
 *  code block, and an HTML/CSS/JS prototype in a sandboxed live preview. */
function ArtifactBody({
  body,
  artifactKind,
}: {
  body: string;
  artifactKind: string | null;
}) {
  const isDesign = (artifactKind ?? "").startsWith("design");
  const segments = parseSegments(body);
  return (
    <Stack gap="3">
      {segments.map((seg, i) =>
        seg.type === "prose" ? (
          <Prose key={i} text={seg.text} />
        ) : isHtmlSegment(seg, isDesign) ? (
          <HtmlPreview key={i} code={seg.code} />
        ) : (
          <CodeBlock key={i} lang={seg.lang} code={seg.code} />
        ),
      )}
    </Stack>
  );
}

function isHtmlSegment(seg: { lang: string; code: string }, isDesign: boolean): boolean {
  if (seg.lang === "html" || seg.lang === "htm") return true;
  // A design artifact's untagged block that clearly contains markup still previews.
  return isDesign && seg.lang === "" && HTML_HINT.test(seg.code);
}

/** Sandboxed live preview of a runnable HTML/CSS/JS prototype, with a code
 *  toggle. The iframe is `allow-scripts` ONLY (no same-origin / forms / popups)
 *  so AI-authored markup can run but never reach the parent, cookies, or storage. */
function HtmlPreview({ code }: { code: string }) {
  const [view, setView] = useState<"preview" | "code">("preview");
  const base = useId();
  const previewTab = `${base}-preview-tab`;
  const codeTab = `${base}-code-tab`;
  const panelId = `${base}-panel`;
  // Roving tablist: Left/Right (and Home/End) move between the two tabs and
  // activate, per the ARIA tabs pattern.
  const onTabKey = (e: React.KeyboardEvent) => {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      setView(e.key === "ArrowRight" || e.key === "End" ? "code" : "preview");
    }
  };
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)]">
      <Cluster
        justify="between"
        align="center"
        className="border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5"
      >
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
          <MonitorPlay className="size-3.5 text-[var(--primary)]" aria-hidden />
          Prototype
        </span>
        <div className="flex items-center gap-1" role="tablist" aria-label="Prototype view">
          <ViewToggle
            id={previewTab}
            controls={panelId}
            active={view === "preview"}
            onClick={() => setView("preview")}
            onKeyDown={onTabKey}
          >
            Preview
          </ViewToggle>
          <ViewToggle
            id={codeTab}
            controls={panelId}
            active={view === "code"}
            onClick={() => setView("code")}
            onKeyDown={onTabKey}
          >
            <Code2 className="size-3" aria-hidden />
            Code
          </ViewToggle>
        </div>
      </Cluster>
      <div id={panelId} role="tabpanel" aria-labelledby={view === "preview" ? previewTab : codeTab}>
        {view === "preview" ? (
          <iframe
            title="Design prototype preview"
            srcDoc={code}
            sandbox="allow-scripts"
            loading="lazy"
            className="h-[460px] w-full border-0 bg-[var(--surface)]"
          />
        ) : (
          <pre className="max-h-[460px] overflow-auto bg-[var(--surface)] p-3 text-xs leading-relaxed text-[var(--text)]">
            <code className="font-mono">{code}</code>
          </pre>
        )}
      </div>
    </div>
  );
}

function ViewToggle({
  active,
  onClick,
  onKeyDown,
  id,
  controls,
  children,
}: {
  active: boolean;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  id: string;
  controls: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls={controls}
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        active
          ? "bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-1)]"
          : "text-[var(--text-muted)] hover:text-[var(--text)]",
      )}
    >
      {children}
    </button>
  );
}

/** A fenced code block (diff / json / ts / …) rendered as readable monospace
 *  rather than flattened into prose. */
function CodeBlock({ lang, code }: { lang: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)]">
      {lang && (
        <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          {lang}
        </div>
      )}
      <pre className="max-h-[460px] overflow-auto bg-[var(--surface)] p-3 text-xs leading-relaxed text-[var(--text)]">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}

/** Light markdown for a prose run — headings, bullet/numbered lists, and
 *  paragraphs, with inline bold / code / citations. The project keeps no
 *  markdown AST off the bundle, so this is a deliberately small renderer. */
function Prose({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).filter((b) => b.trim().length > 0);
  return (
    <Stack gap="2.5">
      {blocks.map((block, i) => (
        <ProseBlock key={i} block={block} />
      ))}
    </Stack>
  );
}

function ProseBlock({ block }: { block: string }) {
  const lines = block.split("\n");
  const heading = /^(#{1,4})\s+(.*)$/.exec(lines[0] ?? "");
  if (heading && lines.length === 1) {
    const level = heading[1]?.length ?? 3;
    // Real heading elements (h2–h5) so screen readers get a document outline of
    // the artifact body — the card's own title is the h-context above.
    const Tag = (["h2", "h3", "h4", "h5"][Math.min(Math.max(level, 1), 4) - 1] ??
      "h4") as "h2" | "h3" | "h4" | "h5";
    return (
      <Tag
        className={cn(
          "text-[var(--text)]",
          level <= 1 ? "text-base font-bold" : level === 2 ? "text-sm font-bold" : "text-sm font-semibold",
        )}
      >
        <InlineMarkdown text={heading[2] ?? ""} />
      </Tag>
    );
  }
  if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
    return (
      <ul className="ml-4 list-disc space-y-1 text-sm leading-relaxed text-[var(--text)]">
        {lines.map((l, i) => (
          <li key={i}>
            <InlineMarkdown text={l.replace(/^\s*[-*]\s+/, "")} />
          </li>
        ))}
      </ul>
    );
  }
  if (lines.every((l) => /^\s*\d+\.\s+/.test(l))) {
    return (
      <ol className="ml-4 list-decimal space-y-1 text-sm leading-relaxed text-[var(--text)]">
        {lines.map((l, i) => (
          <li key={i}>
            <InlineMarkdown text={l.replace(/^\s*\d+\.\s+/, "")} />
          </li>
        ))}
      </ol>
    );
  }
  return (
    <p className="text-sm leading-relaxed text-[var(--text)]">
      <InlineMarkdown text={block} />
    </p>
  );
}

/** Inline **bold** / `code` with everything else delegated to CitationRenderer
 *  (which resolves kn:// / repo:// references into citation chips). */
function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (/^\*\*[^*]+\*\*$/.test(part)) {
          return (
            <strong key={i} className="font-semibold text-[var(--text)]">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (/^`[^`]+`$/.test(part)) {
          return (
            <code
              key={i}
              className="rounded bg-[var(--surface-2)] px-1 py-0.5 font-mono text-[0.85em] text-[var(--text)]"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return <CitationRenderer key={i} text={part} />;
      })}
    </>
  );
}

/** "Generated from" — lazily fetches the artifact's provenance Refs on first
 *  open. Refs only (kind + label); bodies open in their natural home. */
function ProvenanceExpander({
  taskId,
  artifactId,
  refreshKey,
}: {
  taskId: string;
  artifactId: string;
  refreshKey?: number | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [refs, setRefs] = useState<Ref[] | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchRefs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.tasks.provenance(taskId, artifactId);
      setRefs(result);
    } catch {
      setRefs([]);
    } finally {
      setLoading(false);
    }
  }, [taskId, artifactId]);

  // Drop the cached refs when the artifact is re-minted so the next open
  // re-fetches the fresh provenance.
  useEffect(() => {
    setRefs(null);
    setOpen(false);
  }, [refreshKey]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next && refs === null && !loading) void fetchRefs();
  };

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)]">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        {open ? (
          <ChevronDown className="size-3.5" aria-hidden />
        ) : (
          <ChevronRight className="size-3.5" aria-hidden />
        )}
        <Sparkles className="size-3.5 text-[var(--primary)]" aria-hidden />
        Generated from
        {refs !== null && <span className="text-[var(--text-subtle)]">· {refs.length}</span>}
      </button>
      {open && (
        <div className="border-t border-[var(--border)] px-3 py-2.5">
          {loading ? (
            <div className="flex flex-col gap-1.5" aria-hidden>
              {[0, 1].map((i) => (
                <div key={i} className="h-4 w-2/3 animate-pulse rounded bg-[var(--surface-3)]" />
              ))}
            </div>
          ) : refs && refs.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {refs.map((r, i) => (
                <span
                  key={`${i}-${r.id}`}
                  className="inline-flex max-w-[260px] items-center gap-1 rounded-full bg-[var(--surface-3)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]"
                  title={`${r.kind}: ${r.label || r.id}`}
                >
                  <span className="uppercase tracking-wider opacity-70">{r.kind}</span>
                  <span className="truncate text-[var(--text)]">{r.label || r.id}</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">
              No recorded sources — this was authored directly.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Read-only version history — the human audit trail. Makes the "AI uses only
 *  the working version" invariant explicit. */
function VersionHistory({
  versions,
  open,
  onToggle,
}: {
  versions: ArtifactVersion[];
  open: boolean;
  onToggle: () => void;
}) {
  if (versions.length === 0) return null;
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        {open ? (
          <ChevronDown className="size-3.5" aria-hidden />
        ) : (
          <ChevronRight className="size-3.5" aria-hidden />
        )}
        <History className="size-3.5" aria-hidden />
        Version history
        <span className="text-[var(--text-subtle)]">· {versions.length}</span>
      </button>
      {open && (
        <div className="border-t border-[var(--border)] px-3 py-2.5">
          <Stack gap="1.5" as="ul">
            {[...versions]
              .sort((a, b) => b.version - a.version)
              .map((v, i) => (
                <li
                  key={v.version}
                  className="flex items-center gap-2 text-xs text-[var(--text-muted)]"
                >
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium",
                      i === 0
                        ? "bg-[var(--success-soft)] text-[var(--success-ink)]"
                        : "bg-[var(--surface-3)] text-[var(--text-subtle)]",
                    )}
                  >
                    {i === 0 && <CheckCircle2 className="size-3" aria-hidden />}v{v.version}
                  </span>
                  <span className="text-[var(--text)]">
                    {v.who_kind === "agent" ? "Athena" : v.who_kind}
                  </span>
                  <span>·</span>
                  <span>{formatRelativeTime(v.created_at)}</span>
                  {i === 0 && (
                    <span className="ml-auto text-[10px] uppercase tracking-wider text-[var(--success-ink)]">
                      working — what Athena uses
                    </span>
                  )}
                </li>
              ))}
          </Stack>
        </div>
      )}
    </div>
  );
}
