// @vitest-environment jsdom

/**
 * useDesignTokens - the studio-side hook over assigned design systems. Pins
 * the module-level system cache's invalidation seam: a token edit saved on
 * /design-tokens calls `invalidateDesignSystemCache`, so the studio must
 * refetch instead of baking stale token values into artifacts for the rest
 * of the 5-minute TTL.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";

import type { DesignSystemDetail } from "@/lib/api/client";

const getSystem = vi.fn<(id: string) => Promise<DesignSystemDetail>>();

vi.mock("@/lib/api/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/api/client")>();
  return {
    ...mod,
    api: {
      ...mod.api,
      design: { ...mod.api.design, getSystem: (id: string) => getSystem(id) },
    },
  };
});

import { invalidateDesignSystemCache, useDesignTokens } from "@/lib/design/use-design-tokens";

afterEach(() => {
  cleanup();
  invalidateDesignSystemCache();
  getSystem.mockReset();
});

function detailWith(id: string, value: string): DesignSystemDetail {
  return {
    id,
    name: "System",
    description: null,
    css: `:root { --color-primary: ${value}; }`,
    origin: "manual",
    updated_at: "2026-07-01T00:00:00Z",
    domain_ids: [],
    tokens: [{ name: "--color-primary", value, group: "color", source: "system" }],
    components: [],
  };
}

async function primaryValue(ids: string[]): Promise<string | undefined> {
  const hook = renderHook(() => useDesignTokens(ids));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  const value = hook.result.current.set?.tokens[0]?.value;
  hook.unmount();
  return value;
}

describe("useDesignTokens system cache invalidation", () => {
  it("serves the cached system within the TTL and refetches after invalidate(id)", async () => {
    getSystem.mockResolvedValue(detailWith("ds_1", "#111111"));
    expect(await primaryValue(["ds_1"])).toBe("#111111");
    expect(getSystem).toHaveBeenCalledTimes(1);

    // A save happened on /design-tokens - without invalidation the stale
    // entry would be served for up to 5 minutes.
    getSystem.mockResolvedValue(detailWith("ds_1", "#222222"));
    expect(await primaryValue(["ds_1"])).toBe("#111111");
    expect(getSystem).toHaveBeenCalledTimes(1); // cache hit, no refetch

    invalidateDesignSystemCache("ds_1");
    expect(await primaryValue(["ds_1"])).toBe("#222222");
    expect(getSystem).toHaveBeenCalledTimes(2);
  });

  it("invalidate() with no id clears every cached system", async () => {
    getSystem.mockImplementation((id) => Promise.resolve(detailWith(id, "#111111")));
    await primaryValue(["ds_1", "ds_2"]);
    expect(getSystem).toHaveBeenCalledTimes(2);

    invalidateDesignSystemCache();
    await primaryValue(["ds_1", "ds_2"]);
    expect(getSystem).toHaveBeenCalledTimes(4);
  });
});
