"use client";

/**
 * KnowledgeMiniGraph — reusable SVG graph used across org / capability /
 * repo knowledge surfaces.
 *
 * Input is a typed `{ nodes, edges }` shape with a `layer` field per node.
 * Nodes are laid out in horizontal bands keyed by `layer` (so callers can
 * control the visual hierarchy: services on top, modules in middle,
 * decisions on bottom, etc.). Within each band, nodes are spread evenly.
 * Edges are drawn as straight lines with arrow markers. Selecting a node
 * fires `onSelect`; the caller renders the detail panel.
 *
 * No layout engine, no d3 — just a deterministic grid layout so the SVG
 * renders the same way every reload. Suitable for the small graphs we
 * surface in the UI (≤ ~24 nodes per scope).
 */

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";

export interface MiniGraphNode {
  id: string;
  label: string;
  /** Vertical band: 0 = top row, increasing = lower rows. */
  layer: number;
  /** Drives the fill colour. */
  kind: "service" | "module" | "function" | "class" | "config" | "document" | "capability" | "repo";
  /** Optional sublabel (path, repo, etc.). */
  sublabel?: string | undefined;
  /** Optional importance 0–1; drives node opacity / size. */
  importance?: number | undefined;
  /** Optional badge displayed top-right of the node (e.g. file count, LOC). */
  badge?: string | undefined;
}

export interface MiniGraphEdge {
  src: string;
  dst: string;
  /** Optional label rendered at the midpoint. */
  label?: string | undefined;
  /** Visual style — dashed lines for soft / implicit dependencies. */
  style?: "solid" | "dashed" | undefined;
}

export interface KnowledgeMiniGraphProps {
  nodes: MiniGraphNode[];
  edges: MiniGraphEdge[];
  /** Compact (default) renders at ~480×320; "wide" gives more horizontal room. */
  size?: "compact" | "wide";
  /** Optional callback when a node is clicked. */
  onSelect?: (node: MiniGraphNode) => void;
  /** Optional id of the currently-selected node (drives the highlight ring). */
  selectedId?: string;
}

const KIND_COLOR: Record<MiniGraphNode["kind"], string> = {
  service:    "var(--primary)",
  module:     "oklch(60% 0.13 220)",
  function:   "oklch(60% 0.10 260)",
  class:      "oklch(60% 0.13 265)",
  config:     "oklch(60% 0.15 75)",
  document:   "oklch(60% 0.13 155)",
  capability: "oklch(60% 0.18 20)",
  repo:       "oklch(55% 0.10 200)",
};

const NODE_W = 132;
const NODE_H = 44;
const ROW_GAP = 78;
const COL_GAP = 36;
const SIDE_PAD = 24;
const TOP_PAD = 16;

