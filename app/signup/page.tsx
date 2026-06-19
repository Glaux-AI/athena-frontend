"use client";

/**
 * /signup - create an account.
 *
 * Athena is **passwordless**: sign up with GitHub, Google, or a one-time
 * email code (no password is ever stored). Because email-OTP creates the
 * account on first verify, signup and sign-in share the same <LiveSignIn>
 * flow - the only difference is copy. One email = one auth method.
 *
 * Mock mode keeps a one-click "Continue as Demo User" button so the demo
 * workspace can be reached without a real provider round-trip.
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AmbientBackground } from "@/components/ui/ambient-background";
import { OwlAvatar } from "@/components/mascot/owl-avatar";
import { Stack, Cluster, Center } from "@/components/layout/primitives";
import { LiveSignIn } from "@/components/auth/live-sign-in";
import { config } from "@/lib/config";
import { api, ApiError } from "@/lib/api/client";
import { useSession, writeMockSession } from "@/lib/session/SessionProvider";

export default function SignupPage() {
  // useSearchParams must be wrapped in Suspense for Next 15 static prerender;
  // the inner component reads the query, the outer one provides the boundary.
  return (
    <Suspense fallback={null}>
      <SignupContent />
    </Suspense>
  );
}

function SignupContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { status } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const returnTo = params.get("returnTo") ?? "/dashboard";

  useEffect(() => {
    if (status === "authenticated") router.replace(returnTo);
  }, [status, router, returnTo]);

  const continueAsDemo = async () => {
    setError(null);
    setPending(true);
    try {
      const result = await api.mockAuth.signIn({ email: "maya@lumen.dev" });
      writeMockSession(result);
      router.replace(returnTo);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Sign-in failed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="relative isolate flex min-h-screen w-full flex-col overflow-hidden">
      <AmbientBackground variant="subtle" />
      <Center>
        <Card variant="glass" className="w-full max-w-md p-6 shadow-[var(--shadow-3)]">
          <Stack gap="5">
          <Cluster gap="3" align="center" justify="center">
            <OwlAvatar size={44} mood="happy" />
          </Cluster>

          <Stack gap="1" className="text-center">
            <h1 className="text-xl font-semibold">Create your Athena account</h1>
            <p className="text-sm text-[var(--text-muted)]">
              {config.isMock
                ? "Mock mode - skip straight to the demo workspace."
                : "GitHub, Google, or a one-time email code. No password, ever."}
            </p>
          </Stack>

          {config.isMock ? (
            <Stack gap="3">
              <Button onClick={continueAsDemo} disabled={pending} className="w-full" size="lg">
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                Continue as Demo User
              </Button>
              {error && (
                <p role="alert" className="text-center text-sm text-[var(--danger)]">{error}</p>
              )}
            </Stack>
          ) : (
            <LiveSignIn mode="signup" returnTo={returnTo} />
          )}

          <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs">
            <Cluster gap="2" align="start">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[var(--success)]" />
              <Stack gap="1">
                <span className="font-semibold text-[var(--text)]">One identity, one method</span>
                <span className="text-[var(--text-muted)]">
                  Each email signs in exactly one way. If your GitHub org enforces SAML SSO
                  (Okta, Entra ID, Google Workspace, Auth0…), Athena inherits it through GitHub.
                </span>
              </Stack>
            </Cluster>
          </div>

          <ul className="space-y-1.5 text-xs text-[var(--text-muted)]">
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-3 shrink-0 text-[var(--success)]" /> No password stored. Ever.</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-3 shrink-0 text-[var(--success)]" /> Sign in with GitHub, Google, or an email code.</li>
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
            <a href="/legal/terms" className="underline hover:text-[var(--text)]">Terms</a> and{" "}
            <a href="/legal/privacy" className="underline hover:text-[var(--text)]">Privacy Policy</a>.
          </p>
          </Stack>
        </Card>
      </Center>
    </main>
  );
}
