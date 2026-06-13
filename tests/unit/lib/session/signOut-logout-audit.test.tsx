// @vitest-environment jsdom

/**
 * P2 #3 - `SessionProvider.signOut()` audit-emission ordering.
 *
 * Audit follow-up: the live-mode `signOut` calls `/v1/auth/logout` to
 * write a `auth.logout` audit row BEFORE clearing the Supabase
 * session. Order matters - once `supabase.auth.signOut()` runs, the
 * access token is gone and the BE can't authenticate the audit-write
 * call. The mock-mode path covers the same ordering via `mockAuth`,
 * but the live path was uncovered.
 *
 * This file pins three invariants:
 *   1. live: `api.auth.logout()` is awaited BEFORE
 *      `supabase.auth.signOut()` runs.
 *   2. live + network-down: an `api.auth.logout()` throw must NOT
 *      block the Supabase sign-out (the user has chosen to leave; an
 *      unkillable session is worse than a missing audit row).
 *   3. mock: `api.mockAuth.signOut()` is called and the audit endpoint
 *      `api.auth.logout()` is NOT (mock mode owns its own audit path).
 *
 * Pattern: mock `@/lib/supabase/browser` + `@/lib/api/client` so we
 * exercise the SessionProvider closure without any network. The
 * provider is rendered around a tiny consumer that publishes the
 * `signOut` callback through a ref so the test can `await` it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Spy targets for the two paths under test. Declared up-front so the
// dynamic-import inside `SessionProvider.signOut` resolves them.
const logoutMock = vi.fn();
const mockAuthSignOutMock = vi.fn();
const supabaseSignOutMock = vi.fn();
const supabaseGetSessionMock = vi.fn();
const supabaseOnAuthStateChangeMock = vi.fn();

// Module-level flag flipped per-test before any `import("@/lib/api/client")`
// resolves. The provider's `signOut` branches on `config.isMock`, so we
// override the config module first.
let mockMode = false;

vi.mock("@/lib/config", () => ({
  config: {
    get isMock() {
      return mockMode;
    },
    apiMode: "live" as "live" | "mock",
    apiUrl: "http://localhost:8000",
    appName: "Athena",
    isProd: false,
    enterpriseSsoEnabled: false,
    supabase: {
      url: "",
      anonKey: "",
      isConfigured: () => true,
    },
  },
}));

vi.mock("@/lib/supabase/browser", () => ({
  getBrowserSupabase: () => ({
    auth: {
      getSession: () => supabaseGetSessionMock(),
      onAuthStateChange: () => supabaseOnAuthStateChangeMock(),
      signOut: () => supabaseSignOutMock(),
    },
  }),
}));

// `SessionProvider.signOut` does a dynamic `import("@/lib/api/client")`,
// so we mock the module - both `api.auth.logout` and `api.mockAuth.signOut`
// route to the spies. The rest of the surface isn't exercised by signOut
// but is referenced elsewhere in the module load chain, so we provide
// thin stubs.
vi.mock("@/lib/api/client", () => ({
  api: {
    me: vi.fn(),
    auth: {
      sync: vi.fn(),
      logout: () => logoutMock(),
    },
    mockAuth: {
      signOut: () => mockAuthSignOutMock(),
      signIn: vi.fn(),
      signUp: vi.fn(),
    },
  },
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

import { SessionProvider, useSession } from "@/lib/session/SessionProvider";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Render `<SessionProvider>` around a consumer that publishes the
 * `signOut` callback into a ref so the test can call it imperatively.
 *
 * Returns the ref handle. By the time `render` resolves the consumer's
 * `useEffect` has run and the ref is populated.
 */
function renderAndCaptureSignOut(): { current: (() => Promise<void>) | null } {
  const ref: { current: (() => Promise<void>) | null } = { current: null };

  function Consumer(): null {
    const { signOut } = useSession();
    // Capture once on mount so identity churn through React's effect
    // chain doesn't drop the reference between render + the test's
    // imperative call.
    const stableRef = useRef(signOut);
    stableRef.current = signOut;
    useEffect(() => {
      ref.current = () => stableRef.current();
    }, []);
    return null;
  }

  render(
    <SessionProvider>
      <Consumer />
    </SessionProvider>,
  );
  return ref;
}

// The provider's mount effect calls supabase.auth.getSession() in live
// mode. Give it a benign reply so the provider settles into the
// "anonymous" branch without throwing.
function emptySessionReply() {
  return Promise.resolve({ data: { session: null }, error: null });
}

function noopSubscription() {
  return { data: { subscription: { unsubscribe: () => {} } } };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SessionProvider.signOut - audit/logout ordering", () => {
  beforeEach(() => {
    logoutMock.mockReset();
    mockAuthSignOutMock.mockReset();
    supabaseSignOutMock.mockReset();
    supabaseGetSessionMock.mockReset();
    supabaseOnAuthStateChangeMock.mockReset();
    supabaseGetSessionMock.mockImplementation(emptySessionReply);
    supabaseOnAuthStateChangeMock.mockImplementation(noopSubscription);
    supabaseSignOutMock.mockResolvedValue({ error: null });
    logoutMock.mockResolvedValue({ accepted: true });
    mockAuthSignOutMock.mockResolvedValue({ accepted: true });
    mockMode = false;
  });

  afterEach(() => {
    cleanup();
  });

  it("live mode: calls /v1/auth/logout BEFORE supabase.auth.signOut", async () => {
    // Sequence captures the actual call ordering - pushes happen in the
    // order the awaited promises resolve.
    const sequence: string[] = [];
    logoutMock.mockImplementation(async () => {
      sequence.push("api.auth.logout");
      return { accepted: true };
    });
    supabaseSignOutMock.mockImplementation(async () => {
      sequence.push("supabase.auth.signOut");
      return { error: null };
    });

    const ref = renderAndCaptureSignOut();
    expect(ref.current).not.toBeNull();
    await act(async () => {
      await ref.current!();
    });

    expect(sequence).toEqual(["api.auth.logout", "supabase.auth.signOut"]);
    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(supabaseSignOutMock).toHaveBeenCalledTimes(1);
    // Mock-mode endpoint must NOT be hit in live mode.
    expect(mockAuthSignOutMock).not.toHaveBeenCalled();
  });

  it("live mode: api.auth.logout throwing still completes supabase.auth.signOut", async () => {
    // Network down or 4xx on the BE - the user has clicked sign-out;
    // we must not strand them in a half-signed-out state.
    logoutMock.mockRejectedValue(new Error("network down"));

    const ref = renderAndCaptureSignOut();
    await act(async () => {
      await ref.current!();
    });

    // Audit attempt was made.
    expect(logoutMock).toHaveBeenCalledTimes(1);
    // Supabase sign-out still ran - the catch-and-continue worked.
    expect(supabaseSignOutMock).toHaveBeenCalledTimes(1);
  });

  it("mock mode: api.mockAuth.signOut is called; api.auth.logout is NOT", async () => {
    // Flip the global config flag BEFORE rendering so the provider's
    // `signOut` closure picks up `config.isMock === true`.
    mockMode = true;

    const ref = renderAndCaptureSignOut();
    await act(async () => {
      await ref.current!();
    });

    expect(mockAuthSignOutMock).toHaveBeenCalledTimes(1);
    // The live-mode endpoints are unused in mock mode - the BE doesn't
    // exist to audit against.
    expect(logoutMock).not.toHaveBeenCalled();
    expect(supabaseSignOutMock).not.toHaveBeenCalled();
  });
});
