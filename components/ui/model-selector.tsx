"use client";

/**
 * <ModelSelector> - the per-action model picker.
 *
 * Mounts at the chat composer and every task AI-action. Under the
 * model-per-action design there is no agent→role→model lock: the user picks
 * the model for each AI action, and the agent runs on that choice. Lists the
 * org's enabled models (`api.models.enabled`) grouped by source - Athena-hosted
 * vs the org's own key ("Your key") - with a thinking / vision affordance per
 * model.
 *
 * Presentational: the parent fetches `models` and owns the `value`
 * (a `ModelSelection`), mirroring the repo's value/onChange picker convention
 * (see `cost/date-range-picker`). Radix Popover gives focus management +
 * Esc-to-close for free; styling follows the date-range-picker / model-chip
 * token patterns (no color literals).
 */

import { type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Brain, Check, ChevronDown, Eye, KeyRound, Sparkles, UserRound } from "lucide-react";

import { cn } from "@/lib/cn";
import type { EnabledModel, ModelSelection } from "@/lib/api/client";

export function ModelSelector({
  models,
  value,
  onChange,
  disabled,
  align = "start",
  className,
  includeSubscription = false,
  subscriptionGrounded = false,
}: {
  models: EnabledModel[];
  value: ModelSelection | null;
  onChange: (selection: ModelSelection) => void;
  disabled?: boolean;
  align?: "start" | "end";
  className?: string;
  /** Offer the user's personal subscription models (`source ===
   *  "subscription"`). Chat passes true; task surfaces keep the default
   *  false - subscription models are chat-only (no workspace tools), so
   *  they must never be pickable for an agentic action. */
  includeSubscription?: boolean;
  /** This deployment grounds subscription chat with Athena's KB tools
   *  via MCP (`me.features.subscription_mcp_bridge`) - flips the "Your
   *  plan" footnote from the chat-only caveat. */
  subscriptionGrounded?: boolean;
}) {
  // Match on the rung too - the same (provider, model) can be enabled both
  // Athena-hosted AND on the org's key, as two distinct rows. Selections
  // persisted before the rung split carry no `source`; first match wins then.
  const selected =
    value != null
      ? (models.find(
          (m) =>
            m.provider === value.provider &&
            m.id === value.model &&
            (value.source ? m.source === value.source : true),
        ) ?? null)
      : null;

  const athena = models.filter((m) => m.source === "athena" && m.enabled);
  const byok = models.filter((m) => m.source === "byok" && m.enabled);
  const subscription = includeSubscription
    ? models.filter((m) => m.source === "subscription" && m.enabled)
    : [];
  const groupCount =
    (athena.length > 0 ? 1 : 0) +
    (byok.length > 0 ? 1 : 0) +
    (subscription.length > 0 ? 1 : 0);
  const hasBoth = groupCount > 1;
  const empty = groupCount === 0;

  const pick = (m: EnabledModel) =>
    onChange({ provider: m.provider, model: m.id, source: m.source });

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={selected ? `Model: ${selected.display_name}` : "Select model"}
          className={cn(
            "group inline-flex h-8 max-w-[16rem] items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs font-medium text-[var(--text)]",
            "transition-colors duration-150 hover:bg-[var(--surface-2)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "data-[state=open]:bg-[var(--surface-2)]",
            className,
          )}
        >
          {selected ? (
            <>
              <SourceMark source={selected.source} />
              {selected.thinking && (
                <Brain className="size-3 shrink-0 text-[var(--primary)]" aria-hidden />
              )}
              <span className="truncate">{selected.display_name}</span>
            </>
          ) : (
            <span className="text-[var(--text-muted)]">Select model</span>
          )}
          <ChevronDown
            className="size-3.5 shrink-0 text-[var(--text-subtle)] transition-transform duration-150 group-data-[state=open]:rotate-180"
            aria-hidden
          />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={6}
          className={cn(
            "glass z-50 max-h-[60vh] w-[18rem] overflow-y-auto rounded-xl p-1.5 shadow-[var(--shadow-3)]",
            "animate-pop-in",
          )}
        >
          {empty ? (
            <p className="px-2.5 py-3 text-xs text-[var(--text-muted)]">
              No models enabled. Enable one in{" "}
              <span className="text-[var(--text)]">Settings → AI models</span>.
            </p>
          ) : (
            <div className="flex flex-col">
              {athena.length > 0 && (
                <Group {...(hasBoth ? { label: "Athena" } : {})}>
                  {athena.map((m) => (
                    <ModelRow
                      key={`${m.provider}/${m.id}`}
                      model={m}
                      active={selected === m}
                      onPick={() => pick(m)}
                    />
                  ))}
                </Group>
              )}
              {athena.length > 0 && byok.length > 0 && (
                <div className="my-1 h-px bg-[var(--border)]" />
              )}
              {byok.length > 0 && (
                <Group {...(hasBoth ? { label: "Your key" } : {})}>
                  {byok.map((m) => (
                    <ModelRow
                      key={`${m.provider}/${m.id}`}
                      model={m}
                      active={selected === m}
                      onPick={() => pick(m)}
                    />
                  ))}
                </Group>
              )}
              {subscription.length > 0 && (
                <>
                  {(athena.length > 0 || byok.length > 0) && (
                    <div className="my-1 h-px bg-[var(--border)]" />
                  )}
                  <Group {...(hasBoth ? { label: "Your plan" } : {})}>
                    {subscription.map((m) => (
                      <ModelRow
                        key={`${m.provider}/${m.id}`}
                        model={m}
                        active={selected === m}
                        onPick={() => pick(m)}
                      />
                    ))}
                    <p className="px-2.5 pb-1 pt-0.5 text-[10px] text-[var(--text-subtle)]">
                      {subscriptionGrounded
                        ? "Uses your subscription · grounded in your workspace via MCP"
                        : "Uses your subscription · chat only, no workspace tools"}
                    </p>
                  </Group>
                </>
              )}
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Group({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      {label && (
        <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
          {label}
        </p>
      )}
      {children}
    </div>
  );
}

function ModelRow({
  model,
  active,
  onPick,
}: {
  model: EnabledModel;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-current={active}
      className={cn(
        "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
        active
          ? "bg-[var(--primary-soft)] font-medium text-[var(--text)]"
          : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
      )}
    >
      <SourceMark source={model.source} />
      <span className="min-w-0 flex-1 truncate">{model.display_name}</span>
      {model.thinking && (
        <Brain className="size-3.5 shrink-0 text-[var(--primary)]" aria-hidden />
      )}
      {model.supports_vision && (
        <Eye className="size-3.5 shrink-0 text-[var(--text-subtle)]" aria-hidden />
      )}
      {active && <Check className="size-3.5 shrink-0 text-[var(--primary)]" aria-hidden />}
    </button>
  );
}

/** Athena-hosted (credit-gated) vs the org's own key (BYOK, billed to org)
 *  vs the user's personal subscription (their own plan pays; chat only). */
function SourceMark({ source }: { source: EnabledModel["source"] }) {
  if (source === "byok") {
    return (
      <KeyRound className="size-3 shrink-0 text-[var(--text-muted)]" aria-label="Your key" />
    );
  }
  if (source === "subscription") {
    return (
      <UserRound
        className="size-3 shrink-0 text-[var(--text-muted)]"
        aria-label="Your plan"
      />
    );
  }
  return (
    <Sparkles className="size-3 shrink-0 text-[var(--primary)]" aria-label="Athena" />
  );
}
