/**
 * §9.7 GDPR data-subject rights - readiness-checklist rows.
 *
 * Asserts the public legal surface renders (the signup/login consent copy
 * used to link to /legal/terms + /legal/privacy which DID NOT EXIST -
 * regression-guard that they never 404 again), the sub-processor
 * disclosure renders the registry, and the profile page carries the three
 * Art. 15/16/17 self-service affordances (export / editable display name /
 * delete account).
 *
 * Run preconditions:
 *   - Next.js dev server on `http://localhost:3000` (PLAYWRIGHT_BASE_URL
 *     overrides), `NEXT_PUBLIC_API_MODE=mock` so no backend is required.
 *   - Mock mode resolves /v1/me/consents with nothing to accept, so the
 *     ConsentGate stays closed here; the gate's blocking behaviour is
 *     backend-driven (version bump) and covered by BE unit tests.
 */

import { test, expect } from "@playwright/test";

test.describe("§9.7 legal pages", () => {
  test("terms, privacy, and subprocessors render (no 404)", async ({ page }) => {
    await page.goto("/legal/terms");
    await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();

    await page.goto("/legal/privacy");
    await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your rights" })).toBeVisible();

    await page.goto("/legal/subprocessors");
    await expect(page.getByRole("heading", { name: "Sub-processors" })).toBeVisible();
    // The registry list loads from /v1/legal/subprocessors (mocked).
    await expect(page.getByText("Supabase")).toBeVisible();
  });
});

test.describe("§9.7 account self-service", () => {
  test("profile page carries export + rectification + delete-account", async ({ page }) => {
    // Mock-mode sign-in: the demo-user path used by the walkthrough spec.
    await page.goto("/login");
    const demoButton = page.getByRole("button", { name: /continue as demo user/i });
    await demoButton.first().click();
    await page.waitForURL("**/dashboard**");

    await page.goto("/settings/profile");
    await expect(page.getByRole("button", { name: "Export my data" })).toBeVisible();
    await expect(page.getByLabel("Display name")).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete my account" })).toBeVisible();
    // The destructive action stays disabled until the typed email matches.
    await expect(page.getByRole("button", { name: "Delete my account" })).toBeDisabled();
  });
});
