"use client";

/**
 * ChatMessage - one row in the conversation. Single home for the bubble
 * rendering both chat surfaces used to duplicate.
 *
 * Assistant turns render full-width (no bubble) so code, tables, and mermaid
 * diagrams get the column's full readable width; the answer leads, with
 * citations, inline cards (clarification / scope ladder), a collapsed tool
 * recap, and the usage footer underneath. A copy action surfaces on hover
 * next to the agent name. User turns are a quiet right-aligned bubble with a
 * hover-revealed Edit affordance. `task_created` and `system` rows render as
 * centered horizon dividers (.hr-horizon-star + an eyebrow label). Tokens-only.
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Copy, Info, Pencil, Sparkles, Star } from "lucide-react";

import {
  type ChatCitation,
  type ChatMessage as ChatMessageT,
  type TaskProposalPayload,
} from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { ActorAvatar } from "@/components/mascot/actor-avatar";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import { ChatMarkdown } from "@/components/chat/chat-markdown";
import { ReasoningPanel } from "@/components/chat/reasoning-panel";
import { ChatMessageMeta } from "@/components/chat/chat-message-meta";
import { MessageAttachments } from "@/components/chat/message-attachments";
import { ChatToolsRecap } from "@/components/chat/chat-tools-recap";
import { ClarificationCard } from "@/components/chat/clarification-card";
import { TaskProposalCard } from "@/components/chat/task-proposal-card";
import { ActionProposalsList } from "@/components/chat/action-proposal-card";
import { CitationChip, type CitationSource } from "@/components/runs/citations/citation-chip";
import { prettyCitationLabel } from "@/lib/citations/label";
import { SaveToLibraryButton } from "@/components/library/save-to-library-button";
import { deriveTitleFromMarkdown } from "@/components/library/publish-artifact-sheet";

/** Map a chat-citation `kind` to the canonical run-page citation source.
 *  File + PR refs are repo-anchored; everything else resolves through the
 *  knowledge-graph drawer path. */
function chatCitationSource(kind: ChatCitation["kind"]): CitationSource {
  return kind === "file" || kind === "pr" ? "repo" : "kn";
}

/** Hover-revealed "copy the whole reply" action (same clipboard pattern as
 *  the code-block copy in ChatMarkdown). */
function CopyMessageButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : "Copy message"}
      title={copied ? "Copied" : "Copy message"}
      className={cn(
        "inline-flex size-5 items-center justify-center rounded-md text-[var(--text-subtle)] transition-[color,background-color,opacity] duration-150 hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        className,
      )}
    >
      {copied ? <Check className="size-3 text-[var(--success-ink)]" /> : <Copy className="size-3" />}
    </button>
  );
}

/** Hover-revealed pin toggle on an assistant answer - pin IS starring: the
 *  pinned state is a filled star in the accent color with a soft glow, so a
 *  bookmarked answer reads as a bright point in the thread's sky; the
 *  thread's "Pinned" panel lists every pinned answer. */
function PinMessageButton({
  pinned,
  disabled,
  onToggle,
}: {
  pinned: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={pinned}
      aria-label={pinned ? "Unpin answer" : "Pin answer"}
      title={pinned ? "Unpin answer" : "Pin answer"}
      className={cn(
        "inline-flex size-5 items-center justify-center rounded-md transition-[color,background-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50",
        pinned
          ? "text-[var(--primary)]"
          : "text-[var(--text-subtle)] opacity-0 hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:opacity-100 group-hover/msg:opacity-100 max-lg:opacity-100",
      )}
    >
      <Star
        className={cn(
          "size-3",
          pinned && "fill-current drop-shadow-[0_0_5px_var(--glow-accent)]",
        )}
      />
    </button>
  );
}

