"use client";

/**
 * Chat-FAB store - the global "Ask Athena about this page" assistant.
 *
 * Singleton Zustand store (same pattern as the buy-seats modal) so the
 * launcher button, the keyboard shortcut, and any future "ask about this"
 * affordance can open the docked assistant without prop-drilling. The
 * assistant itself is mounted once in AppShell (`<ChatFab/>`) and subscribes
 * here.
 */

import { create } from "zustand";

interface ChatFabState {
  open: boolean;
  openFab: () => void;
  close: () => void;
  toggle: () => void;
}

export const useChatFabStore = create<ChatFabState>((set) => ({
  open: false,
  openFab: () => set({ open: true }),
  close: () => set({ open: false }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
