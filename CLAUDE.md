# CLAUDE.md — Athena Web

> Read this first when starting any coding session against this repo, then
> follow the standard linked below.

## What this repo is

The Athena web app — Next.js 15 (App Router) + React 19 + TypeScript +
Tailwind v4 + shadcn/ui-style primitives + **Sophia**, the owl mascot.

This is a browser-only surface. There is no native app. There are no
secrets in this code. All authenticated calls go through a separate API
server reachable at `process.env.NEXT_PUBLIC_API_URL`.

## Read this first

| | Path |
|---|---|
| 1. | [`docs/standards/ux-design-standard.md`](./docs/standards/ux-design-standard.md) — every PR follows this |
| 2. | [`README.md`](./README.md) — repo layout + scripts |
| 3. | [`TESTING.md`](./TESTING.md) — local-run flow |
| 4. | [`SECURITY.md`](./SECURITY.md) — disclosure process |

## The standard in one paragraph

Inter type system (5 sizes, 3 weights). OKLCH color tokens (about 14
semantic tokens). 4 px spacing scale. Five layout primitives (`Stack`,
`Cluster`, `Sidebar`, `Grid`, `Center`). shadcn/ui-style primitives owned
in `components/ui/`. **Sophia** the owl mascot lives next to the wordmark
in the TopBar; her 8 moods (all neutral-to-positive — no sad emotions) are
derived from screen state + Server-Sent Events. Motion budget 120–300 ms.
`prefers-reduced-motion` is honored everywhere. WCAG 2.1 AA verified in
CI.

## Hard rules (PRs rejected for any of these)

- Tailwind color literals (`text-gray-500`) — use tokens
  (`text-[var(--text-muted)]`) instead.
- Inline `style={{ color: '...' }}` for theming — use tokens.
- Bespoke flex/grid where a primitive exists — use the primitive.
- Sophia mood set imperatively from a feature module — derived from the
  store only.
- Screen missing empty / loading / error states — add them.
- **Page-level loading uses skeletons, not spinners.** Component-shaped
  placeholders that match the final layout (see `/knowledge` +
  `/capabilities/[id]` for reference). In-button progress indicators
  during user-initiated submissions (e.g. `<Button loading>` flipping to
  a small spinner while a mutation is in flight) are fine — they're
  user feedback, not loading state. The "skeleton not spinner" rule
  applies to the initial-data-load state of a page or section.
- Adding a sad mood to Sophia — rejected by design.
- Reading `process.env.*` outside `lib/config.ts` — centralize there.
- Hardcoding a backend URL anywhere — always `NEXT_PUBLIC_API_URL`.
- Reading or writing customer data without going through the API client.
- Putting customer data in `localStorage`.
- Logging request bodies, headers, or tokens to the console.
- Functional change without a matching readiness-checklist update → reject.
  See **Readiness-checklist discipline** below.

## Known drift — fix-as-you-touch

These are real violations the codebase carries today. If you're editing
one of these files for any reason, convert it as you go. Tracked here
instead of in commit-blocking lint because the fix per row is small but
the bulk is large.

### Page-level Loader2 spinners (should be skeletons)

The original 15-row register (auth-gate + 14 page loaders) has been
swept — every entry now uses content-shaped skeleton placeholders.
Reference fixes for new contributors to read before writing a new
loading state:

- `app/(protected)/layout.tsx` — AppShell-shaped skeleton (TopBar + sidebar + main)
- `app/(protected)/knowledge/page.tsx` — canvas + side-panel skeleton
- `app/(protected)/capabilities/[id]/page.tsx` — header + KPI + KG card skeleton
- `app/(protected)/cost/page.tsx` — header + KPI grid + chart + per-capability grid
- `app/(protected)/mcp/[id]/page.tsx` — header + 2-col cards + tools + recent calls

Newly-spotted violations not in the original sweep (handle next):

| File | Symptom |
|---|---|
| `components/chat/chat-drawer.tsx:204` | Same "Loading…" cluster as `/chat`, but inside the drawer's conversation pane |

### Other smaller drifts

- `app/(protected)/capabilities/[id]/page.tsx:253` — `Loader2` inside
  a status pill for `indexing` state. This is a **status indicator**
  on a row, not a page-load state — acceptable per the refined rule,
  but consider a tiny pulsing dot for consistency with the freshness
  pills in the knowledge surfaces.

## Readiness-checklist discipline

[`../athena-docs/07-operations/local-readiness-checklist.md`](../athena-docs/07-operations/local-readiness-checklist.md)
is the single source of truth for "what's done / what's pending" across the
whole stack. Every PR/commit that adds or changes functionality **must** also
update the matching row(s) in that file with ✅ / 🟡 / ⬜ in the same change.

- ✅ — implemented **and** verified end-to-end on a clean machine.
- 🟡 — scaffolded or partially wired; what's missing is noted inline.
- ⬜ — not yet implemented; row reserved so future phases don't renumber.

If you can't find a row that matches what you're shipping, add one in the
right phase section rather than skipping the update. A code change without a
checklist update is treated the same as a code change without a test.

## How to run things locally

```sh
pnpm install
NEXT_PUBLIC_API_URL=http://localhost:8000 pnpm dev

pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:e2e
```

For local UI work against the mock backend (no backend server needed),
set `NEXT_PUBLIC_API_MODE=mock` in `.env.local` — the in-process mock in
`lib/api/mock/handlers.ts` will resolve every API call.

**pnpm install blocker on first run.** pnpm 10+ refuses to run the
build scripts of `esbuild`, `sharp`, and `unrs-resolver` by default
(security-of-postinstall feature) and exits 1. This also blocks
`pnpm dev` because dev triggers an implicit dep-status check. Fix once:

```sh
pnpm approve-builds       # interactive — pick all three, save
# OR
node_modules/.bin/next dev --port 3000    # bypass pnpm; goes direct to next
```

## Where the load-bearing surfaces live

The two surfaces a new contributor is most likely to extend:

- **Live SSE on `/runs/[id]`** — `components/runs/live-activity-strip.tsx`.
  Compact 1-line strip (default) with a max-h-64 scrollable timeline on
  expand. Consumes the FE-truth event envelope from
  `features/runs/use-run-stream.ts` (which handles `Last-Event-ID` resume
  + reconnect-with-backoff). The full-height `<RunStreamPanel>` exists
  in code but isn't rendered today; preserved for when the 5-region
  layout for `/runs/[id]` lands.
- **Capability knowledge on `/capabilities/[id]`** —
  `components/capabilities/knowledge-card.tsx` + `repo-knowledge.tsx`.
  Rich visualisation of what ingestion produced: capability summary,
  node-kind histogram, top entities, recent ingestion activity, per-repo
  drill-down with services + top modules + recent commits processed.

## How to add things

### A new screen

1. Add the route under `app/(protected)/<feature>/page.tsx`.
2. Use the five layout primitives — no bespoke flex.
3. Add empty / loading / error states using `<EmptyState>` + skeletons.
4. Use only tokens for colors.
5. Add keyboard shortcuts to the global shortcut registry if relevant.
6. Add Playwright E2E in `tests/e2e/`.

### A new mascot mood

Don't. The mood set is closed at 8. Sophia must remain neutral-to-positive.

## What this app does NOT do

- It does **not** call any LLM directly.
- It does **not** access any database, object store, or queue.
- It does **not** store secrets, tokens, or API keys.
- It does **not** open any port other than the Next.js HTTP server.
- It does **not** install a native runtime, mobile binary, or browser
  extension.

All side-effects happen in the API server, which is operated separately.
