# Athena Frontend — Production Gaps

What the mock-mode frontend covers today and what the backend team must add
before this can be pointed at a real API.

## Status today

`NEXT_PUBLIC_API_MODE=mock` boots a fully-interactive demo against
`lib/api/mock/` (in-process handlers + Acme Robotics data). Every visible
flow renders end-to-end:

- **Auth** — sign-in / sign-up / sign-out / one-click demo identity, mock
  session persisted in localStorage.
- **Home** — KPIs, recent tasks, inbox preview, capability snapshot, activity rail.
- **Inbox** — review-requested, mentions, approvals, CI failures, budget alerts, digests.
- **Tasks** (formerly Runs) — list + 7-phase detail (Spec → Plan → Implement → Review → CI → PR → Deploy)
  - Per-phase content fetched from `/v1/runs/{id}/phases/{phase}`
  - PR back-flow (reviewer comment → Athena addresses → commits posted)
  - Deploy with feature-flag rollout, canary stages, SLO checks, observability links, runbook
  - Live SSE stream of agent events for `running` tasks
- **Capabilities** — grid + per-capability detail with overview / repos / tasks tabs
- **Knowledge graph** — SVG with click-to-inspect side panel
- **Skills** — grid of skills with phase + capability attachment
- **Chat** — thread list + per-thread conversation with synthetic agent replies
- **Activity** — org-wide event stream with technical-details toggle
- **Cost** — daily-burn chart, per-capability / per-model / per-phase splits, top tasks, alerts
- **Settings** (12 sub-pages, all functional)
  - Organization, Members, Invitations, Domains
  - Integrations marketplace (28 tiles, 14 categories) + uniform connect wizard
  - SSO + SCIM (Okta connected, group→role map, force-sync, metadata URL)
  - Model providers (5 providers across Anthropic / OpenAI / Vertex, set-primary)
  - Privacy (redaction toggles, retention, encryption, residency)
  - API tokens (CRUD, scopes, expiry)
  - Audit log (filterable, exportable design)
  - Danger zone, Profile

The mock handlers in `lib/api/mock/handlers.ts` define every endpoint the
frontend hits. **The backend team can use them as the v1 contract**: same
paths, same envelopes, same error shapes, same status codes.

## What still needs the backend to make this real

### 1 · Identity & sessions (Supabase-backed in live mode)

- `/v1/me`, `/v1/auth/sync`, `/v1/auth/logout` — wire to Supabase access tokens + a `users` table.
- Sign-in/sign-up live path is GitHub OAuth via Supabase (`app/auth/callback/page.tsx`); the mock-auth fast-path (`/v1/mock-auth/*`) is **demo-only** and must not be exposed in production.
- Session expiry/refresh: live mode delegates to the Supabase SDK. The frontend reads `session.access_token` and injects it as `Authorization: Bearer …`.

### 2 · Real-time streaming (SSE)

The Run detail page consumes SSE at `/v1/runs/{id}/events` and expects four event types:
- `run_status` with `{ status, spent_usd }`
- `agent_step` with `{ kind, label, duration_ms }` — `kind` ∈ {plan, reason, retrieve, read, draft, write}
- `tool_call` with `{ name, args_summary, duration_ms }`
- `gate_pending` with `{ gate, requires }`

Mock script lives at `lib/api/mock/sse.ts` — match the field names and event ordering.

### 3 · Per-run phase data

`/v1/runs/{id}/phases/{phase}` returns a phase-specific slice. Today the slice shapes are defined ad-hoc inside `lib/api/mock/db.ts` and consumed in `app/(protected)/runs/[id]/page.tsx`. Before backend implementation, the team should:
- Promote each phase slice to a typed contract in `lib/api/client.ts` (currently `RunPhaseData` is `Record<string, unknown>` — too loose).
- Decide which fields are required vs optional per phase.

### 4 · PR comment back-flow

`/v1/runs/{id}/pr-feedback` returns the reviewer→Athena exchange. The backend will need:
- A webhook listener for GitHub `pull_request_review_comment.created` (and equivalents on GitLab / Bitbucket).
- A loop that hands the comment to the agent, captures the resolution diff, posts a commit reply.
- A status state machine (`awaiting_athena` → `in_progress` → `addressed`).

### 5 · Deploy phase wiring

`/v1/runs/{id}/deploy` is the deploy plan. To make this real:
- Read flag state from LaunchDarkly / GrowthBook / Statsig per the configured integration.
- SLO checks need a live observability source (Datadog API, Grafana, etc.).
- Auto-promotion + rollback needs a scheduler and human-approval workflow.

### 6 · Integrations (the marketplace)

The marketplace is a uniform connect-wizard for 28 providers. For each connected provider the backend must:
- Store secrets in a KMS-backed secret store, not in plaintext columns.
- Implement an OAuth dance (where applicable) with the redirect URL Athena serves.
- Implement a real `POST /integrations/{id}/test` that pings the upstream API and reports latency + a clear error envelope.
- Build per-provider sync workers (Arq jobs) — most never appear on the UI, but they back the "last sync" + "scope" badges.

### 7 · SSO / SCIM

`/v1/orgs/{org}/sso` returns the Okta connection. To go live:
- Supabase Auth's SAML/OIDC surface needs the per-org provider registered via Supabase Admin API.
- SCIM 2.0 endpoint (`/scim/v2/Users`, `/scim/v2/Groups`) hosted by the backend with bearer-token auth.
- Group → role mapping enforced server-side at every mutating route.

