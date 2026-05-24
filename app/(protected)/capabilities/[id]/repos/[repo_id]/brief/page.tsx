/**
 * /capabilities/[id]/repos/[repo_id]/brief — legacy redirect (ADR-072).
 *
 * The standalone Repo Blueprint page was merged into the inline
 * `<RepoKnowledgePanel>` expansion on the capability's Repos tab. Repo
 * Blueprint sections now render alongside the KG-derived data in one
 * scrollable view. This route is preserved as a permanent redirect so old
 * links + bookmarks still resolve.
 */

import { redirect } from "next/navigation";

export default async function RepoBlueprintLegacyRedirect({
  params,
}: {
  params: Promise<{ id: string; repo_id: string }>;
}) {
  const { id } = await params;
  redirect(`/capabilities/${encodeURIComponent(id)}?tab=repos`);
}
