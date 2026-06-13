/**
 * Razorpay Standard Checkout (Checkout.js) integration - ADR-081.
 *
 * Backend write endpoints (`checkout-order`, `orgs/{id}/billing/upgrade`,
 * `seats/buy`, `credits/topup`) return a one-time **Order** payload:
 *
 *   { order_id, razorpay_key_id, amount, currency, checkout_options }
 *
 * The FE opens the hosted Checkout.js modal with that payload. On a
 * successful payment Checkout.js invokes our `handler` with
 * `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }`; we
 * POST that triple to `/v1/billing/verify` for **synchronous UX
 * confirmation only**. The webhook (`POST /v1/webhooks/razorpay`) is the
 * entitlement source of truth, so on `verified:true` the caller polls
 * `GET /v1/orgs/{id}/credits` (+ subscription) for the webhook-applied
 * balance/tier.
 *
 * No `NEXT_PUBLIC_*` key is needed: `razorpay_key_id` is browser-safe and
 * arrives in every order response (it's also baked into
 * `checkout_options.key` by the backend). The script is loaded lazily the
 * first time a checkout opens, so non-billing pages never pull it.
 */

import { api } from "@/lib/api/client";
import type { OrderPayload, VerifyResult } from "@/lib/api/client";

const CHECKOUT_JS_SRC = "https://checkout.razorpay.com/v1/checkout.js";

/** Minimal shape of the global `Razorpay` constructor Checkout.js installs. */
interface RazorpayInstance {
  open: () => void;
  on: (event: string, cb: (resp: unknown) => void) => void;
}
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

/** The success-callback triple Checkout.js hands back. */
interface CheckoutSuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

let scriptPromise: Promise<RazorpayConstructor> | null = null;

/**
 * Lazily inject Checkout.js exactly once and resolve with the global
 * `Razorpay` constructor. Subsequent calls reuse the in-flight / resolved
 * promise. Rejects (and resets so a retry can re-attempt) if the script
 * fails to load (offline / blocked).
 */
function loadCheckoutScript(): Promise<RazorpayConstructor> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Razorpay Checkout can only load in the browser."));
  }
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<RazorpayConstructor>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${CHECKOUT_JS_SRC}"]`,
    );
    const onLoad = () => {
      if (window.Razorpay) resolve(window.Razorpay);
      else reject(new Error("Razorpay Checkout loaded but did not register."));
    };
    const onError = () => {
      scriptPromise = null; // allow a later retry
      reject(new Error("Couldn't load Razorpay Checkout. Check your connection and retry."));
    };
    if (existing) {
      existing.addEventListener("load", onLoad, { once: true });
      existing.addEventListener("error", onError, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = CHECKOUT_JS_SRC;
    script.async = true;
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** Outcome of an `openRazorpayCheckout` round-trip. */
export type CheckoutOutcome =
  | { status: "verified"; orderId: string; paymentId: string }
  | { status: "unverified"; orderId: string; paymentId: string }
  | { status: "dismissed" }
  | { status: "error"; message: string };

export interface OpenCheckoutArgs {
  /** The order payload returned by any billing write endpoint. */
  order: OrderPayload;
  /** Prefill the payer email in the Checkout.js form (optional). */
  prefillEmail?: string | null;
}

/**
 * Open the Razorpay Checkout.js modal for an order and resolve once the
 * user pays (then verifies) or dismisses.
 *
 * On a successful payment we POST the callback triple to
 * `/v1/billing/verify`. `status:"verified"` means the signature checked
 * out - the caller should then poll credits/subscription for the
 * webhook-applied entitlement. `status:"unverified"` means the payment
 * succeeded client-side but the signature didn't verify (rare; the webhook
 * may still grant - the caller should poll and/or warn). `status:"dismissed"`
 * means the user closed the modal without paying.
 */
export function openRazorpayCheckout({
  order,
  prefillEmail,
}: OpenCheckoutArgs): Promise<CheckoutOutcome> {
  return new Promise<CheckoutOutcome>((resolve) => {
    loadCheckoutScript()
      .then((Razorpay) => {
        let settled = false;
        const settle = (outcome: CheckoutOutcome) => {
          if (settled) return;
          settled = true;
          resolve(outcome);
        };

        const handler = (resp: CheckoutSuccess) => {
          void api.billing
            .verify({
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            })
            .then((result: VerifyResult) => {
              settle({
                status: result.verified ? "verified" : "unverified",
                orderId: result.order_id,
                paymentId: result.payment_id,
              });
            })
            .catch(() => {
              // Verify endpoint failed, but the payment did go through -
              // the webhook is still the source of truth. Surface as
              // unverified so the caller polls rather than claiming failure.
              settle({
                status: "unverified",
                orderId: resp.razorpay_order_id,
                paymentId: resp.razorpay_payment_id,
              });
            });
        };

        // The backend pre-builds `checkout_options` (key, order_id, amount,
        // currency, name, description, notes). We layer the runtime-only
        // `handler` + `modal.ondismiss` on top; `key`/`order_id`/`amount`/
        // `currency` are also present as top-level fields on the order for
        // defense-in-depth if `checkout_options` is ever sparse.
        const options: Record<string, unknown> = {
          key: order.razorpay_key_id,
          order_id: order.order_id,
          amount: order.amount,
          currency: order.currency,
          ...order.checkout_options,
          handler,
          modal: { ondismiss: () => settle({ status: "dismissed" }) },
        };
        if (prefillEmail) {
          const existingPrefill =
            (options.prefill as Record<string, unknown> | undefined) ?? {};
          options.prefill = { ...existingPrefill, email: prefillEmail };
        }

        const rzp = new Razorpay(options);
        rzp.on("payment.failed", (resp: unknown) => {
          const description =
            (resp as { error?: { description?: string } } | undefined)?.error
              ?.description ?? "Payment failed.";
          settle({ status: "error", message: description });
        });
        rzp.open();
      })
      .catch((e: unknown) => {
        resolve({
          status: "error",
          message: e instanceof Error ? e.message : "Couldn't open Razorpay Checkout.",
        });
      });
  });
}
