"use client";

/**
 * ChatMessage — one row in the conversation. Single home for the bubble
 * rendering both chat surfaces used to duplicate.
 *
 * Assistant turns render full-width (no bubble) so code, tables, and mermaid
 * diagrams get the column's full readable width; the answer leads, with
 * citations, inline cards (clarification / scope ladder), a collapsed tool
 * recap, and the usage footer underneath. User turns are a distinct
 * right-aligned bubble. `task_created` and `system` rows render as centered
 * markers. Tokens-only.
 */

import Link from "next/link";
import { ArrowUpRight, Info, Pencil, Sparkles } from "lucide-react";

import { type ChatCitation, type ChatMessage as ChatMessageT } from "@/lib/api/client";
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
export function chatCitationSource(kind: ChatCitation["kind"]): CitationSource {
  return kind === "file" || kind === "pr" ? "repo" : "kn";
}

export function ChatMessage({
  message,
  onCitationOpen,
  onEdit,
  editDisabled,
  onPickClarification,
  cardsDisabled,
}: {
  message: ChatMessageT;
  onCitationOpen: (source: CitationSource, refValue: string) => void;
  onEdit: (m: ChatMessageT) => void;
  editDisabled: boolean;
  onPickClarification: (value: string) => void;
  cardsDisabled: boolean;
}) {
  const m = message;

  if (m.role === "task_created") {
    if (m.payload && "proposal_id" in m.payload) {
      return <TaskProposalCard proposal={m.payload} spawnedRunId={m.spawned_run_id ?? null} />;
    }
    return (
      <div className="flex justify-center">
        <Link
          href={`/runs/${m.content}`}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--success)] bg-[var(--success-soft)] px-3 py-1 text-xs font-medium text-[var(--success)] no-underline hover:bg-[var(--surface)]"
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
        <div className="inline-flex items-center gap-1.5 rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-2.5 py-1 text-xs text-[var(--danger)]">
          <Info className="size-3" />
          {m.content}
        </div>
      </div>
    );
  }

  if (m.role === "user") {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-[var(--primary)] px-4 py-2.5 text-sm leading-relaxed text-[var(--primary-fg)]">
          {m.content}
        </div>
        {!m.id.startsWith("__local_") && (
          <button
            type="button"
            onClick={() => onEdit(m)}
            disabled={editDisabled}
            className="inline-flex items-center gap-1 text-[10px] text-[var(--text-subtle)] hover:text-[var(--text)] disabled:opacity-50"
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
    <div className="flex gap-3">
      <ActorAvatar name={m.who} initials={m.avatar} agent size={26} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="text-xs font-semibold text-[var(--text)]">{m.who}</div>
        {m.reasoning && <ReasoningPanel reasoning={m.reasoning} />}
        <ChatMarkdown content={m.content} onCitation={onCitationOpen} />

        {citations.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {citations.slice(0, 4).map((c, i) => {
              const source = chatCitationSource(c.kind);
              const refValue = c.ref ?? c.label;
              return (
                <CitationChip
                  key={`${c.kind}-${i}`}
                  source={source}
                  ref={refValue}
                  label={prettyCitationLabel(c.kind, refValue)}
                  onOpen={() => onCitationOpen(source, refValue)}
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
