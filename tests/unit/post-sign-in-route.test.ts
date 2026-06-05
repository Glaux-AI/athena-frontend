/**
 * Tests for `postSignInRoute` — the redirect decision made in /auth/callback
 * after sign-in + /v1/auth/sync.
 *
 * Regression: a brand-new user accepting an invite has 0 memberships but must
 * land on the accept page (which creates their first membership), NOT on
 * /orgs/new — the old logic sent every zero-membership user to /orgs/new and
 * silently abandoned the invite.
 */

import { describe, expect, it } from "vitest";

import { postSignInRoute } from "@/lib/auth/post-sign-in-route";

describe("postSignInRoute", () => {
  it("routes a brand-new invitee (0 memberships) to the accept page, not /orgs/new", () => {
    expect(postSignInRoute("/accept-invite/eyJabc.def.ghi", 0)).toBe(
      "/accept-invite/eyJabc.def.ghi",
    );
  });

  it("routes a member who is accepting an invite to the accept page", () => {
    expect(postSignInRoute("/accept-invite/tok", 3)).toBe("/accept-invite/tok");
  });

  it("routes a brand-new user WITHOUT an invite to org-create", () => {
    expect(postSignInRoute("/dashboard", 0)).toBe("/orgs/new");
  });

  it("routes a returning user to their returnTo", () => {
    expect(postSignInRoute("/dashboard", 2)).toBe("/dashboard");
    expect(postSignInRoute("/capabilities/x", 1)).toBe("/capabilities/x");
  });

  it("anchors the accept-invite check to the path prefix", () => {
    // A lookalike path for a zero-membership user still routes to org-create.
    expect(postSignInRoute("/settings/accept-invite-help", 0)).toBe("/orgs/new");
  });
});
