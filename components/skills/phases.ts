/**
 * The canonical skill-phase taxonomy - the real stage ROLES a skill can be
 * scoped to (mirrors the BE ``StageAction`` / ``athena/api/_skill_phases.py``).
 * A skill with no phases is active in every stage; otherwise the running
 * stage's role must be listed. Shared by the skill form, the skill detail
 * page, and the domain config so the three never drift.
 */
export const SKILL_PHASES = [
  { value: "research", label: "Research" },
  { value: "draft_prd", label: "Draft PRD" },
  { value: "plan", label: "Plan" },
  { value: "execute", label: "Execute" },
  { value: "review", label: "Review" },
  { value: "design", label: "Design" },
  { value: "doc_improve", label: "Doc improve" },
] as const;

export type SkillPhase = (typeof SKILL_PHASES)[number]["value"];

export const SKILL_PHASE_VALUES: readonly string[] = SKILL_PHASES.map(
  (p) => p.value,
);

/** Friendly label for a stored phase value, falling back to the raw value
 *  (so a legacy tag that escaped normalization still renders readably). */
export function skillPhaseLabel(value: string): string {
  return SKILL_PHASES.find((p) => p.value === value)?.label ?? value;
}
