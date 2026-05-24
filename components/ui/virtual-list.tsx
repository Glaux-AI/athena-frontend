"use client";

/**
 * VirtualList — viewport-windowed list rendering for large datasets.
 *
 * Per ADR-073 §6 (scalability primitives): any list whose source dataset
 * may exceed 50 items must render through this component. Used by:
 *   - Activity tab events (10s of thousands at org scope)
 *   - Decisions tab rows (hundreds at org scope)
 *   - Topology symbol/call-graph rows (millions at repo scope)
 *   - Recent commits at repo Activity
 *
 * Implementation: intersection-observer windowing — only items in or near
 * the viewport are mounted. No dependency on react-window / react-virtual.
 * The component keeps a constant `OVERSCAN` buffer above and below the
 * viewport so scrolling doesn't reveal blank rows.
 *
 * Constraints:
 *   - Items must have a stable key. Caller passes a `getKey` if the item
 *     shape isn't `{ id }`.
 *   - `estimatedItemHeight` is used to compute spacers; small drift is fine
 *     (the IntersectionObserver tightens as rows mount). For wildly varying
 *     row heights, prefer the median.
 *   - Rendering is `display: contents`-free — each item is wrapped in a
 *     `<div>` with the estimated height set as min-height so layout is
 *     stable even before mount.
 *   - When the dataset is ≤ `overscan * 3` items, this renders all items
 *     directly (no windowing) — cheaper than the observer setup.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/cn";

const OVERSCAN = 6; // rows beyond viewport to keep mounted

export interface VirtualListProps<T> {
  items: readonly T[];
  /** Renderer for a single item. Receives the item and its absolute index. */
  renderItem: (item: T, index: number) => ReactNode;
  /** Row height used to compute spacers. Real heights may differ; the
   *  observer reconciles. */
  estimatedItemHeight: number;
  /** Stable per-item key. Defaults to `(item as { id }).id` if present, else index. */
  getKey?: (item: T, index: number) => string | number;
  /** Optional className on the outer wrapper. */
  className?: string;
  /** Optional ARIA label for the list. */
  ariaLabel?: string;
  /** Element tag for the outer wrapper. Default `ul`. */
  as?: "ul" | "ol" | "div";
}

export function VirtualList<T>({
  items,
  renderItem,
  estimatedItemHeight,
  getKey,
  className,
  ariaLabel,
  as = "ul",
}: VirtualListProps<T>) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const sentinelRefs = useRef<Map<number, HTMLElement>>(new Map());
  const [visibleStart, setVisibleStart] = useState(0);
  const [visibleEnd, setVisibleEnd] = useState(Math.min(items.length, OVERSCAN * 4));

  // Small lists: render every item, skip the observer overhead.
  const shouldVirtualize = items.length > OVERSCAN * 3;

  // Reset visible window when the dataset changes length significantly.
  useEffect(() => {
    setVisibleStart(0);
    setVisibleEnd(Math.min(items.length, OVERSCAN * 4));
  }, [items.length]);

  // Intersection observer on every Nth sentinel (every OVERSCAN'th item) to
  // detect scroll position. Each sentinel reports its index when it crosses
  // the viewport; we compute the window from the most-recently-visible one.
  useEffect(() => {
    if (!shouldVirtualize) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleIndexes = entries
          .filter((e) => e.isIntersecting)
          .map((e) => Number((e.target as HTMLElement).dataset.virtualIndex));
        if (visibleIndexes.length === 0) return;
        const min = Math.min(...visibleIndexes);
        const max = Math.max(...visibleIndexes);
        setVisibleStart(Math.max(0, min - OVERSCAN));
        setVisibleEnd(Math.min(items.length, max + OVERSCAN * 2));
      },
      { root: null, rootMargin: `${estimatedItemHeight * OVERSCAN}px`, threshold: 0 },
    );

    sentinelRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [shouldVirtualize, items.length, estimatedItemHeight]);

  const resolveKey = useCallback(
    (item: T, index: number) => {
      if (getKey) return getKey(item, index);
      const anyItem = item as unknown as { id?: string | number };
      return anyItem.id ?? index;
    },
    [getKey],
  );

  const window = useMemo(() => {
    if (!shouldVirtualize) return { start: 0, end: items.length };
    return { start: visibleStart, end: visibleEnd };
  }, [shouldVirtualize, items.length, visibleStart, visibleEnd]);

  const topSpacerHeight = window.start * estimatedItemHeight;
  const bottomSpacerHeight = Math.max(0, items.length - window.end) * estimatedItemHeight;

  const Wrapper = as;

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      {shouldVirtualize && topSpacerHeight > 0 && (
        <div aria-hidden style={{ height: topSpacerHeight }} />
      )}
      <Wrapper
        className="flex flex-col"
        {...(ariaLabel ? { "aria-label": ariaLabel } : {})}
      >
        {items.slice(window.start, window.end).map((item, i) => {
          const absoluteIndex = window.start + i;
          const isSentinel = shouldVirtualize && absoluteIndex % OVERSCAN === 0;
          return (
            <div
              key={resolveKey(item, absoluteIndex)}
              data-virtual-index={absoluteIndex}
              ref={
                isSentinel
                  ? (el) => {
                      if (el) sentinelRefs.current.set(absoluteIndex, el);
                      else sentinelRefs.current.delete(absoluteIndex);
                    }
                  : undefined
              }
              style={{ minHeight: estimatedItemHeight }}
            >
              {renderItem(item, absoluteIndex)}
            </div>
          );
        })}
      </Wrapper>
      {shouldVirtualize && bottomSpacerHeight > 0 && (
        <div aria-hidden style={{ height: bottomSpacerHeight }} />
      )}
    </div>
  );
}
