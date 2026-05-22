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

import { config } from "@/lib/config";
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
const MOCK_SESSION_KEY = "athena.mockSession";

/** Shape persisted in localStorage when env=mock. Mirrors a Supabase Session
 * closely enough that consumers reading session.access_token / .user.email
 * work without changes. */
interface MockSessionEnvelope {
  access_token: string;
  refresh_token: string;
  expires_at: number; // seconds since epoch
  user: {
    id: string;
    email: string;
    user_metadata: { display_name: string };
  };
}

function readMockSession(): MockSessionEnvelope | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MOCK_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MockSessionEnvelope;
    if (parsed.expires_at * 1000 < Date.now()) {
      window.localStorage.removeItem(MOCK_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Persist a mock session created by /login or /signup so a refresh keeps you
 * authenticated. The shape is intentionally a Supabase-Session subset. */
export function writeMockSession(envelope: {
  access_token: string;
  refresh_token: string;
  user_id: string;
  email: string;
  display_name: string;
  expires_at: string;
}): void {
  if (typeof window === "undefined") return;
  const session: MockSessionEnvelope = {
    access_token: envelope.access_token,
    refresh_token: envelope.refresh_token,
    expires_at: Math.floor(new Date(envelope.expires_at).getTime() / 1000),
    user: {
      id: envelope.user_id,
      email: envelope.email,
      user_metadata: { display_name: envelope.display_name },
    },
  };
  window.localStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(new CustomEvent("athena:mock-session-changed"));
}

export function clearMockSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(MOCK_SESSION_KEY);
  window.localStorage.removeItem(ACTIVE_ORG_KEY);
  window.dispatchEvent(new CustomEvent("athena:mock-session-changed"));
}

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

  // Subscribe to auth state changes. In mock mode we read from localStorage
  // and listen for our own custom event; in live mode we delegate to Supabase.
  useEffect(() => {
    if (config.isMock) {
      let cancelled = false;
      const applyFromStorage = () => {
        const mockSession = readMockSession();
        if (cancelled) return;
        if (mockSession) {
          // Construct a Session-shaped object from the mock envelope. We only
          // populate the fields anything in this app reads (access_token,
          // user.email, user.user_metadata.display_name). Cast to Session.
          const fakeSession = {
            access_token: mockSession.access_token,
            refresh_token: mockSession.refresh_token,
            expires_at: mockSession.expires_at,
            expires_in: Math.max(0, mockSession.expires_at - Math.floor(Date.now() / 1000)),
            token_type: "bearer",
            user: {
              id: mockSession.user.id,
              email: mockSession.user.email,
              user_metadata: mockSession.user.user_metadata,
              app_metadata: {},
              aud: "athena",
              created_at: new Date().toISOString(),
              role: "authenticated",
            },
          } as unknown as Session;
          setSession(fakeSession);
          setStatus("authenticated");
          void refreshMe();
        } else {
          setSession(null);
          setMe(null);
          setStatus("anonymous");
        }
      };
      applyFromStorage();
      const onChange = () => applyFromStorage();
      window.addEventListener("athena:mock-session-changed", onChange);
      window.addEventListener("storage", onChange);
      return () => {
        cancelled = true;
        window.removeEventListener("athena:mock-session-changed", onChange);
        window.removeEventListener("storage", onChange);
      };
    }

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
    if (config.isMock) {
      const { api } = await import("@/lib/api/client");
      try { await api.mockAuth.signOut(); } catch { /* ignore */ }
      clearMockSession();
      setMe(null);
      setSession(null);
      setStatus("anonymous");
      return;
    }
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
