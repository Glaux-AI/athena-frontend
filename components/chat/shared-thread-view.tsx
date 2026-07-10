"use client";

/**
 * SharedThreadView - read-only render of a shared snapshot (the conversation
 * a teammate shared, frozen up to the share moment) with a "Continue in my
 * chat" CTA that imports a private OWNED copy. Reuses `<ChatMessage>` with
 * its interactive affordances disabled (no edit / pin / proposal actions).
 */

import { ArrowLeft, MessageSquarePlus } from "lucide-react";

import { type SharedThreadDetail } from "@/lib/api/client";
import { ChatMessage } from "@/components/chat/chat-message";
import { type CitationSource } from "@/components/runs/citations/citation-chip";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils/format";

const NOOP = () => {};

export function SharedThreadView({
  share,
  importing,
  onImport,
  onClose,
  onCitationOpen,
}: {
  share: SharedThreadDetail;
  importing: boolean;
  onImport: () => void;
  onClose: () => void;
  onCitationOpen: (source: CitationSource, ref: string, label?: string) => void;
}) {
  const alreadyImported = share.status === "imported" && !!share.imported_thread_id;

  return (
    <div className="flex h-full flex-col">
      {/* Banner - glass chrome closed by a horizon hairline. */}
      <div className="glass-chrome relative px-4 py-3 sm:px-6">
        <hr className="hr-horizon absolute inset-x-0 bottom-0" aria-hidden />
        <div className="mx-auto flex max-w-3xl flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="mb-1 inline-flex items-center gap-1 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <ArrowLeft className="size-3.5" /> Back to my chats
            </button>
            <h1 className="line-clamp-1 text-base font-semibold text-[var(--text)]" title={share.title}>
              {share.title}
            </h1>
            <p className="mt-0.5 text-xs text-[var(--text-subtle)]">
              Shared by <span className="font-medium text-[var(--text-muted)]">{share.shared_by}</span>{" "}
              on {formatDateTime(share.created_at)} · {share.scope.label} · read-only
            </p>
            {share.note && (
              <p className="mt-2 max-w-prose rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)]">
                {share.note}
              </p>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            onClick={onImport}
            loading={importing}
            disabled={importing}
          >
            <MessageSquarePlus className="size-3.5" />
            {alreadyImported ? "Open my copy" : "Continue in my chat"}
          </Button>
        </div>
      </div>

      {/* Read-only transcript */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {share.messages.map((m) => (
            <ChatMessage
              key={m.id}
              message={m}
              onCitationOpen={onCitationOpen}
              onEdit={NOOP}
              editDisabled
              onPickClarification={NOOP}
              cardsDisabled
            />
          ))}
        </div>
      </div>
    </div>
  );
}
