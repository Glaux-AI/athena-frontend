"use client";

/**
 * FileContentViewer - §6.5.6 FE-mirror for `read_repo_file`. Numbered
 * <pre> renderer with copy + "show full file" affordances. BE envelope
 * carries `coverage_warning` while summary-cache reads are in use
 * (drops when §6.5.5 MinIO full-body cache lands).
 */

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Maximize2 } from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { Button } from "@/components/ui/button";
import { api, type RepoFileContentResponse } from "@/lib/api/client";
import { cn } from "@/lib/cn";

const _MAX_INLINE_LOC = 50000;

interface FileContentViewerProps {
  repoId: string;
  fileId: string;
  /** Optional slice - passed to the BE so the agent's citation chip's
   *  line range is honored. Omit both for the full file. */
  lineStart?: number;
  lineEnd?: number;
}

export function FileContentViewer({
  repoId,
  fileId,
  lineStart,
  lineEnd,
}: FileContentViewerProps) {
  const [data, setData] = useState<RepoFileContentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchOnce = useCallback(
    (params: { line_start?: number; line_end?: number }) => {
      const ctrl = new AbortController();
      setLoading(true);
      setError(null);
      api.repos.files.content(repoId, fileId, params, { signal: ctrl.signal })
        .then((d) => setData(d))
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setError(e instanceof Error ? e.message : "Failed to load file content");
        })
        .finally(() => setLoading(false));
      return () => ctrl.abort();
    },
    [repoId, fileId],
  );

  useEffect(() => {
    const params: { line_start?: number; line_end?: number } = {};
    if (!showAll && lineStart !== undefined) params.line_start = lineStart;
    if (!showAll && lineEnd !== undefined) params.line_end = lineEnd;
    const cancel = fetchOnce(params);
    return cancel;
  }, [fetchOnce, lineStart, lineEnd, showAll]);

  const onCopy = useCallback(async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (jsdom, insecure context) - silent no-op.
    }
  }, [data]);

  const onRetry = useCallback(() => {
    fetchOnce({});
  }, [fetchOnce]);

  if (loading) return <ContentSkeleton />;
  if (error) {
    return (
      <Stack gap="2" data-testid="file-content-error">
        <p className="text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
        <Button variant="secondary" size="sm" onClick={onRetry} data-testid="file-content-retry">
          Retry
        </Button>
      </Stack>
    );
  }
  if (!data) return null;

  const isHugeFile = data.total_lines > _MAX_INLINE_LOC;
  const lines = data.content.split("\n");
  const startLineNo = !showAll && lineStart !== undefined ? lineStart : 1;

  return (
    <Stack gap="2" data-testid="file-content-viewer">
      {data.coverage_warning && (
        <p
          className="rounded-md border border-[var(--warning)] bg-[var(--warning-soft)] px-2.5 py-1.5 text-xs text-[var(--warning-ink)]"
          role="status"
          data-testid="file-content-coverage-warning"
        >
          Showing summary (first 4000 chars). Full content not yet cached for this branch.
        </p>
      )}
      <Cluster gap="2" align="center" justify="between">
        <span
          className="text-[11px] tabular-nums text-[var(--text-muted)]"
          data-testid="file-content-meta"
        >
          {data.language ?? "-"} · {data.total_lines.toLocaleString()} lines{" "}
          {data.indexed_branch_sha ? `· ${data.indexed_branch_sha.slice(0, 7)}` : ""}
        </span>
        <Cluster gap="1" align="center">
          {!showAll && lineStart !== undefined && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowAll(true)}
              data-testid="file-content-show-full"
            >
              <Maximize2 className="size-3.5" aria-hidden /> Show full file
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={onCopy}
            data-testid="file-content-copy"
            aria-label="Copy visible content"
          >
            {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </Cluster>
      </Cluster>
      {isHugeFile && !showAll && (
        <p
          className="text-[11px] italic text-[var(--text-muted)]"
          data-testid="file-content-huge-warning"
        >
          File exceeds {_MAX_INLINE_LOC.toLocaleString()} lines; showing the requested slice only.
        </p>
      )}
      <div
        className={cn(
          "max-h-[60vh] overflow-auto rounded-md border border-[var(--border)]",
          "bg-[var(--code-bg)] font-mono text-[11px] leading-relaxed",
        )}
      >
        <pre
          className="m-0 grid grid-cols-[auto_1fr] gap-x-3 px-2.5 py-2 text-[var(--text)]"
          data-testid="file-content-pre"
        >
          {lines.map((line, i) => (
            <span key={i} className="contents">
              <span
                className="select-none pr-2 text-right tabular-nums text-[var(--text-subtle)]"
                aria-hidden
              >
                {startLineNo + i}
              </span>
              <code className={cn("whitespace-pre-wrap", _classForLine(line, data.language))}>
                {line || " "}
              </code>
            </span>
          ))}
        </pre>
      </div>
    </Stack>
  );
}

/** Lightweight syntax hint per line - keeps the viewer ~1KB rather than
 *  dragging in Prism. Returns a class that just nudges color a touch. */
function _classForLine(line: string, lang: string | null): string {
  const t = line.trim();
  if (!t) return "";
  if (t.startsWith("//") || t.startsWith("#")) return "text-[var(--text-muted)] italic";
  if (lang === "Python" && (t.startsWith("def ") || t.startsWith("class ")))
    return "text-[var(--primary)] font-semibold";
  if ((lang === "TypeScript" || lang === "JavaScript") &&
      (t.startsWith("function ") || t.startsWith("export ") || t.startsWith("import ")))
    return "text-[var(--primary)] font-semibold";
  return "";
}

function ContentSkeleton() {
  return (
    <Stack gap="1.5" aria-busy="true" data-testid="file-content-skeleton">
      <div className="motion-safe:animate-pulse h-5 w-1/2 rounded bg-[var(--surface-2)]" />
      <div className="motion-safe:animate-pulse h-64 w-full rounded-md bg-[var(--surface-2)]" />
    </Stack>
  );
}
