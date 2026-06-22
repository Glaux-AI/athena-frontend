"use client";

// Wraps a /local/* route: renders its desktop surface only inside the Electron shell, and an
// honest "desktop only" explainer on the web (where window.athena is absent). Mount-guarded so
// the server markup and first client paint agree. Provides the active org id to the surface.

import { Laptop } from "lucide-react";

import { useDesktop } from "@/lib/desktop/use-desktop";

export function LocalGate({ children }: { children: (orgId: string | null) => React.ReactNode }) {
  const { isDesktop, orgId, ready } = useDesktop();

  if (!ready) {
    return (
      <div aria-hidden="true" className="mx-auto max-w-3xl">
        <div className="h-5 w-2/5 rounded bg-[var(--surface-2)]" />
        <div className="mt-4 h-24 rounded-lg bg-[var(--surface-2)]" />
      </div>
    );
  }

  if (!isDesktop) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center">
        <Laptop className="mx-auto mb-3 size-7 text-[var(--text-muted)]" />
        <p className="text-base font-medium text-[var(--text)]">Available in the desktop app</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--text-muted)]">
          Workspaces, the integrated terminal, and local activity run on your machine, so they only
          appear in the Athena desktop app. Open Athena on your computer to use them.
        </p>
      </div>
    );
  }

  return <>{children(orgId)}</>;
}
