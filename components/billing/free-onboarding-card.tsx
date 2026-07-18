"use client";

/**
 * FreeOnboardingCard - §7.10.5.
 *
 * Welcome card for `tier === "free"` orgs. Lists the Free-tier limits
 * and surfaces three paths forward: BYO key (free), top up to use
 * platform models, or upgrade to Solo.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Stack, Cluster } from "@/components/layout/primitives";
import { CreditsTopupModal } from "@/components/billing/credits-topup-modal";
import { api, type PriceCatalog } from "@/lib/api/client";
import { PRICE_CATALOG_FALLBACK } from "@/lib/billing/price-catalog";
import { TIER_REPO_LIMITS } from "@/lib/billing/tier-limits";
import { formatInr } from "@/lib/utils/format";

export function FreeOnboardingCard({
  orgId,
  onTopupReturn,
}: {
  orgId: string;
  onTopupReturn: () => void;
}) {
  const [topupOpen, setTopupOpen] = useState(false);
  const [catalog, setCatalog] = useState<PriceCatalog>(PRICE_CATALOG_FALLBACK);

  useEffect(() => {
    let cancelled = false;
    api.billing
      .priceCatalog()
      .then((data) => { if (!cancelled) setCatalog(data); })
      .catch(() => { /* unreachable - keep the fallback */ });
    return () => { cancelled = true; };
  }, []);

  const soloPrice = catalog.solo_base ?? PRICE_CATALOG_FALLBACK.solo_base;
  return (
    <>
      <Card
        variant="elevated"
        data-testid="free-onboarding-card"
        className="border-[var(--border-accent)]"
        aria-label="Welcome to Athena Free"
      >
        <Stack gap="3">
          <div>
            <Cluster gap="2" align="center" className="pb-2.5">
              <Sparkles className="size-4 text-[var(--primary)]" aria-hidden />
              <Eyebrow>Welcome to Athena Free</Eyebrow>
            </Cluster>
            <hr className="hr-horizon" aria-hidden="true" />
          </div>
          <Stack gap="1">
            <p className="text-base font-semibold">
              You&apos;re on the Free plan.
            </p>
            <ul className="ml-4 list-disc text-sm text-[var(--text-muted)]">
              <li>{TIER_REPO_LIMITS.free.reposLabel}</li>
              <li>Unlimited domains, skills &amp; design systems</li>
              <li>Custom agents &amp; tools unlock on Solo and up</li>
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
                Bring your own AI API key - free
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
              Upgrade to Solo for {soloPrice === null ? "more" : `${formatInr(soloPrice)}/mo`}
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
