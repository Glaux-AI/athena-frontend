# Athena Frontend - Production Gaps

> **Superseded by the canonical readiness checklist (2026-05-26).**
>
> This file used to be a hand-maintained matrix of "what the mock-mode
> FE covers" vs "what the backend still owes". Most of what it
> described has shipped (`/v1/me` real via Supabase, `/v1/cost/summary`
> backed by `cost_rollups_daily`, full integrations framework, billing
> + Stripe, projections + inbox + activity, blueprints, soft-delete
> lifecycle, GitHub OAuth, etc.); the bits that didn't ship are tracked
> elsewhere, in finer detail, with up-to-date status flags.
>
> For the current state of every BE↔FE surface, read:
>
> **[`../athena-docs/07-operations/local-readiness-checklist.md`](../athena-docs/07-operations/local-readiness-checklist.md)**
>
> That file is the single source of truth (per the `Readiness-checklist
> discipline` rule in `CLAUDE.md`). Each row carries a ✅ / 🟡 / ⬜ status
> that's kept in sync with code in the same PR.

## Why this file still exists

A small set of external links + internal docs reference this path. To
avoid 404s from those links the file stays - but the contents now
point at the canonical doc rather than duplicating (and stale-ing)
its contents.

## If you need to know "what's left to ship"

1. Open the readiness checklist (link above).
2. Search for ⬜ or 🟡 rows in the section that matches your area
   (§5.x = backend surfaces, §7.x = projections, §6.0 = deep-agents
   slices, §9.x = compliance, §10.x = SRE/perf).
3. The inline notes on each row name the exact file paths + ADR refs.

## If you need to know "what mock-mode covers in the FE"

Look at the imports in `lib/api/mock/handlers.ts` and the seed data in
`lib/api/mock/db.ts`. Every endpoint the FE calls is implemented in
the mock layer - that's the testable contract surface.

## If you need to know "what was in the original PRODUCTION_GAPS.md"

`git log --diff-filter=M -p PRODUCTION_GAPS.md` for the historical
content. It described an earlier, pre-Session-3..pre-Session-7 state
of the world and is preserved in history rather than carried forward.
