"use client";

/** The dossier for one selected file/folder node: everything knowledge
 *  generated for it - narrative, architecture role, key aspects, a flow
 *  diagram, the folded symbol index - then ALL of its relationships grouped at
 *  the bottom. Long lists paginate (10 at a time). When a file has no LLM
 *  dossier (small / un-enriched), the real indexed SOURCE is shown instead of a
 *  thin card. Sections render only when they carry data (no empty headings). */

import { useState } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";

import { ChatMarkdown } from "@/components/chat/chat-markdown";
import { MermaidDiagram } from "@/components/ui/mermaid-diagram";
import type {
  DossierRef,
  ShowcaseDossierElement,
  ShowcaseNodeBody,
  ShowcaseNodeDossier,
} from "@/lib/api/public-client";

const PAGE_SIZE = 10;

const RELATION_LABELS: Record<string, string> = {
  imports: "Imports",
  imported_by: "Imported by",
  calls: "Calls",
  called_by: "Called by",
  references: "References",
  referenced_by: "Referenced by",
  extends: "Extends",
  implements: "Implements",
  handles: "Handles",
  produces: "Produces",
  consumes: "Consumes",
  reads: "Reads",
  writes: "Writes",
  integrates_with: "Integrates with",
};

function labelFor(key: string): string {
  return RELATION_LABELS[key] ?? key.replace(/_/g, " ");
}

export function ShowcaseNodeView({
  node,
  onBack,
  onNav,
}: {
  node: ShowcaseNodeDossier;
  onBack: () => void;
  onNav: (id: string) => void;
}) {
  const d = node.dossier ?? {};
  const arch = d.architecture ?? {};
  const sig = d.signals ?? {};
  const relations = Object.entries(d.relations ?? {}).filter(([, v]) => v && v.length > 0);
  const elements = d.elements ?? [];
  const responsibilities = arch.responsibilities ?? [];
  const contains = d.contains ?? [];
  const containsCount = d.contains_count ?? contains.length;
  const seeAlso = d.see_also ?? [];
  const hasArch = Boolean(arch.role || arch.layer || arch.pattern);
  const hasRelationships =
    Boolean(d.contained_by) || contains.length > 0 || relations.length > 0 || seeAlso.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
      >
        <ArrowLeft className="size-4" aria-hidden /> Back to blueprint
      </button>

      <header className="flex flex-col gap-1">
        {node.path && <p className="font-mono text-xs text-[var(--text-subtle)]">{node.path}</p>}
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--text)]">{node.name}</h2>
        {d.headline && <p className="text-base text-[var(--text-muted)]">{d.headline}</p>}
        <Signals node={node} sig={sig} model={d.provenance?.llm ? d.provenance?.model ?? null : null} />
      </header>

      {d.what && <ChatMarkdown content={d.what} className="max-w-none" />}

      {hasArch && <Architecture arch={arch} />}

      {responsibilities.length > 0 && (
        <Section title="Key aspects">
          <ul className="list-inside list-disc text-sm leading-relaxed text-[var(--text-muted)]">
            {responsibilities.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </Section>
      )}

      {d.mermaid && (
        <Section title="Diagram">
          <MermaidDiagram chart={d.mermaid} ariaLabel={`${node.name} diagram`} />
        </Section>
      )}

      {elements.length > 0 && <ElementList elements={elements} />}

      {node.body && <FileSource body={node.body} path={node.path} repoFullName={node.repo_full_name} />}

      {hasRelationships && (
        <div className="flex flex-col gap-6 border-t border-[var(--border-soft)] pt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Relationships
          </h3>
          {d.contained_by && <RefGroup title="Contained by" refs={[d.contained_by]} onNav={onNav} />}
          {contains.length > 0 && (
            <RefGroup title="Contains" refs={contains} total={containsCount} onNav={onNav} />
          )}
          {relations.map(([key, refs]) => (
            <RefGroup key={key} title={labelFor(key)} refs={refs} onNav={onNav} />
          ))}
          {seeAlso.length > 0 && <RefGroup title="See also" refs={seeAlso} onNav={onNav} />}
        </div>
      )}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 text-xs text-[var(--text-muted)]">
      {children}
    </span>
  );
}

function Signals({
  node,
  sig,
  model,
}: {
  node: ShowcaseNodeDossier;
  sig: NonNullable<ShowcaseNodeDossier["dossier"]>["signals"];
  model?: string | null;
}) {
  const s = sig ?? {};
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {node.node_kind && <Chip>{node.node_kind}</Chip>}
      {(s.language ?? node.layer) && <Chip>{s.language ?? node.layer}</Chip>}
      {s.loc != null && <Chip>{s.loc} LOC</Chip>}
      {s.is_entry_point && <Chip>entry point</Chip>}
      {s.is_hub && <Chip>hub</Chip>}
      {(node.tags ?? []).slice(0, 6).map((t) => (
        <Chip key={t}>#{t}</Chip>
      ))}
      {model && (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-[var(--primary-soft)] px-2.5 py-0.5 text-xs text-[var(--primary)]"
          title="The model that generated this dossier"
        >
          <Sparkles className="size-3" aria-hidden /> {model}
        </span>
      )}
    </div>
  );
}

