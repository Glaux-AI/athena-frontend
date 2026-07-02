/**
 * Build a self-contained showcase document for a design system, rendered in a
 * sandboxed iframe (the "preview by default" surface). It injects the system's
 * OWN css (and every component's css) so `var(--token)` resolves and a `.dark`
 * block (if present) applies, then lays out the palette, a type ramp, and the
 * system's actual components in light + dark. The showcase FRAME uses neutral
 * grays (it is chrome, not part of the design); every chrome class carries the
 * `sw-` prefix so the chrome css (emitted AFTER the user css) can never hijack
 * the user's own component classes (.btn, .card, ...). No scripts
 * (sandbox=""), so component markup is rendered but inert.
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

/** Markup that could break out of the inert preview document (a script tag, or
 *  a stray `</html>` that would truncate the doc). Such a component is skipped
 *  in the preview (cheap containment - the preview iframe is sandbox="" anyway). */
const BLOCKED_MARKUP_RE = /<script|<\/html/i;

function isBlockedMarkup(markup: string): boolean {
  return BLOCKED_MARKUP_RE.test(markup);
}

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
        (c) => `<div class="sw-swatch"><div class="sw-chip" style="background:${esc(c.value)}"></div>` +
          `<div class="sw-lbl">${esc(c.name)}</div><div class="sw-val">${esc(c.value)}</div></div>`,
      )
      .join("") || '<div class="sw-val">No color tokens in this system yet.</div>';
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
.sw-h{font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:#94a3b8;margin:20px 0 10px;font-family:ui-monospace,monospace}
.sw-h:first-child{margin-top:0}
.sw-pal{display:flex;flex-wrap:wrap;gap:12px}
.sw-swatch{width:104px}
.sw-chip{height:60px;border-radius:10px;border:1px solid rgba(0,0,0,.12)}
.sw-lbl{font-size:11px;margin-top:6px;color:#334155;font-family:ui-monospace,monospace;word-break:break-all}
.sw-val{font-size:10px;color:#94a3b8;font-family:ui-monospace,monospace}
.sw-type>div{margin:8px 0;line-height:1.2}
.sw-panels{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.sw-panel{padding:18px;border-radius:14px;border:1px solid rgba(0,0,0,.12);background:var(--surface,var(--bg,#ffffff));color:var(--text,#111827)}
.sw-panel.dark{background:var(--surface,var(--bg,#15130f));color:var(--text,#f6f3ec);border-color:rgba(255,255,255,.12)}
.sw-card{display:flex;flex-direction:column;gap:10px}
.sw-card-h{font-size:18px;font-weight:600}
.sw-card-b{font-size:14px;opacity:.78}
.sw-btn{align-self:flex-start;border:0;border-radius:var(--radius-md,8px);padding:9px 16px;font-weight:600;cursor:default;background:var(--color-primary,var(--primary,#31628f));color:var(--color-on-primary,#ffffff)}
.sw-comp{margin:0 0 14px}
.sw-comp-name{font-size:12px;font-weight:600;color:#334155;margin-bottom:6px}
.sw-stages{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.sw-stage{padding:16px;border-radius:12px;border:1px solid rgba(0,0,0,.12);background:var(--surface,#ffffff);color:var(--text,#111827);overflow:hidden}
.sw-stage.dark{background:var(--surface,#15130f);color:var(--text,#f6f3ec);border-color:rgba(255,255,255,.12)}
</style></head><body>
<div class="sw-h">Palette</div><div class="sw-pal">${swatches}</div>
<div class="sw-h">Typography</div><div class="sw-type">${typeRows}</div>
<div class="sw-h">Components - light and dark</div>${componentsSection}${fallbackPanels}
</body></html>`;
}

function buildComponentsSection(components: ShowcaseComponent[]): string {
  if (components.length === 0) return "";
  return components
    .map((c) => {
      const raw = c.markup ?? "";
      // Each component renders inside its own .stage container so one broken
      // markup sample can't take the rest of the showcase down with it.
      const markup = isBlockedMarkup(raw)
        ? '<div class="sw-val">Markup skipped in the preview (contains a script or document tag).</div>'
        : raw;
      return (
        `<div class="sw-comp"><div class="sw-comp-name">${esc(c.name)}</div>` +
        `<div class="sw-stages"><div class="sw-stage">${markup}</div>` +
        `<div class="sw-stage dark">${markup}</div></div></div>`
      );
    })
    .join("");
}

function buildFallbackPanels(): string {
  const panel = (cls: string) =>
    `<div class="sw-panel ${cls}"><div class="sw-card"><div class="sw-card-h">Card title</div>` +
    `<div class="sw-card-b">A sample component rendered with your tokens.</div>` +
    `<button class="sw-btn">Primary action</button></div></div>`;
  return `<div class="sw-panels">${panel("")}${panel("dark")}</div>`;
}

/**
 * A minimal single-component document for the per-row mini preview in the
 * components editor: the system css + this component's css + its markup on the
 * system surface. Same markup containment rule as the full showcase; rendered
 * in a sandbox="" iframe so it is inert.
 */
export function buildComponentPreviewHtml(css: string, component: ShowcaseComponent): string {
  const raw = component.markup ?? "";
  const markup = isBlockedMarkup(raw)
    ? '<div style="font:10px ui-monospace,monospace;color:#94a3b8">Markup skipped in the preview (contains a script or document tag).</div>'
    : raw;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${css}
${component.css ?? ""}
*{box-sizing:border-box}
body{margin:0;padding:12px;font-family:Inter,system-ui,sans-serif;background:var(--surface,#ffffff);color:var(--text,#111827);overflow:hidden}
</style></head><body>${markup}</body></html>`;
}
