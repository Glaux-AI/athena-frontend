/**
 * Server-side Supabase client - used inside React Server Components,
 * Route Handlers, and Middleware.
 *
 * Reads the auth cookie via `next/headers`. Each request gets a fresh
 * client because cookies are per-request.
 */

import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { config } from "@/lib/config";

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

export async function getServerSupabase(): Promise<SupabaseClient> {
  if (config.isMock || !config.supabase.url || !config.supabase.anonKey) {
    // Mock mode (or unconfigured): return a stub. Server components that
    // hit this in mock mode aren't on the active code path - the auth check
    // is done client-side via SessionProvider - but we don't want it to throw.
    return {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
        getSession: async () => ({ data: { session: null }, error: null }),
      },
    } as unknown as SupabaseClient;
  }
  const store = await cookies();

  return createServerClient(config.supabase.url, config.supabase.anonKey, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            // next/headers `store.set` accepts a 3rd arg if defined, errors
            // when undefined is explicitly passed. Branch keeps the call safe.
            if (options) (store.set as (n: string, v: string, o: object) => void)(name, value, options);
            else (store.set as (n: string, v: string) => void)(name, value);
          });
        } catch {
          // Server Components can't set cookies; the Middleware handler
          // will refresh + persist on the next request.
        }
      },
    },
  });
}
