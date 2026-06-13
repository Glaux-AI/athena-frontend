"use client";

/**
 * Pagination - a compact, accessible page navigator with a page-size selector
 * (10 / 20 / 50 / 100, default 10). Controlled: the caller owns `page`
 * (0-indexed) + `pageSize` and reacts to `onPageChange` / `onPageSizeChange`.
 *
 * Used wherever a list paginates the WHOLE dataset (e.g. the Blueprint derived
 * component lists) instead of dumping 100+ rows at once. Render it only when
 * there's more than one page worth of data - it doesn't hide itself.
 */

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

interface PaginationProps {
  /** Total item count across all pages (the true total, not the page length). */
  total: number;
  /** Current page, 0-indexed. */
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: readonly number[];
  /** Show a subtle "…" next to the summary while a page is being fetched. */
  loading?: boolean;
  /** Noun for the summary line, e.g. "endpoints". */
  label?: string;
}

export function Pagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  loading = false,
  label = "items",
}: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pageCount - 1);
  const from = total === 0 ? 0 : current * pageSize + 1;
  const to = Math.min(total, (current + 1) * pageSize);

  return (
    <nav
      aria-label={`${label} pagination`}
      className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3 text-xs text-[var(--text-muted)]"
    >
      <span data-testid="pagination-summary" aria-live="polite">
        {total === 0 ? `No ${label}` : `Showing ${from}–${to} of ${total} ${label}`}
        {loading && <span className="ml-2 text-[var(--text-subtle)]" aria-hidden>…</span>}
      </span>

      <Cluster gap="3" align="center" className="flex-wrap">
        <label className="flex items-center gap-1.5">
          <span className="text-[var(--text-subtle)]">Per page</span>
          <select
            data-testid="pagination-page-size"
            aria-label="Items per page"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-xs text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            {pageSizeOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>

        <Cluster gap="1" align="center">
          <PagerButton
            label="Previous page"
            testId="pagination-prev"
            disabled={current <= 0}
            onClick={() => onPageChange(current - 1)}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </PagerButton>
          <span data-testid="pagination-status" className="tabular-nums px-1">
            Page {current + 1} of {pageCount}
          </span>
          <PagerButton
            label="Next page"
            testId="pagination-next"
            disabled={current >= pageCount - 1}
            onClick={() => onPageChange(current + 1)}
          >
            <ChevronRight className="size-4" aria-hidden />
          </PagerButton>
        </Cluster>
      </Cluster>
    </nav>
  );
}

function PagerButton({
  label,
  testId,
  disabled,
  onClick,
  children,
}: {
  label: string;
  testId: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-muted)]",
        "transition-colors duration-150 ease-out hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
      )}
    >
      {children}
    </button>
  );
}
