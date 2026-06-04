import { redirect } from "next/navigation";

import { config } from "@/lib/config";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * `/` → auth-aware entry.
 *
 * The login page doubles as the landing page (marketing surface + sign-in
 * card in one), so anonymous visitors land there. Authenticated visitors,
 * however, must go straight to /dashboard and never see the login screen
 * flash on the way.
 *
 * Live mode reads the Supabase auth cookie server-side and redirects
 * authenticated users before any client render — the inverse of the
 * anonymous→/login cookie gate in `app/(protected)/layout.tsx`. Mock mode
 * keeps its session in localStorage (unreadable server-side), so it falls
 * through to /login, where the login page's client effect bounces
 * authenticated users on.
 */
export default async function RootPage() {
  if (!config.isMock) {
    let authenticated = false;
    try {
      const supabase = await getServerSupabase();
      const { data } = await supabase.auth.getUser();
      authenticated = Boolean(data.user);
    } catch {
      // Supabase unreachable / malformed cookie — treat as anonymous so the
      // public landing page still renders instead of erroring the home route.
    }
    if (authenticated) redirect("/dashboard");
  }
  redirect("/login");
}
