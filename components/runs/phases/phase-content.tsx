"use client";

/**
 * PhaseContent — routes the active phase tab to its body renderer and owns
 * the document fetch (via `useRunDocuments`) plus the loading / empty / error
 * states, so the per-phase components stay purely presentational.
 *
 * When a document exists it renders ONE `PhaseDocumentShell` — a single card
 * whose header carries the title + gate badge and the Edit / Improve actions,
 * with the per-phase body below a divider. Edit swaps the body for an in-place
 * markdown editor with a live Preview; Improve opens the `<ImproveDrawer>`
 * wired to the synchronous `documents:improve` endpoint. Both refetch on
 * success so the new version replaces the read view. This file owns the
 * edit/improve flow end-to-end — it does not thread callbacks back to the page.
 */

import { useState, type MouseEvent } from "react";
import { AlertTriangle, Eye, FileX2, Pencil, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { useRunDocuments } from "@/hooks/use-run-documents";
import { api, ApiError, type RunPhaseDocument } from "@/lib/api/client";
import { ImproveDrawer, type ImproveTarget } from "@/components/docs/improve-drawer";

import { CiPhase } from "./ci-phase";
import { ImplementPhase } from "./implement-phase";
import { PlanPhase } from "./plan-phase";
import { PrdPhase } from "./prd-phase";
import { PrPhase } from "./pr-phase";
import { ReviewPhase } from "./review-phase";
import { SpecPhase } from "./spec-phase";
import { PhaseDocumentShell } from "./phase-document-shell";
import { DocMarkdown } from "../citations/doc-markdown";

interface PhaseContentProps {
  runId: string;
  /** Active phase key — `spec | plan | implement | review | ci | pr` on the
   *  Implement track, or `frame | research | draft | signoff` on the PRD
   *  track. The hook fetches the latest document for the raw key. */
  activePhase: string;
}

export function PhaseContent({ runId, activePhase }: PhaseContentProps) {
  const { document, isLoading, error, refetch } = useRunDocuments(runId, activePhase);

  if (isLoading) {
    return (
      <Card aria-busy="true" aria-label={`Loading ${activePhase} phase`}>
        <Stack gap="3">
          <div className="h-5 w-40 animate-pulse rounded-md bg-[var(--surface-2)]" />
          <div className="h-3 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
          <div className="h-3 w-11/12 animate-pulse rounded-md bg-[var(--surface-2)]" />
          <div className="h-24 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
        </Stack>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
        <Cluster gap="2" align="center">
          <AlertTriangle className="size-4 text-[var(--danger)]" />
          <span className="text-sm text-[var(--danger)]">{error}</span>
        </Cluster>
      </Card>
    );
  }

  if (!document) {
    return (
      <Card>
        <Stack gap="2">
          <Cluster gap="2" align="center">
            <FileX2 className="size-4 text-[var(--text-muted)]" />
            <span className="text-sm font-semibold">No artifact yet</span>
          </Cluster>
          <p className="text-xs text-[var(--text-muted)]">
            Athena hasn&apos;t produced a document for this phase yet. It will appear here once the agent completes the step.
          </p>
        </Stack>
      </Card>
    );
  }

  return (
    <PhaseDocumentView
      runId={runId}
      activePhase={activePhase}
      document={document}
      refetch={refetch}
    />
  );
}

/** Body-only per-phase renderer — the `PhaseDocumentShell` owns the title +
 *  gate + actions header, so each renderer returns just its content. The
 *  `implement` tab covers every `implement.*` family except `implement.review`
 *  which the Review tab handles. */
function renderPhaseBody(
  runId: string,
  activePhase: string,
  document: RunPhaseDocument,
  refetch: () => Promise<void>,
) {
  switch (activePhase) {
    case "spec":
      return <SpecPhase runId={runId} document={document} refetch={refetch} />;
    case "plan":
      return <PlanPhase runId={runId} document={document} />;
    case "implement":
      return <ImplementPhase runId={runId} document={document} />;
    case "review":
      return <ReviewPhase runId={runId} document={document} />;
    case "ci":
      return <CiPhase runId={runId} document={document} />;
    case "pr":
      return <PrPhase runId={runId} document={document} />;
    case "frame":
    case "research":
    case "draft":
    case "signoff":
      // All four PRD-track tabs render the single evolving `prd` document;
      // `activePhase` selects which structured panel to surface.
      return <PrdPhase runId={runId} document={document} activePhase={activePhase} />;
    default:
      return (
        <p className="text-sm text-[var(--text-muted)]">
          No renderer registered for phase {activePhase}.
        </p>
      );
  }
}

/**
 * PhaseDocumentView — owns the Edit / Improve affordances for a phase that
 * has a document. Mounted only when `document` is non-null so its hooks stay
 * unconditional. Read mode renders the shell with Edit/Improve in the header;
 * edit mode swaps in the markdown editor (also inside the shell).
 */
function PhaseDocumentView({
  runId,
  activePhase,
  document,
  refetch,
}: {
  runId: string;
  activePhase: string;
  document: RunPhaseDocument;
  refetch: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [improveTarget, setImproveTarget] = useState<ImproveTarget | null>(null);

  const openImproveDrawer = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setImproveTarget({
      label: document.title,
      currentText: document.body_markdown,
      scope: { kind: "global" },
      kind: improveKindFor(activePhase),
      anchor: { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
      onSubmit: async ({ feedback_text }) => {
        // Synchronous LLM revision — the drawer drives its in-flight state
        // off this promise. Refetch so the new version replaces the read view.
        await api.runs.documents.improve(runId, activePhase, { feedback_text });
        await refetch();
      },
    });
  };

  if (editing) {
    return (
      <DocumentEditor
        runId={runId}
        activePhase={activePhase}
        document={document}
        onCancel={() => setEditing(false)}
        onSaved={async () => {
          setEditing(false);
          await refetch();
        }}
      />
    );
  }

  return (
    <>
      <PhaseDocumentShell
        title={document.title}
        gateState={document.gate_state}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)} data-testid="phase-edit">
              <Pencil className="size-3.5" />
              Edit
            </Button>
            <Button variant="outline" size="sm" onClick={openImproveDrawer} data-testid="phase-improve">
              <Sparkles className="size-3.5" />
              Improve
            </Button>
          </>
        }
      >
        {renderPhaseBody(runId, activePhase, document, refetch)}
      </PhaseDocumentShell>
      <ImproveDrawer target={improveTarget} onClose={() => setImproveTarget(null)} />
    </>
  );
}

