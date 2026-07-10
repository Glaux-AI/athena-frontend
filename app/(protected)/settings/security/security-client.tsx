"use client";

/**
 * /settings/security client surface - see `page.tsx` for the routing
 * + server shell. This component owns:
 *
 *   - PasskeysCard - list + enroll + rename + remove of Supabase MFA
 *     factors of type `webauthn`. The browser Supabase SDK exposes
 *     `auth.mfa.webauthn.register({ friendlyName })` which performs the
 *     full enroll → challenge → PRF prompt → verify ceremony.
 *   - SessionsCard - proxy through the BE (`/v1/auth/sessions`) for
 *     listing + revoking. Supabase doesn't surface sibling sessions to
 *     the browser SDK, so the BE wraps the Admin API.
 *
 * Wire fields stay snake_case (ADR-032). Tokens-only Tailwind. Empty,
 * loading, and error states are first-class per UX standard §9.2 + the
 * "Hard rules" list in `CLAUDE.md`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Fingerprint,
  KeyRound,
  Loader2,
  Monitor,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
import type { Factor } from "@supabase/supabase-js";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { Cluster, Stack } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { ApiError } from "@/lib/api/client";
import {
  listSessions,
  revokeOtherSessions,
  revokeSession,
  type AuthSession,
} from "@/lib/api/auth";

export function SecurityClient() {
  return (
    <Stack gap="6">
      <PasskeysCard />
      <SessionsCard />
    </Stack>
  );
}

/* -------------------------------------------------------------------------- */
/* Passkeys                                                                   */
/* -------------------------------------------------------------------------- */

type WebauthnFactor = Factor<"webauthn">;

