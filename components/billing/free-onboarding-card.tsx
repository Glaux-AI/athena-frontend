"use client";

/**
 * FreeOnboardingCard — §7.10.5.
 *
 * Welcome card for `tier === "free"` orgs. Lists the Free-tier limits
 * and surfaces three paths forward: BYO key (free), top up to use
 * platform models, or upgrade to Solo.
 */

import { useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { CreditsTopupModal } from "@/components/billing/credits-topup-modal";

export function FreeOnboardingCard({
  orgId,
  onTopupReturn,
}: {
  orgId: string;
  onTopupReturn: () => void;
}) {
  const [topupOpen, setTopupOpen] = useState(false);
  return (
    <>
      <Card
        data-testid="free-onboarding-card"
        className="border-[var(--primary)]"
        aria-label="Welcome to Athena Free"
      >
        <Stack gap="3">
          <Cluster gap="2" align="center">
            <Sparkles className="size-4 text-[var(--primary)]" aria-hidden />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Welcome to Athena Free
            </h2>
          </Cluster>
          <Stack gap="1">
            <p className="text-base font-semibold">
              You&apos;re on the Free plan.
            </p>
            <ul className="ml-4 list-disc text-sm text-[var(--text-muted)]">
              <li>3 capabilities</li>
              <li>3 repos per capability</li>
              <li>50 MB repo size limit</li>
            </ul>
          </Stack>
          <Cluster gap="2" align="center" justify="start">
            <Button
              asChild
              size="sm"
              variant="outline"
              data-testid="free-onboarding-byo"
            >
              <Link href="/settings/models">
                Bring your own AI API key — free
              </Link>
            </Button>
            <Button
              size="sm"
              onClick={() => setTopupOpen(true)}
              data-testid="free-onboarding-topup"
            >
              Top up credit to use platform models
            </Button>
            <Link
              href="#upgrade-tiers"
              className="text-xs text-[var(--primary)] underline"
              data-testid="free-onboarding-upgrade"
            >
              Upgrade to Solo for $50/mo
            </Link>
          </Cluster>
        </Stack>
      </Card>
      <CreditsTopupModal
        open={topupOpen}
        onOpenChange={setTopupOpen}
        orgId={orgId}
        tier="free"
        onTopupReturn={onTopupReturn}
      />
    </>
  );
}
