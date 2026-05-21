# Testing Athena Frontend (M0)

## Quickstart

```sh
# 1. Bring up the BE (sibling repo)
cd ../athena-backend && docker compose up -d --build

# 2. Run this app locally
cd ../athena-frontend
pnpm install
pnpm dev

# 3. Open the app
open http://localhost:3000
```

(Or build + serve via Docker: `docker build -t athena-web . && docker run -p 3000:3000 athena-web`.)

## Demo flow

1. **Landing → Sign in → Continue with SSO** (the OIDC flow is stubbed in M0;
   the button routes straight to `/`).
2. **Dashboard.** Sophia in `idle` mood, gentle blink. Knowledge card shows
   the demo project, branch HEAD, last-indexed sha. Three cards in the grid
   (Recent runs, Pending gates, This month).
3. **Click Start demo run.** Navigates to `/runs/<id>`.
4. **Run detail.** Top bar with goal + cost + status pills. Left rail with
   phase list. Right: Live activity panel streams events from the BE over
   SSE. **Sophia changes moods in real time**: thinking → reading → working
   (wings flap) → writing (quill nods) → waiting (halo pulses) → happy (hop +
   sparkles).
5. **Run completes** in ~25s. Cost pill flips to `$0.12`. Status pill to
   `completed`.
6. **Back → /runs.** Past runs in the list.
7. **Dashboard Knowledge card** → click **Simulate push** twice to bump
   `commits_behind`. Then click **Sync** → spinner for ~1.6s → flips to
   "Up to date" with a delta summary (files added/modified/deleted, chunks
   upserted, doc updates proposed).

## What works at M0

- App shell (TopBar with Sophia + Wordmark, Sidebar, Main).
- Landing / Login / Dashboard / Runs list / Run detail / Knowledge Sync card.
- Sophia: 8 moods, blue palette, animated, mood store, mood-bound to SSE.
- Five layout primitives.
- shadcn/ui-style primitives: Button, Card, EmptyState, StatusPill.
- Custom: CostPill, RunStreamPanel, KnowledgeSyncCard, Sophia, Wordmark.
- Design tokens in OKLCH (light + dark + auto via next-themes).
- TanStack Query / Zustand wiring ready (added in M1 when real data lands).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Blank page | FE not booted | `pnpm dev` and watch the terminal |
| API errors | BE not up | `docker compose ps` in `../athena-backend` |
| CORS errors | Origin not in `CORS_ALLOW_ORIGINS` | Check the BE `.env` |
| Sophia not animating | `prefers-reduced-motion: reduce` | OS accessibility settings |
| SSE never opens | Reverse proxy buffering | Disable nginx buffering; `X-Accel-Buffering: no` is set on the BE |

## What's next

- M0 sprint 2: replace the OIDC login stub with the real flow.
- M1: real PRD editor with citation chips, gate cards, memory facts view.
- M2: PR Workspace (Monaco diff + merge), Code Explorer, CI panel, in-app
  Jira board, chat surface, inline feedback.
