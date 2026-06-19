"use client";

/**
 * URL-backed in-page navigation state.
 *
 * In-page navigation (which tab is open, which sub-view is showing, which
 * detail drawer the user opened) used to live in `useState`, so the URL never
 * changed and the browser Back button left the whole page instead of returning
 * to the previous tab/view. These hooks store that state in a query param so
 * each change is its own history entry and Back does the expected thing - while
 * keeping the value deep-linkable and reload-stable.
 *
 * Reference precedents already in the tree: the scope pages
 * (`/knowledge`, `/domains/[id]`, `.../repos/[repo_id]`) read `?tab=` and push
 * it on change; `topology/explorer/explorer-store` mirrors its `?node=`.
 *
 * Writes are history pushes by default (so Back steps back through them); pass
 * `{ replace: true }` for programmatic/default selections that should not add a
 * history entry. The merge base is the *live* URL (`window.location.search`),
 * not the React snapshot, so a second writer on the same page (e.g. a graph
 * store mirroring its own param) can never clobber this param and vice-versa.
 * Navigation uses `{ scroll: false }` - switching a tab in place should not
 * jump the page to the top.
 */

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type SetOpts = { replace?: boolean };

/**
 * Read + write a single nullable URL query param. Use for selection / open
 * state (a selected row, an opened drawer): `null` means "not set" and clears
 * the param. Returns `[value, setValue]`.
 */
export function useUrlParam(
  key: string,
): readonly [string | null, (next: string | null, opts?: SetOpts) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = searchParams.get(key);

  const setValue = useCallback(
    (next: string | null, opts?: SetOpts) => {
      const sp = new URLSearchParams(window.location.search);
      if (next == null || next === "") sp.delete(key);
      else sp.set(key, next);
      const qs = sp.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (opts?.replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [router, pathname, key],
  );

  return [value, setValue] as const;
}

/**
 * URL-backed tab/view selector with a typed fallback. `value` is always one of
 * `valid` (or `fallback` when the param is absent or unrecognised), so an
 * out-of-date/hand-edited URL degrades gracefully. Selecting the fallback
 * clears the param (the default tab keeps the URL clean). Returns
 * `[value, setValue]` - a drop-in for a `useState` tab pair.
 */
export function useTabParam<T extends string>(
  key: string,
  fallback: T,
  valid: readonly T[],
): readonly [T, (next: T) => void] {
  const [raw, setRaw] = useUrlParam(key);
  const value: T =
    raw != null && (valid as readonly string[]).includes(raw) ? (raw as T) : fallback;
  const setValue = useCallback(
    (next: T) => setRaw(next === fallback ? null : next),
    [setRaw, fallback],
  );
  return [value, setValue] as const;
}