export function ChatMessage({
  message,
  onCitationOpen,
  onEdit,
  editDisabled,
  onPickClarification,
  cardsDisabled,
  onStartProposal,
  onDismissProposal,
  onPin,
  onUnpin,
  pinDisabled,
}: {
  message: ChatMessageT;
  onCitationOpen: (source: CitationSource, refValue: string, label?: string) => void;
  onEdit: (m: ChatMessageT) => void;
  editDisabled: boolean;
  onPickClarification: (value: string) => void;
  cardsDisabled: boolean;
  /** Open the New-task dialog pre-filled from a proposal card's CTA. */
  onStartProposal?: (proposal: TaskProposalPayload) => void;
  /** Decline a proposal card (by its message id). */
  onDismissProposal?: (messageId: string) => void;
  /** Pin / unpin this assistant answer. When omitted (e.g. read-only shared
   *  view, or a streaming/local row), the pin affordance is hidden. */
  onPin?: (m: ChatMessageT) => void;
  onUnpin?: (m: ChatMessageT) => void;
  pinDisabled?: boolean;
}) {
  const m = message;

  if (m.role === "task_created") {
    if (m.payload && "proposal_id" in m.payload) {
      return (
        <TaskProposalCard
          proposal={m.payload}
          spawnedRunId={m.spawned_run_id ?? null}
          {...(onStartProposal ? { onStart: onStartProposal } : {})}
          {...(onDismissProposal ? { onDismiss: () => onDismissProposal(m.id) } : {})}
        />
      );
    }
    // A transcript milestone reads as a horizon: the label sits centered
    // above a starred hairline instead of a floating pill.
    return (
      <div className="py-1">
        <div className="mb-1.5 flex justify-center">
          <Link
            href={`/work/${m.content}`}
            className="inline-flex items-center gap-1.5 rounded-md px-1 no-underline transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <Sparkles className="size-3 text-[var(--success-ink)]" aria-hidden />
            <Eyebrow className="text-[var(--success-ink)]">
              Task <code className="font-mono">{m.content}</code> created from this conversation
            </Eyebrow>
            <ArrowUpRight className="size-3 text-[var(--success-ink)]" aria-hidden />
          </Link>
        </div>
        <hr className="hr-horizon-star" aria-hidden />
      </div>
    );
  }

  if (m.role === "system") {
    return (
      <div className="py-1">
        <div className="mb-1.5 flex justify-center">
          <span className="inline-flex items-center gap-1.5 px-1">
            <Info className="size-3 text-[var(--danger-ink)]" aria-hidden />
            <Eyebrow className="text-[var(--danger-ink)]">{m.content}</Eyebrow>
          </span>
        </div>
        <hr className="hr-horizon-star" aria-hidden />
      </div>
    );
  }

  if (m.role === "user") {
    return (
      <div className="group/user flex flex-col items-end gap-1">
        <MessageAttachments ids={m.attachment_ids} />
        {m.content && (
          <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md border border-[var(--border-soft)] bg-[var(--surface-2)] px-4 py-2.5 text-sm leading-relaxed text-[var(--text)]">
            {m.content}
          </div>
        )}
        {!m.id.startsWith("__local_") && (
          <button
            type="button"
            onClick={() => onEdit(m)}
            disabled={editDisabled}
            className="text-micro inline-flex items-center gap-1 rounded px-1 py-0.5 text-[var(--text-subtle)] opacity-0 transition-opacity duration-150 hover:text-[var(--text)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50 group-hover/user:opacity-100 max-lg:opacity-100"
          >
            <Pencil className="size-2.5" /> Edit
          </button>
        )}
      </div>
    );
  }

  // assistant
  const citations = m.citations ?? [];
  return (
    <div className="group/msg flex gap-3">
      <ActorAvatar name={m.who} initials={m.avatar} agent size={26} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <div className="text-xs font-semibold text-[var(--text)]">{m.who}</div>
          <CopyMessageButton
            text={m.content}
            className="opacity-0 focus-visible:opacity-100 group-hover/msg:opacity-100 max-lg:opacity-100"
          />
          {(onPin || onUnpin) && !m.id.startsWith("__local_") && (
            <PinMessageButton
              pinned={!!m.pinned_at}
              disabled={!!pinDisabled}
              onToggle={() => (m.pinned_at ? onUnpin?.(m) : onPin?.(m))}
            />
          )}
          {!m.id.startsWith("__local_") && m.content && (
            <SaveToLibraryButton
              source={{
                kind: "content",
                format: "doc",
                title: deriveTitleFromMarkdown(m.content),
                body: m.content,
              }}
              className="opacity-0 focus-visible:opacity-100 group-hover/msg:opacity-100 max-lg:opacity-100"
            />
          )}
          <ConfidenceBadge
            score={m.confidence_score}
            reason={m.confidence_reason}
            size={22}
            className="ml-auto"
          />
        </div>
        {m.tool_calls && m.tool_calls.length > 0 && <ChatToolsRecap tools={m.tool_calls} />}
        {m.reasoning && <ReasoningPanel reasoning={m.reasoning} />}
        <ChatMarkdown content={m.content} onCitation={onCitationOpen} />

        {citations.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {citations.slice(0, 4).map((c, i) => {
              const source = chatCitationSource(c.kind);
              const refValue = c.ref ?? c.label;
              const pretty = prettyCitationLabel(c.kind, refValue);
              return (
                <CitationChip
                  key={`${c.kind}-${i}`}
                  source={source}
                  ref={refValue}
                  label={pretty}
                  onOpen={() => onCitationOpen(source, refValue, pretty)}
                />
              );
            })}
            {citations.length > 4 && (
              <span className="text-micro self-center text-[var(--text-subtle)]">
                +{citations.length - 4}
              </span>
            )}
          </div>
        )}

        {m.payload && "type" in m.payload && m.payload.type === "clarification" && (
          <ClarificationCard clarification={m.payload} onPick={onPickClarification} disabled={cardsDisabled} />
        )}
        {m.payload && "type" in m.payload && m.payload.type === "action_proposals" && (
          <ActionProposalsList proposals={m.payload.proposals} disabled={cardsDisabled} />
        )}

        <ChatMessageMeta usage={m.token_usage} />
      </div>
    </div>
  );
}
