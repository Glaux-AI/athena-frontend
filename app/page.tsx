import { redirect } from "next/navigation";

import { config } from "@/lib/config";
import { getServerSupabase } from "@/lib/supabase/server";

import LandingAndLogin from "./login/landing-and-login";

/**
 * `/` → public landing (marketing surface + sign-in card in one).
 *
 * The home route renders the landing page directly with a 200 - it does NOT
 * redirect anonymous visitors to `/login`. That extra hop was the problem:
 * a public share URL that 307-bounces a crawler onto a page named `/login`
 * reads as cloaking to link scanners (LinkedIn/Slack/Google), which is what
 * got the domain flagged as suspicious. Serving real content + Open Graph
 * tags at the canonical root fixes that. `/login` still exists for the
 * protected-layout auth gate (`?returnTo=`) and error notices.
 *
 * Only authenticated visitors are redirected, straight to /dashboard, so
 * they never see the landing flash on the way in. Live mode reads the
 * Supabase auth cookie server-side; mock mode keeps its session in
 * localStorage (unreadable server-side), so it renders the landing and lets
 * <LandingAndLogin>'s client effect bounce an authenticated user on.
 */
export default async function RootPage() {
  if (!config.isMock) {
    let authenticated = false;
    try {
      const supabase = await getServerSupabase();
      const { data } = await supabase.auth.getUser();
      authenticated = Boolean(data.user);
    } catch {
      // Supabase unreachable / malformed cookie - treat as anonymous so the
      // public landing page still renders instead of erroring the home route.
    }
    if (authenticated) redirect("/dashboard");
  }
  return <LandingAndLogin />;
}
