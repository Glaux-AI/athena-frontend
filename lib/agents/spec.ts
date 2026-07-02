/**
 * The guided agent-builder spec: the structured fields a non-technical member
 * fills in (purpose / goals / rules / tone / output format / examples) and the
 * pure compiler that turns them into the agent's `system_prompt`.
 *
 * The compiled prompt is what the runtime actually runs (the spec is stored
 * alongside purely so editing round-trips the structured form), so this
 * compiler is deliberately deterministic markdown - no AI, no locale, no date.
 */

import type { AgentSpec } from "@/lib/api/client";

export function emptyAgentSpec(mode: AgentSpec["mode"] = "guided"): AgentSpec {
  return {
    version: 1,
    mode,
    purpose: "",
    goals: [],
    rules: [],
    tone: "",
    output_format: "",
    examples: [],
  };
}

/** Lenient shape repair for spec payloads coming off the wire (older rows or
 *  hand-edited JSON): missing fields become empties, non-arrays become []. */
export function normalizeAgentSpec(value: Partial<AgentSpec> | null | undefined): AgentSpec | null {
  if (!value || typeof value !== "object") return null;
  const list = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x)).filter((x) => x.trim() !== "") : [];
  return {
    version: 1,
    mode: value.mode === "custom" ? "custom" : "guided",
    purpose: typeof value.purpose === "string" ? value.purpose : "",
    goals: list(value.goals),
    rules: list(value.rules),
    tone: typeof value.tone === "string" ? value.tone : "",
    output_format: typeof value.output_format === "string" ? value.output_format : "",
    examples: list(value.examples),
  };
}

function section(title: string, body: string): string {
  return `## ${title}\n${body}`;
}

function bulleted(items: string[]): string {
  return items
    .map((i) => i.trim())
    .filter(Boolean)
    .map((i) => `- ${i}`)
    .join("\n");
}

/** Compile the guided fields into the runtime system prompt. Empty fields are
 *  skipped so a minimal spec (purpose only) still yields a clean brief. */
export function compileAgentPrompt(spec: AgentSpec): string {
  const parts: string[] = [];
  if (spec.purpose.trim()) parts.push(spec.purpose.trim());
  const goals = bulleted(spec.goals);
  if (goals) parts.push(section("Goals", goals));
  const rules = bulleted(spec.rules);
  if (rules) parts.push(section("Rules", rules));
  if (spec.tone.trim()) parts.push(section("Tone & style", spec.tone.trim()));
  if (spec.output_format.trim()) {
    parts.push(section("Output format", spec.output_format.trim()));
  }
  const examples = bulleted(spec.examples);
  if (examples) parts.push(section("Examples", examples));
  return parts.join("\n\n");
}
