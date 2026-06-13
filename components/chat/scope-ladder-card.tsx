"use client";

/**
 * ScopeLadderCard - renders a `clarify_scope` envelope inside a chat thread.
 *
 * For a broad, open-ended ask ("explain X", "overview of Y", "how does Z
 * work"), the chat sub-agent calls `clarify_scope` to offer three answer-
 * *depth* tiers instead of guessing how deep to go (per the chat prompt's
 * scope-ladder rung, ADR-056 §11.5). The backend surfaces the envelope on the
 * assistant message's `payload` (`payload.type === "scope_ladder"`); picking a
 * tier sends a depth instruction as the next user message, and the agent
 * answers the topic at that depth.
 *
 * Distinct from `ClarificationCard` (`ask_clarification`, which disambiguates):
 * this is about how *much* to answer, not *which* interpretation. Rendered in
 * the indigo `--primary` family so the two cards read as different intents -
 * deliberately NOT the soft-blue `--info` the clarification card owns.
 *
 * WCAG 2.1 AA: a labelled `<section>` (`role="region"`); each tier is a real
 * `<button>` (keyboard reachable + screen-reader visible). When `disabled`
 * (a later message already exists), the buttons are inert but still legible.
 */

import { Layers } from "lucide-react";

import type { ScopeLadderPayload } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";

/** Compose the next user turn from a picked tier - a natural, unambiguous
 *  instruction the agent answers at the chosen depth (it appears as a user
 *  bubble, so it reads as a sentence, not a token). */
function tierReply(label: string, topic: string): string {
  return `Give me the ${label.toLowerCase()} for: ${topic}`;
}

export function ScopeLadderCard({
  scope,
  onPick,
  disabled = false,
}: {
  scope: ScopeLadderPayload;
  /** Send the picked tier's depth instruction as the next user message. */
  onPick: (value: string) => void;
  /** True once a later message exists - the depth is already chosen, so the
   *  tiers render inert (kept visible for conversation history). */
  disabled?: boolean;
}) {
  return (
    <Card
      role="region"
      aria-label="Answer-depth options"
      className="overflow-hidden border-l-2 border-l-[var(--primary)] border-[var(--primary)] bg-[var(--primary-soft)] shadow-[var(--shadow-1)]"
      data-testid="scope-ladder-card"
    >
      <Stack gap="3">
        <Cluster gap="2" align="center">
          <div className="flex size-7 items-center justify-center rounded-md bg-[var(--primary)] text-[var(--primary-fg)] shadow-[var(--shadow-1)]">
            <Layers className="size-4" aria-hidden="true" />
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--primary)]">
            How deep should I go?
          </span>
        </Cluster>

        <p className="text-sm leading-relaxed text-[var(--text)]">
          {scope.topic}
        </p>

        <Stack gap="2">
          {scope.tiers.map((tier) => (
            <Button
              key={tier.name}
              variant="outline"
              disabled={disabled}
              onClick={() => onPick(tierReply(tier.label, scope.topic))}
              data-testid="scope-ladder-tier"
              className="h-auto flex-col items-start gap-1 whitespace-normal py-2 text-left transition-[box-shadow,transform,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-2)]"
            >
              <Cluster gap="2" align="center" justify="between" className="w-full">
                <span className="font-medium">{tier.label}</span>
                <span className="shrink-0 text-[10px] text-[var(--text-subtle)]">
                  ~{tier.estimated_tokens.toLocaleString()} tokens
                </span>
              </Cluster>
              <span className="text-[11px] font-normal leading-snug text-[var(--text-muted)]">
                {tier.preview}
              </span>
            </Button>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}
