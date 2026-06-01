"use client";

/**
 * ChatThreadRail — the collapsible left rail of the /chat page.
 *
 * Lists the user's threads (active highlight, scope + flavour badge, preview,
 * a "task created" pill), filters them with a search box, and starts a new
 * chat scoped to the org or a specific capability. Each row carries an
 * overflow menu to rename (inline) or delete (with an inline confirm). In demo
 * mode the write actions are hidden — the list stays browsable. Tokens-only.
 */

import { useState } from "react";
import {
  Check,
  ChevronDown,
  FileText,
  Hammer,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { type Capability, type ChatThread } from "@/lib/api/client";
import { cn } from "@/lib/cn";

const FLAVOUR_META: Record<NonNullable<ChatThread["flavour"]>, { label: string; tone: string }> = {
  prd_framing: { label: "PRD", tone: "bg-[var(--info-soft)] text-[var(--info)]" },
  bug_investigation: { label: "Bug", tone: "bg-[var(--warning-soft)] text-[var(--warning)]" },
  codebase_qa: { label: "Q&A", tone: "bg-[var(--surface-3)] text-[var(--text-muted)]" },
  architecture: { label: "Arch", tone: "bg-[var(--primary-soft)] text-[var(--primary)]" },
  knowledge_lookup: { label: "Lookup", tone: "bg-[var(--success-soft)] text-[var(--success)]" },
};

export interface NewChatScope {
  scope_kind: "org" | "capability";
  scope_id?: string;
}

export function ChatThreadRail({
  threads,
  activeId,
  capabilities,
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
  capabilities: Capability[];
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
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <span className="text-sm font-semibold">Chats</span>
        <div className="flex items-center gap-0.5">
          {!readOnly && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setScopeOpen((v) => !v)}
                disabled={creating}
                aria-label="New chat"
                aria-expanded={scopeOpen}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:opacity-60"
              >
                <Plus className="size-4" />
                <ChevronDown className="size-3" />
              </button>
              {scopeOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setScopeOpen(false)} aria-hidden />
                  <div className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg">
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                      New chat in…
                    </div>
                    <button
                      type="button"
                      onClick={() => startNew({ scope_kind: "org" })}
                      className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--surface-2)]"
                    >
                      Org-wide
                    </button>
                    {capabilities.length > 0 && (
                      <div className="mt-1 max-h-56 overflow-y-auto border-t border-[var(--border)] pt-1">
                        {capabilities.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => startNew({ scope_kind: "capability", scope_id: c.id })}
                            className="block w-full truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--surface-2)]"
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
            className="inline-flex size-7 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          >
            <PanelLeftClose className="size-4" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5">
          <Search className="size-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="text-[var(--text-muted)] hover:text-[var(--text)]">
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
            const flavour = t.flavour ? FLAVOUR_META[t.flavour] : null;
            if (renamingId === t.id) {
              return (
                <div key={t.id} className="mb-0.5 px-1">
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
                    className="w-full rounded-md border border-[var(--ring)] bg-[var(--surface)] px-2 py-1.5 text-sm outline-none ring-2 ring-[var(--ring)]"
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
                    "mb-0.5 block w-full rounded-md px-2.5 py-2 text-left transition-colors",
                    active ? "bg-[var(--primary-soft)]" : "hover:bg-[var(--surface-2)]",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div
                      className={cn(
                        "line-clamp-1 pr-5 text-sm font-medium",
                        active ? "text-[var(--primary)]" : "text-[var(--text)]",
                      )}
                    >
                      {t.title}
                    </div>
                    {flavour && (
                      <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider", flavour.tone)}>
                        {flavour.label}
                      </span>
                    )}
                  </div>
                  {t.preview && <div className="mt-0.5 line-clamp-1 text-xs text-[var(--text-muted)]">{t.preview}</div>}
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
                    <span className="truncate">{t.scope.label}</span>
                    <span aria-hidden>·</span>
                    <span className="shrink-0">{t.updated_at}</span>
                    {t.created_task && (
                      <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--success-soft)] px-1.5 py-0.5 font-semibold normal-case tracking-normal text-[var(--success)]">
                        {t.created_task.kind === "prd" ? <FileText className="size-2.5" /> : <Hammer className="size-2.5" />}
                        Task
                      </span>
                    )}
                  </div>
                </button>

                {/* Overflow menu trigger */}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => setMenuFor(menuFor === t.id ? null : t.id)}
                    aria-label="Chat options"
                    className={cn(
                      "absolute right-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]",
                      menuFor === t.id ? "opacity-100" : "opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100",
                    )}
                  >
                    <MoreHorizontal className="size-3.5" />
                  </button>
                )}

                {menuFor === t.id && !readOnly && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => { setMenuFor(null); setConfirmDeleteId(null); }} aria-hidden />
                    <div className="absolute right-1.5 top-8 z-20 w-44 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg">
                      {confirmDeleteId === t.id ? (
                        <div className="p-1">
                          <p className="px-1 pb-1.5 text-xs text-[var(--text-muted)]">Delete this chat?</p>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => { setMenuFor(null); setConfirmDeleteId(null); }}
                              className="flex-1 rounded-md px-2 py-1 text-xs hover:bg-[var(--surface-2)]"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => { onDelete(t.id); setMenuFor(null); setConfirmDeleteId(null); }}
                              className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-[var(--danger)] px-2 py-1 text-xs font-medium text-white hover:opacity-90"
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
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--surface-2)]"
                          >
                            <Pencil className="size-3.5 text-[var(--text-muted)]" /> Rename
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(t.id)}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--danger)] hover:bg-[var(--danger-soft)]"
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
