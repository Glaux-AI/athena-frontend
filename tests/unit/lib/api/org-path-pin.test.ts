/**
 * Unit tests for `orgIdFromPath` in `lib/api/client.ts` - the rule that PINS
 * the `X-Athena-Org-Id` header to the org already in the request path so the
 * two can never disagree. A mismatch made the backend resolve a different
 * active org (from a stale / cleared localStorage) and 403 with "Cross-org
 * access denied" - the multi-org switch bug.
 *
 * The header injection itself goes through the async `authHeaders`; here we
 * pin the pure path→orgId derivation that feeds it.
 */
import { describe, expect, it } from "vitest";

import { orgIdFromPath } from "@/lib/api/client";

const ORG = "189b462a-cfa6-4240-8587-24484759ed44";

describe("orgIdFromPath", () => {
  it("extracts the org id from a nested org-scoped path", () => {
    expect(orgIdFromPath(`/v1/orgs/${ORG}/onboarding`)).toBe(ORG);
    expect(orgIdFromPath(`/v1/orgs/${ORG}/seats`)).toBe(ORG);
    expect(orgIdFromPath(`/v1/orgs/${ORG}/credits/topup`)).toBe(ORG);
  });

  it("extracts from a bare /v1/orgs/{id} and colon-op paths", () => {
    expect(orgIdFromPath(`/v1/orgs/${ORG}`)).toBe(ORG);
    expect(orgIdFromPath(`/v1/orgs/${ORG}:soft-delete`)).toBe(ORG);
    expect(orgIdFromPath(`/v1/orgs/${ORG}?tab=1`)).toBe(ORG);
  });

  it("returns undefined for non-org-scoped paths (header falls back to localStorage)", () => {
    expect(orgIdFromPath("/v1/me")).toBeUndefined();
    expect(orgIdFromPath("/v1/me/active-org")).toBeUndefined();
    expect(orgIdFromPath("/v1/tasks")).toBeUndefined();
    expect(orgIdFromPath("/v1/invitations/some-token/accept")).toBeUndefined();
  });

  it("does not match a non-uuid org segment (e.g. a slug)", () => {
    expect(orgIdFromPath("/v1/orgs/kubera/onboarding")).toBeUndefined();
  });
});
