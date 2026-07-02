/**
 * Mock /v1/design/token-sets handlers - pins the two behaviours where the mock
 * must mirror the real backend exactly:
 *   - duplicate does NOT copy domain assignments (a copy starts unassigned);
 *   - PUT /domains writes the join only - it never bumps the parent row's
 *     updated_at (the optimistic-concurrency stamp), so a domain toggle can
 *     never manufacture a stale_write 409 on the next save.
 */

import { describe, expect, it } from "vitest";

import type { DesignSystemDetail } from "@/lib/api/client";
import { handleMockRequest } from "@/lib/api/mock/handlers";

async function getDetail(id: string): Promise<DesignSystemDetail> {
  const res = await handleMockRequest(`/v1/design/token-sets/${id}`);
  expect(res.status).toBe(200);
  return res.body as DesignSystemDetail;
}

describe("mock design token-set handlers", () => {
  it("duplicate copies the system but not its domain assignments", async () => {
    const src = await getDetail("ds_appshell");
    expect(src.domain_ids.length).toBeGreaterThan(0);

    const res = await handleMockRequest("/v1/design/token-sets/ds_appshell/duplicate", {
      method: "POST",
    });
    expect(res.status).toBe(201);
    const copy = res.body as DesignSystemDetail;
    expect(copy.name).toBe(`${src.name} (copy)`);
    expect(copy.css).toBe(src.css);
    expect(copy.domain_ids).toEqual([]);
  });

  it("PUT /domains updates assignments without bumping updated_at", async () => {
    const before = await getDetail("ds_editorial");
    const res = await handleMockRequest("/v1/design/token-sets/ds_editorial/domains", {
      method: "PUT",
      body: JSON.stringify({ domain_ids: ["dom_inbox", "dom_billing"] }),
    });
    expect(res.status).toBe(200);
    const after = res.body as DesignSystemDetail;
    expect(after.domain_ids).toEqual(["dom_inbox", "dom_billing"]);
    expect(after.updated_at).toBe(before.updated_at);
  });
});
