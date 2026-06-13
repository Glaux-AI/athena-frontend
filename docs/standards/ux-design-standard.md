# Athena UX Design Standard - Global

> Every screen in Athena obeys this standard. Every component, every layout, every
> motion, every empty state. This is **prescriptive**, not aspirational. Deviations
> require a design-system CODEOWNER sign-off and a comment in this doc.
>
> Inspirations: Linear (density + speed), Stripe (data hierarchy), Vercel
> (restraint + craft), Apple (motion + whitespace), Notion (calm authority). We
> are *enterprise-grade*: serious, fast, beautiful, never theatrical.

---

## 1 · Tenets (the non-negotiables)

1. **Content density over chrome.** Every pixel earns its place. We default to tight
   layouts with strong hierarchy, not generous whitespace for "luxury feel."
2. **Type system first.** Five size steps, three weights, one face (Inter). All
   visual hierarchy starts here.
3. **Color discipline.** Twelve semantic tokens, OKLCH-defined, light + dark + auto.
   No literal colors in components - always `var(--token)`.
4. **Motion budget.** 120–300ms easings. Motion is feedback, never decoration.
   `prefers-reduced-motion` respected everywhere.
5. **One layout primitive set.** Stack / Cluster / Sidebar / Grid / Center. No
   bespoke flexbox per screen.
6. **Empty / loading / error are first-class.** Designed before the happy path.
7. **Keyboard first.** Every interaction reachable by keyboard. `⌘K` everywhere.
   `j/k` for vertical lists. `?` opens shortcuts.
8. **Streaming feels alive.** Agent runs animate with token-by-token, tool-call
   chips appear in real time, the mascot reacts.
9. **Accessibility AA, always.** Focus rings visible, semantic HTML, screen-reader
   live regions, color contrast verified in CI.
10. **The Mascot tells the truth.** Sophia (the owl) reacts to what's actually
    happening - never lies about state.

---

## 2 · Type system

**Face**: Inter (variable). System UI fallback. **Mono**: JetBrains Mono.

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `text-display` | 36 / 40 | 600 | Hero only (marketing) |
| `text-2xl` | 24 / 32 | 600 | Page titles |
| `text-xl` | 20 / 28 | 600 | Section titles, card titles when prominent |
| `text-lg` | 18 / 26 | 500 | Card titles (default) |
| `text-base` | 15 / 22 | 400 | Body, defaults |
| `text-sm` | 13 / 20 | 400 | Secondary, metadata |
| `text-xs` | 12 / 16 | 500 (uppercase + 0.05em tracking) | Labels, badges, eyebrow text |
| `text-mono` | 13 / 20 | 400 (mono) | Code, paths, IDs |

**Rules**:
- One `text-2xl` per page (the page title).
- Body text is `text-base`. Always.
- Never use `text-lg` for body - that's a card title style.
- Tabular numbers (`font-variant-numeric: tabular-nums`) for any numeric data table.

---

## 3 · Color system

All colors via CSS variables. **OKLCH** because perceptual uniformity matters when
you have hundreds of components.

### 3.1 Tokens

