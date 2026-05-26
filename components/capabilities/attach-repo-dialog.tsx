"use client";

/**
 * AttachRepoDialog — multi-select repo picker for the `/capabilities/[id]`
 * Repos tab.
 *
 * Flow (§5.29.11 / S7.7):
 *   1. Resolve the org's GitHub integrations via `api.integrations.list`.
 *      Filter to `provider === "github"`. Auto-select if exactly one
 *      connected; show a picker if multiple; show an empty-state CTA to
 *      `/settings/integrations` when none.
 *   2. Fetch attachable repos via `api.integrations.listAvailableRepos`
 *      (B7.4 endpoint).
 *   3. Already-attached entries are visible but the checkbox is disabled
 *      with an "Attached" badge, so the user sees the whole picture
 *      rather than wondering where their previous attaches went.
 *   4. Substring filter on `full_name` (case-insensitive). Sorts archived
 *      to the bottom; surfaces `pushed_at` as a hint.
 *   5. The user ticks N repos and submits via the footer "Attach N
 *      repos" button. Each `attachRepo` call fires in parallel
 *      (Promise.allSettled), the BE auto-enqueues the first ingest per
 *      row (B7.3), and the dialog closes with a toast summarising
 *      successes / failures. Selection survives filter changes.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, GitBranch, Loader2, Lock, Search, X } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import {
  api,
  ApiError,
  type AvailableRepo,
  type CapabilityRepo,
  type Integration,
} from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Cluster, Stack } from "@/components/layout/primitives";
import { useSession } from "@/lib/session/SessionProvider";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  capabilityId: string;
  /** Repos already attached to this capability — keyed by `repo_full_name`
   * so we can render an "Attached" badge instead of letting the user
   * attempt a duplicate attach (which would 409 from the BE). */
  attachedRepos: CapabilityRepo[];
  /** Called after each successful attach so the parent can refresh its
   * `repos` state. Multiple calls during one dialog session are expected. */
  onAttached: () => Promise<void> | void;
}

