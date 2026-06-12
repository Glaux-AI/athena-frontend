"use client";

/**
 * TopBar — Wordmark, org switcher, command palette, notifications, user menu.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, ChevronDown, Plus, LogOut, Building2, Sparkles } from "lucide-react";

import { Wordmark } from "@/components/layout/wordmark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { SearchTrigger } from "@/components/topbar/search-trigger";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session/SessionProvider";
import { api } from "@/lib/api/client";
import { useActiveOrgTier, planLabel } from "@/lib/billing/use-active-org-tier";

export function TopBar({ className }: { className?: string }) {
  return (
    <header
      className={cn(
        "glass flex h-14 w-full shrink-0 items-center justify-between gap-3 px-4",
        "shadow-[var(--shadow-1)]",
        "sticky top-0 z-30",
        className,
      )}
    >
      <div className="flex items-center gap-4">
        <Wordmark />
        <OrgSwitcher />
        <DevModeBadge />
      </div>

      <div className="flex items-center gap-2">
        {/* Global ⌘K command palette — search / jump to anything across the
            app (see components/command/command-palette.tsx). Knowledge-graph
            search is a separate surface on the /knowledge page. */}
        <SearchTrigger />

        <InboxBell />

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
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-semibold text-[var(--danger-fg)]">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}

function OrgSwitcher() {
  const { me, activeOrgId, setActiveOrgId } = useSession();
  const [open, setOpen] = useState(false);
  // The REAL plan for the active org (free/solo/pro/enterprise). Null while
  // loading or unreadable — we omit the chip rather than show the legacy
  // `edition` field, which defaults to "pro" and lied about Free orgs.
  const tier = useActiveOrgTier();

  if (!me) return null;
  const active = me.memberships.find((m) => m.orgId === activeOrgId) ?? me.memberships[0];
  if (!active) return null;

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
        {active.deletedAt && (
          /* §5.31 — when the active org is soft-deleted, owners stay in
           * and see this pill (every non-owner is bounced by the BE +
           * the protected-layout effect). */
          <span
            className="rounded-full bg-[var(--warning-soft)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--warning-ink)]"
            title={`Deleted ${active.deletedAt}`}
          >
            Deleted
          </span>
        )}
        {tier && (
          <span
            className="rounded-full bg-[var(--primary-soft)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--primary)]"
            title={`Plan: ${planLabel(tier)}`}
          >
            {planLabel(tier)}
          </span>
        )}
        <ChevronDown className="size-3.5 text-[var(--text-subtle)]" />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-40 mt-1.5 w-[260px] rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-1 shadow-[var(--shadow-3)]"
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
                    setOpen(false);
                    if (m.orgId === activeOrgId) return;
                    /* Switching org is a context reset: persist the choice
                     * (setActiveOrgId writes localStorage synchronously, the
                     * API client reads it per request) and land on the home
                     * page via a full document navigation. The hard reload is
                     * deliberate — it drops every in-memory cache (chat
                     * threads, stats, drafts) so nothing from the previous
                     * org can bleed into the new one, and it avoids stranding
                     * the user on an org-scoped route that may not exist in
                     * the org they switched to. */
                    setActiveOrgId(m.orgId);
                    window.location.assign("/dashboard");
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--surface-2)]",
                    m.orgId === activeOrgId ? "font-medium" : "",
                    m.deletedAt ? "opacity-75" : "",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Building2 className="size-3.5 text-[var(--text-subtle)]" />
                    <span className={cn("truncate", m.deletedAt && "line-through decoration-[var(--warning)]")}>
                      {m.orgName}
                    </span>
                    {m.deletedAt && (
                      <span
                        className="rounded-full bg-[var(--warning-soft)] px-1 py-0 text-[8px] font-semibold uppercase tracking-wider text-[var(--warning-ink)]"
                        title={`Soft-deleted ${m.deletedAt}`}
                      >
                        Deleted
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-[var(--text-subtle)] capitalize">
                    {/* Per-org plan isn't fetched here (one call per org would
                        be wasteful); the active org's plan shows in the chip
                        above. The switcher row carries the member's role. */}
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
          className="absolute right-0 top-full z-40 mt-1.5 w-[220px] rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-1 shadow-[var(--shadow-3)]"
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

/**
 * §5.29.2 — "Free dev access" chip rendered next to the OrgSwitcher whenever
 * the BE reports `dev_unrestricted_access=true` on `/v1/me`. Clicking it
 * opens a popover that mirrors the LOCAL_DEV.md "What you get in dev mode"
 * matrix so a brand-new contributor never has to grep through docs to
 * understand which surfaces are bypassed.
 *
 * Hidden entirely (no DOM, no badge, no flash) when the flag is false /
 * the session is still loading — production users must never see it.
 */
function DevModeBadge() {
  const { me } = useSession();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Close on outside click + Escape so the chip behaves like any other
  // shadcn-style popover. Listener only registered while the pop is open.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!me?.devUnrestrictedAccess) return null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Dev mode is on — click for details"
        title="Dev mode: free access, real cost still tracked. Click for details."
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
          "border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
          "hover:bg-[var(--warning)] hover:text-[var(--warning-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        )}
      >
        <Sparkles className="size-3" />
        Free dev access
      </button>
      {open && (
        <div
          ref={popRef}
          role="dialog"
          aria-label="Dev mode details"
          className="glass absolute left-0 top-full z-40 mt-1.5 w-[360px] rounded-xl p-3 shadow-[var(--shadow-3)]"
        >
          <p className="text-sm font-semibold">Dev mode is on</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Every feature is unlocked. Cost is measured (see <Link href="/cost" className="underline">Cost</Link>) but
            never billed. Flip <code className="font-mono">ATHENA_DEV_UNRESTRICTED_ACCESS=false</code> in your env to
            switch to production semantics.
          </p>
          <table className="mt-3 w-full text-xs">
            <thead>
              <tr className="text-[var(--text-subtle)]">
                <th className="py-1 text-left font-medium">Behaviour</th>
                <th className="py-1 text-right font-medium">In dev mode</th>
              </tr>
            </thead>
            <tbody className="text-[var(--text-muted)]">
              <DevRow label="Sign in via GitHub" dev="Yes" />
              <DevRow label="Connect own repos via OAuth" dev="Yes" />
              <DevRow label="Ingest, KG, chat" dev="Yes" />
              <DevRow label="Cost tracked + displayed" dev="Yes" />
              <DevRow label="Budget enforcement" dev="Bypassed (warn only)" />
              <DevRow label="Stripe billing" dev="Synthetic subscription" />
              <DevRow label="New org default edition" dev="Enterprise" />
              <DevRow label="Boot fail-fast on missing config" dev="Downgraded to warning" />
            </tbody>
          </table>
          <p className="mt-3 text-[10px] text-[var(--text-subtle)]">
            Sourced from <code className="font-mono">LOCAL_DEV.md</code> §What you get in dev mode.
          </p>
        </div>
      )}
    </div>
  );
}

function DevRow({ label, dev }: { label: string; dev: string }) {
  return (
    <tr className="border-t border-[var(--border)]">
      <td className="py-1">{label}</td>
      <td className="py-1 text-right font-medium text-[var(--text)]">{dev}</td>
    </tr>
  );
}
