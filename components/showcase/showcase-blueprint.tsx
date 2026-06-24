"use client";

/** The combined repo blueprint as ONE cohesive document: a lead summary, a
 *  jump nav, then every non-empty section flowed top-to-bottom. Not the app's
 *  fragmented per-section cards - a single structured page. */

import type { ShowcaseSection } from "@/lib/api/public-client";

import { ShowcaseSectionBlock } from "./showcase-section";

export function ShowcaseBlueprint({
  summary,
  sections,
  onNode,
}: {
  summary: string | null;
  sections: ShowcaseSection[];
  onNode: (id: string) => void;
}) {
  if (sections.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--text-muted)]">
        Athena is still generating this repo&apos;s blueprint. Check back shortly.
      </div>
    );
  }

  return (
    <article className="flex flex-col gap-8">
      {summary && (
        <p className="text-balance text-base leading-relaxed text-[var(--text-muted)]">{summary}</p>
      )}
      {sections.length > 1 && (
        <nav aria-label="Sections" className="flex flex-wrap gap-2 border-y border-[var(--border-soft)] py-3">
          {sections.map((s) => (
            <a
              key={s.section_key}
              href={`#${s.section_key}`}
              className="rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
            >
              {s.title}
            </a>
          ))}
        </nav>
      )}
      <div className="flex flex-col gap-10">
        {sections.map((s) => (
          <ShowcaseSectionBlock key={s.section_key} section={s} onNode={onNode} />
        ))}
      </div>
    </article>
  );
}
