import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked SSE frames the fake `sseStream` will replay for each test.
const frames: Array<{ event: string; data: string }> = [];

vi.mock("@/lib/sse/event-stream", () => ({
  sseStream: async function* () {
    for (const f of frames) yield { id: "", event: f.event, data: f.data };
  },
  SSEError: class SSEError extends Error {
    status: number;
    constructor(status: number) {
      super(`SSE ${status}`);
      this.status = status;
    }
  },
}));

import { streamGenerateSystem, type DesignGenEvent } from "@/lib/api/design-stream";

async function collect(): Promise<DesignGenEvent[]> {
  const out: DesignGenEvent[] = [];
  for await (const ev of streamGenerateSystem({ prompt: "x" })) out.push(ev);
  return out;
}

describe("streamGenerateSystem", () => {
  beforeEach(() => {
    frames.length = 0;
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
});
