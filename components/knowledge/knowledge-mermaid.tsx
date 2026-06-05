"use client";

/**
 * KnowledgeMermaid — the knowledge-graph flavour of the shared
 * `<MermaidDiagram>`: a backend-provided diagram (Phase D contract #5) whose
 * nodes deep-link into the node-dossier drawer.
 *
 * The wiring: the BE ships `mermaid` (a ready-to-render source string) plus
 * `mermaid_nodes` mapping a diagram token (e.g. `svc_api`) → a KG `node_id`.
 * This component just binds that map to the dossier opener and hands both to
 * the canonical renderer in `components/ui/mermaid-diagram.tsx` — so the
 * rendering mechanic, theme, and polish stay identical everywhere diagrams
 * appear. All the Mermaid machinery (dynamic import, strict-mode SVG +
 * post-render node wiring, theme-aware re-render, graceful fallback) lives
 * there.
 */

import { MermaidDiagram } from "@/components/ui/mermaid-diagram";
import { useNodeDossier } from "@/components/knowledge/node-dossier-context";

interface KnowledgeMermaidProps {
  chart: string;
  /** diagram token → KG node_id. Tokens not in the map render inert. */
  nodeMap?: Record<string, string> | null | undefined;
  className?: string | undefined;
  /** Accessible label for the diagram container. */
  ariaLabel?: string | undefined;
}

export function KnowledgeMermaid({ chart, nodeMap, className, ariaLabel = "Architecture diagram" }: KnowledgeMermaidProps) {
  const { open } = useNodeDossier();
  return (
    <MermaidDiagram
      chart={chart}
      nodeMap={nodeMap}
      onNodeSelect={open}
      className={className}
      ariaLabel={ariaLabel}
      testId="knowledge-mermaid"
    />
  );
}
