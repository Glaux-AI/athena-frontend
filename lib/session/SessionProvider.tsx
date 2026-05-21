"use client";

/**
 * SessionProvider — subscribes to Supabase auth changes and exposes the
 * session + currently-active Athena org via React Context.
 *
 * Active-org state is persisted in localStorage so a returning user lands
 * on the org they last viewed.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { getBrowserSupabase } from "@/lib/supabase/browser";

export interface MembershipLite {
  orgId: string;
  orgName: string;
  orgSlug: string;
  orgEdition: string;
  role: string;
  isOwner: boolean;
}

export interface MeLite {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  isEmployee: boolean;
  memberships: MembershipLite[];
}

interface SessionContextValue {
  status: "loading" | "anonymous" | "authenticated";
  session: Session | null;
  me: MeLite | null;
  activeOrgId: string | null;
  setActiveOrgId: (id: string) => void;
  refreshMe: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionContextValue | undefined>(undefined);

const ACTIVE_ORG_KEY = "athena.activeOrgId";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<MeLite | null>(null);
  const [status, setStatus] = useState<SessionContextValue["status"]>("loading");
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null);

  // Load active org from localStorage once on mount.
  useEffect(() => {
    if (typeof window !== "undefined") {
      setActiveOrgIdState(window.localStorage.getItem(ACTIVE_ORG_KEY));
    }
  }, []);

  const setActiveOrgId = useCallback((id: string) => {
    setActiveOrgIdState(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ACTIVE_ORG_KEY, id);
    }
  }, []);

  const refreshMe = useCallback(async () => {
    // Imported lazily so SessionProvider can be mounted before api/client.
    const { api } = await import("@/lib/api/client");
    try {
      const result = await api.me();
      const meLite: MeLite = {
        id: result.id,
        email: result.email,
        displayName: result.display_name,
        avatarUrl: result.avatar_url,
        isEmployee: result.is_employee,
        memberships: result.memberships.map((m) => ({
          orgId: m.org_id,
          orgName: m.org_name,
          orgSlug: m.org_slug,
          orgEdition: m.org_edition,
          role: m.role,
          isOwner: m.is_owner,
        })),
      };
      setMe(meLite);

      // Default active org: previously chosen, or the first membership.
      const stored = typeof window !== "undefined" ? window.localStorage.getItem(ACTIVE_ORG_KEY) : null;
      const stillValid = stored && meLite.memberships.some((m) => m.orgId === stored);
      const chosen = stillValid ? stored : meLite.memberships[0]?.orgId ?? null;
      if (chosen && chosen !== activeOrgId) setActiveOrgId(chosen);
    } catch {
      setMe(null);
    }
  }, [activeOrgId, setActiveOrgId]);

  // Subscribe to Supabase auth state changes.
  useEffect(() => {
    const supabase = getBrowserSupabase();

    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
      if (data.session) {
        setStatus("authenticated");
        await refreshMe();
      } else {
        setStatus("anonymous");
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (newSession) {
        setStatus("authenticated");
        void refreshMe();
      } else {
        setStatus("anonymous");
        setMe(null);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [refreshMe]);

  const signOut = useCallback(async () => {
    const supabase = getBrowserSupabase();
    await supabase.auth.signOut();
    setMe(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(ACTIVE_ORG_KEY);
    }
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ status, session, me, activeOrgId, setActiveOrgId, refreshMe, signOut }),
    [status, session, me, activeOrgId, setActiveOrgId, refreshMe, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionContextValue {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error("useSession must be used inside <SessionProvider>");
  }
  return v;
}
