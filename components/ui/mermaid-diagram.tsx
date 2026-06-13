"use client";

/**
 * MermaidDiagram - the single, canonical Mermaid renderer for the whole app.
 *
 * Every surface that shows a diagram (chat answers, run-phase documents, the
 * Blueprint, node dossiers) routes through here so they all share one look and
 * one rendering mechanic. Previously three near-identical copies lived in
 * chat-markdown / doc-markdown / knowledge-mermaid, each on Mermaid's stock
 * `dark`/`neutral` theme - which is why diagrams read flat and generic.
 *
 * The look is built in two layers, by design:
 *   1. COLORS via `theme: "base"` + `themeVariables` derived from the app's
 *      OKLCH design tokens at runtime (so a tenant's `--primary` flows into the
 *      diagram, and light/dark both feel native). Mermaid does colour math on
 *      these (khroma), so we resolve each token to a concrete hex by painting a
 *      pixel and reading it back - khroma can't parse `oklch(…)`, and Chrome's
 *      canvas `fillStyle` round-trips oklch as oklch, so only `getImageData`
 *      gives a usable sRGB hex.
 *   2. DEPTH / ROUNDING / MOTION via the `.athena-mermaid` skin in
 *      styles/mermaid.css - the Linear/Modern polish that themeVariables can't
 *      express (drop-shadows, corner radius, hover ring, dot-grid canvas), for
 *      flowcharts AND the other diagram types (sequence/class/state/ER).
 *
 * The diagram type doesn't matter to this component: whatever Mermaid source
 * the BE/model emits (`flowchart`, `sequenceDiagram`, `classDiagram`,
 * `stateDiagram`, `erDiagram`, …) is rendered the same way - the theme + skin
 * style each type's shapes consistently.
 *
 * Behaviour: Mermaid is dynamically imported (kept out of the main bundle),
 * `securityLevel: "strict"`, the source is validated before render so an
 * incomplete diagram (mid-stream in chat) degrades quietly, render is
 * debounced, it re-renders on theme change, and a parse error falls back to the
 * raw source in a code box.
 *
 * Affordances: a hover-revealed Expand button opens the diagram in a
 * fullscreen, zoomable lightbox. Optional clickable nodes - pass `nodeMap`
 * (diagram token → id) + `onNodeSelect` and matching node groups become
 * keyboard-accessible buttons (strict mode strips Mermaid's own `click`
 * directives, so we wire the DOM ourselves).
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import { Maximize2, Minus, Plus, X } from "lucide-react";

import { cn } from "@/lib/cn";

interface MermaidDiagramProps {
  chart: string;
  className?: string | undefined;
  /** Accessible label for the diagram container. */
  ariaLabel?: string | undefined;
  /** Diagram token → id. Tokens not in the map render inert. */
  nodeMap?: Record<string, string> | null | undefined;
  /** Called with the mapped id when a wired node is clicked / activated. */
  onNodeSelect?: ((id: string) => void) | undefined;
  /** Container test id (defaults to "mermaid-diagram"). */
  testId?: string | undefined;
  /** "card" (default) frames the diagram + shows the Expand affordance;
   *  "plain" is the bare diagram used INSIDE the lightbox. */
  variant?: "card" | "plain";
  /** Show the fullscreen Expand button (card variant only). Default true. */
  zoomable?: boolean | undefined;
  /** Fires after the SVG is injected (used by the lightbox to fit-to-screen). */
  onRendered?: ((svg: SVGSVGElement | null) => void) | undefined;
}

const FONT = '"Inter", system-ui, -apple-system, sans-serif';

