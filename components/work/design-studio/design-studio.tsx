"use client";

/**
 * DesignStudio - the design-prototype surface that supersedes the plain
 * `HtmlPreview` for `design*` artifacts. One stable sandboxed iframe with three
 * tiers of editing over it:
 *   - Tier-1 DIRECT: token-valued knobs mutate the picked element instantly,
 *     zero LLM (the fast loop the old refine-only flow lacked); Save serializes
 *     the edited document into a new version.
 *   - Tier-2 SCOPED-AI: pick an element + describe a change (the refine is
 *     scoped to it).
 *   - Tier-3 REGENERATE: describe a whole-design change.
 * Progressive disclosure: novice-default is just the rendered screen; a Pro
 * toggle reveals read-grade Layers + Inspector from day one (no precision canvas
 * - that is the gated Phase-4 surface). The iframe is `allow-scripts` ONLY, so
 * AI-authored markup runs but never reaches the parent, cookies, or storage.
 */

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Code2,
  MonitorPlay,
  PanelRightOpen,
  Save,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { ApiError, type StageRefineInput } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Cluster, Stack } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";
import { groupTokens } from "@/lib/design/tokens";
import { useDesignTokens } from "@/lib/design/use-design-tokens";

import { BRIDGE_SCRIPT } from "./editor-bridge";
import { SerializeTimeoutError, useDesignCanvas } from "./use-design-canvas";
import { TokenKnobs } from "./token-knobs";
import { LayersPanel } from "./layers-panel";
import { Inspector } from "./inspector";
import { AiRefineBar, type RefineRun } from "./ai-refine-bar";

type View = "preview" | "edit" | "code";

/** The app's resolved accent color, read off the live tokens so the injected
 *  picker outline follows the theme instead of hardcoding a hex. */
function resolveAccent(): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
}

/** Viewport width presets so designers can check responsive behavior without
 *  leaving the studio. "fit" fills the card; the fixed widths letterbox the
 *  iframe wrapper (centered, token borders). */
type ViewportWidth = "fit" | "1280" | "768" | "375";

const VIEWPORT_WIDTHS: ViewportWidth[] = ["fit", "1280", "768", "375"];

/** Static class names so Tailwind can see (and generate) them. */
const VIEWPORT_CLASS: Record<Exclude<ViewportWidth, "fit">, string> = {
  "1280": "w-[1280px]",
  "768": "w-[768px]",
  "375": "w-[375px]",
};

