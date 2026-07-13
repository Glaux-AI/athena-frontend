"use client";

/**
 * LibraryBrowser - the /library browse surface: URL-backed scope/format filters
 * + search, a single-column list of artifacts, a "New artifact" flow, and a
 * right-side glass-sheet preview drawer (deep-linked via ?artifact=). Nightglass
 * L0 (dense data): tokens only, content-shaped skeletons, empty/error states.
 */

import { useCallback, useEffect, useState } from "react";
import { Code2, File as FileIcon, FileText, Image as ImageIcon, Link2, Plus, Search } from "lucide-react";

import { CreateArtifactDialog } from "@/components/library/create-artifact-dialog";
import { ArtifactDrawer } from "@/components/library/artifact-drawer";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useUrlParam, useTabParam } from "@/hooks/use-url-state";
import { formatDateTime } from "@/lib/utils/format";
import {
  ApiError,
  api,
  type ArtifactFormat,
  type ArtifactListParams,
  type ArtifactSummary,
} from "@/lib/api/client";

const SCOPES = ["all", "org", "domain", "personal"] as const;
type ScopeTab = (typeof SCOPES)[number];

const FORMAT_ICON: Record<ArtifactFormat, typeof FileText> = {
  doc: FileText,
  html: Code2,
  image: ImageIcon,
  file: FileIcon,
  link: Link2,
};

export function LibraryBrowser() {
  const [scope, setScope] = useTabParam<ScopeTab>("scope", "all", SCOPES);
  const [q, setQ] = useUrlParam("q");
  const [selected, setSelected] = useUrlParam("artifact");
  const [creating, setCreating] = useState(false);

  const [items, setItems] = useState<ArtifactSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params: ArtifactListParams = {};
      if (scope !== "all") params.scope = scope;
      if (q) params.q = q;
      const res = await api.artifacts.list(params);
      setItems(res.items);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load the Library.");
      setItems([]);
    }
  }, [scope, q]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  return (
    <div className="mx-auto flex w-full max-w-screen-lg flex-col gap-5 py-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text)]">Library</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Your org&apos;s saved artifacts - docs, files, HTML, and links.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-1.5 size-4" aria-hidden /> New artifact
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <ScopeTabs value={scope} onChange={setScope} />
        <SearchBox value={q ?? ""} onChange={(v) => setQ(v || null, { replace: true })} />
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items === null ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-6 text-[var(--text-subtle)]" aria-hidden />}
          title="Nothing here yet"
          description="Save a document, upload a file, or link something to get started."
          action={<Button onClick={() => setCreating(true)}>New artifact</Button>}
        />
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border-soft)] overflow-hidden rounded-xl border border-[var(--border)]">
          {items.map((a) => (
            <ArtifactRow key={a.id} artifact={a} onOpen={() => setSelected(a.display_id)} />
          ))}
        </ul>
      )}

      <CreateArtifactDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(a) => {
          void load();
          setSelected(a.display_id);
        }}
      />

      {selected && (
        <ArtifactDrawer
          refId={selected}
          onClose={() => setSelected(null)}
          onDeleted={() => {
            setSelected(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function ArtifactRow({ artifact, onOpen }: { artifact: ArtifactSummary; onOpen: () => void }) {
  const Icon = FORMAT_ICON[artifact.format];
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <Icon className="size-4 shrink-0 text-[var(--text-subtle)]" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm text-[var(--text)]">{artifact.title}</span>
            <span className="text-micro font-mono text-[var(--text-subtle)]">{artifact.display_id}</span>
          </span>
          {artifact.summary && (
            <span className="mt-0.5 block truncate text-xs text-[var(--text-muted)]">{artifact.summary}</span>
          )}
        </span>
        <ScopeBadge scope={artifact.scope} />
        <span className="hidden shrink-0 text-micro text-[var(--text-subtle)] sm:block">
          {formatDateTime(artifact.updated_at)}
        </span>
      </button>
    </li>
  );
}

function ScopeBadge({ scope }: { scope: string }) {
  const label = scope === "personal" ? "Only me" : scope === "task" ? "Task" : scope;
  return (
    <span className="shrink-0 rounded-full bg-[var(--surface-3)] px-2 py-0.5 text-micro capitalize text-[var(--text-muted)]">
      {label}
    </span>
  );
}

function ScopeTabs({ value, onChange }: { value: ScopeTab; onChange: (v: ScopeTab) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-0.5">
      {SCOPES.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={
            value === s
              ? "rounded-md bg-[var(--surface-3)] px-3 py-1 text-sm capitalize text-[var(--text)]"
              : "rounded-md px-3 py-1 text-sm capitalize text-[var(--text-muted)] hover:text-[var(--text)]"
          }
        >
          {s === "all" ? "All" : s === "personal" ? "Only me" : s}
        </button>
      ))}
    </div>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <form
      className="relative flex-1"
      onSubmit={(e) => {
        e.preventDefault();
        onChange(draft.trim());
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-subtle)]" aria-hidden />
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Search the Library…"
        aria-label="Search the Library"
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] py-2 pl-9 pr-3 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
      />
    </form>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton h-14 w-full rounded-xl" />
      ))}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] py-10">
      <p className="text-sm text-[var(--text-muted)]">{message}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