export function MermaidDiagram({
  chart,
  className,
  ariaLabel = "Diagram",
  nodeMap,
  onNodeSelect,
  testId = "mermaid-diagram",
  variant = "card",
  zoomable = true,
  onRendered,
}: MermaidDiagramProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const [error, setError] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  // Keep the latest map + handlers in refs so the post-render wiring doesn't
  // force the (expensive) diagram render to re-run on every parent re-render.
  const mapRef = useRef<Record<string, string>>({});
  const selectRef = useRef<typeof onNodeSelect>(undefined);
  const renderedRef = useRef<typeof onRendered>(undefined);
  mapRef.current = nodeMap ?? {};
  selectRef.current = onNodeSelect;
  renderedRef.current = onRendered;

  useEffect(() => {
    let cancelled = false;
    const cleanups: Array<() => void> = [];
    // Debounced so a diagram still streaming in (chat) doesn't thrash-render.
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const mermaid = (await import("mermaid")).default;
          const dark = resolvedTheme === "dark";
          // Card: responsive (fills its frame). Plain (lightbox): natural size
          // so each diagram has an intrinsic width/height to fit + scale
          // against. `useMaxWidth` is PER DIAGRAM TYPE - setting it only on
          // `flowchart` left sequence/class/state/ER on the default (true), so
          // in the lightbox (where the skin strips Mermaid's inline max-width)
          // those types had no intrinsic size and rendered empty. Apply it to
          // every type we emit, not just flowchart.
          const useMaxWidth = variant === "card";
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            suppressErrorRendering: true,
            theme: "base",
            themeVariables: buildThemeVariables(dark),
            fontFamily: FONT,
            flowchart: { curve: "basis", htmlLabels: true, padding: 12, nodeSpacing: 44, rankSpacing: 52, useMaxWidth },
            sequence: { useMaxWidth },
            class: { useMaxWidth },
            state: { useMaxWidth },
            er: { useMaxWidth },
            gantt: { useMaxWidth },
            journey: { useMaxWidth },
            pie: { useMaxWidth },
            requirement: { useMaxWidth },
            mindmap: { useMaxWidth },
            timeline: { useMaxWidth },
            gitGraph: { useMaxWidth },
            c4: { useMaxWidth },
            sankey: { useMaxWidth },
            quadrantChart: { useMaxWidth },
            xyChart: { useMaxWidth },
          });
          // `parse` with suppressErrors returns false (instead of throwing) on
          // an incomplete/invalid diagram. Guarded so a build without `parse`
          // still renders.
          if (typeof mermaid.parse === "function") {
            const valid = await mermaid.parse(chart, { suppressErrors: true });
            if (cancelled) return;
            if (!valid) { setError(true); return; }
          }
          const id = `mmd-${Math.random().toString(36).slice(2)}`;
          const { svg } = await mermaid.render(id, chart);
          if (cancelled || !ref.current) return;
          ref.current.innerHTML = svg;
          ref.current.setAttribute("data-rendered", "true");
          setError(false);
          renderedRef.current?.(ref.current.querySelector("svg"));

          // Wire clickable nodes. Mermaid emits node groups as
          // `<g class="node" id="flowchart-<token>-<n>">`; match the token
          // segment against the map.
          const map = mapRef.current;
          const onSelect = selectRef.current;
          const tokens = Object.keys(map);
          if (!onSelect || tokens.length === 0) return;
          ref.current.querySelectorAll<SVGGElement>("g.node").forEach((el) => {
            const token = matchToken(el.id, tokens);
            if (!token) return;
            const nodeId = map[token]!;
            el.setAttribute("data-node-id", nodeId);
            el.setAttribute("tabindex", "0");
            el.setAttribute("role", "button");
            const onClick = () => onSelect(nodeId);
            const onKey = (e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(nodeId); }
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
    }, 100);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      for (const c of cleanups) c();
    };
  }, [chart, resolvedTheme, variant]);

  if (error) {
    return (
      <pre className={cn("my-2 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--code-bg)] p-3 text-[0.8rem]", className)}>
        <code className="font-mono">{chart}</code>
      </pre>
    );
  }

  const diagram = (
    <div
      ref={ref}
      role="img"
      aria-label={ariaLabel}
      data-testid={testId}
      className={cn(
        "athena-mermaid flex justify-center overflow-x-auto",
        variant === "card" &&
          "athena-mermaid-canvas rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-1)]",
        className,
      )}
    />
  );

  if (variant === "plain") return diagram;

  return (
    <div className="group/mmd relative my-2">
      {diagram}
      {zoomable && (
        <button
          type="button"
          onClick={() => setZoomOpen(true)}
          aria-label="Expand diagram"
          title="Expand diagram"
          className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)]/90 text-[var(--text-muted)] opacity-0 shadow-[var(--shadow-1)] backdrop-blur-sm transition-opacity hover:text-[var(--text)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] group-hover/mmd:opacity-100"
        >
          <Maximize2 className="size-3.5" />
        </button>
      )}
      {zoomOpen && (
        <MermaidLightbox chart={chart} ariaLabel={ariaLabel} onClose={() => setZoomOpen(false)} />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Fullscreen lightbox                                                         */
/* -------------------------------------------------------------------------- */

const ZOOM_MIN = 0.2;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.2;
const FIT_MAX = 2.4; // don't blow a tiny diagram up past this on open

/** A fullscreen, zoomable view of a diagram. Re-renders the same source through
 *  the (plain) shared renderer so it inherits the exact theme + skin, then
 *  fits it to the screen on open and layers pan-by-scroll + zoom controls on
 *  top. Escape / scrim-click / the close button all dismiss it. */
function MermaidLightbox({
  chart,
  ariaLabel,
  onClose,
}: {
  chart: string;
  ariaLabel: string;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(1);
  const closeRef = useRef<HTMLButtonElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const clamp = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +z.toFixed(2)));

  // On render, scale the diagram so it fills the stage (enlarging small
  // diagrams, shrinking oversized ones) - that's what "open fullscreen" should
  // feel like. Reset returns here.
  const fitToStage = (svg: SVGSVGElement | null) => {
    const stage = stageRef.current;
    if (!svg || !stage) return;
    const w = svg.getBoundingClientRect().width;
    const h = svg.getBoundingClientRect().height;
    if (w < 2 || h < 2) return;
    const availW = stage.clientWidth - 48;
    const availH = stage.clientHeight - 48;
    const next = Math.min(FIT_MAX, Math.max(ZOOM_MIN, Math.min(availW / w, availH / h) * 0.96));
    setFit(next);
    setZoom(next);
  };

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === "+" || e.key === "=") {
        setZoom((z) => clamp(z + ZOOM_STEP));
      } else if (e.key === "-") {
        setZoom((z) => clamp(z - ZOOM_STEP));
      } else if (e.key === "0") {
        setZoom(fit);
      }
    };
    // Capture so Escape closes the lightbox without also reaching a drawer/modal
    // mounted behind it.
    document.addEventListener("keydown", onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, fit]);

  const ctrl =
    "inline-flex size-8 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] transition-colors hover:text-[var(--text)] hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

  return createPortal(
    <div
      className="athena-mermaid-lightbox fixed inset-0 z-[70] flex flex-col bg-[var(--overlay)] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`${ariaLabel} - fullscreen`}
      data-testid="mermaid-lightbox"
      onClick={onClose}
    >
      <div
        className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-glass)] px-4 py-2.5 backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="truncate text-sm font-medium text-[var(--text)]">{ariaLabel}</span>
        <div className="flex items-center gap-1.5">
          <button type="button" className={ctrl} onClick={() => setZoom((z) => clamp(z - ZOOM_STEP))} disabled={zoom <= ZOOM_MIN} aria-label="Zoom out" title="Zoom out (−)">
            <Minus className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(fit)}
            className="min-w-[3.25rem] rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-center font-mono text-xs tabular-nums text-[var(--text-muted)] transition-colors hover:text-[var(--text)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            aria-label="Reset zoom to fit"
            title="Fit to screen (0)"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" className={ctrl} onClick={() => setZoom((z) => clamp(z + ZOOM_STEP))} disabled={zoom >= ZOOM_MAX} aria-label="Zoom in" title="Zoom in (+)">
            <Plus className="size-4" />
          </button>
          <span className="mx-1 h-5 w-px bg-[var(--border)]" aria-hidden />
          <button ref={closeRef} type="button" className={ctrl} onClick={onClose} aria-label="Close fullscreen" title="Close (Esc)">
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div ref={stageRef} className="flex-1 overflow-auto">
        <div className="flex min-h-full min-w-fit items-center justify-center p-6">
          <div
            className="athena-mermaid-lightbox-panel origin-center transition-transform duration-150 ease-out"
            style={{ transform: `scale(${zoom})` }}
            onClick={(e) => e.stopPropagation()}
          >
            <MermaidDiagram
              chart={chart}
              ariaLabel={ariaLabel}
              variant="plain"
              zoomable={false}
              testId="mermaid-lightbox-diagram"
              onRendered={fitToStage}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* -------------------------------------------------------------------------- */
