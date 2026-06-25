"use client";

/**
 * KnowledgeGraph - the one interactive graph surface, on Cytoscape.js. Shared
 * by the topology explorer (repo / domain) and the org entity graph
 * (`<OrgKnowledgeGraph>` on the org Topology tab). Replaces the React-Flow
 * `KnowledgeGraphCanvas`.
 *
 * Why Cytoscape: native compound nodes (the containment spine org ▸ cap ▸ repo
 * ▸ module ▸ file), a rock-solid tap/hover event model, and compound-aware
 * layouts (fcose / dagre). The whole thing is driven imperatively against one
 * `cy` instance:
 *
 *   • Elements are DIFFED, never re-created - a data refresh that changes
 *     nothing is a no-op, so the viewport, selection and zoom are untouched.
 *     This is the root fix for the old "refreshes every few seconds" flicker.
 *   • A layout runs ONLY when the visible element SET changes (expand / collapse
 *     / new data); selection, hover, focus and theme never relayout. On an
 *     incremental change the pre-existing nodes are pinned so the picture grows
 *     in place instead of reshuffling.
 *   • Selection / hover / blast-radius are pure class toggles applied in a
 *     `cy.batch`, so they're instant and never touch React state per frame.
 *
 * Containment is nesting (`GraphNode.parent`); "collapse" folds a subtree to
 * its box via the pure filter in `graph-data.ts`, and edges to folded children
 * reroute to the box (aggregated). Tokens are resolved to concrete colors per
 * theme (`graph-theme.ts`) because canvas can't read `var(--token)`.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import cytoscape from "cytoscape";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  Crosshair,
  Maximize,
  Maximize2,
  Minimize,
  Network,
  Plus,
  Minus,
  Workflow,
} from "lucide-react";

import { cn } from "@/lib/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { registerCytoscapeExtensions } from "@/components/topology/graph/cy-register";
import {
  resolveTheme,
  buildStylesheet,
  EDGE_KINDS,
  kindCategory,
  CATEGORY_VAR,
  CATEGORY_LABEL,
  CATEGORIES,
} from "@/components/topology/graph/graph-theme";
import {
  computeVisible,
  projectLinks,
  pickPrimaryNode,
  type GraphNode,
  type GraphLink,
  type OverlayRole,
} from "@/components/topology/graph/graph-data";
import { GraphMinimap } from "@/components/topology/graph/graph-minimap";

export type { GraphNode, GraphLink, OverlayRole } from "@/components/topology/graph/graph-data";

export interface KnowledgeGraphProps {
  nodes: GraphNode[];
  links: GraphLink[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Force-fetch a node's neighbours (double-click a leaf / stub with nothing
   *  loaded). Compound nodes that already hold children toggle collapse instead. */
  onExpand?: (id: string) => void;
  /** Zoom-to this node id when it changes (search-to-focus / deep-link). */
  focusId?: string | null;
  /** Blast-radius overlay: node id → role. */
  overlay?: Map<string, OverlayRole> | null;
  height?: number;
  /** Fill the parent's height instead of using a fixed `height` - the graph
   *  becomes a flex column (canvas grows, legend pinned). Used by the topology
   *  explorer's full-screen mode so the canvas fills the viewport. */
  fill?: boolean;
  /** When provided, a full-screen toggle button is shown top-right; `fullscreen`
   *  drives its icon/label. The caller owns the actual full-screen layout. */
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  /** Default layout engine. */
  layout?: "cose" | "dagre";
  showMinimap?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  wrapperTestId?: string;
  emptyTestId?: string;
  /** Caller-controlled "loading neighbours" pill. */
  busy?: boolean;
}

function edgeId(l: GraphLink): string {
  return `e:${l.source}__${l.target}__${l.kind ?? ""}`;
}

/** fcose / dagre option blocks. `fixed` pins pre-existing nodes on an
 *  incremental layout so new nodes flow in around a stable picture. */