export function DesignStudio({
  code,
  onRefine,
  onSaveEdits,
  approved = false,
  downstreamCount = 0,
  designTokenSetIds,
}: {
  code: string;
  onRefine?: (req: StageRefineInput) => Promise<void>;
  /** Persist Tier-1 direct edits as a new version (author path). Absent → the
   *  knobs are read-only-preview-only (no Save). */
  onSaveEdits?: (html: string) => Promise<void>;
  approved?: boolean;
  downstreamCount?: number;
  /** The design task's assigned design systems; their tokens ground the knobs
   *  (merged across systems). Empty/absent → tokens derived from ingested code. */
  designTokenSetIds?: string[];
}) {
  const interactive = Boolean(onRefine || onSaveEdits);
  const [view, setView] = useState<View>("preview");
  const [pro, setPro] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submittingAI, setSubmittingAI] = useState(false);
  const [viewport, setViewport] = useState<ViewportWidth>("fit");

  const canvas = useDesignCanvas(code, view === "edit");
  // The knobs offer the ORG's own tokens (the assigned systems' tokens, merged,
  // or derived from their ingested code), never Athena's palette; neutral starter
  // when the org has none in code.
  const { set: tokenSet } = useDesignTokens(designTokenSetIds);
  const grouped = useMemo(() => groupTokens(tokenSet), [tokenSet]);

  // A new prototype body (new version landed) remounts the iframe.
  useEffect(() => {
    setEpoch((e) => e + 1);
    setView("preview");
  }, [code]);

  const tabs: View[] = onSaveEdits || onRefine ? ["preview", "edit", "code"] : ["preview", "code"];
  const onTabKey = (e: React.KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const idx = tabs.indexOf(view);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? tabs.length - 1
          : e.key === "ArrowRight"
            ? Math.min(idx + 1, tabs.length - 1)
            : Math.max(idx - 1, 0);
    setView(tabs[next] ?? "preview");
  };

  const applyKnob = (prop: string, value: string, token: string | null) => {
    if (canvas.picked) canvas.apply(canvas.picked.id, prop, value, token);
  };

  const submitAI = async (run: RefineRun) => {
    if (!onRefine) return;
    const p = canvas.picked;
    const scoped = p
      ? `Refine the design - change ONLY this element and leave the rest of the page intact.\n` +
        `Element: ${p.selector} (<${p.tag}>${p.text ? ` "${p.text}"` : ""}).\n` +
        `Requested change: ${run.instruction}`
      : `Refine the design: ${run.instruction}`;
    setSubmittingAI(true);
    try {
      await onRefine({
        instruction: scoped,
        effort: run.effort,
        ...(run.model ? { model_provider: run.model.provider, model_id: run.model.model } : {}),
        ...(run.model?.source && run.model.source !== "subscription"
          ? { model_source: run.model.source }
          : {}),
      });
      setView("preview");
    } catch {
      // The caller surfaces the toast; keep the bar open to retry.
    } finally {
      setSubmittingAI(false);
    }
  };

  const save = async () => {
    if (!onSaveEdits) return;
    setSaving(true);
    try {
      const html = await canvas.serialize();
      if (!html) {
        toast.error("Couldn't capture the edits - try again.");
        return;
      }
      await onSaveEdits(html);
      setView("preview");
    } catch (e) {
      // A capture timeout is NOT a save failure - the edits are still live in
      // the iframe (dirty stays set), so tell the user to just retry.
      if (e instanceof SerializeTimeoutError) {
        toast.error("Couldn't capture the edits - try again.");
      } else {
        toast.error(e instanceof ApiError ? e.message : "Couldn't save your edits.");
      }
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    canvas.reset();
    setEpoch((e) => e + 1);
    setView("preview");
  };

  // The injected bridge script is MARKED so serialization can strip it - an
  // unmarked copy would otherwise get baked into every Tier-1 save.
  const srcDoc = interactive
    ? `${code}\n<script data-athena-bridge>window.__athenaAccent=${JSON.stringify(resolveAccent())};${BRIDGE_SCRIPT}</script>`
    : code;
  const showPanels = pro && view !== "code";

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)]">
      <Cluster
        justify="between"
        align="center"
        className="border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5"
      >
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
          <MonitorPlay className="size-3.5 text-[var(--primary)]" aria-hidden />
          Prototype
        </span>
        <Cluster gap="2" align="center">
          <div className="flex items-center gap-0.5" role="group" aria-label="Preview width">
            {VIEWPORT_WIDTHS.map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={viewport === w}
                onClick={() => setViewport(w)}
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-micro font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                  viewport === w
                    ? "bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-1)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]",
                )}
              >
                {w === "fit" ? "Fit" : w}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1" role="tablist" aria-label="Prototype view">
            {tabs.map((v) => (
              <StudioTab key={v} value={v} active={view === v} onSelect={setView} onKeyDown={onTabKey} />
            ))}
          </div>
          {interactive && (
            <button
              type="button"
              aria-pressed={pro}
              onClick={() => setPro((p) => !p)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                pro
                  ? "bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-1)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]",
              )}
            >
              <PanelRightOpen className="size-3" aria-hidden />
              Pro
            </button>
          )}
        </Cluster>
      </Cluster>

      {view === "code" && (
        <Stack gap="0">
          {canvas.dirty && (
            <p className="border-b border-[var(--border)] bg-[var(--warning-soft)] px-3 py-1.5 text-micro text-[var(--warning-ink)]">
              Unsaved direct edits are not reflected in this source view until you save.
            </p>
          )}
          <pre className="max-h-[460px] overflow-auto bg-[var(--surface)] p-3 text-xs leading-relaxed text-[var(--text)]">
            <code className="font-mono">{code}</code>
          </pre>
        </Stack>
      )}
      {/* The iframe stays MOUNTED (hidden) while the Code tab is active -
          unmounting it would silently discard unsaved Tier-1 edits. */}
      <div
        hidden={view === "code"}
        className={cn("grid", showPanels ? "grid-cols-1 md:grid-cols-[1fr_260px]" : "grid-cols-1")}
      >
          <div className="min-w-0">
            <div
              className={cn(
                "mx-auto max-w-full",
                viewport === "fit"
                  ? "w-full"
                  : cn(VIEWPORT_CLASS[viewport], "border-x border-[var(--border)]"),
              )}
            >
              <iframe
                key={epoch}
                ref={canvas.iframeRef}
                title={view === "edit" ? "Design prototype - click an element to edit" : "Design prototype preview"}
                srcDoc={srcDoc}
                sandbox="allow-scripts"
                loading="lazy"
                className="h-[640px] w-full border-0 bg-[var(--surface)]"
              />
            </div>
            {view === "edit" && (
              <div className="border-t border-[var(--border)] bg-[var(--surface)] p-3">
                <Stack gap="2.5">
                  {onSaveEdits && canvas.picked && (
                    <TokenKnobs picked={canvas.picked} grouped={grouped} onApply={applyKnob} />
                  )}
                  {onRefine && (
                    <AiRefineBar
                      picked={canvas.picked}
                      submitting={submittingAI}
                      onClearPick={canvas.clearPicked}
                      onSubmit={(run) => void submitAI(run)}
                    />
                  )}
                </Stack>
              </div>
            )}
          </div>
          {showPanels && (
            <div className="flex flex-col gap-2 border-t border-[var(--border)] bg-[var(--surface)] p-2 md:border-l md:border-t-0">
              <LayersPanel
                tree={canvas.tree}
                pickedId={canvas.picked?.id ?? null}
                onSelect={canvas.select}
              />
              <Inspector picked={canvas.picked} colors={grouped.colors} />
            </div>
          )}
      </div>

      {onSaveEdits && canvas.dirty && view !== "code" && (
        <Stack gap="2" className="border-t border-[var(--border)] bg-[var(--surface-2)] p-3">
          {approved && downstreamCount > 0 && (
            <Cluster gap="2" align="start" className="rounded-md border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--warning-ink)]" aria-hidden />
              <span className="text-xs text-[var(--warning-ink)]">
                Saving re-derives {downstreamCount} downstream stage
                {downstreamCount === 1 ? "" : "s"} into new versions. Old versions stay in history.
              </span>
            </Cluster>
          )}
          <Cluster gap="2" align="center">
            <Button size="sm" loading={saving} disabled={saving} onClick={() => void save()}>
              <Save className="size-3.5" />
              Save edits
            </Button>
            <Button size="sm" variant="ghost" disabled={saving} onClick={discard}>
              <Undo2 className="size-3.5" />
              Discard
            </Button>
            <span className="text-micro text-[var(--text-muted)]">
              Direct edits use only your design tokens - no AI, no cost.
            </span>
          </Cluster>
        </Stack>
      )}
    </div>
  );
}

function StudioTab({
  value,
  active,
  onSelect,
  onKeyDown,
}: {
  value: View;
  active: boolean;
  onSelect: (v: View) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      onClick={() => onSelect(value)}
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        active
          ? "bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-1)]"
          : "text-[var(--text-muted)] hover:text-[var(--text)]",
      )}
    >
      {value === "code" ? <Code2 className="size-3" aria-hidden /> : null}
      {value}
    </button>
  );
}
