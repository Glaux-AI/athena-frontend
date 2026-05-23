"use client";

/**
 * /settings/sso — Single sign-on.
 *
 * Athena delegates sign-in to GitHub. Most enterprises already enforce SAML
 * SSO on their GitHub organization, which means every Athena sign-in
 * automatically goes through the same identity provider — without Athena
 * shipping its own SAML stack.
 *
 * This page explains how that works and links out to the GitHub setting to
 * confirm SSO is enforced on the org.
 */

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { ExternalLink, CheckCircle2, Lock } from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";

export default function SsoPage() {
  return (
    <Stack gap="6">
      <Stack gap="1">
        <h1 className="text-2xl font-semibold tracking-tight">Single sign-on</h1>
        <p className="text-sm text-[var(--text-muted)]">
          How Athena fits into your existing identity setup.
        </p>
      </Stack>

      {/* What we do */}
      <Card>
        <Stack gap="4">
          <Cluster gap="3" align="center">
            <BrandLogo name="GitHub" size={40} />
            <Stack gap="0">
              <span className="text-base font-semibold">SSO inherited from GitHub</span>
              <span className="text-xs text-[var(--text-muted)]">
                Athena uses GitHub OAuth for every sign-in. If your GitHub org enforces SAML SSO, Athena enforces it too — automatically.
              </span>
            </Stack>
          </Cluster>

          <Stack gap="2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">How it works</span>
            <ol className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] font-mono text-[10px] font-bold">1</span>
                <span>You enforce SAML SSO on your GitHub organization (Okta, Entra ID, Google Workspace, Auth0 — whatever your IdP is).</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] font-mono text-[10px] font-bold">2</span>
                <span>A user clicks <strong>Continue with GitHub</strong> in Athena.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] font-mono text-[10px] font-bold">3</span>
                <span>GitHub bounces them through your IdP. Athena never sees the password.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] font-mono text-[10px] font-bold">4</span>
                <span>Deprovision in your IdP → GitHub access revoked → Athena access revoked. One source of truth.</span>
              </li>
            </ol>
          </Stack>

          <Cluster gap="2">
            <Button asChild>
              <a href="https://github.com/organizations" target="_blank" rel="noreferrer">
                Open GitHub org settings <ExternalLink className="size-3.5" />
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href="https://docs.github.com/en/enterprise-cloud@latest/admin/identity-and-access-management/using-saml-for-enterprise-iam" target="_blank" rel="noreferrer">
                Enforce SAML on GitHub <ExternalLink className="size-3.5" />
              </a>
            </Button>
          </Cluster>
        </Stack>
      </Card>

      {/* What you get for free */}
      <Card>
        <Stack gap="3">
          <span className="text-sm font-semibold">What you get without extra setup</span>
          <ul className="grid gap-2 sm:grid-cols-2">
            <li className="flex items-start gap-2 text-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--success)]" /> SAML / OIDC enforcement (via GitHub).</li>
            <li className="flex items-start gap-2 text-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--success)]" /> Centralised deprovisioning.</li>
            <li className="flex items-start gap-2 text-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--success)]" /> No new password to manage.</li>
            <li className="flex items-start gap-2 text-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--success)]" /> Audit log captures every sign-in.</li>
            <li className="flex items-start gap-2 text-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--success)]" /> MFA inherited from your IdP / GitHub.</li>
            <li className="flex items-start gap-2 text-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--success)]" /> Same user identity across PRs and Athena tasks.</li>
          </ul>
        </Stack>
      </Card>

      {/* Direct SAML roadmap */}
      <Card className="border-[var(--border-strong)] bg-[var(--surface-2)]">
        <Cluster gap="3" align="start">
          <Lock className="mt-0.5 size-4 shrink-0 text-[var(--text-muted)]" />
          <Stack gap="1">
            <span className="text-sm font-semibold">Direct SAML (without GitHub) — Enterprise plan</span>
            <p className="text-xs text-[var(--text-muted)]">
              Some teams want Athena to talk directly to Okta / Entra ID / Google Workspace without going through GitHub.
              That&apos;s available on the Enterprise plan — get in touch and we&apos;ll provision it.
            </p>
            <Cluster gap="2" className="pt-2">
              <Button variant="outline" size="sm">Request direct SAML</Button>
            </Cluster>
          </Stack>
        </Cluster>
      </Card>
    </Stack>
  );
}
