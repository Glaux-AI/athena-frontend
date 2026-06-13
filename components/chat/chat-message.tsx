"use client";

/**
 * ChatMessage — one row in the conversation. Single home for the bubble
 * rendering both chat surfaces used to duplicate.
 *
 * Assistant turns render full-width (no bubble) so code, tables, and mermaid
 * diagrams get the column's full readable width; the answer leads, with
 * citations, inline cards (clarification / scope ladder), a collapsed tool
 * recap, and the usage footer underneath. A copy action surfaces on hover
 * next to the agent name. User turns are a quiet right-aligned bubble with a
 * hover-revealed Edit affordance. `task_created` and `system` rows render as
 * centered markers. Tokens-only.
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Copy, Info, Pencil, Sparkles } from "lucide-react";

import {
  type ChatCitation,
  type ChatMessage as ChatMessageT,
  type TaskProposalPayload,
} from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { ActorAvatar } from "@/components/mascot/actor-avatar";
import { ChatMarkdown } from "@/components/chat/chat-markdown";
import { ReasoningPanel } from "@/components/chat/reasoning-panel";
import { ChatMessageMeta } from "@/components/chat/chat-message-meta";
import { ChatToolsRecap } from "@/components/chat/chat-tools-recap";
import { ClarificationCard } from "@/components/chat/clarification-card";
import { ScopeLadderCard } from "@/components/chat/scope-ladder-card";
import { TaskProposalCard } from "@/components/chat/task-proposal-card";
import { CitationChip, type CitationSource } from "@/components/runs/citations/citation-chip";
import { prettyCitationLabel } from "@/lib/citations/label";

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

export function ChatMessage({
  message,
  onCitationOpen,
  onEdit,
  editDisabled,
  onPickClarification,
  cardsDisabled,
  onStartProposal,
  onDismissProposal,
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
    return (
      <div className="flex justify-center">
        <Link
          href={`/work/${m.content}`}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--success-soft)] px-3 py-1 text-xs font-medium text-[var(--success-ink)] no-underline transition-[box-shadow] duration-150 ease-out hover:shadow-[var(--shadow-1)]"
        >
          <Sparkles className="size-3" />
          Task <code className="font-mono">{m.content}</code> created from this conversation
          <ArrowUpRight className="size-3" />
        </Link>
      </div>
    );
  }

  if (m.role === "system") {
    return (
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--danger-soft)] px-3 py-1 text-xs text-[var(--danger-ink)]">
          <Info className="size-3" />
          {m.content}
        </div>
      </div>
    );
  }

  if (m.role === "user") {
    return (
      <div className="group/user flex flex-col items-end gap-1">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md border border-[var(--border-soft)] bg-[var(--surface-2)] px-4 py-2.5 text-sm leading-relaxed text-[var(--text)]">
          {m.content}
        </div>
        {!m.id.startsWith("__local_") && (
          <button
            type="button"
            onClick={() => onEdit(m)}
            disabled={editDisabled}
            className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-[var(--text-subtle)] opacity-0 transition-opacity duration-150 hover:text-[var(--text)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50 group-hover/user:opacity-100"
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
            className="opacity-0 focus-visible:opacity-100 group-hover/msg:opacity-100"
          />
        </div>
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
              <span className="self-center text-[10px] text-[var(--text-subtle)]">
                +{citations.length - 4}
              </span>
            )}
          </div>
        )}

        {m.payload && "type" in m.payload && m.payload.type === "clarification" && (
          <ClarificationCard clarification={m.payload} onPick={onPickClarification} disabled={cardsDisabled} />
        )}
        {m.payload && "type" in m.payload && m.payload.type === "scope_ladder" && (
          <ScopeLadderCard scope={m.payload} onPick={onPickClarification} disabled={cardsDisabled} />
        )}

        {m.tool_calls && m.tool_calls.length > 0 && <ChatToolsRecap tools={m.tool_calls} />}
        <ChatMessageMeta usage={m.token_usage} />
      </div>
    </div>
  );
}
