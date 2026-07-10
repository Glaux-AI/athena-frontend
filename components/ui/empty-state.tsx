/**
 * EmptyState - first-class component per UX standard §9.2 (Nightglass §5.8).
 * Every list / detail page that may be empty MUST use this.
 *
 * "Nothing here yet" is a patch of night sky with one glowing north star: a
 * static token-driven starfield (L2 - the sanctioned empty-moment) behind a
 * frosted icon chip. The old dashed border is gone - it read as a file
 * dropzone, not an empty moment. For hero empties (inbox zero, chat welcome)
 * pass an Owl avatar as `icon` - Sophia is the resident of the sky.
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
        "relative flex flex-col items-center justify-center overflow-hidden rounded-xl py-12 px-6 text-center",
        "bg-[var(--bg-deep)]",
        className
      )}
    >
      <div className="starfield" aria-hidden="true" />
      {icon && (
        <div
          className={cn(
            "relative mb-4 inline-flex size-12 items-center justify-center rounded-full",
            "border border-[var(--border)] bg-[var(--surface-glass)] text-[var(--text-muted)]",
            "backdrop-blur-[var(--glass-blur-panel)]",
            "shadow-[0_0_20px_var(--glow-accent),var(--glass-glint)]",
          )}
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      <h3 className="relative text-lg font-medium text-[var(--text)]">{title}</h3>
      {description && (
        <p className="relative mt-1 max-w-sm text-sm text-[var(--text-muted)]">{description}</p>
      )}
      {action && <div className="relative mt-4">{action}</div>}
    </div>
  );
}
