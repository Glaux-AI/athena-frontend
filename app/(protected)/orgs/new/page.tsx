"use client";

/**
 * Create a new organization. Whoever creates it becomes its `owner`
 * (the only owner — exactly-one-owner-per-org is enforced server-side).
 *
 * After creation, the new org is set as the active org and the user is
 * sent to the onboarding wizard.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster, Center } from "@/components/layout/primitives";
import { api, ApiError } from "@/lib/api/client";
import { useSession } from "@/lib/session/SessionProvider";

export default function NewOrgPage() {
  const router = useRouter();
  const { setActiveOrgId, refreshMe } = useSession();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [edition, setEdition] = useState<"pro" | "enterprise">("pro");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Auto-derive slug from name as the user types.
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
      const org = await api.orgs.create({ name, slug, edition });
      setActiveOrgId(org.id);
      await refreshMe();
      // §5.29.4 — first-time creators land on the onboarding wizard,
      // not the bare settings page. The org slug keeps the URL
      // human-recognisable.
      router.replace(`/onboarding/${encodeURIComponent(org.slug)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the organization.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Center as="main">
      <Card className="w-[min(560px,calc(100%-2rem))] p-6">
        <Stack gap="4">
          <Stack gap="1">
            <CardHeader className="p-0">
              <CardTitle>Create an organization</CardTitle>
              <CardDescription>You&apos;ll be the owner. Invite teammates and connect integrations next.</CardDescription>
            </CardHeader>
          </Stack>

          <form onSubmit={submit}>
            <Stack gap="3">
              <label className="block text-sm">
                <span className="mb-1 inline-block font-medium">Organization name</span>
                <input
                  required
                  value={name}
                  onChange={(e) => onName(e.target.value)}
                  placeholder="Acme Corp"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 inline-block font-medium">Slug</span>
                <input
                  required
                  value={slug}
                  onChange={(e) => setSlug(slugify(e.target.value))}
                  placeholder="acme"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm"
                />
                <span className="text-xs text-[var(--text-subtle)]">
                  Used in URLs. Lowercase letters, numbers, and hyphens.
                </span>
              </label>
              <label className="block text-sm">
                <span className="mb-1 inline-block font-medium">Edition</span>
                <select
                  value={edition}
                  onChange={(e) => setEdition(e.target.value as "pro" | "enterprise")}
                  className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                >
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </label>

              {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

              <Cluster justify="end" gap="2">
                <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
                <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create organization"}</Button>
              </Cluster>
            </Stack>
          </form>
        </Stack>
      </Card>
    </Center>
  );
}

function slugify(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}
