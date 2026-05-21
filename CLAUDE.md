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
- Adding a sad mood to Sophia — rejected by design.
- Reading `process.env.*` outside `lib/config.ts` — centralize there.
- Hardcoding a backend URL anywhere — always `NEXT_PUBLIC_API_URL`.
- Reading or writing customer data without going through the API client.
- Putting customer data in `localStorage`.
- Logging request bodies, headers, or tokens to the console.

## How to run things locally

```sh
pnpm install
NEXT_PUBLIC_API_URL=http://localhost:8000 pnpm dev

pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:e2e
```

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