```css
/* Light (default) */
:root {
  /* Surfaces */
  --bg:           oklch(99% 0   0);     /* page */
  --surface:      oklch(100% 0  0);     /* card */
  --surface-2:    oklch(97% 0.005 250); /* nested card, hover */
  --surface-3:    oklch(94% 0.005 250); /* keyboard surface */
  --overlay:      oklch(20% 0.02 250 / 0.6); /* modal scrim */

  /* Text */
  --text:         oklch(20% 0.02 250);  /* primary text */
  --text-muted:   oklch(45% 0.02 250);  /* secondary text */
  --text-subtle:  oklch(60% 0.015 250); /* metadata, captions */

  /* Borders + dividers */
  --border:       oklch(92% 0.005 250);
  --border-strong:oklch(85% 0.01 250);

  /* Brand (tenant-overridable; defaults Athena indigo) */
  --primary:      oklch(50% 0.18 260);
  --primary-fg:   oklch(98% 0 0);
  --primary-soft: oklch(94% 0.05 260);
  --ring:         oklch(60% 0.18 260);

  /* Semantic */
  --success:      oklch(60% 0.15 145);
  --success-soft: oklch(94% 0.06 145);
  --warning:      oklch(72% 0.15 75);
  --warning-soft: oklch(96% 0.07 80);
  --danger:       oklch(55% 0.20 25);
  --danger-soft:  oklch(95% 0.08 25);
  --info:         oklch(58% 0.13 230);
  --info-soft:    oklch(95% 0.05 230);

  /* Semantic foregrounds - text/icons ON the solid --X fill (not the -soft
   * tint). AA ≥ 4.5:1, both themes (see §3.2). Flips per theme like --primary-fg. */
  --danger-fg:    oklch(100% 0 0);      /* white passes on the darker light danger (5.4:1) */
  --warning-fg:   oklch(27% 0.05 75);   /* dark amber ink (6.0:1) */
  --success-fg:   oklch(19% 0.04 145);  /* dark green ink (5.0:1) */
  --info-fg:      oklch(17% 0.04 230);  /* dark blue ink (4.7:1) */

  /* Semantic on-tint ink - text/icons ON the -soft TINT (not the solid fill).
   * The solid --X can't pass AA as text on its own tint (--warning on
   * --warning-soft is 2.18:1) → these inks clear AA ≥ 4.5:1 on -soft, both
   * themes (§3.2). Use `bg-[--X-soft] text-[--X-ink]`; mirrors --acc-*-ink. */
  --danger-ink:   oklch(42% 0.18 25);
  --warning-ink:  oklch(42% 0.14 75);
  --success-ink:  oklch(38% 0.14 145);
  --info-ink:     oklch(38% 0.14 230);

  /* Code + diff (used in code views) */
  --code-bg:      oklch(98% 0.005 250);
  --diff-add:     oklch(94% 0.07 145);
  --diff-del:     oklch(94% 0.08 25);

  /* Mascot - blue palette (cute owl, see §7) */
  --sophia-body:        oklch(60% 0.07 240);   /* dusty blue plumage */
  --sophia-body-deep:   oklch(48% 0.08 240);   /* wings, deeper blue */
  --sophia-disc:        oklch(92% 0.025 240);  /* facial discs + belly */
  --sophia-disc-rim:    oklch(60% 0.07 240);   /* subtle disc border */
  --sophia-eye:         oklch(15% 0.04 260);   /* deep navy */
  --sophia-eye-shine:   oklch(100% 0 0);       /* white kawaii highlight */
  --sophia-beak:        oklch(70% 0.15 50);    /* warm orange, high contrast vs blue */
  --sophia-beak-deep:   oklch(55% 0.13 50);
  --sophia-cheek:       oklch(82% 0.08 350);   /* soft pink blush */
  --sophia-belly-mark:  oklch(60% 0.07 240);   /* feather chevrons */
  --sophia-halo:        oklch(78% 0.07 250);
  --sophia-sparkle:     oklch(70% 0.15 50);
  --sophia-alert-bg:    oklch(92% 0.04 230);
  --sophia-alert-fg:    oklch(45% 0.13 230);
  --sophia-dot:         oklch(45% 0.02 250);
}

.dark {
  --bg:           oklch(15% 0.02 250);
  --surface:      oklch(19% 0.02 250);
  --surface-2:    oklch(23% 0.02 250);
  --surface-3:    oklch(28% 0.02 250);
  --overlay:      oklch(10% 0 0 / 0.7);

  --text:         oklch(96% 0 0);
  --text-muted:   oklch(70% 0.02 250);
  --text-subtle:  oklch(55% 0.02 250);

  --border:       oklch(27% 0.01 250);
  --border-strong:oklch(35% 0.01 250);

  --primary:      oklch(65% 0.18 260);
  --primary-fg:   oklch(15% 0 0);
  --primary-soft: oklch(28% 0.10 260);
  --ring:         oklch(70% 0.18 260);

  --success:      oklch(65% 0.15 145);
  --success-soft: oklch(28% 0.08 145);
  --warning:      oklch(75% 0.15 75);
  --warning-soft: oklch(30% 0.10 75);
  --danger:       oklch(65% 0.20 25);
  --danger-soft:  oklch(28% 0.10 25);
  --info:         oklch(65% 0.13 230);
  --info-soft:    oklch(28% 0.10 230);

  /* Semantic foregrounds - dark-mode --danger is brighter, so white fails
   * (3.6:1) → dark red ink; the rest match :root. */
  --danger-fg:    oklch(20% 0.04 25);   /* dark red ink on bright danger (5.2:1) */
  --warning-fg:   oklch(27% 0.05 75);   /* dark amber ink (6.7:1) */
  --success-fg:   oklch(19% 0.04 145);  /* dark green ink (6.0:1) */
  --info-fg:      oklch(17% 0.04 230);  /* dark blue ink (6.0:1) */

  /* Semantic on-tint ink - see :root note. Dark -soft tints are dark, so the
   * legible ink flips light (like --acc-*-ink in .dark). */
  --danger-ink:   oklch(82% 0.14 25);
  --warning-ink:  oklch(82% 0.13 75);
  --success-ink:  oklch(82% 0.11 145);
  --info-ink:     oklch(82% 0.12 230);

  --code-bg:      oklch(22% 0.01 250);
  --diff-add:     oklch(30% 0.10 145);
  --diff-del:     oklch(30% 0.12 25);
}
```

