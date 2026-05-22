/**
 * Browser-side Supabase client.
 *
 * Live mode: single instance per tab; reused by the session provider and by
 * `apiFetch` (reads the current access token to inject as
 * `Authorization: Bearer ...`). Supabase persists the session in localStorage
 * and refreshes transparently.
 *
 * Mock mode: returns a stubbed client that satisfies the shape we use
 * (`auth.getSession`, `auth.onAuthStateChange`, `auth.signOut`,
 * `auth.signInWithOAuth`). All operations are no-ops; the real session lives
 * in localStorage via `lib/session/SessionProvider` instead.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { config } from "@/lib/config";

let _client: SupabaseClient | null = null;

function makeMockClient(): SupabaseClient {
  const noopSub = { subscription: { unsubscribe: () => {} } };
  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: noopSub }),
      signOut: async () => ({ error: null }),
      signInWithOAuth: async () => ({ data: { provider: "github", url: "/dashboard" }, error: null }),
    },
  } as unknown as SupabaseClient;
}

export function getBrowserSupabase(): SupabaseClient {
  if (_client) return _client;
  if (config.isMock) {
    _client = makeMockClient();
    return _client;
  }
  if (!config.supabase.isConfigured()) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY before signing in.",
    );
  }
  _client = createBrowserClient(config.supabase.url, config.supabase.anonKey);
  return _client;
}
