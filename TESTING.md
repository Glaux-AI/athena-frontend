# Testing — Athena Web

## Local-run quickstart

```sh
pnpm install
NEXT_PUBLIC_API_URL=http://localhost:8000 pnpm dev
```

Open <http://localhost:3000>.

Without an API server running at `NEXT_PUBLIC_API_URL`, the dashboard
renders with empty states and the demo-run buttons return a friendly
"Athena API server is unreachable" error.

## End-to-end smoke

Once an API server is reachable:

1. Open <http://localhost:3000>.
2. Click **Sign in → Continue with SSO**.
3. **Dashboard.** Sophia in `idle` mood, gentle blink. Three cards in the
   grid; an "Knowledge" card above them.
4. **Click "Start demo run".** Navigates to `/runs/<id>`.
5. **Run detail.** Live activity panel streams events. Sophia changes
   moods in real time as agent steps arrive: thinking → reading → working
   (wings flap) → writing (quill nods) → waiting (halo pulses) → happy
   (hop + sparkles).
6. **Back → /runs.** Past runs appear in the list.
7. **Dashboard → Knowledge card.** Click **Simulate push** twice. Then
   click **Sync** — the card flips to "Up to date" with a delta summary.

## Unit tests

```sh
pnpm test:unit
```

Vitest + `@testing-library/react`. Component tests include accessibility
checks via `jest-axe`.

## E2E tests

```sh
pnpm test:e2e
```

Playwright. Runs against Chromium + WebKit. Axe-core accessibility scans
on every navigated page.

## Browser support

| Browser | Status |
|---|---|
| Chrome / Edge / Brave (last 2 versions) | Supported |
| Firefox (last 2 versions) | Supported |
| Safari (last 2 versions) | Supported |
| iOS Safari / Chrome Android | Read-only views; authoring flows are desktop-only |

## Reduced motion

Toggle `prefers-reduced-motion: reduce` in your OS to verify Sophia and
all transitions degrade gracefully (mood changes snap; no ambient
animation).

## Performance budgets

| Metric | Budget |
|---|---|
| First Contentful Paint (login) | < 1.2 s |
| Time to Interactive (run list) | < 2.5 s |
| Stream first-event latency | < 4 s (API-dependent) |
| Trace render (1k events) | < 200 ms |
| Bundle size after gzip (per route) | < 200 KB |

Tracked in Lighthouse CI; regressions block merge.
