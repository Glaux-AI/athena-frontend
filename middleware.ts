/**
 * Middleware — per-request nonce-based Content-Security-Policy.
 *
 * Why this lives here and not in `next.config.mjs`:
 *   The static CSP in next.config.mjs `headers()` is computed once at
 *   build time and cannot include a per-request nonce. Without a nonce,
 *   the only way to allow Next.js's inline bootstrap scripts (RSC stream
 *   buffer, hydration glue, runtime config) is `'unsafe-inline'`, which
 *   negates most of the value of having a CSP. Moving the CSP into
 *   middleware lets us generate a fresh nonce per request and let Next
 *   apply it to its own inline `<script>` tags automatically.
 *
 * How Next.js picks up the nonce:
 *   1. We generate a base64 random nonce here.
 *   2. We set it on the *request* headers as `x-nonce` (so Next's render
 *      pipeline sees it) and on the *response* `Content-Security-Policy`
 *      header.
 *   3. The root layout calls `headers()`, which opts the route into
 *      dynamic rendering and triggers Next to read `x-nonce` and apply
 *      it to every inline `<script>` it emits.
 *
 * Cost of this approach: every route is now dynamically rendered (no
 * static optimization), because a per-request nonce can't be baked into
 * a static asset. For an internal/mock-mode demo deploy this is fine.
 * If the marketing-style `/login` landing page is later required to be
 * fully static, we'd need to flip to a hash-based CSP (computed at build
 * time) or accept `'unsafe-inline'` for that single route.
 */

import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV !== "production";
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "").trim();

  // CSP `connect-src` must list every origin the browser fetches from.
  // Mirrors the previous next.config.mjs logic; in dev, allow ws:// for
  // Turbopack's HMR socket.
  const connectSrc = ["'self'"];
  if (apiUrl) {
    try {
      const u = new URL(apiUrl);
      connectSrc.push(u.origin);
    } catch {
      /* env validation lives in lib/config.ts; ignore parse errors here */
    }
  }
  if (isDev) connectSrc.push("ws:", "wss:");

  const cspDirectives = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    // 'strict-dynamic' trusts scripts dynamically inserted by the nonce'd
    // bootstrap (Next's chunk loader, deferred scripts, etc.). 'unsafe-eval'
    // is only added in dev for Fast Refresh — production is eval-free.
    isDev
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // Tailwind v4 + Next's inline critical CSS need 'unsafe-inline' on
    // style-src; styles can't be nonce'd in Next 15 the way scripts can.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(" ")}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ];
  if (!isDev) cspDirectives.push("upgrade-insecure-requests");
  const csp = cspDirectives.join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // Pass the CSP through to the request headers too so server components
  // that call `headers()` can introspect it if needed.
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Match all paths EXCEPT:
    //   - api routes (JSON responses, no inline scripts to protect)
    //   - _next/static (immutable assets)
    //   - _next/image (image optimization endpoint)
    //   - favicon, robots, sitemap (no HTML rendering)
    // The `missing` clause skips middleware on prefetch requests, which
    // would otherwise burn a nonce per prefetch with no use of it.
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
