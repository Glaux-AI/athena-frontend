"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Stack } from "@/components/layout/primitives";

export default function IntegrationsPage() {
  return (
    <Stack gap="4">
      <Stack gap="1">
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Connect source-control hosts, work-management systems, and chat-ops so Athena agents can open PRs, file tickets, and post status updates.
        </p>
      </Stack>

      <Card>
        <CardHeader>
          <CardTitle>Available providers</CardTitle>
          <CardDescription>
            Provider connectors land in Phase 5.6 of the implementation roadmap.
            The integration framework + OAuth handlers + webhook ingress are
            being built; the per-provider Connect buttons appear here as each
            adapter ships.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
            <ProviderRow label="GitHub" hint="Source control · GitHub App (Cloud + Enterprise Server)" />
            <ProviderRow label="GitLab" hint="Source control · OAuth (Cloud) + Group Access Token (SM)" />
            <ProviderRow label="Bitbucket" hint="Source control · OAuth (Cloud) + App Password (DC)" />
            <ProviderRow label="Jira" hint="Work management · OAuth 2.0 (3LO)" />
            <ProviderRow label="Linear" hint="Work management · OAuth 2.0" />
            <ProviderRow label="Asana" hint="Work management · OAuth 2.0" />
            <ProviderRow label="Azure DevOps" hint="Work management · OAuth 2.0 + PAT" />
            <ProviderRow label="Slack" hint="Chat-ops · OAuth 2.0" />
            <ProviderRow label="Microsoft Teams" hint="Chat-ops · Bot Framework" />
          </ul>
        </CardContent>
      </Card>
    </Stack>
  );
}

function ProviderRow({ label, hint }: { label: string; hint: string }) {
  return (
    <li className="flex items-start gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex-1">
        <div className="font-medium">{label}</div>
        <div className="text-xs text-[var(--text-muted)]">{hint}</div>
      </div>
      <span className="text-xs text-[var(--text-subtle)]">soon</span>
    </li>
  );
}
