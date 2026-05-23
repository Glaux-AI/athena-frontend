"use client";

/**
 * BriefToc — left sidebar Table of Contents for a Brief.
 *
 * Per knowledge-model.md §5.9 (F-04.1):
 *   - Sections grouped by category (Overview / Rules / Architecture / Activity).
 *   - Each row shows: title, origin badge (D/S/A), lock icon if locked,
 *     and a pulsing dot if a pending proposal exists on the section.
 *   - The category grouping is local to this component — derived from the
 *     `section_key` (Brief sections themselves don't carry a category).
 */

import { Lock } from "lucide-react";

import { Stack } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";
import type { BriefSectionSummary, BriefSectionOrigin } from "@/lib/api/client";

/** Category buckets used to group sections in the sidebar. Order matters —
 * matches how Brief readers (humans and agents) tend to scan the doc. */
const CATEGORIES = ["Overview", "Rules", "Architecture", "Activity"] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_FOR_SECTION: Record<string, Category> = {
  // Overview
  overview: "Overview",
  domain_glossary: "Overview",
  glossary: "Overview",
  standards: "Overview",
  // Rules
  guardrails: "Rules",
  conventions: "Rules",
  security_policies: "Rules",
  open_questions: "Rules",
  // Architecture
  services: "Architecture",
  stack: "Architecture",
  api_surface: "Architecture",
  data_models: "Architecture",
  entry_points: "Architecture",
  hot_files: "Architecture",
  tests_and_ci: "Architecture",
  build_and_run: "Architecture",
  deployment_surface: "Architecture",
  external_deps: "Architecture",
  local_idioms: "Architecture",
  cross_repo_workflows: "Architecture",
  decisions: "Architecture",
  // Activity
  recent_activity: "Activity",
};

const ORIGIN_BADGE: Record<BriefSectionOrigin, { label: string; tone: string; title: string }> = {
  derived:      { label: "D", tone: "bg-[var(--surface-2)] text-[var(--text-subtle)]",       title: "Derived — facts pulled from the knowledge graph. Not user-editable." },
  synthesized:  { label: "S", tone: "bg-[var(--info-soft)]  text-[var(--info)]",            title: "Synthesized — AI-generated summary; user can edit, AI updates go through approval." },
  authored:     { label: "A", tone: "bg-[var(--primary-soft)] text-[var(--primary)]",       title: "Authored — user-owned. AI never proposes silent changes." },
};

export interface BriefTocProps {
  sections: BriefSectionSummary[];
  activeSectionKey: string | null;
  onSelect: (key: string) => void;
}

export function BriefToc({ sections, activeSectionKey, onSelect }: BriefTocProps) {
  // Group sections by category, preserving the original `ordering` inside
  // each group. Sections whose key isn't in our map fall under "Architecture".
  const grouped: Record<Category, BriefSectionSummary[]> = {
    Overview: [],
    Rules: [],
    Architecture: [],
    Activity: [],
  };
  for (const s of [...sections].sort((a, b) => a.ordering - b.ordering)) {
    const cat = CATEGORY_FOR_SECTION[s.section_key] ?? "Architecture";
    grouped[cat].push(s);
  }

  return (
    <nav aria-label="Brief table of contents" className="p-3">
      <Stack gap="4">
        {CATEGORIES.filter((c) => grouped[c].length > 0).map((cat) => (
          <Stack key={cat} gap="1">
            <h3 className="px-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              {cat}
            </h3>
            <ul className="flex flex-col gap-0.5">
              {grouped[cat].map((s) => (
                <BriefTocRow
                  key={s.section_key}
                  section={s}
                  active={s.section_key === activeSectionKey}
                  onSelect={onSelect}
                />
              ))}
            </ul>
          </Stack>
        ))}
      </Stack>
    </nav>
  );
}

function BriefTocRow({
  section,
  active,
  onSelect,
}: {
  section: BriefSectionSummary;
  active: boolean;
  onSelect: (key: string) => void;
}) {
  const origin = ORIGIN_BADGE[section.origin];
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(section.section_key)}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          active
            ? "bg-[var(--primary-soft)] text-[var(--primary)]"
            : "text-[var(--text)] hover:bg-[var(--surface-2)]",
        )}
      >
        <span
          aria-hidden
          title={origin.title}
          className={cn(
            "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded text-[10px] font-bold",
            origin.tone,
          )}
        >
          {origin.label}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{section.title}</span>
          <span className="block truncate text-[11px] text-[var(--text-subtle)]">
            {section.summary}
          </span>
        </span>
        <span className="mt-0.5 flex shrink-0 items-center gap-1">
          {section.locked && (
            <Lock
              className="size-3 text-[var(--text-subtle)]"
              aria-label="Locked — AI cannot propose changes."
            />
          )}
          {section.has_pending_proposal && (
            <span
              aria-label="Pending proposal awaiting review"
              title="1 update awaiting review"
              className="size-1.5 rounded-full bg-[var(--warning)]"
            />
          )}
        </span>
      </button>
    </li>
  );
}
