"use client";

/**
 * BlueprintSectionRevisions - drawer showing revision history for a Blueprint section.
 *
 * Per knowledge-model.md §5.2 / F-04.5: revisions are append-only; revert
 * never destroys history - it creates a new revision with the old content.
 *
 * The drawer takes a fetcher (`load`) so the page can wire it to the right
 * `api.blueprint.*.getRevisions` based on scope without leaking scope details
 * into this component.
 */

import { useEffect, useState } from "react";
import { X, History, CornerDownLeft } from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/cn";
import type { BlueprintSectionRevision } from "@/lib/api/client";

interface BlueprintSectionRevisionsProps {
  open: boolean;
  /** Display name for the section in the drawer header. */
  sectionTitle: string;
  /** Section key used to refetch revisions whenever the drawer opens. */
  sectionKey: string | null;
  /** Caller-provided fetcher. Returns an array of revisions, most-recent first. */
  load: (sectionKey: string) => Promise<BlueprintSectionRevision[]>;
  /** Optional - revert to a prior revision. When undefined the revert button
   * is hidden (read-only history). */
  onRevert?: (rev: BlueprintSectionRevision) => Promise<void> | void;
  onClose: () => void;
}

const AUTHOR_LABEL: Record<BlueprintSectionRevision["author_kind"], string> = {
  agent: "Athena",
  human: "User",
  migration: "Migration",
};

export function BlueprintSectionRevisions({
  open,
  sectionTitle,
  sectionKey,
  load,
  onRevert,
  onClose,
}: BlueprintSectionRevisionsProps) {
  const [revisions, setRevisions] = useState<BlueprintSectionRevision[] | null>(null);
  const [busyRevId, setBusyRevId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !sectionKey) return;
    let cancelled = false;
    setRevisions(null);
    (async () => {
      try {
        const list = await load(sectionKey);
        if (!cancelled) {
          // Sort newest first.
          setRevisions([...list].sort((a, b) => b.version - a.version));
        }
      } catch {
        if (!cancelled) setRevisions([]);
      }
    })();
    return () => { cancelled = true; };
  }, [open, sectionKey, load]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[var(--z-drawer)] flex items-stretch justify-end bg-[var(--overlay)] backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Revision history for ${sectionTitle}`}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="glass-sheet flex w-full max-w-xl flex-col !rounded-r-none"
      >
        <Cluster justify="between" align="center" className="glass-chrome rounded-tl-xl px-4 py-3">
          <Cluster gap="2" align="center">
            <History className="size-4 text-[var(--text-muted)]" aria-hidden />
            <Stack gap="0">
              <Eyebrow>Revisions</Eyebrow>
              <h2 className="text-base font-semibold">{sectionTitle}</h2>
            </Stack>
          </Cluster>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close revisions"
            className="rounded-md p-1 text-[var(--text-muted)] transition-colors duration-150 ease-out hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <X className="size-4" />
          </button>
        </Cluster>
        <hr className="hr-horizon" aria-hidden="true" />

        <div className="flex-1 overflow-y-auto p-4">
          {revisions === null ? (
            <Stack gap="2" aria-busy="true" aria-label="Loading revisions">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton h-20 rounded-md" />
              ))}
            </Stack>
          ) : revisions.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No revisions yet.</p>
          ) : (
            <Stack gap="3" as="ul">
              {revisions.map((rev, idx) => (
                <li key={rev.id}>
                  <Card className={cn(idx === 0 && "border-l-4 border-l-[var(--success)]")}>
                    <Stack gap="2">
                      <Cluster justify="between" align="center">
                        <Cluster gap="2" align="center">
                          <span className="rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-micro font-semibold">
                            v{rev.version}
                          </span>
                          <Pill
                            size="sm"
                            tone={rev.author_kind === "agent" ? "info" : rev.author_kind === "human" ? "primary" : "neutral"}
                          >
                            {AUTHOR_LABEL[rev.author_kind]}
                          </Pill>
                          <span className="text-xs text-[var(--text-muted)]">{rev.author_id}</span>
                          {idx === 0 && <Pill size="sm" tone="success" kind="ink">current</Pill>}
                        </Cluster>
                        <span className="text-micro text-[var(--text-subtle)]" title={rev.created_at}>
                          {formatIso(rev.created_at)}
                        </span>
                      </Cluster>
                      {rev.change_note && (
                        <p className="text-xs text-[var(--text-muted)]">{rev.change_note}</p>
                      )}
                      {rev.body_markdown && (
                        <pre className="max-h-40 overflow-y-auto rounded-md bg-[var(--surface-2)] p-2 font-mono text-micro leading-snug text-[var(--text-muted)]">
                          {rev.body_markdown.slice(0, 800)}
                          {rev.body_markdown.length > 800 ? "…" : ""}
                        </pre>
                      )}
                      {onRevert && idx > 0 && (
                        <Cluster justify="end">
                          <Button
                            variant="outline"
                            size="sm"
                            loading={busyRevId === rev.id}
                            onClick={async () => {
                              setBusyRevId(rev.id);
                              try { await onRevert(rev); }
                              finally { setBusyRevId(null); }
                            }}
                          >
                            <CornerDownLeft className="size-3.5" />
                            Revert to this revision
                          </Button>
                        </Cluster>
                      )}
                    </Stack>
                  </Card>
                </li>
              ))}
            </Stack>
          )}
        </div>
      </aside>
    </div>
  );
}

function formatIso(iso: string): string {
  try { return new Date(iso).toLocaleString(); }
  catch { return iso; }
}
