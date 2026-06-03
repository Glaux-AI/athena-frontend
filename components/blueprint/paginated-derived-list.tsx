"use client";

/**
 * PaginatedDerivedList — renders one Blueprint derived component list
 * (api_surface / data_models / services / hot_files / entry_points /
 * external_deps / domain_glossary) paginated over the WHOLE dataset, not just
 * the section's stored top-N. Each page is fetched from `GET
 * /v1/knowledge/derived` (offset/limit + true total) so the 10/20/50/100
 * page-size selector can reach every row.
 *
 * `initialItems` (the section's already-loaded `body_json.items`) is shown
 * instantly for the first page so there's no skeleton flash; the fetch then
 * refines it with the true total. `renderItem` keeps the caller's existing row
 * markup (a `<NodeRefRow>` for item lists, the glossary card for the glossary),
 * so this component owns ONLY the paging.
 */

import { useEffect, useState } from "react";

import { Stack } from "@/components/layout/primitives";
import { Pagination } from "@/components/ui/pagination";
import { api, type DerivedItem, type DerivedListKey } from "@/lib/api/client";

/** Below this the section fits on one default page → no pager chrome. */
const SMALLEST_PAGE = 10;

interface PaginatedDerivedListProps {
  scope: "repo" | "capability";
  scopeId: string;
  listKey: DerivedListKey;
  /** The section's stored items — instant first-page render + fallback. */
  initialItems: DerivedItem[];
  renderItem: (item: DerivedItem) => React.ReactNode;
  /** Noun for the pager summary ("endpoints", "tables", "terms", …). */
  label?: string;
  "data-testid"?: string;
}

export function PaginatedDerivedList({
  scope,
  scopeId,
  listKey,
  initialItems,
  renderItem,
  label = "items",
  "data-testid": testId,
}: PaginatedDerivedListProps) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(SMALLEST_PAGE);
  const [data, setData] = useState<{ items: DerivedItem[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    api.knowledge
      .derivedList({ scope, scopeId, list: listKey, offset: page * pageSize, limit: pageSize })
      .then((d) => {
        if (!cancelled) setData({ items: d.items, total: d.total });
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, scopeId, listKey, page, pageSize]);

  // Server data wins; before the first response, show the stored items for
  // page 0 so the section doesn't flash empty.
  const items = data?.items ?? (page === 0 ? initialItems.slice(0, pageSize) : []);
  const total = data?.total ?? initialItems.length;
  const showPager = total > SMALLEST_PAGE;

  const changePageSize = (size: number) => {
    setPageSize(size);
    setPage(0);
  };

  return (
    <Stack gap="2" {...(testId ? { "data-testid": testId } : {})}>
      <Stack gap="1.5">{items.map((it) => renderItem(it))}</Stack>
      {items.length === 0 && !loading && (
        <p className="text-sm text-[var(--text-muted)]">
          {error ? `Couldn't load ${label}.` : `No ${label} found.`}
        </p>
      )}
      {showPager && (
        <Pagination
          total={total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={changePageSize}
          loading={loading}
          label={label}
        />
      )}
    </Stack>
  );
}
