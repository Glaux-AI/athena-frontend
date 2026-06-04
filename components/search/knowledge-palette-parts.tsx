"use client";

/**
 * Sub-components for the knowledge palette — header (input + mode tabs
 * + scope chip + filters/close button), filter cluster, empty state,
 * skeleton rows.
 *
 * Split out of `knowledge-palette.tsx` to keep that file at the ≤250
 * LOC ceiling (CLAUDE.md). All visual leaf-components; no fetch logic.
 */

import { Search, X } from "lucide-react";

import { cn } from "@/lib/cn";
import type { SearchKind, SearchMode, SearchScope } from "@/lib/api/client";

export const MODES: SearchMode[] = ["hybrid", "semantic", "lexical"];
const SAMPLE_QUERIES = [
  "auth flow", "payment service", "retry policy", "invoice state",
];

const KIND_OPTIONS: { value: SearchKind; label: string }[] = [
  { value: "file", label: "Files" },
  { value: "function", label: "Functions" },
  { value: "class", label: "Classes" },
  { value: "config", label: "Configs" },
  { value: "document", label: "Documents" },
  { value: "service", label: "Services" },
  { value: "module", label: "Modules" },
  { value: "overlay", label: "Domain notes" },
];

export function PaletteHeader({
  q, setQ, mode, setMode, scope, filtersOpen, setFiltersOpen, inputRef, onClose,
}: {
  q: string;
  setQ: (v: string) => void;
  mode: SearchMode;
  setMode: (m: SearchMode) => void;
  scope: SearchScope;
  filtersOpen: boolean;
  setFiltersOpen: (v: boolean) => void;
  inputRef: React.Ref<HTMLInputElement>;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
      <Search className="size-4 text-[var(--text-muted)]" aria-hidden />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded
        aria-controls="knowledge-search-results"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search files, functions, classes, configs, notes…"
        className="flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]"
      />
      <ModeTabs mode={mode} setMode={setMode} />
      <ScopeChip scope={scope} />
      <button
        type="button"
        onClick={() => setFiltersOpen(!filtersOpen)}
        aria-label={filtersOpen ? "Close filters" : "Open filters"}
        aria-expanded={filtersOpen}
        className={cn(
          "rounded-md px-2 py-1 text-xs transition-colors duration-150 ease-out",
          filtersOpen
            ? "bg-[var(--primary-soft)] text-[var(--primary)]"
            : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
        )}
      >Filters</button>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close search"
        className="inline-flex size-7 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

function ModeTabs({ mode, setMode }: { mode: SearchMode; setMode: (m: SearchMode) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Search mode"
      className="flex rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-0.5 text-xs"
    >
      {MODES.map((m) => (
        <button
          key={m}
          role="tab"
          aria-selected={mode === m}
          onClick={() => setMode(m)}
          className={cn(
            "rounded px-2 py-0.5 capitalize transition-colors duration-150 ease-out",
            mode === m
              ? "bg-[var(--surface)] font-medium text-[var(--text)] shadow-[var(--shadow-1)]"
              : "text-[var(--text-muted)] hover:text-[var(--text)]",
          )}
        >{m}</button>
      ))}
    </div>
  );
}

function ScopeChip({ scope }: { scope: SearchScope }) {
  const label = scope === "repo" ? "Repo" : scope === "capability" ? "Capability" : "Org";
  return (
    <span
      className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]"
      title={`Search scope: ${label}`}
    >{label}</span>
  );
}

export function FilterCluster({
  kindFilter, setKindFilter,
}: { kindFilter: SearchKind[]; setKindFilter: (next: SearchKind[]) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-[var(--border)] px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Kind</span>
      {KIND_OPTIONS.map((k) => {
        const on = kindFilter.includes(k.value);
        return (
          <button
            key={k.value}
            type="button"
            aria-pressed={on}
            onClick={() => setKindFilter(
              on ? kindFilter.filter((x) => x !== k.value) : [...kindFilter, k.value],
            )}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px] transition",
              on
                ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]",
            )}
          >{k.label}</button>
        );
      })}
    </div>
  );
}

export function EmptyState({ recent, onPick }: { recent: string[]; onPick: (q: string) => void }) {
  return (
    <div className="px-4 py-6">
      {recent.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Recent</p>
          <ul className="flex flex-wrap gap-1">
            {recent.map((r) => (
              <li key={r}>
                <button
                  type="button"
                  onClick={() => onPick(r)}
                  className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-xs text-[var(--text-muted)] hover:bg-[var(--surface)]"
                >{r}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-sm text-[var(--text-muted)]">Start typing to search the knowledge graph.</p>
      <ul className="mt-3 flex flex-wrap gap-1">
        {SAMPLE_QUERIES.map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => onPick(s)}
              className="rounded-full border border-dashed border-[var(--border)] px-2 py-0.5 text-xs text-[var(--text-subtle)] hover:bg-[var(--surface-2)]"
            >{s}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SkeletonRows() {
  return (
    <ul aria-busy aria-label="Loading results" className="space-y-1 p-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <li
          key={i}
          className="h-12 animate-pulse rounded-md bg-[var(--surface-2)] motion-reduce:animate-none"
        />
      ))}
    </ul>
  );
}
