"use client";

/**
 * SeatFullCard — §7.9.7 row 2479.
 *
 * Rendered by `/accept-invite/[token]/page.tsx` when the preview
 * endpoint reports `seats_available === false`, OR when a race during
 * Accept transitions the page into the at-capacity state without
 * losing the token in the URL.
 *
 * Copy adapts to tier:
 *   - solo → "ask the owner to buy a seat or upgrade to Pro"
 *   - pro / enterprise → "ask the owner to buy a seat"
 *
 * Owner mailto is rendered as a real anchor so the user can launch
 * their MUA without bouncing through a copy-paste step.
 */

import { Lock, Mail, RotateCw } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";

interface SeatFullCardProps {
  orgName: string;
  inviterEmail: string;
  ownerEmail: string;
  tier: string;
  /** Re-runs preview → accept (so the user can retry once the owner buys a seat). */
  onRetry: () => void;
  /** True while the retry handler is in flight. Drives the button spinner. */
  retrying?: boolean;
}

export function SeatFullCard({
  orgName,
  inviterEmail,
  ownerEmail,
  tier,
  onRetry,
  retrying = false,
}: SeatFullCardProps) {
  const upgradeCopy =
    tier === "solo"
      ? "ask the owner to buy a seat or upgrade to Pro"
      : "ask the owner to buy a seat";
  const mailto = `mailto:${ownerEmail}?subject=${encodeURIComponent(
    `Seat for ${orgName}`,
  )}`;

  return (
    <Card
      data-testid="seat-full-card"
      className="border-[var(--warning)] bg-[var(--warning-soft)] p-6 text-left"
    >
      <Stack gap="4">
        <Cluster gap="2" align="center">
          <Lock className="size-5 text-[var(--warning-ink)]" aria-hidden />
          <h1
            className="text-lg font-semibold text-[var(--warning-ink)]"
            data-testid="seat-full-headline"
          >
            This workspace is at capacity
          </h1>
        </Cluster>
        <Stack gap="1">
          <p className="text-sm text-[var(--text)]">
            <span className="font-medium">{orgName}</span> has used every seat
            in its plan. To join, {upgradeCopy}.
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            You were invited by {inviterEmail}.
          </p>
        </Stack>
        <Cluster gap="2" align="center">
          <a
            href={mailto}
            data-testid="seat-full-mailto"
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <Mail className="size-3.5" aria-hidden />
            Email the owner
          </a>
          <Button
            type="button"
            size="sm"
            data-testid="seat-full-retry"
            loading={retrying}
            onClick={onRetry}
          >
            {!retrying && <RotateCw className="size-3.5" aria-hidden />}
            Retry
          </Button>
        </Cluster>
      </Stack>
    </Card>
  );
}
