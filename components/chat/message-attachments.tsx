"use client";

/**
 * MessageAttachments - read-only render of the files attached to a chat turn.
 *
 * Given the message's `attachment_ids`, resolves each via `api.attachments.get`
 * (metadata) and renders:
 *   - images as a small thumbnail; click enlarges it in a lightbox,
 *   - documents (and anything non-image) as a clickable link chip that opens
 *     the file.
 *
 * The bytes are fetched WITH AUTH from `GET /v1/attachments/{id}/content` and
 * rendered via a `blob:` URL (see `api.attachments.blobUrl`) - the app uses
 * Bearer tokens, so a raw `<img src>` to a cross-origin presigned URL would be
 * unauthenticated AND blocked by the `img-src` CSP; `blob:` is allowed. A blob
 * that fails to load degrades to a plain (non-broken) chip. Tokens-only.
 */

import { useEffect, useState } from "react";
import { AlertCircle, FileText, Loader2, X } from "lucide-react";

import { api, type AttachmentOut } from "@/lib/api/client";

/** Fetch an attachment's bytes (auth'd) as a revocable object URL. */
function useAttachmentBlob(id: string): { url: string | null; failed: boolean } {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let revoked = false;
    let obj: string | null = null;
    void api.attachments
      .blobUrl(id)
      .then((u) => {
        if (revoked) {
          URL.revokeObjectURL(u);
          return;
        }
        obj = u;
        setUrl(u);
      })
      .catch(() => {
        if (!revoked) setFailed(true);
      });
    return () => {
      revoked = true;
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [id]);
  return { url, failed };
}

export function MessageAttachments({ ids }: { ids: string[] | undefined }) {
  const [items, setItems] = useState<AttachmentOut[]>([]);
  const [enlarged, setEnlarged] = useState<{ url: string; filename: string } | null>(null);
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
    <>
      <div className="flex flex-wrap justify-end gap-2">
        {items.map((a) => (
          <AttachmentItem key={a.id} attachment={a} onEnlarge={setEnlarged} />
        ))}
      </div>
      {enlarged && (
        <Lightbox
          url={enlarged.url}
          filename={enlarged.filename}
          onClose={() => setEnlarged(null)}
        />
      )}
    </>
  );
}

function AttachmentItem({
  attachment: a,
  onEnlarge,
}: {
  attachment: AttachmentOut;
  onEnlarge: (v: { url: string; filename: string }) => void;
}) {
  if (a.kind === "image") return <ImageThumb attachment={a} onEnlarge={onEnlarge} />;
  return <DocChip attachment={a} />;
}

function ImageThumb({
  attachment: a,
  onEnlarge,
}: {
  attachment: AttachmentOut;
  onEnlarge: (v: { url: string; filename: string }) => void;
}) {
  const { url, failed } = useAttachmentBlob(a.id);
  if (failed) return <DocChip attachment={a} />; // degrade a broken image to a link chip
  if (!url) {
    return (
      <span className="flex size-20 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)]">
        <Loader2 className="size-4 animate-spin text-[var(--text-muted)]" />
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onEnlarge({ url, filename: a.filename })}
      title={`${a.filename} - click to enlarge`}
      className="block overflow-hidden rounded-lg border border-[var(--border)] transition-[box-shadow] hover:shadow-[var(--shadow-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- auth'd blob: thumbnail */}
      <img src={url} alt={a.filename} className="max-h-40 max-w-[12rem] object-cover" />
    </button>
  );
}

function DocChip({ attachment: a }: { attachment: AttachmentOut }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const open = async () => {
    setLoading(true);
    setError(false);
    try {
      const url = await api.attachments.blobUrl(a.id);
      window.open(url, "_blank", "noopener,noreferrer");
      // Revoke a bit later so the new tab has time to load the bytes.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };
  const failedParse = a.status === "failed";
  return (
    <button
      type="button"
      onClick={() => void open()}
      title={
        error
          ? "Couldn't open this file."
          : failedParse
            ? `${a.filename} (couldn't be read by the model - opens the original)`
            : `Open ${a.filename}`
      }
      className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2 text-xs text-[var(--text)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      {loading ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-[var(--text-muted)]" />
      ) : error ? (
        <AlertCircle className="size-3.5 shrink-0 text-[var(--danger-ink)]" />
      ) : (
        <FileText className="size-3.5 shrink-0 text-[var(--text-muted)]" />
      )}
      <span className="max-w-[12rem] truncate underline-offset-2 group-hover:underline">
        {a.filename}
      </span>
    </button>
  );
}

function Lightbox({
  url,
  filename,
  onClose,
}: {
  url: string;
  filename: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={filename}
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--overlay)] p-6 backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 inline-flex size-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <X className="size-4" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- auth'd blob: full view */}
      <img
        src={url}
        alt={filename}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-lg object-contain shadow-[var(--shadow-3)]"
      />
    </div>
  );
}
