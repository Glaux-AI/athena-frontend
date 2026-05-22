"use client";

/**
 * /knowledge — the org's code knowledge graph. Nodes are services, modules,
 * configs, ADRs. Click a node → side panel with details.
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, ApiError, type KnowledgeGraph, type KnowledgeNode } from "@/lib/api/client";

const NODE_RADIUS = 28;
const CANVAS_W = 800;
const CANVAS_H = 480;

const NODE_COLOR: Record<string, string> = {
  violet: "var(--primary)",
  cyan:   "oklch(60% 0.13 220)",
  amber:  "oklch(60% 0.15 75)",
  indigo: "oklch(60% 0.13 265)",
  rose:   "oklch(60% 0.18 20)",
  mint:   "oklch(60% 0.13 155)",
};

export default function KnowledgePage() {
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

  if (error) return <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]"><p className="text-sm text-[var(--danger)]">{error}</p></Card>;
  if (!graph) return <Cluster gap="2" align="center"><Loader2 className="size-4 animate-spin text-[var(--text-muted)]" /><span className="text-sm text-[var(--text-muted)]">Loading…</span></Cluster>;

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  return (
    <Stack gap="6">
      <Stack gap="1">
        <h1 className="text-2xl font-semibold tracking-tight">Knowledge graph</h1>
        <p className="text-sm text-[var(--text-muted)]">{graph.nodes.length} nodes · {graph.edges.length} edges across services, modules, configs, and decisions.</p>
      </Stack>

      <div className="flex gap-4">
        <Card className="flex-1 p-0 overflow-hidden">
          <svg viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} className="w-full h-[480px]">
            <defs>
              <marker id="arrow" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
                <path d="M 0 0 L 6 3 L 0 6 z" fill="var(--border-strong)" />
              </marker>
            </defs>
            {graph.edges.map((e, i) => {
              const s = nodeById.get(e.src);
              const d = nodeById.get(e.dst);
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
            {graph.nodes.map((n) => (
              <g key={n.id} className="cursor-pointer" onClick={() => setSelected(n)}>
                <circle
                  cx={n.x} cy={n.y} r={NODE_RADIUS}
                  fill={NODE_COLOR[n.color] ?? "var(--primary)"}
                  fillOpacity={selected?.id === n.id ? 1 : 0.15}
                  stroke={NODE_COLOR[n.color] ?? "var(--primary)"}
                  strokeWidth={selected?.id === n.id ? 3 : 2}
                />
                <text
                  x={n.x} y={n.y + NODE_RADIUS + 14}
                  textAnchor="middle"
                  fontSize="11"
                  fill="var(--text)"
                  fontFamily="system-ui"
                >
                  {n.name.length > 18 ? `${n.name.slice(0, 16)}…` : n.name}
                </text>
              </g>
            ))}
          </svg>
        </Card>

        <Card className="w-80 shrink-0">
          {selected ? (
            <Stack gap="3">
              <Stack gap="1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{selected.layer} · {selected.kind}</span>
                <h2 className="text-base font-semibold">{selected.name}</h2>
                <code className="rounded bg-[var(--code-bg)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-muted)]">{selected.path}</code>
              </Stack>
              <Stack gap="1">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Connected to</span>
                <ul className="space-y-1 text-sm">
                  {graph.edges.filter((e) => e.src === selected.id).map((e, i) => {
                    const dst = nodeById.get(e.dst);
                    return dst ? <li key={i} className="text-[var(--text-muted)]">{e.kind} → <span className="text-[var(--text)]">{dst.name}</span></li> : null;
                  })}
                  {graph.edges.filter((e) => e.dst === selected.id).map((e, i) => {
                    const src = nodeById.get(e.src);
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
