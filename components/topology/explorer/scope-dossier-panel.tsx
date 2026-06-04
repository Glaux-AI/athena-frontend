"use client";

/**
 * ScopeDossierPanel — the detail view for a synthetic scope node (the repo /
 * capability / org root, or a scope-ref) in the topology explorer.
 *
 * There is no `repo` / `capability` / `org` KG node, so there's nothing to
 * fetch from `api.knowledge.node` and the panel used to fall back to a near
 * empty placeholder. Their rich detail actually lives in the PARALLEL Blueprint
 * system (multi-section, multi-origin, editable, approval-gated) — see
 * <RepoBlueprintSections> / the cap + org Blueprint tabs. This panel surfaces
 * that blueprint READ-ONLY inline: the synthesized narrative apex
 * (`overview` / `architecture` / `portfolio` — i.e. the diagram-bearing
 * sections) plus identity + a few KPIs, so selecting a scope shows "its
 * blueprint + info" the same way a file shows its dossier. An "Open full
 * blueprint" link goes to the scope's own Blueprint tab for the complete,
 * editable surface (proposals / lock / regenerate live there, not here).
 *
 * Body rendering reuses the exact Blueprint section renderers
 * (<BlueprintStructuredBody> + the shared MarkdownLite), so the diagram nodes /
 * derived-item chips stay clickable and deep-link into the global node-dossier
 * drawer — node→node hops from a scope view without disturbing the explorer
 * selection.
 *
 * Soft-fails like <RepoBlueprintSections>: a scope whose blueprint isn't built
 * yet (404) shows identity + KPIs + a gentle note, never an error card.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink, FileText, Workflow } from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { Card } from "@/components/ui/card";
import {
  api,
  ApiError,
  type BlueprintSection,
  type BlueprintToc,
} from "@/lib/api/client";
import {
  BlueprintStructuredBody,
  DIAGRAM_SECTIONS,
  hasStructuredBody,
} from "@/components/blueprint/blueprint-structured-body";
import {
  MarkdownLite,
  stripLeadingTitleHeading,
} from "@/components/blueprint/blueprint-section-viewer";
import type { ScopeKind } from "@/components/topology/explorer/scope-seed";
import type { GNode } from "@/components/topology/explorer/explorer-graph";

const SCOPE_LABEL: Record<ScopeKind, string> = {
  repo: "Repository",
  capability: "Capability",
  org: "Organization",
};

/** The synthesized narrative apex to preview, per scope:
 *  repo → overview + architecture, cap → overview, org → portfolio. These are
 *  exactly the diagram-bearing sections, so we reuse that one set. */
const PREVIEW_KEYS = DIAGRAM_SECTIONS;

function blueprintApi(kind: ScopeKind) {
  return kind === "repo"
    ? api.blueprint.repo
    : kind === "capability"
      ? api.blueprint.capability
      : api.blueprint.org;
}

