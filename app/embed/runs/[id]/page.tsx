"use client";

/**
 * §7 — `/embed/runs/[id]`
 *
 * Public, read-only, iframe-safe view of a run's timeline + final status.
 *
 * The presentational shell + helpers live in `./_view` so this route
 * file exports only its default route entry (Next.js App Router forbids
 * non-default + non-reserved exports from `page.tsx`).
 */

import { use, useEffect, useState } from "react";

import { api, ApiError, type RunDetail } from "@/lib/api/client";
import {
  EmbedRunPage,
  EmbedRunSkeleton,
  EmbedRunPrivateEmpty,
  EmbedRunMissingEmpty,
} from "./_view";

// embed v1: serves authenticated viewers only; public-embed requires BE
// `share_token` support — phase-14 follow-up. For now the FE talks to
// the same `/v1/runs/{id}` endpoint; if the caller has no
// `X-Athena-Org-Id` header (anonymous embed visitor) the BE responds
// 403 and the page renders the "private" empty state below.

/* -------------------------------------------------------------------------- */
/* Route entry — fetches + dispatches                                         */
/* -------------------------------------------------------------------------- */

/**
 * Outer wrapper for `/embed/runs/[id]`. Pulls the run via the typed
 * client and forwards to `<EmbedRunPage>`. Empty / loading / error
 * states are colocated in `./_view` so the route file stays focused.
 */
export default function EmbedRunRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [run, setRun] = useState<RunDetail | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "private" | "missing">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fetched = await api.runs.get(id);
        if (!cancelled) {
          setRun(fetched);
          setLoadState("ready");
        }
      } catch (e) {
        if (cancelled) return;
        // 403 → private (org-bound) → "Sign in to view" empty state.
        // 404 → missing run → generic empty state.
        // Any other failure (network, 5xx) → also surface as missing so
        //   we don't leak internals to embedders.
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          setLoadState("private");
        } else {
          setLoadState("missing");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loadState === "loading") {
    return <EmbedRunSkeleton />;
  }
  if (loadState === "private") {
    return <EmbedRunPrivateEmpty runId={id} />;
  }
  if (loadState === "missing" || run === null) {
    return <EmbedRunMissingEmpty />;
  }

  return <EmbedRunPage run={run} />;
}
