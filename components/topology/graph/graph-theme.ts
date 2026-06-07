/**
 * graph-theme.ts — bridges Athena's OKLCH design tokens into Cytoscape's canvas
 * renderer (which needs concrete colors, not `var(--token)`). Resolution is two
 * passes: set the value on a probe element + read `getComputedStyle().color`
 * (resolves `var()` → an `oklch(...)` string), then normalise through a 2D
 * canvas `fillStyle` to a guaranteed `#rrggbb` / `rgba()` Cytoscape accepts.
 * Rebuilt whenever the theme flips, so light + dark are both first-class.
 *
 * Design discipline (UX standard §1, §3): restraint. Nodes are calm surface
 * pills with a hairline border; the ONLY color is a thin category accent on the
 * border (Service / Data / API / External / Scope / Doc) — code stays neutral.
 * Selection is the brand accent. No rainbow, no dashed boxes, labels always on.
 */
import type cytoscape from "cytoscape";

/** Broad, legible categories — the single color axis. Code (files/symbols),
 *  the overwhelming majority, stays neutral so the surface reads calm. */
type Category = "scope" | "service" | "module" | "data" | "api" | "external" | "doc" | "code";

const KIND_CATEGORY: Record<string, Category> = {
  domain: "scope", repo: "scope", org: "scope", domain: "scope",
  service: "service",
  module: "module",
  db_table: "data", db_column: "data", schema: "data", migration: "data",
  api_endpoint: "api", endpoint: "api", event: "api",
  dependency: "external", resource: "external", env_var: "external", config: "external", pipeline: "external",
  document: "doc", concept: "doc", flow: "doc", step: "doc",
  // file / function / class / method / type → "code" (neutral default)
};

export function kindCategory(kind: string): Category {
  return KIND_CATEGORY[kind.toLowerCase()] ?? "code";
}

/** Category → design token. Used both for the canvas border and the DOM legend
 *  (where `var(--token)` is used directly). */
export const CATEGORY_VAR: Record<Category, string> = {
  scope: "--acc-violet",
  service: "--primary",
  module: "--acc-indigo",
  data: "--acc-cyan",
  api: "--acc-mint",
  external: "--acc-amber",
  doc: "--acc-rose",
  code: "--border-strong",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  scope: "Scope",
  service: "Service",
  module: "Module",
  data: "Data",
  api: "API",
  external: "External",
  doc: "Docs",
  code: "Code",
};

export const CATEGORIES = Object.keys(CATEGORY_VAR) as Category[];

/** Behavioral edge kinds offered in the legend filter (stable order). */
export const EDGE_KINDS = [
  "calls", "imports", "references", "handles", "produces", "consumes",
  "reads", "writes", "extends", "integrates_with", "depends_on",
];

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
  primaryInk: string;
  danger: string;
  warning: string;
  /** category → border color. */
  category: (kind: string) => string;
}

/** css-color → `rgb()`/`rgba()` normaliser bound to the live cascade. Two steps:
 *  resolve `var()` against the probe's cascade (yields an `oklch(...)` string in
 *  modern Chrome), then RASTERISE it to a 1×1 canvas and read the pixel back —
 *  the only reliable conversion, because both `getComputedStyle` and canvas
 *  `fillStyle` PRESERVE `oklch()` here, and Cytoscape's color parser rejects it.
 *  `fillRect` + `getImageData` always returns sRGB bytes. Identity off-browser. */
function makeResolver(): { resolve: (c: string) => string; dispose: () => void } {
  if (typeof document === "undefined") return { resolve: (c) => c, dispose: () => {} };
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;width:0;height:0;visibility:hidden;pointer-events:none";
  document.body.appendChild(probe);
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    const cv = document.createElement("canvas");
    cv.width = 1;
    cv.height = 1;
    ctx = cv.getContext("2d", { willReadFrequently: true });
  } catch {
    ctx = null;
  }
  const resolve = (c: string): string => {
    probe.style.color = "";
    probe.style.color = c;
    const computed = getComputedStyle(probe).color || c; // may be `oklch(...)` in modern browsers
    if (!ctx) return computed;
    try {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = computed; // canvas accepts oklch; fillRect rasterises it to sRGB
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      const r = d[0] ?? 0, g = d[1] ?? 0, b = d[2] ?? 0, a = d[3] ?? 255;
      return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
    } catch {
      return computed;
    }
  };
  return { resolve, dispose: () => probe.remove() };
}

export function resolveTheme(): ThemeColors {
  const { resolve, dispose } = makeResolver();
  const t = (token: string) => resolve(`var(${token})`);

  const catCache = new Map<string, string>();
  const category = (kind: string): string => {
    const cat = kindCategory(kind);
    let v = catCache.get(cat);
    if (v === undefined) { v = t(CATEGORY_VAR[cat]); catCache.set(cat, v); }
    return v;
  };

  const colors: ThemeColors = {
    bg: t("--surface"),
    surface: t("--surface"),
    surface2: t("--surface-2"),
    text: t("--text"),
    textMuted: t("--text-muted"),
    textSubtle: t("--text-subtle"),
    border: t("--border"),
    borderStrong: t("--border-strong"),
    primary: t("--primary"),
    primaryFg: t("--primary-fg"),
    primarySoft: t("--primary-soft"),
    primaryInk: t("--acc-indigo-ink"),
    danger: t("--danger"),
    warning: t("--warning"),
    category,
  };
  dispose();
  return colors;
}

