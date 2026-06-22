// Device-local worktree registry (zustand). Desktop-only.
//
// The renderer-side mirror of which task worktrees exist on THIS machine, plus the focused
// task (the one new terminals and the diff base bind to). Cloud task state is never stored
// here; this is strictly the "on this device" locality surface.

import { create } from "zustand";

import type { WorktreeMeta } from "@/lib/desktop/types";

interface WorktreesState {
  worktrees: WorktreeMeta[];
  focusedTaskDisplayId: string | null;
  setWorktrees: (worktrees: WorktreeMeta[]) => void;
  upsertWorktree: (wt: WorktreeMeta) => void;
  setFocused: (taskDisplayId: string | null) => void;
  hasLocalWorktree: (taskDisplayId: string) => boolean;
  clear: () => void;
}

export const useWorktrees = create<WorktreesState>((set, get) => ({
  worktrees: [],
  focusedTaskDisplayId: null,

  setWorktrees: (worktrees) => set({ worktrees }),

  upsertWorktree: (wt) =>
    set((s) => {
      const idx = s.worktrees.findIndex((w) => w.path === wt.path);
      if (idx === -1) return { worktrees: [...s.worktrees, wt] };
      const next = s.worktrees.slice();
      next[idx] = wt;
      return { worktrees: next };
    }),

  setFocused: (taskDisplayId) => set({ focusedTaskDisplayId: taskDisplayId }),

  hasLocalWorktree: (taskDisplayId) =>
    get().worktrees.some((w) => w.taskDisplayId === taskDisplayId),

  clear: () => set({ worktrees: [], focusedTaskDisplayId: null }),
}));
