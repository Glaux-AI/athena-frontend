/**
 * graph-theme.ts — bridges the app's OKLCH design tokens into Cytoscape's
 * canvas renderer, which (unlike DOM/SVG) needs concrete color strings, not
 * `var(--token)` references. We resolve every token at runtime in two passes:
 *
 *   1. set the value on a probe element + read `getComputedStyle().color`
 *      (resolves `var()` against the live cascade → an `oklch(...)` string),
 *   2. feed that through a 2D canvas `fillStyle` (normalises ANY css color —
 *      incl. oklch / out-of-gamut — to a guaranteed `#rrggbb` / `rgba(...)`
 *      that Cytoscape's own color parser accepts).
 *
 * The result is rebuilt whenever the theme flips (`.dark` class), so light +
 * dark are both first-class with zero hardcoded hexes. Node/edge hues stay in
 * one place (`KIND_OKLCH` / `EDGE_OKLCH`), ported from the prior surface.
 */
import type cytoscape from "cytoscape";

/* kind → hue. Covers the union of node kinds across every scope. */
const KIND_OKLCH: Record<string, string> = {
  file: "oklch(62% 0.15 75)",
  function: "oklch(62% 0.10 260)",
  class: "oklch(62% 0.13 265)",
  method: "oklch(62% 0.10 260)",
  module: "oklch(62% 0.13 220)",
  type: "oklch(62% 0.13 220)",
  concept: "oklch(64% 0.09 300)",
  schema: "oklch(60% 0.12 200)",
  service: "oklch(58% 0.16 260)",
  config: "oklch(62% 0.15 75)",
  resource: "oklch(60% 0.10 150)",
  pipeline: "oklch(60% 0.12 190)",
  api_endpoint: "oklch(64% 0.14 145)",
  endpoint: "oklch(64% 0.14 145)",
  env_var: "oklch(62% 0.12 95)",
  dependency: "oklch(57% 0.08 250)",
  db_table: "oklch(60% 0.12 200)",
  db_column: "oklch(60% 0.09 200)",
  migration: "oklch(60% 0.12 210)",
  event: "oklch(64% 0.15 30)",
  test: "oklch(62% 0.13 155)",
  document: "oklch(62% 0.13 155)",
  domain: "oklch(62% 0.18 20)",
  flow: "oklch(62% 0.16 40)",
  step: "oklch(64% 0.12 50)",
  // scope roots
  capability: "oklch(62% 0.18 20)",
  repo: "oklch(57% 0.12 220)",
  org: "oklch(58% 0.15 290)",
};
const KIND_DEFAULT = "oklch(62% 0.04 260)";

/* edge kind → hue. Behavioral edges read as typed relationships. */
const EDGE_OKLCH: Record<string, string> = {
  calls: "oklch(62% 0.12 260)",
  references: "oklch(60% 0.05 260)",
  imports: "oklch(60% 0.10 220)",
  handles: "oklch(64% 0.14 145)",
  produces: "oklch(64% 0.15 30)",
  consumes: "oklch(62% 0.13 50)",
  reads: "oklch(60% 0.12 200)",
  writes: "oklch(58% 0.16 25)",
  extends: "oklch(62% 0.13 300)",
  integrates_with: "oklch(62% 0.16 320)",
  depends_on: "oklch(58% 0.10 250)",
};

export const EDGE_KINDS = Object.keys(EDGE_OKLCH);

export interface ThemeColors {
  bg: string;
  surface: string;
  surface2: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  border: string;
  borderStrong: string;
  primary: string;
  primaryFg: string;
  primarySoft: string;
  danger: string;
  warning: string;
  success: string;
  grid: string;
  /** node kind → resolved fill. */
  kind: (k: string) => string;
  /** edge kind → resolved stroke. */
  edge: (k?: string | null) => string;
}

/** Build a css-color → `#rrggbb`/`rgba()` normaliser bound to the live cascade.
 *  Returns an identity fn when off the browser (SSR / jsdom without canvas). */
function makeResolver(): { resolve: (c: string) => string; dispose: () => void } {
  if (typeof document === "undefined") {
    return { resolve: (c) => c, dispose: () => {} };
  }
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;width:0;height:0;visibility:hidden;pointer-events:none";
  document.body.appendChild(probe);
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = document.createElement("canvas").getContext("2d");
  } catch {
    ctx = null;
  }
  const resolve = (c: string): string => {
    probe.style.color = "";
    probe.style.color = c; // accepts `var(--x)` or any css color
    const computed = getComputedStyle(probe).color || c;
    if (!ctx) return computed;
    ctx.fillStyle = "#000";
    ctx.fillStyle = computed; // canvas serialises to #rrggbb / rgba()
    return ctx.fillStyle as string;
  };
  return { resolve, dispose: () => probe.remove() };
}

/** Snapshot the current theme into concrete colors for the stylesheet. */
export function resolveTheme(): ThemeColors {
  const { resolve, dispose } = makeResolver();
  const t = (token: string) => resolve(`var(${token})`);

  const kindCache = new Map<string, string>();
  const kind = (k: string): string => {
    const key = k.toLowerCase();
    let v = kindCache.get(key);
    if (v === undefined) {
      v = resolve(KIND_OKLCH[key] ?? KIND_DEFAULT);
      kindCache.set(key, v);
    }
    return v;
  };

  const edgeCache = new Map<string, string>();
  const borderStrong = t("--border-strong");
  const edge = (k?: string | null): string => {
    const key = (k ?? "").toLowerCase();
    if (!key || !(key in EDGE_OKLCH)) return borderStrong;
    let v = edgeCache.get(key);
    if (v === undefined) {
      v = resolve(EDGE_OKLCH[key]!);
      edgeCache.set(key, v);
    }
    return v;
  };

  const colors: ThemeColors = {
    bg: t("--surface"),
    surface: t("--surface"),
    surface2: t("--surface-2"),
    text: t("--text"),
    textMuted: t("--text-muted"),
    textSubtle: t("--text-subtle"),
    border: t("--border-strong"),
    borderStrong: t("--border-strong"),
    primary: t("--primary"),
    primaryFg: t("--primary-fg"),
    primarySoft: t("--primary-soft"),
    danger: t("--danger"),
    warning: t("--warning"),
    success: t("--success"),
    grid: t("--border"),
    kind,
    edge,
  };
  dispose();
  return colors;
}

