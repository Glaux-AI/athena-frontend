"use client";

/**
 * /capabilities/[id]/repos/[repo_id]/brief — Repo Brief view (F-04.2).
 *
 * Same shape as the Capability Brief page (F-04.1) but pointed at the
 * `api.brief.repo.*` namespace. Routed under the capability path so the
 * navigation breadcrumbs cleanly trace `Capability → Repos → Repo → Brief`.
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

export default function RepoBriefPage({
  params,
}: {
  params: Promise<{ id: string; repo_id: string }>;
}) {
  const { id: capabilityId, repo_id: repoId } = use(params);
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

  const refreshToc = useCallback(async () => {
    try {
      const [t, p] = await Promise.all([
        api.brief.repo.getToc(repoId),
        api.brief.repo.listProposals(repoId).catch(() => [] as BriefSectionProposal[]),
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
  }, [repoId, activeKey]);

  useEffect(() => { void refreshToc(); }, [refreshToc]);

  useEffect(() => {
    if (!activeKey) return;
    let cancelled = false;
    setSectionLoading(true);
    (async () => {
      try {
        const s = await api.brief.repo.getSection(repoId, activeKey);
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
  }, [repoId, activeKey]);

  const handleEditSave = useCallback(async ({ body_markdown, change_note }: { body_markdown: string; change_note: string }) => {
    if (!activeKey) return;
    const updated = await api.brief.repo.editSection(repoId, activeKey, { body_markdown, change_note });
    setSection(updated);
    setSectionCache((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshToc();
  }, [repoId, activeKey, refreshToc]);

  const handleLockToggle = useCallback(async () => {
    if (!activeKey || !section) return;
    const updated = section.locked
      ? await api.brief.repo.unlockSection(repoId, activeKey)
      : await api.brief.repo.lockSection(repoId, activeKey);
    setSection(updated);
    setSectionCache((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshToc();
  }, [repoId, activeKey, section, refreshToc]);

  const handleRegenerate = useCallback(async () => {
    if (!activeKey) return;
    const updated = await api.brief.repo.regenerateSection(repoId, activeKey);
    if ("body_markdown" in updated) {
      setSection(updated);
      setSectionCache((prev) => ({ ...prev, [updated.section_key]: updated }));
    }
    await refreshToc();
  }, [repoId, activeKey, refreshToc]);

  const handleProposalAccept = useCallback(async (proposal: BriefSectionProposal) => {
    const updated = await api.brief.repo.acceptProposal(repoId, proposal.id);
    setSection((cur) => (cur && cur.section_key === updated.section_key ? updated : cur));
    setSectionCache((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshToc();
  }, [repoId, refreshToc]);

  const handleProposalEditAccept = useCallback(async (proposal: BriefSectionProposal, edited: string) => {
    const updated = await api.brief.repo.editAndAcceptProposal(repoId, proposal.id, { body_markdown: edited });
    setSection((cur) => (cur && cur.section_key === updated.section_key ? updated : cur));
    setSectionCache((prev) => ({ ...prev, [updated.section_key]: updated }));
    await refreshToc();
  }, [repoId, refreshToc]);

  const handleProposalReject = useCallback(async (proposal: BriefSectionProposal, reason: string) => {
    await api.brief.repo.rejectProposal(repoId, proposal.id, { reason });
    await refreshToc();
  }, [repoId, refreshToc]);

  if (tocError) {
    return (
      <Stack gap="4">
        <Link href={`/capabilities/${capabilityId}`} className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)]">
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
        <Link href={`/capabilities/${capabilityId}`} className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)]">
          <ArrowLeft className="size-4" />
          Back to capability
        </Link>
        {toc && (
          <span className="text-xs text-[var(--text-subtle)]">
            Repo Brief · {toc.sections.length} sections · status {toc.status}
          </span>
        )}
      </Cluster>

      <ProposalQueue proposals={proposals} onOpen={() => setProposalsOpen(true)} />

      <div className="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          {toc === null ? (
            <div className="p-3">
              <Stack gap="2" aria-busy="true" aria-label="Loading TOC">
                {Array.from({ length: 10 }).map((_, i) => (
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

      <SectionEditor
        section={editorOpen ? section : null}
        onClose={() => setEditorOpen(false)}
        onSave={handleEditSave}
      />
      <SectionRevisions
        open={revisionsOpen}
        sectionTitle={section?.title ?? ""}
        sectionKey={activeKey}
        load={(key) => api.brief.repo.getRevisions(repoId, key)}
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
