import type { Metadata } from "next";

/**
 * §7 - Embed layout.
 *
 * Minimal shell for `/embed/*` routes: NO AppShell, NO top nav, NO
 * sidebar, NO command palette, NO chat drawer, NO protected-route
 * guard. Just a bare container that lets each embed page own its own
 * presentation.
 *
 * Why this lives in its own segment:
 *   - The embed surfaces are framed by third-party host pages. We can't
 *     drag the full chrome along - it would visually fight the host page.
 *   - The `(protected)` layout requires an authenticated cookie; an embed
 *     viewer who isn't signed in should still see *something* (either
 *     the read-only artifact, or a "private" empty state).
 *
 * Constraints inherited from `app/layout.tsx` (the root layout):
 *   - Next.js App Router only allows ONE `<html>`/`<body>` pair in the
 *     tree, owned by the root layout. We rely on the root layout's
 *     chrome (font variables, ThemeProvider, SessionProvider, Toaster)
 *     to mount cleanly for anonymous viewers too - SessionProvider just
 *     sets `status: "anonymous"` when no session is present, which is
 *     fine because embed pages never call `useSession()`.
 *
 * Robots + referrer:
 *   - Next's `metadata.robots` + `metadata.referrer` below emit the
 *     equivalent meta tags into <head>. Centralising them on this
 *     layout means every page under `/embed/*` automatically inherits
 *     `noindex,follow` + `no-referrer` - no per-page boilerplate.
 *
 * iframe-safe headers (X-Frame-Options drop + CSP `frame-ancestors *`)
 * are applied by `middleware.ts` to anything under `/embed/*`.
 */

export const metadata: Metadata = {
  title: "Athena - Embed",
  description: "Read-only Athena embed view.",
  // noindex: embed URLs are deep-link views of internal artifacts and
  //         have no place in search indexes.
  // follow: still let search engines crawl links the embed exposes, so
  //         a public "Open in Athena" CTA can still be discovered.
  robots: { index: false, follow: true },
  // Don't leak the embedding host's URL when a user clicks an outbound
  // link from inside the iframe.
  referrer: "no-referrer",
};

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen w-full bg-[var(--bg)]">{children}</div>;
}
