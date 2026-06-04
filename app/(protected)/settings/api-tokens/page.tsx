"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Cluster, Stack } from "@/components/layout/primitives";
import { useSession } from "@/lib/session/SessionProvider";
import { api, ApiError, type ApiTokenMinted, type ApiTokenSummary } from "@/lib/api/client";

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function tokenStatus(t: ApiTokenSummary): { label: string; tone: "ok" | "warn" | "dead" } {
  if (t.revoked_at) return { label: "revoked", tone: "dead" };
  if (t.expires_at && new Date(t.expires_at) < new Date()) {
    return { label: "expired", tone: "warn" };
  }
  return { label: "active", tone: "ok" };
}

export default function ApiTokensPage() {
  const { activeOrgId, me } = useSession();
  const [tokens, setTokens] = useState<ApiTokenSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<ApiTokenMinted | null>(null);

  const [name, setName] = useState("");
  const [scopesInput, setScopesInput] = useState("");
  const [expiresIn, setExpiresIn] = useState<"30" | "90" | "never">("90");

  const myMembership = me?.memberships.find((m) => m.orgId === activeOrgId);
  const canManage =
    myMembership?.role === "owner" || myMembership?.role === "admin";

  const load = useCallback(async () => {
    if (!activeOrgId) return;
    try {
      setTokens(await api.apiTokens.list(activeOrgId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load API tokens.");
    }
  }, [activeOrgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!activeOrgId || !name.trim()) return;
    setBusy("create");
    setError(null);
    const scopes = scopesInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const expires_at =
      expiresIn === "never"
        ? null
        : new Date(Date.now() + Number(expiresIn) * 24 * 3600 * 1000).toISOString();
    try {
      const minted = await api.apiTokens.create(activeOrgId, {
        name: name.trim(),
        scopes,
        expires_at,
      });
      setRevealed(minted);
      setName("");
      setScopesInput("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to create token.");
    } finally {
      setBusy(null);
    }
  };

  const revoke = async (token: ApiTokenSummary) => {
    if (!activeOrgId) return;
    setBusy(token.id);
    setError(null);
    try {
      await api.apiTokens.revoke(activeOrgId, token.id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to revoke token.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Stack gap="4">
      <Stack gap="1">
        <h1 className="text-2xl font-semibold">API tokens</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Programmatic <code>ath_…</code> bearer tokens for CI systems and
          M2M scripts. The raw token is shown exactly once — store it in
          your secret manager when you create it.
        </p>
      </Stack>

      {error && (
        <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger-ink)]">{error}</p>
        </Card>
      )}

      {revealed && (
        <Card className="border-[var(--success)]">
          <CardHeader>
            <CardTitle>Token created — copy it now</CardTitle>
            <CardDescription>
              This is the only time the full token will be visible. After you
              close this banner you&apos;ll only see the prefix.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Stack gap="3">
              <code className="block break-all rounded-md border border-[var(--border)] bg-[var(--surface-3)] p-3 font-mono text-sm">
                {revealed.token}
              </code>
              <Cluster gap="2">
                <Button
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard?.writeText(revealed.token);
                  }}
                >
                  Copy to clipboard
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRevealed(null)}>
                  I&apos;ve stored it
                </Button>
              </Cluster>
            </Stack>
          </CardContent>
        </Card>
      )}

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Create a token</CardTitle>
            <CardDescription>
              Give the token a human-readable name (shown in audit log) and
              the comma-separated scopes you want it to carry.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Stack gap="3">
              <input
                type="text"
                placeholder="e.g. github-actions-deploy"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              />
              <input
                type="text"
                placeholder="scopes (e.g. runs:create,runs:read)"
                value={scopesInput}
                onChange={(e) => setScopesInput(e.target.value)}
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              />
              <Cluster gap="2" align="center">
                <label className="text-sm text-[var(--text-muted)]">Expires in</label>
                <select
                  value={expiresIn}
                  onChange={(e) => setExpiresIn(e.target.value as "30" | "90" | "never")}
                  className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  <option value="30">30 days</option>
                  <option value="90">90 days (recommended)</option>
                  <option value="never">Never</option>
                </select>
                <Button
                  size="sm"
                  disabled={!name.trim() || busy === "create"}
                  onClick={create}
                >
                  Create token
                </Button>
              </Cluster>
            </Stack>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {tokens.length} token{tokens.length === 1 ? "" : "s"}
          </CardTitle>
          <CardDescription>
            Only the prefix is stored in plain text; the rest is argon2id-hashed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tokens.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] italic">
              No tokens yet. Create one above to grant a CI system access.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-[var(--text-subtle)]">
                <tr>
                  <th className="pb-2 pr-3">Name</th>
                  <th className="pb-2 pr-3">Prefix</th>
                  <th className="pb-2 pr-3">Scopes</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2 pr-3">Last used</th>
                  <th className="pb-2 pr-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => {
                  const status = tokenStatus(t);
                  const toneClass =
                    status.tone === "ok"
                      ? "text-[var(--success)]"
                      : status.tone === "warn"
                        ? "text-[var(--warning)]"
                        : "text-[var(--text-subtle)] italic";
                  return (
                    <tr key={t.id} className="border-t border-[var(--border)]">
                      <td className="py-2 pr-3">{t.name}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{t.prefix}…</td>
                      <td className="py-2 pr-3 text-xs">
                        {t.scopes.length > 0 ? t.scopes.join(", ") : "—"}
                      </td>
                      <td className={`py-2 pr-3 text-xs ${toneClass}`}>
                        {status.label}
                      </td>
                      <td className="py-2 pr-3 text-xs text-[var(--text-muted)]">
                        {formatTimestamp(t.last_used_at)}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {canManage && !t.revoked_at && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy === t.id}
                            onClick={() => revoke(t)}
                          >
                            Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
