"use client";

// Small client hooks shared by the desktop-only surfaces.
//
// `useDesktop()` reports whether the Electron bridge is present (so the web build can hide
// every local surface) and resolves the active org id from main's AuthService. The org id is
// what partitions the local audit log and binds new workspaces; main populates it from the
// loaded FE's session (no FE auth push needed).

import { useEffect, useState } from "react";

import { athena, isDesktop } from "@/lib/desktop/bridge";

export interface DesktopState {
  /** True inside the Electron shell. False on the web (Vercel) build. */
  isDesktop: boolean;
  /** The active org id main is bound to, or null (loading / signed out / web). */
  orgId: string | null;
  /** False until the first auth.status() resolves (desktop only). */
  ready: boolean;
}

export function useDesktop(): DesktopState {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [ready, setReady] = useState<boolean>(!isDesktop);

  useEffect(() => {
    if (!isDesktop) return;
    let alive = true;
    const sync = async (): Promise<void> => {
      try {
        const status = await athena.auth.status();
        if (alive) setOrgId(status.orgId);
      } catch {
        if (alive) setOrgId(null);
      } finally {
        if (alive) setReady(true);
      }
    };
    void sync();
    // The active org can change (org switch hard-reloads, but be defensive); re-poll lightly.
    const t = setInterval(() => void sync(), 10_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return { isDesktop, orgId, ready };
}