function layoutOptions(
  name: "cose" | "dagre",
  fit: boolean,
  animate: boolean,
  fixed: Array<{ nodeId: string; position: cytoscape.Position }>,
): Record<string, unknown> {
  if (name === "dagre") {
    return {
      name: "dagre",
      rankDir: "TB",
      nodeSep: 52,
      rankSep: 78,
      edgeSep: 16,
      ranker: "network-simplex",
      animate,
      animationDuration: animate ? 300 : 0,
      fit,
      padding: 40,
    };
  }
  return {
    name: "fcose",
    quality: "default",
    randomize: fixed.length === 0,
    animate,
    animationDuration: animate ? 320 : 0,
    fit,
    padding: 38,
    nodeSeparation: 80,
    idealEdgeLength: 90,
    nodeRepulsion: 7000,
    gravity: 0.32,
    gravityCompound: 1.0,
    nestingFactor: 0.12,
    numIter: 1800,
    tile: true,
    packComponents: true,
    ...(fixed.length ? { fixedNodeConstraint: fixed } : {}),
  };
}

export function KnowledgeGraph(props: KnowledgeGraphProps) {
  const {
    nodes,
    links,
    selectedId = null,
    onSelect,
    onExpand,
    focusId = null,
    overlay = null,
    height = 520,
    fill = false,
    fullscreen = false,
    onToggleFullscreen,
    layout: initialLayout = "dagre",
    showMinimap = false,
    emptyTitle = "No topology yet",
    emptyDescription = "Connect a repo and run ingestion to populate this view.",
    wrapperTestId = "knowledge-graph",
    emptyTestId = "knowledge-graph-empty",
    busy = false,
  } = props;

  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [ready, setReady] = useState(false);

  // Props mirrored to refs so the imperative cy handlers read current values
  // without re-binding (and without re-rendering on hover).
  const selectedRef = useRef<string | null>(selectedId);
  const overlayRef = useRef<Map<string, OverlayRole> | null>(overlay);
  const hoverRef = useRef<string | null>(null);
  const onSelectRef = useRef(onSelect);
  const onExpandRef = useRef(onExpand);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { onExpandRef.current = onExpand; }, [onExpand]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hiddenEdgeKinds, setHiddenEdgeKinds] = useState<Set<string>>(new Set());
  const [layoutName, setLayoutName] = useState<"cose" | "dagre">(initialLayout);

  const reduceMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  // Containment tree from node.parent (honoured only when the parent is also in
  // the set). The component is fed a flat node list + parent pointers.
  const parentOf = useMemo(() => {
    const ids = new Set(nodes.map((n) => n.id));
    const m = new Map<string, string>();
    for (const n of nodes) if (n.parent && n.parent !== n.id && ids.has(n.parent)) m.set(n.id, n.parent);
    return m;
  }, [nodes]);

  const parentIds = useMemo(() => new Set(parentOf.values()), [parentOf]);

  const { visible, hiddenCount } = useMemo(
    () => computeVisible(nodes, parentOf, collapsed),
    [nodes, parentOf, collapsed],
  );

  // Visible, collapse-projected edges (rerouted to the nearest visible box +
  // aggregated), then the edge-kind filter from the legend.
  const visLinks = useMemo(() => {
    const projected = projectLinks(links, visible, parentOf);
    return hiddenEdgeKinds.size ? projected.filter((l) => !(l.kind && hiddenEdgeKinds.has(l.kind))) : projected;
  }, [links, visible, parentOf, hiddenEdgeKinds]);

  /* ----------------------------- visual state ---------------------------- */
  const applyVisualState = useCallback(() => {
    const c = cyRef.current;
    if (!c) return;
    c.batch(() => {
      c.elements().removeClass("dim hl sel ov-changed ov-affected ov-on");
      const ov = overlayRef.current;
      if (ov && ov.size) {
        c.nodes().forEach((n) => {
          const role = ov.get(n.id());
          if (role === "changed") n.addClass("ov-changed");
          else if (role === "affected") n.addClass("ov-affected");
          else n.addClass("dim");
        });
        c.edges().forEach((e) => {
          if (ov.get(e.source().id()) && ov.get(e.target().id())) e.addClass("ov-on");
          else e.addClass("dim");
        });
        if (selectedRef.current) c.getElementById(selectedRef.current).addClass("sel");
        return;
      }
      // Hover focuses (dims the rest); selection only rings + lights its own
      // edges - so clicking a node never ghosts the whole map.
      const hover = hoverRef.current;
      if (hover) {
        const node = c.getElementById(hover);
        if (node.nonempty()) {
          const keep = node.closedNeighborhood();
          c.elements().addClass("dim");
          keep.removeClass("dim");
          node.connectedEdges().removeClass("dim").addClass("hl");
        }
      }
      const sel = selectedRef.current ? c.getElementById(selectedRef.current) : null;
      if (sel && sel.nonempty()) {
        sel.addClass("sel");
        if (!hover) sel.connectedEdges().addClass("hl");
      }
    });
  }, []);

  /** Smoothly centre + zoom onto a node - selection, focus deep-links, and the
   *  toolbar button all funnel through here. Zooms IN to a readable level but
   *  never OUT past the current view, so re-selecting just recentres. */
  const focusOn = useCallback((id: string | null) => {
    const c = cyRef.current;
    if (!c || !id) return;
    const node = c.getElementById(id);
    if (node.empty()) return;
    c.animate(
      { center: { eles: node }, zoom: Math.min(1.5, Math.max(c.zoom(), 1.1)) },
      { duration: reduceMotion ? 0 : 360 },
    );
  }, [reduceMotion]);

  /* ------------------------------- mount --------------------------------- */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let instance: cytoscape.Core;
    try {
      registerCytoscapeExtensions();
      instance = cytoscape({
        container,
        style: buildStylesheet(resolveTheme()),
        minZoom: 0.08,
        maxZoom: 2.5,
        wheelSensitivity: 0.2,
        pixelRatio: 1,
        boxSelectionEnabled: false,
        autounselectify: true,
      });
    } catch {
      // No canvas renderer (SSR / jsdom) - the graph chrome still renders.
      return;
    }
    cyRef.current = instance;

    instance.on("tap", "node", (e) => {
      const id = e.target.id();
      selectedRef.current = id;
      onSelectRef.current?.(id);
    });
    instance.on("tap", (e) => {
      if (e.target === instance) {
        selectedRef.current = null;
        onSelectRef.current?.(null);
      }
    });
    instance.on("dbltap", "node", (e) => {
      const node = e.target as cytoscape.NodeSingular;
      const id = node.id();
      if (node.isParent() || node.data("hasKids")) {
        setCollapsed((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      } else {
        onExpandRef.current?.(id);
      }
    });
    instance.on("mouseover", "node", (e) => {
      hoverRef.current = e.target.id();
      applyVisualState();
      if (containerRef.current) containerRef.current.style.cursor = "pointer";
    });
    instance.on("mouseout", "node", () => {
      hoverRef.current = null;
      applyVisualState();
      if (containerRef.current) containerRef.current.style.cursor = "";
    });

    setReady(true);
    return () => {
      try {
        instance.destroy();
      } catch {
        /* already torn down */
      }
      cyRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------- theme (re)styling --------------------------- */
  useEffect(() => {
    if (!cyRef.current || !ready) return;
    const rebuild = () => {
      const c = cyRef.current;
      if (!c) return;
      c.style(buildStylesheet(resolveTheme()));
      applyVisualState();
    };
    rebuild();
    // Self-heal: re-resolve shortly after, in case tokens / the `.dark` class
    // settled just after this ran (otherwise a light-built sheet sticks in a
    // dark app). setTimeout (not rAF) so it still fires in a backgrounded tab.
    const t = setTimeout(rebuild, 80);
    // Catch live theme toggles - next-themes flips the <html> class.
    const obs = typeof MutationObserver !== "undefined" ? new MutationObserver(rebuild) : null;
    obs?.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    return () => { clearTimeout(t); obs?.disconnect(); };
  }, [resolvedTheme, ready, applyVisualState]);

  /* --------------------- element diff + relayout ------------------------- */
  const structureRef = useRef<string>("");
  // Set by a user-initiated relayout that switches the layout engine: it runs
  // its own layout explicitly, so the structure effect must adopt the new key
  // WITHOUT firing a second, node-pinning relayout that would freeze it.
  const skipNextLayoutRef = useRef(false);
  useEffect(() => {
    const c = cyRef.current;
    if (!c || !ready) return;

    // Desired element set. Flat nodes (NO compound nesting - that was the ugly
    // dashed-box stack); containment is drawn as faint parent→child connectors
    // so the graph reads as one clean layered diagram.
    const nodeDefs: cytoscape.ElementDefinition[] = [];
    for (const n of nodes) {
      if (!visible.has(n.id)) continue;
      const folded = hiddenCount.get(n.id) ?? 0;
      const label = folded > 0 ? `${n.label}  +${folded}` : n.label;
      nodeDefs.push({
        group: "nodes",
        data: {
          id: n.id,
          label,
          kind: (n.kind || "").toLowerCase(),
          ...(n.stub ? { stub: 1 } : {}),
          hasKids: parentIds.has(n.id) ? 1 : 0,
        },
      });
    }

    const edgeDefs: cytoscape.ElementDefinition[] = [];
    // Structural containment → faint connectors (the tree spine), no arrow.
    for (const n of nodes) {
      if (!visible.has(n.id)) continue;
      const p = n.parent;
      if (p && visible.has(p) && !collapsed.has(p)) {
        edgeDefs.push({ group: "edges", data: { id: `c:${p}__${n.id}`, source: p, target: n.id, kind: "contains" } });
      }
    }
    // Behavioral edges (collapse-rerouted + aggregated).
    for (const l of visLinks) {
      const base = (l.kind ?? "").replace(/_/g, " ");
      edgeDefs.push({
        group: "edges",
        data: {
          id: edgeId(l),
          source: l.source,
          target: l.target,
          kind: l.kind ?? "",
          kindLabel: l.rolledUp && l.weight && l.weight > 1 ? `${base} ×${l.weight}` : base,
          ...(l.dashed ? { dashed: 1 } : {}),
          ...(l.rolledUp ? { rolledUp: 1, weight: l.weight ?? 1 } : {}),
        },
      });
    }

    const want = new Map<string, cytoscape.ElementDefinition>();
    for (const d of nodeDefs) want.set(String(d.data.id), d);
    for (const d of edgeDefs) want.set(String(d.data.id), d);

    c.batch(() => {
      // Remove gone.
      c.elements().forEach((ele) => { if (!want.has(ele.id())) ele.remove(); });
      // Add new / update existing.
      const toAddNodes: cytoscape.ElementDefinition[] = [];
      const toAddEdges: cytoscape.ElementDefinition[] = [];
      for (const d of nodeDefs) {
        const ex = c.getElementById(String(d.data.id));
        if (ex.empty()) { toAddNodes.push(d); continue; }
        const wantParent = (d.data.parent as string | undefined) ?? null;
        if ((ex.data("parent") ?? null) !== wantParent) ex.move({ parent: wantParent });
        ex.data(d.data);
      }
      for (const d of edgeDefs) {
        const ex = c.getElementById(String(d.data.id));
        if (ex.empty()) toAddEdges.push(d);
        else ex.data(d.data);
      }
      if (toAddNodes.length) c.add(toAddNodes);
      if (toAddEdges.length) c.add(toAddEdges);
    });

    // Auto-relayout on every structural change: whenever the visible element
    // set changes (expand / collapse / new data) run a FULL layout that re-fits
    // the whole graph with NO node pinning, so the picture reflows cleanly each
    // time rather than squeezing new nodes around a frozen arrangement.
    const key = `${layoutName}|${[...want.keys()].sort().join(",")}`;
    if (key !== structureRef.current) {
      structureRef.current = key;
      if (skipNextLayoutRef.current) {
        // a user-initiated relayout already ran its own layout - adopt the new
        // structure key but don't run a second one over it.
        skipNextLayoutRef.current = false;
      } else {
        c.layout(layoutOptions(layoutName, true, !reduceMotion, []) as unknown as cytoscape.LayoutOptions).run();
      }
    }
    applyVisualState();
  }, [nodes, visLinks, visible, hiddenCount, parentOf, parentIds, collapsed, layoutName, ready, reduceMotion, applyVisualState]);

  /* ----------------------------- selection ------------------------------- */
  // Selecting a node (click / tree / search) rings it AND flies to it - focus
  // follows selection everywhere.
  useEffect(() => {
    selectedRef.current = selectedId;
    if (ready) {
      applyVisualState();
      focusOn(selectedId);
    }
  }, [selectedId, ready, applyVisualState, focusOn]);

  useEffect(() => {
    overlayRef.current = overlay;
    if (ready) applyVisualState();
  }, [overlay, ready, applyVisualState]);

  /* ------------------------------- focus --------------------------------- */
  // Explicit focus target (e.g. the repo Topology tab's `?focus=` deep-link
  // from "Open in graph"). Selection-driven focus is handled above; this
  // covers a focus target with no selection.
  useEffect(() => {
    if (ready) focusOn(focusId);
  }, [focusId, ready, focusOn]);

  /* ----------------------- auto-focus the anchor ------------------------- */
  // On first load with nothing selected / deep-linked, focus the most-central
  // top-most node, so the view opens on the system's hub rather than blank.
  const didAutoFocusRef = useRef(false);
  useEffect(() => {
    if (!ready || didAutoFocusRef.current || nodes.length === 0) return;
    if (selectedId || focusId) { didAutoFocusRef.current = true; return; } // deep-link / selection wins
    const primary = pickPrimaryNode(nodes);
    if (primary) {
      didAutoFocusRef.current = true;
      onSelectRef.current?.(primary);
    }
  }, [ready, selectedId, focusId, nodes]);

  /* ------------------------------ resize --------------------------------- */
  useEffect(() => {
    const c = cyRef.current;
    const el = containerRef.current;
    if (!c || !ready || !el || typeof ResizeObserver === "undefined") return;
    let lastH = el.clientHeight;
    const ro = new ResizeObserver(() => {
      c.resize();
      const h = el.clientHeight;
      // Container went from collapsed → sized (e.g. mounted in a hidden tab):
      // the initial fit was against 0px, so re-fit now that it has height.
      if (lastH === 0 && h > 0) c.fit(undefined, 38);
      lastH = h;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  /* ------------------------------ controls ------------------------------- */
  const zoomBy = (factor: number) => {
    const c = cyRef.current;
    if (!c) return;
    c.animate({ zoom: c.zoom() * factor, center: { eles: c.elements() } }, { duration: reduceMotion ? 0 : 160 });
  };
  const fit = () => cyRef.current?.animate({ fit: { eles: cyRef.current.elements(), padding: 38 } }, { duration: reduceMotion ? 0 : 200 });
  const zoomToSelected = () => focusOn(selectedId);
  const relayout = () => {
    const c = cyRef.current;
    if (!c) return;
    // "Re-run layout" = a fresh FORCE pass that physically re-organises the graph
    // from any state. The layered (`dagre`) layout is DETERMINISTIC - re-running
    // it lands every node back on its mark, so it reads as a dead button - so
    // Relayout always runs the force engine (`fcose`, randomised: `fixed=[]`) and
    // switches the mode to match (the Layout toggle restores layered). Switching
    // the engine would normally trigger the structure effect to re-run a SECOND,
    // node-pinning layout that fights this one, so flag it to stand down.
    if (layoutName !== "cose") {
      skipNextLayoutRef.current = true;
      setLayoutName("cose");
    }
    c.layout(layoutOptions("cose", true, !reduceMotion, []) as unknown as cytoscape.LayoutOptions).run();
  };
  const collapseAll = () => setCollapsed(new Set(parentIds));
  const expandAll = () => setCollapsed(new Set());
  const toggleLayout = () => setLayoutName((l) => (l === "cose" ? "dagre" : "cose"));
  const toggleEdgeKind = (k: string) =>
    setHiddenEdgeKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });

  const presentEdgeKinds = useMemo(
    () => EDGE_KINDS.filter((k) => links.some((l) => l.kind === k)),
    [links],
  );
  const presentCategories = useMemo(() => {
    const s = new Set<string>();
    for (const n of nodes) s.add(kindCategory(n.kind));
    return CATEGORIES.filter((c) => s.has(c));
  }, [nodes]);

  if (nodes.length === 0) {
    return (
      <div
        data-testid={emptyTestId}
        style={fill ? undefined : { height }}
        className={cn("overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]", fill && "h-full")}
      >
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  return (
    <div
      data-testid={wrapperTestId}
      className={cn(
        "overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]",
        fill && "flex h-full flex-col",
      )}
    >
      <div
        className={cn("relative", fill && "min-h-0 flex-1")}
        style={fill ? undefined : { height, width: "100%" }}
      >
        {/* Cytoscape forces `position: relative` on its container, which defeats
            `absolute inset-0` (height collapses to 0 → blank canvas). Give it an
            explicit height that resolves against the sized parent instead. */}
        <div ref={containerRef} data-testid={`${wrapperTestId}-canvas`} style={{ width: "100%", height: "100%" }} />

        {/* full-screen toggle - top-right, opt-in (caller owns the layout) */}
        {onToggleFullscreen && (
          <div className="absolute right-3 top-3 z-10">
            <button
              type="button"
              onClick={onToggleFullscreen}
              title={fullscreen ? "Exit full screen (Esc)" : "Full screen"}
              aria-label={fullscreen ? "Exit full screen" : "Full screen"}
              aria-pressed={fullscreen}
              data-testid="graph-fullscreen-toggle"
              className="flex size-8 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)]/90 text-[var(--text-muted)] shadow-[var(--shadow-2)] backdrop-blur-sm transition-colors duration-150 ease-out hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              {fullscreen ? <Minimize className="size-4" aria-hidden /> : <Maximize className="size-4" aria-hidden />}
            </button>
          </div>
        )}

        {/* status + hint - top-left, stacked so they never fight a corner */}
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-5rem)] flex-col items-start gap-1.5">
          {busy && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[10px] text-[var(--text-muted)] shadow-[var(--shadow-1)]">
              <span className="size-2.5 animate-spin rounded-full border border-[var(--primary)] border-t-transparent" aria-hidden />
              Loading neighbours…
            </span>
          )}
          <span className="rounded-md border border-[var(--border)] bg-[var(--surface)]/85 px-2 py-0.5 text-[10px] text-[var(--text-subtle)] shadow-[var(--shadow-1)]">
            click to focus · double-click to expand / collapse · drag to pan
          </span>
        </div>

        {/* controls - bottom toolbar, labelled (bottom-right is the minimap) */}
        <div className="absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-0.5 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]/90 p-1 shadow-[var(--shadow-2)] backdrop-blur-sm [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ToolButton title="Zoom in" label="Zoom in" onClick={() => zoomBy(1.3)}><Plus className="size-4" /></ToolButton>
          <ToolButton title="Zoom out" label="Zoom out" onClick={() => zoomBy(1 / 1.3)}><Minus className="size-4" /></ToolButton>
          <ToolButton title="Fit to view" label="Fit" onClick={fit}><Maximize2 className="size-4" /></ToolButton>
          {selectedId && (
            <ToolButton title="Zoom to selection" label="Center" onClick={zoomToSelected}><Crosshair className="size-4" /></ToolButton>
          )}
          <span className="mx-0.5 h-5 w-px shrink-0 bg-[var(--border)]" aria-hidden />
          <ToolButton title="Re-run layout" label="Relayout" onClick={relayout}><Network className="size-4" /></ToolButton>
          <ToolButton title={layoutName === "cose" ? "Switch to layered layout" : "Switch to force layout"} label="Layout" onClick={toggleLayout} active={layoutName === "cose"}>
            <Workflow className="size-4" />
          </ToolButton>
          {parentIds.size > 0 && (
            collapsed.size > 0 ? (
              <ToolButton title="Expand all" label="Expand" onClick={expandAll}><ChevronsUpDown className="size-4" /></ToolButton>
            ) : (
              <ToolButton title="Collapse all" label="Collapse" onClick={collapseAll}><ChevronsDownUp className="size-4" /></ToolButton>
            )
          )}
        </div>

        {showMinimap && ready && <GraphMinimap cyRef={cyRef} />}
      </div>

      {/* legend + edge filter */}
      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] px-3 py-1.5 text-[10px] text-[var(--text-muted)]">
        {presentCategories.map((c) => (
          <span key={c} className="inline-flex items-center gap-1">
            <span className="inline-block size-2 rounded-full" style={{ background: `var(${CATEGORY_VAR[c]})`, opacity: 0.9 }} />
            <span>{CATEGORY_LABEL[c]}</span>
          </span>
        ))}
        {presentEdgeKinds.length > 0 && (
          <span className="inline-flex flex-wrap items-center gap-2 border-l border-[var(--border)] pl-3">
            <span className="text-[var(--text-subtle)]">edges</span>
            {presentEdgeKinds.map((k) => {
              const hidden = hiddenEdgeKinds.has(k);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => toggleEdgeKind(k)}
                  aria-pressed={!hidden}
                  data-testid={`edge-legend-${k}`}
                  title={hidden ? "Show these edges" : "Hide these edges"}
                  className={`inline-flex items-center gap-1 rounded px-1 hover:bg-[var(--surface-2)] ${hidden ? "opacity-40 line-through" : ""}`}
                >
                  <span className="inline-block h-[2px] w-3 rounded" style={{ background: "var(--border-strong)" }} />
                  <span>{k.replace(/_/g, " ")}</span>
                </button>
              );
            })}
          </span>
        )}
        <span className="ml-auto tabular-nums text-[var(--text-subtle)]">
          {nodes.length} node{nodes.length === 1 ? "" : "s"} · {links.length} edge{links.length === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}

function ToolButton({
  title,
  label,
  onClick,
  active,
  children,
}: {
  title: string;
  label?: string;
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium",
        "transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        active
          ? "bg-[var(--primary-soft)] text-[var(--primary)]"
          : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
      )}
    >
      {children}
      {label && <span className="whitespace-nowrap">{label}</span>}
    </button>
  );
}
