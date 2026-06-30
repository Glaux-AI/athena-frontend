/**
 * UNAUTHENTICATED SSE consumer for the public showcase chat.
 *
 * A deliberately self-contained twin of `lib/sse/event-stream.ts` that imports
 * NOTHING auth-related (no Supabase client, no active-org store), so it is
 * structurally incapable of attaching a Bearer token or an `X-Athena-Org-Id`
 * header to a public request. `credentials: "omit"` means no cookies are sent
 * either. The public showcase chat must never carry a user identity.
 *
 * The wire parser is the same minimal SSE format the authed consumer uses
 * (`event:` / `data:` lines, blank-line separator).
 */

import { config } from "@/lib/config";

export interface PublicSSEEvent {
  event: string;
  data: string;
}

/** Thrown when the public SSE connection can't be established. */
export class PublicSSEError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`Public SSE connection failed: ${status}`);
    this.name = "PublicSSEError";
    this.status = status;
  }
}

export interface PublicSSEOptions {
  signal?: AbortSignal;
  /** JSON-serialisable request body, sent as `application/json`. */
  body?: unknown;
}

export async function* publicSseStream(
  url: string,
  opts: PublicSSEOptions = {},
): AsyncGenerator<PublicSSEEvent, void, void> {
  const resolvedUrl = url.startsWith("/") ? `${config.apiUrl}${url}` : url;

  const headers: Record<string, string> = {
    Accept: "text/event-stream",
    "Content-Type": "application/json",
    "X-Trace-Id": crypto.randomUUID(),
  };
  // NO Authorization, NO X-Athena-Org-Id, NO credentials - this is a public,
  // unauthenticated stream by construction.
  const fetchInit: RequestInit = {
    method: "POST",
    headers,
    credentials: "omit",
    body: JSON.stringify(opts.body ?? {}),
  };
  if (opts.signal) fetchInit.signal = opts.signal;

  const res = await fetch(resolvedUrl, fetchInit);
  if (!res.ok || !res.body) {
    throw new PublicSSEError(res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let cur: Partial<PublicSSEEvent> = {};

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let nlIdx;
      while ((nlIdx = buffer.indexOf("\n")) >= 0) {
        const rawLine = buffer.slice(0, nlIdx);
        buffer = buffer.slice(nlIdx + 1);
        const line = rawLine.replace(/\r$/, "");

        if (line === "") {
          if (cur.event !== undefined || cur.data !== undefined) {
            yield { event: cur.event ?? "message", data: cur.data ?? "" };
          }
          cur = {};
          continue;
        }
        if (line.startsWith(":")) continue; // comment / heartbeat

        const colon = line.indexOf(":");
        const field = colon >= 0 ? line.slice(0, colon) : line;
        const valueStr = colon >= 0 ? line.slice(colon + 1).replace(/^ /, "") : "";

        if (field === "event") cur.event = valueStr;
        else if (field === "data") {
          cur.data = cur.data === undefined ? valueStr : `${cur.data}\n${valueStr}`;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
