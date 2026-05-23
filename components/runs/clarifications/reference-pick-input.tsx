"use client";

/**
 * ReferencePickInput — F-04.14 / question_kind === "reference_pick".
 *
 * Typed picker — debounced search against the relevant resource API
 * (`api.capabilities.list` / `api.mcp.list` / etc. depending on `entity_kind`).
 * Shows `candidates_hint` as quick-pick chips when present. Supports
 * single + multi selection per the picker's `multi` flag, with min/max
 * enforcement.
 *
 * Search uses a small per-entity-kind adapter so we don't bake any one
 * resource type into the picker. Adapters that aren't implemented in the
 * mock fall back to the `candidates_hint` list with a free-form text search.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api/client";
import type { ClarificationInputProps } from "./common";
import { isAnswerValid } from "./common";

interface PickCandidate {
  id: string;
  label: string;
  description?: string;
}

async function searchCandidates(
  entityKind: string,
  query: string,
  hint: PickCandidate[],
): Promise<PickCandidate[]> {
  const q = query.trim().toLowerCase();
  const filterHint = (cs: PickCandidate[]) =>
    q === "" ? cs : cs.filter((c) => c.label.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));

  try {
    if (entityKind === "capability") {
      const caps = await api.capabilities.list();
      const merged = [
        ...caps.map((c) => ({ id: c.id, label: c.name, description: c.description ?? c.slug })),
        ...hint,
      ];
      return filterHint(dedupeById(merged)).slice(0, 12);
    }
    if (entityKind === "repo") {
      const caps = await api.capabilities.list();
      const allRepos: PickCandidate[] = [];
      // We don't bulk-fetch every repo to keep the picker snappy; the hint
      // already carries the most-relevant candidates. Capability names show as
      // pseudo-repo entries to allow scope-narrowing in mocked envs.
      for (const cap of caps.slice(0, 4)) {
        allRepos.push({ id: cap.id, label: cap.name, description: `Capability · ${cap.repos} repos` });
      }
      return filterHint(dedupeById([...allRepos, ...hint])).slice(0, 12);
    }
  } catch {
    // Fall through to hint-only.
  }
  return filterHint(hint).slice(0, 12);
}

function dedupeById(items: PickCandidate[]): PickCandidate[] {
  const seen = new Set<string>();
  const out: PickCandidate[] = [];
  for (const i of items) {
    if (seen.has(i.id)) continue;
    seen.add(i.id);
    out.push(i);
  }
  return out;
}

export function ReferencePickInput({
  clarification,
  onSubmit,
  onSkip,
  onDefer,
  disabled,
  batchMode,
  onAnswerChange,
}: ClarificationInputProps) {
  const picker = clarification.reference_picker;
  const hint = useMemo<PickCandidate[]>(
    () =>
      (picker?.candidates_hint ?? []).map((c) => {
        const out: PickCandidate = { id: c.id, label: c.label };
        if (c.description) out.description = c.description;
        return out;
      }),
    [picker?.candidates_hint],
  );

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickCandidate[]>(hint);
  const [selected, setSelected] = useState<PickCandidate[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(
    (q: string) => {
      const ek = picker?.entity_kind ?? "capability";
      void searchCandidates(ek, q, hint).then(setResults);
    },
    [hint, picker?.entity_kind],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => refresh(query), 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, refresh]);

  useEffect(() => {
    refresh("");
  }, [refresh]);

  useEffect(() => {
    if (batchMode && onAnswerChange) {
      onAnswerChange(selected.length > 0 ? { references: selected.map((s) => s.id) } : null);
    }
  }, [selected, batchMode, onAnswerChange]);

  const min = picker?.min_selected ?? 1;
  const max = picker?.max_selected ?? 1;
  const multi = picker?.multi ?? false;

  const togglePick = (c: PickCandidate) => {
    setSelected((prev) => {
      const exists = prev.find((p) => p.id === c.id);
      if (exists) return prev.filter((p) => p.id !== c.id);
      if (!multi) return [c];
      if (prev.length >= max) return prev;
      return [...prev, c];
    });
  };

  const removePick = (id: string) => setSelected((prev) => prev.filter((p) => p.id !== id));

  const answer = selected.length > 0 ? { references: selected.map((s) => s.id) } : null;
  const valid = isAnswerValid(clarification, answer);

  const handleSubmit = async () => {
    if (!valid || submitting || disabled) return;
    setSubmitting(true);
    try {
      await onSubmit({ references: selected.map((s) => s.id) });
    } finally {
      setSubmitting(false);
    }
  };

  const canSkip = clarification.priority === "optional";
  const canDefer = clarification.priority !== "optional" && clarification.defer_count < 3;

  return (
    <Stack gap="3">
      <Stack gap="1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
          Pick {picker?.entity_kind ?? "reference"} ({multi ? `${min}–${max}` : "1"})
        </span>
        <Cluster gap="2" align="center" className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2">
          <Search className="size-3.5 text-[var(--text-muted)]" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${picker?.entity_kind ?? "items"}…`}
            disabled={disabled}
            className="flex-1 bg-transparent py-2 text-sm focus:outline-none"
            aria-label="Search references"
          />
        </Cluster>
      </Stack>

      {selected.length > 0 && (
        <Cluster gap="1.5" align="center">
          {selected.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-xs text-[var(--primary)]"
            >
              {s.label}
              <button
                type="button"
                onClick={() => removePick(s.id)}
                disabled={disabled}
                aria-label={`Remove ${s.label}`}
                className="text-[var(--primary)] hover:text-[var(--text)]"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </Cluster>
      )}

      {hint.length > 0 && (
        <Stack gap="1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Suggested
          </span>
          <Cluster gap="1.5">
            {hint.map((c) => {
              const isSelected = selected.some((s) => s.id === c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => togglePick(c)}
                  disabled={disabled}
                  className={cn(
                    "rounded-full border px-2.5 py-[3px] text-[11px] transition-colors",
                    isSelected
                      ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                      : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--primary)] hover:text-[var(--primary)]",
                  )}
                  data-candidate-id={c.id}
                >
                  {c.label}
                </button>
              );
            })}
          </Cluster>
        </Stack>
      )}

      <Stack gap="1" as="ul" className="max-h-44 overflow-y-auto">
        {results.length === 0 ? (
          <li className="text-xs text-[var(--text-muted)]">No matches.</li>
        ) : (
          results.map((c) => {
            const isSelected = selected.some((s) => s.id === c.id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => togglePick(c)}
                  disabled={disabled}
                  aria-pressed={isSelected}
                  className={cn(
                    "w-full rounded-md border p-2 text-left text-sm transition-colors",
                    isSelected
                      ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                      : "border-[var(--border)] hover:border-[var(--border-strong)]",
                  )}
                  data-candidate-id={c.id}
                >
                  <div className="font-medium">{c.label}</div>
                  {c.description && (
                    <div className="text-xs text-[var(--text-muted)]">{c.description}</div>
                  )}
                </button>
              </li>
            );
          })
        )}
      </Stack>

      {!batchMode && (
        <Cluster justify="between" align="center" className="flex-wrap gap-2">
          <Cluster gap="2">
            {canDefer && onDefer && (
              <Button variant="ghost" size="sm" onClick={onDefer} disabled={disabled}>
                Defer 24h
              </Button>
            )}
            {canSkip && onSkip && (
              <Button variant="ghost" size="sm" onClick={onSkip} disabled={disabled}>
                Skip
              </Button>
            )}
          </Cluster>
          <Button size="sm" onClick={handleSubmit} disabled={!valid || disabled} loading={submitting}>
            Submit
          </Button>
        </Cluster>
      )}
    </Stack>
  );
}
