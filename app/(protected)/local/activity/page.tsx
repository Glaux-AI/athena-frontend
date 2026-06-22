"use client";

import { LocalGate } from "@/components/desktop/local-gate";
import { ActivityView } from "@/components/desktop/activity-view";

export default function LocalActivityPage() {
  return <LocalGate>{(orgId) => <ActivityView orgId={orgId} />}</LocalGate>;
}
