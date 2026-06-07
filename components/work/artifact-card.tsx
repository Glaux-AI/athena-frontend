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

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  History,
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

  // Split the markdown body into paragraphs/lines so each can run through the
  // citation renderer (the project keeps no markdown AST off the bundle; the
  // renderer is text-first per its contract).
  const blocks = detail.body.split(/\n{2,}/).filter((b) => b.trim().length > 0);

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

        <Stack gap="2.5">
          {blocks.map((block, i) => (
            <p key={i} className="text-sm leading-relaxed text-[var(--text)]">
              <CitationRenderer text={block} />
            </p>
          ))}
        </Stack>

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
