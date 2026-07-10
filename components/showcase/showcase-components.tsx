"use client";

/** The repo's semantic component nodes (API endpoints, DB tables, env vars,
 *  services, dependencies, external systems) grouped by kind. They already
 *  exist in the knowledge graph, but the file tree alone never surfaced them,
 *  so the page read thinner than the knowledge actually is. Each chip opens
 *  that node's dossier. Long groups paginate (10 at a time). */

import { useState } from "react";

import { Pill } from "@/components/ui/pill";
import { focusRing } from "@/components/ui/focus";
import { cn } from "@/lib/cn";
import type { ShowcaseComponent } from "@/lib/api/public-client";

const PAGE_SIZE = 10;

const KIND_LABELS: Record<string, string> = {
  api_endpoint: "API endpoints",
  service: "Services",
  db_table: "Database tables",
  external_system: "External systems",
  dependency: "Dependencies",
  env_var: "Environment variables",
};

// Most architecturally-telling kinds first, regardless of server grouping order.
const KIND_ORDER = [
  "api_endpoint",
  "service",
  "db_table",
  "external_system",
  "dependency",
  "env_var",
];

function labelFor(kind: string): string {
  return KIND_LABELS[kind] ?? kind.replace(/_/g, " ");
}

function orderedKinds(components: Record<string, ShowcaseComponent[]>): string[] {
  return Object.keys(components)
    .filter((k) => (components[k]?.length ?? 0) > 0)
    .sort((a, b) => {
      const ia = KIND_ORDER.indexOf(a);
      const ib = KIND_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
}

export function ShowcaseComponents({
  components,
  onNode,
}: {
  components: Record<string, ShowcaseComponent[]>;
  onNode: (id: string) => void;
}) {
  const kinds = orderedKinds(components);
  if (kinds.length === 0) return null;
  return (
    <section className="mt-10 flex flex-col gap-6 pt-8">
      <hr className="hr-horizon -mt-8" aria-hidden />
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight text-[var(--text)]">Components</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Interfaces and resources Athena identified across this repository. Select any to open its
          knowledge.
        </p>
      </div>
      {kinds.map((kind) => (
        <ComponentGroup
          key={kind}
          title={labelFor(kind)}
          items={components[kind] ?? []}
          onNode={onNode}
        />
      ))}
    </section>
  );
}

function ComponentGroup({
  title,
  items,
  onNode,
}: {
  title: string;
  items: ShowcaseComponent[];
  onNode: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, PAGE_SIZE);
  return (
    <div className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
        {title}
        <Pill tone="neutral" size="sm" className="tabular-nums">{items.length}</Pill>
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((c) => (
          <button
            key={c.node_id}
            type="button"
            onClick={() => onNode(c.node_id)}
            title={c.summary || c.path || undefined}
            className={cn(
              "max-w-full truncate rounded-md border border-[var(--border-soft)] bg-[var(--surface)] px-2 py-1 font-mono text-xs text-[var(--text)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]",
              focusRing,
            )}
          >
            {c.name}
          </button>
        ))}
      </div>
      {items.length > PAGE_SIZE && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={cn("w-fit rounded-sm text-xs font-medium text-[var(--primary)] transition-colors hover:underline", focusRing)}
        >
          {expanded ? "Show less" : `Show ${items.length - shown.length} more`}
        </button>
      )}
    </div>
  );
}
