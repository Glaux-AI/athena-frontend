"use client";

/**
 * ExplorerSearchBar - inline typeahead over the scope's knowledge. Picks drive
 * the SAME `select(id)` as the graph + tree, so searching for a module and
 * choosing it focuses the graph, reveals it in the tree, and renders its dossier
 * below - all from one selection. Reuses `useKnowledgeSearch` (scope-aware,
 * debounced) and merges in the scope's own synthetic nodes (repo/cap names) so
 * those are findable too. NOT a Cmd-K dialog - an inline combobox.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";

import { useKnowledgeSearch } from "@/features/search/use-knowledge-search";
import type { KnowledgeSearchParams, SearchItem, SearchScope } from "@/lib/api/client";
import { useExplorer } from "@/components/topology/explorer/explorer-store";
import type { GNode } from "@/components/topology/explorer/explorer-graph";

interface ExplorerSearchBarProps {
  scope: SearchScope;
  domainId?: string | undefined;
  repoId?: string | undefined;
}

interface Pick {
  id: string;
  name: string;
  kind: string;
  sub?: string | null;
  /** Off-graph hit: the stub to inject on select. Omitted for synthetic nodes
   *  already in the graph. */
  stub?: GNode;
}

function stubFromItem(it: SearchItem): GNode {
  return {
    id: it.id,
    node_kind: it.node_kind ?? "file",
    name: it.name,
    path: it.path,
    repo_id: it.repo_id,
    layer: it.layer,
    tags: it.tags,
  };
}

export function ExplorerSearchBar({ scope, domainId, repoId }: ExplorerSearchBarProps) {
  const { graph, select } = useExplorer();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);

  const params = useMemo<KnowledgeSearchParams | null>(() => {
    if (query.trim().length < 2) return null;
    const p: KnowledgeSearchParams = { q: query, scope, mode: "hybrid", limit: 12 };
    if (domainId) p.domain_id = domainId;
    if (repoId) p.repo_id = repoId;
    return p;
  }, [query, scope, domainId, repoId]);

  const { data, loading } = useKnowledgeSearch(params);

  // Synthetic scope nodes (repo / domain names) the live search can't
  // return - matched client-side so "repo"/"cap" names are findable.
  const syntheticMatches = useMemo<Pick[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return [...graph.nodes.values()]
      .filter((n) => n.synthetic && n.name.toLowerCase().includes(q))
      .slice(0, 4)
      .map((n) => ({ id: n.id, name: n.name, kind: n.node_kind, sub: "in this view" }));
  }, [graph.nodes, query]);

  const picks = useMemo<Pick[]>(() => {
    const seen = new Set<string>(syntheticMatches.map((p) => p.id));
    const items = (data?.items ?? [])
      .filter((it) => !seen.has(it.id))
      .map((it) => ({
        id: it.id,
        name: it.name,
        kind: it.node_kind ?? it.kind,
        sub: it.path ?? it.layer,
        stub: stubFromItem(it),
      }));
    return [...syntheticMatches, ...items].slice(0, 12);
  }, [syntheticMatches, data]);

  useEffect(() => setActive(0), [picks]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const choose = (p: Pick) => {
    select(p.id, p.stub ? { stub: p.stub } : {});
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); return; }
    if (!picks.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % picks.length); setOpen(true); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + picks.length) % picks.length); }
    else if (e.key === "Enter") { e.preventDefault(); const p = picks[active]; if (p) choose(p); }
  };

  const showList = open && query.trim().length >= 2;

  return (
    <div ref={rootRef} className="relative w-full">
      <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-[var(--shadow-1)] transition-[box-shadow,border-color] duration-150 ease-out focus-within:border-[var(--border-accent)] focus-within:ring-2 focus-within:ring-[var(--ring)]">
        <Search className="size-4 shrink-0 text-[var(--text-subtle)]" aria-hidden />
        <input
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search files, modules, services, entities…"
          data-testid="explorer-search-input"
          className="w-full bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none"
        />
        {loading && <Loader2 className="size-4 shrink-0 animate-spin text-[var(--text-subtle)]" aria-hidden />}
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          data-testid="explorer-search-results"
          className="glass absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-[var(--border)] py-1 shadow-[var(--shadow-3)]"
        >
          {picks.length === 0 && !loading && (
            <li className="px-3 py-2 text-xs text-[var(--text-subtle)]">No matches.</li>
          )}
          {picks.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(p)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition-colors duration-150 ease-out ${i === active ? "bg-[var(--surface-2)]" : "hover:bg-[var(--surface-2)]"}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-[var(--text)]">{p.name}</span>
                  {p.sub && <span className="block truncate font-mono text-[10px] text-[var(--text-subtle)]">{p.sub}</span>}
                </span>
                <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  {p.kind}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
