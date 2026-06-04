/**
 * /settings/security — readiness §5.7.3 row `/settings/security`.
 *
 * Two surfaces on one page:
 *   1. WebAuthn passkeys — Supabase MFA `webauthn` factors. Enrollment
 *      goes through the browser PRF prompt; rename + remove are direct
 *      calls into the Supabase SDK from the browser.
 *   2. Active sessions — Supabase GoTrue session rows proxied via the
 *      BE (the Supabase SDK doesn't expose listing other sessions to
 *      the browser). Revoke + bulk-revoke-others write an audit row on
 *      the user's active org.
 *
 * This file is a Server Component shell. All interactivity lives in
 * `security-client.tsx`, which marks itself `"use client"` and reads
 * the active session from `<SessionProvider>`. Keeping the shell on the
 * server keeps the initial HTML payload smaller (no Supabase SDK in
 * the first byte) and matches the pattern set by the embed routes.
 */
import { Stack } from "@/components/layout/primitives";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";

import { SecurityClient } from "./security-client";

export default function SecurityPage() {
  return (
    <Stack gap="4">
      <SettingsPageHeader
        title="Security"
        subtitle="Manage WebAuthn passkeys and review the devices currently signed in to your account. Changes here apply to your Athena identity only; org-level access is governed by Members + SSO."
      />
      <SecurityClient />
    </Stack>
  );
}
