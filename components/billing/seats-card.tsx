"use client";

/**
 * SeatsCard — §7.9.5 row 2463.
 *
 * Sits below SubscriptionCard on /settings/billing for BOTH solo + pro
 * tier orgs (uniform surface per the readiness row).
 *
 * Renders:
 *   - Headline: "N of M seats used"
 *   - Sub-line: "K included + (M−K) paid extras"
 *   - "Buy more seats" CTA — opens <BuySeatsModal> via the global
 *     useBuySeatsModal() hook (§7.9.9).
 */

import { useEffect, useState } from "react";
import { Users } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, ApiError, type SeatsOut } from "@/lib/api/client";
import { useBuySeatsModal } from "@/lib/stores/buy-seats-modal";

export function SeatsCard({ orgId }: { orgId: string | null }) {
  const [seats, setSeats] = useState<SeatsOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const buySeatsModal = useBuySeatsModal();

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setLoading(true);
    api.billing
      .getSeats(orgId)
      .then((data) => {
        if (cancelled) return;
        setSeats(data);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          e instanceof ApiError ? e.message : "Couldn't load seat usage.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (loading) return <SeatsCardSkeleton />;

  if (error) {
    return (
      <Card variant="elevated" aria-label="Seats">
        <Stack gap="2">
          <Cluster gap="2" align="center">
            <Users className="size-4 text-[var(--text-muted)]" aria-hidden />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Seats
            </h2>
          </Cluster>
          <p className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]">{error}</p>
        </Stack>
      </Card>
    );
  }

  if (!seats) return null;

  const extras = Math.max(0, seats.total_seats - seats.included_seats);
  const atCap = seats.available_seats <= 0;

  return (
    <Card
      variant="elevated"
      data-testid="seats-card"
      aria-label="Seats"
      className="transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5"
    >
      <Stack gap="3">
        <Cluster gap="2" align="center" justify="between" className="border-b border-[var(--border)] pb-2.5">
          <Cluster gap="2" align="center">
            <Users className="size-4 text-[var(--text-muted)]" aria-hidden />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Seats
            </h2>
          </Cluster>
        </Cluster>
        <Stack gap="1">
          <p className="text-lg font-semibold" data-testid="seats-headline">
            <span className="font-semibold">
              {seats.active_seats} of {seats.total_seats}
            </span>{" "}
            seats used
          </p>
          <p
            className="text-xs text-[var(--text-muted)]"
            data-testid="seats-subline"
          >
            {seats.included_seats} included + {extras} paid extras
          </p>
        </Stack>
        <Cluster gap="2" align="center" justify="between">
          <Button
            type="button"
            size="sm"
            data-testid="buy-more-seats"
            className={
              atCap
                ? "border border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning-ink)] hover:opacity-90"
                : undefined
            }
            onClick={() => buySeatsModal.open()}
          >
            Buy more seats
          </Button>
          {atCap && (
            <span
              className="text-xs font-medium text-[var(--warning)]"
              data-testid="seats-at-cap"
            >
              Seats full — invite gating is on.
            </span>
          )}
        </Cluster>
      </Stack>
    </Card>
  );
}

function SeatsCardSkeleton() {
  return (
    <Card variant="elevated" aria-busy="true" aria-label="Loading seats">
      <Stack gap="3">
        <div className="h-3 w-16 animate-pulse rounded-md bg-[var(--surface-2)]" />
        <div className="h-6 w-40 animate-pulse rounded-md bg-[var(--surface-2)]" />
        <div className="h-3 w-32 animate-pulse rounded-md bg-[var(--surface-2)]" />
        <div className="h-8 w-32 animate-pulse rounded-md bg-[var(--surface-2)]" />
      </Stack>
    </Card>
  );
}
