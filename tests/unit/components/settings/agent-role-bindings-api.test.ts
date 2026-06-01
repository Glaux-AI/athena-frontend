/**
 * Task A — per-agent → LLM-role roster (agent-role-bindings) round-trips.
 *
 * Pins the contract the AgentRoleSection card depends on:
 *   - the roster includes the full agent set, incl. `chat` and the newly
 *     added `ingestor` (default role workhorse-cheap, like the BE)
 *   - PUT sets an override (is_overridden flips, effective role changes)
 *   - PUT validates the role against the canonical 8
 *   - DELETE reverts to the code default (is_overridden back to false)
 *
 * Round-trips through the mock handler stack, mirroring the BE so the
 * picker can't ship a payload the live BE rejects.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { api, ApiError } from "@/lib/api/client";

const ACTIVE_ORG_KEY = "athena.activeOrgId";
const TEST_ORG = "org_test_agents";

beforeEach(() => {
  if (typeof window !== "undefined") {
    window.localStorage.clear();
    window.localStorage.setItem(ACTIVE_ORG_KEY, TEST_ORG);
  }
});

afterEach(() => {
  if (typeof window !== "undefined") window.localStorage.clear();
});

describe("api.agentRoleBindings — roster + override CRUD", () => {
  it("lists the full agent roster including chat and ingestor", async () => {
    const roster = await api.agentRoleBindings.list(TEST_ORG);
    const names = roster.map((b) => b.agent_name);
    expect(names).toContain("chat");
    expect(names).toContain("ingestor");
    // A couple of the established agents are still present.
    expect(names).toContain("prd_framer");
    expect(names).toContain("implementer");
  });

  it("ingestor defaults to workhorse-cheap and is not overridden out of the box", async () => {
    const roster = await api.agentRoleBindings.list(TEST_ORG);
    const ingestor = roster.find((b) => b.agent_name === "ingestor");
    expect(ingestor).toBeDefined();
    expect(ingestor!.default_role).toBe("workhorse-cheap");
    expect(ingestor!.role).toBe("workhorse-cheap");
    expect(ingestor!.is_overridden).toBe(false);
  });

  it("PUT sets an override on ingestor (effective role changes, is_overridden flips)", async () => {
    const updated = await api.agentRoleBindings.put(TEST_ORG, "ingestor", "heavy-reasoner");
    expect(updated.role).toBe("heavy-reasoner");
    expect(updated.default_role).toBe("workhorse-cheap");
    expect(updated.is_overridden).toBe(true);
  });

  it("DELETE reverts ingestor to its code default", async () => {
    await api.agentRoleBindings.put(TEST_ORG, "ingestor", "heavy-reasoner");
    const reverted = await api.agentRoleBindings.delete(TEST_ORG, "ingestor");
    expect(reverted.role).toBe("workhorse-cheap");
    expect(reverted.is_overridden).toBe(false);
  });

  it("PUT rejects a role outside the canonical 8", async () => {
    await expect(
      api.agentRoleBindings.put(TEST_ORG, "ingestor", "made-up-role" as never),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("PUT 404s on an unknown agent name", async () => {
    await expect(
      api.agentRoleBindings.put(TEST_ORG, "not-an-agent", "planner"),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
