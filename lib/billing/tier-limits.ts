/**
 * Tier repo-limit display copy - ADR-081 pricing surface.
 *
 * The pricing / subscription cards show ONLY repo limits. Domains are
 * unlimited on every tier, so we deliberately do NOT surface a domain
 * count anywhere (showing one would imply a cap that doesn't exist).
 *
 * Repo limits per tier:
 *   - Free        - 5 repos,   ≤ 10 MB each
 *   - Solo        - 30 repos,  ≤ 100 MB each
 *   - Pro         - 100 repos, ≤ 1 GB each
 *   - Enterprise  - unlimited repos + size
 *
 * These are display constants only; the backend enforces the actual caps
 * (`athena/billing/tier_limits.py`) and returns `repo_limit_exceeded` /
 * `repo_too_large` when they're hit.
 */

export type DisplayTier = "free" | "solo" | "pro" | "enterprise";

export interface TierRepoLimit {
  /** Max number of repos this tier may index. `null` = unlimited. */
  repos: number | null;
  /** Per-repo size ceiling, human-readable. `null` = unlimited. */
  repoSize: string | null;
  /** One-line repo-limit summary for a pricing card. */
  reposLabel: string;
}

export const TIER_REPO_LIMITS: Record<DisplayTier, TierRepoLimit> = {
  free: { repos: 5, repoSize: "10 MB", reposLabel: "5 repos (up to 10 MB each)" },
  solo: { repos: 30, repoSize: "100 MB", reposLabel: "30 repos (up to 100 MB each)" },
  pro: { repos: 100, repoSize: "1 GB", reposLabel: "100 repos (up to 1 GB each)" },
  enterprise: { repos: null, repoSize: null, reposLabel: "Unlimited repos" },
};

/**
 * Included monthly AI credit per tier, in **USD** - mirrors the enforced
 * `monthly_credit_usd` in the backend's `athena/billing/tier_limits.py`
 * (Free $0 / Solo $25 / Pro $75). `null` = negotiated (Enterprise).
 *
 * The credit ledger is USD; pricing surfaces render it in ₹ via
 * `formatUsdAsInr(usd, catalog.usd_to_inr)` so it lines up with the
 * INR subscription prices on the same card. Display-only constant - the
 * backend webhook grants the real allowance each billing cycle.
 */
export const TIER_MONTHLY_CREDIT_USD: Record<DisplayTier, number | null> = {
  free: 0,
  solo: 25,
  pro: 75,
  enterprise: null,
};
