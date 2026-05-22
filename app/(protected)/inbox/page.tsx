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
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Inbox as InboxIcon,
  Loader2,
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

const KIND_META: Record<InboxItem["kind"], { label: string; icon: typeof InboxIcon; tone: string }> = {
  review_requested: { label: "Review requested", icon: ShieldCheck,      tone: "text-[var(--primary)]"    },
  mention:          { label: "Mention",           icon: AtSign,           tone: "text-[var(--info)]"       },
  approval_needed:  { label: "Approval needed",   icon: ShieldCheck,      tone: "text-[var(--primary)]"    },
  ci_failed:        { label: "CI failed",         icon: AlertTriangle,    tone: "text-[var(--danger)]"     },
  comment:          { label: "Comment",           icon: MessageCircle,    tone: "text-[var(--text-muted)]" },
  budget_alert:     { label: "Budget alert",      icon: CircleDollarSign, tone: "text-[var(--warning)]"    },
  digest:           { label: "Digest",            icon: FileText,         tone: "text-[var(--text-muted)]" },
};

export default function InboxPage() {
  const router = useRouter();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unread">("all");

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

  const filtered = filter === "unread" ? items.filter((i) => !i.read) : items;

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
          <div className="inline-flex rounded-md border border-[var(--border)] p-0.5">
            {(["all", "unread"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={cn(
                  "rounded-[5px] px-3 py-1 text-xs font-medium transition-colors",
                  filter === k
                    ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]",
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

      {error && (
        <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger)]">{error}</p>
        </Card>
      )}

      {loading ? (
        <Stack gap="2">
          {[0,1,2,3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg border border-[var(--border)] bg-[var(--surface-2)]" />
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
            const meta = KIND_META[item.kind];
            const Icon = meta.icon;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onItemClick(item)}
                  className={cn(
                    "block w-full rounded-lg text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                  )}
                >
                  <Card className={cn("hover:bg-[var(--surface-2)]", !item.read && "border-l-2 border-l-[var(--primary)]")}>
                    <Cluster justify="between" align="start">
                      <Cluster gap="3" align="start" className="flex-1 min-w-0">
                        <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--surface-2)]", meta.tone)}>
                          <Icon className="size-4" />
                        </div>
                        <Stack gap="1" className="flex-1 min-w-0">
                          <Cluster gap="2" align="center">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                              {meta.label}
                            </span>
                            {item.priority === "high" && (
                              <span className="rounded-full bg-[var(--danger-soft)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--danger)]">
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
                      <span className="shrink-0 text-xs font-medium text-[var(--primary)]">{item.cta} →</span>
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