/* Theme - token-derived "base" palette                                        */
/* -------------------------------------------------------------------------- */

/** Build Mermaid `themeVariables` from the live design tokens (falling back to
 *  hand-tuned hexes that match the tokens, so it's safe in SSR/jsdom where
 *  computed custom properties are empty). */
function buildThemeVariables(dark: boolean): Record<string, string | boolean> {
  const p = buildPalette(dark);
  return {
    darkMode: dark,
    background: "transparent",
    fontFamily: FONT,
    fontSize: "14px",

    // Primary node - calm, surface-filled card with a hairline border.
    primaryColor: p.nodeFill,
    primaryBorderColor: p.nodeBorder,
    primaryTextColor: p.text,
    mainBkg: p.nodeFill,
    nodeBkg: p.nodeFill,
    nodeBorder: p.nodeBorder,
    nodeTextColor: p.text,
    titleColor: p.text,
    textColor: p.text,

    // Secondary / tertiary - gentle tints for alternate nodes & states.
    secondaryColor: p.secondaryFill,
    secondaryBorderColor: p.secondaryBorder,
    secondaryTextColor: p.text,
    tertiaryColor: p.tertiaryFill,
    tertiaryBorderColor: p.tertiaryBorder,
    tertiaryTextColor: p.text,

    // Edges + their labels (label sits in a clean surface pill).
    lineColor: p.line,
    defaultLinkColor: p.line,
    edgeLabelBackground: p.surface,

    // Subgraphs / clusters - a faint well behind grouped nodes.
    clusterBkg: p.clusterBg,
    clusterBorder: p.clusterBorder,

    // Notes (flow + sequence).
    noteBkgColor: p.noteBg,
    noteBorderColor: p.noteBorder,
    noteTextColor: p.text,

    // Sequence diagrams.
    actorBkg: p.nodeFill,
    actorBorder: p.nodeBorder,
    actorTextColor: p.text,
    actorLineColor: p.line,
    signalColor: p.text,
    signalTextColor: p.text,
    labelBoxBkgColor: p.nodeFill,
    labelBoxBorderColor: p.nodeBorder,
    labelTextColor: p.text,
    loopTextColor: p.textMuted,
    activationBkgColor: p.secondaryFill,
    activationBorderColor: p.secondaryBorder,
    sequenceNumberColor: dark ? "#15171c" : "#ffffff",

    // Class / state / ER text.
    classText: p.text,
  };
}

