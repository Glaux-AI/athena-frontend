"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Stack } from "@/components/layout/primitives";

export default function AuditPage() {
  return (
    <Stack gap="4">
      <Stack gap="1">
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Every mutating action — org changes, member changes, integration
          connects, run creates, gate decisions — is recorded in an
          append-only chain with a WORM trigger at the database level.
        </p>
      </Stack>

      <Card>
        <CardHeader>
          <CardTitle>Coming next</CardTitle>
          <CardDescription>
            The audit log viewer (filterable + paginated) and CSV / JSON export
            land in Phase 5.5. The backend already writes every event; this
            page reads them when the route handler ships.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--text-muted)]">
            For now, run <code>SELECT action, created_at FROM audit_log WHERE org_id = '&lt;your-org-id&gt;' ORDER BY created_at DESC LIMIT 50;</code>
            against the database to see live events.
          </p>
        </CardContent>
      </Card>
    </Stack>
  );
}