/** Map a phase key to the `ImproveDrawer` preset set so the quick-starter
 *  chips match the artifact kind. Falls back to the generic `spec` set. */
function improveKindFor(activePhase: string): NonNullable<ImproveTarget["kind"]> {
  switch (activePhase) {
    case "plan":
      return "plan";
    case "review":
      return "review";
    default:
      return "spec";
  }
}

/**
 * DocumentEditor — in-place markdown editor that replaces the read body
 * inside the same shell, so editing reads as the same panel. A monospace
 * textarea pre-filled with `body_markdown`, a Preview toggle (in the shell
 * header) that renders the live draft through `<DocMarkdown>`, plus Save +
 * Cancel. Save persists via `documents.save` and exits on success.
 */
function DocumentEditor({
  runId,
  activePhase,
  document,
  onCancel,
  onSaved,
}: {
  runId: string;
  activePhase: string;
  document: RunPhaseDocument;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(document.body_markdown);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const dirty = draft !== document.body_markdown;

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.runs.documents.save(runId, activePhase, { body_markdown: draft });
      toast.success(`Saved a new revision of ${document.title}.`);
      await onSaved();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Couldn't save your changes.";
      setSaveError(message);
      toast.error(message);
      setSaving(false);
    }
  };

  return (
    <PhaseDocumentShell
      title={`Editing ${document.title}`}
      gateState={document.gate_state}
      actions={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPreview((v) => !v)}
          aria-pressed={preview}
          data-testid="phase-edit-preview-toggle"
        >
          <Eye className="size-3.5" />
          {preview ? "Hide preview" : "Preview"}
        </Button>
      }
    >
      <Stack gap="3">
        {preview ? (
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
            <DocMarkdown content={draft} />
          </div>
        ) : (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            aria-label={`Edit ${document.title} markdown`}
            data-testid="phase-edit-textarea"
            className="min-h-[320px] w-full resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-[13px] leading-relaxed text-[var(--text)] focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
        )}

        {saveError && (
          <div role="alert">
            <Cluster gap="2" align="center">
              <AlertTriangle className="size-4 text-[var(--danger)]" />
              <span className="text-xs text-[var(--danger)]">{saveError}</span>
            </Cluster>
          </div>
        )}

        <Cluster gap="2" justify="end">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            <X className="size-3.5" />
            Cancel
          </Button>
          <Button size="sm" onClick={save} loading={saving} disabled={!dirty || saving} data-testid="phase-edit-save">
            Save
          </Button>
        </Cluster>
      </Stack>
    </PhaseDocumentShell>
  );
}
