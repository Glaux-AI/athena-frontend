/**
 * Sophia mascot store - the mood mapping that the live-activity bridges
 * (features/mascot/use-mascot-activity.ts) feed. Pins the §7.3 contract:
 * agent-step verbs → moods, an open gate → waiting, a clean settle → back to
 * the screen default (without clobbering the default itself).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useMascotStore } from "@/lib/stores/mascot";

const store = () => useMascotStore.getState();

beforeEach(() => store().reset());
afterEach(() => store().reset());

describe("mascot store - agent_step → mood", () => {
  it.each([
    ["plan", "thinking"],
    ["reason", "thinking"],
    ["retrieve", "reading"],
    ["read", "reading"],
    ["draft", "writing"],
    ["write", "writing"],
    ["said", "writing"],
    ["delegate", "working"],
  ])("maps kind %s to %s", (kind, mood) => {
    store().applyRunEvent({ type: "agent_step", kind });
    expect(store().mood).toBe(mood);
  });

  it("leaves the mood untouched for an unknown kind (wire-vocab drift)", () => {
    store().applyRunEvent({ type: "agent_step", kind: "read" });
    store().applyRunEvent({ type: "agent_step", kind: "totally_new_verb" });
    expect(store().mood).toBe("reading");
  });
});

describe("mascot store - other run events", () => {
  it("an open hard gate → waiting", () => {
    store().applyRunEvent({ type: "gate_pending" });
    expect(store().mood).toBe("waiting");
  });

  it("a completed run → happy", () => {
    store().applyRunEvent({ type: "run_status", status: "completed" });
    expect(store().mood).toBe("happy");
  });

  it("a failed run → focused, never sad", () => {
    store().applyRunEvent({ type: "run_status", status: "failed" });
    expect(store().mood).toBe("focused");
  });
});

describe("mascot store - screen default + clearRun", () => {
  it("clearRun drops the run mood back to the screen default", () => {
    store().setScreenDefault("working"); // e.g. a repo mid-ingest
    store().applyRunEvent({ type: "agent_step", kind: "write" });
    expect(store().mood).toBe("writing");

    store().clearRun();
    expect(store().mood).toBe("working");
    // The screen default itself is preserved.
    expect(store().screenDefault).toBe("working");
  });

  it("setScreenDefault updates the mood only when no run is overriding it", () => {
    store().setScreenDefault("reading");
    expect(store().mood).toBe("reading");

    // A run override is in place - changing the screen default must not stomp it.
    store().applyRunEvent({ type: "agent_step", kind: "plan" });
    store().setScreenDefault("idle");
    expect(store().mood).toBe("thinking");
  });
});
