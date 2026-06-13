/**
 * Protected layout - Server Component cookie gate (§5.7.1).
 *
 * Live mode reads the Supabase auth cookie via `@supabase/ssr` and
 * redirects anonymous users **server-side**, so the authenticated path
 * pre-renders `<AppShell>` directly with no shell-skeleton flash on
 * first paint. The §5.31 soft-deleted-org bounce stays client-side
 * (it depends on the `me` payload that `SessionProvider` loads after
 * the cookie auth resolves) and is wired via `<ProtectedClientGuard />`.
 *
 * Mock mode keeps its session in `localStorage`, which the server can't
 * read, so we fall back to the original client-side guard +
 * AppShell-shaped skeleton. Branching on `config.isMock` here keeps
 * one entry point for both modes.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { config } from "@/lib/config";
import { getServerSupabase } from "@/lib/supabase/server";

import { ProtectedClientGuard } from "./protected-client-guard";
import { ProtectedClientLayout } from "./protected-client-layout";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  if (config.isMock) {
    return <ProtectedClientLayout>{children}</ProtectedClientLayout>;
  }

  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    const hdrs = await headers();
    const pathname = hdrs.get("x-pathname") ?? "/dashboard";
    const returnTo = encodeURIComponent(pathname);
    redirect(`/login?returnTo=${returnTo}`);
  }

  return (
    <AppShell>
      <ProtectedClientGuard />
      {children}
    </AppShell>
  );
}
