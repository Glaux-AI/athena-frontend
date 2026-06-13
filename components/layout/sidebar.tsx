"use client";

/**
 * Sidebar - grouped left nav, matching mock-v2's structure.
 *
 *  Overview:    Home, Inbox, Activity
 *  Work:        Tasks
 *  Knowledge:   Domains, Org knowledge, Blueprint approvals, Rules, Skills, MCP servers
 *  Operations:  Cost, Settings
 *
 * The active state matches both exact-href and prefix routes (so /runs/abc
 * keeps Tasks highlighted, /settings/sso keeps Settings highlighted, etc.).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Home,
  Inbox,
  Activity,
  MessageCircle,
  SquareCheck,
  Layers,
  Network,
  Waypoints,
  Zap,
  Plug,
  CircleDollarSign,
  Settings,
  FileCheck2,
  Gavel,
  type LucideIcon,
} from "lucide-react";

import { api } from "@/lib/api/client";
import { cn } from "@/lib/cn";

interface NavItem { href: string; label: string; icon: LucideIcon; badgeKey?: "inbox" | "tasks" }
interface NavSection { label: string; items: NavItem[] }

const NAV: NavSection[] = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Home",     icon: Home },
      { href: "/chat",      label: "Chat",     icon: MessageCircle },
      { href: "/inbox",     label: "Inbox",    icon: Inbox,    badgeKey: "inbox" },
      { href: "/activity",  label: "Activity", icon: Activity },
    ],
  },
  {
    label: "Work",
    items: [
      { href: "/work",      label: "Tasks", icon: SquareCheck, badgeKey: "tasks" },
    ],
  },
  {
    label: "Knowledge",
    items: [
      { href: "/domains",         label: "Domains",        icon: Layers },
      { href: "/knowledge",            label: "Org knowledge",       icon: Network },
      { href: "/knowledge/graph",      label: "Knowledge graph",     icon: Waypoints },
      { href: "/blueprint-proposals",  label: "Blueprint approvals", icon: FileCheck2 },
      { href: "/rules",                label: "Rules",               icon: Gavel },
      { href: "/skills",               label: "Skills",              icon: Zap },
      { href: "/mcp",                  label: "MCP servers",         icon: Plug },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/cost",     label: "Cost",     icon: CircleDollarSign },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

/** How well `href` matches `pathname` (longer = more specific). -1 = no
 *  match. Prefix matches count so /runs/abc keeps Tasks active, but the
 *  longest match wins so /knowledge/graph activates its own item, not the
 *  /knowledge parent. */
function matchLen(pathname: string, href: string): number {
  if (href === "/dashboard") return pathname === href ? href.length : -1; // home shouldn't match every path
  if (pathname === href) return href.length;
  if (pathname.startsWith(`${href}/`)) return href.length;
  return -1;
}

export function SidebarNav() {
  const pathname = usePathname() || "/";
  const [counts, setCounts] = useState<{ inbox: number; tasks: number }>({ inbox: 0, tasks: 0 });

  const activeHref = useMemo(() => {
    let best = "";
    let bestLen = 0;
    for (const section of NAV) {
      for (const item of section.items) {
        const len = matchLen(pathname, item.href);
        if (len > bestLen) { bestLen = len; best = item.href; }
      }
    }
    return best;
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [inbox, tasks] = await Promise.all([
          api.inbox.list({ unread_only: true, limit: 50 }).catch(() => ({ unread_count: 0 })),
          api.tasks.list().catch(() => []),
        ]);
        if (!cancelled) {
          setCounts({
            inbox: "unread_count" in inbox ? inbox.unread_count : 0,
            tasks: Array.isArray(tasks) ? tasks.filter((t) => t.status === "in_progress" || t.status === "in_review").length : 0,
          });
        }
      } catch { /* swallow */ }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <nav aria-label="Main navigation" className="flex h-full flex-col gap-4 px-2 py-3">
      {NAV.map((section) => (
        <div key={section.label}>
          <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            {section.label}
          </div>
          <div className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = item.href === activeHref && activeHref !== "";
              const count = item.badgeKey ? counts[item.badgeKey] : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm",
                    "transition-[color,background-color,box-shadow] duration-150 ease-out",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                    active
                      ? "border border-[var(--border)] bg-[var(--primary-soft)] font-medium text-[var(--primary)] shadow-[var(--inner-highlight)]"
                      : "border border-transparent text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {count > 0 && (
                    <span
                      className={cn(
                        "min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold",
                        active
                          ? "bg-[var(--primary)] text-[var(--primary-fg)]"
                          : "bg-[var(--surface-2)] text-[var(--text-muted)] group-hover:bg-[var(--surface-3)]",
                      )}
                    >
                      {count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
