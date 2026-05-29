/**
 * §6.0 r1270 — Capability + repo knowledge endpoints E2E.
 *
 * Walks the §6.0 knowledge surface the Round 7 BE landed and Round 8 FE
 * consolidated:
 *
 *   GET /v1/capabilities/{id}/knowledge
 *   GET /v1/capabilities/{id}/repos/{repo_id}/knowledge
 *
 * The FE renders these through `CapabilityKnowledgePanel` (Knowledge tab
 * on `/capabilities/[id]`) and `RepoKnowledgePanel` (inline expand on the
 * Repos tab). The mock handlers in lib/api/mock/handlers.ts serve both
 * shapes from the seeded fixtures in lib/api/mock/db.ts:
 *
 *   - capabilityKnowledge[cap_inbox]                 (Knowledge tab)
 *   - repoKnowledge["cap_inbox::repo_n1"]            (Repos tab expand)
 *
 * We target `cap_inbox` because its fixture has the richest seed:
 *   - top_entities[0].name = "inbox-svc"
 *   - nodes_by_kind includes "function" (largest bucket at 318)
 *   - 4 overlay_terms entries (confidence floor, trust score, ...)
 *   - repo_n1 (lumen/inbox-web) top_symbols[0].name = "useInboxStream"
 *
 * Run preconditions match dev-mode-smoke.spec.ts:
 *   - A Next.js dev server on `http://localhost:3000`
 *     (overridable via PLAYWRIGHT_BASE_URL).
 *   - `NEXT_PUBLIC_API_MODE=mock`.
 *
 * Selector strategy: prefer `data-testid` on the four
 * `CapabilityKnowledgePanel` sections + the four `RepoKnowledgePanel`
 * sections + the per-row `view-knowledge-{repo_id}` button. We also use
 * text-based fallbacks on the seeded fixture content (`inbox-svc`,
 * `useInboxStream`) so the spec stays grounded if a testid is renamed
 * but the seeded value still renders.
 */

import { test, expect } from "@playwright/test";

const CAP_ID = "cap_inbox";
const REPO_ID = "repo_n1";

// Seeded fixture echoes — keep in sync with lib/api/mock/db.ts.
const SEEDED_TOP_ENTITY_NAME = "inbox-svc";
const SEEDED_TOP_SYMBOL_NAME = "useInboxStream";

