/**
 * Next.js config — production-hardened.
 *
 * Notes:
 *  - We do NOT use Next.js rewrites to proxy the API. The browser talks to
 *    the API server directly using `NEXT_PUBLIC_API_URL`. Rewriting would
 *    let attackers send requests to internal hosts via SSRF if the env var
 *    were ever pointed at a private network.
 *  - Static security headers (HSTS, X-Frame-Options, etc.) are applied here
 *    via `headers()`. **The Content-Security-Policy is set per-request in
 *    `middleware.ts`** — it needs a fresh nonce per request so Next.js's
 *    inline bootstrap scripts get a `nonce="..."` attribute that satisfies
 *    `script-src 'self' 'nonce-...' 'strict-dynamic'`. Don't add a static
 *    `Content-Security-Policy` here; it would override the nonce'd one and
 *    break hydration.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  // `experimental.typedRoutes` removed — incompatible with Turbopack (Next 15).
  // Turbopack is the default for `next dev --turbo`, which we use locally.

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // CSP is set in middleware.ts (per-request nonce). See note above.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // `payment` is delegated to the Razorpay Checkout iframe (ADR-081)
          // so PaymentRequest-based methods (UPI intent / GPay) work inside it.
          { key: "Permissions-Policy", value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://api.razorpay.com" "https://checkout.razorpay.com"), usb=(), interest-cohort=()' },
          // `same-origin-allow-popups` (not `same-origin`): Razorpay Checkout
          // opens bank/3DS/UPI popups that must keep `window.opener` to
          // message the result back — plain `same-origin` severs that link
          // and the payment can never complete.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
    ];
  },
};

export default nextConfig;
