import { redirect } from "next/navigation";

import { config } from "@/lib/config";
import { getServerSupabase } from "@/lib/supabase/server";

import LandingAndLogin from "./landing-and-login";

/**
 * /login - server-side auth gate in front of the landing + sign-in page.
 *
 * An authenticated visitor must never see the login screen. In live mode we
 * read the Supabase auth cookie server-side and bounce them to their
 * post-login destination *before* the page renders - the mirror of the
 * anonymous→/login gate in `app/(protected)/layout.tsx`, and the same gate
 * the home route (`app/page.tsx`) uses.
 *
 * Two deliberate carve-outs:
 *   - `?error=` present (e.g. `org_deleted`, `session_expired`): the visitor
 *     was bounced here *on purpose* and needs to read the notice. The §5.31
 *     soft-deleted-org non-owner keeps a valid Supabase session, so blindly
 *     redirecting an "authenticated" visitor back would loop
 *     /login ⇄ /dashboard. When an error code is present we always render.
 *   - Mock mode: the session lives in `localStorage` (unreadable
 *     server-side), so the client effect in `<LandingAndLogin>` owns the
 *     bounce.
 *
 * `<LandingAndLogin>` keeps its own client-side bounce for those two cases
 * and as a belt-and-braces fallback.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const hasError = typeof sp.error === "string" && sp.error !== "";

  if (!config.isMock && !hasError) {
    let authenticated = false;
    try {
      const supabase = await getServerSupabase();
      const { data } = await supabase.auth.getUser();
      authenticated = Boolean(data.user);
    } catch {
      // Supabase unreachable / malformed cookie - render the public page
      // instead of erroring the login route.
    }
    if (authenticated) {
      const raw = typeof sp.returnTo === "string" ? sp.returnTo : "/dashboard";
      // Only honour a local path - never server-redirect to an external or
      // protocol-relative URL supplied via `?returnTo=`.
      const dest =
        raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\")
          ? raw
          : "/dashboard";
      redirect(dest);
    }
  }

  return <LandingAndLogin />;
}
