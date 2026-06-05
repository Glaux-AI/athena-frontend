"use client";

/**
 * ExplorerProvider — the single source of truth for the topology explorer.
 *
 * One selection (`selectedId`) drives EVERYTHING: graph focus, the detail panel
 * below, and the containment tree. Search / graph-click / tree-row all call the
 * same idempotent `select(id)` setter; all side-effects (graph re-focus,
 * on-demand neighbour fetch) run in a single `useEffect([selectedId])`, never in
 * the click handlers — so the three inputs can never loop (the centralised
 * version of the proven `entity-graph.tsx` pattern).
 *
 * The graph itself is the pure `GraphState` from `explorer-graph.ts`; this shell
 * sequences seed → select → expand(fetch) → merge → enforceBounds and mirrors
 * `selectedId` to the URL `?node=` (one-way-out debounced, one-way-in on load,
 * `?focus=` accepted as a Cmd-K deep-link alias).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { api } from "@/lib/api/client";
import type { GraphNode, GraphLink } from "@/components/topology/graph/graph-data";
import {
  seedGraph,
  selectNode,
  mergeNeighbors,
  enforceBounds,
  reconcileSeed,
  toGraphElements,
  type GNode,
  type GraphState,
  type Seed,
} from "@/components/topology/explorer/explorer-graph";
import { isSyntheticId } from "@/components/topology/explorer/scope-seed";

interface ExplorerContextValue {
  graph: GraphState;
  /** The synthetic scope root id (repo/cap/org). */
  rootId: string;
  /** Current selection — null means "scope root" (the detail panel shows the
   *  ScopeSummaryCard). Mirrored to `?node=`. */
  selectedId: string | null;
  /** The graph projected onto the Cytoscape component's {nodes, links} shape. */
  elements: { nodes: GraphNode[]; links: GraphLink[] };
  /** Set the focus from any input (search / graph / tree). Idempotent. `stub`
   *  seeds an off-graph search hit so there's a node to focus + expand. */
  select: (id: string | null, opts?: { stub?: GNode }) => void;
  /** Force-expand a node's neighbours (tree caret / explicit). Single-click
   *  select already auto-expands; this is for expanding a non-selected node. */
  expand: (id: string) => void;
  /** Node ids currently fetching neighbours. */
  expanding: Set<string>;
  /** Node ids whose neighbours have been merged (tree shows a caret/▾). */
  expanded: Set<string>;
}

const ExplorerContext = createContext<ExplorerContextValue | null>(null);

export function ExplorerProvider({ seed, children }: { seed: Seed; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Initial selection from the URL (?node=, or ?focus= for Cmd-K deep-links).
  // Read once; subsequent URL writes are one-way-out so this never re-fires.
  const initialSelectedRef = useRef<string | null>(
    searchParams.get("node") ?? searchParams.get("focus") ?? null,
  );

  const [graph, setGraph] = useState<GraphState>(() => seedGraph(seed));
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedRef.current);
  const [expanding, setExpanding] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Guards read synchronously inside callbacks (kept out of state so `expand`
  // and the select effect stay referentially stable → no re-fire loops).
  const expandedRef = useRef<Set<string>>(new Set());
  const stubRef = useRef<Map<string, GNode>>(new Map());
  const graphRef = useRef(graph);
  useEffect(() => { graphRef.current = graph; }, [graph]);

  // A new `seed` arrives on EVERY parent render (the page rebuilds it from
  // freshly-fetched knowledge, e.g. the 3s sync poll). Distinguish two cases by
  // the scope root id:
  //   • same scope → the data just refreshed: MERGE it in (reconcileSeed is a
  //     no-op when nothing's new), preserving selection / expansion / viewport.
  //     This is the fix for the old "resets every few seconds" flicker.
  //   • different scope (real navigation) → full re-seed + reset.
  const prevRootRef = useRef<string>(seed.rootId);
  useEffect(() => {
    if (prevRootRef.current === seed.rootId) {
      setGraph((g) => reconcileSeed(g, seed));
      return;
    }
    prevRootRef.current = seed.rootId;
    setGraph(seedGraph(seed));
    expandedRef.current = new Set();
    setExpanded(new Set());
    setExpanding(new Set());
    // keep any deep-linked selection; otherwise reset to the root
  }, [seed]);

  const expand = useCallback(async (id: string) => {
    if (isSyntheticId(id) || expandedRef.current.has(id)) return;
    expandedRef.current.add(id);
    setExpanding((s) => new Set(s).add(id));
    try {
      const res = await api.knowledge.neighbors(id, { limit: 60 });
      setGraph((g) => enforceBounds(mergeNeighbors(g, id, res)));
      setExpanded((s) => new Set(s).add(id));
    } catch {
      expandedRef.current.delete(id); // allow a later retry; node stays unexpanded
    } finally {
      setExpanding((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  }, []);

  const select = useCallback((id: string | null, opts: { stub?: GNode } = {}) => {
    if (id && opts.stub) stubRef.current.set(id, opts.stub);
    setSelectedId((prev) => (prev === id ? prev : id));
  }, []);

  // The ONLY side-effect site: focus the graph on the selection (injecting a
  // stub / fetched identity for an off-graph id) then schedule its expand.
  useEffect(() => {
    const id = selectedId;
    if (!id) return;
    let cancelled = false;
    const apply = async () => {
      let stub = stubRef.current.get(id);
      stubRef.current.delete(id);
      // Off-graph id with no caller-provided stub (a ?node= deep-link): fetch
      // its identity so the graph has a real node to focus on.
      if (!stub && !graphRef.current.nodes.has(id) && !isSyntheticId(id)) {
        try {
          const d = await api.knowledge.node(id);
          if (cancelled) return;
          stub = {
            id,
            node_kind: d.node_kind ?? d.dossier?.kind ?? "file",
            name: d.name ?? d.dossier?.name ?? id,
            path: d.path ?? d.dossier?.path ?? null,
            repo_id: d.repo_id ?? null,
          };
        } catch {
          /* unknown id — selectNode will no-op below */
        }
      }
      if (cancelled) return;
      setGraph((g) => selectNode(g, id, stub ? { stub } : {}));
      if (!isSyntheticId(id)) void expand(id);
    };
    void apply();
    return () => { cancelled = true; };
  }, [selectedId, expand]);

  // One-way-out URL mirror (debounced) — also migrates the legacy `?focus=` /
  // `?tier=` deep-links away once the explorer owns the selection.
  useEffect(() => {
    const t = setTimeout(() => {
      if (typeof window === "undefined") return;
      const sp = new URLSearchParams(window.location.search);
      if (selectedId) sp.set("node", selectedId);
      else sp.delete("node");
      sp.delete("focus");
      sp.delete("tier");
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 300);
    return () => clearTimeout(t);
  }, [selectedId, pathname, router]);

  const elements = useMemo(() => toGraphElements(graph), [graph]);

  const value = useMemo<ExplorerContextValue>(
    () => ({ graph, rootId: seed.rootId, selectedId, elements, select, expand, expanding, expanded }),
    [graph, seed.rootId, selectedId, elements, select, expand, expanding, expanded],
  );

  return <ExplorerContext.Provider value={value}>{children}</ExplorerContext.Provider>;
}

export function useExplorer(): ExplorerContextValue {
  const ctx = useContext(ExplorerContext);
  if (!ctx) throw new Error("useExplorer must be used within <ExplorerProvider>");
  return ctx;
}
