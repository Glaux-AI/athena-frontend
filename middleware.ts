/**
 * Middleware - per-request nonce-based Content-Security-Policy.
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
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();

  // CSP `connect-src` must list every origin the browser fetches from.
  // Mirrors the previous next.config.mjs logic; in dev, allow ws:// for
  // Turbopack's HMR socket. Supabase JS calls `${supabaseUrl}/auth/v1/*`
  // and `${supabaseUrl}/realtime/v1/*` directly from the browser during
  // OAuth PKCE exchange + session refresh, so its origin must be allowed.
  const connectSrc = ["'self'"];
  for (const candidate of [apiUrl, supabaseUrl]) {
    if (!candidate) continue;
    try {
      const u = new URL(candidate);
      connectSrc.push(u.origin);
    } catch {
      /* env validation lives in lib/config.ts; ignore parse errors here */
    }
  }
  // Supabase also opens a wss:// channel to `<project>.supabase.co/realtime/v1`
  // when the client subscribes to changes - allow the parallel ws origin.
  if (supabaseUrl) {
    try {
      const u = new URL(supabaseUrl);
      connectSrc.push(`wss://${u.host}`);
    } catch {
      /* ignore */
    }
  }
  if (isDev) connectSrc.push("ws:", "wss:");

  // Razorpay Standard Checkout (ADR-081, lib/billing/razorpay-checkout.ts):
  // Checkout.js renders its modal as an <iframe> pointed at
  // `https://api.razorpay.com/v1/checkout/public?...` - without an explicit
  // frame-src, that iframe falls back to `default-src 'self'` and is
  // (blocked:origin)'d, so checkout never opens. The parent-frame script
  // also fetches analytics/preferences from *.razorpay.com.
  connectSrc.push("https://*.razorpay.com");

  // Cloudflare Turnstile (components/auth/turnstile.tsx): the CAPTCHA on the
  // email-OTP send loads its script + renders its challenge in an <iframe>
  // from challenges.cloudflare.com, and posts the solve back there.
  connectSrc.push("https://challenges.cloudflare.com");

  const cspDirectives = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    // 'strict-dynamic' trusts scripts dynamically inserted by the nonce'd
    // bootstrap (Next's chunk loader, deferred scripts, etc.) - this is what
    // lets the lazily-injected Razorpay Checkout.js execute; the explicit
    // checkout.razorpay.com host is the fallback for browsers without
    // 'strict-dynamic' support. 'unsafe-eval' is only added in dev for
    // Fast Refresh - production is eval-free.
    isDev
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval' https://checkout.razorpay.com https://challenges.cloudflare.com`
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://checkout.razorpay.com https://challenges.cloudflare.com`,
    // Tailwind v4 + Next's inline critical CSS need 'unsafe-inline' on
    // style-src; styles can't be nonce'd in Next 15 the way scripts can.
    "style-src 'self' 'unsafe-inline'",
    // `avatars.githubusercontent.com` for GitHub-OAuth profile pics that
    // Supabase surfaces via `user.user_metadata.avatar_url`; the FE renders
    // these inline (TopBar member chip, /settings/members, mention chips).
    // `*.googleusercontent.com` covers Google OAuth avatars too.
    // `*.razorpay.com` for Checkout.js assets (method icons, brand logo).
    "img-src 'self' data: blob: https://avatars.githubusercontent.com https://*.googleusercontent.com https://*.razorpay.com",
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(" ")}`,
    // The Razorpay Checkout modal iframe (api.razorpay.com/v1/checkout/public)
    // + any checkout.razorpay.com frames it opens at the top level. Turnstile
    // renders its CAPTCHA challenge in a challenges.cloudflare.com iframe.
    "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://challenges.cloudflare.com",
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
  // §5.7.1 - surface the request path to server components so the
  // protected-layout SC can build a `?returnTo=` when bouncing
  // anonymous users to /login. Next.js doesn't expose the URL via
  // `headers()` directly, so we propagate it ourselves.
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", csp);

  // §7 - iframe-safe embed routes.
  //
  // Every non-embed response carries `X-Frame-Options: DENY` (set by
  // next.config.mjs `headers()`) so the app can't be framed by other
  // sites. The `/embed/*` surfaces are the deliberate exception: they
  // must render inside an arbitrary host page's <iframe>. We:
  //   1. Drop X-Frame-Options entirely (legacy header is per-origin, not
  //      per-path - we can't say "DENY everywhere except /embed/*" in
  //      next.config; deletion here is what lets the response frame).
  //   2. Override the per-request CSP with a copy that swaps
  //      `frame-ancestors 'none'` for `frame-ancestors *` so modern
  //      browsers honour the loosening (CSP wins over X-Frame-Options
  //      when both are present; we drop XFO to keep older browsers
  //      consistent with modern ones).
  //
  // Rationale for `*` in v1: embed surfaces are read-only public views
  // (or, for org-bound data, gracefully fall back to a "sign in" empty
  // state). There is no CSRF surface - no mutation buttons, no form
  // submits, no cookie-bearing API calls. A future config knob can
  // narrow this to an allowlist when the use case demands it.
  if (request.nextUrl.pathname.startsWith("/embed/")) {
    response.headers.delete("X-Frame-Options");
    const embedCsp = csp.replace(
      "frame-ancestors 'none'",
      "frame-ancestors *",
    );
    response.headers.set("Content-Security-Policy", embedCsp);
  }

  return response;
}

export const config = {
  matcher: [
    // Match all paths EXCEPT:
    //   - api routes (JSON responses, no inline scripts to protect)
    //   - _next/static (immutable assets)
    //   - _next/image (image optimization endpoint)
    //   - favicon.ico + icon.svg (the metadata favicon - no HTML rendering)
    //   - robots, sitemap (no HTML rendering)
    // The `missing` clause skips middleware on prefetch requests, which
    // would otherwise burn a nonce per prefetch with no use of it.
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
