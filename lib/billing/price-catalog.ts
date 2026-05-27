/**
 * §7.9.5 row 2464 — Price-catalog fallback constants.
 *
 * TODO(IIII): BE endpoint `GET /v1/billing/price-catalog` is pending.
 * Replace these constants by removing the call-site fallback in
 * `app/(protected)/settings/billing/page.tsx` (search for
 * `PRICE_CATALOG_FALLBACK`) once IIII has shipped the live endpoint.
 *
 * Until then, the FE renders the labels from this file so the
 * UpgradeTiersCard doesn't have to hard-code USD amounts inline (which
 * would land in §11.4's hardcoding sweep).
 *
 * Numbers mirror the BE shape the eventual endpoint returns:
 *   {solo_base_usd, solo_extra_seat_usd, pro_base_usd, pro_extra_seat_usd}
 */

import type { PriceCatalog } from "@/lib/api/client";

export const PRICE_CATALOG_FALLBACK: PriceCatalog = {
  solo_base_usd: 19,
  solo_extra_seat_usd: 15,
  pro_base_usd: 99,
  pro_extra_seat_usd: 10,
};
