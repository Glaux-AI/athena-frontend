// Device-local terminal registry (zustand). Desktop-only.
//
// Tracks the open xterm tabs the renderer is hosting: their id, display title, and which task
// worktree (if any) they are bound to. The pty itself lives in the Electron main process; this
// store is only the renderer-side view of which tabs exist and which one is active.

import { create } from "zustand";

export type TerminalProfile = "shell" | "claude-code" | "codex";

export interface TerminalTab {
  /** The tab id: a provisional local id until main acks, then the real pty id. */
  id: string;
  /** Tab label, e.g. the bound task display id or "scratch". */
  title: string;
  /** The task whose worktree this terminal is bound to, or null for a scratch shell. */
  boundTaskDisplayId: string | null;
  /** Spawn profile: 'shell' (default) or 'claude-code' (auto-launches an interactive Claude). */
  profile?: TerminalProfile;
  /** Working directory for the pty (e.g. a task workspace root for a claude-code session). */
  cwd?: string;
  /** claude-code only: the stage being worked (baked into Claude's steering system prompt). */
  stage?: string | null;
  /** claude-code only: a Claude model alias/id. */
  model?: string;
}

export interface TerminalTabPatch {
  id?: string;
  title?: string;
  boundTaskDisplayId?: string | null;
}

interface TerminalsState {
  tabs: TerminalTab[];
  activeId: string | null;
  addTab: (tab: Omit<TerminalTab, "id">) => string;
  removeTab: (id: string) => void;
  setActive: (id: string | null) => void;
  renameTab: (id: string, patch: TerminalTabPatch) => void;
  clear: () => void;
}

let seq = 0;
function nextLocalId(): string {
  seq += 1;
  return `term-local-${seq}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useTerminalsStore = create<TerminalsState>((set) => ({
  tabs: [],
  activeId: null,

  addTab: (tab) => {
    const id = nextLocalId();
    set((s) => ({ tabs: [...s.tabs, { id, ...tab }], activeId: id }));
    return id;
  },

  removeTab: (id) =>
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id);
      const tabs = s.tabs.filter((t) => t.id !== id);
      let activeId = s.activeId;
      if (activeId === id) {
        const next = tabs[Math.max(0, idx - 1)] ?? tabs[0];
        activeId = next ? next.id : null;
      }
      return { tabs, activeId };
    }),

  setActive: (id) => set({ activeId: id }),

  renameTab: (id, patch) =>
    set((s) => {
      const reId = patch.id !== undefined && patch.id !== id;
      const tabs = s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t));
      const activeId = reId && s.activeId === id ? (patch.id as string) : s.activeId;
      return { tabs, activeId };
    }),

  clear: () => set({ tabs: [], activeId: null }),
}));
