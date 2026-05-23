"use client";

/**
 * Protected layout — wraps every authenticated route in the AppShell.
 *
 * Client-side guard for now: while the session is resolving we render an
 * AppShell-shaped skeleton (per CLAUDE.md "skeleton not spinner"); on
 * anonymous we replace to /login. The Phase 5.7 follow-up adds a Server
 * Component variant that pre-renders for the authed user and reads
 * `cookies()` directly so even this skeleton flash goes away.
 */

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { useSession } from "@/lib/session/SessionProvider";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useSession();

  useEffect(() => {
    if (status === "anonymous") {
      const returnTo = encodeURIComponent(pathname || "/dashboard");
      router.replace(`/login?returnTo=${returnTo}`);
    }
  }, [status, router, pathname]);

  if (status !== "authenticated") {
    return <AppShellSkeleton />;
  }

  return <AppShell>{children}</AppShell>;
}

/**
 * Shell-shaped placeholder rendered before the session resolves.
 * Mirrors AppShell's outer layout (TopBar + 240px sidebar + main) without
 * importing the real shell, whose TopBar / SidebarNav both consume the
 * session and would fault during this state.
 */
function AppShellSkeleton() {
  return (
    <div
      className="flex h-screen w-full flex-col overflow-hidden bg-[var(--bg)]"
      aria-busy="true"
      aria-label="Loading workspace"
    >
      <header className="sticky top-0 z-30 flex h-14 w-full shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4">
        <div className="h-6 w-28 animate-pulse rounded-md bg-[var(--surface-2)]" />
        <div className="h-7 w-44 animate-pulse rounded-md bg-[var(--surface-2)]" />
        <div className="ml-auto flex items-center gap-2">
          <div className="h-7 w-32 animate-pulse rounded-md bg-[var(--surface-2)]" />
          <div className="size-7 animate-pulse rounded-full bg-[var(--surface-2)]" />
          <div className="size-7 animate-pulse rounded-full bg-[var(--surface-2)]" />
        </div>
      </header>

      <div className="flex w-full min-h-0 flex-1">
        <aside
          className="shrink-0 border-r border-[var(--border)] bg-[var(--surface)]"
          style={{ width: "240px" }}
        >
          <div className="flex flex-col gap-2 p-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-7 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
            ))}
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-auto bg-[var(--bg)]">
          <div className="mx-auto w-full max-w-screen-2xl px-6 py-8 lg:px-8">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-1">
                <div className="h-7 w-48 animate-pulse rounded-md bg-[var(--surface-2)]" />
                <div className="h-4 w-72 animate-pulse rounded-md bg-[var(--surface-2)]" />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="h-24 animate-pulse rounded-md bg-[var(--surface-2)]" />
                <div className="h-24 animate-pulse rounded-md bg-[var(--surface-2)]" />
                <div className="h-24 animate-pulse rounded-md bg-[var(--surface-2)]" />
              </div>
              <div className="h-48 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
