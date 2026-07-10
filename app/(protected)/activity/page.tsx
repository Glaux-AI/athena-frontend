"use client";

/**
 * /activity - org-wide event stream. Plain English by default; toggle to
 * see the raw event line that hit the audit log.
 */

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Activity as ActivityIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-[var(--text-muted)]">
          <Switch
            checked={showTech}
            onCheckedChange={setShowTech}
            size="sm"
          />
          Show technical details
        </label>
      </Cluster>

      {error && (
        <div className="rounded-lg border border-[var(--border-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]">
          {error}
        </div>
      )}

      {loading ? (
        <Stack gap="2" aria-busy="true" aria-label="Loading activity">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <span
                className="flex w-3 shrink-0 flex-col items-center pt-4"
                aria-hidden
              >
                <Skeleton className="size-1.5 rounded-full" />
                {i < 5 && <span className="mt-1.5 w-px flex-1 bg-[var(--border-soft)]" />}
              </span>
              <Card className="min-w-0 flex-1">
                <Cluster gap="3" align="start">
                  <Skeleton className="size-7 shrink-0 rounded-full" />
                  <Stack gap="1" className="flex-1 min-w-0">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-24" />
                  </Stack>
                </Cluster>
              </Card>
            </div>
          ))}
        </Stack>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ActivityIcon className="size-6" />}
          title="No activity yet"
          description="Events show up here as people and agents work across the workspace - tasks moving, code changing, decisions landing."
        />
      ) : (
        <Stack gap="2" as="ul">
          {items.map((item, i) => (
            <li key={item.id} className="flex gap-3">
              {/* Day-flat timeline spine: one star-dot node per event with a
                  quiet connector down to the next (visual only). */}
              <span
                className="flex w-3 shrink-0 flex-col items-center pt-4"
                aria-hidden
              >
                <span
                  className="star-dot"
                  style={
                    {
                      "--dot-color":
                        item.who_kind === "agent"
                          ? "var(--primary)"
                          : "var(--text-muted)",
                    } as CSSProperties
                  }
                />
                {i < items.length - 1 && (
                  <span className="mt-1.5 w-px flex-1 bg-[var(--border-soft)]" />
                )}
              </span>
              <Card className="min-w-0 flex-1">
                <Cluster gap="3" align="start">
                  <ActorAvatar name={item.who} initials={item.who_avatar ?? undefined} agent={item.who_kind === "agent"} size={28} />
                  <Stack gap="1" className="flex-1 min-w-0">
                    {showTech ? (
                      <code className="text-micro block overflow-x-auto rounded bg-[var(--code-bg)] px-2 py-1 font-mono text-[var(--text-muted)]">{item.tech}</code>
                    ) : (
                      <span className="text-sm" dangerouslySetInnerHTML={{ __html: `<strong>${item.who}</strong> ${item.text_html}` }} />
                    )}
                    <Cluster gap="2" align="center">
                      <span className="text-xs text-[var(--text-subtle)]">{item.when}</span>
                      {item.task_id && <Link href={`/work/${item.task_id}`} className="text-xs text-[var(--primary)] hover:underline">View task</Link>}
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
