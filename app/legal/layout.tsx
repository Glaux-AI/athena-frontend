import Link from "next/link";

import { Pill } from "@/components/ui/pill";
import { focusRing } from "@/components/ui/focus";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/cn";

/**
 * Public legal layout (§9.7) - terms / privacy / subprocessors.
 * Unauthenticated, minimal glass chrome: wordmark home link + theme toggle +
 * sign-in. The signup + login consent copy links here, and the in-app
 * consent gate opens these pages in a new tab.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <header className="glass-chrome sticky top-0 z-[var(--z-chrome)]">
        <div className="mx-auto flex max-w-[860px] items-center justify-between px-4 py-3">
          <Link href="/" className={cn("flex items-center gap-2 rounded-md", focusRing)}>
            <span className="text-base font-bold tracking-tight">Athena</span>
            <Pill tone="primary" size="sm">Legal</Pill>
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
      <main className="mx-auto max-w-[860px] px-4 py-10">{children}</main>
      <footer className="mx-auto max-w-[860px] px-4 pb-10 text-xs text-[var(--text-subtle)]">
        <nav className="flex gap-4">
          <Link href="/legal/terms" className="hover:text-[var(--text)]">Terms of Service</Link>
          <Link href="/legal/privacy" className="hover:text-[var(--text)]">Privacy Policy</Link>
          <Link href="/legal/subprocessors" className="hover:text-[var(--text)]">Sub-processors</Link>
        </nav>
      </footer>
    </div>
  );
}
