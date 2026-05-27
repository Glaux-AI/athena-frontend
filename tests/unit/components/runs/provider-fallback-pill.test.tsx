// @vitest-environment jsdom

/**
 * ProviderFallbackPill unit tests (readiness §3.1 row 812).
 *
 * Covers:
 *   - Renders null when `fallback_count === 0`.
 *   - Renders the chip with the count badge when `fallback_count > 0`.
 *   - Click opens the popover (role="dialog").
 *   - Escape closes the popover.
 *   - ARIA: chip carries `aria-label="Provider fallback details"` and
 *     `aria-haspopup="dialog"`; the open popover carries `role="dialog"`.
 *   - Loading skeleton renders during the initial fetch.
 *   - Error state renders gracefully (flag-only icon, no crash).
 *
 * Note: the repo does NOT depend on `@testing-library/jest-dom`, so these
 * tests use plain DOM property / attribute assertions.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ProviderFallbackPill } from "@/components/runs/provider-fallback-pill";
import * as client from "@/lib/api/client";

type RunDetail = client.RunDetail;

const getSpy = vi.spyOn(client.api.runs, "get");

function makeRun(extra: Record<string, unknown> = {}): RunDetail {
  // Cast through `unknown` so the test fixture can carry the optional
  // snake_case fields the hook narrows off the wire (`provider_routes`,
  // `fallback_count`) without polluting the shared `RunDetail` type.
  return {
    id: "tsk_test",
    goal: "Test run",
    intent: null,
    status: "running",
    spent_usd: 0.12,
    created_at: "2026-05-27T10:00:00Z",
    output_summary: null,
    stream_url: "/v1/runs/tsk_test/events",
    kind: "implement",
    capability_id: "cap_1",
    current_phase: 0,
    progress: 0,
    assignee: "Athena",
    requested_by: "tester",
    source: { kind: "raw", label: "Manual" },
    summary: "test",
    ...extra,
  } as RunDetail;
}

describe("ProviderFallbackPill", () => {
  beforeEach(() => {
    cleanup();
    getSpy.mockReset();
  });

  it("renders null when fallback_count is 0", async () => {
    getSpy.mockResolvedValueOnce(
      makeRun({ provider_routes: [], fallback_count: 0 }),
    );
    const { container } = render(<ProviderFallbackPill runId="tsk_test" />);
    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledTimes(1);
    });
    // After the fetch resolves with no fallbacks, the pill renders nothing.
    await waitFor(() => {
      expect(
        container.querySelector('[data-testid="provider-fallback-pill"]'),
      ).toBeNull();
      expect(
        container.querySelector('[data-testid="provider-fallback-skeleton"]'),
      ).toBeNull();
    });
  });

  it("renders the chip with the count badge when fallback_count > 0", async () => {
    getSpy.mockResolvedValueOnce(
      makeRun({
        provider_routes: [
          { model: "claude-sonnet-4", primary: true, ts: "2026-05-27T10:00:00Z", calls: 3 },
          {
            model: "gpt-4o",
            primary: false,
            fallback_from: "claude-sonnet-4",
            ts: "2026-05-27T10:05:00Z",
            calls: 2,
          },
        ],
        fallback_count: 2,
      }),
    );
    render(<ProviderFallbackPill runId="tsk_test" />);
    const pill = await screen.findByTestId("provider-fallback-pill");
    expect(pill.textContent).toMatch(/fallback active/i);
    const badge = screen.getByTestId("provider-fallback-count");
    expect(badge.textContent).toBe("2");
  });

  it("opens the popover dialog on click", async () => {
    getSpy.mockResolvedValueOnce(
      makeRun({
        provider_routes: [
          { model: "claude-sonnet-4", primary: true, ts: "2026-05-27T10:00:00Z", calls: 3 },
        ],
        fallback_count: 1,
      }),
    );
    render(<ProviderFallbackPill runId="tsk_test" />);
    const pill = await screen.findByTestId("provider-fallback-pill");
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(pill);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("aria-label")).toBe("Provider fallback details");
  });

  it("closes the popover on Escape", async () => {
    getSpy.mockResolvedValueOnce(
      makeRun({
        provider_routes: [
          { model: "claude-sonnet-4", primary: true, ts: "2026-05-27T10:00:00Z", calls: 3 },
        ],
        fallback_count: 1,
      }),
    );
    render(<ProviderFallbackPill runId="tsk_test" />);
    const pill = await screen.findByTestId("provider-fallback-pill");
    fireEvent.click(pill);
    await screen.findByRole("dialog");
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("carries the correct ARIA on the chip", async () => {
    getSpy.mockResolvedValueOnce(
      makeRun({
        provider_routes: [
          { model: "claude-sonnet-4", primary: true, ts: "2026-05-27T10:00:00Z", calls: 1 },
        ],
        fallback_count: 1,
      }),
    );
    render(<ProviderFallbackPill runId="tsk_test" />);
    const pill = await screen.findByTestId("provider-fallback-pill");
    expect(pill.getAttribute("aria-label")).toBe("Provider fallback details");
    expect(pill.getAttribute("aria-haspopup")).toBe("dialog");
    expect(pill.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(pill);
    await waitFor(() => {
      expect(pill.getAttribute("aria-expanded")).toBe("true");
    });
  });

  it("renders a loading skeleton during the initial fetch", async () => {
    let resolveCall: ((v: RunDetail) => void) | undefined;
    getSpy.mockImplementationOnce(
      () =>
        new Promise<RunDetail>((resolve) => {
          resolveCall = resolve;
        }),
    );
    const { container } = render(<ProviderFallbackPill runId="tsk_test" />);
    // While the call is pending, the skeleton placeholder is in the DOM.
    expect(
      container.querySelector('[data-testid="provider-fallback-skeleton"]'),
    ).not.toBeNull();
    await act(async () => {
      resolveCall?.(makeRun({ provider_routes: [], fallback_count: 0 }));
    });
    // After resolve the skeleton has flipped to the resolved (null) state.
    await waitFor(() => {
      expect(
        container.querySelector('[data-testid="provider-fallback-skeleton"]'),
      ).toBeNull();
    });
  });

  it("renders an error flag instead of crashing on a network failure", async () => {
    getSpy.mockRejectedValueOnce(
      new client.ApiError(500, "internal", "Server unavailable"),
    );
    render(<ProviderFallbackPill runId="tsk_test" />);
    const err = await screen.findByTestId("provider-fallback-error");
    expect(err.getAttribute("title")).toBe("Server unavailable");
    expect(err.getAttribute("aria-label")).toBe(
      "Provider fallback info unavailable",
    );
  });
});
