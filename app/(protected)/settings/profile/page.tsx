"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Stack } from "@/components/layout/primitives";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { useSession } from "@/lib/session/SessionProvider";

export default function ProfilePage() {
  const { me } = useSession();
  if (!me) {
    // Page-level loading uses a content-shaped skeleton, not a text node.
    return (
      <Stack gap="4" aria-busy="true" aria-label="Loading your profile">
        <Stack gap="1">
          <div className="h-7 w-48 animate-pulse rounded-md bg-[var(--surface-2)]" />
          <div className="h-4 w-96 animate-pulse rounded-md bg-[var(--surface-2)]" />
        </Stack>
        <div className="h-44 w-full animate-pulse rounded-xl bg-[var(--surface-2)]" />
      </Stack>
    );
  }

  return (
    <Stack gap="4">
      <SettingsPageHeader
        title="Your profile"
        subtitle="Identity managed by Supabase + your GitHub account. Display name + avatar are pulled from GitHub on every sign-in."
      />

      <Card variant="elevated">
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
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm">
      <span className="mb-1 inline-block font-medium">{label}</span>
      <p className={mono ? "font-mono text-[var(--text-muted)]" : "text-[var(--text-muted)]"}>{value}</p>
    </div>
  );
}
