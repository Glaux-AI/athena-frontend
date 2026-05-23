"use client";

/**
 * ImproveDrawer — mock-v2 parity.
 *
 * UX shape:
 *   1. **Floating** (input mode) — small 360px panel anchored near the
 *      trigger button (its DOMRect). No scrim. Page remains interactive.
 *      Contains 3 preset chips + textarea + "Iterate" button.
 *   2. **Docked** (running mode) — on submit, the panel animates into a
 *      sticky 480px pill at the bottom-center of the screen showing only
 *      the current stage + a progress bar (+ a spinning ring on the icon
 *      while active). Auto-closes ~1.4s after completion.
 *
 * Caller passes a DOMRect (`anchor`) in addition to `label` / `currentText` /
 * `onSubmit`. Helper `openImprove(e, target)` extracts the rect from the
 * click event so callers don't have to think about it.
 */

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { CheckCircle2, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export interface ImproveTarget {
  label: string;
  currentText: string;
  onSubmit: (prompt: string) => Promise<void>;
  /** Bounding rect of the trigger button; used to position the floating panel. */
  anchor: { top: number; left: number; right: number; bottom: number; width: number; height: number };
  /** Phase / artifact kind — drives the preset chip set. Default: "spec". */
  kind?: "spec" | "plan" | "subtask" | "component" | "consequences" | "review";
}

const PRESETS: Record<NonNullable<ImproveTarget["kind"]>, { id: string; label: string; hint: string }[]> = {
  spec: [
    { id: "tighter",  label: "Tighten scope",            hint: "Drop secondary scope; ship the smallest viable change." },
    { id: "broader",  label: "Broaden scope",             hint: "Include related concerns we deferred." },
    { id: "pm-voice", label: "Re-write in plain language",hint: "Strip jargon; PM-friendly." },
  ],
  plan: [
    { id: "split",      label: "Split into smaller subtasks", hint: "Each subtask < 1 day of work." },
    { id: "fewer",      label: "Consolidate subtasks",         hint: "Merge closely-coupled work." },
    { id: "alt-route",  label: "Alternative approach",         hint: "Propose a different architectural route." },
  ],
  subtask: [
    { id: "clarify",  label: "Clarify acceptance",          hint: "Tighten the success criteria." },
    { id: "tech",     label: "Deeper technical detail",     hint: "Spell out the implementation sketch." },
    { id: "risks",    label: "Surface risks",               hint: "What could go wrong here?" },
  ],
  component: [
    { id: "alt-impl",   label: "Alternative implementation", hint: "Same shape, different approach." },
    { id: "touchpoint", label: "Audit touchpoints",          hint: "Trace every external dependency." },
  ],
  consequences: [
    { id: "deepen", label: "Deepen risk analysis", hint: "Add concrete failure scenarios." },
    { id: "softer", label: "More mitigations",     hint: "Add canary, feature flag, rollback steps." },
  ],
  review: [
    { id: "stricter",label: "Stricter review",     hint: "Block on more conditions." },
    { id: "perf",    label: "Perf-focused review", hint: "Look for hot-path regressions." },
  ],
};

type Stage = { name: string; state: "pending" | "active" | "done"; detail?: string };

const RUN_SCRIPT: Stage[] = [
  { name: "Reading current text",       state: "pending", detail: "Snapshot of the section" },
  { name: "Loading capability context", state: "pending", detail: "Decision records + recent activity" },
  { name: "Drafting alternative",       state: "pending", detail: "Athena rewrites in place" },
  { name: "Saving as next revision",    state: "pending", detail: "Auto-stamped with reason" },
];

/** Convenience helper for trigger buttons — pass the click event + the target. */
export function openImprove(
  e: MouseEvent<HTMLElement>,
  onImprove: (target: ImproveTarget) => void,
  target: Omit<ImproveTarget, "anchor">,
): void {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  onImprove({
    ...target,
    anchor: {
      top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom,
      width: rect.width, height: rect.height,
    },
  });
}

export function ImproveDrawer({
  target,
  onClose,
}: {
  target: ImproveTarget | null;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [stages, setStages] = useState<Stage[]>(RUN_SCRIPT);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Reset state when a new target arrives; position the panel near its anchor.
  useEffect(() => {
    if (!target) return;
    setPrompt("");
    setRunning(false);
    setDone(false);
    setStages(RUN_SCRIPT.map((s) => ({ ...s, state: "pending" })));
    // Compute position after the panel renders so we know its height.
    requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const w = 360;
      const h = panel.getBoundingClientRect().height || 240;
      const vw = window.innerWidth, vh = window.innerHeight;
      const gap = 6;
      let top = target.anchor.bottom + gap;
      let left = target.anchor.left;
      if (left + w + 8 > vw)            left = Math.max(8, target.anchor.right - w);
      if (top + h + 8 > vh && target.anchor.top - h - gap >= 8) top = target.anchor.top - h - gap;
      top  = Math.max(8, Math.min(top,  vh - h - 8));
      left = Math.max(8, Math.min(left, vw - w - 8));
      setPos({ top, left });
      setTimeout(() => taRef.current?.focus(), 30);
    });
  }, [target]);

  // Close on Esc when floating (but not while running — running has its own dismissal).
  useEffect(() => {
    if (!target || running) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, running, onClose]);

  // ⌘+↵ shortcut while focused in the textarea.
  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  };

  const submit = async () => {
    if (!target || running || !prompt.trim()) return;
    setRunning(true);
    // Stage-by-stage timer; ~700ms per stage matches mock-v2 cadence.
    for (let i = 0; i < RUN_SCRIPT.length; i++) {
      setStages((prev) => prev.map((s, j) => j === i ? { ...s, state: "active" } : j < i ? { ...s, state: "done" } : s));
      await new Promise((r) => setTimeout(r, 650));
    }
    setStages((prev) => prev.map((s) => ({ ...s, state: "done" })));
    try {
      await target.onSubmit(prompt);
      setDone(true);
      toast.success(`Saved improvement to ${target.label}.`);
      setTimeout(onClose, 1400);
    } catch {
      toast.error("Improvement failed — try again.");
      setRunning(false);
    }
  };

  if (!target) return null;

  const presets = PRESETS[target.kind ?? "spec"];
  const stagesDone = stages.filter((s) => s.state === "done").length;
  const pct = done ? 100 : Math.round((stagesDone / RUN_SCRIPT.length) * 100);
  const currentStage = done ? stages[stages.length - 1] : (stages.find((s) => s.state === "active") ?? stages[0]);

  // ============ DOCKED (running) ============
  if (running) {
    return (
      <div
        ref={panelRef}
        role="status"
        aria-live="polite"
        className={cn("improve-dock animate-improve-dock-in", done && "is-done")}
      >
        <div className={cn("improve-dock-icon", done ? "is-done" : "is-active")}>
          {done ? <CheckCircle2 className="size-4" /> : <Sparkles className="size-4" />}
        </div>
        <div className="improve-dock-meta">
          <div className="improve-dock-title">{done ? "New revision ready" : "Athena iterating"}</div>
          <div className="improve-dock-stage">{currentStage?.name}</div>
          {!done && currentStage?.detail && <div className="improve-dock-detail">{currentStage.detail}</div>}
        </div>
        <div className="improve-dock-progress-wrap">
          <div className="improve-dock-progress">
            <div className="improve-dock-progress-bar" style={{ width: `${pct}%` }} />
          </div>
          <div className="improve-dock-steps">
            {done ? `${RUN_SCRIPT.length} of ${RUN_SCRIPT.length}` : `${stagesDone + 1} of ${RUN_SCRIPT.length}`}
          </div>
        </div>
      </div>
    );
  }

  // ============ FLOATING (input) ============
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`Improve · ${target.label}`}
      className="improve-floating animate-improve-float-in"
      style={pos ? { top: pos.top, left: pos.left, visibility: "visible" } : { visibility: "hidden" }}
    >
      <div className="improve-floating-head">
        <div className="flex min-w-0 items-center gap-1.5">
          <Sparkles className="size-3.5 text-[var(--primary)]" />
          <strong className="truncate text-[13px]">
            Iterate · <span className="text-[var(--text-muted)]">{target.label}</span>
          </strong>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="improve-floating-body">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              title={p.hint}
              onClick={() => setPrompt((cur) => cur ? `${cur}\n${p.label}` : p.label)}
              className="rounded-full border border-[var(--border)] px-2.5 py-[3px] text-[11px] text-[var(--text-muted)] hover:border-[var(--primary)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]"
            >
              {p.label}
            </button>
          ))}
        </div>
        <textarea
          ref={taRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKey}
          placeholder="What should change? (⌘↵ to submit)"
          className="w-full resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          style={{ minHeight: 80 }}
        />
      </div>
      <div className="improve-floating-foot">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={submit} disabled={!prompt.trim()}>
          {running ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          Iterate
        </Button>
      </div>
    </div>
  );
}
