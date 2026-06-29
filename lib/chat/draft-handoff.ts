/**
 * Chat draft handoff - carries the message typed into the home (/dashboard)
 * composer to /chat, where it starts a new org-scoped thread.
 *
 * Module-level by design: the value lives only in JS memory for the one
 * client-side navigation between the two pages. No URL param (drafts would
 * leak into history/server logs) and no localStorage (customer content must
 * not be persisted client-side - see CLAUDE.md hard rules). A hard refresh
 * drops it, which is fine - the user just typed it and is mid-navigation.
 *
 * The payload carries the model + effort pick AND any attachment ids alongside
 * the text, so the handoff turn sends EXACTLY what the home composer had -
 * without depending on /chat's own (async-restored) model state, which would
 * otherwise race the handoff send (an image could land on a default/non-vision
 * model before the pick restores).
 */

import type { EffortLevel, ModelSelection } from "@/lib/api/client";

export interface ChatDraftHandoff {
  content: string;
  /** Attachment ids uploaded in the home composer, sent with the first turn. */
  attachmentIds: string[];
  /** The model the home composer had selected (null = platform default). */
  model: ModelSelection | null;
  /** The effort the home composer had selected. */
  effort: EffortLevel;
  /** Whether the home composer had "Web search" armed (carried so the first
   *  /chat turn runs with the same toggle). Absent = off. */
  webSearch?: boolean;
  /** The custom agent the home composer had selected (carried so the first
   *  /chat turn runs on it). Absent = none. */
  agentId?: string | null;
}

let pending: ChatDraftHandoff | null = null;

export function setChatDraftHandoff(payload: ChatDraftHandoff): void {
  pending = payload;
}

/** Returns the pending handoff (once) and clears it. */
export function consumeChatDraftHandoff(): ChatDraftHandoff | null {
  const value = pending;
  pending = null;
  return value;
}

/** Non-destructive read - lets /chat know during its first render that it's
 *  being entered via the home handoff (to skip entrance animations that
 *  would double up on home's exit glide) before the init effect consumes it. */
export function peekChatDraftHandoff(): ChatDraftHandoff | null {
  return pending;
}
