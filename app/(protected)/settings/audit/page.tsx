"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Cluster, Stack } from "@/components/layout/primitives";
import { api, ApiError, type AuditEvent } from "@/lib/api/client";

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verification, setVerification] = useState<
    | { kind: "idle" }
    | { kind: "ok"; verified: number }
    | { kind: "bad"; message: string }
  >({ kind: "idle" });

  const load = useCallback(
    async (opts: { append?: boolean; cursor?: string | null } = {}) => {
      setLoading(true);
      setError(null);
      try {
        const query: Parameters<typeof api.audit.events>[0] = { limit: 50 };
        if (filterAction) query.action = filterAction;
        if (opts.cursor) query.cursor = opts.cursor;
        const page = await api.audit.events(query);
        setEvents(opts.append ? [...events, ...page.events] : page.events);
        setNextCursor(page.next_cursor);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load audit log");
      } finally {
        setLoading(false);
      }
    },
    [events, filterAction],
  );

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verify = async () => {
    setVerification({ kind: "idle" });
    try {
      const result = await api.audit.verify();
      setVerification({ kind: "ok", verified: result.verified });
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Verification failed.";
      setVerification({ kind: "bad", message });
    }
  };

  return (
    <Stack gap="4">
      <Stack gap="1">
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Append-only chain of every mutating action. WORM-enforced at the
          database; each row is SHA-256 chained to the one before so tampering
          is detectable.
        </p>
      </Stack>

      <Card>
        <CardHeader>
          <CardTitle>Chain verification</CardTitle>
          <CardDescription>
            Recomputes the chain hash from the first row of your organization.
            Returns the number of rows verified, or surfaces the first row
            where the chain breaks. Safe to run any time — read-only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Cluster gap="3" align="center">
            <Button onClick={verify} disabled={loading}>
              Verify chain
            </Button>
            {verification.kind === "ok" && (
              <span className="text-sm text-[var(--success)]">
                ✓ {verification.verified.toLocaleString()} rows verified.
              </span>
            )}
            {verification.kind === "bad" && (
              <span className="text-sm text-[var(--danger)]">{verification.message}</span>
            )}
          </Cluster>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
          <CardDescription>
            Newest first. Filter by exact `action` (e.g.{" "}
            <code>members.invited</code>, <code>capability.created</code>).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Stack gap="3">
            <Cluster gap="2" align="center">
              <input
                type="text"
                placeholder="filter by action…"
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm"
              />
              <Button
                size="sm"
                variant="ghost"
                disabled={loading}
                onClick={() => load()}
              >
                Apply
              </Button>
            </Cluster>

            {error && (
              <p className="text-sm text-[var(--danger)]">{error}</p>
            )}

            {events.length === 0 && !loading ? (
              <p className="text-sm text-[var(--text-muted)] italic">
                No events match the current filter.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-[var(--text-subtle)]">
                  <tr>
                    <th className="pb-2 pr-3">Action</th>
                    <th className="pb-2 pr-3">Actor</th>
                    <th className="pb-2 pr-3">Resource</th>
                    <th className="pb-2 pr-3">When</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr key={ev.id} className="border-t border-[var(--border)] align-top">
                      <td className="py-2 pr-3 font-mono text-xs">{ev.action}</td>
                      <td className="py-2 pr-3 text-xs">
                        <Stack gap="0">
                          <span>{ev.actor_kind}</span>
                          <span className="text-[var(--text-subtle)]">{ev.actor_id}</span>
                        </Stack>
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {ev.resource_kind ? (
                          <Stack gap="0">
                            <span>{ev.resource_kind}</span>
                            <span className="text-[var(--text-subtle)] font-mono">
                              {ev.resource_id}
                            </span>
                          </Stack>
                        ) : (
                          <span className="text-[var(--text-subtle)] italic">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-xs text-[var(--text-muted)]">
                        {formatTimestamp(ev.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {nextCursor && (
              <Cluster justify="center">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={loading}
                  onClick={() => load({ append: true, cursor: nextCursor })}
                >
                  Load more
                </Button>
              </Cluster>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
