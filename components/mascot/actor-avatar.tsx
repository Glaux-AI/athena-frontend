"use client";

/**
 * ActorAvatar — single primitive for "who did this" across activity,
 * decisions, inbox, chat. Renders the Athena owl when the actor is an
 * agent, a terminal glyph for an EXTERNAL coding agent (Claude Code /
 * Codex working over MCP — never the owl, which is Athena alone),
 * initials chip otherwise.
 */

import { SquareTerminal } from "lucide-react";

import { OwlAvatar, type OwlMood } from "./owl-avatar";
import { cn } from "@/lib/cn";

interface ActorAvatarProps {
  name: string;
  /** Optional pre-computed initials (e.g. "MR"). Falls back to first letter of each word. */
  initials?: string | undefined;
  /** When true, render the Athena owl instead of initials. */
  agent?: boolean | undefined;
  /** When true, render the external-coding-agent terminal glyph. Wins
   *  over `agent` — an MCP executor must never wear the owl. */
  externalAgent?: boolean | undefined;
  size?: number | undefined;
  mood?: OwlMood | undefined;
  className?: string | undefined;
}

function fallbackInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function ActorAvatar({ name, initials, agent, externalAgent, size = 24, mood = "happy", className }: ActorAvatarProps) {
  if (externalAgent) {
    return (
      <span
        aria-label={name}
        title={name}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--info-soft)] text-[var(--info-ink)]",
          className,
        )}
        style={{ width: size, height: size }}
      >
        <SquareTerminal style={{ width: size * 0.58, height: size * 0.58 }} aria-hidden />
      </span>
    );
  }
  if (agent) {
    return <OwlAvatar size={size} mood={mood} className={className} static />;
  }
  return (
    <span
      aria-label={name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] font-semibold text-[var(--text)]",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.42)) }}
    >
      {initials ?? fallbackInitials(name)}
    </span>
  );
}
