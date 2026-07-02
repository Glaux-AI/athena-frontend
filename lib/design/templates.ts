/**
 * Curated starter templates for the Design tokens page.
 *
 * Each template is a complete, fully-editable design system seed: a token css
 * body (`:root` light values + a `.dark` override block, consistent
 * `--color-* / --surface / --text / --border / --space-* / --radius-* /
 * --font-size-* / --shadow-*` naming) plus a small set of components whose css
 * references those tokens via `var(--...)`. Picking one seeds a NEW draft in
 * the editor; nothing here is special-cased afterwards - every token and
 * component is editable like any hand-written system.
 */

import type { DesignSystemComponentInput } from "@/lib/api/client";

export interface DesignTemplate {
  id: string;
  name: string;
  description: string;
  css: string;
  components: DesignSystemComponentInput[];
}

/** Shared component set builder - every template ships at least a button, a
 *  card, and an input, all styled purely from the template's own tokens. */
function coreComponents(extra: DesignSystemComponentInput[] = []): DesignSystemComponentInput[] {
  return [
    {
      name: "Button",
      description: "Primary and quiet actions.",
      css: `.btn { display: inline-flex; align-items: center; gap: var(--space-2); border: 1px solid transparent; border-radius: var(--radius-md); padding: var(--space-2) var(--space-4); font-size: var(--font-size-base); font-weight: 600; cursor: pointer; background: var(--color-primary); color: var(--surface); box-shadow: var(--shadow-1); }
.btn.quiet { background: transparent; color: var(--color-primary); border-color: var(--border); box-shadow: none; }`,
      markup: `<button class="btn">Primary action</button> <button class="btn quiet">Quiet action</button>`,
    },
    {
      name: "Card",
      description: "The standard content surface.",
      css: `.card { background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: var(--space-4); box-shadow: var(--shadow-1); max-width: 340px; }
.card h3 { margin: 0 0 var(--space-2); font-size: var(--font-size-lg); }
.card p { margin: 0; font-size: var(--font-size-sm); color: var(--text-muted); }`,
      markup: `<div class="card"><h3>Card title</h3><p>Supporting copy set in the muted text color, on the system surface.</p></div>`,
    },
    {
      name: "Input",
      description: "Text field with label.",
      css: `.field { display: flex; flex-direction: column; gap: var(--space-1); max-width: 280px; }
.field label { font-size: var(--font-size-sm); color: var(--text-muted); }
.field input { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: var(--space-2) var(--space-3); font-size: var(--font-size-base); background: var(--surface); color: var(--text); }`,
      markup: `<div class="field"><label>Workspace name</label><input value="Acme Inc" /></div>`,
    },
    ...extra,
  ];
}

const MINIMAL_LIGHT_CSS = `:root {
  --color-primary: #2563EB;
  --color-accent: #0EA5E9;
  --surface: #FFFFFF;
  --surface-2: #F8FAFC;
  --text: #0F172A;
  --text-muted: #64748B;
  --border: #E2E8F0;
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.25rem;
  --font-size-xl: 1.5rem;
  --shadow-1: 0 1px 2px rgba(15, 23, 42, 0.08);
  --shadow-2: 0 8px 24px rgba(15, 23, 42, 0.12);
}

.dark {
  --surface: #0B1220;
  --surface-2: #111A2C;
  --text: #E2E8F0;
  --text-muted: #94A3B8;
  --border: #1E293B;
  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.5);
  --shadow-2: 0 8px 24px rgba(0, 0, 0, 0.6);
}
`;

const EDITORIAL_INK_CSS = `:root {
  --color-primary: #31628F;
  --color-accent: #B0532F;
  --surface: #F6F3EC;
  --surface-2: #EFEAE0;
  --text: #262420;
  --text-muted: #6B655A;
  --border: #E2DDD2;
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.25rem;
  --font-size-xl: 1.625rem;
  --shadow-1: 0 1px 3px rgba(38, 36, 32, 0.1);
  --shadow-2: 0 10px 28px rgba(38, 36, 32, 0.14);
}

.dark {
  --surface: #15130F;
  --surface-2: #1D1A14;
  --text: #F6F3EC;
  --text-muted: #A39B8B;
  --border: #2A2620;
  --shadow-1: 0 1px 3px rgba(0, 0, 0, 0.5);
  --shadow-2: 0 10px 28px rgba(0, 0, 0, 0.55);
}
`;

