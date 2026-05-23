"use client";

/**
 * TopBar — Wordmark, org switcher, command palette, notifications, user menu.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, Command, ChevronDown, Plus, LogOut, Building2, Moon, Sun, Monitor, MessageCircle } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/layout/wordmark";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session/SessionProvider";
import { api } from "@/lib/api/client";
import { useChatDrawerStore } from "@/lib/stores/chat-drawer";
import { editionLabel, normalizeEdition } from "@/lib/utils/edition";

export function TopBar({ className }: { className?: string }) {
  return (
    <header
      className={cn(
        "flex h-14 w-full shrink-0 items-center justify-between gap-3 border-b px-4",
        "border-[var(--border)] bg-[var(--surface)]",
        "sticky top-0 z-30",
        className,
      )}
    >
      <div className="flex items-center gap-4">
        <Wordmark />
        <OrgSwitcher />
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          aria-label="Open command palette (⌘K)"
          className="text-[var(--text-muted)]"
          onClick={() => {
            // Dispatch the same key the palette listens for.
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
          }}
        >
          <Command className="size-4" />
          <span className="hidden sm:inline">Search</span>
          <kbd className="ml-1 hidden rounded border bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-subtle)] sm:inline">
            ⌘K
          </kbd>
        </Button>

        <InboxBell />

        <ChatIcon />

        <ThemeToggle />

        <UserMenu />
      </div>
    </header>
  );
}

function InboxBell() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const page = await api.inbox.list({ unread_only: true, limit: 50 });
        if (!cancelled) setCount(page.unread_count);
      } catch { /* ignore */ }
    };
    void tick();
    const id = setInterval(tick, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);
  return (
    <Link
      href="/inbox"
      aria-label={count > 0 ? `Inbox · ${count} unread` : "Inbox"}
      className="relative inline-flex size-8 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      <Bell className="size-4" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-semibold text-white">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}

function ChatIcon() {
  const open = useChatDrawerStore((s) => s.open);
  const toggle = useChatDrawerStore((s) => s.toggle);
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={open ? "Close chat" : "Open chat (⌘.)"}
      aria-pressed={open}
      title={open ? "Close chat (⌘.)" : "Open chat (⌘.)"}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        open
          ? "bg-[var(--primary-soft)] text-[var(--primary)]"
          : "text-[var(--text-muted)] hover:bg-[var(--surface-2)]",
      )}
    >
      <MessageCircle className="size-4" />
    </button>
  );
}

/** 3-mode theme cycle: system → light → dark → system. Default is system. */
function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Render a same-shape placeholder server-side to avoid layout shift after hydration.
  if (!mounted) {
    return <span aria-hidden className="inline-block size-8" />;
  }
  const current = theme ?? "system";
  const next = current === "system" ? "light" : current === "light" ? "dark" : "system";
  const label = current === "system" ? "System" : current === "light" ? "Light" : "Dark";
  const Icon  = current === "system" ? Monitor   : current === "light" ? Sun     : Moon;
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${label}. Click to switch to ${next}.`}
      title={`Theme: ${label} · click for ${next}`}
      className="inline-flex size-8 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      <Icon className="size-4" />
    </button>
  );
}

function OrgSwitcher() {
  const { me, activeOrgId, setActiveOrgId } = useSession();
  const [open, setOpen] = useState(false);

  if (!me) return null;
  const active = me.memberships.find((m) => m.orgId === activeOrgId) ?? me.memberships[0];
  if (!active) return null;

  // F-01.1 — normalise edition value before rendering. The wire shape on
  // `org_edition` is a free-form `string`, so we coerce legacy `team` /
  // `business` to `pro` and gate the label through `editionLabel()`.
  const activeEdition = normalizeEdition(active.orgEdition);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="hidden items-center gap-1.5 rounded-md px-2 py-1 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] md:inline-flex"
      >
        <span className="inline-flex size-5 items-center justify-center rounded bg-[var(--primary-soft)] text-[10px] font-semibold uppercase text-[var(--primary)]">
          {active.orgName.slice(0, 2)}
        </span>
        <span className="font-medium text-[var(--text)]">{active.orgName}</span>
        <span
          className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]"
          title={`Edition: ${editionLabel(activeEdition)}`}
        >
          {editionLabel(activeEdition)}
        </span>
        <ChevronDown className="size-3.5 text-[var(--text-subtle)]" />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-40 mt-1 w-[260px] rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg"
          onMouseLeave={() => setOpen(false)}
        >
          <div className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-[var(--text-subtle)]">
            Switch organization
          </div>
          <ul className="max-h-72 overflow-y-auto">
            {me.memberships.map((m) => (
              <li key={m.orgId}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveOrgId(m.orgId);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--surface-2)]",
                    m.orgId === activeOrgId ? "font-medium" : "",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Building2 className="size-3.5 text-[var(--text-subtle)]" />
                    <span className="truncate">{m.orgName}</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-[var(--text-subtle)]">
                    {/* F-01.1 — normalise legacy `team` / `business` values. */}
                    <span>{editionLabel(normalizeEdition(m.orgEdition))}</span>
                    <span aria-hidden>·</span>
                    <span>{m.role}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-1 border-t border-[var(--border)] pt-1">
            <Link
              href="/orgs/new"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
            >
              <Plus className="size-3.5" />
              Create organization
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { me, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const onSignOut = async () => {
    setOpen(false);
    await signOut();
    router.replace("/login");
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        aria-label="Open user menu"
      >
        {me?.avatarUrl ? (
          // Remote avatar URL — host comes from the user's OAuth provider
          // (GitHub, Google, etc.); whitelisting every host in
          // next.config.images.remotePatterns isn't tractable. Avatar is a
          // 28 px circle (not LCP-critical) so the native <img> is acceptable.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.avatarUrl} alt="" className="size-7 rounded-full" />
        ) : (
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-[var(--primary)] text-xs font-semibold text-[var(--primary-fg)]">
            {(me?.displayName || "?").slice(0, 1).toUpperCase()}
          </span>
        )}
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-40 mt-1 w-[220px] rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg"
          onMouseLeave={() => setOpen(false)}
        >
          {me && (
            <div className="px-2 py-1">
              <p className="text-sm font-medium">{me.displayName}</p>
              <p className="text-xs text-[var(--text-muted)]">{me.email}</p>
            </div>
          )}
          <div className="my-1 border-t border-[var(--border)]" />
          <Link
            href="/settings/profile"
            onClick={() => setOpen(false)}
            className="block rounded-md px-2 py-1.5 text-sm hover:bg-[var(--surface-2)]"
          >
            Profile
          </Link>
          <button
            type="button"
            onClick={onSignOut}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--danger)] hover:bg-[var(--danger-soft)]"
          >
            <LogOut className="size-3.5" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