### 3.2 Rules

- **Never** use Tailwind color literals (`text-blue-500`) - only tokens
  (`text-[var(--text)]`, `bg-[var(--surface)]`).
- **Never** add a new token without design-system CODEOWNER review.
- **Brand** (`--primary`) is the *only* color that can be tenant-overridden at
  runtime (via a CSS variable injection on the protected layout).
- **Text/icons on a solid semantic fill** (`bg-[var(--danger)]` / `--warning` /
  `--success` / `--info`) use the matching foreground token
  (`text-[var(--danger-fg)]`, …) - **never `text-white`**. White fails AA on the
  light-amber `--warning` (both themes) and on the brighter dark-mode `--danger`.
  Each `--X-fg` is theme-tuned (like `--primary-fg`) to stay ≥ 4.5:1 on its solid.
- **Text/icons on a tinted `-soft` fill** (`bg-[var(--danger-soft)]`, …, incl.
  status pills, badges, and `-soft` alert cards) use the matching on-tint ink
  `text-[var(--X-ink)]` - **never the solid `text-[var(--X)]`**, which fails AA
  as text on its own light tint (`--warning` on `--warning-soft` = 2.18:1). Each
  `--X-ink` is theme-tuned (dark ink in light mode, light ink in dark mode) like
  `--acc-*-ink`. `--primary-soft` is exempt (tenant-overridable → no static ink).
- **Token pairs must pass WCAG AA.** Solid↔foreground (`--X` / `--X-fg`,
  `--primary` / `--primary-fg`) **and** soft↔ink (`--X-soft` / `--X-ink`) pairs
  are guarded for both themes by `tests/unit/tokens-contrast.test.ts`; rendered
  pages are checked by the axe-core `color-contrast` audit in Lighthouse CI
  (`.lighthouserc.json`) plus `jest-axe` per component.
- **Translate, never literal.** The Linear/Modern depth layer (§3.3) ships as
  tokens. A spec written in hex / white-opacity (`#5E6AD2`, `bg-white/[0.05]`,
  `text-white/70`) must be **mapped to tokens**, never pasted in.

---

### 3.3 Depth, ambient lighting & glass (Linear/Modern layer)

Athena's surfaces are **layered, not flat** (inspired by Linear / Vercel /
Raycast). Depth comes from token-driven translucency, hairline borders,
multi-layer shadows, and soft accent glow - never literal colors. Every depth
token has a faithful **light + dark** value (see `styles/tokens.css`); dark is
a "deep space" near-black canvas, light is an airy near-white translation.

**Surface + border + glow tokens**

| Token | Use |
|---|---|
| `--bg-deep` / `--bg` | deepest band / page canvas (dark ≈ `oklch(13.5% …)`) |
| `--surface` / `--surface-2` / `--surface-3` | card / nested / keyboard surfaces |
| `--surface-elevated` | floating panels, mock interfaces |
| `--surface-glass` / `--surface-glass-hover` | frosted translucent surfaces (pair with `.glass`) |
| `--border` / `--border-soft` / `--border-strong` | hairline → faint → emphasized dividers (translucent) |
| `--border-accent` | accent-tinted border for emphasis |
| `--glow-accent` / `--glow-accent-strong` | ambient accent light pools |

