// @vitest-environment jsdom

/**
 * §5.29.10 r3 / F-04.10 — Scope-collisions modal unit tests.
 *
 * Covers the modal-on-load contract:
 *   - All four options render.
 *   - Submit is disabled until a choice is selected.
 *   - Selecting an option enables Submit.
 *   - Submit posts the single-choice answer with the picked `choice_id`.
 *   - Submitting state disables Submit + shows the spinner.
 *   - Submit error surfaces in an inline alert.
 *   - Backdrop click + Escape do NOT close the modal (sticky modal-on-load).
 *   - Slicer payload sections (open_prs / active_branches / recent_main_commits)
 *     each render at least one mock row.
 *
 * Note: the repo does NOT depend on `@testing-library/jest-dom`, so these
 * tests use plain DOM property / attribute assertions (e.g. `.disabled`,
 * `.getAttribute(...)`) instead of the `toBeInTheDocument` matcher set.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ScopeCollisionsModal } from "@/components/runs/scope-collisions-modal";
import type {
  ClarificationAnswer,
  RunClarification,
  ScopeCollisionsPayload,
} from "@/lib/api/client";

/** Build a fully-typed `RunClarification` for `origin === "scope_collisions"`. */
function buildClarification(payloadOverrides?: Partial<ScopeCollisionsPayload>): RunClarification {
  const payload: ScopeCollisionsPayload = {
    open_prs: [
      {
        integration: "github",
        number: 4271,
        title: "feat(billing): retry policy for failed invoices",
        author: "sarah-c",
        url: "https://github.com/example/billing/pull/4271",
        touches: ["services/billing/retry.py", "services/billing/tests/test_retry.py"],
        state: "open",
      },
    ],
    active_branches: [
      {
        name: "feat/billing-retry-refactor",
        author: "mike-h",
        ahead_of_main: 6,
        touches: ["services/billing/retry.py"],
        url: "https://github.com/example/billing/tree/feat/billing-retry-refactor",
      },
    ],
    recent_main_commits: [
      {
        sha: "9f3a1b2c0d4e5f67890abcdef1234567890abcde",
        author: "ana-k",
        when: "2 hours ago",
        summary: "chore(billing): bump retry default to 5",
        touches: ["services/billing/retry.py"],
      },
    ],
    ...payloadOverrides,
  };

  return {
    id: "clr_scope_test",
    qid: "q_scope",
    run_id: "tsk_scope_test",
    phase_key: "implement",
    question: "Conflicting work on services/billing/retry.py — how to proceed?",
    rationale: "Two open PRs and a recent main commit touch the same module.",
    question_kind: "single_choice",
    priority: "blocker",
    origin: "scope_collisions",
    status: "pending",
    created_at: "2026-05-27T10:00:00Z",
    expires_at: null,
    resolved_at: null,
    batch_id: null,
    defer_count: 0,
    scope_doc_id: null,
    scope_section_anchor: null,
    options: [],
    reference_picker: null,
    numeric_constraints: null,
    free_text_constraints: null,
    free_text_allowed: false,
    on_expire: null,
    metadata: payload as unknown as Record<string, unknown>,
    answer: null,
    answered_by_user_id: null,
    answered_at: null,
  };
}

const isDisabled = (el: HTMLElement | null): boolean => {
  if (el === null) return true;
  if (el instanceof HTMLButtonElement) return el.disabled;
  return el.getAttribute("aria-disabled") === "true";
};

