"use client";

/**
 * Persisted run preferences - the effort dial + model pick chosen next to
 * every "Run with Athena" action survive a refresh.
 *
 * One preference pair per SURFACE KIND (not per thread/stage): `"chat"` (the
 * /chat composer) and `"task"` (the /work cockpit - stage runs and the design
 * refine panel share it, they are the same kind of action). Stored in
 * localStorage like the CreditHaltBanner dismissal - these are UI preferences,
 * not customer data, so the no-customer-data-in-localStorage rule doesn't
 * apply.
 *
 * A stored model is only restored when it still matches a CURRENTLY enabled
 * model on the same rung (`provider` + `model` + `source`) - a model that was
 * disabled, or a BYOK rung whose key was removed, silently falls back to the
 * surface's default instead of resurrecting a dead pick.
 */

import { useCallback, useEffect, useState } from "react";

import type { EffortLevel, EnabledModel, ModelSelection } from "@/lib/api/client";

export type RunPrefScope = "chat" | "task";

const EFFORT_LEVELS: readonly EffortLevel[] = [
  "fast",
  "medium",
  "high",
  "max",
  "unrestricted",
];

const keyFor = (scope: RunPrefScope, pref: "effort" | "model") =>
  `athena.runPrefs.${scope}.${pref}`;

/** Read + write guards: SSR has no window, and storage can throw (private
 *  mode / quota) - a preference must never break the surface it decorates. */
function readRaw(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* preference-only - losing it is fine */
  }
}

export function readStoredEffort(scope: RunPrefScope): EffortLevel | null {
  const raw = readRaw(keyFor(scope, "effort"));
  return raw && (EFFORT_LEVELS as readonly string[]).includes(raw)
    ? (raw as EffortLevel)
    : null;
}

export function storeEffort(scope: RunPrefScope, effort: EffortLevel): void {
  writeRaw(keyFor(scope, "effort"), effort);
}

function isModelSelection(v: unknown): v is ModelSelection {
  if (typeof v !== "object" || v === null) return false;
  const m = v as { provider?: unknown; model?: unknown; source?: unknown };
  if (typeof m.provider !== "string" || typeof m.model !== "string") return false;
  return (
    m.source === undefined ||
    m.source === "athena" ||
    m.source === "byok" ||
    m.source === "subscription"
  );
}

export function readStoredModel(scope: RunPrefScope): ModelSelection | null {
  const raw = readRaw(keyFor(scope, "model"));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isModelSelection(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function storeModel(scope: RunPrefScope, model: ModelSelection): void {
  writeRaw(keyFor(scope, "model"), JSON.stringify(model));
}

/** The stored pick, validated against the models the surface actually offers
 *  right now - returns the matching row's identity (rung included) or null.
 *  A pre-rung-split pick without `source` matches on (provider, model) alone
 *  and adopts the matched row's rung. */
export function restoreModelSelection(
  scope: RunPrefScope,
  models: EnabledModel[],
): ModelSelection | null {
  const stored = readStoredModel(scope);
  if (!stored) return null;
  const match = models.find(
    (m) =>
      m.enabled &&
      m.provider === stored.provider &&
      m.id === stored.model &&
      (stored.source ? m.source === stored.source : true),
  );
  return match
    ? { provider: match.provider, model: match.id, source: match.source }
    : null;
}

/** `useState<EffortLevel>` that remembers the pick across refreshes. The
 *  stored value is applied AFTER mount (not in the initializer) so the
 *  server-rendered markup and the first client render agree - no hydration
 *  mismatch, just a quick settle to the remembered level. */
export function usePersistedEffort(
  scope: RunPrefScope,
  fallback: EffortLevel = "medium",
): [EffortLevel, (effort: EffortLevel) => void] {
  const [effort, setEffortState] = useState<EffortLevel>(fallback);
  useEffect(() => {
    const stored = readStoredEffort(scope);
    if (stored) setEffortState(stored);
  }, [scope]);
  const setEffort = useCallback(
    (next: EffortLevel) => {
      setEffortState(next);
      storeEffort(scope, next);
    },
    [scope],
  );
  return [effort, setEffort];
}