**Multi-layer shadows** - never a single shadow. Each token layers a border
highlight + soft diffuse + ambient depth:

| Token | Use |
|---|---|
| `--shadow-1` | calm raised (default `Card`; dense surfaces) |
| `--shadow-2` | raised / hover |
| `--shadow-3` | floating (modals, palettes, sheets) |
| `--shadow-glow` | accent glow (featured / hovered *moment*) |
| `--shadow-cta` | primary CTA (accent ring + glow + inner highlight) |
| `--inner-highlight` | 1px top-edge sheen on elevated surfaces |

**Glass**: the `.glass` utility = `--surface-glass` + `backdrop-blur(--glass-blur)`.
Use for floating chrome on *moment* surfaces (topbar, palettes, modals). It
sets its own hairline `border` and is unlayered, so a per-side border utility
won't override it - add a full `border-[var(--ring)]` when you need a focus
border.

**Ambient composition** (`--ambient-1..3`, `--ambient-pulse`, `--grid-line`,
`--grid-size`) drives `<AmbientBackground>` (§17). Deep blur on the blobs
(`blur 120–150px`) is GPU-heavy - keep it on a few `-z-10` decorative layers
behind *moment* surfaces only, never behind dense data.

---

## 4 · Spacing scale

Base unit: **4px**. Use only:

| Token | px | Common use |
|---|---|---|
| `space-1` | 4 | Inside-icon gap |
| `space-2` | 8 | Stack of related items |
| `space-3` | 12 | Form fields |
| `space-4` | 16 | Default card padding |
| `space-5` | 20 | (rare) |
| `space-6` | 24 | Section gap |
| `space-8` | 32 | Page section |
| `space-12` | 48 | Page sections (loose) |
| `space-16` | 64 | Top-of-page block |

**Default page padding**: 24px on mobile, 32px on desktop. **Default card padding**:
16px. Cards with prominent titles get 20–24px.

---

## 5 · Layout primitives

Five primitives - every layout uses them. No bespoke flex / grid per screen.

### 5.1 `<Stack>` - vertical rhythm

```tsx
<Stack gap="4">
  <h2>Recent runs</h2>
  <Card>…</Card>
  <Card>…</Card>
</Stack>
```

Renders `flex flex-col gap-[var(--space-{N})]`.

### 5.2 `<Cluster>` - horizontal flowing

```tsx
<Cluster gap="2" align="center">
  <Avatar />
  <span className="text-base">{user.name}</span>
  <Badge>{user.role}</Badge>
</Cluster>
```

`flex flex-wrap items-{align} gap-…`.

### 5.3 `<Sidebar>` - fixed-width nav + flexible content

Used for the app shell.

### 5.4 `<Grid>` - explicit columns

For card grids only. Min/max widths enforced.

### 5.5 `<Center>` - centered viewport

For empty states, login, error boundaries.

Every page chooses one top-level primitive; nests as needed.

---

## 6 · The app shell

Single shell for every authenticated page.

```
┌───────────────────────────────────────────────────────────────────────────┐
│ TopBar (56px)                                                              │
│ [Sophia] [Athena wordmark]  [Workspace switcher]   [⌘K] [Notif] [Avatar]  │
├──────────────┬────────────────────────────────────────────────────────────┤
│              │                                                            │
│  Sidebar     │   Main                                                     │
│  (240px;     │                                                            │
│   collapses  │                                                            │
│   to 56px)   │                                                            │
│              │                                                            │
│  • Dashboard │                                                            │
│  • Runs      │                                                            │
│  • Projects  │                                                            │
│  • Memory    │                                                            │
│  • Knowledge │                                                            │
│  • Settings  │                                                            │
│              │                                                            │
│              │                                                            │
└──────────────┴────────────────────────────────────────────────────────────┘
```

