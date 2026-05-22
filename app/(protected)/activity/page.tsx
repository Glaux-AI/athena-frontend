"use client";

/**
 * /activity — org-wide event stream. Plain English by default; toggle to
 * see the raw event line that hit the audit log.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, ApiError, type ActivityItem } from "@/lib/api/client";
import { ActorAvatar } from "@/components/mascot/actor-avatar";

export default function ActivityPage() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTech, setShowTech] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const page = await api.activity.list({ limit: 100 });
        if (!cancelled) setItems(page.items);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Failed to load activity");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <Stack gap="6">
      <Cluster justify="between" align="center">
        <Stack gap="1">
          <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
          <p className="text-sm text-[var(--text-muted)]">Every meaningful event across the workspace.</p>
        </Stack>
        <button
          type="button"
          role="switch"
          aria-checked={showTech}
          onClick={() => setShowTech((v) => !v)}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <span className={`inline-flex h-4 w-7 items-center rounded-full p-0.5 transition-colors ${showTech ? "bg-[var(--primary)]" : "bg-[var(--surface-3)]"}`}>
            <span className={`size-3 rounded-full bg-white transition-transform ${showTech ? "translate-x-3" : "translate-x-0"}`} />
          </span>
          Show technical details
        </button>
      </Cluster>

      {error && (
        <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger)]">{error}</p>
        </Card>
      )}

      {loading ? (
        <Cluster gap="2" align="center"><Loader2 className="size-4 animate-spin text-[var(--text-muted)]" /><span className="text-sm text-[var(--text-muted)]">Loading…</span></Cluster>
      ) : (
        <Stack gap="2" as="ul">
          {items.map((item) => (
            <li key={item.id}>
              <Card className="hover:bg-[var(--surface-2)]">
                <Cluster gap="3" align="start">
                  <ActorAvatar name={item.who} initials={item.who_avatar ?? undefined} agent={item.who_kind === "agent"} size={28} />
                  <Stack gap="1" className="flex-1 min-w-0">
                    {showTech ? (
                      <code className="block overflow-x-auto rounded bg-[var(--code-bg)] px-2 py-1 font-mono text-[11px] text-[var(--text-muted)]">{item.tech}</code>
                    ) : (
                      <span className="text-sm" dangerouslySetInnerHTML={{ __html: `<strong>${item.who}</strong> ${item.text_html}` }} />
                    )}
                    <Cluster gap="2" align="center">
                      <span className="text-xs text-[var(--text-subtle)]">{item.when}</span>
                      {item.task_id && <Link href={`/runs/${item.task_id}`} className="text-xs text-[var(--primary)] hover:underline">View task</Link>}
                    </Cluster>
                  </Stack>
                </Cluster>
              </Card>
            </li>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
