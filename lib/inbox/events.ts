/**
 * Cross-component signal that the inbox changed (an item was read, dismissed,
 * or "mark all read" ran). The TopBar bell and the sidebar count listen for it
 * and refetch their unread badge immediately instead of waiting for their next
 * poll tick - so acting on an item updates every surface at once.
 */

export const INBOX_CHANGED_EVENT = "athena:inbox-changed";

export function notifyInboxChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(INBOX_CHANGED_EVENT));
  }
}