- TopBar is fixed; never scrolls.
- Sidebar is sticky; scrolls inside its own height.
- Sidebar collapses to icon-only at < 1024px wide (and on user pin).
- Main column: max-width on text-heavy pages (`max-w-screen-md` for forms,
  `max-w-screen-2xl` for dashboards).

---

## 7 · Sophia - the Athena mascot

A small owl mascot sits **immediately to the left** of the wordmark in the
TopBar. Sophia (Greek for wisdom) gives Athena a face. Her expression reacts to
what's happening on the current screen - never lies about state.

### 7.1 Why she exists

- **Emotional signal** - long agent runs feel less mechanical when a mascot is
  visibly along for the ride.
- **State at a glance** - even before reading a status pill, the user knows
  whether things are going well from Sophia's face.
- **Brand** - gives Athena a personality without anthropomorphising the agent
  itself. The agent is the agent; Sophia is the brand.
- **Delight** - the smallest design choice that lands biggest with end users.

### 7.2 Moods

**Eight moods. All neutral or positive - Sophia never looks sad.** When things
go wrong, she becomes *alert* and *focused*, not worried; the truth is carried
by status pills + banners, not by Sophia's face. This is a deliberate choice:
the mascot is a brand surface, not an error indicator.

Each mood is an SVG variant of the same base owl silhouette (the silhouette is
constant; eyes / brows / beak / wings / accessories vary).

| Mood | Trigger | Visual cues |
|---|---|---|
| `idle` | default; no active run | gentle blink every 4s; small wing twitch; faint smile |
| `reading` | ingestion or doc retrieval | eyes look down (neutral); tiny pages float beside her |
| `thinking` | model reasoning | head tilt + eyes half-closed (neutral); subtle "…" |
| `writing` | drafting PRD / Design / Code | quill in talon; small nodding (neutral focused) |
| `working` | tool calls executing | wings up; eyes wide and alert (neutral focused) |
| `waiting` | run paused on a human gate | looks up expectantly; soft warm glow (positive-leaning neutral) |
| `happy` | run completed successfully; PR merged; CI green | eyes closed in joy; tiny hop |
| `focused` | error / CI red / gate rejected - situations that need attention | eyes wide, alert; slight forward lean; a tiny "!" appears briefly (alert, never sad) |

**Removed/banned moods**: no `sad`, `worried`, `crying`, `disappointed`,
`tired`, `sleeping`, `bored`, or `frowning` variants - ever. Long-idle does
**not** trigger a sleeping mood; Sophia simply stays in `idle` indefinitely with
slightly slower blinks.

### 7.3 Source-of-truth state

Mood is **derived**, not authored per-page. A small zustand store
(`useMascotStore`) holds the current mood. Two inputs:

1. **Per-screen default** - every protected route declares its idle mood via a
   `<MascotMood>` component or via route metadata:

   ```tsx
   export const metadata: PageMeta = { mascotDefault: "idle" };
   ```

2. **Active-run override** - if any run owned by the current user (or visible on
   the current screen) is running, SSE events drive the mood:
   - `agent_step kind=plan|reason` → `thinking`
   - `agent_step kind=retrieve|read` → `reading`
   - `agent_step kind=draft|write` → `writing`
   - `tool_call` → `working` (for 800ms after each call)
   - `gate_pending` → `waiting`
   - `run_status=completed` → `happy` for 4s, then back to default
   - `run_status=failed | cancelled | gate_rejected` → `focused` for 4s, then back to default
   - Long-idle → no special mood; remain `idle` (slower ambient blink only)

Active-run state always wins over per-screen default. When no run is active and
no screen has declared an override, mood is `idle`.

### 7.4 Component contract

```tsx
// components/mascot/sophia.tsx

type Mood =
  | "idle" | "reading" | "thinking" | "writing"
  | "working" | "waiting" | "happy" | "focused";   // 8 moods, all neutral-to-positive

export function Sophia({ size = 28 }: { size?: number }) {
  const mood = useMascotStore(s => s.mood);
  return (
    <span
      className="sophia"
      data-mood={mood}
      aria-hidden="true"           // never announce mood to screen readers
      style={{ width: size, height: size }}
    >
      <OwlSvg mood={mood} />
    </span>
  );
}
```

### 7.5 Animation rules

