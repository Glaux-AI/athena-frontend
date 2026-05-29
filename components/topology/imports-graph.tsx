"use client";

/**
 * ImportsGraph — repo Topology's spatial view of `imports` call-edges.
 *
 * Per ADR-073 §4 (canonical-home rule): this visualisation lives ONLY on
 * the Repo Topology tab. The sibling `<CallGraphList>` table stays — the
 * table is the dense list view; this is the spatial view.
 *
 * Pure presentation. `top_symbols` gives label/path; `call_edges` filtered
 * to `kind === "imports"` populates the graph. Layout coords are
 * synthesised here (ADR-051 §Knowledge surfaces: transport omits x/y).
 *
 * Layered mode walks the DAG to assign depth bands; force mode (auto for
 * >40 nodes) falls back to a deterministic radial layout — no real force
 * sim (too costly, non-deterministic for tests).
 *
 * Click a node → routes to `?tab=files&focus={node_id}` (FileDetailDrawer
 * not yet wired by the file-browser agent; the focus param survives).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, {
  Background, Controls, type Edge, Handle, type Node, type NodeProps, Position,
} from "reactflow";
import "reactflow/dist/style.css";
import { useRouter, useSearchParams } from "next/navigation";

import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import type { CallEdge, TopSymbol } from "@/lib/api/client";

const NODE_W = 180;
const NODE_H = 56;
const ROW_GAP = 96;
const COL_GAP = 24;
const FORCE_THRESHOLD = 40;

type LayoutMode = "layered" | "force";
type GraphNode = { id: string; name: string; path: string };

interface ImportsNodeData {
  basename: string;
  parent: string;
  /** ADR-042 5-tier — file-only today; reserved so the same node renderer
   *  can pick up symbol/module/layer/domain later without diverging. */
  tier: "file" | "symbol" | "module" | "layer" | "domain";
  faded: boolean;
  selected: boolean;
}

const TIER_FILL: Record<ImportsNodeData["tier"], string> = {
  file:   "oklch(60% 0.15 75)",  // amber
  symbol: "oklch(60% 0.10 260)", // indigo
  module: "oklch(60% 0.13 220)", // cyan
  layer:  "var(--primary)",      // violet
  domain: "oklch(60% 0.18 20)",  // rose
};

function splitPath(path: string): { basename: string; parent: string } {
  const cleaned = path.split(":")[0] ?? path;
  const i = cleaned.lastIndexOf("/");
  if (i < 0) return { basename: cleaned, parent: "" };
  return { basename: cleaned.slice(i + 1), parent: cleaned.slice(0, i) };
}

function ImportsNode({ data }: NodeProps<ImportsNodeData>) {
  const fill = TIER_FILL[data.tier];
  return (
    <div
      data-testid={`imports-node-${data.tier}`}
      className="rounded-md border bg-[var(--surface)] px-3 py-2 text-xs shadow-[var(--shadow-1)] transition-[opacity,transform] duration-150"
      style={{ width: NODE_W, height: NODE_H, borderColor: data.selected ? "var(--primary)" : fill, opacity: data.faded ? 0.3 : 1, transform: data.selected ? "scale(1.1)" : "scale(1)", boxShadow: data.selected ? "0 0 0 2px var(--primary)" : undefined }}
    >
      <Handle type="target" position={Position.Top} style={{ background: fill, opacity: 0.6 }} />
      <div className="truncate font-mono text-[12px] font-semibold text-[var(--text)]">{data.basename}</div>
      <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-[var(--text-muted)]">
        <span className="truncate font-mono">{data.parent || "/"}</span>
        <span className="uppercase tracking-wider" style={{ color: fill }}>{data.tier}</span>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: fill, opacity: 0.6 }} />
    </div>
  );
}

const NODE_TYPES = { imports: ImportsNode } as const;

