"use client";

import { useCallback, useEffect, useState } from "react";
import { Globe } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Stack, Cluster } from "@/components/layout/primitives";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { useSession } from "@/lib/session/SessionProvider";
import { api, ApiError, type DomainVerification } from "@/lib/api/client";

export default function EmailDomainsPage() {
  const { activeOrgId } = useSession();
  const [domains, setDomains] = useState<DomainVerification[]>([]);
  const [domainInput, setDomainInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeOrgId) return;
    try { setDomains(await api.emailDomains.list(activeOrgId)); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Failed to load"); }
  }, [activeOrgId]);

  useEffect(() => { void load(); }, [load]);

  const claim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrgId) return;
    try {
      await api.emailDomains.claim(activeOrgId, domainInput);
      setDomainInput("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Claim failed");
    }
  };

  const verify = async (d: DomainVerification) => {
    if (!activeOrgId) return;
    setBusy(d.id);
    try {
      await api.emailDomains.verify(activeOrgId, d.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed (check DNS).");
    } finally {
      setBusy(null);
    }
  };

  const unclaim = async (d: DomainVerification) => {
    if (!activeOrgId) return;
    setBusy(d.id);
    try {
      await api.emailDomains.unclaim(activeOrgId, d.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unclaim failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Stack gap="4">
      <SettingsPageHeader
        title="Email domains"
        subtitle="Claim and verify domains so teammates signing in with matching emails can auto-join."
      />

      {error && (
        <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger-ink)]">{error}</p>
        </Card>
      )}

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Claim a domain</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={claim}>
            <Cluster gap="2" align="end">
              <label className="flex-1 text-sm">
                <span className="mb-1 inline-block font-medium">Domain</span>
                <input
                  required
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  placeholder="lumen.dev"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                />
              </label>
              <Button type="submit">Claim</Button>
            </Cluster>
          </form>
        </CardContent>
      </Card>

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Your domains</CardTitle>
          <CardDescription>Add the TXT record to the apex, then click Verify.</CardDescription>
        </CardHeader>
        <CardContent>
          {domains.length === 0 ? (
            <EmptyState
              icon={<Globe className="size-5" aria-hidden />}
              title="No domains claimed yet"
              description="Claim a domain above, then add its TXT record and verify so matching emails can auto-join."
            />
          ) : (
            <Stack gap="3">
              {domains.map((d) => (
                <Card
                  key={d.id}
                  className="border-[var(--border)] bg-[var(--surface-2)] p-3 transition-[box-shadow,border-color] duration-200 ease-out hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-2)]"
                >
                  <Stack gap="2">
                    <Cluster justify="between" align="center">
                      <Stack gap="0">
                        <span className="font-mono text-sm font-medium">{d.domain}</span>
                        <span className="text-xs text-[var(--text-muted)]">
                          {d.verified_at ? "verified ✓" : d.last_error ?? "awaiting DNS"}
                        </span>
                      </Stack>
                      <Cluster gap="2">
                        {!d.verified_at && (
                          <Button size="sm" disabled={busy === d.id} onClick={() => verify(d)}>Verify</Button>
                        )}
                        <Button size="sm" variant="ghost" disabled={busy === d.id} onClick={() => unclaim(d)}>Unclaim</Button>
                      </Cluster>
                    </Cluster>
                    {!d.verified_at && (
                      <div className="rounded-md bg-[var(--surface)] p-2 font-mono text-xs">
                        <div><span className="text-[var(--text-subtle)]">Name:</span> {d.dns_txt_record_name}</div>
                        <div><span className="text-[var(--text-subtle)]">Type:</span> TXT</div>
                        <div><span className="text-[var(--text-subtle)]">Value:</span> {d.dns_txt_value}</div>
                      </div>
                    )}
                  </Stack>
                </Card>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
