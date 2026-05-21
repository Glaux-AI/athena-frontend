"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Stack } from "@/components/layout/primitives";

export default function SsoPage() {
  return (
    <Stack gap="4">
      <Stack gap="1">
        <h1 className="text-2xl font-semibold">SSO + SCIM</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Enterprise organizations connect their identity provider here. SSO sign-ins route through Supabase Auth's SAML / OIDC surface; SCIM provisioning lands user + group changes from the IdP.
        </p>
      </Stack>

      <Card>
        <CardHeader>
          <CardTitle>Provider connections</CardTitle>
          <CardDescription>
            Connecting OIDC / SAML to your org programmatically registers the
            provider in Supabase via the Admin API and stores the
            group→role mapping in <code>org_sso_connections</code>. The
            configuration UI lands in Phase 5.5.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--text-muted)]">
            Tested IdPs: Okta · Microsoft Entra ID · Auth0 · OneLogin · Google Workspace · JumpCloud.
          </p>
        </CardContent>
      </Card>
    </Stack>
  );
}
