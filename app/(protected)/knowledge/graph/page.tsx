"use client";

/**
 * /knowledge/graph — spatial knowledge-graph view (legacy default).
 *
 * The Blueprint-based Org surface at `/knowledge` is now the default; this
 * spatial view is preserved for users who want to visualize service /
 * module / config relationships directly. Reads `api.knowledge.graph()`.
 *
 * Layout coordinates and node colors are *not* part of the transport
 * contract — they're synthesised here from the BE's `layer` field
 * (color) and the node index within the result (circle layout).
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, ApiError, type KnowledgeGraph, type KnowledgeNode } from "@/lib/api/client";

const NODE_RADIUS = 28;
const CANVAS_W = 800;
const CANVAS_H = 480;

/** Per-layer fill/stroke. Unknown layers fall back to `--primary`. */
const LAYER_COLOR: Record<string, string> = {
  Service:    "var(--primary)",                 // violet
  UI:         "oklch(60% 0.13 220)",            // cyan
  Infra:      "oklch(60% 0.15 75)",             // amber
  Data:       "oklch(60% 0.13 265)",            // indigo
  Convention: "oklch(60% 0.13 155)",            // mint
  Domain:     "oklch(60% 0.18 20)",             // rose
};

function colorFor(layer: string | null): string {
  if (!layer) return "var(--primary)";
  return LAYER_COLOR[layer] ?? "var(--primary)";
}

/** Deterministic circle layout — keeps the legacy "ring of nodes" look
 * without forcing the BE to ship presentation coordinates. */
function layoutNodes(nodes: KnowledgeNode[]): Map<string, { x: number; y: number }> {
  const map = new Map<string, { x: number; y: number }>();
  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;
  const radius = Math.min(CANVAS_W, CANVAS_H) / 2 - NODE_RADIUS - 32;
  const n = nodes.length;
  if (n === 0) return map;
  if (n === 1) {
    map.set(nodes[0]!.id, { x: cx, y: cy });
    return map;
  }
  // Start at -π/2 so the first node sits at the top.
  const start = -Math.PI / 2;
  for (let i = 0; i < n; i++) {
    const t = start + (i * 2 * Math.PI) / n;
    map.set(nodes[i]!.id, {
      x: cx + radius * Math.cos(t),
      y: cy + radius * Math.sin(t),
    });
  }
  return map;
}

export default function KnowledgeGraphPage() {
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [selected, setSelected] = useState<KnowledgeNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const g = await api.knowledge.graph();
        setGraph(g);
        setSelected(g.nodes[0] ?? null);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load graph");
      }
    })();
  }, []);

  const positions = useMemo(() => layoutNodes(graph?.nodes ?? []), [graph]);

  if (error) return <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]"><p className="text-sm text-[var(--danger)]">{error}</p></Card>;
  if (!graph) return (
    <Stack gap="6" aria-busy="true" aria-label="Loading knowledge graph">
      <Stack gap="1">
        <div className="h-7 w-48 animate-pulse rounded-md bg-[var(--surface-2)]" />
        <div className="h-4 w-72 animate-pulse rounded-md bg-[var(--surface-2)]" />
      </Stack>
      <div className="flex gap-4">
        <Card className="flex-1 p-0 overflow-hidden">
          <div className="h-[480px] w-full animate-pulse bg-[var(--surface-2)]" />
        </Card>
        <Card className="w-80 shrink-0">
          <Stack gap="3">
            <div className="h-4 w-24 animate-pulse rounded-md bg-[var(--surface-2)]" />
            <div className="h-5 w-40 animate-pulse rounded-md bg-[var(--surface-2)]" />
            <div className="h-3 w-32 animate-pulse rounded-md bg-[var(--surface-2)]" />
            <div className="mt-2 h-3 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
            <div className="h-3 w-3/4 animate-pulse rounded-md bg-[var(--surface-2)]" />
          </Stack>
        </Card>
      </div>
    </Stack>
  );

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  return (
    <Stack gap="6">
      <Cluster justify="between" align="center">
        <Stack gap="1">
          <Link href="/knowledge" className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] no-underline hover:text-[var(--text)]">
            <ArrowLeft className="size-4" />
            Back to org knowledge
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Knowledge graph</h1>
          <p className="text-sm text-[var(--text-muted)]">{graph.nodes.length} nodes · {graph.edges.length} edges across services, modules, configs, and decisions.</p>
        </Stack>
      </Cluster>

      <div className="flex gap-4">
        <Card className="flex-1 p-0 overflow-hidden">
          <svg viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} className="w-full h-[480px]">
            <defs>
              <marker id="arrow" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
                <path d="M 0 0 L 6 3 L 0 6 z" fill="var(--border-strong)" />
              </marker>
            </defs>
            {graph.edges.map((e, i) => {
              const s = positions.get(e.source_id);
              const d = positions.get(e.target_id);
              if (!s || !d) return null;
              return (
                <line
                  key={i}
                  x1={s.x} y1={s.y} x2={d.x} y2={d.y}
                  stroke="var(--border-strong)"
                  strokeWidth={1.5}
                  markerEnd="url(#arrow)"
                  opacity={0.7}
                />
              );
            })}
            {graph.nodes.map((n) => {
              const p = positions.get(n.id);
              if (!p) return null;
              const fill = colorFor(n.layer);
              return (
                <g key={n.id} className="cursor-pointer" onClick={() => setSelected(n)}>
                  <circle
                    cx={p.x} cy={p.y} r={NODE_RADIUS}
                    fill={fill}
                    fillOpacity={selected?.id === n.id ? 1 : 0.15}
                    stroke={fill}
                    strokeWidth={selected?.id === n.id ? 3 : 2}
                  />
                  <text
                    x={p.x} y={p.y + NODE_RADIUS + 14}
                    textAnchor="middle"
                    fontSize="11"
                    fill="var(--text)"
                    fontFamily="system-ui"
                  >
                    {n.name.length > 18 ? `${n.name.slice(0, 16)}…` : n.name}
                  </text>
                </g>
              );
            })}
          </svg>
        </Card>

        <Card className="w-80 shrink-0">
          {selected ? (
            <Stack gap="3">
              <Stack gap="1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{selected.layer ?? "—"} · {selected.node_kind}</span>
                <h2 className="text-base font-semibold">{selected.name}</h2>
                {selected.tags.length > 0 && (
                  <Cluster gap="1">
                    {selected.tags.map((t) => (
                      <span key={t} className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">{t}</span>
                    ))}
                  </Cluster>
                )}
              </Stack>
              <Stack gap="1">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Connected to</span>
                <ul className="space-y-1 text-sm">
                  {graph.edges.filter((e) => e.source_id === selected.id).map((e, i) => {
                    const dst = nodeById.get(e.target_id);
                    return dst ? <li key={i} className="text-[var(--text-muted)]">{e.kind} → <span className="text-[var(--text)]">{dst.name}</span></li> : null;
                  })}
                  {graph.edges.filter((e) => e.target_id === selected.id).map((e, i) => {
                    const src = nodeById.get(e.source_id);
                    return src ? <li key={`in_${i}`} className="text-[var(--text-muted)]"><span className="text-[var(--text)]">{src.name}</span> → {e.kind}</li> : null;
                  })}
                </ul>
              </Stack>
            </Stack>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Click a node to inspect.</p>
          )}
        </Card>
      </div>
    </Stack>
  );
}
