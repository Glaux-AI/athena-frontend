"use client";

/**
 * MessageAttachments - read-only render of the files attached to a chat turn.
 *
 * Given the message's `attachment_ids`, resolves each via `api.attachments.get`
 * (which returns metadata + a short-lived presigned `preview_url` for images)
 * and renders image thumbnails (click to open full) + document chips. Used
 * under the user bubble. Tokens-only.
 */

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";

import { api, type AttachmentOut } from "@/lib/api/client";

export function MessageAttachments({ ids }: { ids: string[] | undefined }) {
  const [items, setItems] = useState<AttachmentOut[]>([]);
  const key = (ids ?? []).join(",");

  useEffect(() => {
    if (!ids || ids.length === 0) {
      setItems([]);
      return;
    }
    let cancelled = false;
    void Promise.all(ids.map((id) => api.attachments.get(id).catch(() => null))).then((res) => {
      if (!cancelled) setItems(res.filter((a): a is AttachmentOut => a !== null));
    });
    return () => {
      cancelled = true;
    };
    // `key` is the stable join of ids; `ids` itself is a fresh array each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!ids || ids.length === 0 || items.length === 0) return null;

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {items.map((a) =>
        a.kind === "image" && a.preview_url ? (
          <a
            key={a.id}
            href={a.preview_url}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-lg border border-[var(--border)]"
            title={a.filename}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived presigned thumbnail */}
            <img src={a.preview_url} alt={a.filename} className="max-h-40 max-w-[12rem] object-cover" />
          </a>
        ) : (
          <span
            key={a.id}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs text-[var(--text)]"
            title={a.status === "failed" ? a.error ?? "Could not read this file." : a.filename}
          >
            <FileText className="size-3.5 text-[var(--text-muted)]" />
            <span className="max-w-[12rem] truncate">{a.filename}</span>
          </span>
        ),
      )}
    </div>
  );
}
