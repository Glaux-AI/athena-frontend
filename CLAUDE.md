# CLAUDE.md — athena-frontend

> Read this **first** when starting any session that will edit code in this
> repo. Then follow the standard below. Then proceed.

## What this repo is

The Athena web app — Next.js 15 (App Router) + React 19 + TypeScript +
Tailwind v4 + shadcn/ui + Sophia the owl mascot.

**Cloud-hosted browser surface only.** No native iOS / Android / Mac / Windows /
Electron apps, ever. Mobile = responsive web.

Siblings:
- **`athena-docs`** — design plan, 69 markdown files, 29 ADRs.
- **`athena-backend`** — FastAPI + LangGraph + Sophia's BE.

## Read these first

| | Path |
|---|---|
| 1. | [`docs/standards/ux-design-standard.md`](./docs/standards/ux-design-standard.md) — every PR follows this |
| 2. | [`.athena/skills/athena-implementation-patterns.md`](./.athena/skills/athena-implementation-patterns.md) — auto-loaded by Athena's own agent |
| 3. | `../athena-docs/README.md` — full design plan |
| 4. | `../athena-docs/09-roadmap/decision-log.md` — before changing an architectural pattern |
| 5. | [`TESTING.md`](./TESTING.md) — local-run demo flow |

## The standard in one paragraph

Inter type system (5 sizes, 3 weights), OKLCH color tokens (~14 semantic),
4px spacing, five layout primitives (`Stack`, `Cluster`, `Sidebar`, `Grid`,
`Center`), shadcn/ui as the base. **Sophia** the owl mascot lives next to the
wordmark in the TopBar; her 8 moods (all neutral-to-positive — **no sad
emotions**) are derived from screen state + SSE events. Motion budget
120–300ms, `prefers-reduced-motion` always honored. WCAG 2.1 AA verified in
CI.

## Hard rules (PRs rejected for any of these)

- Tailwind color literals (`text-gray-500`) → use tokens (`text-[var(--text-muted)]`).
- Inline `style={{ color: '...' }}` for theming → use tokens.
- Bespoke flex/grid where a primitive exists → use the primitive.
- Sophia mood set imperatively from a feature module → derived from store only.
- Screen missing empty / loading / error states → add them.
- Adding a sad mood to Sophia → reject (per user direction).
- New token / new font / new global → CODEOWNER sign-off in the PR.

## How to run things locally

```sh
# Bring up the backend first (sibling repo)
cd ../athena-backend && docker compose up -d --build

# Then run the frontend
cd ../athena-frontend
pnpm install
pnpm dev                # http://localhost:3000

pnpm lint
pnpm typecheck
pnpm test:unit          # vitest
pnpm test:e2e           # playwright
```

## How to add things

### A new FE screen

1. Add the route in `app/(protected)/<feature>/page.tsx`.
2. Use the five layout primitives — no bespoke flex.
3. Add empty / loading / error states using `<EmptyState>` + skeletons.
4. Use only tokens for colors.
5. Add keyboard shortcuts to the global shortcut registry if relevant.
6. Add Playwright E2E in `tests/e2e/`.

### A new Sophia mood

**Don't.** Mood set is closed at 8 (see UX §7.2). Talk to the design-system
CODEOWNER before reopening.

## What you may NOT do

- Add a native app (no iOS / Android / Mac / Windows / Electron).
- Set Sophia's mood from inside a feature module (it's derived).
- Add a sad mood to Sophia.
- Add `localStorage` writes that hold customer code or tenant data (per
  tenancy boundary).
- Render real customer data without a token-based + RBAC-validated fetch.