type Style = Record<string, string | number>;

/** The full Cytoscape stylesheet, parameterised by the resolved theme. Per-kind
 *  border color lives in selectors so a theme flip rebuilds ONLY the stylesheet
 *  — elements never churn. */
export function buildStylesheet(t: ThemeColors): cytoscape.StylesheetJson {
  const sheet: Array<{ selector: string; style: Style }> = [
    // Calm pill node: surface fill, hairline neutral border, label INSIDE.
    {
      selector: "node",
      style: {
        shape: "round-rectangle",
        "background-color": t.surface,
        "background-opacity": 1,
        "border-width": 1.5,
        "border-color": t.borderStrong,
        width: "label",
        height: "label",
        padding: "10px",
        label: "data(label)",
        color: t.text,
        "font-size": 12,
        "font-weight": 600,
        "text-valign": "center",
        "text-halign": "center",
        "text-max-width": "150px",
        "text-wrap": "ellipsis",
        "min-zoomed-font-size": 6,
        "transition-property": "border-color, border-width, background-color, opacity",
        "transition-duration": 120,
        "overlay-opacity": 0,
      },
    },
    // Category accent on the border (the single color axis).
    ...Object.keys(KIND_CATEGORY).map((k) => ({
      selector: `node[kind = "${k}"]`,
      style: { "border-color": t.category(k) } as Style,
    })),
    // Scope roots read as the primary "you are here" anchor.
    {
      selector: 'node[kind = "repo"], node[kind = "domain"], node[kind = "org"]',
      style: { "font-weight": 700, "border-width": 2 },
    },
    { selector: "node[stub]", style: { "border-style": "dashed", color: t.textMuted } },
    // Behavioral edges — calm neutral, gentle curve, small arrow.
    {
      selector: "edge",
      style: {
        width: 1.4,
        "line-color": t.borderStrong,
        "line-opacity": 0.7,
        "curve-style": "bezier",
        "target-arrow-color": t.borderStrong,
        "target-arrow-shape": "triangle",
        "arrow-scale": 0.7,
        "transition-property": "line-color, width, opacity",
        "transition-duration": 120,
        "overlay-opacity": 0,
      },
    },
    // Structural containment — a faint connector, no arrow (reads as a tree).
    {
      selector: 'edge[kind = "contains"]',
      style: {
        width: 1,
        "line-color": t.border,
        "line-opacity": 0.55,
        "target-arrow-shape": "none",
        "curve-style": "bezier",
      },
    },
    {
      selector: "edge[?dashed]",
      style: { "line-style": "dashed", "line-color": t.warning, "target-arrow-color": t.warning },
    },
    {
      selector: "edge[?rolledUp]",
      style: { width: "mapData(weight, 1, 20, 1.6, 5)" },
    },
    // --- interaction state (applied imperatively via classes) --- //
    {
      selector: "node.sel",
      style: {
        "border-color": t.primary,
        "border-width": 2.5,
        "background-color": t.primarySoft,
        color: t.primaryInk,
        "z-index": 9999,
      },
    },
    {
      selector: "edge.hl",
      style: {
        "line-color": t.primary,
        "target-arrow-color": t.primary,
        "line-opacity": 1,
        width: 2,
        "z-index": 9000,
      },
    },
    {
      // Label only on highlighted edges that HAVE a `kindLabel` (behavioural
      // edges). The `[kindLabel]` guard keeps the structural `contains`
      // connectors — which carry no label — out of the mapping, otherwise
      // Cytoscape warns "no mapping for property `label` with data field
      // `kindLabel`" the moment a scope root (with containment edges) is
      // selected/hovered.
      selector: "edge.hl[kindLabel]",
      style: {
        label: "data(kindLabel)",
        "font-size": 9,
        "font-weight": 600,
        color: t.textMuted,
        "text-background-color": t.surface,
        "text-background-opacity": 0.92,
        "text-background-padding": 3,
        "text-background-shape": "round-rectangle",
      },
    },
    // Gentle de-emphasis — still fully readable (never the old 0.14 ghosting).
    { selector: "node.dim", style: { opacity: 0.45 } },
    { selector: "edge.dim", style: { opacity: 0.25 } },
    // overlay (blast radius)
    { selector: "node.ov-changed", style: { "border-color": t.danger, "border-width": 2.5, "background-color": t.surface } },
    { selector: "node.ov-affected", style: { "border-color": t.warning, "border-width": 2.5 } },
    { selector: "edge.ov-on", style: { "line-color": t.warning, "target-arrow-color": t.warning, "line-opacity": 0.9 } },
  ];
  return sheet as unknown as cytoscape.StylesheetJson;
}
