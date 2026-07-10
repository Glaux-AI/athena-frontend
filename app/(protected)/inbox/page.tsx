"use client";

/**
 * /inbox - personal action queue.
 *
 * Items requiring this user's attention: reviews requested, @mentions, CI
 * failures, budget alerts, completed tasks, shared chats, weekly digests.
 * Defaults to the "Open" view (unread = things still on you); acting on an
 * item (click-through) or dismissing it (the row's X) marks it read so it
 * leaves the open list - the queue clears as you work it. "All" keeps the
 * history. Each row deep-links to where it's resolved (the task cockpit, the
 * chat thread it came from, the cost page, ...).
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
  CheckCircle2,
  Share2,
  UserPlus,
  X,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Pill } from "@/components/ui/pill";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { focusRing } from "@/components/ui/focus";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, ApiError, type InboxItem } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/utils/format";
import { notifyInboxChanged } from "@/lib/inbox/events";
import {
  LargeChangeCard,
  isLargeChangeInboxItem,
} from "@/components/inbox/large-change-card";

type KindMeta = { label: string; icon: typeof InboxIcon; tone: string };

const KIND_META: Record<InboxItem["kind"], KindMeta> = {
  review_requested: { label: "Review requested", icon: ShieldCheck,      tone: "text-[var(--primary)]"    },
  mention:          { label: "Mention",           icon: AtSign,           tone: "text-[var(--info)]"       },
  approval_needed:  { label: "Approval needed",   icon: ShieldCheck,      tone: "text-[var(--primary)]"    },
  ci_failed:        { label: "CI failed",         icon: AlertTriangle,    tone: "text-[var(--danger)]"     },
  comment:          { label: "Comment",           icon: MessageCircle,    tone: "text-[var(--text-muted)]" },
  budget_alert:     { label: "Budget alert",      icon: CircleDollarSign, tone: "text-[var(--warning)]"    },
  digest:           { label: "Digest",            icon: FileText,         tone: "text-[var(--text-muted)]" },
  run_completed:    { label: "Task complete",     icon: CheckCircle2,     tone: "text-[var(--success)]"    },
  chat_share:       { label: "Shared chat",       icon: Share2,           tone: "text-[var(--primary)]"    },
  assigned:         { label: "Assigned to you",   icon: UserPlus,         tone: "text-[var(--primary)]"    },
};

// Any kind the BE adds before the FE catches up renders as a neutral row
// rather than crashing the whole page (the live run_completed crash).
const FALLBACK_META: KindMeta = { label: "Notification", icon: InboxIcon, tone: "text-[var(--text-muted)]" };
const metaFor = (kind: InboxItem["kind"]): KindMeta => KIND_META[kind] ?? FALLBACK_META;

type KindFilter = "all" | InboxItem["kind"];
const KIND_FILTER_ORDER: KindFilter[] = [
  "all", "approval_needed", "review_requested", "assigned", "mention",
  "chat_share", "run_completed", "ci_failed", "comment", "budget_alert",
  "digest",
];

export default function InboxPage() {
  const router = useRouter();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Default to the open queue: acting on / dismissing a row marks it read, so
  // it leaves this view - the "items disappear when you act" contract.
  const [filter, setFilter] = useState<"all" | "unread">("unread");
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
  const unreadCount = items.filter((i) => !i.read).length;
  // Counts reflect the active read/unread scope so the chips track what's shown.
  const scoped = items.filter((i) => (filter === "unread" ? !i.read : true));
  const kindCounts = scoped.reduce<Partial<Record<InboxItem["kind"], number>>>(
    (acc, i) => ({ ...acc, [i.kind]: (acc[i.kind] ?? 0) + 1 }),
    {},
  );

  /** Mark an item read locally + on the server (best-effort) and ping the bell.
   *  In the default "open" view this removes it from the list. */
  const dismissLocally = (item: InboxItem) => {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, read: true } : i)));
    void api.inbox.markRead(item.id).then(notifyInboxChanged).catch(() => {});
  };

  const onItemClick = (item: InboxItem) => {
    // Optimistically clear it BEFORE navigating (the mark-read fetch is fired
    // first so it isn't cancelled by the route change), then deep-link.
    dismissLocally(item);
    const dest = item.task_id ? `/work/${item.task_id}` : item.to;
    if (dest) router.push(dest);
  };

  const onDismiss = (e: React.MouseEvent, item: InboxItem) => {
    e.preventDefault();
    e.stopPropagation();
    dismissLocally(item);
  };

  const onMarkAllRead = async () => {
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    try {
      await api.inbox.markAllRead();
    } catch { /* optimistic state stands; next refresh reconciles */ }
    // Re-sync the bell/sidebar to the true server count whether or not the
    // call succeeded (on failure they re-read and correct the optimism).
    notifyInboxChanged();
  };

  return (
    <Stack gap="6">
      <Cluster justify="between" align="center">
        <Stack gap="1">
          <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Things on you. Items leave the open list when you act on them or dismiss them.
          </p>
        </Stack>
        <Cluster gap="2">
          <Segmented
            options={
              [
                { value: "unread", label: `Open · ${unreadCount}` },
                { value: "all", label: `All · ${items.length}` },
              ] satisfies SegmentedOption<"unread" | "all">[]
            }
            value={filter}
            onChange={setFilter}
            ariaLabel="Inbox view"
          />
          <Button variant="outline" onClick={onMarkAllRead} disabled={unreadCount === 0}>
            <CheckCheck className="size-4" />
            Mark all read
          </Button>
        </Cluster>
      </Cluster>

      <Cluster gap="1.5" align="center" className="flex-wrap">
        <Eyebrow>Kind</Eyebrow>
        {KIND_FILTER_ORDER.map((k) => {
          const label = k === "all" ? "All kinds" : metaFor(k).label;
          const count = k === "all" ? scoped.length : (kindCounts[k] ?? 0);
          // Empty kinds stay hidden - except the active one, so a filter
          // whose queue just cleared can still be switched off.
          if (k !== "all" && k !== kindFilter && count === 0) return null;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setKindFilter(k)}
              aria-pressed={kindFilter === k}
              className={cn("rounded-full", focusRing)}
            >
              <Pill tone={kindFilter === k ? "primary" : "neutral"} size="md">
                {label}
                <span className="ml-1 tabular-nums opacity-70">{count}</span>
              </Pill>
            </button>
          );
        })}
      </Cluster>

      {error && (
        <div className="rounded-lg border border-[var(--border-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]">
          {error}
        </div>
      )}

      {loading ? (
        <Stack gap="2" aria-busy="true" aria-label="Loading inbox">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <Cluster gap="3" align="start">
                <Skeleton className="size-9 shrink-0 rounded-md" />
                <Stack gap="1.5" className="flex-1 min-w-0">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </Stack>
              </Cluster>
            </Card>
          ))}
        </Stack>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<InboxIcon className="size-7" />}
          title="Inbox zero"
          description={
            filter === "unread" && items.length > 0
              ? "You're all caught up. Switch to All to see what you've handled."
              : "You're caught up. New items appear here when Athena needs your attention."
          }
        />
      ) : (
        <Stack gap="2" as="ul">
          {filtered.map((item) => {
            // Readiness §5.28 row 1783 - the large-change admin-approval gate
            // surfaces as a dedicated card variant (cost + scope) and deep-links
            // into /work where the canonical stage gate handles approve /
            // request-changes; same routing + dismiss as the generic rows.
            if (isLargeChangeInboxItem(item)) {
              return (
                <li key={item.id} className="group relative">
                  <LargeChangeCard item={item} onOpen={() => onItemClick(item)} />
                  <DismissButton onClick={(e) => onDismiss(e, item)} />
                </li>
              );
            }
            const meta = metaFor(item.kind);
            const Icon = meta.icon;
            return (
              <li key={item.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onItemClick(item)}
                  aria-label={`${meta.label}: ${item.title}${item.read ? "" : " (unread)"}`}
                  className="block w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  <Card
                    className={cn(
                      "transition-[background-color,border-color,box-shadow] duration-200 ease-out group-hover:border-[var(--border-strong)] group-hover:bg-[var(--surface-2)] group-hover:shadow-[var(--shadow-2)]",
                      // Unread rows leak a sliver of accent light along the
                      // primary edge - state, not decoration.
                      !item.read &&
                        "border-l-2 border-l-[var(--primary)] shadow-[-6px_0_12px_-8px_var(--glow-accent)]",
                    )}
                  >
                    <Cluster justify="between" align="start">
                      <Cluster gap="3" align="start" className="flex-1 min-w-0">
                        <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--surface-2)] shadow-[var(--inner-highlight)] transition-colors duration-200 group-hover:bg-[var(--surface-3)]", meta.tone)}>
                          <Icon className="size-4" />
                        </div>
                        <Stack gap="1" className="flex-1 min-w-0">
                          <Cluster gap="2" align="center">
                            <Eyebrow>{meta.label}</Eyebrow>
                            {item.priority === "high" && (
                              <Pill tone="danger" size="sm">
                                High
                              </Pill>
                            )}
                          </Cluster>
                          <span className="text-sm font-medium text-[var(--text)]">{item.title}</span>
                          <span className="line-clamp-2 text-sm text-[var(--text-muted)]">{item.context}</span>
                          <span className="text-xs text-[var(--text-subtle)]">
                            {item.actor} · {formatDateTime(item.created_at)}{item.phase ? ` · ${item.phase}` : ""}
                          </span>
                        </Stack>
                      </Cluster>
                      <span className="inline-flex shrink-0 items-center gap-0.5 pr-6 text-xs font-medium text-[var(--primary)]">
                        {item.cta}
                        <span aria-hidden className="transition-transform duration-200 ease-out group-hover:translate-x-0.5">→</span>
                      </span>
                    </Cluster>
                  </Card>
                </button>
                <DismissButton onClick={(e) => onDismiss(e, item)} />
              </li>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}

/** The per-row dismiss affordance - a sibling of (not nested in) the card
 *  button so it stays valid HTML. Visible at rest below lg (touch has no
 *  hover to reveal it); hover/focus revealed on lg+. */
function DismissButton({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Dismiss notification"
      title="Dismiss"
      className={cn(
        "absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-md text-[var(--text-subtle)] transition-[opacity,color,background-color] hover:bg-[var(--surface-3)] hover:text-[var(--text)]",
        "opacity-100 focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100",
        focusRing,
      )}
    >
      <X className="size-3.5" />
    </button>
  );
}
