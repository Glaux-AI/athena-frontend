/**
 * SSE consumer built on `fetch` + `ReadableStream` (instead of EventSource).
 *
 * Why not `EventSource`?
 * - EventSource doesn't support POST or custom headers.
 * - We want one client that works for our (future) cookie-authed SSE too.
 *
 * The parser implements just enough of the SSE wire format to handle our
 * server output: `id:`, `event:`, `data:` lines, blank-line message separator.
 */

export interface SSEEvent {
  id: string;
  event: string;
  data: string;
}

export interface SSEOptions {
  signal?: AbortSignal;
  lastEventId?: string;
}

export async function* sseStream(
  url: string,
  opts: SSEOptions = {},
): AsyncGenerator<SSEEvent, void, void> {
  const headers: HeadersInit = { Accept: "text/event-stream" };
  if (opts.lastEventId) headers["Last-Event-ID"] = opts.lastEventId;

  const fetchInit: RequestInit = {
    credentials: "include",
    headers,
  };
  if (opts.signal) fetchInit.signal = opts.signal;
  const res = await fetch(url, fetchInit);

  if (!res.ok || !res.body) {
    throw new Error(`SSE connection failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  let cur: Partial<SSEEvent> = {};

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE messages are separated by a blank line. Walk linewise.
      let nlIdx;
      while ((nlIdx = buffer.indexOf("\n")) >= 0) {
        const rawLine = buffer.slice(0, nlIdx);
        buffer = buffer.slice(nlIdx + 1);
        const line = rawLine.replace(/\r$/, "");

        if (line === "") {
          // Dispatch
          if (cur.event !== undefined || cur.data !== undefined) {
            yield {
              id: cur.id ?? "",
              event: cur.event ?? "message",
              data: cur.data ?? "",
            };
          }
          cur = {};
          continue;
        }

        if (line.startsWith(":")) {
          // Comment / heartbeat — ignore
          continue;
        }

        const colon = line.indexOf(":");
        const field = colon >= 0 ? line.slice(0, colon) : line;
        const valueStr = colon >= 0
          ? line.slice(colon + 1).replace(/^ /, "")
          : "";

        if (field === "id") cur.id = valueStr;
        else if (field === "event") cur.event = valueStr;
        else if (field === "data") {
          // Multi-line data fields are joined with newlines per spec.
          cur.data = cur.data === undefined ? valueStr : `${cur.data}\n${valueStr}`;
        }
        // `retry:` ignored — our reconnect logic owns this.
      }
    }
  } finally {
    reader.releaseLock();
  }
}
