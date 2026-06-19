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
import { api, ApiError } from "@/lib/api/client";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { postSignInRoute } from "@/lib/auth/post-sign-in-route";
import { useSession } from "@/lib/session/SessionProvider";

const PROVIDER_LABEL: Record<string, string> = { github: "GitHub", google: "Google" };

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
  // Set when the email belongs to a different provider than the one just used:
  // we sign out the orphaned session and auto-redirect to the correct method,
  // showing this short notice in between (never a dead-end error).
  const [steering, setSteering] = useState<string | null>(null);
  const returnTo = params.get("returnTo") ?? "/dashboard";

  useEffect(() => {
    if (status !== "authenticated") return;
    (async () => {
      try {
        const sync = await api.auth.sync();
        await refreshMe();
        // A brand-new invitee also has 0 memberships, but must land on the
        // accept-invite page (it creates their first membership) - NOT
        // /orgs/new, which would abandon the invite. `postSignInRoute`
        // prioritises an accept-invite `returnTo`; otherwise zero-membership
        // sign-ups go to org-create and returning users to `returnTo`.
        router.replace(postSignInRoute(returnTo, sync.membership_count));
      } catch (e) {
        // One email = one auth method. The user signed in with the wrong
        // provider for this email; steer them to the registered one instead
        // of erroring out. The BE carries the correct provider in metadata.
        if (e instanceof ApiError && e.code === "auth_method_mismatch") {
          await steerToCorrectMethod(e);
          return;
        }
        setError(e instanceof Error ? e.message : "Sign-in failed.");
      }
    })();

    async function steerToCorrectMethod(e: ApiError): Promise<void> {
      const provider = typeof e.metadata?.provider === "string" ? e.metadata.provider : null;
      const email = typeof e.metadata?.email === "string" ? e.metadata.email : "";
      const supabase = getBrowserSupabase();
      // Drop the orphaned (wrong-provider) session before redirecting.
      try {
        await supabase.auth.signOut();
      } catch {
        /* best-effort */
      }
      if (provider === "github" || provider === "google") {
        const label = PROVIDER_LABEL[provider] ?? provider;
        setSteering(label);
        const redirectTo = `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(returnTo)}`;
        const options =
          provider === "github"
            ? { redirectTo, scopes: "read:user user:email" }
            : { redirectTo };
        const { error: err } = await supabase.auth.signInWithOAuth({ provider, options });
        if (err) {
          setError(`This account uses ${label}. Please sign in with ${label}.`);
        }
        return;
      }
      // Registered with passwordless email: open the OTP step pre-filled.
      setSteering("email sign-in");
      const q = new URLSearchParams({ method: "email", returnTo });
      if (email) q.set("email", email);
      router.replace(`/login?${q.toString()}`);
    }
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
          ) : steering ? (
            <>
              <Loader2 className="mx-auto size-6 animate-spin text-[var(--primary)]" />
              <p className="text-sm text-[var(--text-muted)]">
                This account uses {steering}. Taking you there…
              </p>
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
