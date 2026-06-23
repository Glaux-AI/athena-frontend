"use client";

/**
 * TaskDomainChips - the domains a task touches, as small linked chips. A task
 * can span several domains (or none); each chip links to that domain. Renders
 * nothing when the task is unscoped (inbox) or the domains haven't loaded.
 */

import Link from "next/link";

import type { Domain } from "@/lib/api/client";
import { cn } from "@/lib/cn";

const EMBLEM_DOT: Record<string, string> = {
  violet: "bg-[var(--acc-violet)]",
  cyan: "bg-[var(--acc-cyan)]",
  amber: "bg-[var(--acc-amber)]",
  indigo: "bg-[var(--acc-indigo)]",
  rose: "bg-[var(--acc-rose)]",
  mint: "bg-[var(--acc-mint)]",
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
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          title={`Domain: ${d.name}`}
        >
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              EMBLEM_DOT[d.emblem] ?? EMBLEM_DOT.violet,
            )}
            aria-hidden
          />
          {d.name}
        </Link>
      ))}
    </>
  );
}
