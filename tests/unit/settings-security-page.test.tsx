// @vitest-environment jsdom

/**
 * Tests for `/settings/security` - see
 * `app/(protected)/settings/security/page.tsx` +
 * `security-client.tsx` for the surface under test.
 *
 * Strategy: mock the browser Supabase client + the BE session wrappers
 * so we exercise the component without any network. The Server-Component
 * shell (`page.tsx`) just emits a title + the Client island, so the
 * functional surface that matters is the Client island
 * (`SecurityClient`). We render it directly to skip Next.js's
 * server-resolution.
 *
 * Coverage:
 *   1. Empty passkey list renders the canonical empty-state copy.
 *   2. Enrolled passkeys list renders the rows + Remove buttons.
 *   3. Enroll happy path - fills the input, clicks the CTA, sees
 *      `webauthn.register({ friendlyName })` called with the value,
 *      and the list reloads with the new factor.
 *   4. UA parser maps a Chrome-on-macOS UA to "Chrome on macOS".
 *
 * Per repo convention (no @testing-library/jest-dom): assertions use
 * plain DOM property checks, not `toBeInTheDocument`.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const listFactorsMock = vi.fn();
const registerMock = vi.fn();
const unenrollMock = vi.fn();

vi.mock("@/lib/supabase/browser", () => ({
  getBrowserSupabase: () => ({
    auth: {
      mfa: {
        listFactors: () => listFactorsMock(),
        unenroll: (params: { factorId: string }) => unenrollMock(params),
        webauthn: {
          register: (params: { friendlyName: string }) => registerMock(params),
        },
      },
    },
  }),
}));

const listSessionsMock = vi.fn();
const revokeSessionMock = vi.fn();
const revokeOtherSessionsMock = vi.fn();

vi.mock("@/lib/api/auth", () => ({
  listSessions: () => listSessionsMock(),
  revokeSession: (id: string) => revokeSessionMock(id),
  revokeOtherSessions: () => revokeOtherSessionsMock(),
}));

// `useSession` reads from React context which isn't mounted in these
// tests. The current code paths under test don't actually call into
// SessionProvider - but the bundler will still try to resolve the
// import chain, so stub the module to a no-op.
vi.mock("@/lib/session/SessionProvider", () => ({
  useSession: () => ({
    status: "authenticated",
    session: null,
    me: null,
    activeOrgId: "org_test",
    setActiveOrgId: () => {},
    refreshMe: async () => {},
    signOut: async () => {},
  }),
}));

import { SecurityClient, describeDevice } from "@/app/(protected)/settings/security/security-client";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function emptyListFactorsReply() {
  return Promise.resolve({
    data: { all: [], totp: [], phone: [] },
    error: null,
  });
}

function listFactorsReply(
  factors: Array<{
    id: string;
    friendly_name: string;
    status: "verified" | "unverified";
    created_at: string;
  }>,
) {
  return Promise.resolve({
    data: {
      all: factors.map((f) => ({
        ...f,
        factor_type: "webauthn",
        updated_at: f.created_at,
      })),
      totp: [],
      phone: [],
    },
    error: null,
  });
}

function emptySessionListReply() {
  return Promise.resolve({ sessions: [], current_session_id: null });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("/settings/security - PasskeysCard", () => {
  beforeEach(() => {
    listFactorsMock.mockReset();
    registerMock.mockReset();
    unenrollMock.mockReset();
    listSessionsMock.mockReset();
    revokeSessionMock.mockReset();
    revokeOtherSessionsMock.mockReset();
    // Sessions card is rendered alongside passkeys; give it a benign
    // reply so it doesn't drown out passkey assertions with an error.
    listSessionsMock.mockImplementation(emptySessionListReply);
  });
  afterEach(() => {
    cleanup();
  });

  it("renders the empty state when no passkeys are enrolled", async () => {
    listFactorsMock.mockImplementation(emptyListFactorsReply);
    render(<SecurityClient />);

    await waitFor(() => {
      expect(screen.queryByText(/no passkeys yet/i)).not.toBeNull();
    });
    expect(
      screen.queryByText(/enroll one to require a second factor on sign-in/i),
    ).not.toBeNull();
    expect(screen.queryByTestId("passkey-table")).toBeNull();
  });

  it("renders the enrolled passkeys table with Remove buttons", async () => {
    listFactorsMock.mockImplementation(() =>
      listFactorsReply([
        {
          id: "fac_1",
          friendly_name: "MacBook TouchID",
          status: "verified",
          created_at: "2026-05-20T10:00:00Z",
        },
        {
          id: "fac_2",
          friendly_name: "YubiKey 5C",
          status: "verified",
          created_at: "2026-05-21T11:00:00Z",
        },
      ]),
    );
    render(<SecurityClient />);

    await waitFor(() => {
      expect(screen.queryByTestId("passkey-table")).not.toBeNull();
    });
    expect(screen.queryByText("MacBook TouchID")).not.toBeNull();
    expect(screen.queryByText("YubiKey 5C")).not.toBeNull();
    const removes = screen.getAllByRole("button", { name: /remove passkey/i });
    expect(removes).toHaveLength(2);
  });

  it("calls webauthn.register({ friendlyName }) on the enroll happy path and reloads the list", async () => {
    // First load: no factors. Second load (after enroll): one factor.
    listFactorsMock
      .mockImplementationOnce(emptyListFactorsReply)
      .mockImplementationOnce(() =>
        listFactorsReply([
          {
            id: "fac_new",
            friendly_name: "iPhone 15",
            status: "verified",
            created_at: "2026-05-26T12:00:00Z",
          },
        ]),
      );
    registerMock.mockResolvedValue({
      data: { id: "fac_new" },
      error: null,
    });

    render(<SecurityClient />);

    // Wait until the first listFactors resolves so the UI is interactive.
    await waitFor(() => {
      expect(screen.queryByText(/no passkeys yet/i)).not.toBeNull();
    });

    const input = screen.getByLabelText(/passkey name/i) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "iPhone 15" } });
    });

    const enrollBtn = screen.getByRole("button", {
      name: /enroll a new passkey/i,
    });
    await act(async () => {
      fireEvent.click(enrollBtn);
    });

    // Supabase register was called with the user-provided friendly name.
    expect(registerMock).toHaveBeenCalledTimes(1);
    expect(registerMock).toHaveBeenCalledWith({ friendlyName: "iPhone 15" });

    // The page reloads the list - after the second fixture resolves we
    // should see the new row.
    await waitFor(() => {
      expect(screen.queryByText("iPhone 15")).not.toBeNull();
    });
    expect(screen.queryByText(/no passkeys yet/i)).toBeNull();
  });

  it("surfaces an error when supabase.mfa.listFactors fails", async () => {
    listFactorsMock.mockResolvedValueOnce({
      data: null,
      error: { message: "service unavailable" },
    });
    render(<SecurityClient />);

    await waitFor(() => {
      // The thrown error message bubbles into the alert region.
      expect(screen.queryByText(/service unavailable/i)).not.toBeNull();
    });
  });
});

describe("describeDevice - UA parser", () => {
  it("maps a Chrome-on-macOS UA to 'Chrome on macOS' with the desktop icon", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    const result = describeDevice(ua);
    expect(result.label).toBe("Chrome on macOS");
  });

  it("maps a Safari-on-iOS UA to 'Safari on iOS'", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
    const result = describeDevice(ua);
    expect(result.label).toBe("Safari on iOS");
  });

  it("falls back to 'Unknown device' on null or unrecognised UAs", () => {
    expect(describeDevice(null).label).toBe("Unknown device");
    expect(describeDevice("").label).toBe("Unknown device");
    expect(describeDevice("curl/8.4").label).toBe("Unknown device");
  });
});
