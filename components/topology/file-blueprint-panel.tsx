"use client";

/**
 * FileBlueprintPanel — inline file blueprint, rendered in a full-width row
 * directly below the repo Topology graph when a file node is selected.
 *
 * Deliberately a *digest*, not the whole file detail: a file blueprint can be
 * large (full symbol list, raw content, dependents graph-walk), so the
 * exhaustive tabbed view stays in <FileDetailDrawer>, opened via "Open full
 * detail". Here we show the headline — path + signals + summary prose + a
 * capped symbols / imports preview — enough to understand the file without
 * leaving the graph. (Confirmed inline-summary + drawer split, not a wall of
 * detail crammed under the graph.)
 *
 * The headline renders instantly from the `seed` TopFile row (already in the
 * topology payload); the prose + symbol/import lists lazy-load the file detail
 * from `/v1/repos/{repo}/files/{id}` (same source the drawer uses).
 */

import { useEffect, useRef, useState } from "react";
import { DoorOpen, ExternalLink, X } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, type RepoFileDetail, type TopFile } from "@/lib/api/client";

const SYMBOL_PREVIEW = 24;
const IMPORT_PREVIEW = 10;

interface FileBlueprintPanelProps {
  repoId: string;
  fileId: string;
  /** The top_files row for this node, when the node is a ranked file — gives
   *  an instant headline before the detail fetch resolves. */
  seed?: TopFile | null;
  onClose: () => void;
  /** Open the full tabbed FileDetailDrawer for this file. */
  onOpenFull: (fileId: string) => void;
}

export function FileBlueprintPanel({ repoId, fileId, seed, onClose, onOpenFull }: FileBlueprintPanelProps) {
  const [detail, setDetail] = useState<RepoFileDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement | null>(null);

  // Scroll into view so the blueprint is visible without the user hunting for
  // it below the fold after clicking a node near the top of the graph.
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [fileId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setDetail(null);
    api.repos.files.get(repoId, fileId)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch(() => { if (!cancelled) setDetail(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [repoId, fileId]);

  const path = detail?.path ?? seed?.path ?? fileId;
  const summary = detail?.summary || seed?.summary || "";

  return (
    <div ref={ref}>
      <Card data-testid="file-blueprint-panel" className="border-l-2 border-l-[var(--primary)]">
        <Stack gap="3">
          <PanelHeader path={path} onClose={onClose} onOpenFull={() => onOpenFull(fileId)} />
          <MetaChips seed={seed} detail={detail} />
          {loading && !summary ? (
            <BodySkeleton />
          ) : (
            <Stack gap="3">
              {summary ? (
                <p className="max-w-prose whitespace-pre-wrap text-sm leading-relaxed text-[var(--text)]">{summary}</p>
              ) : (
                <p className="text-sm italic text-[var(--text-muted)]">No summary captured for this file.</p>
              )}
              {detail && <SymbolsPreview symbols={detail.symbols} onOpenFull={() => onOpenFull(fileId)} />}
              {detail && <ImportsPreview imports={detail.imports} />}
            </Stack>
          )}
        </Stack>
      </Card>
    </div>
  );
}

function PanelHeader({ path, onClose, onOpenFull }: { path: string; onClose: () => void; onOpenFull: () => void }) {
  return (
    <Cluster gap="3" align="center" justify="between">
      <Stack gap="0" className="min-w-0">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">File blueprint</span>
        <code className="truncate font-mono text-xs text-[var(--text)]" title={path}>{path}</code>
      </Stack>
      <Cluster gap="1" align="center">
        <button
          type="button"
          onClick={onOpenFull}
          data-testid="file-blueprint-open-full"
          className="inline-flex min-h-7 items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
        >
          <ExternalLink className="size-3.5" aria-hidden /> Open full detail
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Clear selection"
          data-testid="file-blueprint-close"
          className="rounded-md p-1 min-h-7 min-w-7 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
        >
          <X className="size-4" aria-hidden />
        </button>
      </Cluster>
    </Cluster>
  );
}

function MetaChips({ seed, detail }: { seed: TopFile | null | undefined; detail: RepoFileDetail | null }) {
  const language = seed?.language ?? detail?.language ?? null;
  const layer = seed?.layer ?? detail?.layer ?? null;
  const loc = seed?.loc ?? detail?.loc ?? null;
  const symbolCount = seed?.symbols ?? detail?.symbols.length ?? null;
  const chips: Array<[string, string | null]> = [
    ["lang", language],
    ["layer", layer],
    ["loc", loc != null ? loc.toLocaleString() : null],
    ["symbols", symbolCount != null ? symbolCount.toLocaleString() : null],
    ["importance", seed?.importance != null ? `${Math.round(seed.importance * 100)}` : null],
  ];
  return (
    <Cluster gap="1.5" align="center" className="flex-wrap">
      {seed?.is_entry_point && (
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--primary)]">
          <DoorOpen className="size-3" aria-hidden /> Entry point
        </span>
      )}
      {chips.map(([label, value]) => value != null ? (
        <span key={label} className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
          <span className="uppercase tracking-wider text-[var(--text-subtle)]">{label}</span>
          <span className="font-mono text-[var(--text)]">{value}</span>
        </span>
      ) : null)}
    </Cluster>
  );
}

function SymbolsPreview({ symbols, onOpenFull }: { symbols: string[]; onOpenFull: () => void }) {
  if (symbols.length === 0) return null;
  const shown = symbols.slice(0, SYMBOL_PREVIEW);
  const rest = symbols.length - shown.length;
  return (
    <Stack gap="1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Symbols ({symbols.length})</span>
      <Cluster gap="1.5" align="center" className="flex-wrap">
        {shown.map((s) => (
          <code key={s} data-testid="file-blueprint-symbol" className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 font-mono text-[11px] text-[var(--text)]">
            {s}
          </code>
        ))}
        {rest > 0 && (
          <button type="button" onClick={onOpenFull} className="rounded-full px-2 py-0.5 text-[11px] text-[var(--primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]">
            +{rest} more
          </button>
        )}
      </Cluster>
    </Stack>
  );
}

function ImportsPreview({ imports }: { imports: string[] }) {
  if (imports.length === 0) return null;
  const shown = imports.slice(0, IMPORT_PREVIEW);
  const rest = imports.length - shown.length;
  return (
    <Stack gap="1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Imports ({imports.length})</span>
      <Cluster gap="1.5" align="center" className="flex-wrap text-[11px] text-[var(--text-muted)]">
        {shown.map((imp) => (
          <code key={imp} className="font-mono">{imp}</code>
        ))}
        {rest > 0 && <span className="text-[var(--text-subtle)]">+{rest} more</span>}
      </Cluster>
    </Stack>
  );
}

function BodySkeleton() {
  return (
    <Stack gap="2" aria-busy="true">
      <div className="h-3 w-3/4 animate-pulse rounded bg-[var(--surface-2)]" />
      <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--surface-2)]" />
      <div className="h-6 w-full animate-pulse rounded bg-[var(--surface-2)]" />
    </Stack>
  );
}