describe("ScopeCollisionsModal — F-04.10", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders all four resolution options", () => {
    render(
      <ScopeCollisionsModal
        clarification={buildClarification()}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const options = screen.getAllByRole("radio");
    expect(options).toHaveLength(4);

    expect(screen.queryByText("Coordinate")).not.toBeNull();
    expect(screen.queryByText("Parallel")).not.toBeNull();
    expect(screen.queryByText("Review")).not.toBeNull();
    expect(screen.queryByText("Take over")).not.toBeNull();

    // Each option carries its prescribed description.
    expect(
      screen.queryByText("Pause this run; ping the open-PR author to align."),
    ).not.toBeNull();
    expect(
      screen.queryByText(
        "Proceed in parallel; declare you'll handle a non-overlapping slice.",
      ),
    ).not.toBeNull();
    expect(
      screen.queryByText("Stop and review the open work before continuing."),
    ).not.toBeNull();
    expect(
      screen.queryByText(
        "Override the open work; rebase the existing PR to your direction.",
      ),
    ).not.toBeNull();
  });

  it("disables Submit until a choice is selected", () => {
    render(
      <ScopeCollisionsModal
        clarification={buildClarification()}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const submitBtn = screen.getByRole("button", { name: /^submit$/i });
    expect(isDisabled(submitBtn)).toBe(true);
  });

  it("enables Submit once an option is selected", () => {
    render(
      <ScopeCollisionsModal
        clarification={buildClarification()}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const submitBtn = screen.getByRole("button", { name: /^submit$/i });
    expect(isDisabled(submitBtn)).toBe(true);

    const coordinate = screen.getByRole("radio", { name: /coordinate/i });
    fireEvent.click(coordinate);

    expect(coordinate.getAttribute("aria-checked")).toBe("true");
    expect(isDisabled(submitBtn)).toBe(false);
  });

  it("calls onSubmit with the picked choice_id when Submit is clicked", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ScopeCollisionsModal
        clarification={buildClarification()}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /take over/i }));
    fireEvent.click(screen.getByRole("button", { name: /^submit$/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    const answer = onSubmit.mock.calls[0]![0] as ClarificationAnswer;
    expect(answer.choice_id).toBe("take_over");
  });

  it("disables Submit and shows the loading state while submitting", async () => {
    let resolveSubmit: (() => void) | undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    render(
      <ScopeCollisionsModal
        clarification={buildClarification()}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /review/i }));
    const submitBtn = screen.getByRole("button", { name: /^submit$/i });
    fireEvent.click(submitBtn);

    // While the submit promise is unresolved, Submit must be disabled.
    await waitFor(() => {
      expect(isDisabled(submitBtn)).toBe(true);
    });
    // Cancel button is also disabled mid-submit.
    expect(isDisabled(screen.getByRole("button", { name: /cancel/i }))).toBe(true);

    // Resolve and verify state restores.
    await act(async () => {
      resolveSubmit?.();
    });
    await waitFor(() => {
      expect(isDisabled(screen.getByRole("button", { name: /cancel/i }))).toBe(false);
    });
  });

  it("surfaces a submit error as an inline alert", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("Server is unavailable"));
    render(
      <ScopeCollisionsModal
        clarification={buildClarification()}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /coordinate/i }));
    fireEvent.click(screen.getByRole("button", { name: /^submit$/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent ?? "").toContain("Server is unavailable");
    // After the error, Submit re-enables so the user can retry.
    expect(
      isDisabled(screen.getByRole("button", { name: /^submit$/i })),
    ).toBe(false);
  });

  it("does NOT close on backdrop click or Escape (sticky modal-on-load)", () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn();
    render(
      <ScopeCollisionsModal
        clarification={buildClarification()}
        onSubmit={onSubmit}
        onClose={onClose}
      />,
    );

    // Backdrop click.
    const backdrop = screen.getByTestId("scope-collisions-modal-backdrop");
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();

    // Escape key — neither dispatched on document nor on backdrop should
    // trigger onClose.
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.keyDown(backdrop, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders all three slicer payload sections with at least one mock row each", () => {
    render(
      <ScopeCollisionsModal
        clarification={buildClarification()}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // open_prs row — PR title + author shown.
    expect(
      screen.queryByText(/#4271 · feat\(billing\): retry policy for failed invoices/i),
    ).not.toBeNull();
    expect(screen.queryByText(/sarah-c · github · open/)).not.toBeNull();

    // active_branches row — branch name + author.
    expect(screen.queryByText("feat/billing-retry-refactor")).not.toBeNull();
    expect(screen.queryByText(/mike-h · 6 commits ahead of main/)).not.toBeNull();

    // recent_main_commits row — short sha + summary.
    expect(
      screen.queryByText(/9f3a1b2 · chore\(billing\): bump retry default to 5/i),
    ).not.toBeNull();
    expect(screen.queryByText(/ana-k · 2 hours ago/)).not.toBeNull();

    // Section headers.
    expect(screen.queryByText(/open pull requests/i)).not.toBeNull();
    expect(screen.queryByText(/active branches/i)).not.toBeNull();
    expect(screen.queryByText(/recent main-branch commits/i)).not.toBeNull();
  });

  it("invokes onClose when the explicit Cancel button is clicked", () => {
    const onClose = vi.fn();
    render(
      <ScopeCollisionsModal
        clarification={buildClarification()}
        onSubmit={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("falls back gracefully when the slicer metadata is null", () => {
    const clarification = buildClarification();
    clarification.metadata = null;

    render(
      <ScopeCollisionsModal
        clarification={clarification}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // The four resolution options must still render.
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    // And the unavailable-snapshot fallback message is shown.
    expect(screen.queryByText(/conflict snapshot is unavailable/i)).not.toBeNull();
  });
});