interface Palette {
  text: string;
  textMuted: string;
  surface: string;
  nodeFill: string;
  nodeBorder: string;
  secondaryFill: string;
  secondaryBorder: string;
  tertiaryFill: string;
  tertiaryBorder: string;
  line: string;
  clusterBg: string;
  clusterBorder: string;
  noteBg: string;
  noteBorder: string;
}

/** Resolve the structural palette: brand + text + surfaces come from the live
 *  tokens (tenant-overridable, theme-correct); the few non-token structural
 *  colours (solid borders/lines - the real border tokens are translucent and
 *  would vanish as a stroke) are hand-tuned per theme. */
function buildPalette(dark: boolean): Palette {
  const root =
    typeof document !== "undefined" ? getComputedStyle(document.documentElement) : null;
  const tok = (name: string, fb: string): string => {
    const raw = root?.getPropertyValue(name).trim();
    return (raw && toHex(raw)) || fb;
  };
  return {
    text: tok("--text", dark ? "#f1f3f5" : "#1f2630"),
    textMuted: tok("--text-muted", dark ? "#a8aeba" : "#5b626e"),
    surface: tok("--surface", dark ? "#21242b" : "#ffffff"),
    nodeFill: tok("--surface-2", dark ? "#292d35" : "#f5f6fa"),
    nodeBorder: dark ? "#3c4350" : "#d8dce6",
    secondaryFill: dark ? "#2f3440" : "#eef1f8",
    secondaryBorder: dark ? "#454c5b" : "#d3d9e6",
    tertiaryFill: dark ? "#312f47" : "#f3f1fb",
    tertiaryBorder: dark ? "#474363" : "#ddd9f0",
    line: dark ? "#586070" : "#a7adba",
    clusterBg: dark ? "#1c1f27" : "#fafbfe",
    clusterBorder: dark ? "#343b48" : "#e4e7ef",
    noteBg: dark ? "#2c2a20" : "#fbf6ea",
    noteBorder: dark ? "#564e34" : "#ecd9b0",
  };
}

// One reused 1×1 canvas - Mermaid's colour math (khroma) can't parse modern
// CSS colours like `oklch(…)`, which is exactly what our tokens compute to. We
// can't just round-trip through `fillStyle` (Chrome serialises `oklch(…)` back
// as `oklch(…)`), so we PAINT the colour and read the pixel: `getImageData`
// rasterises to concrete sRGB bytes, normalising any CSS colour to `#rrggbb`.
let _ctx: CanvasRenderingContext2D | null | undefined;

/** Normalise any CSS colour string to a khroma-safe hex (or rgba when it
 *  carries alpha). Returns "" when there's no canvas (SSR/jsdom) so the caller
 *  uses its hand-tuned fallback. */
function toHex(value: string): string {
  try {
    if (_ctx === undefined) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      _ctx = canvas.getContext("2d", { willReadFrequently: true });
    }
    if (!_ctx) return "";
    _ctx.clearRect(0, 0, 1, 1);
    _ctx.fillStyle = "#000";
    _ctx.fillStyle = value; // an invalid value leaves the previous fill in place
    _ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = _ctx.getImageData(0, 0, 1, 1).data;
    if (a === 0) return ""; // transparent / unparseable → fall back
    const h = (n: number) => n.toString(16).padStart(2, "0");
    return a === 255 ? `#${h(r!)}${h(g!)}${h(b!)}` : `rgba(${r}, ${g}, ${b}, ${(a! / 255).toFixed(3)})`;
  } catch {
    return "";
  }
}

/** Mermaid node ids look like `flowchart-<token>-<n>` (or sometimes just
 *  `<token>`). Return the map token that appears as a dash-delimited segment of
 *  the element id, preferring the longest match so `svc_api` wins over `svc`. */
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
