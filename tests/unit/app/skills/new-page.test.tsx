// @vitest-environment jsdom

/**
 * `/skills/new` page - form-render + happy-path submit.
 *
 * Mocks the api.skills.create call at module-level so the page's
 * effect resolves synchronously without hitting the network. On
 * success the page navigates to `/skills/{id}` via `router.push`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { createMock, routerPushMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
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
        create: createMock,
      },
    },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/skills/new",
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import NewSkillPage from "@/app/(protected)/skills/new/page";

describe("/skills/new page", () => {
  beforeEach(() => {
    cleanup();
    createMock.mockReset();
    routerPushMock.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the new-skill form header + form fields", () => {
    render(<NewSkillPage />);
    expect(screen.getByText(/new skill/i)).not.toBeNull();
    expect(screen.getByTestId("skill-form-name")).not.toBeNull();
    expect(screen.getByTestId("skill-form-slug")).not.toBeNull();
    expect(screen.getByTestId("skill-form-system-prompt")).not.toBeNull();
  });

  it("submits the form and navigates to the created skill's detail page", async () => {
    createMock.mockResolvedValue({
      id: "skl_new_id",
      name: "Demo skill",
      slug: "demo-skill",
      version: "0.1.0",
      status: "draft",
      description: "",
      icon: "sparkles",
      phases: [],
      attached_domains: [],
      usage_count: 0,
      last_used: "never",
    });

    render(<NewSkillPage />);
    fireEvent.change(screen.getByTestId("skill-form-name"), {
      target: { value: "Demo skill" },
    });
    fireEvent.change(screen.getByTestId("skill-form-slug"), {
      target: { value: "demo-skill" },
    });
    fireEvent.change(screen.getByTestId("skill-form-system-prompt"), {
      target: { value: "Demo prompt body" },
    });
    fireEvent.click(screen.getByTestId("skill-form-submit"));

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledTimes(1);
    });
    const payload = createMock.mock.calls[0]![0];
    expect(payload.name).toBe("Demo skill");
    expect(payload.slug).toBe("demo-skill");
    expect(payload.system_prompt).toBe("Demo prompt body");

    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith("/skills/skl_new_id");
    });
  });
});
