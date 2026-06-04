/**
 * EmptyState — first-class component per UX standard §9.2.
 * Every list / detail page that may be empty MUST use this.
 *
 * The icon sits in an elevated circular chip (multi-layer shadow) so an empty
 * surface reads as a designed "moment" rather than a void — calm enough for
 * dense surfaces, polished enough to match the depth language (UX §3.4).
 */

import { cn } from "@/lib/cn";
import { type ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed py-12 px-6 text-center",
        "border-[var(--border-strong)] bg-[var(--surface-2)]",
        className
      )}
    >
      {icon && (
        <div
          className="mb-4 inline-flex size-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] shadow-[var(--shadow-1)]"
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      <h3 className="text-lg font-medium text-[var(--text)]">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-[var(--text-muted)]">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
