import Link from "next/link";

import { PublicChatLauncher } from "@/components/public-chat/public-chat-launcher";
import { ThemeToggle } from "@/components/theme/theme-toggle";

/**
 * Public (unauthenticated) layout for the knowledge showcase (ADR-093).
 * Sits OUTSIDE the (protected) auth gate - no SessionProvider redirect, no
 * AppShell. Just a minimal top bar over the page.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <header className="sticky top-0 z-30 border-b border-[var(--border-soft)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-3 lg:px-8">
          <Link href="/showcase" className="flex items-center gap-2">
            <span className="text-base font-bold tracking-tight">Athena</span>
            <span className="rounded-full bg-[var(--primary-soft)] px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-[var(--primary)]">
              Knowledge
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle className="rounded-full hover:bg-[var(--surface-2)]" />
            <Link
              href="/login"
              className="rounded-full px-3 py-1.5 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-2)]"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>
      {children}
      <PublicChatLauncher />
    </div>
  );
}
