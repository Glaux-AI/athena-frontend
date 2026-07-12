"use client";

/**
 * ClarificationCard - renders an `ask_clarification` envelope inside a chat
 * thread.
 *
 * The chat sub-agent calls `ask_clarification` to ask ONE question instead of
 * fanning out exploratory tool calls across every interpretation (per the chat
 * prompt's "ask before a long fan-out" rung). The backend surfaces the envelope
 * on the assistant message's `payload` (`payload.type === "clarification"`);
 * picking an option sends its `value` as the next user message, and the agent
 * answers with the ambiguity resolved. `options` may be EMPTY - an open
 * question the user answers in the composer (the one flexible ask, 2026-07-12;
 * the canned `clarify_scope` depth ladder is gone).
 *
 * Soft-blue (`--info`) - a calm "quick question", deliberately NOT the amber
 * `--warning` (which stays reserved for real warnings like phase restarts).
 *
 * WCAG 2.1 AA: a labelled `<section>` (`role="region"`); options are real
 * `<button>`s (keyboard reachable + screen-reader visible). When `disabled`
 * (a later message already exists), the buttons are inert but still legible.
 */

import { HelpCircle } from "lucide-react";

import type { ClarificationPayload } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Stack, Cluster } from "@/components/layout/primitives";

export function ClarificationCard({
  clarification,
  onPick,
  disabled = false,
}: {
  clarification: ClarificationPayload;
  /** Send the picked option's `value` as the next user message. */
  onPick: (value: string) => void;
  /** True once a later message exists - the question is already answered, so
   *  the options render inert (kept visible for conversation history). */
  disabled?: boolean;
}) {
  return (
    <Card
      role="region"
      aria-label="Clarifying question"
      className="overflow-hidden border-l-2 border-l-[var(--info)] border-[var(--info)] bg-[var(--info-soft)] shadow-[var(--shadow-1)]"
      data-testid="clarification-card"
    >
      <Stack gap="3">
        <Cluster gap="2" align="center">
          <div className="flex size-7 items-center justify-center rounded-md bg-[var(--info)] text-[var(--info-fg)] shadow-[var(--shadow-1)]">
            <HelpCircle className="size-4" aria-hidden="true" />
          </div>
          <Eyebrow className="text-[var(--info-ink)]">Athena asks</Eyebrow>
        </Cluster>

        <p className="text-sm leading-relaxed text-[var(--text)]">
          {clarification.question}
        </p>

        {clarification.options.length > 0 ? (
          <Cluster gap="2" align="center" className="flex-wrap">
            {clarification.options.map((opt) => (
              <Button
                key={opt.value}
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => onPick(opt.value)}
                data-testid="clarification-option"
              >
                {opt.label}
              </Button>
            ))}
          </Cluster>
        ) : (
          !disabled && (
            <p className="text-micro text-[var(--text-subtle)]" data-testid="clarification-open-hint">
              Reply below to continue.
            </p>
          )
        )}
      </Stack>
    </Card>
  );
}