Each mood has one or two ambient micro-animations, never more. All keyframes
ship in `tailwind.config.ts`; classes referenced from the component live in
`components/mascot/sophia.tsx`.

| Mood | Animation(s) | Duration | Target element(s) |
|---|---|---|---|
| `idle` | `sophia-blink` | 4.5s | eyes group |
| `reading` | `sophia-float` | 2.2s | book accent |
| `thinking` | `sophia-tilt` + `sophia-dot` (×3, staggered 180ms) | 3.5s / 1.4s | whole body / dots |
| `writing` | `sophia-blink` + `sophia-float` | 4.5s / 2.2s | eyes / quill accent |
| `working` | `sophia-breathe` + `sophia-wing-l` + `sophia-wing-r` | 2.6s / 0.6s / 0.6s | whole body / wings |
| `waiting` | `sophia-halo` | 2.4s | halo ring |
| `happy` | `sophia-hop` + `sophia-sparkle-{1,2,3}` (staggered 400ms) | 1.4s / 2.4s | whole body / sparkles |
| `focused` | `sophia-alert` | 1.5s | alert badge |

Rules:

- All transitions ≤ 300ms, ease-out. Animations 0.6–4.5s, ease-in-out, infinite.
- Crossfade between moods (opacity 0→1 on the new mood layer, 1→0 on the old).
- Body-level animations (`hop`, `tilt`, `breathe`) wrap the whole owl. Per-feature
  animations (`blink`, `wing-flap-*`, `halo`, `alert`, `dot`, `float`, `sparkle`)
  wrap their own group only.
- `transform-origin` + `transform-box: fill-box` is required on every animated
  SVG group so transforms originate from the element's own bounding box.
- **`prefers-reduced-motion: reduce`** disables every Sophia animation; the
  global CSS rule in `styles/tokens.css` covers this.
- Frame rate: 60fps on desktop, 30fps fine on mobile. CSS `transform` + `opacity`
  only - no animated layout properties.

### 7.6 Accessibility

- `aria-hidden="true"` always (decorative).
- Mood is **never** the only signal - a status pill / banner / live region
  always carries the truth for screen readers.
- Color is **never** the only signal in Sophia's design either (`focused` uses
  eye-widening + forward lean + a brief "!" accent, not just color).

### 7.7 Where to put her, where not to

| Place | Use Sophia? |
|---|---|
| TopBar (next to wordmark) | ✓ always |
| Login / logged-out pages | ✓ (`idle`) - gives the marketing surface warmth |
| Inside a card / inline | ✗ - she lives in one place |
| Embed / iframe surfaces | ✗ - strip her in embeds (less chrome) |
| Print views | ✗ |

### 7.8 What Sophia is *not*

- Not the **agent** - the agent is invisible (it's a graph). Sophia is the
  product's face.
- Not a **chat avatar** - agent messages don't get Sophia's face. They get the
  agent's name + a neutral icon.
- Not **animated wildly** - she's calm. Restraint beats personality.

---

## 8 · Components - shadcn/ui as the floor

We vendor shadcn/ui into `components/ui/` and own the source. Customizations
live there. **Do not** depend on external component libraries beyond shadcn.

### 8.1 Required primitives (v1)

`Button`, `Card`, `Dialog`, `Sheet`, `Tabs`, `Tooltip`, `Popover`, `Select`,
`Input`, `Textarea`, `Form`, `Badge`, `Toast` (sonner), `Command` (cmdk),
`Accordion`, `Alert`, `Avatar`, `Separator`, `DataTable` (tanstack-table
wrapper), `EmptyState`, `Skeleton`, `Spinner`.

### 8.2 Higher-order components we own

| Component | Purpose |
|---|---|
| `<PageHeader>` | Title + actions area |
| `<EmptyState icon title description action>` | Designed empty states |
| `<StatusPill>` | Stable colors for run statuses |
| `<CostPill>` | $-value with tooltip |
| `<CitationChip>` | Athena URI rendered as a hoverable chip |
| `<KeyboardHint>` | A small kbd-styled hint |
| `<GateCard>` | Standardised approval card |
| `<RunStreamPanel>` | Live agent activity |
| `<Mascot>` (Sophia) | This doc, §7 |

### 8.3 Button rules

- Variants: `primary` (one per page), `secondary`, `ghost`, `destructive`.
- Sizes: `sm`, `md`, `lg`. Default `md`.
- Loading state built in (`loading` prop) - shows a spinner *and* disables.
- Always has an explicit `aria-label` if it's icon-only.

---

## 9 · Empty / loading / error states

Designed for every list, every detail page, every panel.

### 9.1 Loading

- Skeletons for known shapes (cards, table rows).
- `Spinner` only for in-flight short actions (< 2s).
- For long actions (agent runs), the run stream panel is the loading state.

### 9.2 Empty

Always uses `<EmptyState>` with:

- Friendly icon (lucide).
- One-line title.
- One-sentence description.
- One primary CTA.

Example: "No runs yet · Start your first run by typing a goal above · [Start a
run]"

