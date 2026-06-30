"use client";

/**
 * ShareThreadDialog - share a SNAPSHOT copy of a chat thread with one or
 * more teammates in the same org. The recipients each receive the copy in
 * their "Shared with me" list (+ an inbox notification) and can "Continue in
 * my chat" to import a private copy. The snapshot is frozen at share time -
 * the source thread keeps evolving independently.
 *
 * Multi-select member checklist (the shared `<MemberPicker>` is single-select)
 * + an optional note. Modal chrome mirrors `TransferOwnershipDialog`: glass
 * card over a scrim, Esc/scrim closes, Button-level progress on submit.
 */

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Check, Search, Share2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, ApiError, type Member } from "@/lib/api/client";
import { cn } from "@/lib/cn";

function initialsOf(m: Member): string {
  const base = (m.display_name || m.email || "?").trim();
  const parts = base.split(/\s+/);
  const chars = parts.length >= 2 ? parts[0]![0]! + parts[1]![0]! : base.slice(0, 2);
  return chars.toUpperCase();
}

export function ShareThreadDialog({
  threadId,
  orgId,
  currentUserId,
  threadTitle,
  onClose,
  onShared,
}: {
  threadId: string;
  orgId: string;
  /** Excluded from the recipient list - you can't share with yourself. */
  currentUserId: string;
  /** Shown in the header so the user knows what they're sharing. */
  threadTitle: string;
  onClose: () => void;
  onShared: (recipientCount: number) => void;
}) {
  const titleId = useId();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    api.members
      .list(orgId)
      .then((rows) => {
        if (alive) setMembers(rows.filter((m) => !m.deactivated_at && m.user_id !== currentUserId));
      })
      .catch((e) => {
        if (alive) setLoadError(e instanceof ApiError ? e.message : "Could not load teammates.");
      });
    return () => {
      alive = false;
    };
  }, [orgId, currentUserId]);

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, submitting]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = members ?? [];
    if (!q) return rows;
    return rows.filter(
      (m) => m.display_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
    );
  }, [members, query]);

  const toggle = (userId: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });

  const handleShare = useCallback(async () => {
    if (submitting || selected.size === 0) return;
    setSubmitting(true);
    try {
      await api.chat.shareThread(threadId, {
        recipient_user_ids: [...selected],
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      onShared(selected.size);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not share this chat.");
      setSubmitting(false);
    }
  }, [note, onShared, selected, submitting, threadId]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4 backdrop-blur-sm"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <Card
        variant="glass"
        className="flex max-h-[80vh] w-full max-w-lg flex-col shadow-[var(--shadow-3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <Stack gap="4">
          <Stack gap="1">
            <Cluster gap="2" align="center">
              <Share2 className="size-4 text-[var(--primary)]" aria-hidden />
              <span id={titleId} className="text-base font-semibold">
                Share this chat
              </span>
            </Cluster>
            <p className="text-xs text-[var(--text-muted)]">
              Send teammates a snapshot copy of{" "}
              <span className="font-medium text-[var(--text)]">{threadTitle}</span> up to now.
              They continue in their own chat - your conversation stays separate.
            </p>
          </Stack>

          {/* Search */}
          <div className="flex h-9 items-center gap-2 rounded-lg bg-[var(--surface-2)] px-2.5 focus-within:ring-2 focus-within:ring-[var(--ring)]">
            <Search className="size-3.5 shrink-0 text-[var(--text-subtle)]" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search teammates"
              aria-label="Search teammates"
              className="input-bare min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-subtle)]"
            />
          </div>

          {/* Member checklist */}
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-[var(--border)]">
            {loadError ? (
              <p role="alert" className="px-3 py-6 text-center text-xs text-[var(--danger-ink)]">
                {loadError}
              </p>
            ) : members === null ? (
              <div className="space-y-1.5 p-2" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-9 animate-pulse rounded-md bg-[var(--surface-2)]" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-[var(--text-muted)]">
                {(members ?? []).length === 0
                  ? "No teammates in this org yet."
                  : "No teammates match your search."}
              </p>
            ) : (
              <ul className="p-1">
                {filtered.map((m) => {
                  const on = selected.has(m.user_id);
                  return (
                    <li key={m.user_id}>
                      <button
                        type="button"
                        onClick={() => toggle(m.user_id)}
                        aria-pressed={on}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                          on ? "bg-[var(--primary-soft)]" : "hover:bg-[var(--surface-2)]",
                        )}
                      >
                        <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--surface-3)] text-[10px] font-semibold text-[var(--text-muted)]">
                          {m.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.avatar_url} alt="" className="size-full object-cover" />
                          ) : (
                            initialsOf(m)
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-[var(--text)]">
                            {m.display_name || m.email}
                          </span>
                          <span className="block truncate text-[11px] text-[var(--text-subtle)]">
                            {m.email}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "grid size-4 shrink-0 place-items-center rounded border transition-colors",
                            on
                              ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-fg)]"
                              : "border-[var(--border)]",
                          )}
                          aria-hidden
                        >
                          {on && <Check className="size-3" />}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Note */}
          <Stack gap="1.5">
            <label htmlFor={`${titleId}-note`} className="text-xs font-medium text-[var(--text-muted)]">
              Add a note <span className="text-[var(--text-subtle)]">(optional)</span>
            </label>
            <textarea
              id={`${titleId}-note`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="What should they look at?"
              disabled={submitting}
              className="input-bare resize-none rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            />
          </Stack>

          <Cluster justify="between" align="center" gap="2">
            <span className="text-xs text-[var(--text-subtle)]">
              {selected.size > 0
                ? `${selected.size} recipient${selected.size === 1 ? "" : "s"} selected`
                : "Select teammates"}
            </span>
            <Cluster gap="2">
              <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
                <X className="size-3.5" /> Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleShare()}
                disabled={submitting || selected.size === 0}
                loading={submitting}
              >
                <Share2 className="size-3.5" /> Share
              </Button>
            </Cluster>
          </Cluster>
        </Stack>
      </Card>
    </div>
  );
}
