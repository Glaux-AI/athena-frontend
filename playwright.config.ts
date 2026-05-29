/**
 * Playwright config — Athena Web E2E.
 *
 * Walks Section 1.5 of the readiness checklist (athena-docs/07-operations/
 * local-readiness-checklist.md) in headless Chromium against a running
 * Next.js dev server. Chromium-only by design: the checklist row says
 * "headless Chromium" — adding more browsers here would broaden scope
 * without a checklist row to justify it.
 *
 * Mode: by default the spec works against `NEXT_PUBLIC_API_MODE=mock`, so
 * a real backend is NOT required. Boot the FE with `pnpm dev` (after
 * setting `NEXT_PUBLIC_API_MODE=mock` in `.env.local`) and then run
 * `pnpm test:e2e`. The `webServer` config below is intentionally
 * opt-in via `PLAYWRIGHT_MANAGE_DEV_SERVER=1`; in normal flows the
 * developer already has a dev server up and we'd rather not race a
 * second one.
 */

import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

const baseConfig: PlaywrightTestConfig = {
  testDir: "./tests/e2e",
  // The §1.5 walkthrough is one sequential narrative; parallelising it
  // would race the demo SSE stream against itself and flake. One worker
  // matches what a human does walking the checklist.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
};

// Optional Playwright-managed dev server. Off by default so we don't
// collide with a developer's already-running `pnpm dev`. Set
// PLAYWRIGHT_MANAGE_DEV_SERVER=1 to have Playwright boot one. Spread
// conditionally so the omitted property doesn't trip
// `exactOptionalPropertyTypes` in tsconfig.json.
if (process.env.PLAYWRIGHT_MANAGE_DEV_SERVER) {
  baseConfig.webServer = {
    command: "pnpm dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_API_MODE: "mock",
      NEXT_PUBLIC_API_URL: "http://localhost:8000",
      NEXT_PUBLIC_APP_NAME: "Athena",
    },
  };
}

export default defineConfig(baseConfig);
