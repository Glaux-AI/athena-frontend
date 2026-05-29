"use client";

/**
 * §7 — `/embed/artifacts/[id]`
 *
 * Public, read-only, iframe-safe view of a single artifact (Document —
 * PRD / Spec / Plan / Review / PR description).
 *
 * The presentational shell + helpers live in `./_view` so this route
 * file exports only its default route entry (Next.js App Router forbids
 * non-default + non-reserved exports from `page.tsx`).
 */

import { use, useEffect, useState } from "react";

import { api, ApiError, type RunDocument } from "@/lib/api/client";
import {
  EmbedArtifactPage,
  EmbedArtifactSkeleton,
  EmbedArtifactPrivateEmpty,
  EmbedArtifactMissingEmpty,
} from "./_view";

// embed v1: serves authenticated viewers only; public-embed requires BE
// `share_token` support — phase-14 follow-up.

/* -------------------------------------------------------------------------- */
/* Route entry                                                                 */
/* -------------------------------------------------------------------------- */

export default function EmbedArtifactRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [doc, setDoc] = useState<RunDocument | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "private" | "missing">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fetched = await api.runs.documents.get(id);
        if (!cancelled) {
          setDoc(fetched);
          setLoadState("ready");
        }
      } catch (e) {
        if (cancelled) return;
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

  if (loadState === "loading") return <EmbedArtifactSkeleton />;
  if (loadState === "private") return <EmbedArtifactPrivateEmpty artifactId={id} />;
  if (loadState === "missing" || doc === null) return <EmbedArtifactMissingEmpty />;

  return <EmbedArtifactPage artifact={doc} />;
}
