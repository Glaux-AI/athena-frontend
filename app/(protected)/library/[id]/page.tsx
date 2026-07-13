"use client";

/**
 * /library/[id] - one Library artifact, full page (the drawer's big sibling).
 * Header carries the registry metadata (display id, scope, format, type,
 * updated, tags); actions are Publish (widen a non-org artifact via the shared
 * PublishArtifactSheet) and soft-delete. Doc/html bodies get an Edit toggle
 * backed by the optimistic-concurrency PUT (409 -> reload toast); every other
 * format renders through the shared ArtifactPreview. The versions rail below
 * lists revisions with append-only Restore.
 */

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookUp, PenLine, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ArtifactPreview } from "@/components/library/artifact-preview";
import { PublishArtifactSheet } from "@/components/library/publish-artifact-sheet";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Cluster, Stack } from "@/components/layout/primitives";
import { formatDateTime } from "@/lib/utils/format";
import {
  ApiError,
  api,
  type ArtifactRevisionSummary,
  type LibraryArtifactDetail,
} from "@/lib/api/client";

export default function LibraryArtifactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const ref = decodeURIComponent(id);
  const router = useRouter();

  const [detail, setDetail] = useState<LibraryArtifactDetail | null>(null);
  const [versions, setVersions] = useState<ArtifactRevisionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [restoring, setRestoring] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const a = await api.artifacts.get(ref);
      const vers = await api.artifacts
        .versions(a.display_id)
        .catch(() => [] as ArtifactRevisionSummary[]);
      setDetail(a);
      setVersions(vers);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load this artifact.");
    } finally {
      setLoading(false);
    }
  }, [ref]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const saveEdit = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      await api.artifacts.putBody(detail.display_id, editBody, detail.version ?? undefined);
      setEditing(false);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast.error("This artifact changed since you opened it - reload to get the latest.");
      } else {
        toast.error(e instanceof ApiError ? e.message : "Couldn't save the artifact.");
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!detail) return;
    setDeleting(true);
    try {
      await api.artifacts.softDelete(detail.display_id);
      router.push("/library");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't delete the artifact.");
      setDeleting(false);
    }
  };

  const restore = async (version: number) => {
    if (!detail) return;
    setRestoring(version);
    try {
      await api.artifacts.restoreVersion(detail.display_id, version);
      toast.success(`v${version} is the working version again.`);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't restore that version.");
    } finally {
      setRestoring(null);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-screen-md py-6" aria-busy="true" aria-label="Loading artifact">
        <Stack gap="5">
          <Stack gap="2">
            <div className="skeleton h-3 w-20 rounded" />
            <div className="skeleton h-7 w-2/3 rounded" />
            <div className="skeleton h-3 w-80 rounded" />
          </Stack>
          <div className="skeleton h-[50vh] w-full rounded-xl" />
        </Stack>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="mx-auto w-full max-w-screen-md py-6">
        <EmptyState
          title="Artifact unavailable"
          description={error ?? "Not found."}
          action={
            <Link href="/library">
              <Button variant="secondary" size="sm">
                Back to the Library
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  const editable = detail.format === "doc" || detail.format === "html";
  const sorted = [...versions].sort((a, b) => b.version - a.version);

  return (
    <div className="mx-auto w-full max-w-screen-md py-6">
      <Stack gap="5">
        <Stack gap="3">
          <Link
            href="/library"
            className="inline-flex w-fit items-center gap-1 rounded text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <ArrowLeft className="size-3.5" /> Library
          </Link>
          <Cluster justify="between" align="start" gap="3">
            <Stack gap="1.5" className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">{detail.title}</h1>
              <Cluster gap="2" align="center" className="flex-wrap text-xs text-[var(--text-muted)]">
                <span className="font-mono">{detail.display_id}</span>
                <ScopeBadge scope={detail.scope} />
                <span>{detail.format}</span>
                <span>·</span>
                <span>{detail.type}</span>
                <span>·</span>
                <span>{formatDateTime(detail.updated_at)}</span>
              </Cluster>
              {detail.tags.length > 0 && (
                <Cluster gap="1.5" className="flex-wrap">
                  {detail.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-[var(--surface-3)] px-2 py-0.5 text-micro text-[var(--text-muted)]"
                    >
                      {t}
                    </span>
                  ))}
                </Cluster>
              )}
            </Stack>
            <Cluster gap="2" align="center">
              {detail.scope !== "org" && (
                <Button variant="outline" size="sm" onClick={() => setPublishing(true)}>
                  <BookUp className="size-3.5" />
                  Publish
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                loading={deleting}
                disabled={deleting}
                onClick={() => void remove()}
              >
                {!deleting && <Trash2 className="size-3.5" />}
                Delete
              </Button>
            </Cluster>
          </Cluster>
          <hr className="hr-horizon" aria-hidden />
        </Stack>

        <Stack gap="2.5">
          {editable && (
            <Cluster justify="end" gap="2">
              {editing ? (
                <>
                  <Button size="sm" loading={saving} disabled={saving} onClick={() => void saveEdit()}>
                    {!saving && <Save className="size-3.5" />}
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditBody(detail.body ?? "");
                    setEditing(true);
                  }}
                >
                  <PenLine className="size-3.5" />
                  Edit
                </Button>
              )}
            </Cluster>
          )}
          {editing ? (
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              aria-label={`Edit ${detail.title}`}
              className="min-h-[320px] w-full resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm leading-relaxed text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
          ) : (
            <ArtifactPreview artifact={detail} />
          )}
        </Stack>

        {sorted.length > 0 && (
          <Stack gap="2">
            <h2 className="text-sm font-semibold">Versions</h2>
            <hr className="hr-horizon" aria-hidden />
            <Stack gap="1.5" as="ul">
              {sorted.map((v, i) => (
                <li
                  key={v.version}
                  className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]"
                >
                  <span className="font-mono text-[var(--text)]">v{v.version}</span>
                  <span>·</span>
                  <span>{v.who_kind}</span>
                  <span>·</span>
                  <span>{formatDateTime(v.created_at)}</span>
                  {i > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto"
                      loading={restoring === v.version}
                      disabled={restoring !== null}
                      onClick={() => void restore(v.version)}
                    >
                      Restore
                    </Button>
                  )}
                </li>
              ))}
            </Stack>
          </Stack>
        )}
      </Stack>

      <PublishArtifactSheet
        open={publishing}
        onClose={() => setPublishing(false)}
        source={{ kind: "existing", refId: detail.display_id, title: "", currentScope: detail.scope }}
        onSaved={() => void load()}
      />
    </div>
  );
}

function ScopeBadge({ scope }: { scope: string }) {
  const label = scope === "personal" ? "Only me" : scope === "task" ? "Task" : scope;
  return (
    <span className="shrink-0 rounded-full bg-[var(--surface-3)] px-2 py-0.5 text-micro capitalize text-[var(--text-muted)]">
      {label}
    </span>
  );
}
