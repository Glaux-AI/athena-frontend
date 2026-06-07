"use client";

/**
 * TopologyExplorer — the unified, search-driven, on-demand topology surface
 * shared by every scope (repo / domain / org). Composition only: the
 * <ExplorerProvider> owns the one selection that every part syncs to, and the
 * leaves (search bar → graph + structure tree → detail panel) all read/write it.
 *
 * The page passes a scope `seed` (synthetic root + 1-hop children, built from
 * data it already loaded) plus the scope kind + ids for search. Everything else
 * — focus, neighbour expansion, the dossier below — is driven from the single
 * selection inside.
 *
 * Full screen: the graph's top-right toggle lifts this surface into a fixed
 * overlay where the graph takes the left (70% by default) and the detail panel
 * the right (30%); a draggable divider re-splits them. The transition is a
 * shared-element (FLIP) move: search / graph / detail keep their identity in the
 * React tree (one grid, grid-areas re-place them) so the SAME elements visibly
 * grow / travel from their normal spots to the full-screen ones — the graph
 * enlarges in place, the bottom detail panel slides up into the right column —
 * rather than new panels fading in. The live Cytoscape instance never remounts.
 * Only a dimming backdrop fades. `prefers-reduced-motion` snaps with no motion.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { SearchScope } from "@/lib/api/client";
import { cn } from "@/lib/cn";

import { ExplorerProvider } from "@/components/topology/explorer/explorer-store";
import { ExplorerSearchBar } from "@/components/topology/explorer/explorer-search-bar";
import { ExplorerGraphPanel } from "@/components/topology/explorer/explorer-graph-panel";
import { ExplorerDetailPanel } from "@/components/topology/explorer/explorer-detail-panel";
import { ContainmentTree } from "@/components/topology/explorer/containment-tree";
import type { Seed } from "@/components/topology/explorer/explorer-graph";

interface TopologyExplorerProps {
  seed: Seed;
  scope: SearchScope;
  domainId?: string | undefined;
  repoId?: string | undefined;
  graphHeight?: number;
}

/** Move duration — long enough (0.6 s) that the whole expand-and-dock reads. */
const ANIM_MS = 600;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Full-screen split: graph keeps `leftPct`% of the row, the detail panel the
 *  rest. Default 70 / 30; the divider is draggable between these bounds. */
const SPLIT_MIN = 50;
const SPLIT_MAX = 82;
const SPLIT_DEFAULT = 70;
const clampSplit = (p: number) => Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, p));

type Rects = Record<string, DOMRect>;

/** FLIP "invert" — transform `el` so it APPEARS at `from` while it actually sits
 *  at its current (`to`) layout box. Played to identity, it glides from→to. */
function invert(el: HTMLElement, from: DOMRect, to: DOMRect, animate: boolean) {
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  const sx = to.width ? from.width / to.width : 1;
  const sy = to.height ? from.height / to.height : 1;
  el.style.transformOrigin = "top left";
  el.style.transition = animate ? `transform ${ANIM_MS}ms ${EASE}` : "none";
  el.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
}
function clearFlip(el: HTMLElement) {
  el.style.transition = "";
  el.style.transform = "";
  el.style.transformOrigin = "";
}

