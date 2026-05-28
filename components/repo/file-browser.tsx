"use client";

/**
 * FileBrowser — per-repo file browser surface on the Files tab.
 *
 * Renders every file row produced by the Slice-4 understanding pipeline
 * (one `knowledge_nodes` row per file). The KG's foundational substrate
 * was previously invisible to users; this surface exposes it.
 *
 * Toolbar lives in `<FileBrowserToolbar>`. Body is a virtualisation-free
 * row list (rows are cheap to mount — `min-h-11` rows over the page-size
 * window), with infinite scroll driven by an IntersectionObserver
 * sentinel below the last row. Click a row → slide-over drawer.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, type RepoFileRow, type RepoFilesListQuery, type RepoFilesOut } from "@/lib/api/client";
import { FileBrowserToolbar } from "@/components/repo/file-browser-toolbar";
import { FileDetailDrawer } from "@/components/repo/file-detail-drawer";
import { RepoGrepBox } from "@/components/repo/repo-grep-box";

const DEBOUNCE_MS = 250;
const PAGE_SIZE = 50;

interface FileBrowserProps {
  repoId: string;
}

export function FileBrowser({ repoId }: FileBrowserProps) {
  const [search, setSearch] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [language, setLanguage] = useState<string | null>(null);
  const [layer, setLayer] = useState<string | null>(null);
  const [rows, setRows] = useState<RepoFileRow[]>([]);
  const [totals, setTotals] = useState<RepoFilesOut["totals"] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [openFileId, setOpenFileId] = useState<string | null>(null);

  const anyFilter = Boolean(debouncedQ || language || layer);

  // Debounce the search input — re-fetch only when typing settles.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(search.trim()), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);

  const queryFor = useCallback((cursor?: string) => {
    const q: RepoFilesListQuery = { limit: PAGE_SIZE };
    if (debouncedQ) q.q = debouncedQ;
    if (language) q.language = language;
    if (layer) q.layer = layer;
    if (cursor) q.cursor = cursor;
    return q;
  }, [debouncedQ, language, layer]);

  // Fetch page 1 when filters change.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.repos.files.list(repoId, queryFor())
      .then((res) => {
        if (cancelled) return;
        setRows(res.items);
        setTotals(res.totals);
        setNextCursor(res.next_cursor);
        setHasMore(res.has_more);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [repoId, queryFor]);

  const fetchMore = useCallback(() => {
    if (!hasMore || fetchingMore || !nextCursor) return;
    setFetchingMore(true);
    api.repos.files.list(repoId, queryFor(nextCursor))
      .then((res) => {
        setRows((prev) => [...prev, ...res.items]);
        setNextCursor(res.next_cursor);
        setHasMore(res.has_more);
      })
      .finally(() => setFetchingMore(false));
  }, [repoId, nextCursor, hasMore, fetchingMore, queryFor]);

  // Bottom-in-view sentinel for infinite scroll.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && fetchMore(),
      { rootMargin: "240px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [fetchMore]);

  const onClearFilters = useCallback(() => {
    setSearch(""); setDebouncedQ(""); setLanguage(null); setLayer(null);
  }, []);

  const languages = useMemo(
    () => Object.entries(totals?.by_language ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 10),
    [totals],
  );
  const layers = useMemo(
    () => Object.entries(totals?.by_layer ?? {}).sort((a, b) => b[1] - a[1]),
    [totals],
  );

  return (
    <Stack gap="3">
      <Cluster gap="2" align="start" justify="between" className="flex-wrap">
        <div className="min-w-0 flex-1">
          <FileBrowserToolbar
            search={search}
            onSearch={setSearch}
            language={language}
            languages={languages}
            onLanguage={setLanguage}
            layer={layer}
            layers={layers}
            onLayer={setLayer}
            anyFilter={anyFilter}
            onClearFilters={onClearFilters}
            filteredCount={totals?.filtered ?? 0}
            totalCount={totals?.files ?? 0}
          />
        </div>
        <RepoGrepBox repoId={repoId} onPick={(m) => {
          // Open the file drawer by path-based lookup against the current rows.
          // Fallback to setting the search field to the path so the file row
          // floats to the top of the visible list.
          const hit = rows.find((r) => r.path === m.path);
          if (hit) setOpenFileId(hit.id);
          else setSearch(m.path);
        }} />
      </Cluster>
      {loading ? (
        <FileListSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-6" aria-hidden />}
          title="No files match these filters"
          description={
            anyFilter
              ? "Try removing a filter or searching for a different term."
              : "This repo hasn't been ingested yet — run a sync to populate the file index."
          }
          action={anyFilter ? <Button variant="secondary" onClick={onClearFilters}>Clear filters</Button> : undefined}
        />
      ) : (
        <FileTable rows={rows} onRowClick={setOpenFileId} />
      )}
      {/* Infinite-scroll sentinel — sits below the last row. */}
      {hasMore && !loading && <div ref={sentinelRef} className="h-8" aria-hidden data-testid="file-browser-sentinel" />}
      {fetchingMore && (
        <p className="text-xs text-[var(--text-muted)]" role="status">Loading more files…</p>
      )}
      {openFileId && (
        <FileDetailDrawer
          repoId={repoId}
          fileId={openFileId}
          onClose={() => setOpenFileId(null)}
          onImportClick={(name) => { setSearch(name); setOpenFileId(null); }}
          onNavigateFile={(nextFileId) => setOpenFileId(nextFileId)}
        />
      )}
    </Stack>
  );
}

