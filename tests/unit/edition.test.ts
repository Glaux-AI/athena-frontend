import { describe, expect, it, vi } from "vitest";

import { editionLabel, normalizeEdition } from "@/lib/utils/edition";

describe("normalizeEdition", () => {
  it("passes through canonical values", () => {
    expect(normalizeEdition("solo")).toBe("solo");
    expect(normalizeEdition("pro")).toBe("pro");
    expect(normalizeEdition("enterprise")).toBe("enterprise");
  });

  it("maps legacy `team` and `business` to `pro`", () => {
    expect(normalizeEdition("team")).toBe("pro");
    expect(normalizeEdition("business")).toBe("pro");
  });

  it("falls back to `solo` and warns on unknown values", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(normalizeEdition("starter")).toBe("solo");
    expect(warn).toHaveBeenCalledWith(
      "[edition] Unknown value, defaulting to solo:",
      "starter",
    );
    warn.mockRestore();
  });
});

describe("editionLabel", () => {
  it("titles each edition", () => {
    expect(editionLabel("solo")).toBe("Solo");
    expect(editionLabel("pro")).toBe("Pro");
    expect(editionLabel("enterprise")).toBe("Enterprise");
  });
});
