import Link from "next/link";

import { ThemeToggle } from "@/components/theme/theme-toggle";

/**
 * Public legal layout (§9.7) - terms / privacy / subprocessors.
 * Unauthenticated, minimal chrome: wordmark home link + theme toggle +
 * sign-in. The signup + login consent copy links here, and the in-app
 * consent gate opens these pages in a new tab.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <header className="sticky top-0 z-30 border-b border-[var(--border-soft)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-[860px] items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-base font-bold tracking-tight">Athena</span>
            <span className="rounded-full bg-[var(--primary-soft)] px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-[var(--primary)]">
              Legal
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
