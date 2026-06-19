"use client";

/**
 * Mobile navigation - the collapsible counterpart to the fixed desktop
 * sidebar. Below the `lg` breakpoint the 240px aside is hidden (see
 * `AppShell`) and replaced by an off-canvas drawer toggled from a hamburger
 * button in the TopBar.
 *
 * The trigger (TopBar) and the drawer (shell body) are rendered in different
 * parts of the tree, so the open/closed state lives in a small context that
 * `MobileNavProvider` puts around the whole shell.
 *
 * The drawer reuses the very same `<SidebarNav />` the desktop aside renders;
 * tapping any nav link changes the route, and the `usePathname` effect below
 * closes the drawer. Escape, the backdrop, and the close button also dismiss
 * it. Body scroll is locked while it is open. All of this is `lg:hidden` - the
 * desktop layout never mounts the overlay.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { SidebarNav } from "@/components/layout/sidebar";
import { Wordmark } from "@/components/layout/wordmark";
import { cn } from "@/lib/cn";

interface MobileNavState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const MobileNavContext = createContext<MobileNavState | null>(null);

function useMobileNav(): MobileNavState {
  const ctx = useContext(MobileNavContext);
  if (!ctx)
    throw new Error("useMobileNav must be used within <MobileNavProvider>");
  return ctx;
}

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on route change - tapping a nav link (or any in-app navigation)
  // should dismiss the overlay.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape to close + body scroll lock while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <MobileNavContext.Provider value={{ open, setOpen }}>
      {children}
    </MobileNavContext.Provider>
  );
}

/**
 * Hamburger button - lives at the left of the TopBar and is shown only below
 * `lg`, where the desktop sidebar is hidden.
 */
export function MobileNavTrigger() {
  const { open, setOpen } = useMobileNav();
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Open navigation menu"
      aria-haspopup="dialog"
      aria-expanded={open}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] lg:hidden"
    >
      <Menu className="size-5" />
    </button>
  );
}

/**
 * Off-canvas drawer. Always in the DOM (so the slide transition can run) but
 * pointer-inert and `aria-hidden` while closed, and `lg:hidden` so it never
 * exists on desktop.
 */
export function MobileSidebar() {
  const { open, setOpen } = useMobileNav();
  return (
    <div
      className={cn("lg:hidden", !open && "pointer-events-none")}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-[var(--overlay)] transition-opacity duration-200 ease-out",
          open ? "opacity-100" : "opacity-0",
        )}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(84vw,288px)] flex-col border-r border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-3)]",
          "transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-3">
          <Wordmark />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation menu"
            className="inline-flex size-9 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SidebarNav />
        </div>
      </div>
    </div>
  );
}
