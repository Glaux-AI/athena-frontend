"use client";

/**
 * Attachment picker - shared across the chat composer and the task input
 * surfaces. A paperclip button (`AttachmentButton`) opens the file dialog; a
 * chips strip (`AttachmentChips`) shows each upload's progress / thumbnail /
 * error. State + upload live in `useAttachmentDrafts`, so a host wires it once
 * and reads `readyIds` to send.
 *
 * Vision gating: images are only allowed when `canAttachImages` is true (the
 * selected model `supports_vision`); a dropped/picked image otherwise becomes
 * an inline error chip and is never uploaded. Documents are always allowed.
 * Tokens-only.
 */

import { useCallback, useRef, useState } from "react";
import { AlertCircle, FileText, Loader2, Paperclip, X } from "lucide-react";

import { api, type AttachmentOut } from "@/lib/api/client";
import { cn } from "@/lib/cn";

export interface AttachmentDraft {
  localId: string;
  name: string;
  size: number;
  kind: "image" | "document";
  status: "uploading" | "ready" | "error";
  attachment?: AttachmentOut;
  error?: string;
  /** Object URL of the LOCAL file (images only) for an instant chip thumbnail -
   *  no server round-trip, and `blob:` is allowed by the CSP. Revoked on
   *  remove/clear. */
  previewUrl?: string;
}

/** Documents the BE parses + images the BE can hand a vision model. */
const DOC_ACCEPT = ".pdf,.docx,.txt,.md,.csv,.json,application/pdf,text/plain,text/markdown,text/csv,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const IMAGE_ACCEPT = "image/png,image/jpeg,image/gif,image/webp";

function acceptFor(canAttachImages: boolean): string {
  return canAttachImages ? `${IMAGE_ACCEPT},${DOC_ACCEPT}` : DOC_ACCEPT;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
}

export interface AttachmentDraftsApi {
  drafts: AttachmentDraft[];
  addFiles: (files: FileList | File[]) => void;
  remove: (localId: string) => void;
  clear: () => void;
  /** Ids of successfully-uploaded, parse-OK attachments to send. */
  readyIds: string[];
  /** An upload is still in flight (block send until it settles). */
  pending: boolean;
  /** A ready image is attached (drives the vision-gating send block). */
  hasReadyImage: boolean;
}

export function useAttachmentDrafts(opts: { canAttachImages: boolean }): AttachmentDraftsApi {
  const { canAttachImages } = opts;
  const [drafts, setDrafts] = useState<AttachmentDraft[]>([]);

  const patch = useCallback((localId: string, next: Partial<AttachmentDraft>) => {
    setDrafts((cur) => cur.map((d) => (d.localId === localId ? { ...d, ...next } : d)));
  }, []);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        const localId = makeId();
        const isImage = file.type.startsWith("image/");
        if (isImage && !canAttachImages) {
          setDrafts((cur) => [
            ...cur,
            {
              localId,
              name: file.name,
              size: file.size,
              kind: "image",
              status: "error",
              error: "Pick a vision-capable model to attach images.",
            },
          ]);
          continue;
        }
        setDrafts((cur) => [
          ...cur,
          {
            localId,
            name: file.name,
            size: file.size,
            kind: isImage ? "image" : "document",
            status: "uploading",
            ...(isImage ? { previewUrl: URL.createObjectURL(file) } : {}),
          },
        ]);
        api.attachments
          .upload(file)
          .then((att) => {
            patch(
              localId,
              att.status === "ready"
                ? { attachment: att, kind: att.kind, status: "ready" }
                : {
                    attachment: att,
                    kind: att.kind,
                    status: "error",
                    error: att.error ?? "Could not read this file.",
                  },
            );
          })
          .catch((err: unknown) => {
            patch(localId, {
              status: "error",
              error: err instanceof Error ? err.message : "Upload failed.",
            });
          });
      }
    },
    [canAttachImages, patch],
  );

  const remove = useCallback((localId: string) => {
    setDrafts((cur) => {
      const gone = cur.find((d) => d.localId === localId);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return cur.filter((d) => d.localId !== localId);
    });
  }, []);

  const clear = useCallback(() => {
    setDrafts((cur) => {
      for (const d of cur) if (d.previewUrl) URL.revokeObjectURL(d.previewUrl);
      return [];
    });
  }, []);

  const readyIds = drafts
    .filter((d) => d.status === "ready" && d.attachment)
    .map((d) => d.attachment!.id);
  const pending = drafts.some((d) => d.status === "uploading");
  const hasReadyImage = drafts.some((d) => d.status === "ready" && d.kind === "image");

  return { drafts, addFiles, remove, clear, readyIds, pending, hasReadyImage };
}

export function AttachmentButton({
  onFiles,
  canAttachImages,
  disabled = false,
}: {
  onFiles: (files: FileList | File[]) => void;
  canAttachImages: boolean;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        aria-label="Attach files"
        title={canAttachImages ? "Attach images or documents" : "Attach documents (pick a vision model for images)"}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg border-transparent bg-transparent text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
      >
        <Paperclip className="size-4" />
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={acceptFor(canAttachImages)}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = ""; // allow re-selecting the same file
        }}
      />
    </>
  );
}

export function AttachmentChips({
  drafts,
  onRemove,
}: {
  drafts: AttachmentDraft[];
  onRemove: (localId: string) => void;
}) {
  if (drafts.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 px-3 pt-3">
      {drafts.map((d) => (
        <AttachmentChip key={d.localId} draft={d} onRemove={() => onRemove(d.localId)} />
      ))}
    </div>
  );
}

function AttachmentChip({ draft, onRemove }: { draft: AttachmentDraft; onRemove: () => void }) {
  const isError = draft.status === "error";
  const preview = draft.previewUrl;
  return (
    <div
      className={cn(
        "group relative flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs",
        isError
          ? "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger-ink)]"
          : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]",
      )}
      title={draft.error ?? draft.name}
    >
      <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[var(--surface-3)]">
        {draft.status === "uploading" ? (
          <Loader2 className="size-3.5 animate-spin text-[var(--text-muted)]" />
        ) : isError ? (
          <AlertCircle className="size-3.5" />
        ) : draft.kind === "image" && preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob: thumbnail
          <img src={preview} alt="" className="size-7 object-cover" />
        ) : (
          <FileText className="size-3.5 text-[var(--text-muted)]" />
        )}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="max-w-[10rem] truncate font-medium">{draft.name}</span>
        <span className="text-[var(--text-muted)]">
          {isError ? draft.error : formatBytes(draft.size)}
        </span>
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${draft.name}`}
        className="ml-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
