"use client";

/**
 * Login page — M0 stub. In M1, hooks up to OIDC via the backend.
 */

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sophia } from "@/components/mascot/sophia";
import { Stack, Cluster, Center } from "@/components/layout/primitives";

export default function LoginPage() {
  const router = useRouter();
  const [pending, start] = useTransition();

  const signIn = (provider: "oidc" | "saml" | "google" | "microsoft") => {
    start(() => {
      // M0: navigate straight to the dashboard. M1: redirect to OIDC.
      router.push("/dashboard");
    });
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
              Use your work account. SSO is required for Business and Enterprise.
            </CardDescription>
          </CardHeader>

          <Stack gap="2">
            <Button onClick={() => signIn("oidc")} loading={pending} className="w-full">
              Continue with SSO
            </Button>
            <Button onClick={() => signIn("google")} variant="secondary" className="w-full">
              Continue with Google
            </Button>
            <Button onClick={() => signIn("microsoft")} variant="secondary" className="w-full">
              Continue with Microsoft
            </Button>
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
