/**
 * Saved board views - named slices of the `/work` board. Two kinds:
 *
 *  - Built-in "smart" views (Athena-seeded): sensible defaults every org gets
 *    for free, expressed purely with existing filters (no setup).
 *  - Personal saved views: the user's own presets, persisted per-org in
 *    localStorage. This is UI preference only (filter/group selections + an
 *    opaque domain id) - the same category as the run-prefs already stored
 *    there; no task content, no PII, no secrets ever touch storage.
 *
 * A view is a full board slice, so applying one resets the other fields to
 * default (and always clears the transient search box).
 */

import { DEFAULT_FILTERS, type BoardFilters } from "@/components/board/board-toolbar";

/** A view's stored shape - the board slice minus the transient search term. */
export type ViewConfig = Omit<BoardFilters, "q">;

export interface SavedView {
  id: string;
  name: string;
  config: ViewConfig;
}

export interface BuiltinView {
  id: string;
  name: string;
  config: Partial<BoardFilters>;
}

export const BUILTIN_VIEWS: BuiltinView[] = [
  { id: "mine", name: "My tasks", config: { scope: "mine" } },
  { id: "reviews", name: "My reviews", config: { scope: "review" } },
  { id: "urgent", name: "Urgent", config: { scope: "all", priority: "urgent" } },
  { id: "at-risk", name: "At risk", config: { scope: "all", health: "at_risk" } },
  { id: "by-owner", name: "By owner", config: { scope: "all", groupBy: "owner" } },
];

/** Fields that define a slice (search is transient and never part of a view). */
const SLICE_KEYS: (keyof BoardFilters)[] = [
  "scope",
  "domainId",
  "type",
  "priority",
  "health",
  "groupBy",
  "view",
];

/** Fold a (partial) view config over the defaults - unspecified fields reset. */
export function applyView(config: Partial<BoardFilters>): BoardFilters {
  return { ...DEFAULT_FILTERS, ...config, q: "" };
}

/** Is the current filter set this view (ignoring the transient search)? */
export function viewMatches(
  filters: BoardFilters,
  config: Partial<BoardFilters>,
): boolean {
  const merged = applyView(config);
  return SLICE_KEYS.every((k) => filters[k] === merged[k]);
}

function configFromFilters(filters: BoardFilters): ViewConfig {
  return {
    scope: filters.scope,
    domainId: filters.domainId,
    type: filters.type,
    priority: filters.priority,
    health: filters.health,
    groupBy: filters.groupBy,
    view: filters.view,
  };
}

const keyFor = (orgId: string) => `athena.savedViews.${orgId}`;

export function loadSavedViews(orgId: string | null): SavedView[] {
  if (!orgId || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(orgId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedView[]) : [];
  } catch {
    return [];
  }
}

export function saveView(
  orgId: string,
  name: string,
  filters: BoardFilters,
): SavedView[] {
  const view: SavedView = {
    id: crypto.randomUUID(),
    name,
    config: configFromFilters(filters),
  };
  const next = [...loadSavedViews(orgId), view];
  window.localStorage.setItem(keyFor(orgId), JSON.stringify(next));
  return next;
}

export function deleteSavedView(orgId: string, id: string): SavedView[] {
  const next = loadSavedViews(orgId).filter((v) => v.id !== id);
  window.localStorage.setItem(keyFor(orgId), JSON.stringify(next));
  return next;
}
