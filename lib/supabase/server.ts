/**
 * Server-side Supabase client — used inside React Server Components,
 * Route Handlers, and Middleware.
 *
 * Reads the auth cookie via `next/headers`. Each request gets a fresh
 * client because cookies are per-request.
 */

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { config } from "@/lib/config";

export async function getServerSupabase(): Promise<SupabaseClient> {
  if (!config.supabase.isConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  const store = await cookies();

  return createServerClient(config.supabase.url, config.supabase.anonKey, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            store.set(name, value, options),
          );
        } catch {
          // Server Components can't set cookies; the Middleware handler
          // will refresh + persist on the next request.
        }
      },
    },
  });
}
