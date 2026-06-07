"use client";

/**
 * ImproveDrawer — scope-aware Improve surface (F-04.8 / ADR-064).
 *
 * The original mock-v2 drawer is restructured around an **explicit scope**.
 * Callers tell us whether the user clicked Improve from a global header
 * ("global"), a section header ("section"), or a text selection ("selection"),
 * and we render the matching banner + headline so the user understands what
 * will be revised.
 *
 * Fields in the body:
 *   - `feedback_text` (required) — markdown textarea
 *   - `improvement_kind` radio — Refine (default) / Expand / Narrow / Redraft
 *
 * Submit calls `api.runs.documents.improve(runId, docId, body)` via the
 * caller-supplied `onSubmit({ feedback_text, improvement_kind })` callback,
 * then animates into a docked "Improving…" pill that auto-dismisses ~1.4s
 * after completion (matches mock-v2 cadence).
 *
 * The drawer used to ship `kind`-keyed preset prompts; those stay as quick
 * starters but are now grouped under "Try one of these…" because the
 * scope/improvement_kind axes now carry the structural meaning.
 */

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { CheckCircle2, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";
import type { ImprovementKind, ImproveScopeKind, RunDecisionSelection } from "@/lib/api/client";

interface ImproveTargetScope {
  kind: ImproveScopeKind;
  /** When `kind === "section"` — the section's anchor id. */
  anchor?: string | null;
  /** When `kind === "section"` — display label (heading text). */
  sectionTitle?: string | null;
  /** When `kind === "selection"` — selection bounds for the splice. */
  selection?: RunDecisionSelection | null;
  /** When `kind === "selection"` — the selected text (for preview only). */
  selectedText?: string | null;
}

interface ImproveSubmitPayload {
  feedback_text: string;
  improvement_kind: ImprovementKind;
  scope: ImproveTargetScope;
}

export interface ImproveTarget {
  /** Friendly label for the affected doc + scope (e.g. "spec.md · §2"). */
  label: string;
  /** Optional current text snippet — surfaced as a quoted preview. */
  currentText: string;
  /** Caller-supplied submit handler. Throwing surfaces toast.error. */
  onSubmit: (payload: ImproveSubmitPayload) => Promise<void> | void;
  /** Bounding rect of the trigger button; used to position the floating panel. */
  anchor: { top: number; left: number; right: number; bottom: number; width: number; height: number };
  /** Scope of the Improve — drives the banner copy + the payload. */
  scope: ImproveTargetScope;
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

const IMPROVEMENT_KIND_LABELS: Record<ImprovementKind, { label: string; hint: string }> = {
  refine: { label: "Refine", hint: "Same shape, tighter wording." },
  expand: { label: "Expand", hint: "Add more depth or scenarios." },
  narrow: { label: "Narrow", hint: "Drop secondary content; shorter." },
  redraft: { label: "Redraft", hint: "Same scope, fresh draft from scratch." },
};

const SCOPE_BANNER: Record<ImproveScopeKind, { headline: string; description: (s: ImproveTargetScope) => string }> = {
  global: {
    headline: "This will revise the entire document.",
    description: () => "Provide feedback to guide the revision. Every section may move.",
  },
  section: {
    headline: "This will revise one section.",
    description: (s) =>
      s.sectionTitle
        ? `Other sections will not change. Affected section: ${s.sectionTitle}.`
        : "Other sections will not change.",
  },
  selection: {
    headline: "This will revise the selected text.",
    description: () => "Surrounding paragraphs in the section will stay as-is.",
  },
};

type Stage = { name: string; state: "pending" | "active" | "done"; detail?: string };

const RUN_SCRIPT: Stage[] = [
  { name: "Reading current text",       state: "pending", detail: "Snapshot of the region" },
  { name: "Loading domain context", state: "pending", detail: "Decision records + recent activity" },
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
  const [improvementKind, setImprovementKind] = useState<ImprovementKind>("refine");
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
    setImprovementKind("refine");
    setRunning(false);
    setDone(false);
    setStages(RUN_SCRIPT.map((s) => ({ ...s, state: "pending" })));
    requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const w = 380;
      const h = panel.getBoundingClientRect().height || 320;
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
    // Real in-flight state — no fake per-stage timers. The Improve request is
    // a synchronous LLM call on the backend; we show a working state for the
    // whole duration, then flip to "done" once the new revision lands.
    setRunning(true);
    setStages((prev) => prev.map((s) => ({ ...s, state: "active" })));
    try {
      await target.onSubmit({
        feedback_text: prompt,
        improvement_kind: improvementKind,
        scope: target.scope,
      });
      setStages((prev) => prev.map((s) => ({ ...s, state: "done" })));
      setDone(true);
      toast.success(`Saved improvement to ${target.label}.`);
      setTimeout(onClose, 1400);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save improvement.");
      setRunning(false);
      setStages((prev) => prev.map((s) => ({ ...s, state: "pending" })));
    }
  };

  if (!target) return null;

  const presets = PRESETS[target.kind ?? "spec"];
  // While in flight the request is a single opaque LLM call — show an
  // indeterminate "working" bar rather than a fabricated step count.
  const pct = done ? 100 : 66;
  const currentStage = stages[stages.length - 1];
  const banner = SCOPE_BANNER[target.scope.kind];

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
          <div className="improve-dock-stage">{done ? currentStage?.name : "Revising the document"}</div>
          {!done && <div className="improve-dock-detail">This runs an LLM revision — it may take a few seconds.</div>}
        </div>
        <div className="improve-dock-progress-wrap">
          <div className="improve-dock-progress">
            <div
              className={cn("improve-dock-progress-bar", !done && "animate-pulse")}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="improve-dock-steps">{done ? "Done" : "Working…"}</div>
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
      style={pos ? { top: pos.top, left: pos.left, visibility: "visible", width: 380 } : { visibility: "hidden" }}
      data-scope-kind={target.scope.kind}
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
        <Stack gap="2">
          {/* Scope banner — explicit about what will change. */}
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2 text-xs">
            <div className="font-semibold text-[var(--text)]">{banner.headline}</div>
            <div className="mt-0.5 text-[var(--text-muted)]">{banner.description(target.scope)}</div>
            {target.scope.kind === "selection" && target.scope.selectedText && (
              <blockquote className="mt-1.5 border-l-2 border-l-[var(--border)] pl-2 italic text-[var(--text-muted)]">
                &quot;{target.scope.selectedText.slice(0, 140)}{target.scope.selectedText.length > 140 ? "…" : ""}&quot;
              </blockquote>
            )}
          </div>

          {/* Improvement kind radio. */}
          <Stack gap="1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Improvement kind
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(IMPROVEMENT_KIND_LABELS) as ImprovementKind[]).map((k) => {
                const meta = IMPROVEMENT_KIND_LABELS[k];
                const selected = improvementKind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setImprovementKind(k)}
                    title={meta.hint}
                    aria-pressed={selected}
                    className={cn(
                      "rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors",
                      selected
                        ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                        : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
                    )}
                    data-improvement-kind={k}
                  >
                    <div className="font-semibold">{meta.label}</div>
                    <div className="text-[10px] font-normal text-[var(--text-muted)]">{meta.hint}</div>
                  </button>
                );
              })}
            </div>
          </Stack>

          {/* Preset chips — same as before but framed as starters. */}
          <Stack gap="1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Try one of these…
            </span>
            <Cluster gap="1.5">
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
            </Cluster>
          </Stack>

          <textarea
            ref={taRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKey}
            placeholder="What should change? (⌘↵ to submit)"
            className="w-full resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            style={{ minHeight: 80 }}
            aria-label="Feedback text"
          />
        </Stack>
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
