"use client";

/** The dossier for one selected file/folder node: what it is, its
 *  architecture role, deterministic signals, and its relationships - every
 *  related node clickable to hop onward. Sections render only when they
 *  carry data (no empty headings). */

import { ArrowLeft } from "lucide-react";

import { ChatMarkdown } from "@/components/chat/chat-markdown";
import type { DossierRef, ShowcaseNodeDossier } from "@/lib/api/public-client";

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
        <Signals node={node} sig={sig} />
      </header>

      {d.what && <ChatMarkdown content={d.what} className="max-w-none" />}

      {(arch.role || arch.layer || arch.pattern || (arch.responsibilities?.length ?? 0) > 0) && (
        <Architecture arch={arch} />
      )}

      {node.dossier?.contains && node.dossier.contains.length > 0 && (
        <RefGroup title="Contains" refs={node.dossier.contains} onNav={onNav} />
      )}

      {relations.map(([key, refs]) => (
        <RefGroup key={key} title={labelFor(key)} refs={refs} onNav={onNav} />
      ))}

      {d.see_also && d.see_also.length > 0 && (
        <RefGroup title="See also" refs={d.see_also} onNav={onNav} />
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
}: {
  node: ShowcaseNodeDossier;
  sig: NonNullable<ShowcaseNodeDossier["dossier"]>["signals"];
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
      {(a.responsibilities?.length ?? 0) > 0 && (
        <ul className="mt-3 list-inside list-disc text-sm text-[var(--text-muted)]">
          {a.responsibilities?.map((r) => <li key={r}>{r}</li>)}
        </ul>
      )}
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

function RefGroup({
  title,
  refs,
  onNav,
}: {
  title: string;
  refs: DossierRef[];
  onNav: (id: string) => void;
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {refs.map((r) => (
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
    </section>
  );
}