function PasskeysCard() {
  const [factors, setFactors] = useState<WebauthnFactor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [friendlyName, setFriendlyName] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const supabase = getBrowserSupabase();
      const { data, error: err } = await supabase.auth.mfa.listFactors();
      if (err) throw err;
      const wa = (data?.all ?? []).filter(
        (f): f is WebauthnFactor => f.factor_type === "webauthn",
      );
      setFactors(wa);
    } catch (e) {
      setFactors([]);
      setError(messageOf(e, "Failed to load passkeys."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const enroll = async () => {
    const name = friendlyName.trim();
    if (!name || enrolling) return;
    setEnrolling(true);
    setError(null);
    try {
      const supabase = getBrowserSupabase();
      // `webauthn.register` runs the full enroll → challenge → browser
      // PRF prompt → verify pipeline. The browser will surface its own
      // OS-level UI; we just await the promise.
      const result = await supabase.auth.mfa.webauthn.register({
        friendlyName: name,
      });
      if (result.error) throw result.error;
      setFriendlyName("");
      await load();
    } catch (e) {
      setError(messageOf(e, "Failed to enroll passkey."));
    } finally {
      setEnrolling(false);
    }
  };

  const remove = async (factor: WebauthnFactor) => {
    setBusyId(factor.id);
    setError(null);
    try {
      const supabase = getBrowserSupabase();
      const { error: err } = await supabase.auth.mfa.unenroll({
        factorId: factor.id,
      });
      if (err) throw err;
      await load();
    } catch (e) {
      setError(messageOf(e, "Failed to remove passkey."));
    } finally {
      setBusyId(null);
    }
  };

  const loading = factors === null;

  return (
    <Card variant="elevated">
      <CardHeader>
        <CardTitle>
          <Cluster gap="2" align="center">
            <Fingerprint className="size-4 text-[var(--primary)]" aria-hidden />
            <span>Passkeys</span>
          </Cluster>
        </CardTitle>
        <CardDescription>
          Phishing-resistant second factor. Enroll a passkey to require it on
          sign-in to your account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Stack gap="3">
          <EnrollForm
            value={friendlyName}
            onChange={setFriendlyName}
            busy={enrolling}
            onSubmit={enroll}
          />

          {error && (
            <p className="text-xs text-[var(--danger)]" role="alert">
              {error}
            </p>
          )}

          {loading ? (
            <PasskeyListSkeleton />
          ) : factors.length === 0 ? (
            <EmptyState
              icon={<KeyRound className="size-5" aria-hidden />}
              title="No passkeys yet."
              description="Enroll one to require a second factor on sign-in."
            />
          ) : (
            <PasskeyList factors={factors} busyId={busyId} onRemove={remove} />
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function EnrollForm({
  value,
  onChange,
  busy,
  onSubmit,
}: {
  value: string;
  onChange: (next: string) => void;
  busy: boolean;
  onSubmit: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]"
    >
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. iPhone 15, YubiKey 5C"
        aria-label="Passkey name"
        maxLength={64}
        className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      />
      <Button type="submit" disabled={busy || !value.trim()} loading={busy}>
        <KeyRound className="size-3.5" aria-hidden />
        Enroll a new passkey
      </Button>
    </form>
  );
}

function PasskeyList({
  factors,
  busyId,
  onRemove,
}: {
  factors: WebauthnFactor[];
  busyId: string | null;
  onRemove: (f: WebauthnFactor) => Promise<void>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="passkey-table">
        <thead className="text-left text-micro uppercase tracking-wide text-[var(--text-subtle)]">
          <tr>
            <th className="pb-2 pr-3 font-semibold">Passkey</th>
            <th className="pb-2 pr-3 font-semibold">Enrolled</th>
            <th className="pb-2 pr-3 font-semibold">Status</th>
            <th className="pb-2 pr-3 text-right font-semibold">Actions</th>
          </tr>
          <tr aria-hidden="true">
            <th colSpan={4} className="p-0">
              <hr className="hr-horizon" />
            </th>
          </tr>
        </thead>
        <tbody>
          {factors.map((f, i) => (
            <tr
              key={f.id}
              className={cn(
                i > 0 && "border-t border-[var(--border-soft)]",
                "transition-colors hover:bg-[var(--surface-2)]",
              )}
            >
              <td className="py-2 pr-3 font-medium">
                {f.friendly_name?.trim() || "Unnamed passkey"}
              </td>
              <td className="py-2 pr-3 text-xs text-[var(--text-muted)]">
                {formatDate(f.created_at)}
              </td>
              <td className="py-2 pr-3 text-xs">
                {f.status === "verified" ? (
                  <Pill tone="success" size="sm" dot>Verified</Pill>
                ) : (
                  <Pill tone="neutral" kind="outline" size="sm">Unverified</Pill>
                )}
              </td>
              <td className="py-2 pr-3 text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId === f.id}
                  onClick={() => onRemove(f)}
                  aria-label={`Remove passkey ${f.friendly_name ?? f.id}`}
                >
                  {busyId === f.id ? (
                    <Loader2 className="size-3 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="size-3" aria-hidden />
                  )}
                  Remove
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PasskeyListSkeleton() {
  return (
    <div
      className="space-y-2"
      role="status"
      aria-label="Loading passkeys"
      data-testid="passkey-list-skeleton"
    >
      {[0, 1].map((i) => (
        <Skeleton key={i} className="h-9 rounded-md" />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sessions                                                                   */
/* -------------------------------------------------------------------------- */

function SessionsCard() {
  const [sessions, setSessions] = useState<AuthSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await listSessions();
      setSessions(result.sessions);
    } catch (e) {
      setSessions([]);
      setError(messageOf(e, "Failed to load sessions."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (session: AuthSession) => {
    setBusyId(session.id);
    setError(null);
    try {
      await revokeSession(session.id);
      await load();
    } catch (e) {
      setError(messageOf(e, "Failed to revoke session."));
    } finally {
      setBusyId(null);
    }
  };

  const revokeOthers = async () => {
    setBulkBusy(true);
    setError(null);
    try {
      await revokeOtherSessions();
      await load();
    } catch (e) {
      setError(messageOf(e, "Failed to revoke other sessions."));
    } finally {
      setBulkBusy(false);
    }
  };

  const loading = sessions === null;
  const otherSessions = useMemo(
    () => (sessions ?? []).filter((s) => !s.is_current),
    [sessions],
  );

  return (
    <Card variant="elevated">
      <CardHeader>
        <CardTitle>
          <Cluster gap="2" align="center">
            <Monitor className="size-4 text-[var(--primary)]" aria-hidden />
            <span>Active sessions</span>
          </Cluster>
        </CardTitle>
        <CardDescription>
          Each row is a device signed in with your account. Revoking a session
          forces that device to sign in again.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Stack gap="3">
          {error && (
            <p className="text-xs text-[var(--danger)]" role="alert">
              {error}
            </p>
          )}

          {loading ? (
            <SessionsListSkeleton />
          ) : sessions.length === 0 ? (
            <EmptyState
              icon={<Monitor className="size-5" aria-hidden />}
              title="No active sessions to manage."
              description="Sign in from a new device and it will show up here."
            />
          ) : (
            <>
              <SessionsTable
                sessions={sessions}
                busyId={busyId}
                onRevoke={revoke}
              />
              {otherSessions.length > 0 && (
                <Cluster gap="2" align="center" justify="end">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={bulkBusy}
                    loading={bulkBusy}
                    onClick={revokeOthers}
                  >
                    <X className="size-3.5" aria-hidden />
                    Revoke all other sessions
                  </Button>
                </Cluster>
              )}
            </>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function SessionsTable({
  sessions,
  busyId,
  onRevoke,
}: {
  sessions: AuthSession[];
  busyId: string | null;
  onRevoke: (s: AuthSession) => Promise<void>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="sessions-table">
        <thead className="text-left text-micro uppercase tracking-wide text-[var(--text-subtle)]">
          <tr>
            <th className="pb-2 pr-3 font-semibold">Device</th>
            <th className="pb-2 pr-3 font-semibold">Region</th>
            <th className="pb-2 pr-3 font-semibold">Last active</th>
            <th className="pb-2 pr-3 text-right font-semibold">Actions</th>
          </tr>
          <tr aria-hidden="true">
            <th colSpan={4} className="p-0">
              <hr className="hr-horizon" />
            </th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s, i) => {
            const device = describeDevice(s.user_agent);
            return (
              <tr
                key={s.id}
                className={cn(
                  i > 0 && "border-t border-[var(--border-soft)]",
                  "transition-colors hover:bg-[var(--surface-2)]",
                )}
              >
                <td className="py-2 pr-3">
                  <Cluster gap="2" align="center">
                    <device.icon
                      className="size-4 text-[var(--text-subtle)]"
                      aria-hidden
                    />
                    <Stack gap="0">
                      <span className="font-medium">{device.label}</span>
                      {s.is_current && (
                        <span className="text-xs font-medium text-[var(--primary)]">
                          Current session
                        </span>
                      )}
                    </Stack>
                  </Cluster>
                </td>
                <td className="py-2 pr-3 text-xs text-[var(--text-muted)]">
                  {s.ip_region ?? "Unknown region"}
                </td>
                <td className="py-2 pr-3 text-xs text-[var(--text-muted)]">
                  {formatDateTime(s.last_active_at)}
                </td>
                <td className="py-2 pr-3 text-right">
                  {s.is_current ? (
                    <span className="text-xs text-[var(--text-subtle)]">
                      Sign out to revoke
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === s.id}
                      onClick={() => onRevoke(s)}
                      aria-label={`Revoke ${device.label}`}
                    >
                      {busyId === s.id ? (
                        <Loader2 className="size-3 animate-spin" aria-hidden />
                      ) : null}
                      Revoke
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SessionsListSkeleton() {
  return (
    <div
      className="space-y-2"
      role="status"
      aria-label="Loading sessions"
      data-testid="sessions-list-skeleton"
    >
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-9 rounded-md" />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

interface DeviceDescriptor {
  label: string;
  icon: typeof Monitor;
}

/** Parse a user-agent string into a coarse device label. The parsing
 *  rules are intentionally simple - production UA strings change
 *  shape often enough that a regex-on-keyword approach is more robust
 *  than a full UA library, and we don't ship enough analytical depth
 *  to justify the size cost of one. Renders "Unknown device" on a
 *  null/empty UA. */
export function describeDevice(userAgent: string | null): DeviceDescriptor {
  if (!userAgent) return { label: "Unknown device", icon: Monitor };
  const ua = userAgent;
  const browser = matchBrowser(ua);
  const platform = matchPlatform(ua);
  const icon =
    platform === "iOS" || platform === "Android" ? Smartphone : Monitor;
  if (browser && platform) {
    return { label: `${browser} on ${platform}`, icon };
  }
  if (platform) return { label: platform, icon };
  if (browser) return { label: browser, icon };
  return { label: "Unknown device", icon: Monitor };
}

function matchBrowser(ua: string): string | null {
  if (/edg\//i.test(ua)) return "Edge";
  if (/firefox\//i.test(ua)) return "Firefox";
  if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) return "Chrome";
  if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) return "Safari";
  return null;
}

function matchPlatform(ua: string): string | null {
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  if (/android/i.test(ua)) return "Android";
  if (/mac os x/i.test(ua)) return "macOS";
  if (/windows nt/i.test(ua)) return "Windows";
  if (/linux/i.test(ua)) return "Linux";
  return null;
}

/** Map a thrown value onto a safe user-visible string. Supabase's
 *  `AuthError` extends Error but its MFA paths sometimes throw a plain
 *  `{ message, status }` object instead - accept both. Falls back to
 *  the supplied default for anything else. */
function messageOf(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  if (
    e !== null &&
    typeof e === "object" &&
    "message" in e &&
    typeof (e as { message: unknown }).message === "string"
  ) {
    const msg = (e as { message: string }).message;
    if (msg) return msg;
  }
  return fallback;
}
