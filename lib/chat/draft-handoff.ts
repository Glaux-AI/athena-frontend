/**
 * Chat draft handoff - carries the message typed into the home (/dashboard)
 * composer to /chat, where it starts a new org-scoped thread.
 *
 * Module-level by design: the value lives only in JS memory for the one
 * client-side navigation between the two pages. No URL param (drafts would
 * leak into history/server logs) and no localStorage (customer content must
 * not be persisted client-side - see CLAUDE.md hard rules). A hard refresh
 * drops it, which is fine - the user just typed it and is mid-navigation.
 */

let pending: string | null = null;

export function setChatDraftHandoff(content: string): void {
  pending = content;
}

/** Returns the pending draft (once) and clears it. */
export function consumeChatDraftHandoff(): string | null {
  const value = pending;
  pending = null;
  return value;
}

/** Non-destructive read - lets /chat know during its first render that it's
 *  being entered via the home handoff (to skip entrance animations that
 *  would double up on home's exit glide) before the init effect consumes it. */
export function peekChatDraftHandoff(): string | null {
  return pending;
}
