"use client";

/**
 * /signup — create an account.
 *
 * Athena uses **GitHub OAuth only** for sign-up. There's no email/password
 * path. This means:
 *   - If your team enforces SAML SSO on GitHub, Athena inherits it.
 *   - We never store passwords.
 *   - The user's GitHub identity = their Athena identity (same login across PRs).
 *
 * Mock mode keeps a one-click "Continue as Demo User" button so the demo
 * workspace can be reached without a real GitHub round-trip.
 */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Github, Loader2, ShieldCheck, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OwlAvatar } from "@/components/mascot/owl-avatar";
import { Stack, Cluster, Center } from "@/components/layout/primitives";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { config } from "@/lib/config";
import { api, ApiError } from "@/lib/api/client";
import { useSession, writeMockSession } from "@/lib/session/SessionProvider";

export default function SignupPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { status } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const returnTo = params.get("returnTo") ?? "/dashboard";

  useEffect(() => {
    if (status === "authenticated") router.replace(returnTo);
  }, [status, router, returnTo]);

  const signInWithGitHub = async () => {
    setError(null);
    setPending(true);
    try {
      if (!config.supabase.isConfigured()) {
        setError("Supabase isn't configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local.");
        return;
      }
      const supabase = getBrowserSupabase();
      const redirectTo = `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(returnTo)}`;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: { redirectTo, scopes: "read:user user:email" },
      });
      if (oauthError) setError(oauthError.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-up failed.");
    } finally {
      setPending(false);
    }
  };

  const continueAsDemo = async () => {
    setError(null);
    setPending(true);
    try {
      const result = await api.mockAuth.signIn({ email: "demo@acme.com" });
      writeMockSession(result);
      router.replace(returnTo);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Sign-in failed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Center as="main">
      <Card className="w-full max-w-md p-6">
        <Stack gap="5">
          <Cluster gap="3" align="center" justify="center">
            <OwlAvatar size={44} mood="happy" />
          </Cluster>

          <Stack gap="1" className="text-center">
            <h1 className="text-xl font-semibold">Create your Athena account</h1>
            <p className="text-sm text-[var(--text-muted)]">
              Athena uses GitHub for sign-in. Your team&apos;s SSO is automatically inherited.
            </p>
          </Stack>

          <Stack gap="3">
            <Button onClick={signInWithGitHub} disabled={pending} className="w-full" size="lg">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Github className="size-4" />}
              Continue with GitHub
            </Button>
            {config.isMock && (
              <>
                <div className="relative flex items-center gap-2 text-[11px] uppercase tracking-wider text-[var(--text-subtle)]">
                  <div className="h-px flex-1 bg-[var(--border)]" />
                  <span>or skip — mock workspace</span>
                  <div className="h-px flex-1 bg-[var(--border)]" />
                </div>
                <Button onClick={continueAsDemo} disabled={pending} variant="outline" className="w-full">
                  Continue as Demo User
                </Button>
              </>
            )}
          </Stack>

          {error && (
            <p role="alert" className="text-center text-sm text-[var(--danger)]">{error}</p>
          )}

          <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs">
            <Cluster gap="2" align="start">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[var(--success)]" />
              <Stack gap="1">
                <span className="font-semibold text-[var(--text)]">SSO via GitHub</span>
                <span className="text-[var(--text-muted)]">
                  If your GitHub org enforces SAML SSO (Okta, Entra ID, Google Workspace, Auth0…), Athena enforces it too.
                  Deprovision once on your IdP — access is revoked everywhere.
                </span>
              </Stack>
            </Cluster>
          </div>

          <ul className="space-y-1.5 text-xs text-[var(--text-muted)]">
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-3 shrink-0 text-[var(--success)]" /> No password stored. Ever.</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-3 shrink-0 text-[var(--success)]" /> Same identity as your PRs — clean audit trail.</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-3 shrink-0 text-[var(--success)]" /> Free for one repo. Upgrade when you outgrow it.</li>
          </ul>

          <p className="text-center text-sm text-[var(--text-muted)]">
            Already have an account?{" "}
            <Link href={`/login${params.toString() ? `?${params.toString()}` : ""}`} className="font-medium text-[var(--primary)] underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>

          <p className="text-center text-[10px] text-[var(--text-subtle)]">
            By continuing you agree to our{" "}
            <a href="#" className="underline hover:text-[var(--text)]">Terms</a> and{" "}
            <a href="#" className="underline hover:text-[var(--text)]">Privacy Policy</a>.
          </p>
        </Stack>
      </Card>
    </Center>
  );
}
