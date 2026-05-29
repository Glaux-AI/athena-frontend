"use client";

/**
 * /capabilities/[id]/runs/new — legacy redirect.
 *
 * The chat agent used to mint `cta_url` targeting this path; newer builds
 * point straight at `/runs/new?capability_id=...`. This stub redirects old
 * links to the canonical route, carrying any extra query params through
 * (`proposal_id`, `kind`, `goal`, `budget_usd`).
 */

import { Suspense, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

export default function CapabilityRunsNewPage() {
  return (
    <Suspense fallback={null}>
      <Redirect />
    </Suspense>
  );
}

function Redirect() {
  const router = useRouter();
  const params = useParams();
  const search = useSearchParams();
  useEffect(() => {
    const capId = Array.isArray(params?.id) ? params?.id[0] : params?.id;
    const next = new URLSearchParams(search?.toString() ?? "");
    if (capId && !next.get("capability_id")) next.set("capability_id", capId);
    router.replace(`/runs/new?${next.toString()}`);
  }, [params, router, search]);
  return null;
}
