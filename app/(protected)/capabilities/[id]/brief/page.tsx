"use client";

/**
 * /capabilities/[id]/brief — Capability Brief view (F-04.1).
 *
 * Composes left-sidebar TOC + main-panel section viewer. Pulls
 * `api.brief.capability.getToc(id)` once for the sidebar; pulls
 * `api.brief.capability.getSection(id, sectionKey)` per selection.
 *
 * The pending-proposals banner + diff modal live above the viewer and act on
 * the same Brief.
 */

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { Card } from "@/components/ui/card";
import {
  api,
  ApiError,
  type BriefSection,
  type BriefSectionProposal,
  type BriefToc,
} from "@/lib/api/client";
import { BriefToc as BriefTocSidebar } from "@/components/brief/brief-toc";
import { BriefSectionViewer } from "@/components/brief/brief-section-viewer";
import { SectionEditor } from "@/components/brief/section-editor";
import { SectionRevisions } from "@/components/brief/section-revisions";
import { ProposalQueue } from "@/components/brief/proposal-queue";
import { ProposalDiffModal } from "@/components/brief/proposal-diff-modal";

export default function CapabilityBriefPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [toc, setToc] = useState<BriefToc | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [section, setSection] = useState<BriefSection | null>(null);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [proposals, setProposals] = useState<BriefSectionProposal[]>([]);
  const [proposalsOpen, setProposalsOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tocError, setTocError] = useState<string | null>(null);
  const [sectionCache, setSectionCache] = useState<Record<string, BriefSection>>({});

  // Initial fetch — TOC + proposals
  const refreshToc = useCallback(async () => {
    try {
      const [t, p] = await Promise.all([
        api.brief.capability.getToc(id),
        api.brief.capability.listProposals(id).catch(() => [] as BriefSectionProposal[]),
      ]);
      setToc(t);
      setProposals(p);
      if (!activeKey && t.sections.length > 0) {
        setActiveKey(t.sections[0]!.section_key);
      }
      setTocError(null);
    } catch (e) {
      setTocError(e instanceof ApiError ? e.message : "Failed to load Brief.");
    }
  }, [id, activeKey]);

  useEffect(() => { void refreshToc(); }, [refreshToc]);

  // Fetch the active section's full body whenever the selection changes.
  useEffect(() => {
    if (!activeKey) return;
    let cancelled = false;
    setSectionLoading(true);
    (async () => {
      try {
        const s = await api.brief.capability.getSection(id, activeKey);
        if (!cancelled) {
          setSection(s);
          setSectionCache((prev) => ({ ...prev, [s.section_key]: s }));
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Failed to load section.");
      } finally {
        if (!cancelled) setSectionLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, activeKey]);

  const handleEditSave = useCallback(async ({ body_markdown, change_note }: { body_markdown: string; change_note: string }) => {
    if (!activeKey) return;
    const updated = await api.brief.capability.editSection(id, activeKey, { body_markdown, change_note });
    setSection(updated);
    setSectionCache((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshToc();
  }, [id, activeKey, refreshToc]);

  const handleLockToggle = useCallback(async () => {
    if (!activeKey || !section) return;
    const updated = section.locked
      ? await api.brief.capability.unlockSection(id, activeKey)
      : await api.brief.capability.lockSection(id, activeKey);
    setSection(updated);
    setSectionCache((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshToc();
  }, [id, activeKey, section, refreshToc]);

  const handleRegenerate = useCallback(async () => {
    if (!activeKey) return;
    const updated = await api.brief.capability.regenerateSection(id, activeKey);
    if ("body_markdown" in updated) {
      setSection(updated);
      setSectionCache((prev) => ({ ...prev, [updated.section_key]: updated }));
    }
    await refreshToc();
  }, [id, activeKey, refreshToc]);

  const handleProposalAccept = useCallback(async (proposal: BriefSectionProposal) => {
    const updated = await api.brief.capability.acceptProposal(id, proposal.id);
    setSection((cur) => (cur && cur.section_key === updated.section_key ? updated : cur));
    setSectionCache((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshToc();
  }, [id, refreshToc]);

  const handleProposalEditAccept = useCallback(async (proposal: BriefSectionProposal, edited: string) => {
    const updated = await api.brief.capability.editAndAcceptProposal(id, proposal.id, { body_markdown: edited });
    setSection((cur) => (cur && cur.section_key === updated.section_key ? updated : cur));
    setSectionCache((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshToc();
  }, [id, refreshToc]);

  const handleProposalReject = useCallback(async (proposal: BriefSectionProposal, reason: string) => {
    await api.brief.capability.rejectProposal(id, proposal.id, { reason });
    await refreshToc();
  }, [id, refreshToc]);

  if (tocError) {
    return (
      <Stack gap="4">
        <Link href={`/capabilities/${id}`} className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)]">
          <ArrowLeft className="size-4" />
          Back to capability
        </Link>
        <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger)]">{tocError}</p>
        </Card>
      </Stack>
    );
  }

  return (
    <Stack gap="3" className="min-h-full">
      <Cluster justify="between" align="center">
        <Link href={`/capabilities/${id}`} className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)]">
          <ArrowLeft className="size-4" />
          Back to capability
        </Link>
        {toc && (
          <span className="text-xs text-[var(--text-subtle)]">
            Brief · {toc.sections.length} sections · status {toc.status}
          </span>
        )}
      </Cluster>

      <ProposalQueue proposals={proposals} onOpen={() => setProposalsOpen(true)} />

      <div className="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        {/* Sidebar */}
        <aside className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          {toc === null ? (
            <div className="p-3">
              <Stack gap="2" aria-busy="true" aria-label="Loading TOC">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="h-7 animate-pulse rounded-md bg-[var(--surface-2)]" />
                ))}
              </Stack>
            </div>
          ) : (
            <BriefTocSidebar
              sections={toc.sections}
              activeSectionKey={activeKey}
              onSelect={setActiveKey}
            />
          )}
        </aside>

        {/* Main */}
        <div className="min-w-0">
          {sectionLoading || !section ? (
            <Stack gap="3" aria-busy="true" aria-label="Loading section">
              <Card>
                <Stack gap="2">
                  <div className="h-6 w-48 animate-pulse rounded-md bg-[var(--surface-2)]" />
                  <div className="h-3 w-3/4 animate-pulse rounded-md bg-[var(--surface-2)]" />
                  <div className="h-3 w-1/2 animate-pulse rounded-md bg-[var(--surface-2)]" />
                </Stack>
              </Card>
              <Card>
                <Stack gap="2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-3 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
                  ))}
                </Stack>
              </Card>
            </Stack>
          ) : error ? (
            <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
              <p className="text-sm text-[var(--danger)]">{error}</p>
            </Card>
          ) : (
            <BriefSectionViewer
              section={section}
              onEdit={() => setEditorOpen(true)}
              onLockToggle={handleLockToggle}
              onRegenerate={handleRegenerate}
              onViewRevisions={() => setRevisionsOpen(true)}
            />
          )}
        </div>
      </div>

      {/* Drawers + modals */}
      <SectionEditor
        section={editorOpen ? section : null}
        onClose={() => setEditorOpen(false)}
        onSave={handleEditSave}
      />
      <SectionRevisions
        open={revisionsOpen}
        sectionTitle={section?.title ?? ""}
        sectionKey={activeKey}
        load={(key) => api.brief.capability.getRevisions(id, key)}
        onClose={() => setRevisionsOpen(false)}
      />
      <ProposalDiffModal
        open={proposalsOpen}
        proposals={proposals}
        resolveCurrentSection={(key) => sectionCache[key] ?? null}
        onAccept={handleProposalAccept}
        onEditAndAccept={handleProposalEditAccept}
        onReject={handleProposalReject}
        onClose={() => setProposalsOpen(false)}
      />
    </Stack>
  );
}
