"use client";

/**
 * NodeDossierDrawer — the shared, self-navigating node-dossier slide-over
 * (Phase D contract #1). Fetches `GET /v1/knowledge/nodes/{id}` and renders
 * the full dossier: headline + what + architecture + signals + contains +
 * contained_by + typed relations + see-also. Every ref inside is a clickable
 * node-id (`<NodeRefChip>` / `<NodeRefRow>`) that navigates within the
 * drawer's own back-stack — so you can hop node → node without losing place.
 *
 * Mounted once by `NodeDossierProvider`; opened by `useNodeDossier().open()`.
 * Mirrors `<FileDetailDrawer>` chrome: backdrop, Esc, focus-on-close,
 * prefers-reduced-motion slide-in.
 */

import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, Layers, X } from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { api, type NodeDossier, type NodeDossierElement, type NodeRef } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { NodeRefChip, NodeRefRow } from "@/components/knowledge/node-ref-chip";
import { KnowledgeMermaid } from "@/components/knowledge/knowledge-mermaid";

interface NodeDossierDrawerProps {
  nodeId: string | null;
  canBack: boolean;
  onNavigate: (nodeId: string) => void;
  onBack: () => void;
  onClose: () => void;
}

export function NodeDossierDrawer({ nodeId, canBack, onNavigate, onBack, onClose }: NodeDossierDrawerProps) {
  const [dossier, setDossier] = useState<NodeDossier | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Esc to close.
  useEffect(() => {
    if (!nodeId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nodeId, onClose]);

  // Land focus on Close when the drawer opens.
  useEffect(() => { if (nodeId) closeRef.current?.focus(); }, [nodeId]);

  // Fetch the dossier whenever the visible node changes.
  useEffect(() => {
    if (!nodeId) { setDossier(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.knowledge
      .node(nodeId)
      .then((res) => { if (!cancelled) setDossier(res.dossier); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load node"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [nodeId]);

  if (!nodeId) return null;

  return (
    <div className="fixed inset-0 z-[60]" data-testid="node-dossier-drawer">
      <button
        type="button"
        aria-label="Close node detail"
        onClick={onClose}
        className="absolute inset-0 bg-black/30 backdrop-blur-[1px] motion-safe:animate-in motion-safe:fade-in"
        data-testid="node-dossier-backdrop"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "absolute right-0 top-0 flex h-full w-full max-w-[640px] flex-col",
          "border-l border-[var(--border)] bg-[var(--surface)] shadow-2xl",
          "motion-safe:animate-in motion-safe:slide-in-from-right",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <Cluster gap="2" align="center" className="min-w-0">
            {canBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Back to previous node"
                data-testid="node-dossier-back"
                className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              >
                <ArrowLeft className="size-4" aria-hidden />
              </button>
            )}
            <Stack gap="0" className="min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                {dossier?.kind ?? "Node"}
              </span>
              <span id={titleId} className="truncate text-sm font-semibold text-[var(--text)]" title={dossier?.name}>
                {loading && !dossier ? "Loading…" : dossier?.name ?? "—"}
              </span>
            </Stack>
          </Cluster>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close node detail"
            className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && !dossier && <DossierSkeleton />}
          {error && <p className="text-sm text-[var(--danger)]" role="alert">{error}</p>}
          {!error && dossier && <DossierBody dossier={dossier} onNavigate={onNavigate} />}
        </div>
      </aside>
    </div>
  );
}

function DossierBody({ dossier, onNavigate }: { dossier: NodeDossier; onNavigate: (id: string) => void }) {
  const arch = dossier.architecture;
  const archChips: Array<[string, string | null]> = [
    ["layer", arch.layer],
    ["role", arch.role],
    ["pattern", arch.pattern],
  ];
  const signalChips: Array<[string, string | null]> = [
    ["lang", dossier.signals.language],
    ["loc", dossier.signals.loc != null ? dossier.signals.loc.toLocaleString() : null],
  ];
  const relationEntries = Object.entries(dossier.relations).filter(([, refs]) => refs && refs.length > 0);

  return (
    <Stack gap="4">
      {/* Path */}
      {dossier.path && (
        <code className="block break-all rounded-md bg-[var(--code-bg)] px-2 py-1 font-mono text-[11px] text-[var(--text-muted)]">
          {dossier.path}
        </code>
      )}

      {/* Headline + what */}
      <Stack gap="1">
        {dossier.headline && <p className="text-sm font-medium text-[var(--text)]">{dossier.headline}</p>}
        {dossier.what && <p className="text-sm leading-relaxed text-[var(--text-muted)]">{dossier.what}</p>}
      </Stack>

      {/* Architecture + signals chips */}
      {(archChips.some(([, v]) => v) || signalChips.some(([, v]) => v) || (dossier.signals.tags?.length ?? 0) > 0) && (
        <Cluster gap="1.5" align="center" className="flex-wrap">
          {[...archChips, ...signalChips].map(([label, value]) =>
            value ? (
              <span key={label} className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
                <span className="uppercase tracking-wider text-[var(--text-subtle)]">{label}</span>
                <span className="text-[var(--text)]">{value}</span>
              </span>
            ) : null,
          )}
          {dossier.signals.tags?.map((t) => (
            <span key={t} className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">{t}</span>
          ))}
        </Cluster>
      )}

      {/* Responsibilities */}
      {arch.responsibilities.length > 0 && (
        <Section title="Responsibilities">
          <ul className="list-disc pl-5 text-sm text-[var(--text-muted)]">
            {arch.responsibilities.map((r, i) => <li key={i} className="leading-relaxed">{r}</li>)}
          </ul>
        </Section>
      )}

      {/* Diagram — the dossier's own Mermaid (file/module architecture or flow). */}
      {dossier.mermaid && (
        <Section title="Diagram">
          <KnowledgeMermaid chart={dossier.mermaid} ariaLabel={`${dossier.name} diagram`} />
        </Section>
      )}

      {/* Elements — folded symbol index: the "what's actually in this file" list
          (functions / classes / methods are no longer separate nodes). */}
      {dossier.elements && dossier.elements.length > 0 && (
        <Section title={`Elements (${dossier.elements.length})`}>
          <Stack gap="1.5">
            {dossier.elements.map((el, i) => (
              <ElementRow key={`${el.name}-${i}`} el={el} />
            ))}
          </Stack>
        </Section>
      )}

      {/* Containment */}
      {dossier.contained_by && (
        <Section title="Contained by">
          <NodeRefRow node={dossier.contained_by} onNavigate={onNavigate} />
        </Section>
      )}
      {dossier.contains.length > 0 && (
        <Section title={`Contains (${dossier.contains.length})`}>
          <Stack gap="1.5">
            {dossier.contains.map((c) => (
              <NodeRefRow key={c.node_id} node={c} onNavigate={onNavigate} />
            ))}
          </Stack>
        </Section>
      )}

      {/* Typed relations */}
      {relationEntries.map(([rel, refs]) => (
        <Section key={rel} title={`${prettyRelation(rel)} (${refs.length})`}>
          <Cluster gap="1.5" align="center" className="flex-wrap">
            {refs.map((r) => (
              <NodeRefChip key={r.node_id} node={r} onNavigate={onNavigate} />
            ))}
          </Cluster>
        </Section>
      ))}

      {/* See also */}
      {dossier.see_also.length > 0 && (
        <Section title="See also">
          <Cluster gap="1.5" align="center" className="flex-wrap">
            {dossier.see_also.map((r) => (
              <NodeRefChip key={r.node_id} node={r} onNavigate={onNavigate} />
            ))}
          </Cluster>
        </Section>
      )}
    </Stack>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Stack gap="2">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
        <Layers className="size-3" aria-hidden />
        {title}
      </h3>
      {children}
    </Stack>
  );
}

/** One folded symbol from the dossier `elements` block. */
function ElementRow({ el }: { el: NodeDossierElement }) {
  return (
    <div className="rounded-md border border-[var(--border)] p-2" data-testid="dossier-element">
      <Cluster gap="2" align="center" className="flex-wrap">
        <span className="font-mono text-xs font-semibold text-[var(--text)]">{el.name}</span>
        <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
          {el.kind}
        </span>
        {el.line_start != null && (
          <span className="text-[10px] tabular-nums text-[var(--text-subtle)]">
            L{el.line_start}{el.line_end != null ? `–${el.line_end}` : ""}
          </span>
        )}
        {el.complexity != null && (
          <span className="text-[10px] tabular-nums text-[var(--text-subtle)]" title="cyclomatic complexity">
            cx {el.complexity}
          </span>
        )}
      </Cluster>
      {el.signature && (
        <code className="mt-1 block whitespace-pre-wrap rounded bg-[var(--code-bg)] px-2 py-1 font-mono text-[10px] text-[var(--text)]">
          {el.signature}
        </code>
      )}
      {el.doc && <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)] line-clamp-2">{el.doc}</p>}
    </div>
  );
}

/** "imported_by" → "Imported by", "called_by" → "Called by". */
function prettyRelation(rel: string): string {
  const spaced = rel.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function DossierSkeleton() {
  return (
    <Stack gap="3" aria-busy="true" aria-label="Loading node">
      <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--surface-2)]" />
      <div className="h-3 w-full animate-pulse rounded bg-[var(--surface-2)]" />
      <div className="h-3 w-5/6 animate-pulse rounded bg-[var(--surface-2)]" />
      <div className="mt-2 flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-5 w-16 animate-pulse rounded-full bg-[var(--surface-2)]" />
        ))}
      </div>
      <div className="mt-3 h-24 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
    </Stack>
  );
}

/** Re-export so callers can type their own ref lists without a second import. */
export type { NodeRef };
