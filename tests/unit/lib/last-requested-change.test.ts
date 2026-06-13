/**
 * lastRequestedChange - the note from the most recent "request changes" on a
 * stage's gate. A gate reject sends the stage back to `ready`, so this is what
 * lets the cockpit pre-fill the re-run steer with the user's own words instead
 * of an empty box (the reported bug).
 */

import { describe, expect, it } from "vitest";

import type { ThreadEntry } from "@/lib/api/client";
import { lastRequestedChange } from "@/lib/work/last-requested-change";

let seq = 0;
const entry = (over: Partial<ThreadEntry>): ThreadEntry => ({
  id: `e${seq}`,
  task_id: "t1",
  seq: seq++,
  kind: "rejection",
  author_kind: "user",
  author_id: "u1",
  body: null,
  gate_key: null,
  created_at: "2026-06-13T10:00:00Z",
  ...over,
});

describe("lastRequestedChange", () => {
  it("returns the note from the latest rejection on the stage's gate", () => {
    const entries = [
      entry({ kind: "rejection", gate_key: "execution_signoff", body: "first pass" }),
      entry({ kind: "user_message", body: "unrelated" }),
      entry({ kind: "rejection", gate_key: "execution_signoff", body: "tighten validation" }),
    ];
    expect(lastRequestedChange(entries, "execution")).toBe("tighten validation");
  });

  it("ignores rejections on a DIFFERENT stage's gate", () => {
    const entries = [
      entry({ kind: "rejection", gate_key: "plan_signoff", body: "wrong stage" }),
    ];
    expect(lastRequestedChange(entries, "execution")).toBeNull();
  });

  it("ignores non-rejection entries and empty notes", () => {
    const entries = [
      entry({ kind: "approval", gate_key: "execution_signoff", body: "lgtm" }),
      entry({ kind: "rejection", gate_key: "execution_signoff", body: "   " }),
    ];
    expect(lastRequestedChange(entries, "execution")).toBeNull();
  });

  it("returns null for no stage or no entries", () => {
    expect(lastRequestedChange([], "execution")).toBeNull();
    expect(lastRequestedChange([entry({ body: "x", gate_key: "execution_signoff" })], null)).toBeNull();
  });
});
