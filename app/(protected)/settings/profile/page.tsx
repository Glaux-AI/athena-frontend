"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Stack } from "@/components/layout/primitives";
import { useSession } from "@/lib/session/SessionProvider";

export default function ProfilePage() {
  const { me } = useSession();
  if (!me) return <p className="text-sm text-[var(--text-muted)]">Loading…</p>;

  return (
    <Stack gap="4">
      <Stack gap="1">
        <h1 className="text-2xl font-semibold">Your profile</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Identity managed by Supabase + your GitHub account. Display name + avatar are pulled from GitHub on every sign-in.
        </p>
      </Stack>

      <Card>
        <CardHeader>
          <CardTitle>{me.displayName}</CardTitle>
          <CardDescription>{me.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <Stack gap="3">
            <Field label="User ID" value={me.id} mono />
            <Field label="Account type" value={me.isEmployee ? "Athena employee" : "Customer"} />
            <Field label="Workspaces" value={String(me.memberships.length)} />
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="text-sm">
      <span className="mb-1 inline-block font-medium">{label}</span>
      <p className={mono ? "font-mono text-[var(--text-muted)]" : "text-[var(--text-muted)]"}>{value}</p>
    </div>
  );
}