export function ScopeDossierPanel({
  kind,
  scopeId,
  node,
  childCount,
  fullHref,
}: {
  kind: ScopeKind;
  scopeId: string;
  node: GNode | undefined;
  childCount: number;
  fullHref: string | null;
}) {
  const [toc, setToc] = useState<BlueprintToc | null>(null);
  const [previews, setPreviews] = useState<BlueprintSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setToc(null);
    setPreviews([]);
    const bp = blueprintApi(kind);
    bp.getToc(scopeId)
      .then(async (t) => {
        if (cancelled) return;
        setToc(t);
        // Fetch only the narrative-apex sections, in TOC order (overview reads
        // before architecture before portfolio).
        const keys = t.sections.filter((s) => PREVIEW_KEYS.has(s.section_key)).map((s) => s.section_key);
        const secs = await Promise.all(keys.map((k) => bp.getSection(scopeId, k)));
        if (!cancelled) setPreviews(secs);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // Soft-fail on 404 — many scopes have no Blueprint until first ingest.
        if (e instanceof ApiError && e.status === 404) {
          setError(null);
        } else {
          setError(e instanceof Error ? e.message : "Failed to load blueprint");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, scopeId]);

  const label = SCOPE_LABEL[kind];
  const name = node?.name ?? label;
  const moreCount = toc ? toc.sections.length - previews.length : 0;

  return (
    <Card variant="elevated" data-testid="explorer-detail" className="overflow-hidden p-0">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-gradient-to-b from-[var(--surface-2)] to-transparent px-4 py-3 shadow-[var(--inner-highlight)]">
        <Stack gap="0" className="min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{label}</span>
          <span className="truncate text-sm font-semibold text-[var(--text)]" title={name}>{name}</span>
        </Stack>
        {fullHref && (
          <Link
            href={fullHref}
            data-testid="scope-open-blueprint"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--text-muted)] transition-colors duration-150 ease-out hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          >
            <FileText className="size-3.5" aria-hidden />
            Open full blueprint
          </Link>
        )}
      </header>

      <div className="p-4">
        <Stack gap="4">
          <Cluster gap="1.5" align="center" className="flex-wrap">
            <Chip>{childCount} {childCount === 1 ? "child" : "children"} loaded</Chip>
            {toc && <Chip>{toc.sections.length} blueprint {toc.sections.length === 1 ? "section" : "sections"}</Chip>}
            {toc && toc.status !== "ready" && <Chip tone="warn">blueprint {toc.status}</Chip>}
          </Cluster>

          {loading ? (
            <PreviewSkeleton />
          ) : error ? (
            <p className="text-sm text-[var(--text-muted)]">Couldn&apos;t load the blueprint — {error}</p>
          ) : previews.length > 0 ? (
            <Stack gap="5">
              {previews.map((s) => (
                <section key={s.section_key} data-testid={`scope-section-${s.section_key}`}>
                  <Stack gap="2">
                    <Cluster gap="2" align="center">
                      <Workflow className="size-4 text-[var(--primary)]" aria-hidden />
                      <h3 className="text-sm font-semibold text-[var(--text)]">{s.title}</h3>
                    </Cluster>
                    <ScopeSectionBody section={s} />
                  </Stack>
                </section>
              ))}
              {moreCount > 0 && fullHref && (
                <Link
                  href={fullHref}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  <ExternalLink className="size-3.5" aria-hidden />
                  {moreCount} more {moreCount === 1 ? "section" : "sections"} in the full blueprint
                </Link>
              )}
            </Stack>
          ) : (
            <Stack gap="3">
              <p className="text-sm leading-relaxed text-[var(--text-muted)]">
                {`This ${label.toLowerCase()}'s blueprint hasn't been synthesized yet — it's generated after ingestion. Select a node in the graph or the structure tree to see that node's full detail here.`}
              </p>
              {fullHref && (
                <Cluster gap="1.5" align="center" className="text-xs text-[var(--text-subtle)]">
                  <ExternalLink className="size-3.5" aria-hidden />
                  <Link href={fullHref} className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
                    Open the full {label.toLowerCase()} blueprint
                  </Link>
                </Cluster>
              )}
            </Stack>
          )}
        </Stack>
      </div>
    </Card>
  );
}

/** Read-only render of one Blueprint section's body — the same structured +
 *  markdown switch the editable <BlueprintSectionViewer> uses, minus the card
 *  chrome / kebab actions. Diagram sections render BOTH the clickable diagram
 *  (body_json) and the narrative (body_markdown). */
function ScopeSectionBody({ section }: { section: BlueprintSection }) {
  const structured = hasStructuredBody(section.section_key, section.body_json);
  return (
    <article className="blueprint-prose">
      {structured ? (
        <Stack gap="4">
          <BlueprintStructuredBody sectionKey={section.section_key} bodyJson={section.body_json!} />
          {DIAGRAM_SECTIONS.has(section.section_key) && section.body_markdown && (
            <MarkdownLite source={stripLeadingTitleHeading(section.body_markdown, section.title)} />
          )}
        </Stack>
      ) : section.body_markdown ? (
        <MarkdownLite source={stripLeadingTitleHeading(section.body_markdown, section.title)} />
      ) : (
        <p className="text-sm text-[var(--text-muted)]">No body content yet.</p>
      )}
    </article>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: "warn" }) {
  return (
    <span
      className={
        tone === "warn"
          ? "rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--warning-ink)]"
          : "rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]"
      }
    >
      {children}
    </span>
  );
}

function PreviewSkeleton() {
  return (
    <Stack gap="2" data-testid="scope-detail-skeleton" aria-hidden>
      <div className="h-4 w-40 animate-pulse rounded-md bg-[var(--surface-2)]" />
      <div className="h-3 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
      <div className="h-3 w-5/6 animate-pulse rounded-md bg-[var(--surface-2)]" />
      <div className="h-3 w-2/3 animate-pulse rounded-md bg-[var(--surface-2)]" />
    </Stack>
  );
}
