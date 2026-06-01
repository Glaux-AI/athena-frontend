"use client";

/**
 * SectionFeedbackList — renders one `<SectionFeedback>` control per
 * BE-declared document section.
 *
 * The per-phase document renderers show the document body exactly once (via
 * `<DocMarkdown>`); the BE gives us section anchors (ids + labels) but no
 * content-by-anchor map, so we cannot slice the body per section. This
 * component surfaces every section's 👍/👎 anchor in a compact footer
 * *without* re-rendering the body — fixing the earlier bug where the whole
 * doc was repeated once per section.
 *
 * The section label is shown only when there is more than one section (a
 * lone control needs no heading). Optional `noun` lets a phase relabel a
 * single anchor's a11y context if needed; defaults to the section label.
 */

import { Stack, Cluster } from "@/components/layout/primitives";

import { SectionFeedback } from "./section-feedback";

export function SectionFeedbackList({
  runId,
  artifactId,
  sections,
}: {
  runId: string;
  /** Document id the sections belong to (BE `artifact_id`). */
  artifactId: string;
  /** BE-declared section anchors. */
  sections: { id: string; label: string }[];
}) {
  const multi = sections.length > 1;
  return (
    <Stack gap="2" className="border-t border-[var(--border)] pt-3">
      {sections.map((s) => (
        <Cluster key={s.id} justify="between" align="center" className="flex-wrap gap-2">
          {multi ? (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              {s.label}
            </span>
          ) : (
            <span />
          )}
          <SectionFeedback runId={runId} sectionId={s.id} artifactId={artifactId} />
        </Cluster>
      ))}
    </Stack>
  );
}
