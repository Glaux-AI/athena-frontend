/**
 * §5.31.9 r3 — Soft-delete -> Trash -> Reindex (restore) -> live cap returns,
 * then re-soft-delete + permanent delete via typed-slug confirmation.
 *
 * Walks the two-stage soft-delete lifecycle defined in §5.31 of the
 * readiness checklist. Targets the Billing & Subscriptions mock cap
 * (`cap_billing`, slug `billing`) because the mock seeds it with
 * deterministic data and slug.
 *
 * Run preconditions match dev-mode-smoke.spec.ts:
 *   - A Next.js dev server on `http://localhost:3000`
 *     (overridable via PLAYWRIGHT_BASE_URL).
 *   - `NEXT_PUBLIC_API_MODE=mock`.
 *
 * The mock handlers in lib/api/mock/handlers.ts implement
 * `:soft-delete`, `:restore`, and `:permanent` for capabilities, so the
 * whole lifecycle round-trips without a real backend.
 *
 * Mutual ordering: this spec mutates the shared in-process mock store
 * (db.capabilities[cap_billing].deleted_at), so it MUST run serial with
 * any other spec that touches the billing cap. Playwright config in
 * playwright.config.ts already pins `workers=1` + `fullyParallel=false`.
 */

import { test, expect } from "@playwright/test";

const CAP_ID = "cap_billing";
const CAP_SLUG = "billing";

test.describe("§5.31.9 r3 Soft-delete lifecycle", () => {
  test("soft-delete -> trash -> restore -> permanent-delete", async ({ page }) => {
    /* ------------------------------------------------------------------
     * Sign in via the mock demo button (same shape as the §1.5 walk-
     * through). The mock me has org role `admin` => `canManageCap` is
     * true so the Danger zone renders the Soft-delete card.
     * ------------------------------------------------------------------ */
    await page.goto("/");
    const demoButton = page.getByRole("button", { name: /continue as demo user/i });
    if (!(await demoButton.count())) {
      test.skip(
        true,
        "Live mode on /login — set NEXT_PUBLIC_API_MODE=mock to walk §5.31.9 r3.",
      );
      return;
    }
    await demoButton.first().click();
    await expect(page).toHaveURL(/\/dashboard(\?.*)?$/, { timeout: 15_000 });

    /* ------------------------------------------------------------------
     * Step 1 — Open the existing Billing cap, switch to the Danger tab.
     * ------------------------------------------------------------------
     * `app/(protected)/capabilities/[id]/page.tsx` reads `?tab=` from the
     * URL, so we deep-link directly rather than chasing the tab nav.
     * ------------------------------------------------------------------ */
    await page.goto(`/capabilities/${CAP_ID}?tab=danger`);
    await expect(
      page.getByRole("heading", { name: /soft delete this capability/i }),
    ).toBeVisible({ timeout: 15_000 });

    /* ------------------------------------------------------------------
     * Step 2 — Type the slug + soft-delete.
     * ------------------------------------------------------------------
     * `SoftDeleteCard` (components/capabilities/danger-zone-tab.tsx)
     * disables the destructive button until the typed slug matches
     * `cap.slug`. On success the parent routes to
     * `/capabilities?status=deleted`.
     * ------------------------------------------------------------------ */
    const slugInputs = page.locator(`input[placeholder="${CAP_SLUG}"]`);
    await slugInputs.first().fill(CAP_SLUG);
    const softDeleteButton = page.getByRole("button", { name: /^soft delete /i });
    await expect(softDeleteButton).toBeEnabled();
    await softDeleteButton.click();
    await expect(page).toHaveURL(/\/capabilities(\?.*)?$/, { timeout: 15_000 });

    /* ------------------------------------------------------------------
     * Step 3 — /settings/trash: the deleted-cap card is present.
     * ------------------------------------------------------------------
     * `/settings/trash` lists soft-deleted caps with `cap:{slug}` and a
     * "Reindex" CTA next to "Delete forever".
     * ------------------------------------------------------------------ */
    await page.goto("/settings/trash");
    await expect(page.getByRole("heading", { name: /^trash$/i })).toBeVisible({ timeout: 15_000 });
    const trashCapText = page.getByText(`cap:${CAP_SLUG}`);
    await expect(trashCapText).toBeVisible({ timeout: 15_000 });

    /* ------------------------------------------------------------------
     * Step 4 — Reindex (restore) on the deleted-cap row.
     * ------------------------------------------------------------------
     * Multiple Reindex buttons can exist (one per soft-deleted cap +
     * repo); scope the locator to the card whose body contains
     * `cap:{slug}`. The mock restore endpoint clears `deleted_at`.
     * ------------------------------------------------------------------ */
    const capCard = page
      .locator("div", { has: page.getByText(`cap:${CAP_SLUG}`) })
      .first();
    await capCard.getByRole("button", { name: /^reindex$/i }).click();

    /* ------------------------------------------------------------------
     * Step 5 — /capabilities list shows the cap as active again.
     * ------------------------------------------------------------------
     * After a successful restore the toast fires + the trash list
     * refetches without the cap. We navigate to /capabilities and
     * assert the cap name appears as an active row.
     * ------------------------------------------------------------------ */
    await page.goto("/capabilities");
    await expect(
      page.getByRole("link", { name: /billing\s*&\s*subscriptions/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    /* ------------------------------------------------------------------
     * Step 6 — Re-soft-delete + permanent-delete via typed slug.
     * ------------------------------------------------------------------
     * Drives the second leg of §5.31: a live cap can be soft-deleted,
     * then permanently deleted from the post-soft-delete Danger zone
     * (which now renders Reindex + Delete-forever cards).
     * ------------------------------------------------------------------ */
    await page.goto(`/capabilities/${CAP_ID}?tab=danger`);
    await expect(
      page.getByRole("heading", { name: /soft delete this capability/i }),
    ).toBeVisible({ timeout: 15_000 });
    await page.locator(`input[placeholder="${CAP_SLUG}"]`).first().fill(CAP_SLUG);
    await page.getByRole("button", { name: /^soft delete /i }).click();
    await expect(page).toHaveURL(/\/capabilities(\?.*)?$/, { timeout: 15_000 });

    // Soft-deleted Danger zone — both Reindex + Delete-forever cards.
    await page.goto(`/capabilities/${CAP_ID}?tab=danger`);
    await expect(
      page.getByRole("heading", { name: /reindex \(restore\)/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: /delete forever/i }),
    ).toBeVisible();

    // Typed-slug confirmation for permanent delete.
    await page.locator(`input[placeholder="${CAP_SLUG}"]`).first().fill(CAP_SLUG);
    const permanentButton = page.getByRole("button", { name: /^delete .* permanently$/i });
    await expect(permanentButton).toBeEnabled();
    await permanentButton.click();
    await expect(page).toHaveURL(/\/capabilities(\?.*)?$/, { timeout: 15_000 });
  });
});
