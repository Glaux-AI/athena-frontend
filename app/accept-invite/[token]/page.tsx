"use client";

/**
 * Invitation accept landing.
 *
 * §7.9.7 row 2479 — Preview-first flow:
 *   1. On mount BEFORE clicking Accept, call `api.invitations.preview(token)`.
 *      If `seats_available === false`, render the SeatFullCard with
 *      tier-specific copy + mailto + Retry. No Accept-attempt is burned.
 *   2. Otherwise (or once Retry succeeds), the original Accept flow runs.
 *   3. If a 409 lands during Accept (preview said open, accept said full),
 *      transition to the SeatFullCard WITHOUT losing the token in the URL
 *      (React state, no router.push).
 */

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AmbientBackground } from "@/components/ui/ambient-background";
import { Center, Stack } from "@/components/layout/primitives";
import {
  api,
  ApiError,
  type InvitationPreview,
} from "@/lib/api/client";
import { useSession } from "@/lib/session/SessionProvider";
import { SeatFullCard } from "./seat-full-card";

type PageState =
  | "loading-preview"
  | "accepting"
  | "accepted"
  | "seats-full"
  | "error";

export default function AcceptInvitePage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const { status, setActiveOrgId, refreshMe, signOut } = useSession();
  const [state, setState] = useState<PageState>("loading-preview");
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [preview, setPreview] = useState<InvitationPreview | null>(null);

  const acceptOnce = useCallback(async () => {
    setState("accepting");
    setError(null);
    setErrorCode(null);
    try {
      const result = await api.invitations.accept(params.token);
      setActiveOrgId(result.org_id);
      await refreshMe();
      setState("accepted");
      // Brief celebration before redirect.
      setTimeout(() => router.replace("/dashboard"), 800);
    } catch (e) {
      // §7.9.7 — 409 from a race (preview said open, accept said full).
      // We DO NOT router.push — staying on the same URL keeps the token
      // so Retry can re-run preview + accept.
      if (e instanceof ApiError && (e.status === 409 || e.code === "seats_full")) {
        // Best-effort: refetch preview so the SeatFullCard renders the
        // accurate tier-specific copy.
        try {
          const p = await api.invitations.preview(params.token);
          setPreview(p);
        } catch {
          // Use whatever preview we already have; if none, the card still
          // renders defensible defaults.
        }
        setState("seats-full");
        return;
      }
      setError(e instanceof ApiError ? e.message : "Failed to accept invitation.");
      setErrorCode(e instanceof ApiError ? e.code : null);
      setState("error");
    }
  }, [params.token, refreshMe, router, setActiveOrgId]);

  // §7.9.7 — the invitation is bound to the invited email; the BE 403s with
  // `invitation_email_mismatch` if the signed-in GitHub email differs. Let the
  // user sign out and retry with the correct account, returning to this invite.
  const switchAccount = useCallback(async () => {
    setSwitching(true);
    await signOut();
    router.replace(`/login?returnTo=${encodeURIComponent(`/accept-invite/${params.token}`)}`);
  }, [signOut, params.token, router]);

  const loadPreviewAndMaybeAccept = useCallback(async () => {
    setState("loading-preview");
    setError(null);
    setErrorCode(null);
    try {
      const p = await api.invitations.preview(params.token);
      setPreview(p);
      if (!p.seats_available) {
        setState("seats-full");
        return;
      }
      // Seats available — run the existing Accept flow.
      await acceptOnce();
    } catch (e) {
      // Preview itself failed (token invalid, network, etc.) — surface
      // the error in the existing error card so the user can navigate
      // away gracefully.
      setError(e instanceof ApiError ? e.message : "Couldn't load invitation.");
      setErrorCode(e instanceof ApiError ? e.code : null);
      setState("error");
    }
  }, [acceptOnce, params.token]);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "anonymous") {
      const returnTo = encodeURIComponent(`/accept-invite/${params.token}`);
      router.replace(`/login?returnTo=${returnTo}`);
      return;
    }
    void loadPreviewAndMaybeAccept();
  }, [status, params.token, router, loadPreviewAndMaybeAccept]);

  return (
    <main className="relative isolate flex min-h-screen w-full flex-col overflow-hidden">
      <AmbientBackground variant="subtle" />
      <Center>
      {state === "seats-full" && preview ? (
        <SeatFullCard
          orgName={preview.org_name}
          inviterEmail={preview.inviter_email}
          ownerEmail={preview.owner_email}
          tier={preview.tier}
          retrying={false}
          onRetry={() => void loadPreviewAndMaybeAccept()}
        />
      ) : (
        <Card variant="glass" className="p-6 shadow-[var(--shadow-3)]">
          <Stack gap="4" className="text-center">
            {(state === "loading-preview" || state === "accepting") && (
              <>
                <Loader2 className="mx-auto size-6 animate-spin text-[var(--primary)]" />
                <p className="text-sm text-[var(--text-muted)]">
                  {state === "loading-preview"
                    ? "Checking invitation…"
                    : "Accepting invitation…"}
                </p>
              </>
            )}
            {state === "accepted" && (
              <>
                <CheckCircle2 className="mx-auto size-7 text-[var(--success)]" />
                <p className="text-sm">You&apos;re in! Redirecting…</p>
              </>
            )}
            {state === "error" && (
              errorCode === "invitation_email_mismatch" ? (
                <>
                  <h1 className="text-lg font-semibold text-[var(--danger)]">Wrong account</h1>
                  <p className="text-sm text-[var(--text-muted)]">{error}</p>
                  <p className="text-xs text-[var(--text-subtle)]">
                    Sign in with the GitHub account whose email matches the invitation.
                  </p>
                  <Button onClick={() => void switchAccount()} disabled={switching}>
                    {switching ? <Loader2 className="size-4 animate-spin" /> : null}
                    Sign out &amp; use a different account
                  </Button>
                </>
              ) : (
                <>
                  <h1 className="text-lg font-semibold text-[var(--danger)]">Couldn&apos;t accept</h1>
                  <p className="text-sm text-[var(--text-muted)]">{error}</p>
                  <Button variant="ghost" onClick={() => void loadPreviewAndMaybeAccept()}>
                    Try again
                  </Button>
                </>
              )
            )}
          </Stack>
        </Card>
      )}
      </Center>
    </main>
  );
}
