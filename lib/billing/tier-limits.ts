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
 * The credit ledger is USD and the pricing + billing surfaces render AI
 * credit in USD too (e.g. "$25/mo AI credit included"). The subscription
 * prices on the same card stay ₹ (formatInr). Display-only constant - the
 * backend webhook grants the real allowance each billing cycle.
 */
export const TIER_MONTHLY_CREDIT_USD: Record<DisplayTier, number | null> = {
  free: 0,
  solo: 25,
  pro: 75,
  enterprise: null,
};

/**
 * Whether a tier unlocks the Agent + Tool registries (build/use custom
 * agents and custom tools). Mirrors the enforced `allows_custom_agents`
 * in the backend's `athena/billing/tier_limits.py`: a paid-only feature -
 * `false` on Free, `true` on Solo / Pro / Enterprise.
 *
 * Display-only. The real gate is `me.features.customAgents` (per active
 * org, resolved server-side) plus the registry routers; this static
 * mirror lets the anonymous marketing + onboarding pricing cards state
 * the difference without a session. Keep it in step with the backend
 * matrix - it is the ONE functional feature that differs by tier today
 * (Skills and design systems are available on every tier; plans otherwise
 * scale on repos, seats, and included AI credit).
 */
export const TIER_INCLUDES_CUSTOM_AGENTS: Record<DisplayTier, boolean> = {
  free: false,
  solo: true,
  pro: true,
  enterprise: true,
};
