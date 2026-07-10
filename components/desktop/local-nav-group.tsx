"use client";

// The desktop-only "Local" sidebar group: Workspaces, Terminal, Activity. Rendered only inside
// the Electron shell (window.athena present) and only after mount, so the server-rendered web
// markup (where the bridge is absent) and the first client paint agree - no hydration mismatch.
//
// Workspaces + Activity are real routes; Terminal toggles the bottom dock (it has no page of its
// own - the dock overlays whatever surface you are on, like an IDE panel).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity as ActivityIcon, FolderGit2, Terminal as TerminalIcon } from "lucide-react";

import { cn } from "@/lib/cn";
import { isDesktop } from "@/lib/desktop/bridge";
import { useDesktopDock } from "@/components/desktop/dock-context";

const ITEM = cn(
  "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm w-full",
  "transition-[color,background-color,box-shadow] duration-150 ease-out",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
);
const ITEM_IDLE =
  "border border-transparent text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]";
const ITEM_ACTIVE =
  "border border-[var(--border)] bg-[var(--primary-soft)] font-medium text-[var(--primary)] shadow-[var(--inner-highlight)]";

export function LocalNavGroup() {
  const pathname = usePathname() || "/";
  const [mounted, setMounted] = useState(false);
  const { toggle, visible } = useDesktopDock();

  useEffect(() => setMounted(true), []);
  if (!mounted || !isDesktop) return null;

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div>
      <div className="px-2.5 pb-1 text-micro font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
        Local
      </div>
      <div className="flex flex-col gap-0.5">
        <Link
          href="/local/workspaces"
          aria-current={isActive("/local/workspaces") ? "page" : undefined}
          className={cn(ITEM, isActive("/local/workspaces") ? ITEM_ACTIVE : ITEM_IDLE)}
        >
          <FolderGit2 className="size-4 shrink-0" />
          <span className="flex-1 truncate">Workspaces</span>
        </Link>

        <button
          type="button"
          onClick={toggle}
          aria-pressed={visible}
          className={cn(ITEM, visible ? ITEM_ACTIVE : ITEM_IDLE)}
        >
          <TerminalIcon className="size-4 shrink-0" />
          <span className="flex-1 truncate text-left">Terminal</span>
          <kbd className="rounded bg-[var(--surface-3)] px-1 text-micro text-[var(--text-subtle)]">
            Ctrl+`
          </kbd>
        </button>

        <Link
          href="/local/activity"
          aria-current={isActive("/local/activity") ? "page" : undefined}
          className={cn(ITEM, isActive("/local/activity") ? ITEM_ACTIVE : ITEM_IDLE)}
        >
          <ActivityIcon className="size-4 shrink-0" />
          <span className="flex-1 truncate">Activity</span>
        </Link>
      </div>
    </div>
  );
}
