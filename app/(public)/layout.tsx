import Link from "next/link";

import { PublicChatLauncher } from "@/components/public-chat/public-chat-launcher";
import { Pill } from "@/components/ui/pill";
import { focusRing } from "@/components/ui/focus";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/cn";

/**
 * Public (unauthenticated) layout for the knowledge showcase (ADR-093).
 * Sits OUTSIDE the (protected) auth gate - no SessionProvider redirect, no
 * AppShell. Just a minimal glass top bar over the page.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <header className="glass-chrome sticky top-0 z-[var(--z-chrome)]">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-3 lg:px-8">
          <Link href="/showcase" className={cn("flex items-center gap-2 rounded-md", focusRing)}>
            <span className="text-base font-bold tracking-tight">Athena</span>
            <Pill tone="primary" size="sm">Knowledge</Pill>
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle className="rounded-full hover:bg-[var(--surface-2)]" />
            <Link
              href="/login"
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-2)]",
                focusRing,
              )}
            >
              Sign in
            </Link>
          </div>
        </div>
        <hr className="hr-horizon" aria-hidden />
      </header>
      {children}
      <PublicChatLauncher />
    </div>
  );
}
