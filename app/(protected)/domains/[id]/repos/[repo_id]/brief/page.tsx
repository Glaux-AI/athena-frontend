/**
 * /domains/[id]/repos/[repo_id]/brief - legacy redirect (ADR-073).
 *
 * The standalone Repo Blueprint URL is preserved as a permanent redirect to
 * the first-class Repo surface introduced in ADR-073 - the new route is
 * `/domains/[id]/repos/[repo_id]?tab=blueprint`. Old bookmarks
 * resolve.
 */

import { redirect } from "next/navigation";

export default async function RepoBlueprintLegacyRedirect({
  params,
}: {
  params: Promise<{ id: string; repo_id: string }>;
}) {
  const { id, repo_id } = await params;
  redirect(
    `/domains/${encodeURIComponent(id)}/repos/${encodeURIComponent(repo_id)}?tab=blueprint`,
  );
}
