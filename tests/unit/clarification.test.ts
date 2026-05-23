/**
 * Tests for the clarification-input validation helper (F-04.14) and the
 * inline-annotation parser used by the doc renderer (F-04.11). Both are
 * pure-logic — no DOM, no fetch.
 */

import { describe, expect, it } from "vitest";

import { isAnswerValid } from "@/components/runs/clarifications/common";
import { parseAnnotation } from "@/components/docs/annotation-tooltip";
import type { RunClarification } from "@/lib/api/client";

function baseClarification(overrides: Partial<RunClarification>): RunClarification {
  return {
    id: "clr_test",
    qid: "q_test",
    run_id: "tsk_test",
    phase_key: "spec",
    question: "Test?",
    rationale: null,
    question_kind: "single_choice",
    priority: "blocker",
    origin: "agent",
    status: "pending",
    created_at: "2026-05-23T00:00:00Z",
    expires_at: null,
    resolved_at: null,
    batch_id: null,
    defer_count: 0,
    scope_doc_id: null,
    scope_section_anchor: null,
    options: [],
    reference_picker: null,
    numeric_constraints: null,
    free_text_constraints: null,
    free_text_allowed: false,
    on_expire: null,
    metadata: null,
    answer: null,
    answered_by_user_id: null,
    answered_at: null,
    ...overrides,
  };
}

describe("isAnswerValid — single_choice", () => {
  const q = baseClarification({
    question_kind: "single_choice",
    options: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ],
  });

  it("rejects empty answers", () => {
    expect(isAnswerValid(q, null)).toBe(false);
    expect(isAnswerValid(q, {})).toBe(false);
  });

  it("accepts a valid choice_id", () => {
    expect(isAnswerValid(q, { choice_id: "a" })).toBe(true);
  });
});

describe("isAnswerValid — multi_choice", () => {
  const q = baseClarification({
    question_kind: "multi_choice",
    options: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
      { id: "c", label: "C", is_optional: true },
    ],
  });

  it("rejects empty selection when required options exist", () => {
    expect(isAnswerValid(q, { choice_ids: [] })).toBe(false);
  });

  it("accepts a non-empty selection of valid ids", () => {
    expect(isAnswerValid(q, { choice_ids: ["a", "c"] })).toBe(true);
  });

  it("rejects ids that aren't in the option set", () => {
    expect(isAnswerValid(q, { choice_ids: ["a", "ghost"] })).toBe(false);
  });
});

describe("isAnswerValid — boolean and confirm", () => {
  it("requires a boolean", () => {
    const q = baseClarification({ question_kind: "boolean" });
    expect(isAnswerValid(q, { boolean: false })).toBe(true);
    expect(isAnswerValid(q, { boolean: true })).toBe(true);
    expect(isAnswerValid(q, {})).toBe(false);
  });

  it("requires confirmed=true for confirm questions", () => {
    const q = baseClarification({ question_kind: "confirm" });
    expect(isAnswerValid(q, { confirmed: true })).toBe(true);
    expect(isAnswerValid(q, { confirmed: false })).toBe(false);
  });
});

describe("isAnswerValid — free_text constraints", () => {
  const q = baseClarification({
    question_kind: "free_text",
    free_text_constraints: { min_length: 5, max_length: 20 },
  });

  it("rejects strings shorter than min_length", () => {
    expect(isAnswerValid(q, { free_text: "hi" })).toBe(false);
  });

  it("rejects strings longer than max_length", () => {
    expect(isAnswerValid(q, { free_text: "x".repeat(25) })).toBe(false);
  });

  it("accepts strings within range (trimmed)", () => {
    expect(isAnswerValid(q, { free_text: "  hello  " })).toBe(true);
  });
});

describe("isAnswerValid — numeric constraints", () => {
  const q = baseClarification({
    question_kind: "numeric",
    numeric_constraints: { min: 0, max: 100 },
  });

  it("rejects values outside the range", () => {
    expect(isAnswerValid(q, { numeric: -1 })).toBe(false);
    expect(isAnswerValid(q, { numeric: 101 })).toBe(false);
  });

  it("accepts values inside the range", () => {
    expect(isAnswerValid(q, { numeric: 0 })).toBe(true);
    expect(isAnswerValid(q, { numeric: 100 })).toBe(true);
    expect(isAnswerValid(q, { numeric: 42 })).toBe(true);
  });
});

describe("isAnswerValid — single_choice_with_free_text", () => {
  const q = baseClarification({
    question_kind: "single_choice_with_free_text",
    options: [
      { id: "a", label: "A" },
      { id: "other", label: "Other", requires_free_text: true },
    ],
    free_text_constraints: { min_length: 5 },
  });

  it("accepts non-other options without free text", () => {
    expect(isAnswerValid(q, { choice_id: "a" })).toBe(true);
  });

  it("requires free_text when the 'other' option is selected", () => {
    expect(isAnswerValid(q, { choice_id: "other" })).toBe(false);
    expect(isAnswerValid(q, { choice_id: "other", free_text: "" })).toBe(false);
    expect(isAnswerValid(q, { choice_id: "other", free_text: "hello world" })).toBe(true);
  });
});

describe("isAnswerValid — reference_pick min/max", () => {
  const q = baseClarification({
    question_kind: "reference_pick",
    reference_picker: {
      entity_kind: "file",
      multi: true,
      min_selected: 1,
      max_selected: 2,
    },
  });

  it("rejects empty selection", () => {
    expect(isAnswerValid(q, { references: [] })).toBe(false);
  });

  it("rejects selections over max_selected", () => {
    expect(isAnswerValid(q, { references: ["a", "b", "c"] })).toBe(false);
  });

  it("accepts selections within range", () => {
    expect(isAnswerValid(q, { references: ["a"] })).toBe(true);
    expect(isAnswerValid(q, { references: ["a", "b"] })).toBe(true);
  });
});

describe("parseAnnotation", () => {
  it("parses unverified_reference with sub_kind + quoted id", () => {
    const parsed = parseAnnotation("unverified_reference", "function 'charge_ach'");
    expect(parsed.kind).toBe("unverified_reference");
    expect(parsed.sub_kind).toBe("function");
    expect(parsed.identifier).toBe("charge_ach");
  });

  it("falls back to identifier-only on unparseable unverified", () => {
    const parsed = parseAnnotation("unverified_reference", "bareToken");
    expect(parsed.sub_kind).toBeUndefined();
    expect(parsed.identifier).toBe("bareToken");
  });

  it("keeps verified_existing as path:line", () => {
    const parsed = parseAnnotation("verified_existing", "billing-svc/src/states/index.ts:42");
    expect(parsed.identifier).toBe("billing-svc/src/states/index.ts:42");
  });

  it("keeps new_utility as the bare name", () => {
    const parsed = parseAnnotation("new_utility", "validateAchRoutingNumber");
    expect(parsed.identifier).toBe("validateAchRoutingNumber");
  });
});
