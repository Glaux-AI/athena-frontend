"use client";

/**
 * GraphFilters - chip-cluster filter bar above the React Flow canvas on
 * `/knowledge/graph`. Exposes the four BE query params the endpoint already
 * accepts (`domain_id`, `repo_id`, `layer`, `limit`) plus client-side
 * filters: a `kind` multi-select that runs against `node_kind` after fetch,
 * and a free-text search that filters the rendered set by name.
 *
 * URL state is the source of truth - everything writes back to the URL so
 * the view is shareable: `?domain_id=&repo_id=&layer=API,Service&kind=
 * file,function&limit=200&q=`.
 *
 * Tokens only. WCAG 2.1 AA - multi-selects emit `aria-pressed`, layout
 * primitives drive spacing, motion stays under the 300ms budget.
 */

import { useEffect, useMemo, useState } from "react";

import { Cluster, Stack } from "@/components/layout/primitives";
import { Button } from "@/components/ui/button";
import { api, type Domain, type DomainRepo } from "@/lib/api/client";

export const LAYER_OPTIONS = ["API", "Service", "Data", "UI", "Util", "Infra", "Test"] as const;
export const KIND_OPTIONS = ["file", "function", "class", "config", "document", "service", "module"] as const;

type Layer = (typeof LAYER_OPTIONS)[number];
type NodeKind = (typeof KIND_OPTIONS)[number];

export interface GraphFiltersState {
  domainId: string | null;
  repoId: string | null;
  layers: Layer[];
  kinds: NodeKind[];
  limit: number;
  q: string;
}

export const EMPTY_FILTERS: GraphFiltersState = { domainId: null, repoId: null, layers: [], kinds: [], limit: 200, q: "" };

export function parseFiltersFromQuery(sp: URLSearchParams): GraphFiltersState {
  const layers = (sp.get("layer") ?? "").split(",").filter((s): s is Layer => (LAYER_OPTIONS as readonly string[]).includes(s));
  const kinds = (sp.get("kind") ?? "").split(",").filter((s): s is NodeKind => (KIND_OPTIONS as readonly string[]).includes(s));
  const rawLimit = Number(sp.get("limit"));
  return {
    domainId: sp.get("domain_id") || null,
    repoId: sp.get("repo_id") || null,
    layers, kinds,
    limit: Number.isFinite(rawLimit) && rawLimit >= 10 && rawLimit <= 1000 ? rawLimit : 200,
    q: sp.get("q") ?? "",
  };
}

export function serializeFiltersToQuery(f: GraphFiltersState): string {
  const sp = new URLSearchParams();
  if (f.domainId) sp.set("domain_id", f.domainId);
  if (f.repoId) sp.set("repo_id", f.repoId);
  if (f.layers.length) sp.set("layer", f.layers.join(","));
  if (f.kinds.length) sp.set("kind", f.kinds.join(","));
  if (f.limit !== 200) sp.set("limit", String(f.limit));
  if (f.q) sp.set("q", f.q);
  return sp.toString();
}

function isActive(f: GraphFiltersState): boolean {
  return !!f.domainId || !!f.repoId || f.layers.length > 0 || f.kinds.length > 0 || f.limit !== 200 || f.q.length > 0;
}

