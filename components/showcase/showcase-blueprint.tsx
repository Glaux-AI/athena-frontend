"use client";

/** The combined repo blueprint as ONE cohesive document: a lead summary, a
 *  jump nav, then every non-empty section flowed top-to-bottom. Not the app's
 *  fragmented per-section cards - a single structured page. */

import type { ShowcaseSection } from "@/lib/api/public-client";

import { ShowcaseSectionBlock } from "./showcase-section";

/** Surface the synthesized `architecture` section right after `overview`.
 *  It's appended last in the BE catalogue (to keep existing seeded orderings
 *  stable on re-sync), so reorder client-side for prominence - mirrors the
 *  authenticated `repo-blueprint-sections.tsx`. Stable for every other
 *  section. */
function orderSections(secs: ShowcaseSection[]): ShowcaseSection[] {
  const arch = secs.find((s) => s.section_key === "architecture");
  if (!arch) return secs;
  const rest = secs.filter((s) => s.section_key !== "architecture");
  const afterIdx = rest.findIndex((s) => s.section_key === "overview");
  if (afterIdx < 0) return [arch, ...rest];
  return [...rest.slice(0, afterIdx + 1), arch, ...rest.slice(afterIdx + 1)];
}

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

  const ordered = orderSections(sections);

  return (
    <article className="flex flex-col gap-8">
      {summary && (
        <p className="text-balance text-base leading-relaxed text-[var(--text-muted)]">{summary}</p>
      )}
      {ordered.length > 1 && (
        <nav aria-label="Sections" className="flex flex-wrap gap-2 border-y border-[var(--border-soft)] py-3">
          {ordered.map((s) => (
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
        {ordered.map((s) => (
          <ShowcaseSectionBlock key={s.section_key} section={s} onNode={onNode} />
        ))}
      </div>
    </article>
  );
}