export function KnowledgeMiniGraph({
  nodes,
  edges,
  size = "compact",
  onSelect,
  selectedId,
}: KnowledgeMiniGraphProps) {
  const [hoverId, setHoverId] = useState<string | null>(null);

  /* Group nodes by layer, then position deterministically. */
  const positioned = useMemo(() => {
    const byLayer = new Map<number, MiniGraphNode[]>();
    for (const n of nodes) {
      const arr = byLayer.get(n.layer) ?? [];
      arr.push(n);
      byLayer.set(n.layer, arr);
    }
    const layers = Array.from(byLayer.keys()).sort((a, b) => a - b);
    const maxPerLayer = Math.max(...layers.map((l) => byLayer.get(l)!.length));
    const widthHint = size === "wide" ? 880 : 640;
    const requiredWidth = SIDE_PAD * 2 + maxPerLayer * NODE_W + Math.max(0, maxPerLayer - 1) * COL_GAP;
    const width = Math.max(widthHint, requiredWidth);
    const height = TOP_PAD * 2 + layers.length * NODE_H + Math.max(0, layers.length - 1) * ROW_GAP;
    const positions = new Map<string, { x: number; y: number; node: MiniGraphNode }>();
    layers.forEach((layer, layerIdx) => {
      const row = byLayer.get(layer)!;
      const totalW = row.length * NODE_W + Math.max(0, row.length - 1) * COL_GAP;
      const startX = (width - totalW) / 2;
      row.forEach((n, i) => {
        positions.set(n.id, {
          x: startX + i * (NODE_W + COL_GAP) + NODE_W / 2,
          y: TOP_PAD + layerIdx * (NODE_H + ROW_GAP) + NODE_H / 2,
          node: n,
        });
      });
    });
    return { positions, width, height };
  }, [nodes, size]);

  if (nodes.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <svg
        viewBox={`0 0 ${positioned.width} ${positioned.height}`}
        width={positioned.width}
        height={positioned.height}
        className="block"
        role="img"
        aria-label="Knowledge graph"
      >
        <defs>
          <marker id="kg-arrow" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
            <path d="M 0 0 L 6 3 L 0 6 z" fill="var(--border-strong)" />
          </marker>
          <marker id="kg-arrow-active" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
            <path d="M 0 0 L 6 3 L 0 6 z" fill="var(--primary)" />
          </marker>
        </defs>

        {/* edges */}
        {edges.map((e, i) => {
          const s = positioned.positions.get(e.src);
          const d = positioned.positions.get(e.dst);
          if (!s || !d) return null;
          const isActive = hoverId === e.src || hoverId === e.dst || selectedId === e.src || selectedId === e.dst;
          // shorten line so it stops at node boundary, not centre
          const dx = d.x - s.x;
          const dy = d.y - s.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const ux = dx / len;
          const uy = dy / len;
          const inset = NODE_H / 2 + 4;
          const x1 = s.x + ux * inset;
          const y1 = s.y + uy * inset;
          const x2 = d.x - ux * inset;
          const y2 = d.y - uy * inset;
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          return (
            <g key={`e-${i}`}>
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={isActive ? "var(--primary)" : "var(--border-strong)"}
                strokeWidth={isActive ? 2 : 1.4}
                strokeDasharray={e.style === "dashed" ? "4 3" : undefined}
                markerEnd={`url(#${isActive ? "kg-arrow-active" : "kg-arrow"})`}
                opacity={isActive ? 1 : 0.7}
              />
              {e.label && (
                <text
                  x={mx} y={my - 4}
                  textAnchor="middle"
                  fontSize="9"
                  className="pointer-events-none select-none fill-[var(--text-muted)]"
                  fontFamily="system-ui"
                >
                  {e.label}
                </text>
              )}
            </g>
          );
        })}

        {/* nodes */}
        {Array.from(positioned.positions.values()).map(({ x, y, node }) => {
          const color = KIND_COLOR[node.kind];
          const isSelected = selectedId === node.id;
          const isHovered = hoverId === node.id;
          const opacity = node.importance != null ? Math.max(0.35, node.importance) : 1;
          return (
            <g
              key={node.id}
              transform={`translate(${x - NODE_W / 2} ${y - NODE_H / 2})`}
              className="cursor-pointer"
              onMouseEnter={() => setHoverId(node.id)}
              onMouseLeave={() => setHoverId(null)}
              onClick={() => onSelect?.(node)}
            >
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={8}
                fill={color}
                fillOpacity={isSelected ? 0.95 : isHovered ? 0.75 : 0.15 * opacity}
                stroke={color}
                strokeWidth={isSelected ? 2.5 : isHovered ? 2 : 1.5}
              />
              <text
                x={NODE_W / 2} y={node.sublabel ? NODE_H / 2 - 4 : NODE_H / 2 + 4}
                textAnchor="middle"
                fontSize="11"
                fontWeight="600"
                fill={isSelected ? "white" : "var(--text)"}
                fontFamily="system-ui"
                className="pointer-events-none select-none"
              >
                {truncate(node.label, 18)}
              </text>
              {node.sublabel && (
                <text
                  x={NODE_W / 2} y={NODE_H / 2 + 10}
                  textAnchor="middle"
                  fontSize="9"
                  fill={isSelected ? "white" : "var(--text-muted)"}
                  fillOpacity={isSelected ? 0.85 : 1}
                  fontFamily="ui-monospace, monospace"
                  className="pointer-events-none select-none"
                >
                  {truncate(node.sublabel, 24)}
                </text>
              )}
              {node.badge && (
                <g transform={`translate(${NODE_W - 28} ${4})`}>
                  <rect
                    width={24} height={14} rx={7}
                    fill="var(--surface)"
                    stroke={color}
                    strokeWidth={1}
                  />
                  <text
                    x={12} y={10}
                    textAnchor="middle"
                    fontSize="8.5"
                    fontWeight="700"
                    fill="var(--text)"
                    fontFamily="ui-monospace, monospace"
                    className="pointer-events-none select-none"
                  >
                    {node.badge}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className={cn(
        "flex flex-wrap items-center gap-3 border-t border-[var(--border)] px-3 py-1.5 text-[10px] text-[var(--text-muted)]",
      )}>
        {Array.from(new Set(nodes.map((n) => n.kind))).map((kind) => (
          <span key={kind} className="inline-flex items-center gap-1">
            <span className="inline-block size-2 rounded-sm" style={{ background: KIND_COLOR[kind], opacity: 0.7 }} />
            <span className="capitalize">{kind}</span>
          </span>
        ))}
        <span className="ml-auto text-[var(--text-subtle)]">
          {nodes.length} node{nodes.length === 1 ? "" : "s"} · {edges.length} edge{edges.length === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
