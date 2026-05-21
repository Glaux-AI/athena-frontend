"use client";

/**
 * Protected layout — wraps every authenticated route in the AppShell.
 *
 * Client-side guard for now: while the session is loading we render a
 * spinner; on anonymous we replace to /login. The Phase 5.7 follow-up
 * adds a Server Component variant that pre-renders for the authed user
 * and reads `cookies()` directly so the spinner flash goes away.
 */

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Center } from "@/components/layout/primitives";
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
    return (
      <Center as="main">
        <Loader2 className="size-6 animate-spin text-[var(--primary)]" />
      </Center>
    );
  }

  return <AppShell>{children}</AppShell>;
}
