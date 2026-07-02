"use client";

/**
 * useStickToBottom - keep a scrolling stream pinned to its newest content,
 * UNLESS the user has scrolled up to read.
 *
 * The canonical "auto-scroll a live feed to the bottom, but never fight the
 * reader" primitive used across Athena's streaming surfaces (chat panels, the
 * sub-agent activity drawer). Wire the returned `ref` to the scroll container
 * and `onScroll` to its `onScroll`; pass the changing content as `deps` so new
 * content sticks to the bottom only while the reader is already near it. Call
 * `scrollToBottom()` imperatively to force a jump (e.g. right after the user
 * sends).
 *
 * The `/chat` page and FAB keep their own bespoke version (they also drive a
 * floating "jump to latest" button + Sophia mood); this is for the simpler
 * surfaces that only need the stick-to-bottom behaviour.
 */

import { useCallback, useEffect, useRef } from "react";

export function useStickToBottom<T extends HTMLElement>(
  deps: readonly unknown[],
  /** How close to the bottom (px) still counts as "reading the latest". */
  threshold = 80,
) {
  const ref = useRef<T>(null);
  // Start pinned: a freshly-mounted feed opens at its newest content.
  const pinnedRef = useRef(true);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    pinnedRef.current =
      el.scrollHeight - el.clientHeight - el.scrollTop < threshold;
  }, [threshold]);

  const scrollToBottom = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    pinnedRef.current = true;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ref, onScroll, scrollToBottom };
}