/** Layered: BFS depth from zero-in-degree roots; cycles share depth 0. */
function layeredLayout(nodes: GraphNode[], edges: readonly CallEdge[]): Map<string, { x: number; y: number }> {
  const inDeg = new Map<string, number>();
  for (const n of nodes) inDeg.set(n.id, 0);
  const ids = new Set(nodes.map((n) => n.id));
  for (const e of edges) if (ids.has(e.to.id)) inDeg.set(e.to.id, (inDeg.get(e.to.id) ?? 0) + 1);
  const depth = new Map<string, number>();
  const q: string[] = [];
  for (const [id, d] of inDeg) if (d === 0) { depth.set(id, 0); q.push(id); }
  while (q.length) {
    const id = q.shift()!;
    const d = depth.get(id) ?? 0;
    for (const e of edges) if (e.from.id === id && depth.get(e.to.id) === undefined && ids.has(e.to.id)) { depth.set(e.to.id, d + 1); q.push(e.to.id); }
  }
  for (const n of nodes) if (depth.get(n.id) === undefined) depth.set(n.id, 0);
  const byDepth = new Map<number, GraphNode[]>();
  for (const n of nodes) { const arr = byDepth.get(depth.get(n.id)!) ?? []; arr.push(n); byDepth.set(depth.get(n.id)!, arr); }
  const pos = new Map<string, { x: number; y: number }>();
  for (const [d, row] of byDepth) {
    const totalW = row.length * NODE_W + Math.max(0, row.length - 1) * COL_GAP;
    const startX = -totalW / 2;
    row.forEach((n, i) => pos.set(n.id, { x: startX + i * (NODE_W + COL_GAP), y: d * (NODE_H + ROW_GAP) }));
  }
  return pos;
}

/** Radial: deterministic angle by sorted name, radius scales with node count. */
function radialLayout(nodes: GraphNode[]): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  const sorted = [...nodes].sort((a, b) => a.name.localeCompare(b.name));
  const radius = Math.max(260, sorted.length * 14);
  sorted.forEach((n, i) => {
    const angle = (i / sorted.length) * Math.PI * 2;
    pos.set(n.id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  });
  return pos;
}

interface ImportsGraphProps {
  topSymbols: readonly TopSymbol[];
  edges: readonly CallEdge[];
  onSync?: () => void;
  height?: number;
}

