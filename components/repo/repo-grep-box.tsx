"use client";

/**
 * RepoGrepBox — §6.5.6 FE-mirror for `grep_repo`. Collapsed-by-default
 * regex pill on the file-browser toolbar; expanding reveals a Python-
 * flavor regex input. Submits on Enter. Cancels in-flight requests via
 * AbortController on pattern change or unmount.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Regex, X } from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { api, ApiError, type RepoGrepEnvelope, type RepoGrepResult } from "@/lib/api/client";
import { cn } from "@/lib/cn";

interface RepoGrepBoxProps {
  repoId: string;
  /** Caller receives the picked match; typically opens
   *  `<FileDetailDrawer>` deep-linked to `match.path`/`match.line`. */
  onPick?: (match: RepoGrepResult) => void;
}

export function RepoGrepBox({ repoId, onPick }: RepoGrepBoxProps) {
  const [expanded, setExpanded] = useState(false);
  const [pattern, setPattern] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [envelope, setEnvelope] = useState<RepoGrepEnvelope | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  const cancelInFlight = useCallback(() => {
    if (ctrlRef.current) { ctrlRef.current.abort(); ctrlRef.current = null; }
  }, []);

  useEffect(() => {
    if (!submitted) return;
    cancelInFlight();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setLoading(true); setError(null);
    api.repos.grep(repoId, { pattern: submitted, max_results: 50 }, { signal: ctrl.signal })
      .then((e) => { if (!ctrl.signal.aborted) setEnvelope(e); })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof ApiError || e instanceof Error ? e.message : "Grep failed");
        setEnvelope(null);
      })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [repoId, submitted, cancelInFlight]);

  useEffect(() => () => cancelInFlight(), [cancelInFlight]);

  if (!expanded) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setExpanded(true)} data-testid="repo-grep-box-toggle">
        <Regex className="size-3.5" aria-hidden /> Regex search
      </Button>
    );
  }

  const onCollapse = () => {
    cancelInFlight();
    setExpanded(false); setPattern(""); setSubmitted("");
    setEnvelope(null); setError(null);
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const t = pattern.trim();
    if (!t) return;
    cancelInFlight();
    setSubmitted(t);
  };

  return (
    <Card className="!p-3" data-testid="repo-grep-box">
      <Stack gap="2">
        <form onSubmit={onSubmit}>
          <Cluster gap="2" align="center">
            <Regex className="size-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
            <input type="text" value={pattern}
              onChange={(e) => { setPattern(e.target.value); cancelInFlight(); }}
              placeholder="^def \w+_handler" aria-label="Regex (Python flavor)" autoFocus spellCheck={false}
              data-testid="repo-grep-box-input"
              className={cn(
                "min-h-11 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 font-mono text-xs text-[var(--text)]",
                "placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
              )} />
            <Button type="submit" size="sm" loading={loading} disabled={!pattern.trim()} data-testid="repo-grep-box-submit">
              Search
            </Button>
            <button type="button" onClick={onCollapse} aria-label="Close regex search" data-testid="repo-grep-box-close"
              className={cn(
                "min-h-11 min-w-11 rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
              )}>
              <X className="size-4" aria-hidden />
            </button>
          </Cluster>
          <p className="mt-1 text-[10px] text-[var(--text-subtle)]">Regex (Python flavor) — press Enter to search.</p>
        </form>
        <ResultsBody envelope={envelope} loading={loading} error={error} submitted={submitted}
          {...(onPick ? { onPick } : {})} />
      </Stack>
    </Card>
  );
}

function ResultsBody({ envelope, loading, error, submitted, onPick }: {
  envelope: RepoGrepEnvelope | null; loading: boolean; error: string | null; submitted: string;
  onPick?: (match: RepoGrepResult) => void;
}) {
  if (error) return <p className="text-xs text-[var(--danger)]" role="alert" data-testid="repo-grep-box-error">{error}</p>;
  if (loading && !envelope) {
    return (
      <Stack gap="1" aria-busy="true" data-testid="repo-grep-box-skeleton">
        {[...Array(3)].map((_, i) => <div key={i} className="motion-safe:animate-pulse h-8 w-full rounded bg-[var(--surface-2)]" />)}
      </Stack>
    );
  }
  if (!envelope) return null;
  return (
    <>
      {envelope.coverage_warning && (
        <p role="status" data-testid="repo-grep-box-coverage-warning"
          className="rounded-md border border-[var(--warning)]/50 bg-[var(--warning)]/10 px-2 py-1 text-[11px] text-[var(--text)]">
          Partial scan — {envelope.coverage_warning}
        </p>
      )}
      {envelope.items.length === 0 ? (
        <EmptyState icon={<Regex className="size-5" aria-hidden />} title="No matches"
          description={`No file matched /${submitted}/ in this repo.`} />
      ) : (
        <Stack gap="0.5" as="ul" data-testid="repo-grep-box-results">
          {envelope.items.map((m, i) => (
            <GrepRow key={`${m.path}:${m.line}:${i}`} match={m} {...(onPick ? { onPick } : {})} />
          ))}
          {envelope.truncated && (
            <li className="px-2 py-1 text-[10px] italic text-[var(--text-muted)]">
              Truncated at {envelope.items.length} matches — refine the regex to narrow.
            </li>
          )}
        </Stack>
      )}
    </>
  );
}

function GrepRow({ match, onPick }: { match: RepoGrepResult; onPick?: (match: RepoGrepResult) => void }) {
  return (
    <li>
      <button type="button" onClick={() => onPick?.(match)} data-testid="repo-grep-box-row"
        title={`${match.context_before}\n${match.match}\n${match.context_after}`}
        className={cn(
          "group flex w-full min-h-11 flex-col items-start gap-0.5 rounded-md px-2 py-1 text-left",
          "hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
        )}>
        <code className="block w-full truncate font-mono text-[11px] text-[var(--text-muted)]">
          {match.path}<span className="text-[var(--text-subtle)]">:{match.line}</span>
          <span className="ml-2 text-[var(--text)]">— {match.match}</span>
        </code>
        {(match.context_before || match.context_after) && (
          <code className="hidden w-full truncate font-mono text-[10px] text-[var(--text-subtle)] group-hover:block">
            {match.context_before && <span className="opacity-60">{match.context_before}</span>}
            {match.context_after && <span className="ml-2 opacity-60">{match.context_after}</span>}
          </code>
        )}
      </button>
    </li>
  );
}
