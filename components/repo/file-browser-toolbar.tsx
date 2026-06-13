"use client";

/**
 * FileBrowserToolbar - search input + language/layer chip filters +
 * clear-link + counter row. Extracted from `<FileBrowser>` so each
 * component stays under the 250-LOC §11.2 ceiling.
 */

import { Search, X } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";

interface FileBrowserToolbarProps {
  search: string;
  onSearch: (v: string) => void;
  language: string | null;
  languages: [string, number][];
  onLanguage: (v: string | null) => void;
  layer: string | null;
  layers: [string, number][];
  onLayer: (v: string | null) => void;
  anyFilter: boolean;
  onClearFilters: () => void;
  filteredCount: number;
  totalCount: number;
}

export function FileBrowserToolbar(p: FileBrowserToolbarProps) {
  return (
    <Card className="!p-3" data-testid="file-browser-toolbar">
      <Stack gap="2">
        <Cluster gap="3" align="center" justify="between">
          <label className="relative flex flex-1 items-center">
            <Search className="absolute left-2.5 size-4 text-[var(--text-muted)]" aria-hidden />
            <input
              type="search"
              value={p.search}
              onChange={(e) => p.onSearch(e.target.value)}
              placeholder="Search files…"
              aria-label="Search files"
              className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] py-1.5 pl-8 pr-3 text-sm placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            />
          </label>
          <span className="text-xs tabular-nums text-[var(--text-muted)]" data-testid="file-browser-counter">
            <strong className="font-semibold text-[var(--text)]">{p.filteredCount.toLocaleString()}</strong>
            {" of "}
            <span>{p.totalCount.toLocaleString()}</span>
          </span>
        </Cluster>
        <Cluster gap="1" align="center">
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">lang</span>
          {p.languages.length === 0 && <span className="text-xs text-[var(--text-muted)]">-</span>}
          {p.languages.map(([name, n]) => (
            <Chip
              key={name}
              active={p.language === name}
              onClick={() => p.onLanguage(p.language === name ? null : name)}
              label={name}
              count={n}
            />
          ))}
          <span className="ml-3 text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">layer</span>
          {p.layers.length === 0 && <span className="text-xs text-[var(--text-muted)]">-</span>}
          {p.layers.map(([name, n]) => (
            <Chip
              key={name}
              active={p.layer === name}
              onClick={() => p.onLayer(p.layer === name ? null : name)}
              label={name}
              count={n}
            />
          ))}
          {p.anyFilter && (
            <button
              type="button"
              onClick={p.onClearFilters}
              className="ml-2 inline-flex items-center gap-1 text-xs text-[var(--primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              data-testid="file-browser-clear"
            >
              <X className="size-3" aria-hidden /> Clear
            </button>
          )}
        </Cluster>
      </Stack>
    </Card>
  );
}

function Chip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-7 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
        active
          ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-fg)]"
          : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-2)]",
      )}
      data-testid={`file-browser-chip-${label}`}
    >
      <span>{label}</span>
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}
