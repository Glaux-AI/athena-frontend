"use client";

/**
 * §5.16 r2 / F-08.1 — GitHub App post-install callback.
 *
 * GitHub redirects the browser here after the user installs the
 * Athena GitHub App. The URL carries:
 *
 *   - `installation_id` — GitHub's stable identifier for the install.
 *     We pass this to the BE as the `code` field of `oauth/complete`;
 *     the github adapter stores it on the integration row + uses it
 *     to mint installation tokens per-call.
 *   - `setup_action`    — `install` (first time) or `update` (added
 *     more repos). We don't branch on this today; the BE upsert path
 *     covers both.
 *   - `state`           — the opaque token we minted in `oauth/initiate`.
 *     The BE re-checks it before accepting the install.
 *
 * On success we route back to `/settings/integrations?connected=github`;
 * on error we land on the same page with `?error=...` so the user sees
 * an inline message instead of a blank screen.
 */

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, AlertTriangle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { useSession } from "@/lib/session/SessionProvider";
import { api, ApiError } from "@/lib/api/client";

export default function GitHubAppCallbackPage() {
  // useSearchParams must sit inside a Suspense boundary for Next 15's
  // static prerender pass (same pattern /login + /signup use).
  return (
    <Suspense fallback={<CallbackFallback />}>
      <CallbackContent />
    </Suspense>
  );
}

function CallbackFallback() {
  return (
    <Stack gap="3" className="items-center justify-center py-16">
      <Loader2 className="size-6 animate-spin text-[var(--text-muted)]" />
      <p className="text-sm text-[var(--text-muted)]">Loading callback…</p>
    </Stack>
  );
}

function CallbackContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { activeOrgId } = useSession();
  const [error, setError] = useState<string | null>(null);
  // React 19's Strict Mode runs effects twice in dev. The BE's
  // `oauth/complete` is idempotent on `state` (state row deleted on
  // first success → second call returns the existing integration),
  // but we guard anyway so a transient retry doesn't fire two POSTs.
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    if (!activeOrgId) return;
    ran.current = true;

    const installationId = params.get("installation_id");
    const state = params.get("state");

    if (!installationId || !state) {
      setError(
        "GitHub didn't send back the expected callback parameters " +
          "(`installation_id` + `state`). Please retry the install from " +
          "/settings/integrations.",
      );
      return;
    }

    (async () => {
      try {
        await api.integrations.oauth.complete(
          activeOrgId,
          "github",
          "source_control",
          { state, code: installationId },
        );
        router.replace("/settings/integrations?connected=github");
      } catch (e) {
        const msg =
          e instanceof ApiError
            ? `${e.code ?? "oauth_complete_failed"}: ${e.message}`
            : "Failed to finalize the GitHub App install.";
        setError(msg);
      }
    })();
  }, [activeOrgId, params, router]);

  if (error) {
    return (
      <Stack gap="6">
        <SettingsPageHeader
          title="GitHub App install"
          subtitle="Something went wrong while finalizing the install."
        />
        <Card variant="elevated" className="border-[var(--danger)] bg-[var(--danger-soft)]">
          <Cluster gap="2" align="start">
            <AlertTriangle className="size-4 shrink-0 text-[var(--danger-ink)]" />
            <Stack gap="2">
              <p className="text-sm font-semibold text-[var(--danger-ink)]">
                Install not completed
              </p>
              <p className="text-xs text-[var(--danger-ink)]">{error}</p>
              <p className="text-xs text-[var(--text-muted)]">
                <a
                  href="/settings/integrations"
                  className="underline hover:text-[var(--text)]"
                >
                  Return to integrations
                </a>
              </p>
            </Stack>
          </Cluster>
        </Card>
      </Stack>
    );
  }

  return (
    <Stack gap="3" className="items-center justify-center py-16">
      <Loader2 className="size-6 animate-spin text-[var(--text-muted)]" />
      <p className="text-sm text-[var(--text-muted)]">
        Finalizing GitHub App install…
      </p>
    </Stack>
  );
}
