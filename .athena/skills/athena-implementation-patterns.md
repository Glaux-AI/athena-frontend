---
phases: [any]
applies_when:
  - "writing or editing code in implementation/backend/"
  - "writing or editing UI in implementation/frontend/"
  - "scaffolding new modules"
  - "reviewing PRs in implementation/"
priority: 10
---

# Skill: Athena Implementation Patterns

> Load this skill **at the start of any phase that involves writing or editing
> code in the Athena implementation repo.** It links to the two global standards
> (UX + Backend) and gives the operational rules every PR follows.

## When to use this skill

- Writing any new file in `implementation/frontend/` or `implementation/backend/`.
- Reviewing a PR that touches the implementation repo.
- Generating code via Athena's own Code agent against this repo (yes, Athena will
  eventually build itself).

## Procedure — at session start

1. **Read** `implementation/docs/standards/ux-design-standard.md` if the change is
   frontend.
2. **Read** `implementation/docs/standards/backend-coding-standard.md` if the
   change is backend.
3. **Verify** the change does not violate any of the §15 (UX) or §20 (Backend)
   "you may not" lists.
4. **Use** the layout primitives, tokens, and components named in the standards —
   do not roll your own.

## The seven rules that come up most

1. **Tokens, not literals.** `var(--text-muted)` and `bg-[var(--surface-2)]` —
   never `text-gray-500` or `bg-slate-100`.
2. **Primitives, not bespoke flex.** `<Stack>`, `<Cluster>`, `<Sidebar>`, `<Grid>`,
   `<Center>`. If you find yourself writing `flex flex-col gap-4`, use `<Stack
   gap="4">`.
3. **Sophia is global.** Don't add a second mascot, don't replace the wordmark.
   Sophia's moods are derived from state via `useMascotStore`; don't set them
   manually from a feature module.
4. **Empty + loading + error before happy.** Every new screen ships with all four.
5. **Layered imports, BE.** Run `pre-commit run check_imports` before pushing.
6. **Pydantic at every boundary, BE.** No raw dicts crossing a layer line.
7. **One concept per file.** Long files mean you're conflating concepts.

## Examples

### Frontend — adding a new card to the dashboard

```tsx
// components/runs/run-card.tsx — done right
import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { StatusPill } from "@/components/runs/status-pill";

export function RunCard({ run }: { run: RunSummary }) {
  return (
    <Card>
      <Stack gap="3">
        <Cluster justify="between">
          <h3 className="text-lg">{run.goal}</h3>
          <StatusPill status={run.status} />
        </Cluster>
        <p className="text-sm text-[var(--text-muted)]">
          {relativeTime(run.startedAt)} · {run.steps} steps · ${run.costUsd.toFixed(2)}
        </p>
      </Stack>
    </Card>
  );
}
```

### Backend — adding a new endpoint

See `backend-coding-standard.md` §21 (one-screen reference function). Same shape
every time:

- `Depends` for user / tenant / db / idempotency.
- `async with span(...)` for tracing.
- Repo for DB access.
- Audit for state changes.
- Enqueue for heavy work.
- Validated Pydantic response.

## Anti-patterns to reject in review

| Smell | Fix |
|---|---|
| `style={{ color: "#666" }}` | Use a token + Tailwind |
| `<div className="flex flex-col gap-4">` for a list | `<Stack gap="4">` |
| Setting Sophia's mood from inside a feature | Remove; the store derives it |
| Router that touches `session.execute(...)` directly | Use a repo |
| Tool that imports from `athena.agent.*` | Tools don't know about runs |
| `print(...)` in production code | `log.info(...)` via structlog |
| New screen without an empty state | Add `<EmptyState>` |
| A 400-line file | Split |
| New color outside the token set | Justify or remove |

## Cross-references

- UX standard: `implementation/docs/standards/ux-design-standard.md`
- Backend standard: `implementation/docs/standards/backend-coding-standard.md`
- Mascot section: UX §7
- Reference function: Backend §21
- Reference component: UX §16
- Repo CLAUDE.md: `implementation/CLAUDE.md`
