"use client";

/**
 * NodeDossierBody - the shared, chrome-less render of one KG node's dossier.
 * Extracted from `<NodeDossierDrawer>` so the same content powers two surfaces:
 *   1. the global slide-over drawer (`node-dossier-drawer.tsx`), and
 *   2. the topology explorer's inline detail panel (below the graph).
 *
 * It renders the content switch only - skeleton / error / full dossier /
 * leaf-fallback - with NO backdrop, header, or back-stack (those are the
 * drawer's chrome). The file-resolution helpers (`resolveFileTarget` /
 * `isSelfBlueprint`) live here too so both surfaces resolve a leaf node's home
 * FILE blueprint identically.
 */

import { FileText, Layers } from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { api, type NodeDossier, type NodeDossierElement, type NodeDossierResponse, type NodeRef } from "@/lib/api/client";
import { NodeRefChip, NodeRefRow } from "@/components/knowledge/node-ref-chip";
import { KnowledgeMermaid } from "@/components/knowledge/knowledge-mermaid";

// Node kinds that carry their OWN blueprint surface - never redirect these to a
// file. Everything else is a "leaf" (api_endpoint / db_table / db_column /
// dependency / env_var / event / external_system / glossary_term / function /
// class) that is documented as PART OF a file, so opening it should land on
// that file's blueprint.
const SELF_BLUEPRINT_KINDS = new Set(["file", "module", "service", "repo", "domain", "org"]);
// Kinds that ARE a file blueprint - a valid forward target.
const FILE_KINDS = new Set(["file", "module"]);

/** The home FILE a leaf node belongs to, resolved client-side so the surface can
 *  open its blueprint instead of an empty leaf dossier. */
export interface FileTarget {
  /** Knowledge-node id of the file (its repo-file id IS its node id). */
  node_id: string;
  path: string | null;
  name: string;
}

/** Filename (minus any trailing `:line`) for a narrow `q=` file lookup. */
function fileBasename(path: string): string {
  const tail = path.split(/[\\/]/).pop() ?? path;
  return tail.split(":")[0] ?? tail;
}

/** First file/module ref reachable from a node's structural links - parent
 *  first (`contained_by`), then the curated `see_also`, then any relation
 *  bucket. Present whenever the dossier is populated (mock + any node the BE
 *  did enrich); `null` for a bare leaf payload. */
function fileRefFromDossier(d: NodeDossier): NodeRef | null {
  if (d.contained_by && FILE_KINDS.has(d.contained_by.kind)) return d.contained_by;
  for (const r of d.see_also) if (FILE_KINDS.has(r.kind)) return r;
  for (const refs of Object.values(d.relations)) {
    for (const r of refs) if (FILE_KINDS.has(r.kind)) return r;
  }
  return null;
}

function kindOf(res: NodeDossierResponse): string {
  return res.node_kind ?? res.dossier?.kind ?? "";
}

/** True when the node has its own blueprint (file/module/apex) - render it
 *  directly, never forward. */
export function isSelfBlueprint(res: NodeDossierResponse): boolean {
  return SELF_BLUEPRINT_KINDS.has(kindOf(res));
}

/** Resolve the FILE a leaf node lives in. Two sources, in order:
 *   1. the dossier's structural links (when the BE enriched the node, e.g. the
 *      mock synthesises `contained_by`) - gives the file's node-id directly;
 *   2. the leaf's own `path` (a real source / manifest file) + `repo_id` → the
 *      repo file listing, whose row id IS the file's knowledge-node id. This is
 *      the real-mode path: leaf nodes return `dossier: null`, but `api_endpoint`
 *      / `db_table` / `dependency` / `env_var` all carry their defining file's
 *      path. Synthetic nodes (event / external_system / glossary_term) carry a
 *      `<…>` path and resolve to nothing. */
export async function resolveFileTarget(res: NodeDossierResponse): Promise<FileTarget | null> {
  const d = res.dossier;
  if (d) {
    const ref = fileRefFromDossier(d);
    if (ref) return { node_id: ref.node_id, path: ref.path, name: ref.name };
  }
  const path = res.path ?? d?.path ?? null;
  const repoId = res.repo_id ?? null;
  if (path && repoId && !path.startsWith("<")) {
    try {
      const out = await api.repos.files.list(repoId, { q: fileBasename(path), limit: 50 });
      const match = out.items.find((it) => it.path === path);
      if (match) return { node_id: match.id, path: match.path, name: match.name };
    } catch {
      /* best-effort: a failed lookup just means no redirect, not an error */
    }
  }
  return null;
}

interface NodeDossierBodyProps {
  /** The loaded node payload, or null before the first fetch resolves. */
  res: NodeDossierResponse | null;
  /** Resolved home-file CTA target (leaf → its file), or null. */
  fileTarget: FileTarget | null;
  /** True while fetching (or, in the drawer, while auto-forwarding). */
  loading: boolean;
  /** Fetch error message, when any. */
  error?: string | null;
  /** Navigate to another node id (drawer: push the back-stack; panel: open the
   *  global drawer). */
  onNavigate: (id: string) => void;
}

/** The dossier content switch - skeleton / error / full dossier / leaf-fallback.
 *  No chrome; the host (drawer or panel) supplies its own container. */
