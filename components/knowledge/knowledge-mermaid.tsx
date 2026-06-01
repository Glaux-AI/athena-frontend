"use client";

/**
 * KnowledgeMermaid — renders a backend-provided Mermaid diagram (Phase D
 * contract #5) with CLICKABLE diagram nodes that deep-link into the shared
 * node-dossier drawer.
 *
 * The wiring: the BE ships `mermaid` (a ready-to-render source string) plus
 * `mermaid_nodes` mapping a diagram token (the id used inside the Mermaid
 * source, e.g. `svc_api`) → a KG `node_id`. Mermaid runs at
 * `securityLevel: "strict"`, which strips its own `click` directives, so we
 * render to SVG and then post-process the DOM: every node whose token is in
 * the map gets a pointer cursor + a click handler that opens the dossier.
 *
 * Mirrors the existing Mermaid renderer in `chat-markdown.tsx` (dynamic
 * import, theme-aware, parse-before-render, graceful raw-source fallback).
 */

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/cn";
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
  const ref = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const { open } = useNodeDossier();
  const [error, setError] = useState(false);
  // Keep the latest map + opener in refs so the post-render wiring effect
  // doesn't re-run (and re-render the diagram) on every parent re-render.
  const mapRef = useRef<Record<string, string>>({});
  const openRef = useRef(open);
  mapRef.current = nodeMap ?? {};
  openRef.current = open;

  useEffect(() => {
    let cancelled = false;
    const cleanups: Array<() => void> = [];
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const mermaid = (await import("mermaid")).default;
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            suppressErrorRendering: true,
            theme: resolvedTheme === "dark" ? "dark" : "neutral",
            fontFamily: "inherit",
          });
          if (typeof mermaid.parse === "function") {
            const valid = await mermaid.parse(chart, { suppressErrors: true });
            if (cancelled) return;
            if (!valid) { setError(true); return; }
          }
          const id = `kmmd-${Math.random().toString(36).slice(2)}`;
          const { svg } = await mermaid.render(id, chart);
          if (cancelled || !ref.current) return;
          ref.current.innerHTML = svg;
          setError(false);

          // Wire clickable nodes. Mermaid emits node groups as
          // `<g class="node" id="flowchart-<token>-<n>">`; we match the
          // token segment against the map.
          const map = mapRef.current;
          const tokens = Object.keys(map);
          if (tokens.length === 0) return;
          const nodeEls = ref.current.querySelectorAll<SVGGElement>("g.node");
          nodeEls.forEach((el) => {
            const token = matchToken(el.id, tokens);
            if (!token) return;
            const nodeId = map[token]!;
            el.style.cursor = "pointer";
            el.setAttribute("data-node-id", nodeId);
            el.setAttribute("tabindex", "0");
            el.setAttribute("role", "button");
            const onClick = () => openRef.current(nodeId);
            const onKey = (e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openRef.current(nodeId); }
            };
            el.addEventListener("click", onClick);
            el.addEventListener("keydown", onKey as EventListener);
            cleanups.push(() => {
              el.removeEventListener("click", onClick);
              el.removeEventListener("keydown", onKey as EventListener);
            });
          });
        } catch {
          if (!cancelled) setError(true);
        }
      })();
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      for (const c of cleanups) c();
    };
  }, [chart, resolvedTheme]);

  if (error) {
    return (
      <pre className={cn("overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--code-bg)] p-3 text-[0.8rem]", className)}>
        <code className="font-mono">{chart}</code>
      </pre>
    );
  }

  return (
    <div
      ref={ref}
      role="img"
      aria-label={ariaLabel}
      data-testid="knowledge-mermaid"
      className={cn(
        "flex justify-center overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3",
        "[&_svg]:h-auto [&_svg]:max-w-full",
        "[&_g.node[data-node-id]:hover]:opacity-80",
        "[&_g.node[data-node-id]]:transition-opacity",
        className,
      )}
    />
  );
}

/** Mermaid node ids look like `flowchart-<token>-<n>` (or sometimes just
 *  `<token>`). Return the map token that appears as a dash-delimited segment
 *  of the element id, preferring the longest match so `svc_api` wins over a
 *  hypothetical `svc`. */
function matchToken(elementId: string, tokens: string[]): string | null {
  if (!elementId) return null;
  const segments = elementId.split("-");
  let best: string | null = null;
  for (const t of tokens) {
    if (segments.includes(t) || elementId === t) {
      if (best === null || t.length > best.length) best = t;
    }
  }
  return best;
}
