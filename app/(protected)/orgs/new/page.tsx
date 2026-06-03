"use client";

/**
 * Onboarding step 1 of 3 — create the organization.
 *
 * Whoever creates it becomes its `owner` (the only owner —
 * exactly-one-owner-per-org is enforced server-side). The plan is NOT
 * chosen here: every new org starts on Free (BE seeds a free-tier
 * subscription) and the very next screen (`/onboarding/{slug}/plan`) lets
 * the owner stay on Free or upgrade. After creation we set the new org
 * active and route to that plan picker.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster, Center } from "@/components/layout/primitives";
import { OwlAvatar } from "@/components/mascot/owl-avatar";
import { OnboardingProgress } from "@/components/onboarding/onboarding-progress";
import { api, ApiError } from "@/lib/api/client";
import { useSession } from "@/lib/session/SessionProvider";

export default function NewOrgPage() {
  const router = useRouter();
  const { setActiveOrgId, refreshMe } = useSession();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Auto-derive slug from name as the user types, until they hand-edit it.
  const onName = (v: string) => {
    setName(v);
    if (!slug || slug === slugify(name)) {
      setSlug(slugify(v));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // No `edition` — the org is seeded on Free server-side; the plan is
      // picked on the next screen. (Sending an edition here was the old
      // "pick Pro/Enterprise to create an org" bug.)
      const org = await api.orgs.create({ name, slug });
      setActiveOrgId(org.id);
      await refreshMe();
      router.replace(`/onboarding/${encodeURIComponent(org.slug)}/plan`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the organization.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Center as="main">
      <Stack gap="6" className="w-[min(560px,calc(100%-2rem))]">
        <OnboardingProgress current={1} />

        <Card className="p-6 sm:p-8">
          <Stack gap="5">
            <Stack gap="2" className="items-center text-center">
              <OwlAvatar size={40} mood="happy" />
              <Stack gap="1" className="items-center">
                <h1 className="text-xl font-semibold">Create your workspace</h1>
                <p className="max-w-sm text-sm text-[var(--text-muted)]">
                  Name your organization. You&apos;ll be the owner — invite
                  teammates and connect repos in a moment.
                </p>
              </Stack>
            </Stack>

            <form onSubmit={submit}>
              <Stack gap="4">
                <label className="block text-sm">
                  <span className="mb-1 inline-block font-medium">Organization name</span>
                  <input
                    required
                    autoFocus
                    value={name}
                    onChange={(e) => onName(e.target.value)}
                    placeholder="Acme Corp"
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 inline-block font-medium">
                    Workspace URL slug
                  </span>
                  <div className="flex items-center overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] focus-within:border-[var(--ring)] focus-within:ring-2 focus-within:ring-[var(--ring)]">
                    <span className="select-none border-r border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 font-mono text-xs text-[var(--text-subtle)]">
                      /
                    </span>
                    <input
                      required
                      value={slug}
                      onChange={(e) => setSlug(slugify(e.target.value))}
                      placeholder="acme"
                      className="flex-1 bg-transparent px-3 py-2 font-mono text-sm focus:outline-none"
                    />
                  </div>
                  <span className="mt-1 inline-block text-xs text-[var(--text-subtle)]">
                    Used in URLs. Lowercase letters, numbers, and hyphens.
                  </span>
                </label>

                {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

                <Cluster justify="between" align="center">
                  <Button type="button" variant="ghost" onClick={() => router.back()}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={busy || !name || !slug}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                    {busy ? "Creating…" : "Continue"}
                    {!busy && <ArrowRight className="size-4" />}
                  </Button>
                </Cluster>
              </Stack>
            </form>
          </Stack>
        </Card>

        <p className="text-center text-xs text-[var(--text-subtle)]">
          Next: choose a plan. Every workspace starts free — no card required.
        </p>
      </Stack>
    </Center>
  );
}

function slugify(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}
