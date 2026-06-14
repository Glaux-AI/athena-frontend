import { describe, expect, it } from "vitest";

import { formatDate, formatDateTime, formatUsd } from "@/lib/utils/format";

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

describe("formatDateTime / formatDate", () => {
  it("renders an absolute moment with the year and time (not a relative 'ago')", () => {
    const out = formatDateTime("2026-06-14T15:42:00Z");
    expect(out).toContain("2026");
    expect(out).not.toMatch(/ago/);
    // Carries a time component (hour:minute) alongside the date.
    expect(out).toMatch(/\d{1,2}:\d{2}/);
  });

  it("formatDate renders the date with the year and no time", () => {
    const out = formatDate("2026-06-14T15:42:00Z");
    expect(out).toContain("2026");
    expect(out).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("returns an invalid value verbatim instead of 'Invalid Date'", () => {
    expect(formatDateTime("not-a-date")).toBe("not-a-date");
    expect(formatDate("nope")).toBe("nope");
  });
});
