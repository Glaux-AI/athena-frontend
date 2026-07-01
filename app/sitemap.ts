import type { MetadataRoute } from "next";

import { config } from "@/lib/config";

/**
 * /sitemap.xml (Next.js metadata route).
 *
 * Only the publicly indexable, no-login surfaces: the landing page, the
 * marketing features page, and the public knowledge showcase index. The
 * per-repo showcase pages (/showcase/[repo]) are client-fetched from live
 * org data, so they are intentionally not enumerated here.
 *
 * The middleware matcher already exempts /sitemap.xml, so this response is
 * served without the per-request CSP nonce.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const base = config.siteUrl;
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/features`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/showcase`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
  ];
}
