import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked SSE frames the fake `sseStream` replays; `throwStatus` makes it throw an
// SSEError instead (to exercise the non-stream fallback).
const frames: Array<{ event: string; data: string }> = [];
let throwStatus: number | null = null;

vi.mock("@/lib/sse/event-stream", () => {
  class SSEError extends Error {
    status: number;
    constructor(status: number) {
      super(`SSE ${status}`);
      this.status = status;
    }
  }
  return {
    sseStream: async function* () {
      if (throwStatus !== null) throw new SSEError(throwStatus);
      for (const f of frames) yield { id: "", event: f.event, data: f.data };
    },
    SSEError,
  };
});

import { api } from "@/lib/api/client";
import { streamGenerateSystem, type DesignGenEvent } from "@/lib/api/design-stream";

async function collect(signal?: AbortSignal): Promise<DesignGenEvent[]> {
  const out: DesignGenEvent[] = [];
  for await (const ev of streamGenerateSystem({ prompt: "x" }, signal)) out.push(ev);
  return out;
}

describe("streamGenerateSystem", () => {
  beforeEach(() => {
    frames.length = 0;
    throwStatus = null;
  });

  it("maps agent_step → status and done → result", async () => {
    frames.push({ event: "agent_step", data: JSON.stringify({ kind: "status", text: "Designing..." }) });
    frames.push({
      event: "done",
      data: JSON.stringify({ name: "Ink", description: "", css: ":root{}", components: [], origin: "ai" }),
    });
    expect(await collect()).toEqual([
      { type: "status", text: "Designing..." },
      { type: "done", result: { name: "Ink", description: "", css: ":root{}", components: [], origin: "ai" } },
    ]);
  });

  it("drops empty agent_step frames and maps error frames", async () => {
    frames.push({ event: "agent_step", data: JSON.stringify({ kind: "plan" }) }); // no text → dropped
    frames.push({ event: "error", data: JSON.stringify({ code: "boom", message: "nope" }) });
    expect(await collect()).toEqual([{ type: "error", code: "boom", message: "nope" }]);
  });

  it("falls back to the non-stream call WITH the abort signal on 404", async () => {
    throwStatus = 404;
    const result = { name: "Fallback", description: "", css: ":root{}", components: [], origin: "ai" as const };
    const spy = vi.spyOn(api.design, "generateSystem").mockResolvedValue(result);
    const controller = new AbortController();
    expect(await collect(controller.signal)).toEqual([{ type: "done", result }]);
    // The signal is threaded so navigating away cancels the fallback too.
    expect(spy).toHaveBeenCalledWith({ prompt: "x" }, controller.signal);
    spy.mockRestore();
  });
});