export function ImportsGraph({ topSymbols, edges, onSync, height = 520 }: ImportsGraphProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<LayoutMode>("layered");
  const [neighborhoodOnly, setNeighborhoodOnly] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => { if (typeof window !== "undefined") setReduceMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches); }, []);

  const importEdges = useMemo(() => edges.filter((e) => e.kind === "imports"), [edges]);

  const graphNodes = useMemo<GraphNode[]>(() => {
    const m = new Map<string, GraphNode>();
    for (const s of topSymbols) m.set(s.id, { id: s.id, name: s.name, path: s.path });
    for (const e of importEdges) {
      if (!m.has(e.from.id)) m.set(e.from.id, { id: e.from.id, name: e.from.name, path: e.from.path });
      if (!m.has(e.to.id))   m.set(e.to.id,   { id: e.to.id,   name: e.to.name,   path: e.to.path   });
    }
    return [...m.values()];
  }, [topSymbols, importEdges]);

  // Honor ?focus=<id> (from the file drawer's "Open in graph") — highlight
  // the node if it participates in the import graph.
  const focusId = searchParams.get("focus");
  useEffect(() => {
    if (focusId && graphNodes.some((n) => n.id === focusId)) setSelectedId(focusId);
  }, [focusId, graphNodes]);

  const positions = useMemo(() => {
    if (mode === "force" || graphNodes.length > FORCE_THRESHOLD) return radialLayout(graphNodes);
    return layeredLayout(graphNodes, importEdges);
  }, [graphNodes, importEdges, mode]);

  const highlighted = useMemo(() => {
    const focus = hoveredId ?? selectedId;
    if (!focus) return null;
    const set = new Set<string>([focus]);
    for (const e of importEdges) {
      if (e.from.id === focus) set.add(e.to.id);
      if (e.to.id === focus) set.add(e.from.id);
    }
    return set;
  }, [hoveredId, selectedId, importEdges]);

  const rfNodes = useMemo<Node<ImportsNodeData>[]>(() => graphNodes
    .filter((n) => !neighborhoodOnly || !highlighted || highlighted.has(n.id))
    .map((n) => {
      const { basename, parent } = splitPath(n.path);
      return {
        id: n.id, type: "imports", position: positions.get(n.id) ?? { x: 0, y: 0 },
        data: { basename, parent, tier: "file", faded: !!highlighted && !highlighted.has(n.id), selected: selectedId === n.id },
      };
    }), [graphNodes, positions, highlighted, neighborhoodOnly, selectedId]);

  const rfEdges = useMemo<Edge[]>(() => importEdges
    .filter((e) => !neighborhoodOnly || !highlighted || (highlighted.has(e.from.id) && highlighted.has(e.to.id)))
    .map((e, i) => {
      const incident = !highlighted || (highlighted.has(e.from.id) && highlighted.has(e.to.id));
      return {
        id: `e-${i}-${e.from.id}-${e.to.id}`, source: e.from.id, target: e.to.id,
        style: { stroke: incident ? "var(--border-strong)" : "var(--border)", strokeWidth: incident ? 1.4 : 0.8, opacity: incident ? 0.95 : 0.25 },
      };
    }), [importEdges, highlighted, neighborhoodOnly]);

  const onNodeClick = useCallback((_e: unknown, n: Node) => {
    setSelectedId(n.id);
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("tab", "files"); sp.set("focus", n.id);
    router.push(`?${sp.toString()}`);
  }, [router, searchParams]);

  if (importEdges.length === 0) {
    return (
      <div data-testid="imports-graph-empty" style={{ height }}>
        <EmptyState
          title="No imports edges yet"
          description="Try syncing this repo to populate the import graph."
          {...(onSync ? { action: <Button onClick={onSync} variant="primary" size="sm">Sync repo</Button> } : {})}
        />
      </div>
    );
  }

  return (
    <div
      data-testid="imports-graph" data-mode={mode} data-reduced-motion={reduceMotion ? "true" : "false"}
      className="rounded-lg border border-[var(--border)] bg-[var(--surface)]"
      style={{ height, width: "100%" }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2 text-xs">
        <span className="font-semibold text-[var(--text)]">Imports graph</span>
        <div className="flex items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-[var(--border)]" role="tablist" aria-label="Layout mode">
            <button data-testid="imports-mode-layered" aria-pressed={mode === "layered"} onClick={() => setMode("layered")} className={`px-2 py-1 ${mode === "layered" ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--text-muted)]"}`}>Layered</button>
            <button data-testid="imports-mode-force" aria-pressed={mode === "force"} onClick={() => setMode("force")} className={`px-2 py-1 ${mode === "force" ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--text-muted)]"}`}>Force</button>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[var(--text-muted)] hover:text-[var(--text)]">
            <input type="checkbox" data-testid="imports-neighborhood" checked={neighborhoodOnly} onChange={(e) => setNeighborhoodOnly(e.target.checked)} className="size-3" />
            Neighborhood only
          </label>
        </div>
      </div>
      <div style={{ height: height - 41 }}>
        <ReactFlow
          nodes={rfNodes} edges={rfEdges} nodeTypes={NODE_TYPES} fitView
          proOptions={{ hideAttribution: true }}
          panOnDrag={!reduceMotion} zoomOnScroll={!reduceMotion} zoomOnPinch={!reduceMotion}
          panOnScroll={false} nodesDraggable={false} nodesConnectable={false} elementsSelectable
          onNodeMouseEnter={(_e, n) => setHoveredId(n.id)}
          onNodeMouseLeave={() => setHoveredId(null)}
          onNodeClick={onNodeClick}
        >
          <Background gap={20} size={1} color="var(--border)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