const MIDNIGHT_SAAS_CSS = `:root {
  --color-primary: #7C3AED;
  --color-accent: #22D3EE;
  --surface: #0A0A0F;
  --surface-2: #14141D;
  --text: #F4F4F5;
  --text-muted: #9CA3AF;
  --border: #26263A;
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.25rem;
  --font-size-xl: 1.5rem;
  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.6);
  --shadow-2: 0 12px 32px rgba(124, 58, 237, 0.25);
}

.dark {
  --surface: #050508;
  --surface-2: #0E0E16;
  --text: #FAFAFA;
  --text-muted: #A1A1AA;
  --border: #1F1F30;
}
`;

const PLAYFUL_ROUNDED_CSS = `:root {
  --color-primary: #EC4899;
  --color-accent: #F59E0B;
  --surface: #FFF7FB;
  --surface-2: #FDEFF7;
  --text: #3B0764;
  --text-muted: #9D6DB3;
  --border: #F5D0E5;
  --space-1: 0.375rem;
  --space-2: 0.625rem;
  --space-3: 1rem;
  --space-4: 1.375rem;
  --radius-sm: 12px;
  --radius-md: 20px;
  --radius-lg: 28px;
  --font-size-sm: 0.9375rem;
  --font-size-base: 1.0625rem;
  --font-size-lg: 1.375rem;
  --font-size-xl: 1.75rem;
  --shadow-1: 0 2px 6px rgba(236, 72, 153, 0.16);
  --shadow-2: 0 12px 32px rgba(236, 72, 153, 0.22);
}

.dark {
  --surface: #1B1023;
  --surface-2: #251531;
  --text: #FBE8FF;
  --text-muted: #C79FD9;
  --border: #3E2251;
  --shadow-1: 0 2px 6px rgba(0, 0, 0, 0.5);
  --shadow-2: 0 12px 32px rgba(0, 0, 0, 0.55);
}
`;

const ENTERPRISE_DENSE_CSS = `:root {
  --color-primary: #1E40AF;
  --color-accent: #0369A1;
  --surface: #FFFFFF;
  --surface-2: #F1F5F9;
  --text: #111827;
  --text-muted: #4B5563;
  --border: #CBD5E1;
  --space-1: 0.125rem;
  --space-2: 0.25rem;
  --space-3: 0.5rem;
  --space-4: 0.75rem;
  --radius-sm: 2px;
  --radius-md: 4px;
  --radius-lg: 6px;
  --font-size-sm: 0.75rem;
  --font-size-base: 0.8125rem;
  --font-size-lg: 0.9375rem;
  --font-size-xl: 1.125rem;
  --shadow-1: 0 1px 1px rgba(17, 24, 39, 0.06);
  --shadow-2: 0 4px 12px rgba(17, 24, 39, 0.1);
}

.dark {
  --surface: #0F172A;
  --surface-2: #1E293B;
  --text: #E5E7EB;
  --text-muted: #94A3B8;
  --border: #334155;
  --shadow-1: 0 1px 1px rgba(0, 0, 0, 0.4);
  --shadow-2: 0 4px 12px rgba(0, 0, 0, 0.5);
}
`;

const TERMINAL_MONO_CSS = `:root {
  --color-primary: #22C55E;
  --color-accent: #86EFAC;
  --surface: #0C0F0C;
  --surface-2: #131813;
  --text: #D1FAE5;
  --text-muted: #6EE7A0;
  --border: #1E2A1E;
  --font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --radius-sm: 2px;
  --radius-md: 4px;
  --radius-lg: 6px;
  --font-size-sm: 0.8125rem;
  --font-size-base: 0.875rem;
  --font-size-lg: 1.0625rem;
  --font-size-xl: 1.25rem;
  --shadow-1: 0 0 0 1px rgba(34, 197, 94, 0.15);
  --shadow-2: 0 0 24px rgba(34, 197, 94, 0.18);
}

.dark {
  --surface: #050705;
  --surface-2: #0B0F0B;
  --text: #ECFDF5;
  --text-muted: #86EFAC;
  --border: #162116;
}
`;

