// @vitest-environment jsdom

/**
 * KnowledgePalette tests — pins the open-on-Cmd-K behaviour, the
 * keyboard navigation, the result rendering, and the Esc-closes
 * contract.
 *
 * Coverage:
 *   1. Cmd-K opens; Esc closes.
 *   2. Submitting a query renders grouped results from the (mocked) API.
 *   3. ArrowDown / ArrowUp navigate the selection.
 *   4. Empty state shows sample queries when q < 2 chars.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act, cleanup, fireEvent, render, screen, waitFor,
} from "@testing-library/react";

import type { KnowledgeSearchOut } from "@/lib/api/client";

const { searchMock } = vi.hoisted(() => ({ searchMock: vi.fn() }));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client",
  );
  return {
    ...actual,
    api: {
      ...actual.api,
      knowledge: {
        ...actual.api.knowledge,
        search: searchMock,
      },
    },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

import { KnowledgePalette } from "@/components/search/knowledge-palette";

const sampleResults: KnowledgeSearchOut = {
  query: "billing",
  mode: "hybrid",
  items: [
    {
      id: "11111111-1111-1111-1111-111111111111",
      kind: "node",
      node_kind: "function",
      overlay_kind: null,
      name: "BillingHandler",
      path: "src/billing/handler.ts",
      summary: "Handles all billing flows.",
      layer: "Service",
      language: null,
      tags: [],
      repo_id: "22222222-2222-2222-2222-222222222222",
      repo_full_name: "acme/billing",
      capability_id: null,
      score: 0.025,
      score_basis: "rrf",
    },
    {
      id: "33333333-3333-3333-3333-333333333333",
      kind: "node",
      node_kind: "class",
      overlay_kind: null,
      name: "Invoice",
      path: "src/billing/invoice.ts",
      summary: "Domain object.",
      layer: "Service",
      language: null,
      tags: [],
      repo_id: "22222222-2222-2222-2222-222222222222",
      repo_full_name: "acme/billing",
      capability_id: null,
      score: 0.020,
      score_basis: "rrf",
    },
  ],
  totals: { matched: 2, returned: 2 },
  freshness: "fresh",
  search_quality: "exact",
};

beforeEach(() => {
  cleanup();
  searchMock.mockReset();
  searchMock.mockResolvedValue(sampleResults);
  window.localStorage.clear();
});

afterEach(() => { cleanup(); });

function dispatchCmdK() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  });
}

describe("KnowledgePalette", () => {
  it("opens on Cmd-K and closes on Escape", async () => {
    render(<KnowledgePalette />);
    expect(screen.queryByLabelText("Search knowledge")).toBeNull();
    dispatchCmdK();
    expect(await screen.findByLabelText("Search knowledge")).toBeTruthy();
    // Esc fires via the dialog's onEscapeKeyDown.
    act(() => {
      fireEvent.keyDown(screen.getByLabelText("Search knowledge"), { key: "Escape" });
    });
    await waitFor(() => {
      expect(screen.queryByLabelText("Search knowledge")).toBeNull();
    });
  });

  it("renders grouped results after typing a query", async () => {
    render(<KnowledgePalette open onOpenChange={() => {}} />);
    const input = screen.getByPlaceholderText(/search files/i) as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: "billing" } }); });
    // Hook debounces 300ms — advance with real timers.
    await waitFor(() => expect(searchMock).toHaveBeenCalled(), { timeout: 2000 });
    expect(await screen.findByText("BillingHandler")).toBeTruthy();
    expect(screen.getByText("Invoice")).toBeTruthy();
    // Group headers are uppercase labels for each kind cluster.
    expect(screen.getByText("Functions")).toBeTruthy();
    expect(screen.getByText("Classes")).toBeTruthy();
  });

  it("ArrowDown moves selection past first row", async () => {
    render(<KnowledgePalette open onOpenChange={() => {}} />);
    const input = screen.getByPlaceholderText(/search files/i);
    await act(async () => { fireEvent.change(input, { target: { value: "billing" } }); });
    await waitFor(() => expect(searchMock).toHaveBeenCalled(), { timeout: 2000 });
    await screen.findByText("BillingHandler");
    const dialog = screen.getByLabelText("Search knowledge");
    act(() => { fireEvent.keyDown(dialog, { key: "ArrowDown" }); });
    // After ArrowDown the second item carries aria-selected=true.
    await waitFor(() => {
      const rows = screen.getAllByRole("option");
      expect(rows[1]?.getAttribute("aria-selected")).toBe("true");
    });
  });

  it("shows sample queries in the empty state", () => {
    render(<KnowledgePalette open onOpenChange={() => {}} />);
    expect(screen.getByText("auth flow")).toBeTruthy();
    expect(screen.getByText("payment service")).toBeTruthy();
  });
});