### 8 · Audit log

The mock audit log is a flat array with hash-chained `prev_hash` / `hash` fields. The real backend must:
- Append-only with a hash chain (so tampering is detectable).
- WORM storage backing (S3 Object Lock or equivalent).
- Export endpoint (`GET /v1/audit/events?since=...&format=ndjson|csv`) — UI placeholder is there.
- SIEM forwarder for orgs that need it (Splunk HEC, Datadog, etc.).

### 9 · Cost

`/v1/cost/summary` returns a static snapshot. The real backend:
- Aggregates per-call cost telemetry from the LiteLLM client (already in ADR-006).
- Per-capability + per-model + per-phase rollups computed by an Arq job, cached.
- Budget tripwires that fire `budget_alert` inbox items (and Slack/email per `notifications/routing`).
- A `POST /v1/orgs/{org}/cost/budget` to set caps per capability — the UI hits this.

### 10 · Inbox + notifications

The inbox is read-only in mock. Real backend:
- Producers: every gate event (approval_needed, review_requested, ci_failed, deploy_canary_breached, budget_threshold, @mention) writes an inbox row.
- Consumers: `mark_read`, `mark_all_read` already wired.
- Push channels: email + Slack + Teams + PagerDuty are routed per the `notifications/routing` table — the UI shows the routing but doesn't deliver. Backend needs the actual dispatchers.

### 11 · Onboarding

`/v1/orgs/{org}/onboarding` is a read-only state today. For a real corporate signing up:
- A first-run wizard ties to: connect SCM (creates a GitHub App install URL), set up SSO (Supabase SAML registration), invite team (sends emails), define first capability, connect a model provider, run first task.
- Each step writes to an `onboarding_state` table; the dashboard / wizard reads it.

### 12 · Knowledge graph

`/v1/knowledge/graph` returns a small static set of nodes. Backend must:
- Index repos into Neo4j (ADR-026) and expose a query interface for capability-scoped views.
- Per-node detail endpoint (`/v1/knowledge/nodes/{id}`) — not used in the mock yet but the UI is structured for it.

### 13 · Chat

`/v1/chat/threads/*` is implemented as a mock that fakes Athena replies. Backend:
- Persist threads + messages.
- Route the user message to the agent with `chat` intent + scope.
- Stream the agent reply (use the same SSE channel as runs, or a dedicated chat SSE).
- Capture citations (`[node:n3]`) and tool calls.

### 14 · Skills

`/v1/skills` is a flat list. Backend needs:
- Skill registry with versions, system-prompt storage, attachment policies.
- Per-skill `usage_count` + `last_used` aggregated from run-level skill invocations.
- Skill CRUD UI (the page has a "New skill" button but no wizard yet).

### 15 · Capabilities + Repos

Capabilities + repo attachment wiring exists. Backend additions:
- Capability inference suggestions when a repo is first indexed (ADR-030).
- Capability owners (the mock has `created_by_user_id` only — production needs an owners array).
- Repo indexing pipeline status (the UI shows `last_indexed_sha` etc. on the mock — backend must keep these fresh).

## Things the frontend does NOT cover yet (would need new pages)

- **Onboarding wizard** — there's an `onboarding_state` shape but no `/onboarding` flow.
- **Skill detail / editor** — skills list renders, no detail page.
- **Capability resources** — the mock-v2 prototype had a richer resources tab; frontend has overview/repos/tasks only.
- **Mobile companion** — no mobile-optimized approval flow.
- **Empty / first-run states** — every page assumes data exists.
- **Tour / product walkthrough** — no in-app tour for new users.
- **Search (Cmd-K)** — the topbar shows ⌘K but the palette isn't wired.

## Things mocked that are likely wrong in production

- **Latency**: mock delays every call 120ms; real backend will have wildly different distributions per endpoint.
- **Cursor pagination**: every paginated list returns `next_cursor: null` — real cursors will need URL-safe encoding + tamper resistance.
- **Concurrency**: no optimistic locking, ETag, or If-Match headers. Production needs them on mutations to org-shared resources (capability config, integrations).
- **Validation**: mock accepts almost any body shape. Real backend needs Pydantic / Zod validation symmetric with the frontend Zod schemas.
- **Authorization**: mock returns the same data regardless of who's signed in. Real backend must enforce RLS per ADR-015 (every query keyed on `org_id` + actor's role).
- **Rate limits**: not modeled. Production needs per-org + per-user limits, especially on `POST /runs`.

## Security gaps in mock mode

These are **deliberate** for demo mode but must not regress in production:

- Mock auth accepts any email/password. **Never deploy mock mode behind a public URL.**
- CSP is loosened in dev to allow HMR WebSockets (`connect-src` includes `ws:`). Production builds restore the strict policy automatically (`isDev` branch in `next.config.mjs`).
- API tokens displayed in mock are not real bearer tokens. The minted-token endpoint shape is right, but rotation, revocation propagation, and audit-on-use are backend responsibilities.

## How to flip from mock to live

1. Set `NEXT_PUBLIC_API_MODE=live` (or unset; live is default).
2. Set `NEXT_PUBLIC_API_URL` to the backend origin.
3. Set `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Restart the dev server.

Every call site that currently works in mock will work in live as long as the backend honors the contracts described above.