function toggle<T extends string>(arr: readonly T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

interface GraphFiltersProps {
  value: GraphFiltersState;
  onChange: (next: GraphFiltersState) => void;
  /** "{filteredCount} of {totalCount} nodes shown" rendered on the right. */
  filteredCount: number;
  totalCount: number;
}

export function GraphFilters({ value, onChange, filteredCount, totalCount }: GraphFiltersProps) {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [repos, setRepos] = useState<DomainRepo[]>([]);

  useEffect(() => { api.domains.list().then(setDomains).catch(() => setDomains([])); }, []);
  useEffect(() => {
    if (!value.domainId) { setRepos([]); return; }
    api.domains.listRepos(value.domainId).then(setRepos).catch(() => setRepos([]));
  }, [value.domainId]);

  const active = useMemo(() => isActive(value), [value]);
  const setDomain = (id: string) => onChange({ ...value, domainId: id || null, repoId: null });
  const setRepo = (id: string) => onChange({ ...value, repoId: id || null });
  const toggleLayer = (l: Layer) => onChange({ ...value, layers: toggle(value.layers, l) });
  const toggleKind = (k: NodeKind) => onChange({ ...value, kinds: toggle(value.kinds, k) });
  const setLimit = (n: number) => onChange({ ...value, limit: Math.max(10, Math.min(1000, n)) });
  const setQuery = (q: string) => onChange({ ...value, q });
  const clearAll = () => onChange(EMPTY_FILTERS);

  return (
    <Stack gap="2" as="section" data-testid="graph-filters">
      <Cluster gap="2" align="center" justify="between">
        <Cluster gap="2" align="center">
          <select
            data-testid="graph-filter-domain"
            value={value.domainId ?? ""}
            onChange={(e) => setDomain(e.target.value)}
            aria-label="Domain"
            className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--text)] transition-colors duration-150 ease-out hover:border-[var(--border-strong)] focus-visible:border-[var(--border-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <option value="">All domains</option>
            {domains.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
          <select
            data-testid="graph-filter-repo"
            value={value.repoId ?? ""}
            onChange={(e) => setRepo(e.target.value)}
            aria-label="Repository"
            disabled={!value.domainId}
            className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--text)] transition-colors duration-150 ease-out hover:border-[var(--border-strong)] focus-visible:border-[var(--border-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
          >
            <option value="">All repos</option>
            {repos.map((r) => (<option key={r.id} value={r.id}>{r.repo_full_name}</option>))}
          </select>
          <input
            data-testid="graph-filter-search"
            type="search"
            value={value.q}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name"
            aria-label="Search by name"
            className="h-8 w-44 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--text)] placeholder:text-[var(--text-subtle)] transition-colors duration-150 ease-out hover:border-[var(--border-strong)] focus-visible:border-[var(--border-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          />
          <label className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
            Limit
            <input
              data-testid="graph-filter-limit"
              type="number"
              min={10} max={1000} step={10}
              value={value.limit}
              onChange={(e) => setLimit(Number(e.target.value) || 200)}
              aria-label="Node limit"
              className="h-8 w-20 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--text)] tabular-nums transition-colors duration-150 ease-out hover:border-[var(--border-strong)] focus-visible:border-[var(--border-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            />
          </label>
          {active && (
            <Button data-testid="graph-filter-clear" variant="ghost" size="sm" onClick={clearAll}>Clear all</Button>
          )}
        </Cluster>
        <span className="text-xs tabular-nums text-[var(--text-muted)]" data-testid="graph-filter-counter">
          {filteredCount} of {totalCount} nodes shown
        </span>
      </Cluster>
      <Cluster gap="1" align="center" as="nav" aria-label="Filter by layer">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Layer</span>
        {LAYER_OPTIONS.map((l) => {
          const on = value.layers.includes(l);
          return (
            <button
              key={l} type="button"
              data-testid={`graph-filter-layer-${l}`}
              aria-pressed={on}
              onClick={() => toggleLayer(l)}
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider transition-colors duration-150 ${on ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]"}`}
            >
              {l}
            </button>
          );
        })}
      </Cluster>
      <Cluster gap="1" align="center" as="nav" aria-label="Filter by node kind">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Kind</span>
        {KIND_OPTIONS.map((k) => {
          const on = value.kinds.includes(k);
          return (
            <button
              key={k} type="button"
              data-testid={`graph-filter-kind-${k}`}
              aria-pressed={on}
              onClick={() => toggleKind(k)}
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider transition-colors duration-150 ${on ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]"}`}
            >
              {k}
            </button>
          );
        })}
      </Cluster>
    </Stack>
  );
}
