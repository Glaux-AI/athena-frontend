/**
 * Next.js config — production-hardened.
 *
 * Notes:
 *  - We do NOT use Next.js rewrites to proxy the API. The browser talks to
 *    the API server directly using `NEXT_PUBLIC_API_URL`. Rewriting would
 *    let attackers send requests to internal hosts via SSRF if the env var
 *    were ever pointed at a private network.
 *  - Security headers are applied to every response. CSP is intentionally
 *    strict; `connect-src` includes `NEXT_PUBLIC_API_URL` so the browser
 *    can reach the API.
 *  - `'unsafe-inline'` on `style-src` is required by Tailwind v4 + Next.js
 *    inline critical CSS. There is no `'unsafe-eval'`. CSP nonces can be
 *    layered in a later release.
 */

const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "").trim();

function buildCSP() {
  const connectSrc = ["'self'"];
  if (apiUrl) {
    try {
      const u = new URL(apiUrl);
      connectSrc.push(u.origin);
    } catch {
      /* env validation lives in lib/config.ts; ignore here */
    }
  }
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(" ")}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  experimental: {
    typedRoutes: true,
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: buildCSP() },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
    ];
  },
};

export default nextConfig;