function Architecture({ arch }: { arch: NonNullable<ShowcaseNodeDossier["dossier"]>["architecture"] }) {
  const a = arch ?? {};
  return (
    <section className="rounded-lg bg-[var(--surface-2)] p-4">
      <h3 className="text-sm font-semibold text-[var(--text)]">Architecture</h3>
      <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        {a.role && <Field label="Role" value={a.role} />}
        {a.layer && <Field label="Layer" value={a.layer} />}
        {a.pattern && <Field label="Pattern" value={a.pattern} />}
      </dl>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[11px] uppercase tracking-wide text-[var(--text-subtle)]">{label}</dt>
      <dd className="text-[var(--text)]">{value}</dd>
    </div>
  );
}

/** Section wrapper with a heading + optional count badge. */
function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
        {title}
        {count != null && (
          <span className="rounded-full bg-[var(--surface-3)] px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--text-subtle)]">
            {count}
          </span>
        )}
      </h3>
      {children}
    </section>
  );
}

/** "Show N more" / "Show less" control for a paginated list. */
function ShowMore({
  total,
  shown,
  expanded,
  onToggle,
}: {
  total: number;
  shown: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (total <= PAGE_SIZE) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-fit text-xs font-medium text-[var(--primary)] transition-colors hover:underline"
    >
      {expanded ? "Show less" : `Show ${total - shown} more`}
    </button>
  );
}

/** A typed relationship / containment list, paginated at 10. ``total`` lets the
 *  badge reflect the true count when the list itself was capped server-side. */
function RefGroup({
  title,
  refs,
  total,
  onNav,
}: {
  title: string;
  refs: DossierRef[];
  total?: number;
  onNav: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? refs : refs.slice(0, PAGE_SIZE);
  return (
    <Section title={title} count={total ?? refs.length}>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((r) => (
          <button
            key={r.node_id}
            type="button"
            onClick={() => onNav(r.node_id)}
            title={r.path ?? undefined}
            className="max-w-full truncate rounded-md border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1 font-mono text-xs text-[var(--text)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            {r.name}
          </button>
        ))}
      </div>
      <ShowMore
        total={refs.length}
        shown={shown.length}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />
    </Section>
  );
}

/** The folded symbol index for a file node, paginated at 10. */
function ElementList({ elements }: { elements: ShowcaseDossierElement[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? elements : elements.slice(0, PAGE_SIZE);
  return (
    <Section title="Elements" count={elements.length}>
      <div className="flex flex-col gap-1.5">
        {shown.map((el, i) => (
          <ElementRow key={`${el.name}-${i}`} el={el} />
        ))}
      </div>
      <ShowMore
        total={elements.length}
        shown={shown.length}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />
    </Section>
  );
}

function ElementRow({ el }: { el: ShowcaseDossierElement }) {
  return (
    <div className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-2)] p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-semibold text-[var(--text)]">{el.name}</span>
        <span className="rounded-full bg-[var(--surface-3)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
          {el.kind}
        </span>
        {el.line_start != null && (
          <span className="text-[10px] tabular-nums text-[var(--text-subtle)]">
            L{el.line_start}
            {el.line_end != null ? `–${el.line_end}` : ""}
          </span>
        )}
      </div>
      {el.signature && (
        <code className="mt-1 block whitespace-pre-wrap rounded bg-[var(--code-bg)] px-2 py-1 font-mono text-[10px] text-[var(--text)]">
          {el.signature}
        </code>
      )}
      {el.doc && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--text-muted)]">{el.doc}</p>}
    </div>
  );
}

/** The full indexed file source - the fallback when a file has no LLM dossier. */
function FileSource({
  body,
  path,
  repoFullName,
}: {
  body: ShowcaseNodeBody;
  path: string | null;
  repoFullName: string | null;
}) {
  const githubHref =
    repoFullName && path ? `https://github.com/${repoFullName}/blob/HEAD/${path}` : null;
  return (
    <Section title="Source">
      <pre className="max-h-[640px] overflow-auto rounded-lg border border-[var(--border-soft)] bg-[var(--code-bg)] p-3 text-[12px] leading-relaxed">
        <code className="font-mono text-[var(--text)]">{body.content}</code>
      </pre>
      {body.truncated && (
        <p className="text-xs text-[var(--text-muted)]">
          File truncated for display.
          {githubHref && (
            <>
              {" "}
              <a
                href={githubHref}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-[var(--primary)] hover:underline"
              >
                View the full file on GitHub
              </a>
              .
            </>
          )}
        </p>
      )}
    </Section>
  );
}