export function AttachRepoDialog({
  open,
  onOpenChange,
  capabilityId,
  attachedRepos,
  onAttached,
}: Props) {
  const { activeOrgId } = useSession();
  const [integrations, setIntegrations] = useState<Integration[] | null>(null);
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string | null>(null);
  const [available, setAvailable] = useState<AvailableRepo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  /* Multi-select state: full_names the user has ticked but not yet
   * submitted. Reset on close so reopening the dialog starts clean. */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  /* Resolve eligible integrations on open. */
  useEffect(() => {
    if (!open || !activeOrgId) return;
    let cancelled = false;
    setIntegrations(null);
    setLoadError(null);
    (async () => {
      try {
        const all = await api.integrations.list(activeOrgId);
        if (cancelled) return;
        const github = all.filter((i) => i.provider === "github");
        setIntegrations(github);
        if (github.length === 1 && github[0]) {
          setSelectedIntegrationId(github[0].id);
        } else if (github.length === 0) {
          setSelectedIntegrationId(null);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof ApiError ? e.message : "Couldn't load integrations.");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [open, activeOrgId]);

  /* Fetch available repos when an integration is selected. */
  useEffect(() => {
    if (!open || !activeOrgId || !selectedIntegrationId) {
      setAvailable(null);
      return;
    }
    let cancelled = false;
    setAvailable(null);
    setLoadError(null);
    (async () => {
      try {
        const repos = await api.integrations.listAvailableRepos(activeOrgId, selectedIntegrationId);
        if (!cancelled) setAvailable(repos);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof ApiError ? e.message : "Couldn't load repos from this integration.");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [open, activeOrgId, selectedIntegrationId]);

  const attachedSet = useMemo(
    () => new Set(attachedRepos.map((r) => r.repo_full_name)),
    [attachedRepos],
  );

  const filteredAvailable = useMemo(() => {
    if (!available) return null;
    const q = query.trim().toLowerCase();
    const matched = q
      ? available.filter((r) => r.full_name.toLowerCase().includes(q))
      : available;
    return [...matched].sort((a, b) => {
      if (a.archived !== b.archived) return a.archived ? 1 : -1;
      return (b.pushed_at ?? "").localeCompare(a.pushed_at ?? "");
    });
  }, [available, query]);

  /* Reset selection whenever the dialog closes or the source integration
   * changes — prevents a stale tick from a previous session sneaking
   * into the next batch. */
  useEffect(() => {
    if (!open) setSelected(new Set());
  }, [open]);
  useEffect(() => {
    setSelected(new Set());
  }, [selectedIntegrationId]);

  const toggleSelected = useCallback((fullName: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fullName)) next.delete(fullName);
      else next.add(fullName);
      return next;
    });
  }, []);

  const submitAttach = useCallback(async () => {
    if (!selectedIntegrationId || selected.size === 0 || !available) return;
    const targets = available.filter((r) => selected.has(r.full_name));
    setSubmitting(true);
    const results = await Promise.allSettled(
      targets.map((repo) => api.capabilities.attachRepo(capabilityId, {
        integration_id: selectedIntegrationId,
        repo_full_name: repo.full_name,
        default_branch: repo.default_branch,
      })),
    );
    setSubmitting(false);
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - ok;
    if (ok > 0) {
      const noun = ok === 1 ? "repo" : "repos";
      const tail = failed > 0 ? ` (${failed} failed)` : "";
      toast.success(`Attached ${ok} ${noun}${tail}.`);
    } else if (failed > 0) {
      const first = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
      const reason = first?.reason;
      toast.error(reason instanceof ApiError ? reason.message : "Couldn't attach repos.");
    }
    await onAttached();
    onOpenChange(false);
  }, [capabilityId, selectedIntegrationId, selected, available, onAttached, onOpenChange]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--overlay)] backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(720px,calc(100vh-2rem))] w-[min(720px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl focus:outline-none"
          aria-describedby="attach-repo-desc"
        >
          <Stack gap="3" className="border-b border-[var(--border)] p-5">
            <Cluster justify="between" align="center">
              <Dialog.Title className="text-lg font-semibold">Attach a repo</Dialog.Title>
              <Dialog.Close className="text-[var(--text-muted)] hover:text-[var(--text)]" aria-label="Close">
                <X className="size-4" />
              </Dialog.Close>
            </Cluster>
            <Dialog.Description id="attach-repo-desc" className="text-sm text-[var(--text-muted)]">
              Pick a repo from your connected GitHub integration. Athena
              will start indexing it immediately — the row appears in the
              Repos tab with a live progress chip.
            </Dialog.Description>
            <IntegrationSelector
              integrations={integrations}
              selectedId={selectedIntegrationId}
              onSelect={setSelectedIntegrationId}
            />
            {selectedIntegrationId && (
              <SearchInput value={query} onChange={setQuery} />
            )}
          </Stack>
          <div className="min-h-[200px] flex-1 overflow-y-auto p-2">
            <RepoListBody
              loadError={loadError}
              integrations={integrations}
              selectedIntegrationId={selectedIntegrationId}
              filteredAvailable={filteredAvailable}
              attachedSet={attachedSet}
              selected={selected}
              submitting={submitting}
              onToggle={toggleSelected}
            />
          </div>
          <DialogFooter
            selectedCount={selected.size}
            submitting={submitting}
            onCancel={() => onOpenChange(false)}
            onSubmit={() => void submitAttach()}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DialogFooter({
  selectedCount,
  submitting,
  onCancel,
  onSubmit,
}: {
  selectedCount: number;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const label = selectedCount === 0
    ? "Attach"
    : `Attach ${selectedCount} ${selectedCount === 1 ? "repo" : "repos"}`;
  return (
    <Cluster justify="between" align="center" className="border-t border-[var(--border)] p-3">
      <span className="text-xs text-[var(--text-muted)]">
        {selectedCount === 0
          ? "Pick one or more repos. Each one queues an ingest job."
          : `${selectedCount} selected · jobs queued and processed one by one.`}
      </span>
      <Cluster gap="2" align="center">
        <Button variant="ghost" onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button onClick={onSubmit} disabled={submitting || selectedCount === 0}>
          {submitting ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
          {submitting ? "Queueing…" : label}
        </Button>
      </Cluster>
    </Cluster>
  );
}

/* ---------------------------------------------------------- Sub-components */

function IntegrationSelector({
  integrations,
  selectedId,
  onSelect,
}: {
  integrations: Integration[] | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (integrations === null) {
    return <div className="h-9 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />;
  }
  if (integrations.length === 0) {
    return (
      <Card className="border-[var(--border-strong)] bg-[var(--surface-2)]">
        <Stack gap="2">
          <p className="text-sm text-[var(--text-muted)]">
            No GitHub integration is connected yet. Connect one from{" "}
            <Link href="/settings/integrations" className="underline">
              Settings → Integrations
            </Link>{" "}
            and reopen this dialog.
          </p>
        </Stack>
      </Card>
    );
  }
  if (integrations.length === 1) {
    const i = integrations[0]!;
    return (
      <Cluster gap="2" align="center">
        <span className="text-xs uppercase tracking-wider text-[var(--text-subtle)]">Source</span>
        <code className="rounded bg-[var(--surface-2)] px-2 py-0.5 font-mono text-xs">
          {(i.config?.["account_login"] as string | undefined) ?? "github"}
        </code>
      </Cluster>
    );
  }
  return (
    <Cluster gap="2" align="center">
      <label className="text-xs uppercase tracking-wider text-[var(--text-subtle)]" htmlFor="attach-integ-select">
        Source
      </label>
      <select
        id="attach-integ-select"
        value={selectedId ?? ""}
        onChange={(e) => onSelect(e.target.value)}
        className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <option value="" disabled>Choose integration…</option>
        {integrations.map((i) => (
          <option key={i.id} value={i.id}>
            {(i.config?.["account_login"] as string | undefined) ?? i.id}
          </option>
        ))}
      </select>
    </Cluster>
  );
}

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Filter by name…"
        className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] py-1.5 pl-8 pr-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      />
    </div>
  );
}

function RepoListBody({
  loadError,
  integrations,
  selectedIntegrationId,
  filteredAvailable,
  attachedSet,
  selected,
  submitting,
  onToggle,
}: {
  loadError: string | null;
  integrations: Integration[] | null;
  selectedIntegrationId: string | null;
  filteredAvailable: AvailableRepo[] | null;
  attachedSet: Set<string>;
  selected: Set<string>;
  submitting: boolean;
  onToggle: (fullName: string) => void;
}) {
  if (loadError) {
    return <p className="p-3 text-sm text-[var(--danger)]">{loadError}</p>;
  }
  if (integrations !== null && integrations.length === 0) {
    return null;
  }
  if (!selectedIntegrationId) {
    return <p className="p-3 text-sm text-[var(--text-muted)]">Choose an integration above to see attachable repos.</p>;
  }
  if (filteredAvailable === null) {
    return (
      <Stack gap="1" className="p-2" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-md bg-[var(--surface-2)]" />
        ))}
      </Stack>
    );
  }
  if (filteredAvailable.length === 0) {
    return <p className="p-3 text-sm text-[var(--text-muted)]">No repos available for this integration.</p>;
  }
  return (
    <ul className="divide-y divide-[var(--border)]">
      {filteredAvailable.map((r) => (
        <RepoRow
          key={r.full_name}
          repo={r}
          alreadyAttached={attachedSet.has(r.full_name)}
          isSelected={selected.has(r.full_name)}
          disabled={submitting}
          onToggle={() => onToggle(r.full_name)}
        />
      ))}
    </ul>
  );
}

function RepoRow({
  repo,
  alreadyAttached,
  isSelected,
  disabled,
  onToggle,
}: {
  repo: AvailableRepo;
  alreadyAttached: boolean;
  isSelected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const unselectable = alreadyAttached || repo.archived || disabled;
  return (
    <li>
      <label
        className={
          "flex cursor-pointer items-center justify-between gap-3 px-3 py-2 transition-colors hover:bg-[var(--surface-2)]"
          + (unselectable ? " cursor-not-allowed opacity-70 hover:bg-transparent" : "")
          + (isSelected ? " bg-[var(--primary-soft)]" : "")
        }
      >
        <Cluster gap="3" align="center" className="min-w-0 flex-1">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggle}
            disabled={unselectable}
            className="size-4 shrink-0 accent-[var(--primary)] disabled:opacity-50"
            aria-label={`Select ${repo.full_name}`}
          />
          <GitBranch className="size-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
          <Stack gap="0" className="min-w-0">
            <Cluster gap="2" align="center">
              <code className="truncate font-mono text-sm font-semibold">{repo.full_name}</code>
              {repo.private && <Lock className="size-3 text-[var(--text-subtle)]" aria-label="Private" />}
              {repo.archived && (
                <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  Archived
                </span>
              )}
            </Cluster>
            <span className="truncate text-xs text-[var(--text-muted)]">
              {repo.default_branch}
              {repo.pushed_at ? ` · pushed ${new Date(repo.pushed_at).toLocaleDateString()}` : ""}
              {repo.description ? ` · ${repo.description}` : ""}
            </span>
          </Stack>
        </Cluster>
        {alreadyAttached && (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-[var(--success)]">
            <CheckCircle2 className="size-3.5" aria-hidden />
            Attached
          </span>
        )}
      </label>
    </li>
  );
}
