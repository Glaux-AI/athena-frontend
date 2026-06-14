/**
 * Pure helpers for the consequence-explicit stage gates (no React).
 *
 * Extracted from the old `StageActions` component so the new `StageComposer`
 * and the inbox/large-change surfaces can share them, and the unit tests can
 * import them without mounting a component.
 *
 *   - `subtaskPlanItemCount` - validate + count a decompose `subtask_plan` body
 *     (the approve gate materializes it into real tasks; the count drives the
 *     "Approve - create N tasks" CTA, and a malformed body blocks a manual edit).
 *   - `newRepoFromDiffBody` - a diff_set whose approval CREATES a repository
 *     starts with the backend's banner line; extract `owner/name` so the gate
 *     copy + approve CTA go consequence-explicit.
 */

/** Inline validation message for a hand-edited decompose plan. */
export const SUBTASK_PLAN_EDIT_ERROR =
  "The plan must be JSON with an items array - each item needs a title.";

/** Parse a `subtask_plan` body - `{ items: [...] }` where every item is an
 *  object with a non-empty `title` string (the shape `SubtaskPlanView` renders
 *  and the approve gate materializes). Returns the number of tasks approval
 *  would create, or null when the body is not a valid plan (the approve CTA
 *  falls back to countless copy; the manual editor shows
 *  `SUBTASK_PLAN_EDIT_ERROR` instead of submitting). */
export function subtaskPlanItemCount(body: string): number | null {
  try {
    const items = (JSON.parse(body) as { items?: unknown } | null)?.items;
    if (!Array.isArray(items) || items.length === 0) return null;
    const valid = items.every(
      (it: unknown) =>
        typeof it === "object" &&
        it !== null &&
        typeof (it as { title?: unknown }).title === "string" &&
        (it as { title: string }).title.trim().length > 0,
    );
    return valid ? items.length : null;
  } catch {
    return null;
  }
}

/** A diff_set whose approval CREATES a repository starts with the backend's
 *  banner line (`new_repo_banner` - BE↔FE contract): extract the `owner/name`
 *  so the gate card + approve CTA go consequence-explicit. Returns null for a
 *  plain diff. */
export function newRepoFromDiffBody(body: string): string | null {
  const m =
    /^Approving this gate CREATES the (?:private|PUBLIC) repository (\S+)/.exec(
      body,
    );
  return m?.[1] ?? null;
}
