"use client";

/**
 * RepoBlueprintSections — renders the Repo Blueprint on the repo page's
 * Blueprint tab (`/capabilities/[id]/repos/[repo_id]`). Per ADR-072, the
 * standalone Repo Blueprint page was retired; the 14+ Blueprint sections
 * render here under the dashboard header, in one canonical scroll.
 *
 * Edit / lock / regenerate / proposal-queue affordances per section work
 * exactly as on the org Blueprint surface (BlueprintSectionViewer handles
 * the per-section header + actions; the proposal queue + diff modal +
 * editor + revisions drawer mount at the bottom of this component).
 */

import { useCallback, useEffect, useState } from "react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import {
  api,
  ApiError,
  type BlueprintSection,
  type BlueprintSectionProposal,
  type BlueprintToc,
} from "@/lib/api/client";
import { BlueprintSectionViewer } from "@/components/blueprint/blueprint-section-viewer";
import { BlueprintSectionEditor } from "@/components/blueprint/blueprint-section-editor";
import { BlueprintSectionRevisions } from "@/components/blueprint/blueprint-section-revisions";
import { BlueprintProposalQueue } from "@/components/blueprint/blueprint-proposal-queue";
import { BlueprintProposalDiffModal } from "@/components/blueprint/blueprint-proposal-diff-modal";
import { pollBlueprintReady } from "@/lib/poll-blueprint-ready";
import { FileText } from "lucide-react";

/** Surface the synthesized `architecture` section right after `overview`.
 *  It's appended in the BE catalogue (to keep existing seeded orderings
 *  stable on re-sync), so reorder client-side for prominence. Stable for
 *  every other section. */
function orderSections(secs: BlueprintToc["sections"]): BlueprintToc["sections"] {
  const arch = secs.find((s) => s.section_key === "architecture");
  if (!arch) return secs;
  const rest = secs.filter((s) => s.section_key !== "architecture");
  const afterIdx = rest.findIndex((s) => s.section_key === "overview");
  if (afterIdx < 0) return [arch, ...rest];
  return [...rest.slice(0, afterIdx + 1), arch, ...rest.slice(afterIdx + 1)];
}

