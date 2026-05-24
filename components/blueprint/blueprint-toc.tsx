"use client";

/**
 * BlueprintToc — left sidebar Table of Contents for a Blueprint.
 *
 * Per knowledge-model.md §5.9 (F-04.1):
 *   - Sections grouped by category (Overview / Rules / Architecture / Activity).
 *   - Each row shows: title, origin badge (D/S/A), lock icon if locked,
 *     and a pulsing dot if a pending proposal exists on the section.
 *   - The category grouping is local to this component — derived from the
 *     `section_key` (Blueprint sections themselves don't carry a category).
 */

import { Lock } from "lucide-react";

import { Stack } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";
import type { BlueprintSectionSummary, BlueprintSectionOrigin } from "@/lib/api/client";

/** Category buckets used to group sections in the sidebar. Order matters —
 * matches how Blueprint readers (humans and agents) tend to scan the doc. */
const CATEGORIES = ["Overview", "Rules", "Architecture", "Ops", "Activity"] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_FOR_SECTION: Record<string, Category> = {
  // Overview — at-a-glance orientation
  overview: "Overview",
  domain_glossary: "Overview",
  glossary: "Overview",
  standards: "Overview",
  mission: "Overview",
  maturity: "Overview",
  external_references: "Overview",
  ownership: "Overview",
  // Rules — what to do / what not to do
  guardrails: "Rules",
  conventions: "Rules",
  security_policies: "Rules",
  principles: "Rules",
  open_questions: "Rules",
  // Architecture — structural reference
  services: "Architecture",
  stack: "Architecture",
  api_surface: "Architecture",
  data_models: "Architecture",
  entry_points: "Architecture",
  hot_files: "Architecture",
  build_and_run: "Architecture",
  deployment_surface: "Architecture",
  external_deps: "Architecture",
  local_idioms: "Architecture",
  cross_repo_workflows: "Architecture",
  decisions: "Architecture",
  // Ops — running it day-to-day
  runbook: "Ops",
  observability: "Ops",
  secrets_handling: "Ops",
  environments: "Ops",
  compliance: "Ops",
  tests_and_ci: "Ops",
  success_metrics: "Ops",
  risks: "Ops",
  // Activity — what's happened
  recent_activity: "Activity",
  incident_history: "Activity",
  change_log: "Activity",
};

const ORIGIN_BADGE: Record<BlueprintSectionOrigin, { label: string; tone: string; title: string }> = {
  derived:     { label: "A", tone: "bg-[var(--surface-2)] text-[var(--text-subtle)]", title: "Auto (derived) — facts pulled from code / configs by ingestion. Not user-editable; change the source to update." },
  synthesized: { label: "D", tone: "bg-[var(--info-soft)]  text-[var(--info)]",       title: "Draft (synthesized) — LLM-generated narrative over derived facts + resources. Editable; AI updates route through the approval queue." },
  authored:    { label: "H", tone: "bg-[var(--primary-soft)] text-[var(--primary)]",  title: "Human-authored — user-owned. AI may suggest updates via the proposal queue, never auto-applied." },
};

export interface BlueprintTocProps {
  sections: BlueprintSectionSummary[];
  activeSectionKey: string | null;
  onSelect: (key: string) => void;
}

export function BlueprintToc({ sections, activeSectionKey, onSelect }: BlueprintTocProps) {
  // Group sections by category, preserving the original `ordering` inside
  // each group. Sections whose key isn't in our map fall under "Architecture".
  const grouped: Record<Category, BlueprintSectionSummary[]> = {
    Overview: [],
    Rules: [],
    Architecture: [],
    Ops: [],
    Activity: [],
  };
  for (const s of [...sections].sort((a, b) => a.ordering - b.ordering)) {
    const cat = CATEGORY_FOR_SECTION[s.section_key] ?? "Architecture";
    grouped[cat].push(s);
  }

  return (
    <nav aria-label="Blueprint table of contents" className="p-3">
      <Stack gap="4">
        {CATEGORIES.filter((c) => grouped[c].length > 0).map((cat) => (
          <Stack key={cat} gap="1">
            <h3 className="px-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              {cat}
            </h3>
            <ul className="flex flex-col gap-0.5">
              {grouped[cat].map((s) => (
                <BlueprintTocRow
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

function BlueprintTocRow({
  section,
  active,
  onSelect,
}: {
  section: BlueprintSectionSummary;
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
