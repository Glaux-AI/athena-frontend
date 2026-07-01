import type { MetadataRoute } from "next";

import { config } from "@/lib/config";

/**
 * /robots.txt (Next.js metadata route).
 *
 * Allow crawling of the public marketing + showcase surfaces and point
 * crawlers at the sitemap. Keep the signed-in app, auth utility routes, the
 * API, and iframe embeds out of the index - they redirect anonymous visitors
 * to /login anyway, so letting them be indexed would only surface login walls
 * (and, historically, is part of why the domain read as "suspicious").
 *
 * The middleware matcher already exempts /robots.txt, so this response is
 * served without the per-request CSP nonce.
 */
export default function robots(): MetadataRoute.Robots {
  // Signed-in app segments under app/(protected) - private, not content.
  const privateAppPaths = [
    "activity", "blueprint-proposals", "chat", "cost", "dashboard",
    "decisions", "design-tokens", "domains", "inbox", "knowledge", "local",
    "mcp", "my-work", "onboarding", "orgs", "rules", "runs", "settings",
    "skills", "work",
  ].map((seg) => `/${seg}/`);

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/auth/", // OAuth callbacks + PKCE code exchange
        "/accept-invite/", // token-gated invite acceptance
        "/embed/", // iframe-only surfaces
        ...privateAppPaths,
      ],
    },
    sitemap: `${config.siteUrl}/sitemap.xml`,
    host: config.siteUrl,
  };
}
