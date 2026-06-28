import { describe, expect, it } from "vitest";

import { effectivePriorityRank, splitLabelKey } from "@/lib/work/label-meta";
import type { Label } from "@/lib/api/client";

const label = (id: string, key: string): Label =>
  ({ id, key, color: "slate", description: null, scope: "global", archived: false });

describe("splitLabelKey", () => {
  it("splits a single ':' group prefix", () => {
    expect(splitLabelKey("customer:acme")).toEqual({ prefix: "customer", value: "acme" });
    expect(splitLabelKey("tech-debt")).toEqual({ prefix: null, value: "tech-debt" });
  });
});

describe("effectivePriorityRank - sev override", () => {
  const labelsById = new Map<string, Label>([
    ["s1", label("s1", "sev:1")],
    ["s2", label("s2", "sev:2")],
    ["td", label("td", "tech-debt")],
  ]);

  it("sev:1 beats every priority", () => {
    const a = { priority: "low" as const, label_ids: ["s1"] };
    const b = { priority: "urgent" as const, label_ids: [] };
    expect(effectivePriorityRank(a, labelsById)).toBeLessThan(
      effectivePriorityRank(b, labelsById),
    );
  });

  it("sev:2 beats urgent but loses to sev:1", () => {
    expect(effectivePriorityRank({ priority: "low" as const, label_ids: ["s2"] }, labelsById))
      .toBeLessThan(effectivePriorityRank({ priority: "urgent" as const, label_ids: [] }, labelsById));
    expect(effectivePriorityRank({ priority: "low" as const, label_ids: ["s1"] }, labelsById))
      .toBeLessThan(effectivePriorityRank({ priority: "low" as const, label_ids: ["s2"] }, labelsById));
  });

  it("a non-sev label does not change the priority rank", () => {
    expect(effectivePriorityRank({ priority: "medium" as const, label_ids: ["td"] }, labelsById))
      .toBe(effectivePriorityRank({ priority: "medium" as const, label_ids: [] }, labelsById));
  });
});
