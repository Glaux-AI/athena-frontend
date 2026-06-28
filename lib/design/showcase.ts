/**
 * Build a self-contained showcase document for a design system, rendered in a
 * sandboxed iframe (the "preview by default" surface). It injects the system's
 * OWN css (and every component's css) so `var(--token)` resolves and a `.dark`
 * block (if present) applies, then lays out the palette, a type ramp, and the
 * system's actual components in light + dark. The showcase FRAME uses neutral
 * grays (it is chrome, not part of the design). No scripts (sandbox=""), so
 * component markup is rendered but inert.
 */

import type { DesignToken } from "@/lib/api/client";

/** The minimal shape the showcase needs from a component (saved or draft). */
export interface ShowcaseComponent {
  name: string;
  css?: string;
  markup?: string;
}

const FALLBACK_TYPE: DesignToken[] = [
  { name: "--text-sm", value: "0.875rem", group: "font-size", source: "fallback" },
  { name: "--text-base", value: "1rem", group: "font-size", source: "fallback" },
  { name: "--text-lg", value: "1.25rem", group: "font-size", source: "fallback" },
  { name: "--text-xl", value: "1.75rem", group: "font-size", source: "fallback" },
];

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function shortName(name: string): string {
  return name.replace(/^--/, "").replace(/[-_]/g, " ");
}

export function buildShowcaseHtml(
  css: string,
  tokens: DesignToken[],
  components: ShowcaseComponent[] = [],
): string {
  const colors = tokens.filter((t) => t.group === "color");
  const swatches =
    colors
      .map(
        (c) => `<div class="sw"><div class="chip" style="background:${esc(c.value)}"></div>` +
          `<div class="lbl">${esc(c.name)}</div><div class="val">${esc(c.value)}</div></div>`,
      )
      .join("") || '<div class="val">No color tokens in this system yet.</div>';
  const typeTokens = tokens.filter((t) => t.group === "font-size").slice(0, 6);
  const typeRows = (typeTokens.length > 0 ? typeTokens : FALLBACK_TYPE)
    .map((t) => `<div style="font-size:${esc(t.value)}">${esc(shortName(t.name))} - The quick brown fox</div>`)
    .join("");
  const componentCss = components.map((c) => c.css ?? "").join("\n");
  const componentsSection = buildComponentsSection(components);
  const fallbackPanels = components.length === 0 ? buildFallbackPanels() : "";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${css}
${componentCss}
*{box-sizing:border-box}
body{margin:0;font-family:Inter,system-ui,sans-serif;color:#111827;background:#ffffff;padding:20px}
.h{font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:#94a3b8;margin:20px 0 10px;font-family:ui-monospace,monospace}
.h:first-child{margin-top:0}
.pal{display:flex;flex-wrap:wrap;gap:12px}
.sw{width:104px}
.chip{height:60px;border-radius:10px;border:1px solid rgba(0,0,0,.12)}
.lbl{font-size:11px;margin-top:6px;color:#334155;font-family:ui-monospace,monospace;word-break:break-all}
.val{font-size:10px;color:#94a3b8;font-family:ui-monospace,monospace}
.type>div{margin:8px 0;line-height:1.2}
.panels{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.panel{padding:18px;border-radius:14px;border:1px solid rgba(0,0,0,.12);background:var(--surface,var(--bg,#ffffff));color:var(--text,#111827)}
.panel.dark{background:var(--surface,var(--bg,#15130f));color:var(--text,#f6f3ec);border-color:rgba(255,255,255,.12)}
.card{display:flex;flex-direction:column;gap:10px}
.card-h{font-size:18px;font-weight:600}
.card-b{font-size:14px;opacity:.78}
.btn{align-self:flex-start;border:0;border-radius:var(--radius-md,8px);padding:9px 16px;font-weight:600;cursor:default;background:var(--color-primary,var(--primary,#31628f));color:var(--color-on-primary,#ffffff)}
.comp{margin:0 0 14px}
.comp-name{font-size:12px;font-weight:600;color:#334155;margin-bottom:6px}
.stages{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.stage{padding:16px;border-radius:12px;border:1px solid rgba(0,0,0,.12);background:var(--surface,#ffffff);color:var(--text,#111827)}
.stage.dark{background:var(--surface,#15130f);color:var(--text,#f6f3ec);border-color:rgba(255,255,255,.12)}
</style></head><body>
<div class="h">Palette</div><div class="pal">${swatches}</div>
<div class="h">Typography</div><div class="type">${typeRows}</div>
<div class="h">Components - light and dark</div>${componentsSection}${fallbackPanels}
</body></html>`;
}

function buildComponentsSection(components: ShowcaseComponent[]): string {
  if (components.length === 0) return "";
  return components
    .map((c) => {
      const markup = c.markup ?? "";
      return (
        `<div class="comp"><div class="comp-name">${esc(c.name)}</div>` +
        `<div class="stages"><div class="stage">${markup}</div>` +
        `<div class="stage dark">${markup}</div></div></div>`
      );
    })
    .join("");
}

function buildFallbackPanels(): string {
  const panel = (cls: string) =>
    `<div class="panel ${cls}"><div class="card"><div class="card-h">Card title</div>` +
    `<div class="card-b">A sample component rendered with your tokens.</div>` +
    `<button class="btn">Primary action</button></div></div>`;
  return `<div class="panels">${panel("")}${panel("dark")}</div>`;
}
