// @vitest-environment jsdom

/**
 * `isRunCancellable` / `isRunDeletable` — the predicates behind the task
 * header's Cancel + Delete buttons. They are exact inverses: a run is
 * cancellable while active and deletable once terminal, so the two buttons are
 * mutually exclusive (cancel an active run first, then delete the record).
 * Pins the BE guards (409-on-terminal cancel / 409-on-active delete).
 */
import { describe, expect, it } from "vitest";

import { isRunCancellable, isRunDeletable } from "@/features/runs/use-run-stream";
import type { RunStatus } from "@/lib/api/client";

const ACTIVE: RunStatus[] = ["queued", "running", "awaiting_gate"];
const TERMINAL: RunStatus[] = ["completed", "failed", "cancelled", "gate_rejected"];

describe("isRunCancellable", () => {
  it("is true for non-terminal statuses", () => {
    for (const s of ACTIVE) expect(isRunCancellable(s)).toBe(true);
  });

  it("is false for terminal statuses", () => {
    for (const s of TERMINAL) expect(isRunCancellable(s)).toBe(false);
  });
});

describe("isRunDeletable", () => {
  it("is true for terminal statuses", () => {
    for (const s of TERMINAL) expect(isRunDeletable(s)).toBe(true);
  });

  it("is false for active statuses", () => {
    for (const s of ACTIVE) expect(isRunDeletable(s)).toBe(false);
  });

  it("is the exact inverse of isRunCancellable", () => {
    for (const s of [...ACTIVE, ...TERMINAL]) {
      expect(isRunDeletable(s)).toBe(!isRunCancellable(s));
    }
  });
});