### 9.3 Error

- Inline with retry button.
- Toast for transient mutation failures.
- Full-page error boundary for unexpected runtime errors.

---

## 10 · Motion

- Easings: `ease-out` for entering, `ease-in` for exiting, `cubic-bezier(.4,0,.2,1)`
  for both-direction.
- Durations:
  - Hover / press: 100ms
  - Toast / popover / dropdown: 150ms
  - Dialog: 180ms
  - Sheet (right-side panel): 240ms
  - Page transition: 200ms
- Token: `transition-default = 200ms cubic-bezier(.4,0,.2,1)`.
- **No CSS spring** in v1. Linear/Apple use them but they require careful
  tuning.
- `prefers-reduced-motion: reduce` → all durations → 0ms (snap), opacity-only
  state changes.

---

## 11 · Streaming, real-time, agent activity

The run page is the **most demanding** screen. Rules:

- Token chunks coalesce in a 100ms buffer before applying to state (avoid
  per-token re-render).
- Each step in the stream panel is a stable React key (`step-id`); reorder only
  by step boundary.
- Tool-call chips appear on `tool_call`, animate to `success | error | pending`
  on the matching `tool_result`.
- Live region announces *step-level* updates (not token-level - that's
  screen-reader noise).
- Mascot reads the same SSE event stream and reacts.
- "Auto-scroll" follows newest event unless the user has scrolled up; a small
  "new activity" toast nudges them back.

---

## 12 · Keyboard

Every screen ships with a documented keymap. Defaults (global):

| Combo | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Command palette (search + navigate) |
| `/` | Focus search in the current screen |
| `g r` | Go to Runs |
| `g p` | Go to Projects |
| `g s` | Go to Settings |
| `?` | Show shortcuts dialog |
| `Esc` | Close dialog / sheet / cancel |
| `j / k` | Move down / up in a list |
| `Enter` | Open focused item |
| `c` | Cancel active run (run page only; confirms) |
| `a / r` | Approve / Reject focused gate |

The keymap is documented in a built-in `?` dialog (auto-listed from
`<KeyboardHint>` registrations).

---

## 13 · Responsive breakpoints

| Token | Min width |
|---|---|
| `sm` | 640px |
| `md` | 768px (tablet) |
| `lg` | 1024px (laptop) |
| `xl` | 1280px |
| `2xl` | 1536px |

Defaults:
- App shell mobile-first; sidebar collapses to icon-only below `lg`.
- Run page: 3-pane on `xl+`, 2-pane on `lg`, 1-pane stacked below `lg`.
- Mobile = read-only flows: approve gates, view runs, view PR status.
  Authoring (PRD editor, code workspace) is desktop-only.

---

## 14 · Accessibility - what we verify

| Check | Tool |
|---|---|
| Color contrast AA on every token pair | CI script |
| `jest-axe` clean on every component | unit tests |
| Playwright a11y scan on every E2E path | E2E |
| Focus order on every form, dialog | Manual review per PR |
| Live regions on async updates | Code review |
| Reduced motion respected | Manual + CI snapshot diff |

**A new component that fails any of these does not ship.**

---

## 15 · What you may not do

