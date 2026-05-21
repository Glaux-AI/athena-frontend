/**
 * EmptyState — first-class component per UX standard §9.2.
 * Every list / detail page that may be empty MUST use this.
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
        "flex flex-col items-center justify-center rounded-lg border border-dashed py-12 px-6 text-center",
        "border-[var(--border)] bg-[var(--surface-2)]",
        className
      )}
    >
      {icon && (
        <div className="mb-3 text-[var(--text-muted)]" aria-hidden="true">
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
