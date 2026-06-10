"use client";

/**
 * ChatThreadRail — the collapsible left rail of the /chat page.
 *
 * Quiet chrome: a plain header with ghost actions, a borderless search field,
 * and two-line thread rows (title + scope · relative time) — the active row
 * carries only a soft accent tint. Starts a new chat scoped to the org or a
 * specific domain via the + popover. Each row carries an overflow menu to
 * rename (inline) or delete (with an inline confirm). In demo mode the write
 * actions are hidden — the list stays browsable. Tokens-only.
 */

import { useState } from "react";
import {
  Check,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { type Domain, type ChatThread } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatRelativeTime } from "@/lib/utils/format";

export interface NewChatScope {
  scope_kind: "org" | "domain";
  scope_id?: string;
}

/** Threads are created with the "New chat" placeholder title and only
 *  sometimes renamed — fall back to the first-message preview so rows (and
 *  the conversation header) stay distinguishable. */
export function threadDisplayTitle(t: ChatThread): string {
  return t.title === "New chat" && t.preview.trim() ? t.preview : t.title;
}

export function ChatThreadRail({
  threads,
  activeId,
  domains,
  creating,
  readOnly,
  onSelect,
  onToggleCollapsed,
  onNew,
  onRename,
  onDelete,
}: {
  threads: ChatThread[];
  activeId: string | null;
  domains: Domain[];
  creating: boolean;
  readOnly: boolean;
  onSelect: (id: string) => void;
  onToggleCollapsed: () => void;
  onNew: (scope: NewChatScope) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [scopeOpen, setScopeOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? threads.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.preview.toLowerCase().includes(q) ||
          t.scope.label.toLowerCase().includes(q),
      )
    : threads;

  const startNew = (scope: NewChatScope) => {
    setScopeOpen(false);
    onNew(scope);
  };

  const commitRename = (id: string) => {
    const next = renameDraft.trim();
    if (next) onRename(id, next);
    setRenamingId(null);
  };

  return (
    <aside className="flex h-full w-72 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-3.5">
        <h2 className="text-sm font-semibold tracking-tight">Chats</h2>
        <div className="flex items-center gap-0.5">
          {!readOnly && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setScopeOpen((v) => !v)}
                disabled={creating}
                aria-label="New chat"
                aria-expanded={scopeOpen}
                title="New chat"
                className="inline-flex size-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60"
              >
                <Plus className="size-4" />
              </button>
              {scopeOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setScopeOpen(false)} aria-hidden />
                  <div className="glass absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-xl p-1 shadow-[var(--shadow-3)]">
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                      New chat in…
                    </div>
                    <button
                      type="button"
                      onClick={() => startNew({ scope_kind: "org" })}
                      className="block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    >
                      Org-wide
                    </button>
                    {domains.length > 0 && (
                      <div className="mt-1 max-h-56 overflow-y-auto border-t border-[var(--border)] pt-1">
                        {domains.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => startNew({ scope_kind: "domain", scope_id: c.id })}
                            className="block w-full truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                            title={c.name}
                          >
                            {c.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="inline-flex size-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <PanelLeftClose className="size-4" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="flex h-8 items-center gap-2 rounded-lg bg-[var(--surface-2)] px-2.5 transition-shadow focus-within:ring-2 focus-within:ring-[var(--ring)]">
          <Search className="size-3.5 shrink-0 text-[var(--text-subtle)]" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="input-bare min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-subtle)]"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="text-[var(--text-muted)] transition-colors hover:text-[var(--text)]">
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-[var(--text-muted)]">
            {threads.length === 0 ? "No chats yet." : "No chats match your search."}
          </p>
        ) : (
          filtered.map((t) => {
            const active = t.id === activeId;
            if (renamingId === t.id) {
              return (
                <div key={t.id} className="mb-0.5 px-0.5">
                  <input
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(t.id);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onBlur={() => commitRename(t.id)}
                    aria-label="Rename chat"
                    className="input-bare w-full rounded-lg border border-[var(--ring)] bg-[var(--surface)] px-2 py-1.5 text-sm outline-none ring-1 ring-[var(--ring)]"
                  />
                </div>
              );
            }
            return (
              <div key={t.id} className="group/row relative">
                <button
                  type="button"
                  onClick={() => onSelect(t.id)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "mb-0.5 block w-full rounded-lg px-2.5 py-2 text-left transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                    active ? "bg-[var(--primary-soft)]" : "hover:bg-[var(--surface-2)]",
                  )}
                >
                  <div className="line-clamp-1 pr-6 text-[13px] font-medium text-[var(--text)]" title={threadDisplayTitle(t)}>
                    {threadDisplayTitle(t)}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--text-subtle)]">
                    <span className="truncate">{t.scope.label}</span>
                    <span aria-hidden>·</span>
                    <span className="shrink-0">{formatRelativeTime(t.updated_at)}</span>
                  </div>
                </button>

                {/* Overflow menu trigger */}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => setMenuFor(menuFor === t.id ? null : t.id)}
                    aria-label="Chat options"
                    className={cn(
                      "absolute right-1.5 top-2 inline-flex size-6 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text)]",
                      menuFor === t.id ? "opacity-100" : "opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100",
                    )}
                  >
                    <MoreHorizontal className="size-3.5" />
                  </button>
                )}

                {menuFor === t.id && !readOnly && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => { setMenuFor(null); setConfirmDeleteId(null); }} aria-hidden />
                    <div className="glass absolute right-1.5 top-8 z-20 w-44 overflow-hidden rounded-xl p-1 shadow-[var(--shadow-3)]">
                      {confirmDeleteId === t.id ? (
                        <div className="p-1">
                          <p className="px-1 pb-1.5 text-xs text-[var(--text-muted)]">Delete this chat?</p>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => { setMenuFor(null); setConfirmDeleteId(null); }}
                              className="flex-1 rounded-md px-2 py-1 text-xs transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => { onDelete(t.id); setMenuFor(null); setConfirmDeleteId(null); }}
                              className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-[var(--danger)] px-2 py-1 text-xs font-medium text-[var(--danger-fg)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                            >
                              <Check className="size-3" /> Delete
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => { setRenamingId(t.id); setRenameDraft(t.title); setMenuFor(null); }}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                          >
                            <Pencil className="size-3.5 text-[var(--text-muted)]" /> Rename
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(t.id)}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--danger-ink)] transition-colors hover:bg-[var(--danger-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                          >
                            <Trash2 className="size-3.5" /> Delete
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
