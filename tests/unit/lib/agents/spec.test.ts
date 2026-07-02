import { describe, expect, it } from "vitest";

import { compileAgentPrompt, emptyAgentSpec, normalizeAgentSpec } from "@/lib/agents/spec";
import type { AgentSpec } from "@/lib/api/client";

const FULL: AgentSpec = {
  version: 1,
  mode: "guided",
  purpose: "You are a release-notes writer.",
  goals: ["Summarise merged work", "Keep notes readable"],
  rules: ["Never invent changes", "Cite task ids"],
  tone: "Friendly and concise.",
  output_format: "Markdown with a heading per release.",
  examples: ["When asked for last week, group by team"],
};

describe("compileAgentPrompt", () => {
  it("compiles every section in order", () => {
    const out = compileAgentPrompt(FULL);
    expect(out).toContain("You are a release-notes writer.");
    expect(out).toContain("## Goals\n- Summarise merged work\n- Keep notes readable");
    expect(out).toContain("## Rules\n- Never invent changes");
    expect(out).toContain("## Tone & style\nFriendly and concise.");
    expect(out).toContain("## Output format\nMarkdown with a heading per release.");
    expect(out).toContain("## Examples\n- When asked for last week, group by team");
    // Purpose leads; sections follow in the declared order.
    expect(out.indexOf("## Goals")).toBeLessThan(out.indexOf("## Rules"));
    expect(out.indexOf("## Rules")).toBeLessThan(out.indexOf("## Tone & style"));
  });

  it("skips empty sections - a purpose-only spec is a clean one-liner", () => {
    const out = compileAgentPrompt({ ...emptyAgentSpec(), purpose: "You are a helper." });
    expect(out).toBe("You are a helper.");
  });

  it("drops blank list rows instead of rendering empty bullets", () => {
    const out = compileAgentPrompt({
      ...emptyAgentSpec(),
      purpose: "P",
      goals: ["  ", "Real goal", ""],
    });
    expect(out).toContain("## Goals\n- Real goal");
    expect(out).not.toContain("- \n");
  });

  it("returns an empty string for an empty spec", () => {
    expect(compileAgentPrompt(emptyAgentSpec())).toBe("");
  });
});

describe("normalizeAgentSpec", () => {
  it("returns null for null / non-object payloads", () => {
    expect(normalizeAgentSpec(null)).toBeNull();
    expect(normalizeAgentSpec(undefined)).toBeNull();
  });

  it("repairs missing fields and junk list entries", () => {
    const repaired = normalizeAgentSpec({
      mode: "guided",
      purpose: "P",
      goals: ["ok", "", "   "] as string[],
    });
    expect(repaired).not.toBeNull();
    expect(repaired?.goals).toEqual(["ok"]);
    expect(repaired?.rules).toEqual([]);
    expect(repaired?.tone).toBe("");
    expect(repaired?.version).toBe(1);
  });

  it("defaults an unknown mode to guided", () => {
    expect(normalizeAgentSpec({ mode: "weird" as AgentSpec["mode"] })?.mode).toBe("guided");
  });
});
