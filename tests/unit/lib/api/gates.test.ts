/**
 * Unit tests for `lib/api/gates.ts:phaseToGateKey` (readiness §3.6 r6).
 *
 * Translates a FE phase key (the user-facing tab label) into the
 * canonical BE `gate_key` literal the sub-agents in
 * `athena/agent/subagents/*\/agent.py` emit. The mapping is the seam
 * that fixed the approve / reject 404s in `<PhaseActionsCluster>`:
 * the FE used to pass `phaseKey` straight to the close endpoint, but
 * the BE expects e.g. `spec_approved`, not `spec`.
 *
 * Each entry is asserted explicitly so a future renamed gate key has
 * to update both halves of this test pair instead of silently drifting.
 */
import { describe, expect, it } from "vitest";

import { phaseToGateKey, PHASE_TO_GATE_KEY } from "@/lib/api/gates";

describe("phaseToGateKey", () => {
  describe("Implement track", () => {
    it("maps spec → spec_approved", () => {
      expect(phaseToGateKey("spec")).toBe("spec_approved");
    });
    it("maps plan → plan_approved", () => {
      expect(phaseToGateKey("plan")).toBe("plan_approved");
    });
    it("maps implement → implementation_complete", () => {
      expect(phaseToGateKey("implement")).toBe("implementation_complete");
    });
    it("maps review → review_approved", () => {
      expect(phaseToGateKey("review")).toBe("review_approved");
    });
    it("maps ci → ci_clean", () => {
      expect(phaseToGateKey("ci")).toBe("ci_clean");
    });
    it("maps pr → pr_authored", () => {
      expect(phaseToGateKey("pr")).toBe("pr_authored");
    });
  });

  describe("PRD track", () => {
    it("maps frame → prd_frame_ready", () => {
      expect(phaseToGateKey("frame")).toBe("prd_frame_ready");
    });
    it("maps research → prd_research_complete", () => {
      expect(phaseToGateKey("research")).toBe("prd_research_complete");
    });
    it("maps draft → prd_draft_ready", () => {
      expect(phaseToGateKey("draft")).toBe("prd_draft_ready");
    });
    it("maps signoff → prd_signoff_complete", () => {
      expect(phaseToGateKey("signoff")).toBe("prd_signoff_complete");
    });
  });

  it("returns null for unknown phase keys", () => {
    expect(phaseToGateKey("not-a-phase")).toBeNull();
    expect(phaseToGateKey("")).toBeNull();
    expect(phaseToGateKey("spec_approved")).toBeNull(); // gate_key passed as phase
  });

  it("covers every phase exported from the PhaseTabList catalogues", () => {
    // Mirrors PhaseTabList's IMPLEMENT_TABS + PRD_TABS keys. Adding a
    // tab without a gate mapping would 404 the approve button, so this
    // assertion is the early-warning trip-wire.
    const expectedPhases = [
      "spec", "plan", "implement", "review", "ci", "pr",
      "frame", "research", "draft", "signoff",
    ];
    for (const phase of expectedPhases) {
      expect(PHASE_TO_GATE_KEY[phase], `missing mapping for ${phase}`).toBeDefined();
    }
    expect(Object.keys(PHASE_TO_GATE_KEY).sort()).toEqual([...expectedPhases].sort());
  });
});
