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

import { ACTIVE_ORG_KEY } from "@/lib/api/client";
import { config } from "@/lib/config";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export interface SSEEvent {
  id: string;
  event: string;
  data: string;
}

/** Thrown when the SSE connection can't be established. Carries the HTTP
 *  status so callers can distinguish "endpoint not available" (404/405 -
 *  safe to fall back to a non-streaming request) from transient failures. */
export class SSEError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`SSE connection failed: ${status}`);
    this.name = "SSEError";
    this.status = status;
  }
}

export interface SSEOptions {
  signal?: AbortSignal;
  lastEventId?: string;
  /** HTTP method. Defaults to GET. Set "POST" for streams that carry a
   *  request body (e.g. chat send → live tool-call stream). */
  method?: "GET" | "POST";
  /** JSON-serialisable request body, sent as `application/json`. Only
   *  meaningful when `method` is "POST". */
  body?: unknown;
}

export async function* sseStream(
  url: string,
  opts: SSEOptions = {},
): AsyncGenerator<SSEEvent, void, void> {
  // BE returns `stream_url` as a relative path (e.g. `/v1/tasks/{id}/events`).
  // In the browser, a relative fetch resolves against the FE origin
  // (localhost:3000) instead of the API origin (config.apiUrl), so we have
  // to prefix here. Absolute URLs pass through unchanged.
  const resolvedUrl = url.startsWith("/") ? `${config.apiUrl}${url}` : url;

  const headers: Record<string, string> = {
    Accept: "text/event-stream",
    // End-to-end trace id for the stream request (mirror lib/api/client.ts).
    "X-Trace-Id": crypto.randomUUID(),
  };
  if (opts.lastEventId) headers["Last-Event-ID"] = opts.lastEventId;

  // Attach the Supabase access token. Cross-origin cookies from
  // localhost:3000 -> localhost:8000 aren't sent (different origins),
  // so the Bearer is the only auth path. Mirror lib/api/client.ts:40-43.
  if (config.supabase.isConfigured()) {
    try {
      const supabase = getBrowserSupabase();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) headers["Authorization"] = `Bearer ${token}`;
    } catch {
      // Server-side render - no browser client. SSE is browser-only.
    }
  }
  // Active-org header - the SAME one apiFetch injects. Without it the
  // server resolved the user's DEFAULT org and 404'd every stream for a
  // resource in any other org ("Task not found" + a permanent
  // "Live updates dropped - reconnecting" loop on the cockpit).
  if (typeof window !== "undefined") {
    const orgId = window.localStorage.getItem(ACTIVE_ORG_KEY);
    if (orgId) headers["X-Athena-Org-Id"] = orgId;
  }

  const fetchInit: RequestInit = {
    credentials: "include",
    headers,
  };
  if (opts.method) fetchInit.method = opts.method;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    fetchInit.body = JSON.stringify(opts.body);
  }
  if (opts.signal) fetchInit.signal = opts.signal;
  const res = await fetch(resolvedUrl, fetchInit);

  if (!res.ok || !res.body) {
    throw new SSEError(res.status);
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
          // Comment / heartbeat - ignore
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
        // `retry:` ignored - our reconnect logic owns this.
      }
    }
  } finally {
    reader.releaseLock();
  }
}
