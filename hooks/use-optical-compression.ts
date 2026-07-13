"use client";

/**
 * Optical-compression unlock hook - the org-level UNLOCK that surfaces the
 * per-use composer toggle.
 *
 * `enabled` is the org setting from `/settings/models` (only unlocks the
 * feature - it never images anything on its own); `providers` are the catalog
 * provider ids the egress gate can image for. A per-use toggle is shown only
 * when both hold: the org unlocked it AND the picked model is from a supported
 * provider and supports vision (`opticalAppliesTo`).
 *
 * Same `useEffect` + `useState` fetch pattern as `use-enabled-models.ts`;
 * fails soft (unlock off) so the toggle simply never appears on error.
 */
import { useEffect, useState } from "react";

import { api, type EnabledModel, type ModelSelection } from "@/lib/api/client";

interface OpticalUnlock {
  enabled: boolean;
  providers: string[];
}

export function useOpticalCompression(): OpticalUnlock {
  const [unlock, setUnlock] = useState<OpticalUnlock>({
    enabled: false,
    providers: [],
  });

  useEffect(() => {
    let cancelled = false;
    void api.models
      .opticalCompression()
      .then((cfg) => {
        if (!cancelled) setUnlock({ enabled: cfg.enabled, providers: cfg.providers });
      })
      .catch(() => {
        /* fail soft - the per-use toggle just stays hidden */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return unlock;
}

/**
 * True when the per-use optical toggle applies to `model`: the org unlocked
 * the feature, the model's provider is in the supported set, and the model
 * supports vision. `enabledModels` supplies the `supports_vision` flag for the
 * pick. A null pick (action default) can't be checked, so the toggle hides.
 */
export function opticalAppliesTo(
  unlock: OpticalUnlock,
  model: ModelSelection | null,
  enabledModels: EnabledModel[],
): boolean {
  if (!unlock.enabled || !model) return false;
  if (!unlock.providers.includes(model.provider)) return false;
  const spec = enabledModels.find(
    (m) => m.provider === model.provider && m.id === model.model,
  );
  return spec?.supports_vision ?? false;
}
