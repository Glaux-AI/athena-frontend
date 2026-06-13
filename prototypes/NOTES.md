# Prototype - Athena work flow · NOTES

**Throwaway.** Delete or absorb into the real build once it has answered its question.

---

## v4 (current) - recursive Task + per-type playgrounds + simulated Athena work
File: **`product-work-v4.html`** (zero-dependency). This matches the rewritten
`athena-docs/09-roadmap/product-work-backbone.md` (recursive-Task model).

**Why v4.** v3 modeled a rigid `Work item → Stage → Change` hierarchy. The user then
took the wheel and defined the canonical model: **one recursive `Task`** (`type +
parent_id + deps`), an **open tech-org-lingo type menu**, **emergent decomposition**
(Athena suggests subtasks during/after work - never templated), a **human + Athena thread
where every input is logged**, and a **per-type playground** with signature powers. Then:
*"reflect wait times of things like Athena doing things (how it will do)"* and
*"full mock of new task flow of each task type"* - so v4's headline is the **simulated
Athena run engine**: every time Athena does something it narrates the steps with a
spinner, **real latency**, and the **result** of each step (no magic jump to the answer).
A later note added: *"there should be a kanban board as well."*

**Model shown:**
- **Domain → a recursive tree of typed Tasks.** A subtask is just a Task with a parent
  (unbounded). `type` (not level) decides the flow; anyone owns any task.
- **Type menu (open):** Feature · Implementation · Design · Bug · Incident · Spike · Chore.
- **Two list views (toggle, top-right):** **Board** (kanban - all tasks flat by status,
  with "subtask of X" hints + Pick up) and **Tree** (the recursive structure).
- **Each type has a playground with signature powers** (per the doc §2.5):
  - **Feature** - web + connected-source + KG **research → a cited PRD** → **emergent decompose** (proposes typed subtasks w/ deps; you accept/decline; one *live* extra suggestion).
  - **Implementation** - the **change manifest**: each change item shows **file(s) + symbols + what + why + edit-kind + order/deps + risk + blast-radius + test plan + status**, grounded in Blueprint/symbols/interlink/git. You reorder / drop / **promote-to-subtask** *before* code, then the **sandbox** executes item-by-item with a **drift watch**, ending at **PR-raise**. Athena never merges.
  - **Design** - AI UX concepts (or Figma link) + **design-system critique** + **AA check** + **handoff spec**.
  - **Bug** - KG triage → failing-test repro → root-cause → **fix proposed as an Implementation subtask** (the recursion).
  - **Incident** - **mitigate-first** → diagnose → fix subtask → **auto-drafted postmortem from the logged timeline**.
  - **Spike** - research → a **recommendation** that **unblocks** dependents (no merge).
  - **Chore** - do → verify.
- **Steer before every AI action** - each "✦ Athena does X" trigger (and each sandbox
  change) has an optional **input box**; your steer is logged *before* Athena starts and
  echoed in the run panel ("↳ acting on your steer: …").
- **You edit every AI artifact** - an **✎ Edit** on each final draft (PRD, research brief,
  root cause, postmortem, recommendation, triage, critique…) makes it editable in place;
  the **change manifest** is editable **per field** per item. Your edited version is what
  gets approved - Athena is never the unreviewed author.
- **Thread · input log** (right rail): every human input + Athena action captured with who
  = the transparent record / decision log. **Subtasks** panel shows the children (recursive).
- **Coordination:** a task with deps shows a banner ("Depends on … Athena will flag if you
  build ahead"); cost rolls up to the parent on merge.

## How to open
- Open **`product-work-v4.html`** in a browser, or:
  `python -m http.server 8137 -d athena-frontend/prototypes` →
  http://127.0.0.1:8137/product-work-v4.html (the `proto` launch config). No build / no pnpm.
- **Speed control** (bottom bar): `1×` (real wait-times) · `3×` · `⚡` (instant). Start at 1×
  to feel the simulation; switch to ⚡ to click through fast. **Reset** re-seeds.

## What to click (each task type)
1. **Board** (default) - Triage (a bug), Ready (spike/design/impl/chore - some **Pick up**-able),
   In progress (feature, incident). Toggle to **Tree** to see the Snooze Feature with its
   Spike / Design / Implementation children.
2. **Feature** ("Snooze the payment-failure email") → **Frame** → **Research** (watch the web /
   connectors / KG steps → a cited brief) → **Draft PRD** (streams in) → **Decompose** (accept
   the emergent extra subtask).
3. **Implementation** ("Token + suppression…") - the flagship → **Plan** (watch it read the code →
   the **change manifest**; expand an item; **⤴ Promote** #4 to a subtask) → **Accept** →
   **Sandbox** (run items; a **drift** nudge appears after #3) → **Raise PR** → Approve & merge.
4. **Bug** ("…fires twice on annual invoices") → Triage → Reproduce (failing test) → Diagnose →
   **Fix** (accept the Implementation subtask - open it from the tree).
5. **Incident** ("Stripe webhooks failing") → **Mitigate** first → Diagnose → Fix subtask →
   **Postmortem** (auto-drafted from the timeline).
6. **Spike** ("Queue vs cron…") → Investigate → **Recommendation** (unblocks the Implementation).
7. **Design** ("Snooze action…") → AI concepts → critique + AA + handoff.

## Verdict (fill in after playing)
- Does the **recursive Task + per-type playground** model read right? __
- Is the **simulated Athena work** (wait-times + narrated steps + results) the right feel? __
- Is the **change manifest** the right "no black box" depth for devs? __
- Board vs Tree as the default view? __  ·  Keep / change: __

> Verified end-to-end (board + tree + all 7 type flows + manifest/sandbox/drift/promote +
> streaming + cost rollup) with zero console errors via DOM eval. Screenshots cap at ~800px here.

---

## v3 (superseded) - kind-tagged work + personal workspace
File: `product-work-flow.html`. Modeled `Domain → Work item (KIND) → Stages → Changes` with a
personal commit workspace. Replaced by v4's recursive-Task model (a "subtask" is now just a Task
with a parent, not a separate Stage/Change tier). Kept for comparison; delete once v4 is absorbed.

> Not production code: no tests, no a11y pass, stubbed data, click-driven (no real LLM/runs).
> The point is the **model and feel**, not the implementation.
