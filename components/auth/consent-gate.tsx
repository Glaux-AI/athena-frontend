"use client";

/**
 * ConsentGate (§9.7 GDPR Art. 7) - blocks the authenticated app until the
 * signed-in user has accepted the CURRENT terms + privacy versions.
 *
 * On auth, asks `GET /v1/me/consents`; while `requires_acceptance` is
 * non-empty it renders a full-screen blocking overlay with links to the
 * legal pages and one "Agree and continue" action that records the
 * acceptance server-side (versions resolve from backend config, so a
 * stale bundle can't record an outdated document).
 *
 * Covers existing users too, not just signup: bumping a version in the
 * backend config re-gates everyone on next load. Fail-open on fetch
 * errors - a consents outage must not lock the whole product.
 * Mock mode skips the gate (no consent surface in the demo workspace).
 */

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stack } from "@/components/layout/primitives";
import { api } from "@/lib/api/client";
import { config } from "@/lib/config";
import { useSession } from "@/lib/session/SessionProvider";

const KIND_LABELS: Record<string, { label: string; href: string }> = {
  terms: { label: "Terms of Service", href: "/legal/terms" },
  privacy: { label: "Privacy Policy", href: "/legal/privacy" },
};

export function ConsentGate() {
  const { status } = useSession();
  const [missing, setMissing] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (config.isMock || status !== "authenticated") return;
    let cancelled = false;
    api.account
      .consents()
      .then((out) => {
        if (!cancelled) setMissing(out.requires_acceptance);
      })
      .catch(() => {
        // Fail-open: an outage on the consents surface must not brick
        // the app; the gate re-checks on next load.
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const accept = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const out = await api.account.acceptConsents(missing);
      setMissing(out.requires_acceptance);
    } catch {
      setError("Could not record your acceptance. Try again.");
    } finally {
      setSubmitting(false);
    }
  }, [missing]);

  if (missing.length === 0) return null;

  const docs = missing
    .map((k) => KIND_LABELS[k])
    .filter((d): d is { label: string; href: string } => Boolean(d));

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--bg)]/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Updated legal documents"
    >
      <Card variant="glass" className="w-full max-w-md p-6 shadow-[var(--shadow-3)]">
        <Stack gap="4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-[var(--primary)]" />
            <h2 className="text-lg font-semibold">Before you continue</h2>
          </div>
          <p className="text-sm text-[var(--text-muted)]">
            {docs.length > 1
              ? "Our legal documents have been updated. "
              : "One of our legal documents has been updated. "}
            Please review and accept the current{" "}
            {docs.map((d, i) => (
              <span key={d.href}>
                {i > 0 && (i === docs.length - 1 ? " and " : ", ")}
                <a
                  href={d.href}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-[var(--primary)] underline-offset-4 hover:underline"
                >
                  {d.label}
                </a>
              </span>
            ))}
            {" "}to keep using Athena.
          </p>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <Button onClick={accept} loading={submitting} className="w-full">
            Agree and continue
          </Button>
        </Stack>
      </Card>
    </div>
  );
}
