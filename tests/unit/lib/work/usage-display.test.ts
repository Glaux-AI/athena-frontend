/**
 * `usageExactness` + `headlineTokens` - the cockpit's honest exact-vs-estimate
 * decision for a task's token usage (ADR-089). The whole point is that Athena
 * never presents a floor/estimate as if it were the real number, and never
 * inflates an "exact" headline by summing in the overlapping floor/estimate.
 */

import { describe, expect, it } from "vitest";

import type { TaskUsage } from "@/lib/api/client";
import { headlineTokens, usageExactness } from "@/lib/work/usage-display";

const EXACT_SOURCES = new Set(["internal", "client_measured"]);

function usage(by: TaskUsage["by_source"], equivalent_usd = 0): TaskUsage {
  const prompt = by.reduce((s, b) => s + b.prompt_tokens, 0);
  const completion = by.reduce((s, b) => s + b.completion_tokens, 0);
  const exact = by
    .filter((b) => EXACT_SOURCES.has(b.source))
    .reduce((s, b) => s + b.total_tokens, 0);
  return {
    task_id: "t1",
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
    spent_usd: 0,
    by_source: by,
    exact_total_tokens: exact,
    equivalent_usd,
  };
}

function bucket(
  source: string,
  pt: number,
  ct: number,
): TaskUsage["by_source"][number] {
  return {
    source,
    calls: 1,
    prompt_tokens: pt,
    completion_tokens: ct,
    total_tokens: pt + ct,
  };
}

describe("usageExactness", () => {
  it("internal-only work is neither external nor estimated", () => {
    const r = usageExactness(usage([bucket("internal", 1000, 200)]));
    expect(r.hasExternal).toBe(false);
    expect(r.hasExact).toBe(false);
    expect(r.onlyEstimated).toBe(false);
  });

  it("a client_measured bucket marks the total EXACT, not a floor", () => {
    const r = usageExactness(
      usage(
        [bucket("internal", 1000, 200), bucket("client_measured", 50000, 8000)],
        0.42,
      ),
    );
    expect(r.hasExact).toBe(true);
    expect(r.onlyEstimated).toBe(false);
    expect(r.equivalentUsd).toBe(0.42);
  });

  it("only floor/estimate buckets -> onlyEstimated (the >= lower bound)", () => {
    const r = usageExactness(
      usage([
        bucket("internal", 1000, 200),
        bucket("measured_mcp_io", 90000, 41000),
        bucket("self_reported", 800, 200),
      ]),
    );
    expect(r.hasExternal).toBe(true);
    expect(r.hasExact).toBe(false);
    expect(r.onlyEstimated).toBe(true);
  });

  it("null usage is safe", () => {
    const r = usageExactness(null);
    expect(r.hasExternal).toBe(false);
    expect(r.onlyEstimated).toBe(false);
    expect(r.equivalentUsd).toBe(0);
  });
});

describe("headlineTokens", () => {
  it("EXACT case: counts only internal + client_measured, NOT the floor", () => {
    const u = usage([
      bucket("internal", 500, 100), // 600
      bucket("client_measured", 40000, 9000), // 49000
      bucket("measured_mcp_io", 70000, 20000), // floor, excluded
      bucket("self_reported", 800, 200), // estimate, excluded
    ]);
    // 600 + 49000 = 49600, NOT the all-bucket 140600.
    expect(headlineTokens(u)).toBe(49600);
    expect(headlineTokens(u)).not.toBe(u.total_tokens);
  });

  it("estimate-only case: the all-bucket total is the >= lower bound", () => {
    const u = usage([
      bucket("internal", 1000, 200),
      bucket("measured_mcp_io", 90000, 41000),
    ]);
    expect(headlineTokens(u)).toBe(u.total_tokens);
  });

  it("null usage -> 0", () => {
    expect(headlineTokens(null)).toBe(0);
  });
});
