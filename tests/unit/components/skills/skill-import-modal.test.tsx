// @vitest-environment jsdom

/**
 * <SkillImportModal/> - paste -> preview -> save flow.
 *
 * Mocks api.skills.import (preview) + api.skills.create (save) and the router.
 * Verifies Preview surfaces the parsed draft and Save creates a draft skill and
 * routes to its editor.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { importMock, createMock, routerPushMock } = vi.hoisted(() => ({
  importMock: vi.fn(),
  createMock: vi.fn(),
  routerPushMock: vi.fn(),
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return {
    ...actual,
    api: {
      ...actual.api,
      skills: { ...actual.api.skills, import: importMock, create: createMock },
    },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock, replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { SkillImportModal } from "@/components/skills/skill-import-modal";

describe("<SkillImportModal/>", () => {
  beforeEach(() => {
    cleanup();
    importMock.mockReset();
    createMock.mockReset();
    routerPushMock.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it("previews pasted text then saves a draft and opens its editor", async () => {
    importMock.mockResolvedValue({
      detected_format: "claude_code",
      name: "Security Review",
      slug: "security-review",
      description: "Reviews diffs",
      system_prompt: "You are a security reviewer.",
      warnings: [],
      created: false,
      skill_id: null,
    });
    createMock.mockResolvedValue({
      id: "skl_imported",
      name: "Security Review",
      slug: "security-review",
      version: "0.1.0",
      status: "draft",
      description: "Reviews diffs",
      icon: "sparkles",
      phases: [],
      attached_domains: [],
      usage_count: 0,
      last_used: "never",
    });

    render(<SkillImportModal open onClose={vi.fn()} />);

    fireEvent.change(screen.getByTestId("skill-import-text"), {
      target: { value: "---\nname: Security Review\ndescription: Reviews diffs\n---\nbody" },
    });
    fireEvent.click(screen.getByTestId("skill-import-preview"));

    await waitFor(() => expect(importMock).toHaveBeenCalledTimes(1));
    expect(importMock.mock.calls[0]![0].commit).toBe(false);

    // Preview panel shows the parsed name.
    const nameInput = (await screen.findByTestId("skill-import-name")) as HTMLInputElement;
    expect(nameInput.value).toBe("Security Review");

    fireEvent.click(screen.getByTestId("skill-import-save"));
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    const payload = createMock.mock.calls[0]![0];
    expect(payload.slug).toBe("security-review");
    expect(payload.status).toBe("draft");
    expect(payload.system_prompt).toBe("You are a security reviewer.");

    await waitFor(() =>
      expect(routerPushMock).toHaveBeenCalledWith("/skills/skl_imported/edit"),
    );
  });
});
