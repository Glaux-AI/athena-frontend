/**
 * Shared types + helpers for the per-question-kind clarification input
 * components. Implements the prop-shape contract used by all eight inputs:
 * `{ clarification, onSubmit, onSkip, onDefer, disabled? }`.
 *
 * Each input is a pure render + minimal local state — the caller owns
 * submit / skip / defer wiring. Inputs return their typed answer to
 * `onSubmit`; validation is duplicated here for client-side immediacy and
 * enforced server-side per phase-03 Task 03.4.
 *
 * Per the 2026-05-24 design pass, rich `RunClarification` rows are folded
 * into the existing per-phase "Clarifying questions" widget — there is no
 * dedicated modal or page-blocker. `renderClarificationInput` below is the
 * dispatcher that maps `question_kind` → input component for that widget.
 */

import type {
  ClarificationAnswer,
  RunClarification,
} from "@/lib/api/client";

import { SingleChoiceInput } from "./single-choice-input";
import { MultiChoiceInput } from "./multi-choice-input";
import { BooleanInput } from "./boolean-input";
import { ConfirmInput } from "./confirm-input";
import { ChoiceWithFreeTextInput } from "./choice-with-free-text-input";
import { FreeTextInput } from "./free-text-input";
import { NumericInput } from "./numeric-input";
import { ReferencePickInput } from "./reference-pick-input";

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

/** Render the right input for a clarification's `question_kind`. */
export function renderClarificationInput(props: ClarificationInputProps): JSX.Element | null {
  switch (props.clarification.question_kind) {
    case "single_choice":               return <SingleChoiceInput {...props} />;
    case "multi_choice":                return <MultiChoiceInput {...props} />;
    case "boolean":                     return <BooleanInput {...props} />;
    case "confirm":                     return <ConfirmInput {...props} />;
    case "single_choice_with_free_text":return <ChoiceWithFreeTextInput {...props} />;
    case "free_text":                   return <FreeTextInput {...props} />;
    case "numeric":                     return <NumericInput {...props} />;
    case "reference_pick":              return <ReferencePickInput {...props} />;
    default:                            return null;
  }
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
