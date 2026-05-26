"use client";

/**
 * Protected-route client guard — runs *inside* the Server Component
 * layout once the cookie-based auth check has passed (live mode) or
 * always (mock mode, since the cookie path doesn't apply).
 *
 * Responsibilities the Server Component can't own:
 *
 *   1. Mock mode — the mock "session" lives in `localStorage`, so the
 *      server has nothing to read. We fall back to the old client-side
 *      gate (status === "anonymous" → /login) here.
 *   2. §5.31 soft-deleted org bounce — depends on `me.memberships[i].deletedAt`,
 *      which is loaded from `/v1/me` by the client SessionProvider after
 *      the cookie auth resolves. Owners get funnelled to `/settings/trash`;
 *      non-owners get bounced to `/login?error=org_deleted`.
 *
 * Renders nothing; just wires the redirects via `useEffect`.
 */

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { config } from "@/lib/config";
import { useSession } from "@/lib/session/SessionProvider";

export function ProtectedClientGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const { status, me, activeOrgId } = useSession();

  useEffect(() => {
    // Mock mode: server gate doesn't apply (no cookie). Match the
    // pre-Server-Component behaviour: anonymous → /login.
    if (config.isMock && status === "anonymous") {
      const returnTo = encodeURIComponent(pathname || "/dashboard");
      router.replace(`/login?returnTo=${returnTo}`);
      return;
    }

    if (status === "authenticated" && me && activeOrgId) {
      const active = me.memberships.find((m) => m.orgId === activeOrgId);
      if (active?.deletedAt) {
        if (!active.isOwner) {
          router.replace("/login?error=org_deleted");
        } else if (
          !pathname?.startsWith("/settings/trash") &&
          !pathname?.startsWith("/settings/danger") &&
          !pathname?.startsWith("/orgs/new")
        ) {
          router.replace("/settings/trash");
        }
      }
    }
  }, [status, router, pathname, me, activeOrgId]);

  return null;
}
