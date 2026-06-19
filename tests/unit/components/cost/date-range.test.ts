/**
 * Cost date-range model - the month-to-date default + presets.
 * Locks the page default (the running calendar month, so the dashboard opens on
 * a decision-grade window) and that "Today" is a first-class, selectable preset.
 */

import { describe, expect, it } from "vitest";

import { PRESETS, defaultRange, resolvePreset } from "@/components/cost/date-range";

// Fixed local date so toISO() (local-calendar) is deterministic. Month is
// 0-indexed: 5 = June → 2026-06-04.
const TODAY = new Date(2026, 5, 4);

describe("cost date-range", () => {
  it("page default is the running calendar month (month-to-date)", () => {
    const r = defaultRange(TODAY);
    expect(r.preset).toBe("this_month");
    expect(r.from).toBe("2026-06-01");
    expect(r.to).toBe("2026-06-04");
  });

  it("resolves the today preset to a single day labelled Today", () => {
    const r = resolvePreset("today", TODAY);
    expect(r.label).toBe("Today");
    expect(r.from).toBe(r.to);
    expect(r.from).toBe("2026-06-04");
  });

  it("exposes Today as the first selectable picker preset", () => {
    expect(PRESETS[0]).toEqual({ key: "today", label: "Today" });
  });
});
