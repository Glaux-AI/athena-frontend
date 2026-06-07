"use client";

/**
 * SpecPhase — body of the latest `documents` row for `phase = "spec"`.
 *
 * Body-only: the enclosing `PhaseDocumentShell` owns the title + gate badge +
 * Edit/Improve header. When the BE has attached a structured spec payload we
 * render the polished panels (domains, blast radius, KB sources, and a
 * scope selector that re-scopes the spec via `documents:improve`), a divider,
 * then the canonical document as formatted markdown (via `<DocMarkdown>`,
 * which keeps `kn://` / `repo://` chips clickable), the revision log, and the
 * per-section `<SectionFeedbackList>` anchors.
 *
 * The structured payload is null until the spec agent finishes — in that case
 * we degrade to exactly the prior behaviour (markdown body + feedback).
 */

import { useState } from "react";
import { toast } from "sonner";

import { Stack } from "@/components/layout/primitives";
import { api, ApiError, type RunPhaseDocument, type SpecStructured } from "@/lib/api/client";

import { DocMarkdown } from "../citations/doc-markdown";
import { SectionFeedbackList } from "../feedback/section-feedback-list";
import {
  BlastRadiusPanel,
  DomainsPanel,
  KbSourcesPanel,
  ScopeSelector,
} from "./structured/spec-panels";
import { RevisionsPanel } from "./structured/revisions-panel";

interface SpecPhaseProps {
  runId: string;
  document: RunPhaseDocument;
  /** Re-fetch the latest document after a scoped iterate so the new version
   *  replaces the read view. Threaded from `PhaseContent`. */
  refetch: () => Promise<void>;
}

/** `structured` is the spec payload only on the spec tab; narrow by version
 *  shape (spec carries `acceptance_criteria`, plan does not). */
function asSpecStructured(s: RunPhaseDocument["structured"]): SpecStructured | null {
  if (s && "acceptance_criteria" in s) return s;
  return null;
}

export function SpecPhase({ runId, document, refetch }: SpecPhaseProps) {
  const structured = asSpecStructured(document.structured);
  const [applying, setApplying] = useState(false);

  const applyScope = async (domainIds: string[], repoIds: string[]) => {
    if (applying) return;
    setApplying(true);
    try {
      await api.runs.documents.improve(runId, "spec", {
        feedback_text: "Re-scope per selection.",
        scope_domain_ids: domainIds,
        scope_repo_ids: repoIds,
      });
      await refetch();
      toast.success("Re-scoped the spec to your selection.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't re-scope the spec.");
    } finally {
      setApplying(false);
    }
  };

  const sections =
    document.sections.length > 0
      ? document.sections
      : [{ id: "spec.body", label: "Spec" }];

  return (
    <Stack gap="4">
      {structured && (
        <>
          <DomainsPanel domains={structured.domains_detected} />
          <BlastRadiusPanel blastRadius={structured.blast_radius} />
          <KbSourcesPanel sources={structured.kb_sources} />
          <ScopeSelector
            domains={structured.domains_detected}
            repos={structured.blast_radius?.repos ?? []}
            onApply={(caps, repos) => void applyScope(caps, repos)}
            applying={applying}
          />
          <hr className="border-[var(--border)]" />
        </>
      )}

      <Stack gap="2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Specification
        </span>
        <DocMarkdown content={document.body_markdown} />
      </Stack>

      <RevisionsPanel revisions={document.revisions} />

      <SectionFeedbackList runId={runId} artifactId={document.id} sections={sections} />
    </Stack>
  );
}
