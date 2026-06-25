"use client";

/** Renders one combined-blueprint section: prose (ChatMarkdown, with inline
 *  `[node:…]` citations wired to open the node), a mermaid diagram, the
 *  STRUCTURED architecture digest (central modules / entry points / services -
 *  each clickable straight into its full dossier), a language breakdown, and/or
 *  a derived item list. Long lists paginate (10 at a time). Empty sections never
 *  reach here (the backend filters them out). */

import { useState } from "react";

import { ChatMarkdown } from "@/components/chat/chat-markdown";
import { MermaidDiagram } from "@/components/ui/mermaid-diagram";
import type { ShowcaseSection } from "@/lib/api/public-client";

const PAGE_SIZE = 10;

interface DerivedItem {
  node_id?: string;
  name?: string;
  path?: string | null;
  headline?: string | null;
  kind?: string;
}

interface LanguageRow {
  language?: string;
  files?: number;
  percent?: number;
}

/** A clickable node from the architecture digest (hub / entry point / service). */
interface NodeChip {
  node_id?: string;
  name?: string;
  path?: string | null;
  kind?: string;
  layer?: string | null;
  summary?: string | null;
}

function arr<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function ShowcaseSectionBlock({
  section,
  onNode,
}: {
  section: ShowcaseSection;
  onNode: (id: string) => void;
}) {
  const body = section.body_json ?? {};
  const mermaid = str(body.mermaid);
  const items = arr<DerivedItem>(body.items);
  const languages = arr<LanguageRow>(body.languages);
  const hubs = arr<NodeChip>(body.hubs);
  const entries = arr<NodeChip>(body.entry_points);
  const services = arr<NodeChip>(body.services);

  return (
    <section id={section.section_key} className="scroll-mt-24">
      <h2 className="text-xl font-semibold tracking-tight text-[var(--text)]">{section.title}</h2>
      {section.summary && (
        <p className="mt-1 text-sm text-[var(--text-muted)]">{section.summary}</p>
      )}
      <div className="mt-4 flex flex-col gap-4">
        {section.body_markdown && (
          <ChatMarkdown
            content={section.body_markdown}
            className="max-w-none"
            onCitation={(_source, ref) => onNode(ref)}
          />
        )}
        {mermaid && (
          <MermaidDiagram
            chart={mermaid}
            ariaLabel={`${section.title} diagram`}
            nodeMap={(body.mermaid_nodes as Record<string, string> | undefined) ?? null}
            onNodeSelect={onNode}
          />
        )}
        {(hubs.length > 0 || entries.length > 0 || services.length > 0) && (
          <div className="flex flex-col gap-4 rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] p-4">
            <ChipGroup title="Central modules" chips={hubs} onNode={onNode} />
            <ChipGroup title="Entry points" chips={entries} onNode={onNode} />
            <ChipGroup title="Services" chips={services} onNode={onNode} />
          </div>
        )}
        {languages.length > 0 && <LanguageBars rows={languages} />}
        {items.length > 0 && <DerivedItems items={items} onNode={onNode} />}
      </div>
    </section>
  );
}

/** "Show N more" / "Show less" toggle for a paginated list. */
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
      className="mt-1 w-fit text-xs font-medium text-[var(--primary)] transition-colors hover:underline"
    >
      {expanded ? "Show less" : `Show ${total - shown} more`}
    </button>
  );
}

/** A titled, paginated row of clickable node chips - each opens that node's
 *  full dossier (the same view reached by navigating the tree). Renders the
 *  node TITLE, never its id. Hidden entirely when the group is empty. */
function ChipGroup({
  title,
  chips,
  onNode,
}: {
  title: string;
  chips: NodeChip[];
  onNode: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const usable = chips.filter((c) => c.name);
  if (usable.length === 0) return null;
  const shown = expanded ? usable : usable.slice(0, PAGE_SIZE);
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
        {title}
        <span className="rounded-full bg-[var(--surface-3)] px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--text-subtle)]">
          {usable.length}
        </span>
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((c, i) => {
          const clickable = Boolean(c.node_id);
          return (
            <button
              key={c.node_id ?? `${c.name}-${i}`}
              type="button"
              disabled={!clickable}
              onClick={() => c.node_id && onNode(c.node_id)}
              title={c.summary || c.path || undefined}
              className="max-w-full truncate rounded-md border border-[var(--border-soft)] bg-[var(--surface-2)] px-2 py-1 font-mono text-xs text-[var(--text)] transition-colors enabled:hover:border-[var(--primary)] enabled:hover:text-[var(--primary)] disabled:cursor-default disabled:opacity-70"
            >
              {c.name}
            </button>
          );
        })}
      </div>
      <ShowMore
        total={usable.length}
        shown={shown.length}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />
    </div>
  );
}

function LanguageBars({ rows }: { rows: LanguageRow[] }) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.language ?? "?"} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-sm text-[var(--text)]">{r.language}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div
              className="h-full rounded-full bg-[var(--primary)]"
              style={{ width: `${Math.max(2, Math.min(100, r.percent ?? 0))}%` }}
            />
          </div>
          <span className="w-16 shrink-0 text-right text-xs tabular-nums text-[var(--text-muted)]">
            {r.files != null ? `${r.files} files` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function DerivedItems({ items, onNode }: { items: DerivedItem[]; onNode: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, PAGE_SIZE);
  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-y divide-[var(--border-soft)] overflow-hidden rounded-lg border border-[var(--border-soft)]">
        {shown.map((it, i) => {
          const clickable = Boolean(it.node_id);
          return (
            <li key={it.node_id ?? `${it.name}-${i}`}>
              <button
                type="button"
                disabled={!clickable}
                onClick={() => it.node_id && onNode(it.node_id)}
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors enabled:hover:bg-[var(--surface-2)] disabled:cursor-default"
              >
                <span className="flex w-full items-center gap-2">
                  <span className="truncate font-mono text-sm text-[var(--text)]">{it.name}</span>
                  {it.kind && (
                    <span className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--text-subtle)]">
                      {it.kind}
                    </span>
                  )}
                </span>
                {it.headline && (
                  <span className="text-xs text-[var(--text-muted)]">{it.headline}</span>
                )}
                {it.path && (
                  <span className="truncate text-[11px] text-[var(--text-subtle)]">{it.path}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <ShowMore
        total={items.length}
        shown={shown.length}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />
    </div>
  );
}
