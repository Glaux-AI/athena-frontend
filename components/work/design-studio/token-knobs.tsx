"use client";

/**
 * Tier-1 direct manipulation: token-valued knobs for the picked element. Every
 * control offers ONLY the ORG's own design tokens (passed in as grouped, derived
 * from their ingested code), so a user cannot produce an off-brand value by
 * construction - and Athena's own palette is never imposed. Each change mutates
 * the prototype instantly with NO LLM call; the chosen token name rides along as
 * `data-athena-token-*` provenance on the element.
 */

import { Eye, EyeOff } from "lucide-react";

import { Stack } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";
import type { GroupedTokens, RampStop } from "@/lib/design/tokens";
import type { DesignToken } from "@/lib/api/client";

import type { PickedNode } from "./editor-bridge";

export function TokenKnobs({
  picked,
  grouped,
  onApply,
}: {
  picked: PickedNode;
  grouped: GroupedTokens;
  onApply: (prop: string, value: string, token: string | null) => void;
}) {
  return (
    <Stack gap="3" className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
      {grouped.usingStarterColors && (
        <p className="text-[11px] text-[var(--text-muted)]">
          No design tokens found in your code yet - showing a neutral starter. Connect a repo with a
          design system, or add your own.
        </p>
      )}
      <SwatchRow
        label="Text color"
        tokens={grouped.colors}
        current={picked.styles.color}
        onPick={(t) => onApply("color", t.value, t.name)}
      />
      <SwatchRow
        label="Background"
        tokens={grouped.colors}
        current={picked.styles.background}
        onPick={(t) => onApply("background-color", t.value, t.name)}
      />
      <Segmented label="Text size" stops={grouped.typeStops} onPick={(s) => onApply("font-size", s.value, null)} />
      <Segmented label="Padding" stops={grouped.spaceStops} onPick={(s) => onApply("padding", s.value, null)} />
      <Segmented label="Radius" stops={grouped.radiusStops} onPick={(s) => onApply("border-radius", s.value, null)} />
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-subtle)]">
          Visibility
        </span>
        <button
          type="button"
          onClick={() => onApply("display", picked.styles.hidden ? "" : "none", null)}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          {picked.styles.hidden ? (
            <>
              <Eye className="size-3.5" aria-hidden />
              Show
            </>
          ) : (
            <>
              <EyeOff className="size-3.5" aria-hidden />
              Hide
            </>
          )}
        </button>
      </div>
    </Stack>
  );
}

function SwatchRow({
  label,
  tokens,
  current,
  onPick,
}: {
  label: string;
  tokens: DesignToken[];
  current: string;
  onPick: (t: DesignToken) => void;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[var(--text-subtle)]">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {tokens.map((t) => {
          const active = t.value.trim() === current.trim();
          return (
            <button
              key={`${label}-${t.name}-${t.value}`}
              type="button"
              title={`${t.name} (${t.value})`}
              aria-label={`${label}: ${t.name}`}
              aria-pressed={active}
              onClick={() => onPick(t)}
              // The swatch SAMPLE renders the token's concrete value via a CSS
              // var (data sample, not app theming).
              style={{ ["--swatch" as string]: t.value }}
              className={cn(
                "size-6 rounded-full border transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                "bg-[var(--swatch)]",
                active ? "border-[var(--text)] ring-2 ring-[var(--ring)]" : "border-[var(--border-strong)]",
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

function Segmented({
  label,
  stops,
  onPick,
}: {
  label: string;
  stops: RampStop[];
  onPick: (s: RampStop) => void;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[var(--text-subtle)]">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {stops.map((s) => (
          <button
            key={`${label}-${s.label}-${s.value}`}
            type="button"
            title={s.value}
            onClick={() => onPick(s)}
            className={cn(
              "rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