export function TopologyExplorer({ seed, scope, domainId, repoId, graphHeight = 520 }: TopologyExplorerProps) {
  // `fullscreen` = the overlay is mounted (true while open AND while closing);
  // `entered` only drives the dimming backdrop's fade (the panels move via FLIP).
  const [fullscreen, setFullscreen] = useState(false);
  const [entered, setEntered] = useState(false);
  const [leftPct, setLeftPct] = useState(SPLIT_DEFAULT);
  const [isDesktop, setIsDesktop] = useState(true);

  const fullscreenRef = useRef(false);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<HTMLDivElement | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);
  const oldRectsRef = useRef<Rects | null>(null); // normal-layout rects, captured on enter
  const draggingRef = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flipClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { fullscreenRef.current = fullscreen; }, [fullscreen]);

  const reduceMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  // Track the lg breakpoint so the grid template (set inline because the split
  // is dynamic) matches the responsive layout.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  /** Run `fn` for each FLIP-tracked wrapper that's mounted. */
  const eachEl = useCallback((fn: (key: string, el: HTMLElement) => void) => {
    if (searchRef.current) fn("search", searchRef.current);
    if (graphRef.current) fn("graph", graphRef.current);
    if (detailRef.current) fn("detail", detailRef.current);
  }, []);

  const enter = useCallback(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    restoreFocusRef.current = (document.activeElement as HTMLElement) ?? null;
    // First: snapshot the normal-layout rects to FLIP from.
    const r: Rects = {};
    eachEl((k, el) => { r[k] = el.getBoundingClientRect(); });
    oldRectsRef.current = r;
    setFullscreen(true);
  }, [eachEl]);

  const exit = useCallback(() => {
    setEntered(false); // fade the backdrop back out
    if (reduceMotion || !oldRectsRef.current) {
      setFullscreen(false);
      restoreFocusRef.current?.focus?.();
      return;
    }
    // Reverse FLIP: the panels sit at their full-screen boxes now (identity);
    // animate them back to the stored normal rects, then unmount the overlay.
    const from = oldRectsRef.current;
    if (flipClearTimer.current) clearTimeout(flipClearTimer.current);
    eachEl((k, el) => { const f = from[k]; if (f) invert(el, f, el.getBoundingClientRect(), true); });
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setFullscreen(false);
      restoreFocusRef.current?.focus?.();
    }, ANIM_MS);
  }, [reduceMotion, eachEl]);

  const toggleFullscreen = useCallback(() => {
    if (fullscreenRef.current) exit();
    else enter();
  }, [enter, exit]);

  // FLIP play (enter) / cleanup (after exit). useLayoutEffect so the inverted
  // (start-at-old) transform is committed before the browser paints the new box.
  useLayoutEffect(() => {
    if (!fullscreen) { eachEl((_k, el) => clearFlip(el)); return; }
    if (reduceMotion || !oldRectsRef.current) return;
    const from = oldRectsRef.current;
    if (flipClearTimer.current) clearTimeout(flipClearTimer.current);
    // Last: measure the new boxes, then invert each to appear at the old box.
    eachEl((k, el) => { const f = from[k]; if (f) invert(el, f, el.getBoundingClientRect(), false); });
    void rootRef.current?.offsetWidth; // force reflow so the inverted state sticks
    const raf = requestAnimationFrame(() => {
      eachEl((k, el) => {
        if (!from[k]) return;
        el.style.transition = `transform ${ANIM_MS}ms ${EASE}`;
        el.style.transform = "";
      });
    });
    flipClearTimer.current = setTimeout(() => eachEl((_k, el) => clearFlip(el)), ANIM_MS + 60);
    return () => cancelAnimationFrame(raf);
  }, [fullscreen, reduceMotion, eachEl]);

  // Backdrop fade-in + Esc + scroll lock + focus, while the overlay is open.
  useEffect(() => {
    if (!fullscreen) { setEntered(false); return; }
    let raf = 0;
    if (reduceMotion) setEntered(true);
    else raf = requestAnimationFrame(() => setEntered(true));

    rootRef.current?.focus?.();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); exit(); } };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [fullscreen, reduceMotion, exit]);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (flipClearTimer.current) clearTimeout(flipClearTimer.current);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }, []);

  // Divider drag — translate pointer-x into a clamped split across the row span
  // (graph's left → detail's right, fixed for the gesture). The graph's
  // ResizeObserver reflows the canvas live as the columns change.
  const startResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const g = graphRef.current, d = detailRef.current;
    if (!g || !d) return;
    const rowLeft = g.getBoundingClientRect().left;
    const span = d.getBoundingClientRect().right - rowLeft;
    if (span <= 0) return;
    draggingRef.current = true;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const onMove = (ev: PointerEvent) => {
      if (!draggingRef.current) return;
      setLeftPct(clampSplit(((ev.clientX - rowLeft) / span) * 100));
    };
    const onUp = () => {
      draggingRef.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  const onHandleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); setLeftPct((p) => clampSplit(p - 2)); }
    else if (e.key === "ArrowRight") { e.preventDefault(); setLeftPct((p) => clampSplit(p + 2)); }
    else if (e.key === "Home") { e.preventDefault(); setLeftPct(SPLIT_DEFAULT); }
  }, []);

  // Grid template — inline because the full-screen split is dynamic. Areas keep
  // the same names across modes so each child just re-places (→ FLIP-able).
  const gridStyle: React.CSSProperties = fullscreen
    ? isDesktop
      ? {
          gridTemplateColumns: `${leftPct}fr 0.75rem ${100 - leftPct}fr`,
          gridTemplateRows: "auto minmax(0, 1fr)",
          gridTemplateAreas: `"search search search" "graph divider detail"`,
        }
      : {
          gridTemplateRows: "auto minmax(0, 1fr) minmax(0, 14rem)",
          gridTemplateAreas: `"search" "graph" "detail"`,
        }
    : isDesktop
      ? {
          gridTemplateColumns: "minmax(0, 1fr) 300px",
          gridTemplateAreas: `"search search" "graph tree" "detail detail"`,
        }
      : { gridTemplateAreas: `"search" "graph" "tree" "detail"` };

  return (
    <ExplorerProvider seed={seed}>
      <div
        ref={rootRef}
        data-testid="topology-explorer"
        data-fullscreen={fullscreen ? "" : undefined}
        role={fullscreen ? "dialog" : undefined}
        aria-modal={fullscreen ? true : undefined}
        aria-label={fullscreen ? "Topology — full screen" : undefined}
        tabIndex={fullscreen ? -1 : undefined}
        className={cn(
          "grid outline-none",
          fullscreen ? "fixed inset-0 z-50 gap-3 overflow-hidden p-4 sm:p-6 lg:gap-x-0" : "gap-4",
        )}
        style={gridStyle}
      >
        {/* dimming backdrop — the only thing that fades; the panels MOVE */}
        {fullscreen && (
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 -z-10 bg-[var(--bg)]/95 backdrop-blur-xl",
              "transition-opacity duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
              entered ? "opacity-100" : "opacity-0",
            )}
          />
        )}

        <div ref={searchRef} className="[grid-area:search] min-w-0">
          <ExplorerSearchBar scope={scope} domainId={domainId} repoId={repoId} />
        </div>

        {/* graph — grows into the left column */}
        <div ref={graphRef} className="[grid-area:graph] min-h-0 min-w-0 will-change-transform">
          <ExplorerGraphPanel height={graphHeight} fullscreen={fullscreen} onToggleFullscreen={toggleFullscreen} />
        </div>

        {/* structure tree — normal layout only (hidden in full screen) */}
        {!fullscreen && (
          <div className="[grid-area:tree] min-h-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] shadow-[var(--shadow-2)]">
            <div className="border-b border-[var(--border)] bg-gradient-to-b from-[var(--surface-2)] to-transparent px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)] shadow-[var(--inner-highlight)]">
              Structure
            </div>
            <ContainmentTree />
          </div>
        )}

        {/* draggable divider — full screen, desktop only */}
        {fullscreen && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize graph and detail panels"
            aria-valuenow={Math.round(leftPct)}
            aria-valuemin={SPLIT_MIN}
            aria-valuemax={SPLIT_MAX}
            tabIndex={0}
            onPointerDown={startResize}
            onKeyDown={onHandleKey}
            className="group/handle relative hidden touch-none cursor-col-resize select-none items-center justify-center rounded [grid-area:divider] focus-visible:outline-none lg:flex"
          >
            <span className="h-16 w-1 rounded-full bg-[var(--border-strong)] transition-colors duration-150 group-hover/handle:bg-[var(--primary)] group-focus-visible/handle:bg-[var(--primary)]" />
          </div>
        )}

        {/* detail — the persistent panel that travels from the bottom into the
            right column (one mount in both modes, so it MOVES not remounts) */}
        <div
          ref={detailRef}
          className={cn("[grid-area:detail] min-h-0 min-w-0 will-change-transform", fullscreen && "overflow-y-auto")}
        >
          <ExplorerDetailPanel domainId={domainId} />
        </div>
      </div>
    </ExplorerProvider>
  );
}
