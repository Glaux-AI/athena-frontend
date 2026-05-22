"use client";

/**
 * Chat drawer store — Zustand singleton that survives navigation.
 *
 * State preserved across open / close:
 *   - open               · is the drawer visible
 *   - collapsed          · is the thread list folded
 *   - activeThreadId     · which conversation is on screen
 *   - drafts[threadId]   · what the user was typing per thread
 *   - lastOpenedAt       · debounce signal for the topbar badge
 *
 * Mounted globally in AppShell so the user can pop the drawer open from
 * any page and resume their last conversation.
 */

import { create } from "zustand";

interface ChatDrawerState {
  open: boolean;
  collapsed: boolean;
  activeThreadId: string | null;
  drafts: Record<string, string>;
  lastOpenedAt: number;
  setOpen: (next: boolean) => void;
  toggle: () => void;
  toggleCollapsed: () => void;
  setActiveThreadId: (id: string | null) => void;
  setDraft: (threadId: string, value: string) => void;
  clearDraft: (threadId: string) => void;
}

export const useChatDrawerStore = create<ChatDrawerState>((set, get) => ({
  open: false,
  collapsed: false,
  activeThreadId: null,
  drafts: {},
  lastOpenedAt: 0,
  setOpen: (next) => set({ open: next, lastOpenedAt: next ? Date.now() : get().lastOpenedAt }),
  toggle: () => set((s) => ({ open: !s.open, lastOpenedAt: !s.open ? Date.now() : s.lastOpenedAt })),
  toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
  setActiveThreadId: (id) => set({ activeThreadId: id }),
  setDraft: (threadId, value) => set((s) => ({ drafts: { ...s.drafts, [threadId]: value } })),
  clearDraft: (threadId) => set((s) => {
    const next = { ...s.drafts };
    delete next[threadId];
    return { drafts: next };
  }),
}));
