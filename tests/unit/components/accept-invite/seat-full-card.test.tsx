// @vitest-environment jsdom

/**
 * SeatFullCard + accept-invite preview flow unit tests — §7.9.7 row 2479.
 *
 * SeatFullCard is exercised directly (pure presentational, no router /
 * session dependencies) so we cover the tier-specific copy and the
 * retry button behaviour without mounting the full page.
 *
 * The page-level state machine (preview returns ok → existing flow,
 * 409 on accept → seat-full transition) is exercised by mounting the
 * Next.js page with the api / router / session mocked out.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { SeatFullCard } from "@/app/accept-invite/[token]/seat-full-card";
import * as client from "@/lib/api/client";

// ---------------------------------------------------------------------------
// SeatFullCard — direct copy assertions for tier branches
// ---------------------------------------------------------------------------

afterEach(() => { cleanup(); });

describe("SeatFullCard (§7.9.7)", () => {
  it("renders solo-tier copy that includes 'upgrade to Pro'", () => {
    render(
      <SeatFullCard
        orgName="Acme Corp"
        inviterEmail="owner@acme.com"
        ownerEmail="owner@acme.com"
        tier="solo"
        onRetry={() => {}}
      />,
    );
    expect(screen.getByTestId("seat-full-card").textContent).toMatch(
      /or upgrade to Pro/,
    );
  });

  it("renders pro-tier copy that does NOT include the word 'upgrade'", () => {
    render(
      <SeatFullCard
        orgName="Acme Corp"
        inviterEmail="owner@acme.com"
        ownerEmail="owner@acme.com"
        tier="pro"
        onRetry={() => {}}
      />,
    );
    const card = screen.getByTestId("seat-full-card");
    expect(card.textContent).not.toMatch(/upgrade/i);
    expect(card.textContent).toMatch(/ask the owner to buy a seat/);
  });

  it("surfaces the headline 'This workspace is at capacity'", () => {
    render(
      <SeatFullCard
        orgName="Acme"
        inviterEmail="o@a.com"
        ownerEmail="o@a.com"
        tier="solo"
        onRetry={() => {}}
      />,
    );
    expect(screen.getByTestId("seat-full-headline").textContent).toMatch(
      /at capacity/i,
    );
  });

  it("renders a mailto link pointing at the owner", () => {
    render(
      <SeatFullCard
        orgName="Acme"
        inviterEmail="inviter@acme.com"
        ownerEmail="owner@acme.com"
        tier="solo"
        onRetry={() => {}}
      />,
    );
    const mailto = screen.getByTestId("seat-full-mailto") as HTMLAnchorElement;
    expect(mailto.getAttribute("href")).toMatch(/^mailto:owner@acme\.com/);
  });

  it("fires onRetry when the Retry button is clicked", () => {
    const onRetry = vi.fn();
    render(
      <SeatFullCard
        orgName="Acme"
        inviterEmail="i@a.com"
        ownerEmail="o@a.com"
        tier="solo"
        onRetry={onRetry}
      />,
    );
    fireEvent.click(screen.getByTestId("seat-full-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Accept-invite page — preview-first state machine
// ---------------------------------------------------------------------------

const routerReplaceMock = vi.fn();
const setActiveOrgIdMock = vi.fn();
const refreshMeMock = vi.fn(async () => {});

vi.mock("next/navigation", () => ({
  useParams: () => ({ token: "tok_test" }),
  useRouter: () => ({
    replace: routerReplaceMock,
    push: vi.fn(),
  }),
}));

vi.mock("@/lib/session/SessionProvider", () => ({
  useSession: () => ({
    status: "authenticated",
    session: null,
    me: null,
    activeOrgId: "org_test",
    setActiveOrgId: setActiveOrgIdMock,
    refreshMe: refreshMeMock,
    signOut: async () => {},
  }),
}));

const previewSpy = vi.spyOn(client.api.invitations, "preview");
const acceptSpy = vi.spyOn(client.api.invitations, "accept");

afterEach(() => {
  previewSpy.mockReset();
  acceptSpy.mockReset();
  routerReplaceMock.mockReset();
  setActiveOrgIdMock.mockReset();
  refreshMeMock.mockClear();
});

function previewOk(extra: Partial<client.InvitationPreview> = {}): client.InvitationPreview {
  return {
    org_slug: "acme",
    org_name: "Acme Corp",
    role: "engineer",
    inviter_email: "owner@acme.com",
    seats_available: true,
    owner_email: "owner@acme.com",
    tier: "solo",
    ...extra,
  };
}

describe("AcceptInvitePage preview-first flow (§7.9.7)", () => {
  it("renders the seat-full card when preview returns seats_available: false (solo copy)", async () => {
    previewSpy.mockResolvedValue(
      previewOk({ seats_available: false, tier: "solo" }),
    );
    // Import inside test so the mocks land first.
    const { default: AcceptInvitePage } = await import(
      "@/app/accept-invite/[token]/page"
    );
    render(<AcceptInvitePage />);
    await screen.findByTestId("seat-full-card");
    expect(screen.getByTestId("seat-full-card").textContent).toMatch(
      /or upgrade to Pro/,
    );
    // Accept must NOT have been called.
    expect(acceptSpy).not.toHaveBeenCalled();
  });

  it("runs the existing Accept flow when preview returns seats_available: true", async () => {
    previewSpy.mockResolvedValue(previewOk({ seats_available: true }));
    acceptSpy.mockResolvedValue({ org_id: "org_test", role: "engineer" });
    const { default: AcceptInvitePage } = await import(
      "@/app/accept-invite/[token]/page"
    );
    render(<AcceptInvitePage />);
    await waitFor(() => {
      expect(acceptSpy).toHaveBeenCalledWith("tok_test");
    });
    expect(screen.queryByTestId("seat-full-card")).toBeNull();
  });

  it("transitions to seat-full on 409 from accept WITHOUT navigating away (token retained)", async () => {
    // Persistent mocks: first preview returns open, accept rejects 409,
    // then any subsequent preview call returns the closed pro shape.
    // Using `mockResolvedValueOnce` for both calls is brittle when React
    // schedules transitions across multiple microtasks; persistent
    // returns + an implementation-swap is more robust.
    let previewCalls = 0;
    previewSpy.mockImplementation(async () => {
      previewCalls += 1;
      // First call (initial preview-then-accept) → open.
      // Subsequent calls (refetch after 409, or retry) → closed pro.
      return previewCalls === 1
        ? previewOk({ seats_available: true, tier: "pro" })
        : previewOk({ seats_available: false, tier: "pro" });
    });
    acceptSpy.mockRejectedValueOnce(
      new client.ApiError(409, "seats_full", "Workspace is full"),
    );
    const { default: AcceptInvitePage } = await import(
      "@/app/accept-invite/[token]/page"
    );
    render(<AcceptInvitePage />);
    await screen.findByTestId("seat-full-card");
    // The seat-full card carries pro-tier copy (no 'upgrade').
    expect(screen.getByTestId("seat-full-card").textContent).not.toMatch(
      /upgrade/i,
    );
    // We never pushed to a different route — the token stays in the URL.
    expect(routerReplaceMock).not.toHaveBeenCalled();
  });

  it("retry button on the seat-full card calls preview again", async () => {
    // Use a persistent mock that always returns the same closed-seats
    // preview so we only have to assert call counts (avoiding the
    // brittle mockResolvedValueOnce ordering when act + state
    // transitions interleave).
    previewSpy.mockResolvedValue(
      previewOk({ seats_available: false, tier: "solo" }),
    );
    const { default: AcceptInvitePage } = await import(
      "@/app/accept-invite/[token]/page"
    );
    render(<AcceptInvitePage />);
    await screen.findByTestId("seat-full-retry");
    const callsBefore = previewSpy.mock.calls.length;
    act(() => {
      fireEvent.click(screen.getByTestId("seat-full-retry"));
    });
    await waitFor(() => {
      expect(previewSpy.mock.calls.length).toBeGreaterThan(callsBefore);
    });
    // The seat-full card is still rendered (closed seats), and the
    // page did NOT navigate elsewhere (token retained).
    expect(screen.queryByTestId("seat-full-card")).not.toBeNull();
    expect(routerReplaceMock).not.toHaveBeenCalled();
  });
});
