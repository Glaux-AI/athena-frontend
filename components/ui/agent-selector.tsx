"use client";

/**
 * <AgentSelector> - the per-turn custom-agent picker, mounted in the chat
 * composer next to the model + effort dials.
 *
 * A custom agent (Agent Registry) bundles a system prompt + tools + a pinned
 * model. Picking one is per-turn, like the model/effort picks: the parent owns
 * `value` (the agent id, or null = the default Athena agent) and `onChange`,
 * mirroring the <ModelSelector> / <EffortSelector> convention. Agents are
 * grouped Yours / Shared; selecting one pre-fills the composer's model with the
 * agent's pinned model (the parent handles that).
 */

import * as Popover from "@radix-ui/react-popover";
import { Bot, Check, ChevronDown } from "lucide-react";

import { Eyebrow } from "@/components/ui/eyebrow";
import { cn } from "@/lib/cn";
import type { Agent } from "@/lib/api/client";

export function AgentSelector({
  agents,
  value,
  onChange,
  disabled,
  align = "start",
  className,
}: {
  agents: Agent[];
  value: string | null;
  onChange: (agentId: string | null) => void;
  disabled?: boolean;
  align?: "start" | "end";
  className?: string;
}) {
  const selected = value ? (agents.find((a) => a.id === value) ?? null) : null;
  const mine = agents.filter((a) => a.is_owner);
  const shared = agents.filter((a) => !a.is_owner);
  const hasGroups = mine.length > 0 && shared.length > 0;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={selected ? `Agent: ${selected.name}` : "Select agent"}
          className={cn(
            "group inline-flex h-8 max-w-[14rem] items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
            "disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:bg-[var(--surface-2)]",
            selected
              ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
              : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-2)]",
            className,
          )}
        >
          <Bot className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{selected ? selected.name : "Agent"}</span>
          <ChevronDown
            className="size-3.5 shrink-0 opacity-70 transition-transform duration-150 group-data-[state=open]:rotate-180"
            aria-hidden
          />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={6}
          className={cn(
            "glass-panel z-[var(--z-popover)] max-h-[60vh] w-[18rem] overflow-y-auto p-1.5",
            "animate-pop-in",
          )}
        >
          <div className="flex flex-col">
            <AgentRow
              name="No agent"
              detail="The default Athena chat agent"
              active={value == null}
              onPick={() => onChange(null)}
            />
            {agents.length === 0 ? (
              <p className="px-2.5 py-2 text-micro text-[var(--text-muted)]">
                No custom agents yet. Build one in{" "}
                <span className="text-[var(--text)]">Custom agents</span>.
              </p>
            ) : (
              <>
                {mine.length > 0 && (
                  <Group {...(hasGroups ? { label: "Yours" } : {})}>
                    {mine.map((a) => (
                      <AgentRow
                        key={a.id}
                        name={a.name}
                        detail={a.description || a.slug}
                        active={value === a.id}
                        onPick={() => onChange(a.id)}
                      />
                    ))}
                  </Group>
                )}
                {shared.length > 0 && (
                  <Group {...(hasGroups ? { label: "Shared with you" } : {})}>
                    {shared.map((a) => (
                      <AgentRow
                        key={a.id}
                        name={a.name}
                        detail={a.description || a.slug}
                        active={value === a.id}
                        onPick={() => onChange(a.id)}
                      />
                    ))}
                  </Group>
                )}
              </>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Group({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      {label && <Eyebrow className="block px-2.5 pb-1 pt-1.5">{label}</Eyebrow>}
      {children}
    </div>
  );
}

function AgentRow({
  name,
  detail,
  active,
  onPick,
}: {
  name: string;
  detail: string;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-current={active}
      className={cn(
        "flex items-start gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors",
        active ? "bg-[var(--primary-soft)]" : "hover:bg-[var(--surface-2)]",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-[var(--text)]">{name}</span>
        <span className="block truncate text-xs text-[var(--text-muted)]">{detail}</span>
      </span>
      {active && <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--primary)]" aria-hidden />}
    </button>
  );
}