- Use a Tailwind color literal in a component.
- Inline `style={{ color: "..." }}` for theming.
- Build a one-off layout with raw flex/grid when a primitive exists.
- Ship a screen without empty / loading / error states.
- Add a new font.
- Animate without `prefers-reduced-motion` consideration.
- Use emoji in production UI by default. (Mascot uses SVG, not emoji.)
- Build a custom dropdown when `<Select>` exists.
- Add a new dependency without design-system CODEOWNER sign-off.

---

## 16 · Reference: a screen built right

A correct dashboard card:

```tsx
import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { StatusPill } from "@/components/runs/status-pill";
import { CostPill } from "@/components/runs/cost-pill";

export function RunCard({ run }: { run: Run }) {
  return (
    <Card>
      <Stack gap="3">
        <Cluster justify="between">
          <h3 className="text-lg">{run.goal}</h3>
          <StatusPill status={run.status} />
        </Cluster>
        <Cluster gap="2" className="text-sm text-[var(--text-muted)]">
          <span>{relativeTime(run.startedAt)}</span>
          <span>·</span>
          <span>{run.steps} steps</span>
          <span>·</span>
          <CostPill usd={run.costUsd} />
        </Cluster>
      </Stack>
    </Card>
  );
}
```

Notes: uses primitives, tokens, primitives only. No literal colors. Clear
hierarchy. Tabular data uses `<CostPill>` (which uses tabular-nums).

---

## 17 · Cinematic primitives & the "Moments" rule

The Linear/Modern depth language (§3.3) has a deliberate **intensity gradient**.
Athena stays *serious, never theatrical* (§1) - so the cinematic *signature*
(ambient light, spotlights, parallax, gradient headlines, glow CTAs) is reserved
for **moments**, while dense data surfaces stay **calm**.

### 17.1 The Moments rule

| Surface | Treatment |
|---|---|
| Marketing / login / signup / onboarding | full cinematic - `<AmbientBackground>`, `<GradientText>` headline, `<Button glow>`, `<SpotlightCard>` |
| Page **hero headers** (dashboard, cost, runs/new, scope/cap) | subtle ambient band + `<GradientText>` title |
| Empty states | elevated icon chip (built into `<EmptyState>`) |
| Floating chrome (command + knowledge palette, modals, topbar) | `.glass` + `--shadow-3` |
| Dense data (tables, run timelines, settings forms, lists, graphs) | **calm** - depth tokens + `--shadow-1/2` + ≤8px hover lift only. No blobs/spotlights. |
| Embed / iframe surfaces | minimal - depth tokens only, no ambient/glow |

### 17.2 Primitives (`components/ui/`)

| Primitive | Purpose |
|---|---|
| `<AmbientBackground variant grid>` | layered light pools + noise + masked grid; decorative (`aria-hidden`); first child of a `relative overflow-hidden` container; *moment* surfaces only |
| `<SpotlightCard featured>` | elevated card with cursor-tracking accent glow (CSS-var driven, no React re-render); pricing / feature grids |
| `<GradientText as accent>` | dimensional headline; `accent` shimmers indigo→violet |
| `<Card variant>` | `default` (calm, unchanged) · `elevated` · `glass` · `gradient` |
| `<Button glow>` | accent-glow CTA + hover shine; **one** per hero/marketing surface |

### 17.3 Both themes, always

Every depth token + primitive carries a faithful **light** and **dark** value.
Light mode is an airy near-white translation (soft indigo tints, light-tuned
shadows), not an afterthought - verify both before shipping.

### 17.4 Motion & accessibility

- All cinematic motion is CSS and auto-neutralized by the global
  `prefers-reduced-motion` rule in `styles/tokens.css`. New JS-driven motion
  (scroll/parallax/cursor) must gate on
  `matchMedia('(prefers-reduced-motion: reduce)')`.
- Ambient / spotlight layers are `aria-hidden` and never carry meaning.
- Hover lifts ≤ 8px, 200–300ms, expo/ease-out - never bouncy (§10).
- `--primary` (accent) is for highlights / interaction, not decoration - most
  of the UI stays monochrome.
- Deep-blur ambient layers are GPU-heavy; restrict to `-z-10` decorative layers
  on *moment* surfaces. (They also defeat headless screenshot capture - verify
  those surfaces in a real browser.)
