/**
 * Saved-view active matching (Work OS rehaul W7) - which chip highlights for
 * the current /work URL.
 *
 * Pins:
 *  - a view is active when its params are a SUBSET of the current URL's
 *    (extra live filters don't un-highlight the view you started from);
 *  - empty-string params in a stored view are ignored (not pinned);
 *  - among several matches the most specific view (most pinned params) wins,
 *    ties keeping the first in chip order.
 */

import { describe, expect, it } from "vitest";

import { bestMatchingViewId, viewIsActive } from "@/hooks/use-views";

describe("viewIsActive", () => {
  it("matches when every pinned param equals the URL's", () => {
    expect(
      viewIsActive({ scope: "all", type: "bug" }, { scope: "all", type: "bug" }),
    ).toBe(true);
  });

  it("is a subset match - extra URL params don't break it", () => {
    expect(
      viewIsActive({ scope: "all" }, { scope: "all", label: "l1", q: "auth" }),
    ).toBe(true);
  });

  it("misses when a pinned param differs or is absent", () => {
    expect(viewIsActive({ scope: "all" }, { scope: "me" })).toBe(false);
    expect(viewIsActive({ type: "bug" }, {})).toBe(false);
  });

  it("ignores empty-string params stored on the view", () => {
    expect(viewIsActive({ scope: "all", domain: "" }, { scope: "all" })).toBe(true);
  });
});

describe("bestMatchingViewId", () => {
  const views = [
    { id: "broad", params: { scope: "all" } },
    { id: "narrow", params: { scope: "all", type: "bug" } },
    { id: "other", params: { scope: "me" } },
  ];

  it("prefers the most specific matching view", () => {
    expect(
      bestMatchingViewId(views, { scope: "all", type: "bug", q: "x" }),
    ).toBe("narrow");
  });

  it("falls back to a broader match when the narrow one misses", () => {
    expect(bestMatchingViewId(views, { scope: "all", type: "chore" })).toBe("broad");
  });

  it("returns null when nothing matches", () => {
    expect(bestMatchingViewId(views, { scope: "review" })).toBe(null);
  });

  it("keeps the first view on a specificity tie", () => {
    const tied = [
      { id: "first", params: { scope: "all" } },
      { id: "second", params: { view: "active" } },
    ];
    expect(bestMatchingViewId(tied, { scope: "all", view: "active" })).toBe("first");
  });
});
