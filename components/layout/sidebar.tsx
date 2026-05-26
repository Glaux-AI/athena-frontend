"use client";

/**
 * Sidebar — grouped left nav, matching mock-v2's structure.
 *
 *  Overview:    Home, Inbox, Activity
 *  Work:        Tasks
 *  Knowledge:   Capabilities, Org knowledge, Blueprint approvals, Rules, Skills, MCP servers
 *  Operations:  Cost, Settings
 *
 * The active state matches both exact-href and prefix routes (so /runs/abc
 * keeps Tasks highlighted, /settings/sso keeps Settings highlighted, etc.).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Home,
  Inbox,
  Activity,
  SquareCheck,
  Layers,
  Network,
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
      { href: "/inbox",     label: "Inbox",    icon: Inbox,    badgeKey: "inbox" },
      { href: "/activity",  label: "Activity", icon: Activity },
    ],
  },
  {
    label: "Work",
    items: [
      { href: "/runs",      label: "Tasks", icon: SquareCheck, badgeKey: "tasks" },
    ],
  },
  {
    label: "Knowledge",
    items: [
      { href: "/capabilities",         label: "Capabilities",        icon: Layers },
      { href: "/knowledge",            label: "Org knowledge",       icon: Network },
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

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === "/dashboard") return false; // home shouldn't match every path
  return pathname.startsWith(`${href}/`);
}

export function SidebarNav() {
  const pathname = usePathname() || "/";
  const [counts, setCounts] = useState<{ inbox: number; tasks: number }>({ inbox: 0, tasks: 0 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [inbox, tasks] = await Promise.all([
          api.inbox.list({ unread_only: true, limit: 50 }).catch(() => ({ unread_count: 0 })),
          api.runs.list().catch(() => []),
        ]);
        if (!cancelled) {
          setCounts({
            inbox: "unread_count" in inbox ? inbox.unread_count : 0,
            tasks: Array.isArray(tasks) ? tasks.filter((t) => t.status === "running" || t.status === "queued").length : 0,
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
              const active = isActive(pathname, item.href);
              const count = item.badgeKey ? counts[item.badgeKey] : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm",
                    "transition-colors duration-150 ease-out",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                    active
                      ? "bg-[var(--primary-soft)] font-medium text-[var(--primary)]"
                      : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
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
