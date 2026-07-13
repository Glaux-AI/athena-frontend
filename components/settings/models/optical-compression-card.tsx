"use client";

/**
 * <OpticalCompressionCard> - the org opt-in for optical context compression
 * (experimental).
 *
 * When enabled, Athena renders large STALE tool results as compact page
 * images (vision input) right before dispatch to supported vision models.
 * Image tokens are denser than text tokens for the same content, so long
 * agent loops cost noticeably less; recent messages always stay text, and
 * exact values (ids, hashes) are preserved as text alongside the images.
 *
 * Reads `api.models.opticalCompression()`; the toggle writes immediately via
 * `api.models.setOpticalCompression()` (optimistic, reverted on failure).
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Stack, Cluster } from "@/components/layout/primitives";

export function OpticalCompressionCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api.models
      .opticalCompression()
      .then((cfg) => setEnabled(cfg.enabled))
      .catch(() => {
        /* the parent page surfaces load errors; this card stays quiet */
      });
  }, []);

  const toggle = async (next: boolean) => {
    setSaving(true);
    setEnabled(next);
    try {
      const updated = await api.models.setOpticalCompression({ enabled: next });
      setEnabled(updated.enabled);
      toast.success(
        updated.enabled
          ? "Optical compression enabled."
          : "Optical compression disabled.",
      );
    } catch (e) {
      setEnabled(!next);
      toast.error(
        e instanceof ApiError ? e.message : "Couldn't update optical compression.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <Stack gap="4">
        <Stack gap="1">
          <Cluster gap="1.5" align="center">
            <h2 className="text-sm font-semibold text-[var(--text)]">
              Optical compression
            </h2>
            <Pill tone="neutral" size="sm">
              Experimental
            </Pill>
          </Cluster>
          <p className="text-xs text-[var(--text-muted)]">
            Send bulky older tool results to the model as compact page images
            instead of text. Image input is billed by pixels, not characters,
            so long agent conversations cost less on vision-capable models.
          </p>
        </Stack>

        {enabled === null ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <Stack gap="1.5">
            <Cluster
              justify="between"
              align="center"
              className="flex-wrap gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
            >
              <Stack gap="0" className="min-w-0">
                <span className="text-sm font-medium text-[var(--text)]">
                  Compress older tool results as images
                </span>
                <span className="text-micro text-[var(--text-subtle)]">
                  Applies to Anthropic vision models only for now. Recent
                  messages always stay text.
                </span>
              </Stack>
              <Switch
                checked={enabled}
                onCheckedChange={(next) => void toggle(next)}
                disabled={saving}
                aria-label="Enable optical compression"
              />
            </Cluster>
            <p className="px-1 text-micro text-[var(--text-subtle)]">
              Exact values (ids, hashes, numbers) are always preserved as text
              alongside the images. Turn this off if an agent misreads older
              results.
            </p>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
