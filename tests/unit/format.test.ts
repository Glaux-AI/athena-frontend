import { describe, expect, it } from "vitest";

import { formatUsd } from "@/lib/utils/format";

describe("formatUsd", () => {
  it("formats whole-dollar amounts", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(42)).toBe("$42.00");
  });

  it("keeps sub-cent precision up to three decimals", () => {
    expect(formatUsd(0.125)).toBe("$0.125");
  });

  it("pins a two-decimal floor for ordinary amounts", () => {
    expect(formatUsd(1.5)).toBe("$1.50");
  });

  it("handles large amounts with separators", () => {
    expect(formatUsd(1234567.89)).toBe("$1,234,567.89");
  });
});
