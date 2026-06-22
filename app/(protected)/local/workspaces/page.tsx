"use client";

import { LocalGate } from "@/components/desktop/local-gate";
import { WorkspacesView } from "@/components/desktop/workspaces-view";

export default function LocalWorkspacesPage() {
  return <LocalGate>{(orgId) => <WorkspacesView orgId={orgId} />}</LocalGate>;
}
