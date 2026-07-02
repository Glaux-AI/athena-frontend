"use client";

/**
 * "Import from repo" - pick UI components the org's ingested code already
 * ships (buttons, cards, ...) and have Athena lift them into design-system
 * component drafts restyled onto the current draft's tokens. Pure picker: the
 * dialog appends the returned drafts via `onImported`; nothing is saved until
 * the user saves the system.
 */

import { useEffect, useMemo, useState } from "react";
import { FileCode2, Search } from "lucide-react";
import { toast } from "sonner";

import {
  ApiError,
  api,
  type DesignSystemComponentInput,
  type RepoComponentCandidate,
  type RepoFull,
} from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Cluster, Stack } from "@/components/layout/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/overlay";

import { useDebouncedValue } from "./showcase-preview";

/** The backend restyles each pick with an LLM call - cap the batch. */
const MAX_SELECTED = 8;

const candidateKey = (c: RepoComponentCandidate) => `${c.repo_id}::${c.path}`;

export function ImportComponentsDialog({
  open,
  onClose,
  repos,
  css,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  repos: RepoFull[];
  /** The draft's canonical css - sent so imports restyle onto THESE tokens. */
  css: string;
  onImported: (components: DesignSystemComponentInput[]) => void;
}) {
  const [repoId, setRepoId] = useState("");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const [items, setItems] = useState<RepoComponentCandidate[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlyMap<string, RepoComponentCandidate>>(new Map());
  const [importing, setImporting] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  // Reset per open so a stale search / selection never leaks into a new pick.
  useEffect(() => {
    if (!open) return;
    setRepoId("");
    setQuery("");
    setSelected(new Map());
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const q = debouncedQuery.trim();
    api.design
      .repoComponents({ ...(repoId ? { repoId } : {}), ...(q ? { q } : {}), limit: 50 })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTruncated(res.truncated);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : "Couldn't load components right now.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, repoId, debouncedQuery, reloadNonce]);

  const toggle = (c: RepoComponentCandidate) =>
    setSelected((prev) => {
      const key = candidateKey(c);
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < MAX_SELECTED) next.set(key, c);
      return next;
    });

  const doImport = async () => {
    const sources = [...selected.values()].map((c) => ({ repo_id: c.repo_id, path: c.path }));
    if (sources.length === 0) return;
    setImporting(true);
    try {
      const res = await api.design.importComponents({ sources, ...(css.trim() ? { css } : {}) });
      onImported(res.components);
      if (res.warnings.length > 0) toast.warning(res.warnings.join("\n"));
      toast.success(
        `Imported ${res.components.length} component${res.components.length === 1 ? "" : "s"} - review and save.`,
      );
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't import those components right now.");
    } finally {
      setImporting(false);
    }
  };

  const atCap = selected.size >= MAX_SELECTED;
  const repoName = useMemo(() => {
    const byId = new Map(repos.map((r) => [r.id, r.full_name]));
    return (id: string) => byId.get(id) ?? id;
  }, [repos]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import components from a repo"
      description="Athena lifts the picked components out of your code and restyles them onto this system's tokens."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={importing}>
            Cancel
          </Button>
          <Button
            loading={importing}
            disabled={importing || selected.size === 0}
            onClick={() => void doImport()}
          >
            Import {selected.size > 0 ? `${selected.size} ` : ""}selected
          </Button>
        </>
      }
    >
      <Stack gap="3">
        <Cluster gap="2" align="center" className="flex-wrap">
          <select
            value={repoId}
            onChange={(e) => setRepoId(e.target.value)}
            aria-label="Source repo"
            className="max-w-[220px] truncate rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          >
            <option value="">All repos</option>
            {repos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.full_name}
              </option>
            ))}
          </select>
          <label className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-subtle)]"
              aria-hidden
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search components by name or path"
              aria-label="Search repo components"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] py-1.5 pl-8 pr-3 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
          </label>
        </Cluster>

        <p aria-live="polite" className="text-[11px] text-[var(--text-subtle)]">
          {selected.size} / {MAX_SELECTED} selected
          {atCap ? " - deselect one to pick another." : ""}
        </p>

        {loading ? (
          <Stack gap="1.5" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-9 animate-pulse rounded-md bg-[var(--surface-2)]" />
            ))}
          </Stack>
        ) : error ? (
          <Stack gap="2" className="rounded-md border border-[var(--border-strong)] bg-[var(--danger-soft)] p-3">
            <p className="text-xs text-[var(--danger-ink)]">{error}</p>
            <Button size="sm" variant="secondary" onClick={() => setReloadNonce((n) => n + 1)}>
              Retry
            </Button>
          </Stack>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<FileCode2 className="size-5" />}
            title="No components found"
            description="Try another repo or search term - candidates come from the org's ingested code."
          />
        ) : (
          <Stack gap="1" as="ul" className="max-h-[320px] overflow-y-auto pr-1">
            {items.map((c) => {
              const key = candidateKey(c);
              const checked = selected.has(key);
              return (
                <li key={key}>
                  <label
                    className={
                      "flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-1.5 transition-colors " +
                      (checked
                        ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                        : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]")
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!checked && atCap}
                      onChange={() => toggle(c)}
                      className="size-3.5 accent-[var(--primary)]"
                      aria-label={`Import ${c.name} from ${c.path}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[var(--text)]">{c.name}</span>
                      <span className="block truncate font-mono text-[11px] text-[var(--text-subtle)]">
                        {repoName(c.repo_id)} · {c.path}
                      </span>
                    </span>
                    {c.language && (
                      <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
                        {c.language}
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </Stack>
        )}

        {truncated && !loading && !error && (
          <p className="text-[11px] text-[var(--text-subtle)]">
            More candidates exist than shown - narrow the search to find the rest.
          </p>
        )}
      </Stack>
    </Modal>
  );
}
