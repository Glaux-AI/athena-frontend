/**
 * §1.5 End-to-end demo walkthrough — readiness-checklist row.
 *
 * Walks the surfaces a human walks when verifying a Phase ship in
 * athena-docs/07-operations/local-readiness-checklist.md §1.5, updated for
 * the one-flow migration: the legacy `/runs` run/phase flow is DELETED.
 * Tasks live on the recursive-Task spine at `/work`, and `/runs` survives
 * only as a redirect stub (app/(protected)/runs/page.tsx).
 *
 * Mode notes (load-bearing for what this spec can assert):
 *   - Mock mode (`NEXT_PUBLIC_API_MODE=mock`) resolves every API call the
 *     login / dashboard / chat / knowledge / settings surfaces make, so the
 *     walkthrough covers those end-to-end.
 *   - The Task surface has NO mock-mode parity — a locked product-work-rebuild
 *     decision (athena-docs/09-roadmap/product-work-rebuild.md §8: "No
 *     mock-mode parity for the new Task surface — develop against live BE").
 *     `/v1/tasks*` is intentionally absent from lib/api/mock/handlers.ts, so
 *     in mock mode the `/work` board renders its shell (header, toolbar,
 *     New-task CTA) over the fetch-error state. We therefore assert the BOARD
 *     SHELL only; the create→stages→gates walk lives in the skipped live-BE
 *     block at the bottom of this file.
 *
 * Run preconditions:
 *   - A Next.js dev server on `http://localhost:3000` (overridable via
 *     PLAYWRIGHT_BASE_URL).
 *   - `NEXT_PUBLIC_API_MODE=mock` so no backend is required.
 *
 * `/` redirects to `/login` (see app/page.tsx) so the landing-page row
 * actually asserts on `/login`. That's the "marketing surface + sign-in
 * card in one" pattern documented in app/login/landing-and-login.tsx
 * (rendered by the app/login/page.tsx server-side auth gate).
 */

import { test, expect } from "@playwright/test";

