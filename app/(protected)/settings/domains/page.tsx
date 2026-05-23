"use client";

import { useCallback, useEffect, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { useSession } from "@/lib/session/SessionProvider";
import { api, ApiError, type DomainVerification } from "@/lib/api/client";

export default function DomainsPage() {
  const { activeOrgId } = useSession();
  const [domains, setDomains] = useState<DomainVerification[]>([]);
  const [domainInput, setDomainInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeOrgId) return;
    try { setDomains(await api.domains.list(activeOrgId)); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Failed to load"); }
  }, [activeOrgId]);

  useEffect(() => { void load(); }, [load]);

  const claim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrgId) return;
    try {
      await api.domains.claim(activeOrgId, domainInput);
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
      await api.domains.verify(activeOrgId, d.id);
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
      await api.domains.unclaim(activeOrgId, d.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unclaim failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Stack gap="4">
      <Stack gap="1">
        <h1 className="text-2xl font-semibold">Email domains</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Claim and verify domains so teammates signing in with matching emails can auto-join.
        </p>
      </Stack>

      {error && (
        <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger)]">{error}</p>
        </Card>
      )}

      <Card>
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
                  placeholder="acme.com"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                />
              </label>
              <Button type="submit">Claim</Button>
            </Cluster>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your domains</CardTitle>
          <CardDescription>Add the TXT record to the apex, then click Verify.</CardDescription>
        </CardHeader>
        <CardContent>
          {domains.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No domains claimed yet.</p>
          ) : (
            <Stack gap="3">
              {domains.map((d) => (
                <Card key={d.id} className="bg-[var(--surface-2)] p-3">
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
