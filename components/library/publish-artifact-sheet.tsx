"use client";

/**
 * PublishArtifactSheet - the ONE prefilled "save/publish to the Library" sheet
 * (locked decision: saving is user-driven; agents never auto-publish). Three
 * sources share it:
 *   - content:    a chat answer / drafted markdown -> POST create
 *   - attachment: an existing chat/task upload      -> POST promote
 *   - existing:   an already-registered artifact    -> PATCH scope (widen)
 * Success toasts the display id with a View action that opens the preview
 * drawer. Scope grammar matches the create dialog: Only me / Whole org
 * (domain scope needs the domain picker - a Phase-2 addition).
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useArtifactPreview } from "@/components/library/artifact-preview-context";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/overlay";
import { ApiError, api, type LibraryArtifactDetail } from "@/lib/api/client";

export type PublishSource =
  | { kind: "content"; format: "doc" | "html"; title: string; body: string }
  | { kind: "attachment"; attachmentId: string; filename: string }
  | { kind: "existing"; refId: string; title: string; currentScope: string };

type Scope = "personal" | "org";

export function PublishArtifactSheet({
  open,
  onClose,
  source,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  source: PublishSource;
  onSaved?: (a: LibraryArtifactDetail) => void;
}) {
  const preview = useArtifactPreview();
  const [title, setTitle] = useState(prefillTitle(source));
  const [scope, setScope] = useState<Scope>(prefillScope(source));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-prefill when the sheet opens for a different source.
  useEffect(() => {
    if (open) {
      setTitle(prefillTitle(source));
      setScope(prefillScope(source));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const saved = await save(source, { title: title.trim(), scope });
      onSaved?.(saved);
      onClose();
      toast.success(`Saved as ${saved.display_id}`, {
        description: saved.scope === "org" ? "Visible to the whole org." : "Visible only to you.",
        action: { label: "View", onClick: () => preview.open(saved.display_id) },
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save to the Library.");
    } finally {
      setBusy(false);
    }
  }

  const verb = source.kind === "existing" ? "Publish" : "Save";
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={source.kind === "existing" ? "Publish to the Library" : "Save to the Library"}
      description={describe(source)}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={busy || (source.kind !== "existing" && !title.trim())}
            loading={busy}
          >
            {verb}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[var(--text-muted)]">Title</span>
          <input
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        {source.kind === "content" && (
          <p className="max-h-24 overflow-hidden text-ellipsis rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-muted)]">
            {source.body.slice(0, 400)}
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[var(--text-muted)]">Visibility</span>
          <div className="flex gap-2">
            <ScopeChip active={scope === "personal"} onClick={() => setScope("personal")}>
              Only me
            </ScopeChip>
            <ScopeChip active={scope === "org"} onClick={() => setScope("org")}>
              Whole org
            </ScopeChip>
          </div>
        </div>

        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      </div>
    </Modal>
  );
}

async function save(
  source: PublishSource,
  input: { title: string; scope: Scope },
): Promise<LibraryArtifactDetail> {
  if (source.kind === "content") {
    return api.artifacts.create({
      format: source.format,
      title: input.title,
      body: source.body,
      scope: input.scope,
    });
  }
  if (source.kind === "attachment") {
    return api.artifacts.promote({
      attachment_id: source.attachmentId,
      title: input.title,
      scope: input.scope,
    });
  }
  // Widen an existing artifact; an empty title keeps the current one.
  return api.artifacts.patch(
    source.refId,
    input.title ? { title: input.title, scope: input.scope } : { scope: input.scope },
  );
}

function prefillTitle(source: PublishSource): string {
  if (source.kind === "content") return source.title;
  if (source.kind === "attachment") return source.filename;
  return source.title;
}

function prefillScope(source: PublishSource): Scope {
  // Publishing an existing (task/personal) artifact means widening it.
  return source.kind === "existing" ? "org" : "personal";
}

function describe(source: PublishSource): string {
  if (source.kind === "attachment") return "Keep this upload as a named, findable artifact.";
  if (source.kind === "existing")
    return "Same artifact, wider audience - the version history comes with it.";
  return "Keep this as a named, versioned artifact you (or the org) can find and cite.";
}

/** First markdown heading (or first non-empty line) - the save prefill. */
export function deriveTitleFromMarkdown(content: string): string {
  const heading = /^#{1,3}[ \t]+(.+?)\s*$/m.exec(content.slice(0, 2000));
  const raw = heading?.[1] ?? content.split("\n").find((l) => l.trim()) ?? "";
  return raw.replace(/[#*`]/g, "").trim().slice(0, 120) || "Untitled";
}

function ScopeChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-full border border-[var(--border-accent)] bg-[var(--primary-soft)] px-3 py-1 text-sm text-[var(--primary-ink)]"
          : "rounded-full border border-[var(--border)] px-3 py-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
      }
    >
      {children}
    </button>
  );
}