export function RepoBlueprintSections({ repoId }: { repoId: string }) {
  const [toc, setToc] = useState<BlueprintToc | null>(null);
  const [sections, setSections] = useState<Record<string, BlueprintSection>>({});
  const [proposals, setProposals] = useState<BlueprintSectionProposal[]>([]);
  const [editorOpen, setEditorOpen] = useState<BlueprintSection | null>(null);
  const [revisionsKey, setRevisionsKey] = useState<string | null>(null);
  const [proposalsOpen, setProposalsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshAll = useCallback(async () => {
    try {
      const [t, p] = await Promise.all([
        api.blueprint.repo.getToc(repoId),
        api.blueprint.repo.listProposals(repoId).catch(() => [] as BlueprintSectionProposal[]),
      ]);
      setToc(t);
      setProposals(p);
      const fetched = await Promise.all(
        t.sections.map((s) => api.blueprint.repo.getSection(repoId, s.section_key)),
      );
      const map: Record<string, BlueprintSection> = {};
      for (const sec of fetched) map[sec.section_key] = sec;
      setSections(map);
      setError(null);
    } catch (e) {
      // Soft-fail: many repos have no Blueprint yet. The panel still shows the
      // KG sections above. We only surface the error if it isn't a 404.
      if (e instanceof ApiError && e.status !== 404) {
        setError(e.message);
      } else {
        setError(null);
      }
    }
  }, [repoId]);

  useEffect(() => { void refreshAll(); }, [refreshAll]);

  const handleEditSave = useCallback(async ({ body_markdown, change_note }: { body_markdown: string; change_note: string }) => {
    if (!editorOpen) return;
    const updated = await api.blueprint.repo.editSection(repoId, editorOpen.section_key, { body_markdown, change_note });
    setSections((prev) => ({ ...prev, [updated.section_key]: updated }));
    setEditorOpen(null);
    await refreshAll();
  }, [repoId, editorOpen, refreshAll]);

  const handleLockToggle = useCallback(async (sectionKey: string) => {
    const cur = sections[sectionKey];
    if (!cur) return;
    const updated = cur.locked
      ? await api.blueprint.repo.unlockSection(repoId, sectionKey)
      : await api.blueprint.repo.lockSection(repoId, sectionKey);
    setSections((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshAll();
  }, [repoId, sections, refreshAll]);

  const handleRegenerate = useCallback(async (sectionKey: string) => {
    const updated = await api.blueprint.repo.regenerateSection(repoId, sectionKey);
    if ("body_markdown" in updated) {
      setSections((prev) => ({ ...prev, [updated.section_key]: updated }));
    }
    // Flagship sections regenerate via the async agentic explorer — wait
    // for the build to finish (no-op for synchronous single-shot sections).
    await pollBlueprintReady(async () => (await api.blueprint.repo.getToc(repoId)).status);
    await refreshAll();
  }, [repoId, refreshAll]);

  const handleProposalAccept = useCallback(async (proposal: BlueprintSectionProposal) => {
    const updated = await api.blueprint.repo.acceptProposal(repoId, proposal.id);
    setSections((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshAll();
  }, [repoId, refreshAll]);

  const handleProposalEditAccept = useCallback(async (proposal: BlueprintSectionProposal, edited: string) => {
    const updated = await api.blueprint.repo.editAndAcceptProposal(repoId, proposal.id, { body_markdown: edited });
    setSections((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshAll();
  }, [repoId, refreshAll]);

  const handleProposalReject = useCallback(async (proposal: BlueprintSectionProposal, reason: string) => {
    await api.blueprint.repo.rejectProposal(repoId, proposal.id, { reason });
    await refreshAll();
  }, [repoId, refreshAll]);

  if (error) {
    return (
      <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)] mt-4">
        <p className="text-xs text-[var(--danger)]">Couldn&apos;t load Repo Blueprint — {error}</p>
      </Card>
    );
  }

  if (!toc || toc.sections.length === 0) {
    return null;  // soft-fail; many repos have no Blueprint yet
  }

  return (
    <Stack gap="4" className="border-t-2 border-[var(--primary)] pt-4">
      <Cluster gap="2" align="center">
        <FileText className="size-4 text-[var(--primary)]" aria-hidden />
        <span className="text-sm font-semibold">Repo Blueprint</span>
        <span className="ml-auto text-xs text-[var(--text-muted)]">
          {toc.sections.length} sections · curated narrative
        </span>
      </Cluster>

      <BlueprintProposalQueue proposals={proposals} onOpen={() => setProposalsOpen(true)} />

      <Stack gap="4">
        {orderSections(toc.sections).map((s) => {
          const section = sections[s.section_key];
          if (!section) {
            return (
              <Card key={s.section_key}>
                <Stack gap="2">
                  <div className="h-5 w-48 animate-pulse rounded-md bg-[var(--surface-2)]" />
                  <div className="h-3 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
                  <div className="h-3 w-3/4 animate-pulse rounded-md bg-[var(--surface-2)]" />
                </Stack>
              </Card>
            );
          }
          return (
            <section id={`repo-section-${s.section_key}`} key={s.section_key}>
              <BlueprintSectionViewer
                section={section}
                scope="repo"
                scopeId={repoId}
                onEdit={() => setEditorOpen(section)}
                onLockToggle={() => handleLockToggle(section.section_key)}
                onRegenerate={() => handleRegenerate(section.section_key)}
                onViewRevisions={() => setRevisionsKey(section.section_key)}
              />
            </section>
          );
        })}
      </Stack>

      <BlueprintSectionEditor
        section={editorOpen}
        onClose={() => setEditorOpen(null)}
        onSave={handleEditSave}
      />
      <BlueprintSectionRevisions
        open={revisionsKey !== null}
        sectionTitle={revisionsKey ? sections[revisionsKey]?.title ?? "" : ""}
        sectionKey={revisionsKey}
        load={(key) => api.blueprint.repo.getRevisions(repoId, key)}
        onClose={() => setRevisionsKey(null)}
      />
      <BlueprintProposalDiffModal
        open={proposalsOpen}
        proposals={proposals}
        resolveCurrentSection={(key) => sections[key] ?? null}
        onAccept={handleProposalAccept}
        onEditAndAccept={handleProposalEditAccept}
        onReject={handleProposalReject}
        onClose={() => setProposalsOpen(false)}
      />
    </Stack>
  );
}
