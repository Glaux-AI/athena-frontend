// @vitest-environment jsdom

/**
 * /design-tokens page - the save/open state machine over the mock backend:
 *   - open() is latest-wins: rapid clicks B then C settle the editor on C
 *     even when B's GET resolves last;
 *   - onSaved treats a list-refresh failure as a warning, never as a save
 *     failure - the editor advances to the saved detail (fresh concurrency
 *     stamp), so the NEXT save cannot self-409.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/design-tokens",
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock("@/hooks/use-enabled-models", () => ({
  useEnabledModels: () => ({ models: [], isLoading: false, error: null }),
}));

// vi.hoisted: the sonner factory runs at import time, before ordinary consts.
const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: toastMock }));

let interceptGetSystem: ((id: string) => Promise<DesignSystemDetail>) | null = null;
let failListRefresh = false;

vi.mock("@/lib/api/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/api/client")>();
  const realGet = mod.api.design.getSystem;
  const realList = mod.api.design.listSystems;
  return {
    ...mod,
    api: {
      ...mod.api,
      design: {
        ...mod.api.design,
        getSystem: (id: string) => (interceptGetSystem ? interceptGetSystem(id) : realGet(id)),
        listSystems: (domainId?: string) =>
          failListRefresh ? Promise.reject(new Error("list refresh boom")) : realList(domainId),
      },
    },
  };
});

import type { DesignSystemDetail } from "@/lib/api/client";
import DesignTokensPage from "@/app/(protected)/design-tokens/page";

afterEach(() => {
  cleanup();
  interceptGetSystem = null;
  failListRefresh = false;
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  toastMock.warning.mockReset();
});

const detailOf = (id: string, name: string): DesignSystemDetail => ({
  id,
  name,
  description: null,
  css: ":root { --a: 1px; }",
  origin: "manual",
  updated_at: "2026-07-01T00:00:00Z",
  domain_ids: [],
  tokens: [],
  components: [],
});

const nameInput = () => screen.getByLabelText("Design system name") as HTMLInputElement;

/** Generous timeout: the mock transport adds 120 ms per call and the suite
 *  runs these files in parallel - the 1 s default flakes under load. */
const SLOW = { timeout: 5000 };

describe("DesignTokensPage open()", () => {
  it("is latest-wins: opening B then C settles on C even when B resolves last", async () => {
    const resolvers = new Map<string, (d: DesignSystemDetail) => void>();
    interceptGetSystem = (id) =>
      new Promise<DesignSystemDetail>((resolve) => {
        resolvers.set(id, resolve);
      });

    render(<DesignTokensPage />);
    fireEvent.click(await screen.findByText("Lumen Editorial", undefined, SLOW));
    fireEvent.click(screen.getByText("Lumen App Shell"));

    // The LATER click (C) resolves first...
    await act(async () => {
      resolvers.get("ds_appshell")!(detailOf("ds_appshell", "Lumen App Shell"));
    });
    await waitFor(() => expect(nameInput().value).toBe("Lumen App Shell"), SLOW);

    // ...and the stale B response must NOT re-seat the editor afterwards.
    await act(async () => {
      resolvers.get("ds_editorial")!(detailOf("ds_editorial", "Lumen Editorial"));
    });
    expect(nameInput().value).toBe("Lumen App Shell");
  }, 20000);
});

describe("DesignTokensPage onSaved", () => {
  it("treats a list-refresh failure as a warning, and the next save does not self-409", async () => {
    render(<DesignTokensPage />);
    fireEvent.click(await screen.findByText("Lumen Editorial", undefined, SLOW));
    await waitFor(() => expect(nameInput().value).toBe("Lumen Editorial"), SLOW);

    failListRefresh = true;
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Saved."), SLOW);
    await waitFor(() => expect(toastMock.warning).toHaveBeenCalledTimes(1), SLOW);
    expect(toastMock.error).not.toHaveBeenCalled();

    // The editor advanced to the saved detail (fresh updated_at), so a second
    // save carries the right expected_updated_at instead of 409ing.
    await waitFor(
      () =>
        expect(
          (screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled,
        ).toBe(false),
      SLOW,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledTimes(2), SLOW);
    expect(toastMock.error).not.toHaveBeenCalled();
  }, 20000);
});
