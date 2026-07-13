"use client";

/**
 * ArtifactDrawer - the right-side glass-sheet preview for ONE artifact,
 * addressed by display id or UUID. Shared by the /library browser (URL-backed
 * `?artifact=`) and the app-wide ArtifactPreviewProvider (chips, save toasts,
 * cockpit ids) so every surface opens the exact same preview.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Maximize2, X } from "lucide-react";

import { ArtifactPreview } from "@/components/library/artifact-preview";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils/format";
import { ApiError, api, type LibraryArtifactDetail } from "@/lib/api/client";

export function ArtifactDrawer({
  refId,
  onClose,
  onDeleted,
}: {
  refId: string;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const [artifact, setArtifact] = useState<LibraryArtifactDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setArtifact(null);
    setError(null);
    api.artifacts
      .get(refId)
      .then((a) => alive && setArtifact(a))
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : "Not found."));
    return () => {
      alive = false;
    };
  }, [refId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function remove() {
    if (!artifact) return;
    await api.artifacts.softDelete(artifact.display_id);
    onDeleted?.();
  }

  return (
    <>
      <div className="fixed inset-0 z-[var(--z-drawer)] bg-black/30" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-label="Artifact preview"
        className="glass-sheet !rounded-r-none fixed right-0 top-0 z-[var(--z-drawer)] flex h-full w-full max-w-[720px] flex-col"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-soft)] px-5 py-4">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-[var(--text)]">
              {artifact?.title ?? "Loading…"}
            </p>
            {artifact && (
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-micro text-[var(--text-subtle)]">
                <span className="font-mono">{artifact.display_id}</span>
                <span>· {artifact.format}</span>
                <span>· {artifact.scope}</span>
                <span>· {formatDateTime(artifact.updated_at)}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            {artifact && (
              <>
                <Link
                  href={`/library/${encodeURIComponent(artifact.display_id)}`}
                  onClick={onClose}
                  aria-label="Open full page"
                  className="rounded-md p-1.5 text-[var(--text-subtle)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  <Maximize2 className="size-4" aria-hidden />
                </Link>
                <Button variant="ghost" size="sm" onClick={remove}>
                  Delete
                </Button>
              </>
            )}
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="rounded-md p-1.5 text-[var(--text-subtle)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <p className="py-8 text-center text-sm text-[var(--danger)]">{error}</p>
          ) : !artifact ? (
            <div className="flex flex-col gap-2">
              <div className="skeleton h-6 w-2/3 rounded" />
              <div className="skeleton h-40 w-full rounded-lg" />
            </div>
          ) : (
            <ArtifactPreview artifact={artifact} />
          )}
        </div>
      </aside>
    </>
  );
}
