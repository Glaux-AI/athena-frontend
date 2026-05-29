// @vitest-environment jsdom

/**
 * `/skills/[id]/edit` page — form-render pre-fill + submit.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { getMock, updateMock, routerPushMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  updateMock: vi.fn(),
  routerPushMock: vi.fn(),
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return {
    ...actual,
    api: {
      ...actual.api,
      skills: {
        ...actual.api.skills,
        get: getMock,
        update: updateMock,
      },
    },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/skills/skl_x/edit",
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import EditSkillPage from "@/app/(protected)/skills/[id]/edit/page";

describe("/skills/[id]/edit page", () => {
  beforeEach(() => {
    cleanup();
    getMock.mockReset();
    updateMock.mockReset();
    routerPushMock.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the skill detail and pre-fills the form, then submits patch", async () => {
    getMock.mockResolvedValue({
      id: "skl_x",
      name: "Security review",
      slug: "security-review",
      version: "0.1.0",
      status: "active",
      description: "Audits diffs.",
      icon: "shield",
      phases: ["review"],
      attached_capabilities: [],
      usage_count: 0,
      last_used: "1d ago",
      system_prompt: "You are a security reviewer…",
      knowledge_refs: [],
      author: "Maya",
      last_updated: "1 day ago",
    });
    updateMock.mockResolvedValue({
      id: "skl_x",
      name: "Security review v2",
      slug: "security-review",
      version: "0.1.0",
      status: "active",
      description: "Audits diffs.",
      icon: "shield",
      phases: ["review"],
      attached_capabilities: [],
      usage_count: 0,
      last_used: "1d ago",
    });

    const params = Promise.resolve({ id: "skl_x" });
    render(<EditSkillPage params={params} />);
    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith("skl_x");
    });
    // Form is pre-filled.
    await waitFor(() => {
      const name = screen.getByTestId("skill-form-name") as HTMLInputElement;
      expect(name.value).toBe("Security review");
    });
    const slug = screen.getByTestId("skill-form-slug") as HTMLInputElement;
    expect(slug.disabled).toBe(true);

    fireEvent.change(screen.getByTestId("skill-form-name"), {
      target: { value: "Security review v2" },
    });
    fireEvent.click(screen.getByTestId("skill-form-submit"));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledTimes(1);
    });
    expect(updateMock.mock.calls[0]![0]).toBe("skl_x");
    expect(updateMock.mock.calls[0]![1].name).toBe("Security review v2");
    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith("/skills/skl_x");
    });
  });
});
