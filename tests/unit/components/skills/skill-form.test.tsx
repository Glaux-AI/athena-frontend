// @vitest-environment jsdom

/**
 * Unit tests for `<SkillForm/>` (ADR-013).
 *
 * Covers the validation invariants the BE will reject otherwise:
 *   1. Required fields surface a clean inline error before the
 *      submit handler fires.
 *   2. Slug regex (lowercase + digits + hyphens, no leading/trailing
 *      hyphen) matches the BE validator.
 *   3. Slug locked in edit mode.
 *   4. Phase chip selector toggles in/out of the phases array on
 *      submit.
 *   5. Happy-path create submit passes the expected payload upstream.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { SkillForm } from "@/components/skills/skill-form";
import type { SkillDetail } from "@/lib/api/client";

function buildSkillDetail(overrides: Partial<SkillDetail> = {}): SkillDetail {
  return {
    id: "skl_x",
    name: "Security review",
    slug: "security-review",
    version: "0.1.0",
    status: "active",
    description: "Audits diffs for security issues.",
    icon: "shield",
    phases: ["review"],
    attached_domains: [],
    usage_count: 0,
    last_used: "never",
    system_prompt: "You are a security reviewer…",
    knowledge_refs: [],
    author: "Maya",
    last_updated: "1 day ago",
    ...overrides,
  };
}

describe("<SkillForm/> create mode", () => {
  beforeEach(() => {
    cleanup();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders empty form with required-name + slug + system prompt", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    render(<SkillForm mode="create" onSubmit={onSubmit} onCancel={onCancel} />);

    const name = screen.getByTestId("skill-form-name") as HTMLInputElement;
    const slug = screen.getByTestId("skill-form-slug") as HTMLInputElement;
    const systemPrompt = screen.getByTestId("skill-form-system-prompt") as HTMLTextAreaElement;
    expect(name.value).toBe("");
    expect(slug.value).toBe("");
    expect(systemPrompt.value).toBe("");
    expect(slug.disabled).toBe(false);
  });

  it("auto-derives slug from name", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<SkillForm mode="create" onSubmit={onSubmit} onCancel={vi.fn()} />);
    const name = screen.getByTestId("skill-form-name") as HTMLInputElement;
    const slug = screen.getByTestId("skill-form-slug") as HTMLInputElement;

    fireEvent.change(name, { target: { value: "API Design Reviewer" } });
    expect(slug.value).toBe("api-design-reviewer");
  });

  it("shows a slug-format error when the user types an invalid slug", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<SkillForm mode="create" onSubmit={onSubmit} onCancel={vi.fn()} />);
    const slug = screen.getByTestId("skill-form-slug") as HTMLInputElement;

    fireEvent.change(slug, { target: { value: "-bad" } });
    expect(screen.getByText(/lowercase letters/i)).not.toBeNull();
    fireEvent.change(slug, { target: { value: "bad-" } });
    expect(screen.getByText(/lowercase letters/i)).not.toBeNull();
    fireEvent.change(slug, { target: { value: "ok-slug" } });
    expect(screen.queryByText(/lowercase letters/i)).toBeNull();
  });

  it("rejects submit without name", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<SkillForm mode="create" onSubmit={onSubmit} onCancel={vi.fn()} />);

    // HTML required would normally block, but we mainly want to confirm
    // the JS-side validate() catches missing system_prompt.
    const slug = screen.getByTestId("skill-form-slug") as HTMLInputElement;
    fireEvent.change(slug, { target: { value: "x" } });

    // Submit programmatically — manual form submit bypasses HTML required.
    const submit = screen.getByTestId("skill-form-submit");
    fireEvent.click(submit);
    // onSubmit must not have been called.
    await waitFor(() => {
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  it("rejects submit when system prompt is empty", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<SkillForm mode="create" onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByTestId("skill-form-name"), { target: { value: "Test" } });
    fireEvent.change(screen.getByTestId("skill-form-slug"), { target: { value: "test" } });
    // Leave system prompt empty.
    fireEvent.click(screen.getByTestId("skill-form-submit"));
    await waitFor(() => {
      expect(onSubmit).not.toHaveBeenCalled();
    });
    // Error surface visible.
    const err = screen.queryByTestId("skill-form-error");
    expect(err?.textContent ?? "").toMatch(/system prompt/i);
  });

  it("toggles a phase chip and includes it in the submit payload", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<SkillForm mode="create" onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByTestId("skill-form-name"), { target: { value: "Review skill" } });
    fireEvent.change(screen.getByTestId("skill-form-slug"), { target: { value: "review-skill" } });
    fireEvent.change(screen.getByTestId("skill-form-system-prompt"), {
      target: { value: "You are…" },
    });
    fireEvent.click(screen.getByTestId("skill-form-phase-review"));
    fireEvent.click(screen.getByTestId("skill-form-phase-ci"));
    fireEvent.click(screen.getByTestId("skill-form-submit"));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    const payload = onSubmit.mock.calls[0]![0];
    expect(payload.name).toBe("Review skill");
    expect(payload.slug).toBe("review-skill");
    expect(payload.system_prompt).toBe("You are…");
    expect(payload.phases).toEqual(["review", "ci"]);
    expect(payload.status).toBe("draft");
    expect(payload.version).toBe("0.1.0");
  });
});

describe("<SkillForm/> edit mode", () => {
  beforeEach(() => {
    cleanup();
  });

  it("pre-fills the form with the supplied SkillDetail", () => {
    const initial = buildSkillDetail();
    render(<SkillForm mode="edit" initial={initial} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    const name = screen.getByTestId("skill-form-name") as HTMLInputElement;
    const slug = screen.getByTestId("skill-form-slug") as HTMLInputElement;
    const systemPrompt = screen.getByTestId("skill-form-system-prompt") as HTMLTextAreaElement;
    expect(name.value).toBe("Security review");
    expect(slug.value).toBe("security-review");
    expect(systemPrompt.value).toBe("You are a security reviewer…");
  });

  it("locks the slug input in edit mode", () => {
    const initial = buildSkillDetail();
    render(<SkillForm mode="edit" initial={initial} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    const slug = screen.getByTestId("skill-form-slug") as HTMLInputElement;
    expect(slug.disabled).toBe(true);
  });

  it("submits the patched fields back to the parent", async () => {
    const initial = buildSkillDetail();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<SkillForm mode="edit" initial={initial} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByTestId("skill-form-name"), {
      target: { value: "Renamed skill" },
    });
    fireEvent.click(screen.getByTestId("skill-form-submit"));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0]![0].name).toBe("Renamed skill");
    expect(onSubmit.mock.calls[0]![0].slug).toBe("security-review"); // unchanged
  });
});