test.describe("§6.0 r1270 Capability + repo knowledge", () => {
  test.beforeEach(async ({ page }) => {
    /* ------------------------------------------------------------------
     * Sign in via the mock demo button (same shape as the §1.5 walk-
     * through + soft-delete spec). Live mode skips; mock mode lands on
     * /dashboard.
     * ------------------------------------------------------------------ */
    await page.goto("/");
    const demoButton = page.getByRole("button", { name: /continue as demo user/i });
    if (!(await demoButton.count())) {
      test.skip(
        true,
        "Live mode on /login — set NEXT_PUBLIC_API_MODE=mock to walk §6.0 r1270.",
      );
      return;
    }
    await demoButton.first().click();
    await expect(page).toHaveURL(/\/dashboard(\?.*)?$/, { timeout: 15_000 });
  });

  test("knowledge tab renders nodes_by_kind histogram + top_entities + overlay_terms", async ({
    page,
  }) => {
    /* ------------------------------------------------------------------
     * Step 1 — Deep-link to /capabilities/{id}?tab=knowledge.
     * ------------------------------------------------------------------
     * The cap detail page reads `?tab=` from the URL (see
     * app/(protected)/capabilities/[id]/page.tsx:142), so we skip the
     * ScopeTabs nav and land directly on the Knowledge tab.
     * The Knowledge tab renders `<CapabilityKnowledgePanel>` once the
     * `api.capabilities.knowledge(id)` promise resolves.
     * ------------------------------------------------------------------ */
    await page.goto(`/capabilities/${CAP_ID}?tab=knowledge`);

    /* ------------------------------------------------------------------
     * Step 2 — nodes_by_kind histogram (data-testid="capability-knowledge-histogram").
     * ------------------------------------------------------------------
     * Each row is a <li> with a font-mono kind label. The seeded fixture
     * has `function` as the largest bucket — assert that kind label
     * appears inside the histogram. The mono uppercase span renders the
     * raw kind verbatim.
     * ------------------------------------------------------------------ */
    const histogram = page.getByTestId("capability-knowledge-histogram");
    await expect(histogram).toBeVisible({ timeout: 15_000 });
    await expect(histogram.getByText(/^function$/i)).toBeVisible();

    /* ------------------------------------------------------------------
     * Step 3 — top_entities renders (data-testid="capability-knowledge-entities").
     * ------------------------------------------------------------------
     * Assert >=1 entity row + the seeded top entity name is visible.
     * The fixture seeds `inbox-svc` as the most-important entity for
     * cap_inbox; that name renders as a font-semibold <span>.
     * ------------------------------------------------------------------ */
    const entities = page.getByTestId("capability-knowledge-entities");
    await expect(entities).toBeVisible();
    await expect(entities.locator("li")).not.toHaveCount(0);
    await expect(entities.getByText(SEEDED_TOP_ENTITY_NAME).first()).toBeVisible();

    /* ------------------------------------------------------------------
     * Step 4 — overlay_terms section renders (data-testid="capability-knowledge-overlay-terms").
     * ------------------------------------------------------------------
     * cap_inbox fixture seeds 4 overlay_terms entries, so the testid
     * MUST be present. We still guard for the empty-state branch — if
     * a future fixture change empties the array, the panel falls back
     * to a single <EmptyState> for the whole component (totallyEmpty
     * path in capability-knowledge-panel.tsx). Either signal counts as
     * "the section rendered" per the task's empty-state allowance.
     * ------------------------------------------------------------------ */
    const overlayTerms = page.getByTestId("capability-knowledge-overlay-terms");
    const emptyState = page.getByRole("heading", { name: /no knowledge ingested yet/i });
    const overlayVisible = await overlayTerms.count();
    if (overlayVisible) {
      await expect(overlayTerms).toBeVisible();
      await expect(overlayTerms.locator("li")).not.toHaveCount(0);
    } else {
      await expect(emptyState).toBeVisible();
    }
  });

  test("repos tab expand reveals repo knowledge top_symbols", async ({ page }) => {
    /* ------------------------------------------------------------------
     * Step 1 — Deep-link to /capabilities/{id}?tab=repos.
     * ------------------------------------------------------------------
     * The Repos tab renders one row per attached repo + a "View
     * knowledge" button (data-testid=`view-knowledge-{repo_id}`) that
     * toggles an inline `<RepoKnowledgePanel>` populated via
     * `api.capabilities.repoKnowledge(capId, repoId)`.
     * ------------------------------------------------------------------ */
    await page.goto(`/capabilities/${CAP_ID}?tab=repos`);

    /* ------------------------------------------------------------------
     * Step 2 — Click the "View knowledge" CTA on repo_n1.
     * ------------------------------------------------------------------
     * The button toggles `expandedRepoId` state in ReposTab. Wait for
     * the per-row expand container (data-testid=`repo-knowledge-
     * expand-{repo_id}`) before asserting nested content — the row
     * lazy-fetches knowledge so a brief skeleton renders first.
     * ------------------------------------------------------------------ */
    const viewKnowledgeBtn = page.getByTestId(`view-knowledge-${REPO_ID}`);
    await expect(viewKnowledgeBtn).toBeVisible({ timeout: 15_000 });
    await viewKnowledgeBtn.click();

    const expandContainer = page.getByTestId(`repo-knowledge-expand-${REPO_ID}`);
    await expect(expandContainer).toBeVisible();

    /* ------------------------------------------------------------------
     * Step 3 — top_symbols list (data-testid="repo-knowledge-top-symbols").
     * ------------------------------------------------------------------
     * Once `api.capabilities.repoKnowledge(cap_inbox, repo_n1)`
     * resolves the panel renders `<Stack as="ul" data-testid="repo-
     * knowledge-top-symbols">` with the seeded 5 symbols. Assert >=1
     * <li> + the seeded `useInboxStream` name appears.
     * ------------------------------------------------------------------ */
    const topSymbols = page.getByTestId("repo-knowledge-top-symbols");
    await expect(topSymbols).toBeVisible({ timeout: 15_000 });
    await expect(topSymbols.locator("li")).not.toHaveCount(0);
    await expect(topSymbols.getByText(SEEDED_TOP_SYMBOL_NAME).first()).toBeVisible();
  });
});
