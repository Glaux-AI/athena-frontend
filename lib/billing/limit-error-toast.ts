/**
 * §7.10 - Centralized Sonner-toast mapping for the six new BE error
 * codes NNNN raises from its LLM + ingest enforcement chokepoint.
 *
 * Each handler reads `ApiError.metadata` (which `lib/api/client.ts`
 * already threads from the `{code, message, metadata}` server
 * envelope) and renders a friendly toast with an optional
 * `Upgrade plan` action button driven by `metadata.upgrade_url` (or
 * the in-app billing route when the BE omits it).
 *
 * Returns `true` when the error was a known credit/limit code so the
 * caller can early-exit; `false` otherwise so the caller's generic
 * fallback can run.
 */

import { toast } from "sonner";

import { ApiError } from "@/lib/api/client";

/** Closed set of the codes this mapper handles. Anything outside the
 *  set falls through to the caller's generic toast path. */
const LIMIT_ERROR_CODES = new Set([
  "credits_exhausted",
  "spend_cap_reached",
  "overage_not_enabled",
  "repo_limit_exceeded",
  "domain_limit_exceeded",
  "repo_too_large",
] as const);

type LimitErrorCode =
  | "credits_exhausted"
  | "spend_cap_reached"
  | "overage_not_enabled"
  | "repo_limit_exceeded"
  | "domain_limit_exceeded"
  | "repo_too_large";

/** Best-effort string coercion off the metadata bag - keeps the
 *  toast resilient to BE sending numbers, strings, or null for the
 *  same field across versions. */
function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function upgradeAction(
  metadata: Record<string, unknown> | null | undefined,
): { label: string; onClick: () => void } {
  const upgradeUrl = asString(metadata?.upgrade_url) ?? "/settings/billing";
  return {
    label: "Upgrade plan",
    onClick: () => {
      if (upgradeUrl.startsWith("http")) {
        window.location.assign(upgradeUrl);
      } else {
        window.location.assign(upgradeUrl);
      }
    },
  };
}

/**
 * Attempt to render a friendly toast for a known credit/limit error.
 * Returns `true` if the code matched and a toast was emitted, `false`
 * otherwise (the caller falls back to its generic toast path).
 */
export function showLimitErrorToast(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  if (!LIMIT_ERROR_CODES.has(err.code as LimitErrorCode)) return false;

  const md = err.metadata ?? {};

  switch (err.code) {
    case "credits_exhausted": {
      const remaining = asString(md.credits_remaining_usd) ?? "0.00";
      toast.error(
        `AI credits exhausted ($${remaining} left). Top up or enable overage to continue.`,
        { action: upgradeAction(md), duration: 8000 },
      );
      return true;
    }
    case "spend_cap_reached": {
      const cap = asNumber(md.hard_cap_usd);
      const mtd = asString(md.mtd_spend_usd) ?? "-";
      toast.error(
        cap !== null
          ? `Spend cap reached ($${cap}). MTD: $${mtd}. Raise the cap to continue.`
          : `Spend cap reached. MTD: $${mtd}. Raise the cap to continue.`,
        { action: upgradeAction(md), duration: 8000 },
      );
      return true;
    }
    case "overage_not_enabled": {
      const remaining = asString(md.credits_remaining_usd) ?? "0.00";
      toast.error(
        `Credit at $${remaining} and overage is off. Enable overage or top up to continue.`,
        { action: upgradeAction(md), duration: 8000 },
      );
      return true;
    }
    case "repo_limit_exceeded": {
      const current = asNumber(md.current_count);
      const limit = asNumber(md.limit);
      const tier = asString(md.tier) ?? "current";
      toast.error(
        current !== null && limit !== null
          ? `Repo limit reached (${current}/${limit} on ${tier}). Upgrade to add more.`
          : `Repo limit reached on ${tier}. Upgrade to add more.`,
        { action: upgradeAction(md), duration: 8000 },
      );
      return true;
    }
    case "domain_limit_exceeded": {
      const current = asNumber(md.current_count);
      const limit = asNumber(md.limit);
      const tier = asString(md.tier) ?? "current";
      toast.error(
        current !== null && limit !== null
          ? `Domain limit reached (${current}/${limit} on ${tier}). Upgrade to add more.`
          : `Domain limit reached on ${tier}. Upgrade to add more.`,
        { action: upgradeAction(md), duration: 8000 },
      );
      return true;
    }
    case "repo_too_large": {
      const size = asNumber(md.total_size_mb);
      const limit = asNumber(md.limit_mb);
      const repo = asString(md.repo);
      const head = repo ? `Repo "${repo}"` : "Repo";
      toast.error(
        size !== null && limit !== null
          ? `${head} is ${size} MB (limit ${limit} MB). Upgrade for larger repos.`
          : `${head} exceeds the size limit. Upgrade for larger repos.`,
        { action: upgradeAction(md), duration: 8000 },
      );
      return true;
    }
    default:
      return false;
  }
}