function FileTable({ rows, onRowClick }: { rows: RepoFileRow[]; onRowClick: (id: string) => void }) {
  return (
    <Card className="!p-0" data-testid="file-browser-table">
      <div role="table" aria-label="Files" className="flex flex-col divide-y divide-[var(--border)]">
        <div role="row" className="grid grid-cols-[3fr_1.4fr_0.7fr_0.7fr_0.6fr_0.6fr_0.6fr_3fr] gap-3 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
          <span role="columnheader">Path</span>
          <span role="columnheader">Name</span>
          <span role="columnheader">Lang</span>
          <span role="columnheader">Layer</span>
          <span role="columnheader" className="text-right">LOC</span>
          <span role="columnheader" className="text-right">Sym</span>
          <span role="columnheader" className="text-right">Imp</span>
          <span role="columnheader">Summary</span>
        </div>
        <ul className="flex flex-col divide-y divide-[var(--border)]">
          {rows.map((r) => <FileRow key={r.id} row={r} onClick={() => onRowClick(r.id)} />)}
        </ul>
      </div>
    </Card>
  );
}

function FileRow({ row, onClick }: { row: RepoFileRow; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="grid w-full min-h-11 grid-cols-[3fr_1.4fr_0.7fr_0.7fr_0.6fr_0.6fr_0.6fr_3fr] items-center gap-3 px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)]"
        data-testid="file-browser-row"
      >
        <code className="truncate font-mono text-[11px] text-[var(--text-muted)]" title={row.path}>{row.path}</code>
        <span className="truncate font-semibold text-[var(--text)]" title={row.name}>{row.name}</span>
        <span className="truncate text-[var(--text-muted)]">{row.language ?? "—"}</span>
        <span className="truncate text-[var(--text-muted)]">{row.layer ?? "—"}</span>
        <span className="text-right tabular-nums text-[var(--text-muted)]">{row.loc.toLocaleString()}</span>
        <span className="text-right tabular-nums text-[var(--text-muted)]">{row.symbols_count}</span>
        <span className="text-right tabular-nums text-[var(--text-muted)]">{row.imports_count}</span>
        <span className="flex items-center gap-1.5">
          {row.todos_count > 0 && (
            <span
              className="size-1.5 shrink-0 rounded-full bg-[var(--danger)]"
              aria-label={`${row.todos_count} TODOs`}
              title={`${row.todos_count} TODOs`}
            />
          )}
          <span className="truncate text-[var(--text-muted)]" title={row.summary_preview}>
            {row.summary_preview || <span className="italic">no summary</span>}
          </span>
        </span>
      </button>
    </li>
  );
}

function FileListSkeleton() {
  return (
    <Card className="!p-3" aria-busy="true" aria-label="Loading files" data-testid="file-browser-skeleton">
      <Stack gap="2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-8 animate-pulse rounded bg-[var(--surface-2)]" />
        ))}
      </Stack>
    </Card>
  );
}
