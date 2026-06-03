/**
 * Tier repo-limit display copy — ADR-081 pricing surface.
 *
 * The pricing / subscription cards show ONLY repo limits. Capabilities are
 * unlimited on every tier, so we deliberately do NOT surface a capability
 * count anywhere (showing one would imply a cap that doesn't exist).
 *
 * Repo limits per tier:
 *   - Free        — 5 repos,   ≤ 50 MB each
 *   - Solo        — 50 repos,  ≤ 200 MB each
 *   - Pro         — 150 repos, ≤ 1 GB each
 *   - Enterprise  — unlimited repos + size
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
  free: { repos: 5, repoSize: "50 MB", reposLabel: "5 repos (up to 50 MB each)" },
  solo: { repos: 50, repoSize: "200 MB", reposLabel: "50 repos (up to 200 MB each)" },
  pro: { repos: 150, repoSize: "1 GB", reposLabel: "150 repos (up to 1 GB each)" },
  enterprise: { repos: null, repoSize: null, reposLabel: "Unlimited repos" },
};
