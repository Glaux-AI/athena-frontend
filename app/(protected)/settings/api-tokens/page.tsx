"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Stack } from "@/components/layout/primitives";

export default function ApiTokensPage() {
  return (
    <Stack gap="4">
      <Stack gap="1">
        <h1 className="text-2xl font-semibold">API tokens</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Service tokens (<code>ath_…</code>) for CI integrations and M2M scripts. Scoped to specific permissions, argon2id-hashed at rest.
        </p>
      </Stack>

      <Card>
        <CardHeader>
          <CardTitle>Token management</CardTitle>
          <CardDescription>
            Create / list / rotate / revoke UI lands alongside the audit log
            viewer in Phase 5.5. The backend schema + hashing layer are in
            place; the FE form is the only piece left.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--text-muted)]">
            Token format: <code>ath_&lt;24 hex&gt;</code>. The full token is
            shown once at creation; only the 12-char prefix is displayed thereafter.
          </p>
        </CardContent>
      </Card>
    </Stack>
  );
}
