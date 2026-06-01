/**
 * §6.0 r1270 + Phase D — Capability + repo knowledge surface E2E.
 *
 * Walks the knowledge surface after the Phase D IA overhaul. The duplicate
 * cap "Knowledge" tab and the inline "view knowledge" expand on the Repos
 * tab were removed (ADR-073 §4 canonical-home rule); the per-repo KG data
 * now lives on the canonical repo page:
 *
 *   GET /v1/capabilities/{id}/knowledge                 → cap Blueprint dashboard
 *   GET /v1/capabilities/{id}/repos/{repo_id}/knowledge → repo Topology tab
 *
 * `top_symbols` render via `<SymbolList>` on the repo Topology tab; the
 * snapshot renders via `<SnapshotCard>`. We target `cap_inbox` / `repo_n1`
 * because that fixture has the richest seed:
 *   - top_entities[0].name = "inbox-svc"
 *   - repo_n1 top_symbols[0].name = "useInboxStream"
 *
 * Run preconditions match dev-mode-smoke.spec.ts:
 *   - A Next.js dev server on `http://localhost:3000`
 *     (overridable via PLAYWRIGHT_BASE_URL).
 *   - `NEXT_PUBLIC_API_MODE=mock`.
 */

import { test, expect } from "@playwright/test";

const CAP_ID = "cap_inbox";
const REPO_ID = "repo_n1";

// Seeded fixture echoes — keep in sync with lib/api/mock/db.ts.
const SEEDED_TOP_SYMBOL_NAME = "useInboxStream";

test.describe("§6.0 r1270 + Phase D — Capability + repo knowledge", () => {
  test.beforeEach(async ({ page }) => {
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

  test("cap Repos tab shows a compact sync chip + Open repo link (no inline KG expand)", async ({ page }) => {
    await page.goto(`/capabilities/${CAP_ID}?tab=repos`);

    // The Phase D Repos tab is compact: a unified sync chip + an "Open repo"
    // link per row. The old "view knowledge" inline expand is gone.
    const openRepo = page.getByTestId(`open-repo-${REPO_ID}`);
    await expect(openRepo).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(`view-knowledge-${REPO_ID}`)).toHaveCount(0);
  });

  test("repo Topology tab renders top_symbols (canonical home)", async ({ page }) => {
    // The per-repo KG data now lives on the canonical repo page. Deep-link to
    // its Topology tab and assert the seeded top symbol renders.
    await page.goto(`/capabilities/${CAP_ID}/repos/${REPO_ID}?tab=topology`);
    await expect(page.getByText(SEEDED_TOP_SYMBOL_NAME).first()).toBeVisible({ timeout: 15_000 });
  });

  test("repo Blueprint tab renders the computed dashboard header", async ({ page }) => {
    await page.goto(`/capabilities/${CAP_ID}/repos/${REPO_ID}?tab=blueprint`);
    // The dashboard band (summary + KPIs + unified sync status) renders on top.
    await expect(page.getByTestId("repo-dashboard-header")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("sync-status-panel")).toBeVisible();
  });
});
