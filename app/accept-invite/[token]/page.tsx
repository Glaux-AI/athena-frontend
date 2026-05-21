"use client";

/**
 * Invitation accept landing.
 *
 * - If not signed in → bounce to /login with returnTo back here.
 * - If signed in → POST /v1/invitations/{token}/accept, switch the
 *   active org to the new one, route to /dashboard.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Center, Stack } from "@/components/layout/primitives";
import { api, ApiError } from "@/lib/api/client";
import { useSession } from "@/lib/session/SessionProvider";

export default function AcceptInvitePage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const { status, setActiveOrgId, refreshMe } = useSession();
  const [state, setState] = useState<"working" | "accepted" | "error">("working");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "anonymous") {
      const returnTo = encodeURIComponent(`/accept-invite/${params.token}`);
      router.replace(`/login?returnTo=${returnTo}`);
      return;
    }
    (async () => {
      try {
        const result = await api.invitations.accept(params.token);
        setActiveOrgId(result.org_id);
        await refreshMe();
        setState("accepted");
        // Brief celebration before redirect.
        setTimeout(() => router.replace("/dashboard"), 800);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to accept invitation.");
        setState("error");
      }
    })();
  }, [status, params.token, router, refreshMe, setActiveOrgId]);

  return (
    <Center as="main">
      <Card className="p-6">
        <Stack gap="4" className="text-center">
          {state === "working" && (
            <>
              <Loader2 className="mx-auto size-6 animate-spin text-[var(--primary)]" />
              <p className="text-sm text-[var(--text-muted)]">Accepting invitation…</p>
            </>
          )}
          {state === "accepted" && (
            <>
              <CheckCircle2 className="mx-auto size-7 text-[var(--success)]" />
              <p className="text-sm">You're in! Redirecting…</p>
            </>
          )}
          {state === "error" && (
            <>
              <h1 className="text-lg font-semibold text-[var(--danger)]">Couldn't accept</h1>
              <p className="text-sm text-[var(--text-muted)]">{error}</p>
              <Button variant="ghost" onClick={() => router.replace("/dashboard")}>
                Go to dashboard
              </Button>
            </>
          )}
        </Stack>
      </Card>
    </Center>
  );
}
