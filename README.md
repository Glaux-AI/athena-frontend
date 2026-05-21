# Athena Web

> The web app for **Athena** — a workspace where teams describe what they want
> and watch an AI agent draft a PRD, a design, tickets, and a pull request,
> with humans approving every step.
>
> Cloud-hosted browser surface only — no native apps. Built with Next.js 15,
> React 19, TypeScript, Tailwind v4, and shadcn/ui-style primitives.

## Highlights

- **Sophia** — a tiny owl mascot that lives next to the wordmark. Eight
  moods, all neutral-to-positive (no sad expressions). She reacts in real
  time to events streaming from the API: thinking, reading, writing, working
  (wings flap), waiting, happy.
- **Streaming-first run view** — the run page subscribes to a Server-Sent
  Events feed and renders agent activity as it happens.
- **Knowledge Sync** — a user-triggered card that incrementally updates the
  project's knowledge from the last-indexed commit to the current branch
  head. Never a full regeneration.
- **Design tokens in OKLCH** — light + dark, brand-configurable, perceptually
  uniform.
- **Five layout primitives** — `Stack`, `Cluster`, `Sidebar`, `Grid`,
  `Center`. No bespoke flexbox per screen.
- **Accessibility by default** — WCAG 2.1 AA verified in CI; keyboard-reachable
  everywhere; `prefers-reduced-motion` honored.

## Quickstart

This repository is the **frontend only**. It needs an Athena API server
running and reachable. By default it expects one at `http://localhost:8000`.

```sh
pnpm install
NEXT_PUBLIC_API_URL=http://localhost:8000 pnpm dev
```

Open <http://localhost:3000>.

Without an API server running, the dashboard will render with empty states;
clicking "Start demo run" returns a friendly error. The API is operated
separately and is not part of this repository.

## Configuration

Two environment variables, both public (bundled into the browser):

| Var | Purpose | Required? |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL of the Athena API server | yes — app fails closed at build time if missing in production |
| `NEXT_PUBLIC_APP_NAME` | Override the "Athena" wordmark text | no — defaults to `Athena` |

There are no secrets in this app. Both env vars are visible in the
browser bundle.

## Repo layout

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
│   ├── mascot/sophia.tsx                 ← the owl mascot
│   ├── layout/                           ← AppShell, TopBar, Sidebar, primitives
│   ├── knowledge/sync-card.tsx           ← Knowledge Sync card
│   ├── runs/                             ← cost-pill, run-stream-panel
│   ├── theme/                            ← next-themes wrapper
│   └── ui/                               ← Button, Card, EmptyState, StatusPill
├── lib/
│   ├── cn.ts                             ← tailwind-merge helper
│   ├── api/client.ts                     ← typed fetch wrappers (no secrets)
│   ├── sse/event-stream.ts               ← SSE consumer (ReadableStream-based)
│   ├── stores/mascot.ts                  ← Sophia mood store (zustand)
│   └── utils/format.ts                   ← formatters
├── features/
│   └── runs/use-run-stream.ts            ← hook: SSE → mood store + event list
├── styles/tokens.css                     ← OKLCH design tokens (light + dark)
└── docs/standards/ux-design-standard.md  ← the global UX standard
```

## Scripts

```sh
pnpm dev          # next dev (Turbopack, hot reload)
pnpm build        # production build
pnpm start        # production server (after build)
pnpm lint         # eslint
pnpm typecheck    # tsc --noEmit
pnpm test:unit    # vitest
pnpm test:e2e     # playwright
```

## Security

This app does not handle secrets and does not directly access any data
store. All authenticated calls go through the API server, which enforces
auth, tenancy, and authorization.

If you find a security issue, please follow the disclosure process in
[`SECURITY.md`](./SECURITY.md).

## License

[Apache-2.0](./LICENSE). See [`NOTICE`](./NOTICE) for attribution.

## Contributing

This is currently a published-for-reference codebase. We're not accepting
external pull requests at this stage; see [`CONTRIBUTING.md`](./CONTRIBUTING.md)
for context.
