# Athena — Frontend

> Next.js 15 (App Router) + React 19 + TypeScript + Tailwind v4 + shadcn/ui.
> The web app for the Athena enterprise PDLC engine. **Cloud-hosted browser
> surface only — no native apps, ever.**

The **design plan** for the whole system lives in the sibling repo
**`athena-docs`**. The backend lives in **`athena-backend`**.

## Read first

| | Path |
|---|---|
| Repo context for any Claude session | [`CLAUDE.md`](./CLAUDE.md) |
| The global UX design standard | [`docs/standards/ux-design-standard.md`](./docs/standards/ux-design-standard.md) |
| The implementation-patterns Skill | [`.athena/skills/athena-implementation-patterns.md`](./.athena/skills/athena-implementation-patterns.md) |
| The full design plan (sibling repo) | `../athena-docs/` |
| Local-run demo flow | [`TESTING.md`](./TESTING.md) |

## Quickstart

```sh
# 1. Bring the backend up (sibling repo)
cd ../athena-backend
docker compose up -d --build

# 2. Run this app locally with hot reload
cd ../athena-frontend
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## What ships in M0

- **Landing → Login → Dashboard** flow with the protected app shell (TopBar +
  Sidebar + Main).
- **Sophia** — the owl mascot. Blue palette, eight neutral-to-positive moods,
  inline SVG, fully animated (CSS keyframes). Lives next to the wordmark in
  the TopBar. Reacts to live SSE events from active runs via the global mood
  store.
- **Demo run flow**: dashboard "Start demo run" → POST to BE → navigate to
  `/runs/[id]` → `RunStreamPanel` consumes SSE → Sophia changes moods in real
  time → status pill flips → cost pill updates → run completes.
- **Knowledge Sync card** (ADR-029) — manual + incremental update flow. Shows
  last-indexed sha, branch HEAD, commits-behind. Simulate-push + Sync
  buttons.
- **Runs list** at `/runs` with empty / loading / error states designed.
- Design tokens in OKLCH (light + dark, auto). Five layout primitives
  (`Stack`, `Cluster`, `Sidebar`, `Grid`, `Center`). shadcn/ui-style
  primitives vendored.

## Layout

```
.
├── app/                                  ← Next.js App Router
│   ├── layout.tsx                        ← root + ThemeProvider + fonts
│   ├── page.tsx                          ← landing (logged out)
│   ├── login/page.tsx
│   └── (protected)/
│       ├── layout.tsx                    ← wraps in AppShell
│       ├── page.tsx                      ← dashboard
│       └── runs/
│           ├── page.tsx                  ← runs list
│           └── [id]/page.tsx             ← run detail + live stream panel
├── components/
│   ├── mascot/sophia.tsx                 ← the owl mascot (UX §7)
│   ├── layout/                           ← AppShell, TopBar, Sidebar, Wordmark, primitives
│   ├── knowledge/sync-card.tsx           ← Knowledge Sync card (ADR-029)
│   ├── runs/                             ← cost-pill, run-stream-panel
│   ├── theme/                            ← next-themes wrapper
│   └── ui/                               ← Button, Card, EmptyState, StatusPill
├── lib/
│   ├── cn.ts                             ← tailwind-merge helper
│   ├── api/client.ts                     ← typed fetch wrappers
│   ├── sse/event-stream.ts               ← ReadableStream-based SSE consumer
│   ├── stores/mascot.ts                  ← Sophia mood store (zustand)
│   └── utils/format.ts                   ← $ and time formatters
├── features/
│   └── runs/use-run-stream.ts            ← hook: SSE → mood store + event list
├── styles/tokens.css                     ← OKLCH design tokens (light + dark)
└── docs/standards/ux-design-standard.md  ← global UX standard
```

## Coding standard

**Every PR follows the UX design standard.** Read the full doc at
[`docs/standards/ux-design-standard.md`](./docs/standards/ux-design-standard.md).

Most-quoted rules:

- Tokens, not Tailwind color literals (`text-[var(--text-muted)]`, not
  `text-gray-500`).
- Five layout primitives — no bespoke flex/grid per screen.
- Sophia is global; mood is derived, never set per-feature.
- Empty / loading / error states before the happy path.
- `prefers-reduced-motion` honored everywhere.
- WCAG 2.1 AA on every component.
- `mascot.tsx` has 8 moods, all neutral-to-positive — **no sad emotions
  ever**. When something fails, Sophia goes `focused` (alert, not sad). The
  truth is carried by status pills + banners.

## Status

- ✓ M0 — app shell, design tokens, layout primitives, Sophia (8 moods,
  animated), demo SSE binding, Knowledge Sync card, runs list + detail.
- ⬜ M0 sprint 2 — real OIDC sign-in, hide demo behind feature flag.
- ⬜ M1 — PRD editor with citation chips, Gate cards, Memory facts view.
- ⬜ M2 — In-app Jira board, PR Workspace (Monaco diff + merge), Code
  Explorer, CI Panel, Chat surface, inline feedback (👍/👎).
