"use client";

/**
 * TaskDomainChips - the domains a task touches, as small linked chips. A task
 * can span several domains (or none); each chip links to that domain. Renders
 * nothing when the task is unscoped (inbox) or the domains haven't loaded.
 * The emblem renders as a star-dot in the domain's accent color.
 */

import Link from "next/link";
import type { CSSProperties } from "react";

import type { Domain } from "@/lib/api/client";
import { focusRing } from "@/components/ui/focus";
import { cn } from "@/lib/cn";

const EMBLEM_DOT: Record<string, string> = {
  violet: "var(--acc-violet)",
  cyan: "var(--acc-cyan)",
  amber: "var(--acc-amber)",
  indigo: "var(--acc-indigo)",
  rose: "var(--acc-rose)",
  mint: "var(--acc-mint)",
};

export function TaskDomainChips({
  domainIds,
  byId,
}: {
  domainIds: string[];
  byId: Map<string, Domain>;
}) {
  const resolved = domainIds
    .map((id) => byId.get(id))
    .filter((d): d is Domain => d !== undefined);
  if (resolved.length === 0) return null;
  return (
    <>
      {resolved.map((d) => (
        <Link
          key={d.id}
          href={`/domains/${d.id}`}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2 py-0.5 text-micro font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
            focusRing,
          )}
          title={`Domain: ${d.name}`}
        >
          <span
            className="star-dot"
            style={{
              "--dot-color": EMBLEM_DOT[d.emblem] ?? EMBLEM_DOT.violet,
            } as CSSProperties}
            aria-hidden
          />
          {d.name}
        </Link>
      ))}
    </>
  );
}
