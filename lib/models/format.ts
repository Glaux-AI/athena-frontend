import type { CatalogRateLimit } from "@/lib/api/client";

/**
 * Human label for a per-1M-token list price. `null` → "-" (no published flat
 * rate), `0` → "Free", otherwise the currency-prefixed rate.
 */
export function priceLabel(price: number | null, currency = "USD"): string {
  if (price === null) return "-";
  if (price === 0) return "Free";
  const sym = currency === "USD" ? "$" : `${currency} `;
  return `${sym}${price}/1M`;
}

/**
 * Compact "1,000 RPM · 300,000 TPM" label for a published per-model cap.
 * Returns `null` when the provider lists no hard per-model number (the
 * provider's `rate_limit_notes` carries the tier story instead).
 */
export function rateLabel(rate: CatalogRateLimit | null): string | null {
  if (!rate) return null;
  const parts: string[] = [];
  if (rate.rpm != null) parts.push(`${rate.rpm.toLocaleString()} RPM`);
  if (rate.tpm != null) parts.push(`${rate.tpm.toLocaleString()} TPM`);
  if (rate.tokens_per_day != null) parts.push(`${rate.tokens_per_day.toLocaleString()}/day`);
  return parts.length > 0 ? parts.join(" · ") : null;
}
