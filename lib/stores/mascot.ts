/**
 * Sophia mascot state - global, derived from screen context + active-run SSE.
 *
 * See UX design standard §7. Mood is set by:
 *   1. The current screen's declared default (via `setScreenDefault`)
 *   2. Active-run SSE events (via `applyRunEvent`)
 *
 * Active-run state overrides the screen default. When no run is active and no
 * screen default has been set, mood is `idle`. Eight moods total - all
 * neutral-to-positive, no sad emotions.
 */

import { create } from "zustand";

export type Mood =
  | "idle"
  | "reading"
  | "thinking"
  | "writing"
  | "working"
  | "waiting"
  | "happy"
  | "focused";

type RunEvent =
  | { type: "agent_step"; kind: "plan" | "reason" | "retrieve" | "read" | "draft" | "write" }
  | { type: "tool_call" }
  | { type: "gate_pending" }
  | { type: "run_status"; status: "completed" | "failed" | "cancelled" | "gate_rejected" | "running" };

interface MascotState {
  mood: Mood;
  screenDefault: Mood;
  setScreenDefault: (mood: Mood) => void;
  applyRunEvent: (e: RunEvent) => void;
  reset: () => void;
}

let toolCallTimer: ReturnType<typeof setTimeout> | null = null;
let transientTimer: ReturnType<typeof setTimeout> | null = null;

function clearTimers() {
  if (toolCallTimer) { clearTimeout(toolCallTimer); toolCallTimer = null; }
  if (transientTimer) { clearTimeout(transientTimer); transientTimer = null; }
}

export const useMascotStore = create<MascotState>((set, get) => ({
  mood: "idle",
  screenDefault: "idle",

  setScreenDefault: (mood) => {
    set((s) => ({
      screenDefault: mood,
      // Only update mood if not currently overridden by an active run.
      mood: s.mood === s.screenDefault ? mood : s.mood,
    }));
  },

  applyRunEvent: (e) => {
    const settle = (m: Mood, after = 0) => {
      set({ mood: m });
      if (after > 0) {
        if (transientTimer) clearTimeout(transientTimer);
        transientTimer = setTimeout(() => set({ mood: get().screenDefault }), after);
      }
    };

    if (e.type === "agent_step") {
      switch (e.kind) {
        case "plan":
        case "reason":
          settle("thinking");
          return;
        case "retrieve":
        case "read":
          settle("reading");
          return;
        case "draft":
        case "write":
          settle("writing");
          return;
      }
    }

    if (e.type === "tool_call") {
      settle("working");
      if (toolCallTimer) clearTimeout(toolCallTimer);
      toolCallTimer = setTimeout(() => {
        // Return to whatever the parent step's mood was; for simplicity, back to default.
        set({ mood: get().screenDefault });
      }, 800);
      return;
    }

    if (e.type === "gate_pending") {
      settle("waiting");
      return;
    }

    if (e.type === "run_status") {
      switch (e.status) {
        case "completed":
          settle("happy", 4000);
          return;
        case "failed":
        case "cancelled":
        case "gate_rejected":
          settle("focused", 4000);  // alert, never sad
          return;
        case "running":
          // No-op; specific step events drive mood while running.
          return;
      }
    }
  },

  reset: () => {
    clearTimers();
    set({ mood: "idle", screenDefault: "idle" });
  },
}));
