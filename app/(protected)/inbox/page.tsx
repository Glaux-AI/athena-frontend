"use client";

/**
 * /inbox — personal queue.
 *
 * Items requiring this user's attention: reviews requested, @mentions, CI
 * failures on their tasks, budget alerts, weekly digests. Click → either deep
 * link to the task at the right phase, or jump to a related page (cost,
 * activity).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Inbox as InboxIcon,
  MessageCircle,
  AlertTriangle,
  AtSign,
  ShieldCheck,
  CircleDollarSign,
  FileText,
  CheckCheck,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, ApiError, type InboxItem } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import {
  LargeChangeCard,
  isLargeChangeInboxItem,
} from "@/components/inbox/large-change-card";

const KIND_META: Record<InboxItem["kind"], { label: string; icon: typeof InboxIcon; tone: string }> = {
  review_requested: { label: "Review requested", icon: ShieldCheck,      tone: "text-[var(--primary)]"    },
  mention:          { label: "Mention",           icon: AtSign,           tone: "text-[var(--info)]"       },
  approval_needed:  { label: "Approval needed",   icon: ShieldCheck,      tone: "text-[var(--primary)]"    },
  ci_failed:        { label: "CI failed",         icon: AlertTriangle,    tone: "text-[var(--danger)]"     },
  comment:          { label: "Comment",           icon: MessageCircle,    tone: "text-[var(--text-muted)]" },
  budget_alert:     { label: "Budget alert",      icon: CircleDollarSign, tone: "text-[var(--warning)]"    },
  digest:           { label: "Digest",            icon: FileText,         tone: "text-[var(--text-muted)]" },
};

type KindFilter = "all" | InboxItem["kind"];
const KIND_FILTER_ORDER: KindFilter[] = ["all", "review_requested", "approval_needed", "mention", "ci_failed", "comment", "budget_alert", "digest"];

export default function InboxPage() {
  const router = useRouter();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");

  const refresh = async () => {
    setLoading(true);
    try {
      const page = await api.inbox.list({ limit: 50 });
      setItems(page.items);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load inbox");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const filtered = items
    .filter((i) => (filter === "unread" ? !i.read : true))
    .filter((i) => (kindFilter === "all" ? true : i.kind === kindFilter));
  const kindCounts = items.reduce<Partial<Record<InboxItem["kind"], number>>>(
    (acc, i) => ({ ...acc, [i.kind]: (acc[i.kind] ?? 0) + 1 }),
    {},
  );

  const onItemClick = async (item: InboxItem) => {
    if (item.task_id) router.push(`/runs/${item.task_id}`);
    else if (item.to) router.push(item.to);
    try { await api.inbox.markRead(item.id); } catch { /* ignore */ }
  };

  const onMarkAllRead = async () => {
    try {
      await api.inbox.markAllRead();
      setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    } catch { /* ignore */ }
  };

  return (
    <Stack gap="6">
      <Cluster justify="between" align="center">
        <Stack gap="1">
          <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Things on you. Items disappear from this list when you act or mark them read.
          </p>
        </Stack>
        <Cluster gap="2">
          <div className="inline-flex rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-0.5 shadow-[var(--inner-highlight)]">
            {(["all", "unread"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={cn(
                  "rounded-[5px] px-3 py-1 text-xs font-medium transition-colors",
                  filter === k
                    ? "bg-[var(--primary-soft)] text-[var(--primary)] shadow-[var(--shadow-1)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]",
                )}
              >
                {k === "all" ? `All · ${items.length}` : `Unread · ${items.filter((i) => !i.read).length}`}
              </button>
            ))}
          </div>
          <Button variant="outline" onClick={onMarkAllRead}>
            <CheckCheck className="size-4" />
            Mark all read
          </Button>
        </Cluster>
      </Cluster>

      <Cluster gap="1" align="center" className="flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Kind</span>
        {KIND_FILTER_ORDER.map((k) => {
          const label = k === "all" ? "All kinds" : KIND_META[k].label;
          const count = k === "all" ? items.length : (kindCounts[k] ?? 0);
          return (
            <button
              key={k}
              type="button"
              onClick={() => setKindFilter(k)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors",
                kindFilter === k
                  ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                  : "bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)]",
              )}
            >
              {label}
              <span className="tabular-nums text-[10px] text-[var(--text-subtle)]">{count}</span>
            </button>
          );
        })}
      </Cluster>

      {error && (
        <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger-ink)]">{error}</p>
        </Card>
      )}

      {loading ? (
        <Stack gap="2" aria-busy="true" aria-label="Loading inbox">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <Cluster gap="3" align="start">
                <div className="size-9 shrink-0 animate-pulse rounded-md bg-[var(--surface-2)]" />
                <Stack gap="1.5" className="flex-1 min-w-0">
                  <div className="h-3 w-24 animate-pulse rounded bg-[var(--surface-2)]" />
                  <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--surface-2)]" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-[var(--surface-2)]" />
                </Stack>
              </Cluster>
            </Card>
          ))}
        </Stack>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<InboxIcon className="size-7" />}
          title="Inbox zero"
          description="You're caught up. New items appear here when Athena needs your attention."
        />
      ) : (
        <Stack gap="2" as="ul">
          {filtered.map((item) => {
            // Readiness §5.28 row 1783 — the large-change admin-approval gate
            // surfaces as a dedicated card variant (cost + scope + Approve /
            // Skip) instead of the generic kind row. Detection is payload-
            // driven so older BE builds (no payload) fall through to the
            // generic row.
            if (isLargeChangeInboxItem(item)) {
              return (
                <li key={item.id}>
                  <LargeChangeCard item={item} onResolved={() => void refresh()} />
                </li>
              );
            }
            const meta = KIND_META[item.kind];
            const Icon = meta.icon;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onItemClick(item)}
                  className={cn(
                    "group block w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                  )}
                >
                  <Card
                    className={cn(
                      "transition-[background-color,border-color,box-shadow] duration-200 ease-out group-hover:border-[var(--border-strong)] group-hover:bg-[var(--surface-2)] group-hover:shadow-[var(--shadow-2)]",
                      !item.read && "border-l-2 border-l-[var(--primary)]",
                    )}
                  >
                    <Cluster justify="between" align="start">
                      <Cluster gap="3" align="start" className="flex-1 min-w-0">
                        <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--surface-2)] shadow-[var(--inner-highlight)] transition-colors duration-200 group-hover:bg-[var(--surface-3)]", meta.tone)}>
                          <Icon className="size-4" />
                        </div>
                        <Stack gap="1" className="flex-1 min-w-0">
                          <Cluster gap="2" align="center">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                              {meta.label}
                            </span>
                            {item.priority === "high" && (
                              <span className="rounded-full bg-[var(--danger-soft)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--danger-ink)]">
                                High
                              </span>
                            )}
                          </Cluster>
                          <span className="text-sm font-medium text-[var(--text)]">{item.title}</span>
                          <span className="line-clamp-2 text-sm text-[var(--text-muted)]">{item.context}</span>
                          <span className="text-xs text-[var(--text-subtle)]">
                            {item.actor} · {item.when}{item.phase ? ` · ${item.phase}` : ""}
                          </span>
                        </Stack>
                      </Cluster>
                      <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-[var(--primary)]">
                        {item.cta}
                        <span aria-hidden className="transition-transform duration-200 ease-out group-hover:translate-x-0.5">→</span>
                      </span>
                    </Cluster>
                  </Card>
                </button>
              </li>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
