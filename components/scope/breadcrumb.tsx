/**
 * Breadcrumb - `{orgName} › {capName} › {repoName}` navigation strip.
 *
 * Per ADR-073, the navigable hierarchy is `org → domain → repo`. Every
 * scope except Org renders this strip immediately above <ScopeHeader>. Each
 * segment is a link to its scope's surface; the current scope is the final
 * non-link segment.
 *
 * Caller passes the items in hierarchy order; render order is "Org › … ›
 * Current". The last item's `href` is ignored - it renders as plain text.
 */

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/cn";

interface BreadcrumbItem {
  /** Display label (org name, domain name, repo name). */
  label: string;
  /** Route to navigate to when clicked. The last item is rendered as text,
   * so its href is irrelevant. */
  href: string;
}

export function Breadcrumb({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className={cn("text-xs", className)}>
      <ol className="flex flex-wrap items-center gap-1 text-[var(--text-muted)]">
        {items.map((it, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={`${it.href}-${i}`} className="flex items-center gap-1 min-w-0">
              {isLast ? (
                <span className="truncate font-medium text-[var(--text)]" aria-current="page" title={it.label}>
                  {it.label}
                </span>
              ) : (
                <Link
                  href={it.href}
                  className="truncate rounded px-1 -mx-1 hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                  title={it.label}
                >
                  {it.label}
                </Link>
              )}
              {!isLast && (
                <ChevronRight className="size-3 shrink-0 text-[var(--text-subtle)]" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
