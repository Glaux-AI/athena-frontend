// @vitest-environment jsdom

/**
 * SectionFeedback unit tests (readiness row 998 + §9.6).
 *
 * Covers:
 *   - 👍 click POSTs to /v1/feedback with sentiment="positive".
 *   - 👎 click POSTs to /v1/feedback with sentiment="negative".
 *   - Optimistic UI update — the pressed mood flips before the response
 *     resolves.
 *   - Success toast renders "Thanks for the feedback".
 *   - Rollback on network error — the prior mood is restored.
 *   - Double-click guard — a second click while in-flight is no-op.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { SectionFeedback } from "@/components/runs/feedback/section-feedback";
import * as client from "@/lib/api/client";

const recordSpy = vi.spyOn(client.api.feedback, "record");

// Capture sonner.toast calls — we don't render a `<Toaster />` in the test,
// so we spy on the module-level functions instead.
import { toast } from "sonner";

const toastSuccessSpy = vi.spyOn(toast, "success");
const toastErrorSpy = vi.spyOn(toast, "error");

describe("SectionFeedback", () => {
  beforeEach(() => {
    cleanup();
    recordSpy.mockReset();
    toastSuccessSpy.mockReset();
    toastErrorSpy.mockReset();
  });

  afterEach(() => {
    recordSpy.mockReset();
  });

  function renderWidget() {
    return render(
      <SectionFeedback
        runId="tsk_test"
        sectionId="prd.goals"
        artifactId="doc_abc123"
      />,
    );
  }

  it("posts sentiment=positive when 👍 is clicked", async () => {
    recordSpy.mockResolvedValueOnce({
      id: "fb_1",
      org_id: "o",
      artifact_kind: "document_section",
      artifact_id: "doc_abc123",
      section_key: "prd.goals",
      sentiment: "positive",
      note: null,
      actor_user_id: "u",
      created_at: "2026-05-27T10:00:00Z",
    });
    renderWidget();
    fireEvent.click(screen.getByRole("button", { name: /useful/i }));
    await waitFor(() => {
      expect(recordSpy).toHaveBeenCalledTimes(1);
    });
    expect(recordSpy.mock.calls[0]![0]).toEqual({
      artifact_kind: "document_section",
      artifact_id: "doc_abc123",
      section_key: "prd.goals",
      sentiment: "positive",
    });
  });

  it("posts sentiment=negative when 👎 is clicked", async () => {
    recordSpy.mockResolvedValueOnce({
      id: "fb_2",
      org_id: "o",
      artifact_kind: "document_section",
      artifact_id: "doc_abc123",
      section_key: "prd.goals",
      sentiment: "negative",
      note: null,
      actor_user_id: "u",
      created_at: "2026-05-27T10:00:00Z",
    });
    renderWidget();
    fireEvent.click(screen.getByRole("button", { name: /unhelpful/i }));
    await waitFor(() => {
      expect(recordSpy).toHaveBeenCalledTimes(1);
    });
    expect(recordSpy.mock.calls[0]![0]!.sentiment).toBe("negative");
  });

  it("updates the UI optimistically before the request resolves", async () => {
    let resolveCall: ((v: client.FeedbackItem) => void) | undefined;
    recordSpy.mockImplementationOnce(
      () =>
        new Promise<client.FeedbackItem>((resolve) => {
          resolveCall = resolve;
        }),
    );
    renderWidget();
    const up = screen.getByRole("button", { name: /useful/i });
    expect(up.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(up);
    // Pressed state flips immediately even though the call is pending.
    expect(up.getAttribute("aria-pressed")).toBe("true");
    // Resolve so the test cleans up.
    await act(async () => {
      resolveCall?.({
        id: "fb_3",
        org_id: "o",
        artifact_kind: "document_section",
        artifact_id: "doc_abc123",
        section_key: "prd.goals",
        sentiment: "positive",
        note: null,
        actor_user_id: "u",
        created_at: "2026-05-27T10:00:00Z",
      });
    });
  });

  it("shows the success toast on a successful post", async () => {
    recordSpy.mockResolvedValueOnce({
      id: "fb_4",
      org_id: "o",
      artifact_kind: "document_section",
      artifact_id: "doc_abc123",
      section_key: "prd.goals",
      sentiment: "positive",
      note: null,
      actor_user_id: "u",
      created_at: "2026-05-27T10:00:00Z",
    });
    renderWidget();
    fireEvent.click(screen.getByRole("button", { name: /useful/i }));
    await waitFor(() => {
      expect(toastSuccessSpy).toHaveBeenCalledTimes(1);
    });
    expect(toastSuccessSpy.mock.calls[0]![0]).toMatch(/thanks for the feedback/i);
  });

  it("rolls back the UI and shows an error toast on network failure", async () => {
    recordSpy.mockRejectedValueOnce(
      new client.ApiError(500, "internal", "Server is unavailable"),
    );
    renderWidget();
    const down = screen.getByRole("button", { name: /unhelpful/i });
    fireEvent.click(down);
    // Optimistic state flips to pressed.
    expect(down.getAttribute("aria-pressed")).toBe("true");
    // After the rejection lands, the prior null state is restored.
    await waitFor(() => {
      expect(toastErrorSpy).toHaveBeenCalledTimes(1);
    });
    expect(down.getAttribute("aria-pressed")).toBe("false");
    expect(toastErrorSpy.mock.calls[0]![0]).toMatch(/server is unavailable/i);
  });

  it("ignores a second click while an in-flight request is pending", async () => {
    let resolveCall: ((v: client.FeedbackItem) => void) | undefined;
    recordSpy.mockImplementationOnce(
      () =>
        new Promise<client.FeedbackItem>((resolve) => {
          resolveCall = resolve;
        }),
    );
    renderWidget();
    const up = screen.getByRole("button", { name: /useful/i });
    fireEvent.click(up);
    // Second click — guarded.
    fireEvent.click(up);
    fireEvent.click(up);
    // Only one POST has been issued.
    expect(recordSpy).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveCall?.({
        id: "fb_5",
        org_id: "o",
        artifact_kind: "document_section",
        artifact_id: "doc_abc123",
        section_key: "prd.goals",
        sentiment: "positive",
        note: null,
        actor_user_id: "u",
        created_at: "2026-05-27T10:00:00Z",
      });
    });
  });
});
