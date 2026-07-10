"use client";

/**
 * FileBrowser - per-repo file browser surface on the Files tab.
 *
 * Renders every file produced by the Slice-4 understanding pipeline (one
 * `knowledge_nodes` row per file) as a collapsible **directory tree** that maps
 * to the original repo layout (see `<FileTree>`) - replacing the former dense
 * flat table. The full row set is fetched up-front (the KG has no folder nodes,
 * so the tree is derived client-side from file paths); filters narrow it
 * server-side. Click a file → slide-over drawer.
 *
 * Toolbar lives in `<FileBrowserToolbar>`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, type RepoFileRow, type RepoFilesListQuery, type RepoFilesOut } from "@/lib/api/client";
import { FileBrowserToolbar } from "@/components/repo/file-browser-toolbar";
import { FileDetailDrawer } from "@/components/repo/file-detail-drawer";
import { FileTree, buildFileTree, buildFolderNodeMap } from "@/components/repo/file-tree";
import { RepoGrepBox } from "@/components/repo/repo-grep-box";
import { useNodeDossier } from "@/components/knowledge/node-dossier-context";
import { useUrlParam } from "@/hooks/use-url-state";

const DEBOUNCE_MS = 250;
// The tree needs the whole set, so we page through at the API's max page size.
// `MAX_FILES` / `MAX_PAGES` bound the worst case for an enormous repo; if hit,
// a notice tells the user the tree is partial (no silent truncation).
const PAGE_SIZE = 200;
const MAX_FILES = 5000;
const MAX_PAGES = 64;

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  // The opened file's drawer is backed by `?focus=<file_id>` so opening a file
  // (by click, grep hit, or a Cmd-K / imports-graph deep-link) is a real
  // history entry: Back closes the drawer instead of leaving the repo page.
  const [openFileId, setOpenFileId] = useUrlParam("focus");
  const [folderNodeIds, setFolderNodeIds] = useState<Map<string, string>>(() => new Map());

  // Folder dossiers reuse the shared, app-wide node-dossier drawer: a directory
  // is itself a `module`/`service` KG node, so clicking it opens the same panel
  // a file does. `activeNodeId` drives the selected-folder highlight in the tree.
  const { open: openFolderDossier, activeNodeId } = useNodeDossier();

  const anyFilter = Boolean(debouncedQ || language || layer);

  // Debounce the search input - re-fetch only when typing settles.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(search.trim()), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);

  const queryFor = useCallback(
    (cursor?: string) => {
      const q: RepoFilesListQuery = { limit: PAGE_SIZE };
      if (debouncedQ) q.q = debouncedQ;
      if (language) q.language = language;
      if (layer) q.layer = layer;
      if (cursor) q.cursor = cursor;
      return q;
    },
    [debouncedQ, language, layer],
  );

  // Fetch the whole (filtered) set - page through cursors until exhausted -
  // then `<FileTree>` builds the folder hierarchy from it. Re-runs on filters.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTruncated(false);
    (async () => {
      const acc: RepoFileRow[] = [];
      let cursor: string | undefined;
      let firstTotals: RepoFilesOut["totals"] | null = null;
      try {
        for (let page = 0; page < MAX_PAGES; page++) {
          const res = await api.repos.files.list(repoId, queryFor(cursor));
          if (cancelled) return;
          if (!firstTotals) firstTotals = res.totals;
          acc.push(...res.items);
          if (acc.length >= MAX_FILES) {
            setTruncated(true);
            break;
          }
          if (!res.has_more || !res.next_cursor) break;
          cursor = res.next_cursor;
        }
        if (cancelled) return;
        setRows(acc);
        setTotals(firstTotals);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load files");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repoId, queryFor]);

  // Map each directory to its KG node id so a folder click can open its
  // dossier. The `rollup` view returns the repo's full module/service set
  // (ordered by path, not centrality-sampled), so even deep folders resolve.
  // Independent of the file list + filters; soft-fails to an empty map (folders
  // then just expand, the prior behaviour).
  useEffect(() => {
    let cancelled = false;
    api.knowledge
      .graph({ repo_id: repoId, rollup: true })
      .then((g) => { if (!cancelled) setFolderNodeIds(buildFolderNodeMap(g.nodes)); })
      .catch(() => { if (!cancelled) setFolderNodeIds(new Map()); });
    return () => { cancelled = true; };
  }, [repoId]);

  const onClearFilters = useCallback(() => {
    setSearch("");
    setDebouncedQ("");
    setLanguage(null);
    setLayer(null);
  }, []);

  const tree = useMemo(() => buildFileTree(rows), [rows]);

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
        <RepoGrepBox
          repoId={repoId}
          onPick={(m) => {
            // Open the file drawer by path-based lookup against the loaded rows.
            // Fallback to setting the search field to the path so the file
            // floats into view in the tree.
            const hit = rows.find((r) => r.path === m.path);
            if (hit) setOpenFileId(hit.id);
            else setSearch(m.path);
          }}
        />
      </Cluster>

      {loading ? (
        <FileTreeSkeleton />
      ) : error ? (
        <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger-ink)]" role="alert">
            {error}
          </p>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-6" aria-hidden />}
          title="No files match these filters"
          description={
            anyFilter
              ? "Try removing a filter or searching for a different term."
              : "This repo hasn't been ingested yet - run a sync to populate the file index."
          }
          action={anyFilter ? <Button variant="secondary" onClick={onClearFilters}>Clear filters</Button> : undefined}
        />
      ) : (
        <Card className="overflow-hidden !p-0" data-testid="file-browser-tree">
          <FileTree
            tree={tree}
            filtering={anyFilter}
            selectedFileId={openFileId}
            focusFileId={openFileId}
            onFileClick={(row) => setOpenFileId(row.id)}
            folderNodeIds={folderNodeIds}
            selectedFolderNodeId={activeNodeId}
            onFolderOpen={openFolderDossier}
          />
        </Card>
      )}

      {truncated && !loading && (
        <p className="text-xs text-[var(--text-muted)]" role="status">
          Showing the first {MAX_FILES.toLocaleString()} files. Filter by folder, language, or layer to narrow the tree.
        </p>
      )}

      {openFileId && (
        <FileDetailDrawer
          repoId={repoId}
          fileId={openFileId}
          // Opening the drawer was a history push (so Back closes it); closing
          // and walking between files inside it `replace`, so the whole drawer
          // session is ONE history entry - a single Back returns to the list,
          // and closing never leaves a re-openable entry behind.
          onClose={() => setOpenFileId(null, { replace: true })}
          onImportClick={(name) => {
            setSearch(name);
            setOpenFileId(null, { replace: true });
          }}
          onNavigateFile={(nextFileId) => setOpenFileId(nextFileId, { replace: true })}
        />
      )}
    </Stack>
  );
}

function FileTreeSkeleton() {
  return (
    <Card className="!p-3" aria-busy="true" aria-label="Loading files" data-testid="file-browser-skeleton">
      <Stack gap="2">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div
            key={i}
            className="h-7 skeleton rounded"
            style={{ marginLeft: (i % 3) * 16, width: `${70 - (i % 4) * 8}%` }}
          />
        ))}
      </Stack>
    </Card>
  );
}
