/**
 * Where to send a user immediately after a successful sign-in + `/v1/auth/sync`.
 *
 * The subtlety this guards against: a brand-new user accepting an invite has
 * ZERO memberships at this point - the invitation is still pending, and
 * *accepting it* is what creates their first membership. The previous logic
 * sent every zero-membership user to `/orgs/new`, which silently abandoned the
 * invite (the invitee ended up creating their own separate org instead of
 * joining the one that invited them).
 *
 * So an `/accept-invite/...` `returnTo` must win over the "no org yet → create
 * one" redirect: route the user to the accept page, which accepts the invite
 * (creating their first membership) and then lands them on the dashboard. Only
 * genuinely org-less users *without* a pending invite go to `/orgs/new`.
 */
export function postSignInRoute(returnTo: string, membershipCount: number): string {
  if (returnTo.startsWith("/accept-invite/")) return returnTo;
  if (membershipCount === 0) return "/orgs/new";
  return returnTo;
}
