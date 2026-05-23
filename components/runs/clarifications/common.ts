/**
 * Shared types + helpers for the per-question-kind clarification input
 * components. Implements the prop-shape contract used by all eight inputs
 * (F-04.14): `{ clarification, onSubmit, onSkip, onDefer, disabled? }`.
 *
 * Each input is a pure render + minimal local state — the caller (card or
 * modal) owns submit / skip / defer wiring. Inputs return their typed answer
 * to `onSubmit`; validation is duplicated here for client-side immediacy and
 * enforced server-side per phase-03 Task 03.4.
 */

import type {
  ClarificationAnswer,
  RunClarification,
} from "@/lib/api/client";

export interface ClarificationInputProps {
  clarification: RunClarification;
  /** Submit the typed answer. Caller routes to `api.runs.clarifications.submit`. */
  onSubmit: (answer: ClarificationAnswer) => Promise<void> | void;
  /** Skip — only enabled when `priority === "optional"`. */
  onSkip?: () => Promise<void> | void;
  /** Defer — caller hides this when `defer_count >= 3` or priority `optional`. */
  onDefer?: () => Promise<void> | void;
  /** When true, the input is read-only (e.g. another batch member is being
   * submitted at the same time). */
  disabled?: boolean;
  /** Set true when this clarification is being submitted as part of a batch —
   * the input renders inline without its own Submit button; the parent
   * collects the answer via `onAnswerChange` instead. */
  batchMode?: boolean;
  /** Live update for the parent in batch mode. The parent disables its
   * Submit until every required input emits a valid answer. */
  onAnswerChange?: (answer: ClarificationAnswer | null) => void;
}

/** Returns true when the answer satisfies the question's required fields per
 * `question_kind`. Mirrors the validation rules in Task 03.4. */
export function isAnswerValid(
  clarification: RunClarification,
  answer: ClarificationAnswer | null,
): boolean {
  if (!answer) return false;
  switch (clarification.question_kind) {
    case "single_choice":
      return Boolean(answer.choice_id);
    case "multi_choice": {
      const ids = answer.choice_ids ?? [];
      const min = clarification.options.filter((o) => !o.is_optional).length > 0 ? 1 : 0;
      return ids.length >= min && ids.every((id) => clarification.options.some((o) => o.id === id));
    }
    case "boolean":
      return typeof answer.boolean === "boolean";
    case "confirm":
      return answer.confirmed === true;
    case "single_choice_with_free_text": {
      if (!answer.choice_id) return false;
      const opt = clarification.options.find((o) => o.id === answer.choice_id);
      const requiresFree = (opt?.requires_free_text ?? answer.choice_id === "other") || clarification.free_text_allowed;
      if (requiresFree) {
        const text = (answer.free_text ?? "").trim();
        const min = clarification.free_text_constraints?.min_length ?? 1;
        return text.length >= min;
      }
      return true;
    }
    case "free_text": {
      const text = (answer.free_text ?? "").trim();
      const min = clarification.free_text_constraints?.min_length ?? 1;
      const max = clarification.free_text_constraints?.max_length;
      if (text.length < min) return false;
      if (max != null && text.length > max) return false;
      return true;
    }
    case "numeric": {
      if (typeof answer.numeric !== "number" || Number.isNaN(answer.numeric)) return false;
      const c = clarification.numeric_constraints;
      if (c?.min != null && answer.numeric < c.min) return false;
      if (c?.max != null && answer.numeric > c.max) return false;
      return true;
    }
    case "reference_pick": {
      const refs = answer.references ?? [];
      const picker = clarification.reference_picker;
      if (refs.length === 0) return false;
      if (picker) {
        if (refs.length < picker.min_selected) return false;
        if (refs.length > picker.max_selected) return false;
      }
      return true;
    }
  }
}
