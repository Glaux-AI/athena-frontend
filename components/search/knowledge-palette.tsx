"use client";

/**
 * KnowledgePalette — global Cmd-K knowledge search.
 *
 * Wraps the new `GET /v1/knowledge/search` endpoint (BE:
 * `athena/api/routers/knowledge_search.py`) so hybrid retrieval —
 * previously only LLM-facing through the chat agent — is reachable
 * from any screen via Cmd-K (Mac) / Ctrl-K (Windows/Linux).
 *
 * Recent queries: `localStorage` key `athena.knowledge.recent` (last 5).
 * Per CLAUDE.md §3, recent SEARCH TERMS are user-owned text — not
 * customer data — so writing them to localStorage is allowed.
 */

import {
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { cn } from "@/lib/cn";
import { useKnowledgeSearch } from "@/features/search/use-knowledge-search";
import type {
  KnowledgeSearchParams, SearchItem, SearchKind, SearchMode, SearchScope,
} from "@/lib/api/client";
import {
  EmptyState, FilterCluster, MODES, PaletteHeader, SkeletonRows,
} from "./knowledge-palette-parts";
import { Results } from "./knowledge-palette-results";

const RECENT_KEY = "athena.knowledge.recent";
const RECENT_MAX = 5;

interface KnowledgePaletteProps {
  /** Override the open state — useful for testing. When omitted, the
   *  palette listens to the global Cmd-K shortcut. */
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
}

export function KnowledgePalette({
  open: controlledOpen,
  onOpenChange,
}: KnowledgePaletteProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = useCallback((next: boolean) => {
    if (onOpenChange) onOpenChange(next);
    else setInternalOpen(next);
  }, [onOpenChange]);

  const [q, setQ] = useState("");
  const [mode, setMode] = useState<SearchMode>("hybrid");
  const [kindFilter, setKindFilter] = useState<SearchKind[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-detect scope from the route. /capabilities/[id]/repos/[repoId]
  // → repo scope. /capabilities/[id] → capability scope. else org.
  const { scope, capabilityId, repoId } = useMemo(() => {
    if (!pathname) {
      return { scope: "org" as SearchScope, capabilityId: null, repoId: null };
    }
    const repoMatch = pathname.match(/\/capabilities\/([^/]+)\/repos\/([^/]+)/);
    if (repoMatch) {
      return { scope: "repo" as SearchScope, capabilityId: repoMatch[1]!, repoId: repoMatch[2]! };
    }
    const capMatch = pathname.match(/\/capabilities\/([^/]+)/);
    if (capMatch) {
      return { scope: "capability" as SearchScope, capabilityId: capMatch[1]!, repoId: null };
    }
    return { scope: "org" as SearchScope, capabilityId: null, repoId: null };
  }, [pathname]);

  const params: KnowledgeSearchParams | null = useMemo(() => {
    if (!open || q.trim().length < 2) return null;
    const out: KnowledgeSearchParams = { q, scope, mode, limit: 20 };
    const capIdForScope = scope !== "org" ? capabilityId : null;
    if (capIdForScope) out.capability_id = capIdForScope;
    if (scope === "repo" && repoId) out.repo_id = repoId;
    if (kindFilter.length > 0) out.kind = kindFilter;
    return out;
  }, [open, q, mode, kindFilter, scope, capabilityId, repoId]);

  const { data, loading } = useKnowledgeSearch(params);

  // Global Cmd-K listener.
  useEffect(() => {
    if (controlledOpen !== undefined) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        setInternalOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [controlledOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(RECENT_KEY);
      if (raw) setRecent(JSON.parse(raw) as string[]);
    } catch { /* ignore corrupted */ }
  }, []);

  useEffect(() => { setSelected(0); }, [data?.items?.length]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const persistRecent = useCallback((term: string) => {
    if (typeof window === "undefined") return;
    const cleaned = term.trim();
    if (cleaned.length < 2) return;
    const next = [cleaned, ...recent.filter((r) => r !== cleaned)].slice(0, RECENT_MAX);
    setRecent(next);
    try {
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch { /* quota / private mode — ignore */ }
  }, [recent]);

  const navigate = useCallback((item: SearchItem, newTab: boolean) => {
    let href = "";
    if (item.kind === "overlay" && item.capability_id) {
      href = `/capabilities/${item.capability_id}?tab=notes&focus=${item.id}`;
    } else if (item.repo_id && capabilityId) {
      // Sibling agent's file-browser route accepts `focus` if implemented;
      // ignored otherwise (FE-truth lands the user on the Files tab).
      href = `/capabilities/${capabilityId}/repos/${item.repo_id}?tab=files&focus=${item.id}`;
    } else if (item.repo_id) {
      href = `/knowledge/graph?repo_id=${item.repo_id}&focus=${item.id}`;
    } else {
      href = `/knowledge/graph?focus=${item.id}`;
    }
    persistRecent(q);
    setOpen(false);
    if (newTab && typeof window !== "undefined") {
      window.open(href, "_blank", "noopener,noreferrer");
    } else {
      router.push(href);
    }
  }, [router, q, capabilityId, persistRecent, setOpen]);

  const items = useMemo(() => data?.items ?? [], [data]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(items.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[selected];
      if (item) navigate(item, e.metaKey || e.ctrlKey);
    } else if (e.key === "Tab") {
      e.preventDefault();
      const idx = MODES.indexOf(mode);
      setMode(MODES[(idx + 1) % MODES.length]!);
    }
  }, [items, selected, mode, navigate]);

  if (!open) return null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-40 bg-[var(--overlay)] backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
        />
        <DialogPrimitive.Content
          aria-label="Search knowledge"
          className={cn(
            "fixed left-1/2 top-[10vh] z-50 -translate-x-1/2",
            "w-[min(720px,calc(100%-2rem))] max-h-[600px] overflow-hidden",
            "glass rounded-xl shadow-[var(--shadow-3)]",
            "motion-safe:animate-in motion-safe:slide-in-from-top-4 motion-safe:duration-200",
          )}
          onKeyDown={onKeyDown}
        >
          <DialogPrimitive.Title className="sr-only">Search knowledge graph</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search across files, functions, classes, configs, documents, services,
            and domain notes in the knowledge graph for the current scope.
          </DialogPrimitive.Description>

          <PaletteHeader
            q={q} setQ={setQ}
            mode={mode} setMode={setMode}
            scope={scope}
            filtersOpen={filtersOpen} setFiltersOpen={setFiltersOpen}
            inputRef={inputRef}
            onClose={() => setOpen(false)}
          />

          {filtersOpen && (
            <FilterCluster kindFilter={kindFilter} setKindFilter={setKindFilter} />
          )}

          <div role="listbox" aria-label="Search results" className="max-h-[440px] overflow-y-auto">
            {loading && items.length === 0 ? <SkeletonRows /> :
              q.trim().length < 2 ? (
                <EmptyState recent={recent} onPick={(r) => setQ(r)} />
              ) : items.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">
                  No results for &ldquo;{q}&rdquo;. Try a shorter or different term.
                </div>
              ) : (
                <Results items={items} selected={selected} onPick={navigate} setSelected={setSelected} />
              )
            }
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
