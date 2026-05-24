/**
 * /capabilities/[id]/brief — legacy redirect (ADR-072).
 *
 * The standalone Capability Blueprint page was merged into the main capability
 * surface in ADR-072. The Blueprint sections now render inline on the Overview
 * tab of /capabilities/[id], interleaved with the KG snapshot / entity graph /
 * overlay terms / raw ingestion projection. This route is preserved as a
 * permanent redirect so old links + bookmarks still resolve.
 */

import { redirect } from "next/navigation";

export default async function CapabilityBlueprintLegacyRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/capabilities/${encodeURIComponent(id)}`);
}
