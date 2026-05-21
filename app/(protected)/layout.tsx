/**
 * Protected layout — wraps every authenticated route in the AppShell.
 * In production, this is an async server component that fetches `/v1/me` and
 * redirects to /login on 401.
 */

import { AppShell } from "@/components/layout/app-shell";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