export const DESIGN_TEMPLATES: DesignTemplate[] = [
  {
    id: "minimal-light",
    name: "Minimal light",
    description: "Neutral SaaS baseline: cool grays, a single blue accent, quiet shadows.",
    css: MINIMAL_LIGHT_CSS,
    components: coreComponents([
      {
        name: "Badge",
        description: "Small status label.",
        css: `.badge { display: inline-block; border-radius: var(--radius-lg); padding: var(--space-1) var(--space-3); font-size: var(--font-size-sm); background: var(--surface-2); color: var(--color-primary); border: 1px solid var(--border); }`,
        markup: `<span class="badge">Active</span>`,
      },
    ]),
  },
  {
    id: "editorial-ink",
    name: "Editorial ink",
    description: "Warm paper and fired clay: ink text on cream, calm and legible.",
    css: EDITORIAL_INK_CSS,
    components: coreComponents([
      {
        name: "Pull quote",
        description: "Editorial emphasis block.",
        css: `.pullquote { border-left: 3px solid var(--color-accent); padding: var(--space-2) var(--space-4); font-size: var(--font-size-lg); font-style: italic; color: var(--text); background: var(--surface-2); border-radius: var(--radius-sm); max-width: 380px; }`,
        markup: `<blockquote class="pullquote">Good typography is invisible until it is missing.</blockquote>`,
      },
    ]),
  },
  {
    id: "midnight-saas",
    name: "Midnight SaaS",
    description: "Dark-first product chrome with high-contrast violet and cyan accents.",
    css: MIDNIGHT_SAAS_CSS,
    components: coreComponents([
      {
        name: "Stat tile",
        description: "KPI tile for dashboards.",
        css: `.stat { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--space-4); max-width: 200px; box-shadow: var(--shadow-2); }
.stat .num { font-size: var(--font-size-xl); font-weight: 700; color: var(--color-accent); }
.stat .lbl { font-size: var(--font-size-sm); color: var(--text-muted); }`,
        markup: `<div class="stat"><div class="num">98.2%</div><div class="lbl">Uptime this month</div></div>`,
      },
    ]),
  },
  {
    id: "playful-rounded",
    name: "Playful rounded",
    description: "Large radii, saturated pink and amber accents, generous spacing.",
    css: PLAYFUL_ROUNDED_CSS,
    components: coreComponents([
      {
        name: "Chip",
        description: "Rounded filter chip.",
        css: `.chip { display: inline-block; border-radius: 999px; padding: var(--space-1) var(--space-3); font-size: var(--font-size-sm); font-weight: 600; background: var(--color-accent); color: var(--surface); box-shadow: var(--shadow-1); }`,
        markup: `<span class="chip">New!</span>`,
      },
    ]),
  },
  {
    id: "enterprise-dense",
    name: "Enterprise dense",
    description: "Compact spacing, conservative blues, small type for data-heavy screens.",
    css: ENTERPRISE_DENSE_CSS,
    components: coreComponents([
      {
        name: "Table row",
        description: "Dense data row.",
        css: `.row { display: flex; gap: var(--space-4); align-items: center; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: var(--space-2) var(--space-3); font-size: var(--font-size-base); background: var(--surface); color: var(--text); max-width: 420px; }
.row .key { color: var(--text-muted); min-width: 120px; }`,
        markup: `<div class="row"><span class="key">INV-2041</span><span>Acme Inc</span><span>$1,250.00</span></div>`,
      },
      {
        name: "Toolbar",
        description: "Compact action strip.",
        css: `.toolbar { display: inline-flex; gap: var(--space-2); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--space-2); }
.toolbar button { border: 0; background: transparent; color: var(--color-primary); font-size: var(--font-size-sm); font-weight: 600; cursor: pointer; padding: var(--space-1) var(--space-2); border-radius: var(--radius-sm); }`,
        markup: `<div class="toolbar"><button>Filter</button><button>Export</button><button>Columns</button></div>`,
      },
    ]),
  },
  {
    id: "terminal-mono",
    name: "Terminal mono",
    description: "Monospace everything, terminal greens on near-black, hairline borders.",
    css: TERMINAL_MONO_CSS,
    components: coreComponents([
      {
        name: "Prompt line",
        description: "Terminal prompt sample.",
        css: `.prompt { font-family: var(--font-family); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--space-3) var(--space-4); font-size: var(--font-size-base); color: var(--text); max-width: 420px; box-shadow: var(--shadow-1); }
.prompt .sigil { color: var(--color-primary); font-weight: 700; }`,
        markup: `<div class="prompt"><span class="sigil">athena&gt;</span> deploy --env production</div>`,
      },
    ]),
  },
];

export function getTemplate(id: string): DesignTemplate | undefined {
  return DESIGN_TEMPLATES.find((t) => t.id === id);
}
