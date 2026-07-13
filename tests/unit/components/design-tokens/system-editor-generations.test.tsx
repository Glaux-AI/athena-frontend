// @vitest-environment jsdom

/**
 * SystemEditor - the durable-generation UX. Pins the three behaviors the
 * rehaul added: (1) a FAILED generation lands in a persistent error banner
 * with a working Try again (not a vanishing toast), (2) a completed draft
 * applies onto the editor body, and (3) a repo component import enqueued from
 * the dialog settles in the EDITOR, appending drafts to the components list.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/hooks/use-enabled-models", () => ({
  useEnabledModels: () => ({ models: [], isLoading: false, error: null }),
}));

const generateSystem = vi.fn();
const importComponents = vi.fn();
const repoComponents = vi.fn();
const listGenerations = vi.fn();

vi.mock("@/lib/api/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/api/client")>();
  return {
    ...mod,
    api: {
      ...mod.api,
      design: {
        ...mod.api.design,
        generateSystem: (...args: unknown[]) => generateSystem(...args) as never,
        importComponents: (...args: unknown[]) => importComponents(...args) as never,
        repoComponents: (...args: unknown[]) => repoComponents(...args) as never,
      },
      generations: {
        ...mod.api.generations,
        list: (...args: unknown[]) => listGenerations(...args) as never,
      },
    },
  };
});

import type { AiGeneration, DesignSystemDetail, RepoFull } from "@/lib/api/client";
import { SystemEditor } from "@/components/design-tokens/system-editor";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  generateSystem.mockReset();
  importComponents.mockReset();
  repoComponents.mockReset();
  listGenerations.mockReset();
});

const DETAIL: DesignSystemDetail = {
  id: "ds_1",
  name: "Base system",
  description: null,
  css: ":root { --a: 1px; }",
  origin: "manual",
  updated_at: "2026-07-01T00:00:00Z",
  domain_ids: [],
  tokens: [],
  components: [],
};

const REPOS: RepoFull[] = [
  {
    id: "r1",
    full_name: "acme/web",
  } as RepoFull,
];

function gen<T>(overrides: Partial<AiGeneration<T>>): AiGeneration<T> {
  return {
    id: "gen_1",
    kind: "design_system",
    context_key: "ds_1",
    status: "completed",
    status_detail: "",
    result: null,
    error: null,
    created_at: "2026-07-13T00:00:00Z",
    started_at: "2026-07-13T00:00:00Z",
    finished_at: "2026-07-13T00:00:01Z",
    ...overrides,
  };
}

function renderEditor() {
  listGenerations.mockResolvedValue([]);
  render(
    <SystemEditor
      detail={DETAIL}
      domains={[]}
      repos={REPOS}
      onSaved={vi.fn()}
      onDeleted={vi.fn()}
    />,
  );
}

async function runPromptGeneration() {
  fireEvent.change(screen.getByPlaceholderText(/Describe the design system/), {
    target: { value: "warm editorial" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Refine" }));
}

describe("SystemEditor generations", () => {
  it("shows a persistent error banner with a working Try again on failure", async () => {
    generateSystem.mockResolvedValue(
      gen({ status: "failed", error: "The model is unavailable right now." }),
    );
    renderEditor();
    await runPromptGeneration();

    // Persistent banner, not a toast: the message stays in the panel.
    expect(await screen.findByText("The model is unavailable right now.")).toBeTruthy();
    expect(generateSystem).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(generateSystem).toHaveBeenCalledTimes(2));

    // Dismiss clears it.
    await screen.findByText("The model is unavailable right now.");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() =>
      expect(screen.queryByText("The model is unavailable right now.")).toBeNull(),
    );
  });

  it("applies a completed draft onto the editor body", async () => {
    generateSystem.mockResolvedValue(
      gen({
        result: {
          name: "Warm editorial",
          description: "Ink on paper",
          css: ":root { --b: 2px; }",
          components: [],
          origin: "ai",
          warnings: [],
        },
      }),
    );
    renderEditor();
    await runPromptGeneration();

    fireEvent.click(await screen.findByRole("tab", { name: "Code" }));
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Design system CSS") as HTMLTextAreaElement).value,
      ).toContain("--b: 2px"),
    );
  });

  it("settles a dialog-enqueued import in the editor and appends the drafts", async () => {
    repoComponents.mockResolvedValue({
      items: [
        {
          repo_id: "r1",
          repo_name: "acme/web",
          path: "src/Button.tsx",
          name: "Button.tsx",
          language: "tsx",
        },
      ],
      truncated: false,
    });
    importComponents.mockResolvedValue(
      gen({
        kind: "design_components",
        result: {
          components: [
            { name: "Button", description: "", css: ".btn{}", markup: "<button class='btn'>B</button>" },
          ],
          warnings: [],
        },
      }),
    );
    renderEditor();

    fireEvent.click(screen.getByRole("tab", { name: "Components" }));
    fireEvent.click(screen.getByRole("button", { name: "Import from repo" }));
    fireEvent.click(
      await screen.findByLabelText("Import Button.tsx from src/Button.tsx"),
    );
    fireEvent.click(screen.getByRole("button", { name: /Import 1 selected/ }));

    // The generation settled terminal in the EDITOR: the draft row appears.
    expect(await screen.findByRole("button", { name: "Button" })).toBeTruthy();
    expect(importComponents).toHaveBeenCalledTimes(1);
    expect(importComponents.mock.calls[0]?.[0]).toMatchObject({
      context_key: "ds_1",
      sources: [{ repo_id: "r1", path: "src/Button.tsx" }],
    });
  });
});
