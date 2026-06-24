"use client";

/** Renders one combined-blueprint section: prose (ChatMarkdown), a mermaid
 *  diagram, and/or a derived item table - whichever the section carries.
 *  Empty sections never reach here (the backend filters them out). */

import { ChatMarkdown } from "@/components/chat/chat-markdown";
import { MermaidDiagram } from "@/components/ui/mermaid-diagram";
import type { ShowcaseSection } from "@/lib/api/public-client";

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

  return (
    <section id={section.section_key} className="scroll-mt-24">
      <h2 className="text-xl font-semibold tracking-tight text-[var(--text)]">{section.title}</h2>
      {section.summary && (
        <p className="mt-1 text-sm text-[var(--text-muted)]">{section.summary}</p>
      )}
      <div className="mt-4 flex flex-col gap-4">
        {section.body_markdown && (
          <ChatMarkdown content={section.body_markdown} className="max-w-none" />
        )}
        {mermaid && (
          <MermaidDiagram
            chart={mermaid}
            ariaLabel={`${section.title} diagram`}
            nodeMap={(body.mermaid_nodes as Record<string, string> | undefined) ?? null}
            onNodeSelect={onNode}
          />
        )}
        {languages.length > 0 && <LanguageBars rows={languages} />}
        {items.length > 0 && <DerivedItems items={items} onNode={onNode} />}
      </div>
    </section>
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
  return (
    <ul className="divide-y divide-[var(--border-soft)] overflow-hidden rounded-lg border border-[var(--border-soft)]">
      {items.map((it, i) => {
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
  );
}
