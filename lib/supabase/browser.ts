/**
 * Browser-side Supabase client.
 *
 * Single instance per browser tab; reused by the session provider and by
 * `apiFetch` (which reads the current access token to inject as
 * `Authorization: Bearer ...`).
 *
 * Supabase persists the session in localStorage + a refresh cookie; the
 * client SDK handles refresh transparently. We never touch the cookie
 * directly.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { config } from "@/lib/config";

let _client: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient {
  if (_client) return _client;
  if (!config.supabase.isConfigured()) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY before signing in.",
    );
  }
  _client = createBrowserClient(config.supabase.url, config.supabase.anonKey);
  return _client;
}
