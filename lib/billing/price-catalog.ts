/**
 * §7.9.5 / ADR-081 - Price-catalog fallback constants (INR).
 *
 * The live `GET /v1/billing/price-catalog` endpoint is public and returns
 * whole-rupee `int`s in `billing_currency` (INR), or `null` per field when
 * an env var is unset (dev mode). Call-sites prefer the live endpoint and
 * fall back to these constants only when it's unreachable (e.g. the
 * unauthenticated landing page before the API is up, or a transient
 * network blip) so the pricing labels never render blank.
 *
 * Numbers mirror the BE shape `billing.py:PriceCatalogOut`:
 *   { currency, solo_base, solo_extra_seat, pro_base, pro_extra_seat }
 *
 * Values reflect the `PRICE_{SOLO,PRO}_{BASE,EXTRA}` env block (INR). Keep
 * these in step with the deployed env; they are display-only and never
 * drive a charge (the order amount is computed server-side).
 */

import type { PriceCatalog } from "@/lib/api/client";

export const PRICE_CATALOG_FALLBACK: PriceCatalog = {
  currency: "INR",
  solo_base: 3999,
  solo_extra_seat: 1499,
  pro_base: 11999,
  pro_extra_seat: 1199,
  usd_to_inr: 100,
};