type Style = Record<string, string | number>;

/** The full Cytoscape stylesheet, parameterised by the resolved theme. Per-kind
 *  color lives in selectors (not element data) so a theme flip rebuilds ONLY
 *  the stylesheet — elements never churn, viewport + selection are untouched. */
export function buildStylesheet(t: ThemeColors): cytoscape.StylesheetJson {
  const sheet: Array<{ selector: string; style: Style }> = [
    {
      selector: "node",
      style: {
        "background-color": t.kind(""),
        "background-opacity": 0.95,
        shape: "round-rectangle",
        width: "data(size)",
        height: "data(size)",
        "border-width": 1.5,
        "border-color": t.border,
        "border-opacity": 0.9,
        label: "data(label)",
        color: t.textMuted,
        "font-size": 11,
        "font-weight": 500,
        "text-valign": "bottom",
        "text-halign": "center",
        "text-margin-y": 5,
        "text-wrap": "ellipsis",
        "text-max-width": "120px",
        "min-zoomed-font-size": 7,
        "transition-property": "border-color, border-width, background-opacity, opacity",
        "transition-duration": 120,
        "overlay-opacity": 0,
      },
    },
    // Compound containers (a node that nests children): translucent box, label
    // pinned to the top, generous padding so children sit inside.
    {
      selector: ":parent",
      style: {
        "background-color": t.surface2,
        "background-opacity": 0.45,
        shape: "round-rectangle",
        "border-width": 1.5,
        "border-color": t.border,
        "border-style": "dashed",
        "border-opacity": 0.8,
        padding: 18,
        label: "data(label)",
        color: t.textSubtle,
        "font-size": 11,
        "font-weight": 700,
        "text-valign": "top",
        "text-halign": "center",
        "text-margin-y": 2,
        "text-transform": "none",
        "min-zoomed-font-size": 6,
      },
    },
    // Per-kind fill (leaf nodes). Generated from the kind palette.
    ...Object.keys(KIND_OKLCH).map((k) => ({
      selector: `node[kind = "${k}"]`,
      style: { "background-color": t.kind(k) } as Style,
    })),
    // Per-kind compound tint — a faint wash of the kind hue on the container.
    ...["service", "module", "repo", "capability", "org", "domain"].map((k) => ({
      selector: `node:parent[kind = "${k}"]`,
      style: { "border-color": t.kind(k), "border-opacity": 0.55 } as Style,
    })),
    {
      selector: "node[stub]",
      style: { "border-style": "dashed", "background-opacity": 0.5 },
    },
    // Edges — typed colour, arrowed, gently curved.
    {
      selector: "edge",
      style: {
        width: "data(width)",
        "line-color": t.edge(),
        "line-opacity": 0.55,
        "curve-style": "bezier",
        "target-arrow-color": t.edge(),
        "target-arrow-shape": "triangle",
        "arrow-scale": 0.85,
        "target-arrow-fill": "filled",
        "transition-property": "line-color, width, opacity",
        "transition-duration": 120,
        "overlay-opacity": 0,
      },
    },
    ...EDGE_KINDS.map((k) => ({
      selector: `edge[kind = "${k}"]`,
      style: { "line-color": t.edge(k), "target-arrow-color": t.edge(k) } as Style,
    })),
    {
      selector: "edge[?dashed]",
      style: { "line-style": "dashed", "line-color": t.warning, "target-arrow-color": t.warning },
    },
    {
      selector: "edge[?rolledUp]",
      style: { width: "mapData(weight, 1, 20, 2, 6)", label: "data(rollLabel)", "font-size": 9, color: t.textSubtle },
    },
    // --- interaction state (applied imperatively via classes) --- //
    {
      selector: "node.sel",
      style: {
        "border-color": t.primary,
        "border-width": 3,
        "border-opacity": 1,
        color: t.text,
        "font-weight": 700,
        "z-index": 9999,
      },
    },
    {
      selector: "edge.hl",
      style: {
        "line-color": t.primary,
        "target-arrow-color": t.primary,
        "line-opacity": 0.95,
        width: 2.4,
        label: "data(kind)",
        "font-size": 9,
        color: t.textMuted,
        "text-background-color": t.surface,
        "text-background-opacity": 0.9,
        "text-background-padding": 2,
        "z-index": 9000,
      },
    },
    { selector: ".dim", style: { opacity: 0.12 } },
    { selector: "node.dim", style: { opacity: 0.14, "text-opacity": 0 } },
    // overlay (blast radius)
    { selector: "node.ov-changed", style: { "border-color": t.danger, "border-width": 3, "border-opacity": 1 } },
    { selector: "node.ov-affected", style: { "border-color": t.warning, "border-width": 3, "border-opacity": 1 } },
    { selector: "edge.ov-on", style: { "line-color": t.warning, "target-arrow-color": t.warning, "line-opacity": 0.9 } },
  ];
  return sheet as unknown as cytoscape.StylesheetJson;
}