export function NodeDossierBody({ res, fileTarget, loading, error, onNavigate }: NodeDossierBodyProps) {
  const dossier = res?.dossier ?? null;
  return (
    <>
      {loading && !dossier && <DossierSkeleton />}
      {error && (
        <p
          className="rounded-md border border-[var(--border-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]"
          role="alert"
        >
          {error}
        </p>
      )}
      {!error && dossier && (
        <DossierBody dossier={dossier} fileTarget={fileTarget} onNavigate={onNavigate} />
      )}
      {!error && !dossier && !loading && res && (
        <LeafFallback res={res} fileTarget={fileTarget} onNavigate={onNavigate} />
      )}
    </>
  );
}

function DossierBody({ dossier, fileTarget, onNavigate }: { dossier: NodeDossier; fileTarget: FileTarget | null; onNavigate: (id: string) => void }) {
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
      {/* This kind has no blueprint of its own - its home file does. Keep the
          file one click away even when the user arrived here via Back / a ref. */}
      {fileTarget && <FileBlueprintCTA target={fileTarget} onNavigate={onNavigate} />}

      {/* Path */}
      {dossier.path && (
        <code className="block break-all rounded-md bg-[var(--code-bg)] px-2 py-1 font-mono text-micro text-[var(--text-muted)]">
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
              <span key={label} className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-micro font-medium text-[var(--text-muted)]">
                <span className="uppercase tracking-wider text-[var(--text-subtle)]">{label}</span>
                <span className="text-[var(--text)]">{value}</span>
              </span>
            ) : null,
          )}
          {dossier.signals.tags?.map((t) => (
            <span key={t} className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-micro text-[var(--text-muted)]">{t}</span>
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

      {/* Diagram - the dossier's own Mermaid (file/module architecture or flow). */}
      {dossier.mermaid && (
        <Section title="Diagram">
          <KnowledgeMermaid chart={dossier.mermaid} ariaLabel={`${dossier.name} diagram`} />
        </Section>
      )}

      {/* Elements - folded symbol index: the "what's actually in this file" list
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

/** Primary call-to-action to jump to a leaf node's home FILE blueprint. */
function FileBlueprintCTA({ target, onNavigate }: { target: FileTarget; onNavigate: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(target.node_id)}
      data-testid="open-file-blueprint"
      className="flex w-full items-center justify-between gap-3 rounded-md border border-[var(--primary)] bg-[var(--primary-soft)] px-3 py-2 text-left transition-colors hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
    >
      <span className="min-w-0">
        <span className="block text-micro font-semibold uppercase tracking-wider text-[var(--primary)]">
          Open file blueprint
        </span>
        <code className="block truncate font-mono text-xs text-[var(--text)]" title={target.path ?? target.name}>
          {target.path ?? target.name}
        </code>
      </span>
      <FileText className="size-4 shrink-0 text-[var(--primary)]" aria-hidden />
    </button>
  );
}

/** Rendered when a node has no dossier of its own (a leaf the BE didn't enrich).
 *  Surfaces the identity it does carry + the home-file CTA, so the surface is
 *  never blank - the empty-on-click bug this fixes. */
function LeafFallback({
  res,
  fileTarget,
  onNavigate,
}: {
  res: NodeDossierResponse;
  fileTarget: FileTarget | null;
  onNavigate: (id: string) => void;
}) {
  const path = res.path ?? null;
  const isSynthetic = !!path && path.startsWith("<");
  return (
    <Stack gap="4">
      {fileTarget && <FileBlueprintCTA target={fileTarget} onNavigate={onNavigate} />}
      {path && !isSynthetic && (
        <code className="block break-all rounded-md bg-[var(--code-bg)] px-2 py-1 font-mono text-micro text-[var(--text-muted)]">
          {path}
        </code>
      )}
      {res.summary ? (
        <p className="text-sm leading-relaxed text-[var(--text-muted)]">{res.summary}</p>
      ) : (
        <p className="text-sm italic text-[var(--text-muted)]">
          {fileTarget
            ? "This is part of the file above - open it for the full blueprint."
            : "No standalone blueprint for this node kind; it's documented as part of its file."}
        </p>
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
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2 transition-colors duration-150 ease-out hover:border-[var(--border-strong)]" data-testid="dossier-element">
      <Cluster gap="2" align="center" className="flex-wrap">
        <span className="font-mono text-xs font-semibold text-[var(--text)]">{el.name}</span>
        <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-micro font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
          {el.kind}
        </span>
        {el.line_start != null && (
          <span className="text-micro tabular-nums text-[var(--text-subtle)]">
            L{el.line_start}{el.line_end != null ? `–${el.line_end}` : ""}
          </span>
        )}
        {el.complexity != null && (
          <span className="text-micro tabular-nums text-[var(--text-subtle)]" title="cyclomatic complexity">
            cx {el.complexity}
          </span>
        )}
      </Cluster>
      {el.signature && (
        <code className="mt-1 block whitespace-pre-wrap rounded bg-[var(--code-bg)] px-2 py-1 font-mono text-micro text-[var(--text)]">
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
      <div className="h-4 w-2/3 skeleton rounded" />
      <div className="h-3 w-full skeleton rounded" />
      <div className="h-3 w-5/6 skeleton rounded" />
      <div className="mt-2 flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-5 w-16 skeleton rounded-full" />
        ))}
      </div>
      <div className="mt-3 h-24 w-full skeleton rounded-md" />
    </Stack>
  );
}
