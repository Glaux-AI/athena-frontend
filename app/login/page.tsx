"use client";

/**
 * Login — single CTA "Continue with GitHub", powered by Supabase OAuth.
 *
 * Honors `?returnTo=` so that, e.g., the accept-invite flow can route
 * the user back after sign-in.
 */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Github, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sophia } from "@/components/mascot/sophia";
import { Stack, Cluster, Center } from "@/components/layout/primitives";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { config } from "@/lib/config";
import { useSession } from "@/lib/session/SessionProvider";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { status } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const returnTo = params.get("returnTo") ?? "/dashboard";

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(returnTo);
    }
  }, [status, router, returnTo]);

  const signIn = async () => {
    setError(null);
    setPending(true);
    try {
      if (!config.supabase.isConfigured()) {
        setError(
          "Supabase isn't configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local then restart the dev server.",
        );
        return;
      }
      const supabase = getBrowserSupabase();
      const redirectTo = `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(returnTo)}`;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo,
          scopes: "read:user user:email",
        },
      });
      if (oauthError) setError(oauthError.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Center as="main">
      <Card className="p-6">
        <Stack gap="6">
          <Cluster gap="3" align="center" justify="center">
            <Sophia size={40} />
          </Cluster>

          <CardHeader className="text-center">
            <CardTitle className="text-xl">Sign in to Athena</CardTitle>
            <CardDescription>
              Continue with GitHub. We use your verified email to find or create your workspace.
            </CardDescription>
          </CardHeader>

          <Stack gap="3">
            <Button onClick={signIn} disabled={pending} className="w-full">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Github className="size-4" />}
              Continue with GitHub
            </Button>
            {error && (
              <p role="alert" className="text-center text-sm text-[var(--danger)]">
                {error}
              </p>
            )}
          </Stack>

          <p className="text-center text-xs text-[var(--text-subtle)]">
            By signing in you agree to our{" "}
            <a className="underline hover:text-[var(--text)]" href="#">Terms</a> and{" "}
            <a className="underline hover:text-[var(--text)]" href="#">Privacy Policy</a>.
          </p>
        </Stack>
      </Card>
    </Center>
  );
}
