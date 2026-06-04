"use client";

/**
 * OAuth return target.
 *
 * 1. Supabase JS auto-consumes the `code` from the URL hash/query on
 *    `getSession()`; we just need to wait for the session to land.
 * 2. Call `/v1/auth/sync` so the backend creates the local User row.
 * 3. Branch on `membership_count`:
 *      - 0 (brand-new sign-up) → `/orgs/new`, which routes to
 *        `/onboarding/{slug}` after the user creates their first org.
 *      - ≥1 (returning user)  → `returnTo` (defaults to `/dashboard`).
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Center, Stack } from "@/components/layout/primitives";
import { Card } from "@/components/ui/card";
import { AmbientBackground } from "@/components/ui/ambient-background";
import { api } from "@/lib/api/client";
import { useSession } from "@/lib/session/SessionProvider";

export default function AuthCallbackPage() {
  // useSearchParams must be wrapped in Suspense for Next 15 static prerender.
  return (
    <Suspense fallback={null}>
      <AuthCallbackContent />
    </Suspense>
  );
}

function AuthCallbackContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { status, refreshMe } = useSession();
  const [error, setError] = useState<string | null>(null);
  const returnTo = params.get("returnTo") ?? "/dashboard";

  useEffect(() => {
    if (status !== "authenticated") return;
    (async () => {
      try {
        const sync = await api.auth.sync();
        await refreshMe();
        // Brand-new sign-up: no memberships yet → send to org-create,
        // which immediately routes into the onboarding wizard once the
        // first org is created. Returning users go to `returnTo`.
        if (sync.membership_count === 0) {
          router.replace("/orgs/new");
        } else {
          router.replace(returnTo);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sign-in failed.");
      }
    })();
  }, [status, returnTo, router, refreshMe]);

  return (
    <main className="relative isolate flex min-h-screen w-full flex-col overflow-hidden">
      <AmbientBackground variant="subtle" />
      <Center>
        <Card variant="glass" className="p-6 shadow-[var(--shadow-3)]">
          <Stack gap="4" className="text-center">
          {error ? (
            <>
              <h1 className="text-lg font-semibold text-[var(--danger)]">Sign-in failed</h1>
              <p className="text-sm text-[var(--text-muted)]">{error}</p>
              <a className="text-sm underline" href="/login">Try again</a>
            </>
          ) : (
            <>
              <Loader2 className="mx-auto size-6 animate-spin text-[var(--primary)]" />
              <p className="text-sm text-[var(--text-muted)]">Finishing sign-in…</p>
            </>
          )}
          </Stack>
        </Card>
      </Center>
    </main>
  );
}
