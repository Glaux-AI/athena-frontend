"use client";

/**
 * GraphMinimap - a lightweight overview for the Cytoscape graph: every node as
 * a dot, the current viewport as a rectangle, click / drag to pan. Reads model
 * coordinates straight off the live `cy` instance (throttled to one rAF per
 * burst of render/pan/zoom events) so there's no second graph to keep in sync.
 * Used on the large org entity graph (org Topology tab) where there's no
 * structure tree to orient by.
 */

import { useEffect, useRef, useState, type RefObject } from "react";
import type cytoscape from "cytoscape";

const W = 156;
const H = 108;
const PAD = 6;

interface Geo {
  nodes: Array<{ x: number; y: number }>;
  view: { x: number; y: number; w: number; h: number };
}

export function GraphMinimap({ cyRef }: { cyRef: RefObject<cytoscape.Core | null> }) {
  const [geo, setGeo] = useState<Geo | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const transformRef = useRef<{ scale: number; offX: number; offY: number } | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    const cyInstance = cyRef.current;
    if (!cyInstance) return;
    let raf = 0;
    const recompute = () => {
      raf = 0;
      const cy = cyRef.current;
      if (!cy) return;
      const nodes = cy.nodes();
      if (nodes.length === 0) { setGeo(null); return; }
      const bb = nodes.boundingBox({});
      const ext = cy.extent();
      const minX = Math.min(bb.x1, ext.x1);
      const minY = Math.min(bb.y1, ext.y1);
      const maxX = Math.max(bb.x2, ext.x2);
      const maxY = Math.max(bb.y2, ext.y2);
      const gw = Math.max(1, maxX - minX);
      const gh = Math.max(1, maxY - minY);
      const scale = Math.min((W - 2 * PAD) / gw, (H - 2 * PAD) / gh);
      const offX = PAD - minX * scale + ((W - 2 * PAD) - gw * scale) / 2;
      const offY = PAD - minY * scale + ((H - 2 * PAD) - gh * scale) / 2;
      transformRef.current = { scale, offX, offY };
      const toMini = (x: number, y: number) => ({ x: x * scale + offX, y: y * scale + offY });
      const ns = nodes.map((n) => {
        const p = n.position();
        return toMini(p.x, p.y);
      });
      const v1 = toMini(ext.x1, ext.y1);
      const v2 = toMini(ext.x2, ext.y2);
      setGeo({ nodes: ns, view: { x: v1.x, y: v1.y, w: v2.x - v1.x, h: v2.y - v1.y } });
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(recompute); };
    cyInstance.on("render pan zoom add remove position", schedule);
    schedule();
    return () => {
      cyInstance.off("render pan zoom add remove position", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [cyRef]);

  const panTo = (clientX: number, clientY: number) => {
    const cy = cyRef.current;
    const svg = svgRef.current;
    const tr = transformRef.current;
    if (!cy || !svg || !tr) return;
    const rect = svg.getBoundingClientRect();
    const modelX = (clientX - rect.left - tr.offX) / tr.scale;
    const modelY = (clientY - rect.top - tr.offY) / tr.scale;
    const z = cy.zoom();
    cy.pan({ x: cy.width() / 2 - modelX * z, y: cy.height() / 2 - modelY * z });
  };

  if (!geo) return null;

  return (
    <svg
      ref={svgRef}
      width={W}
      height={H}
      data-testid="graph-minimap"
      className="glass-panel absolute bottom-9 right-3 z-10 cursor-pointer rounded-md"
      onPointerDown={(e) => {
        draggingRef.current = true;
        (e.target as SVGElement).setPointerCapture?.(e.pointerId);
        panTo(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => { if (draggingRef.current) panTo(e.clientX, e.clientY); }}
      onPointerUp={() => { draggingRef.current = false; }}
      role="img"
      aria-label="Graph minimap - click to pan"
    >
      {geo.nodes.map((n, i) => (
        <circle key={i} cx={n.x} cy={n.y} r={1.5} fill="var(--text-subtle)" opacity={0.7} />
      ))}
      <rect
        x={geo.view.x}
        y={geo.view.y}
        width={Math.max(4, geo.view.w)}
        height={Math.max(4, geo.view.h)}
        fill="var(--primary)"
        fillOpacity={0.12}
        stroke="var(--primary)"
        strokeWidth={1}
        rx={2}
      />
    </svg>
  );
}