test.describe("§1.5 End-to-end demo walkthrough", () => {
  test("landing -> login -> dashboard -> board shell -> chat -> knowledge -> settings", async ({
    page,
  }) => {
    /* ------------------------------------------------------------------
     * Step 1 — Landing page with Sophia
     * ------------------------------------------------------------------
     * `/` server-redirects to `/login` (app/page.tsx). The landing surface
     * lives at /login and renders Sophia via <OwlAvatar> (data-mood). The
     * idle-mood assertion proper happens on the dashboard (step 4 sets
     * screen mood to "idle"); here we only assert the mascot is present.
     */
    await page.goto("/");
    await expect(page).toHaveURL(/\/login(\?.*)?$/);
    const landingMascot = page.locator("[data-mood]").first();
    await expect(landingMascot).toBeVisible({ timeout: 10_000 });

    /* ------------------------------------------------------------------
     * Step 2 — Sign-in card
     * ------------------------------------------------------------------
     * In mock mode (NEXT_PUBLIC_API_MODE=mock) the card renders:
     *   - email + password form ("Sign in" button)
     *   - "Continue as Demo User" button
     * In live mode it renders "Continue with GitHub" + optional SSO.
     * We assert the sign-in heading is visible; the auth-control probe
     * happens in step 3.
     */
    await expect(page.getByRole("heading", { name: /sign in to athena/i }))
      .toBeVisible();

    /* ------------------------------------------------------------------
     * Step 3 — Continue → /dashboard
     * ------------------------------------------------------------------
     * Mock mode: "Continue as Demo User" runs api.mockAuth.signIn with
     * maya@lumen.dev and replaces to `/dashboard` (or the returnTo).
     * Live mode: "Continue with GitHub" triggers a real OAuth redirect we
     * can't complete headlessly, so the walkthrough skips — the documented
     * prereq is NEXT_PUBLIC_API_MODE=mock.
     */
    const demoButton = page.getByRole("button", { name: /continue as demo user/i });
    const githubButton = page.getByRole("button", { name: /continue with github/i });

    if (await demoButton.count()) {
      // Mock mode — happy path.
      await demoButton.first().click();
    } else if (await githubButton.count()) {
      test.skip(
        true,
        "Live (non-mock) mode detected on /login — run with NEXT_PUBLIC_API_MODE=mock to walk §1.5."
      );
      return;
    } else {
      throw new Error(
        "No usable sign-in control found. Expected 'Continue as Demo User' (mock) or 'Continue with GitHub' (live)."
      );
    }

    await expect(page).toHaveURL(/\/dashboard(\?.*)?$/, { timeout: 15_000 });

    /* ------------------------------------------------------------------
     * Step 4 — Dashboard renders
     * ------------------------------------------------------------------
     * DashboardPage sets screen mood to "idle" (mascot setScreenDefault).
     * The TopBar renders Sophia via the wordmark. KPI tiles link to the
     * post-migration surfaces — Active tasks now points at /work (the old
     * /runs tile is gone). We accept ≥ 3 tiles so the row tolerates a
     * future extra tile or a renamed one.
     */
    await expect(
      page.getByRole("heading", { name: /welcome back/i }),
    ).toBeVisible();
    const mascots = page.locator("[data-mood]");
    expect(await mascots.count()).toBeGreaterThan(0);
    const kpiTiles = page.locator(
      'a[href="/work"], a[href="/inbox"], a[href="/cost"], a[href="/domains"]'
    );
    expect(await kpiTiles.count()).toBeGreaterThanOrEqual(3);

    /* ------------------------------------------------------------------
     * Step 5 — Legacy /runs URL lands on /work
     * ------------------------------------------------------------------
     * The run/phase flow is deleted; app/(protected)/runs/page.tsx is a
     * redirect stub so stray bookmarks land on the board instead of a 404.
     * This is the only /runs assertion left in the suite — by design.
     */
    await page.goto("/runs");
    await expect(page).toHaveURL(/\/work(\?.*)?$/, { timeout: 10_000 });

    /* ------------------------------------------------------------------
     * Step 6 — /work board SHELL renders
     * ------------------------------------------------------------------
     * Header + New-task CTA + filter toolbar. Deliberately NO task-data
     * assertions: the Task spine has no mock parity (see file header), so
     * in mock mode the board body shows its error state while the shell
     * around it stays the contract. The live-BE walk below owns the data
     * path.
     */
    await expect(page.getByRole("heading", { name: /^work$/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^new task$/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: /search tasks/i }),
    ).toBeVisible();

    /* ------------------------------------------------------------------
     * Step 7 — Chat page loads (compose disabled in demo mode)
     * ------------------------------------------------------------------
     * Chat is a full page at /chat. In mock mode the composer is
     * intentionally read-only — a "Demo mode — chat compose is disabled"
     * banner replaces the input (app/(protected)/chat/page.tsx), which is
     * the load-bearing mock-mode signal.
     */
    await page.goto("/chat");
    await expect(page).toHaveURL(/\/chat(\?.*)?$/);
    await expect(
      page.getByText(/demo mode — chat compose is disabled/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    /* ------------------------------------------------------------------
     * Step 8 — Org knowledge surface renders
     * ------------------------------------------------------------------
     * /knowledge is the org-scope universal shell (ScopeHeader +
     * ScopeTabs). Asserting the Blueprint + Topology tabs covers the
     * shell without duplicating domain-knowledge.spec.ts, which owns the
     * deep domain/repo knowledge walk.
     */
    await page.goto("/knowledge");
    await expect(page.getByRole("tab", { name: /blueprint/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("tab", { name: /topology/i })).toBeVisible();

    /* ------------------------------------------------------------------
     * Step 9 — Settings resolves
     * ------------------------------------------------------------------
     * /settings redirects to /settings/organization (settings index stub);
     * the page renders the "Organization settings" header in mock mode.
     */
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings\/organization(\?.*)?$/, {
      timeout: 10_000,
    });
    await expect(
      page.getByRole("heading", { name: /organization settings/i }),
    ).toBeVisible();

    /* ------------------------------------------------------------------
     * Step 10 — Wordmark routes to /dashboard
     * ------------------------------------------------------------------
     * Wordmark href is /dashboard (components/layout/wordmark.tsx). For a
     * logged-in user we should land on /dashboard. Navigate from /work so
     * the assertion is non-vacuous.
     */
    await page.goto("/work");
    await expect(page).toHaveURL(/\/work(\?.*)?$/);
    const wordmark = page.locator('a[href="/dashboard"][aria-label="Athena home"]');
    await expect(wordmark).toBeVisible();
    await wordmark.click();
    await expect(page).toHaveURL(/\/dashboard(\?.*)?$/);

    /* ------------------------------------------------------------------
     * Step 11 — Sidebar "Home" link is active on /dashboard
     * ------------------------------------------------------------------
     * components/layout/sidebar.tsx renders the /dashboard nav item as
     * "Home" with aria-current="page" when active; the Work section's
     * Tasks item points at /work.
     */
    const activeHome = page
      .locator('nav a[href="/dashboard"][aria-current="page"]')
      .first();
    await expect(activeHome).toBeVisible();
    await expect(page.locator('nav a[href="/work"]').first()).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/* Live-backend task walkthrough — intentionally skipped                       */
/* -------------------------------------------------------------------------- */

test.describe("Task walkthrough (live backend only)", () => {
  /**
   * The old §1.5 steps 5–8 (create a run → watch the SSE timeline → status
   * flips to completed → back to the list) walked the deleted /runs flow.
   * Their successor — create a task on /work → cockpit at /work/[id] →
   * stage runs stream over `/v1/tasks/{id}/events` → hard gates pause for
   * review (diff review before PR) → board reflects status — CANNOT run in
   * mock mode: the product-work-rebuild decision locks the Task surface to
   * live-BE development with NO mock parity
   * (athena-docs/09-roadmap/product-work-rebuild.md §8), and
   * lib/api/mock/handlers.ts deliberately implements no `/v1/tasks*` routes.
   *
   * Un-skip (and flesh out) this walk only against a live backend with a
   * seeded org — e.g. PLAYWRIGHT_BASE_URL pointed at an FE running with
   * NEXT_PUBLIC_API_MODE=live and credentials injected.
   */
  test.skip("create task -> cockpit stages -> gate review -> board reflects status", async () => {
    // Outline for the live-BE walk (kept as a placeholder so the intent
    // survives; see the comment above for why this cannot run in mock mode):
    //   1. Sign in against the live backend.
    //   2. /work → "New task" → fill title/type → submit → /work/[id].
    //   3. Cockpit renders the stage rail; run a stage; worklog streams
    //      over /v1/tasks/{id}/events (agent_step / tool_call events).
    //   4. A hard gate parks the task in_review; approve via the decision
    //      sidebar (diff review before PR for implementation tasks).
    //   5. Back on /work, the card sits in the matching status column.
  });
});
