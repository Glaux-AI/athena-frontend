"use client";

/**
 * The AI refine bar: Tier-2 scoped edit (when an element is picked, the change
 * is scoped to it) and Tier-3 whole-design refine (no pick). Mirrors the run
 * controls (effort dial + per-action model pick) so a refine never depends on a
 * selection and the user steers how hard / on which model it runs. Submitting
 * calls the page's `onRefine`, which reopens + re-runs the design stage.
 */

import { useEffect, useState } from "react";
import { Wand2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Cluster, Stack } from "@/components/layout/primitives";
import { EffortSelector } from "@/components/ui/effort-selector";
import { ModelSelector } from "@/components/ui/model-selector";
import { useEnabledModels } from "@/hooks/use-enabled-models";
import { restoreModelSelection, storeModel, usePersistedEffort } from "@/lib/prefs/run-prefs";

import type { EffortLevel, ModelSelection } from "@/lib/api/client";
import type { PickedNode } from "./editor-bridge";

export interface RefineRun {
  instruction: string;
  effort: EffortLevel;
  model: ModelSelection | null;
}

export function AiRefineBar({
  picked,
  submitting,
  onClearPick,
  onSubmit,
}: {
  picked: PickedNode | null;
  submitting: boolean;
  onClearPick: () => void;
  onSubmit: (run: RefineRun) => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [effort, setEffort] = usePersistedEffort("task");
  const { models } = useEnabledModels();
  const enabledModels = models.filter((m) => m.enabled);
  const [model, setModel] = useState<ModelSelection | null>(null);

  useEffect(() => {
    if (model !== null) return;
    const restored = restoreModelSelection("task", models);
    if (restored) {
      setModel(restored);
      return;
    }
    const first = models.find((m) => m.enabled);
    if (first) setModel({ provider: first.provider, model: first.id, source: first.source });
  }, [models, model]);

  const submit = () => {
    if (!instruction.trim()) return;
    onSubmit({ instruction: instruction.trim(), effort, model });
    setInstruction("");
  };

  return (
    <Stack gap="2" className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <Cluster gap="2" align="center" className="flex-wrap">
        <Wand2 className="size-3.5 shrink-0 text-[var(--primary)]" aria-hidden />
        {picked ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-3)] px-2 py-0.5 text-xs text-[var(--text)]">
            <span className="font-mono text-[var(--primary)]">{`<${picked.tag}>`}</span>
            {picked.text && (
              <span className="max-w-[180px] truncate text-[var(--text-muted)]">{picked.text}</span>
            )}
            <button
              type="button"
              onClick={onClearPick}
              aria-label="Clear element selection"
              className="ml-0.5 rounded p-0.5 text-[var(--text-subtle)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ) : (
          <span className="text-xs text-[var(--text-muted)]">
            Ask Athena to change the whole design, or pick an element to scope it.
          </span>
        )}
      </Cluster>
      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder={picked ? "Describe the change to this element…" : "Describe the change to the design…"}
        className="min-h-[64px] w-full resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
      />
      <Cluster gap="2" align="center">
        <Button
          size="sm"
          loading={submitting}
          disabled={submitting || !instruction.trim()}
          onClick={submit}
        >
          <Wand2 className="size-3.5" />
          Apply with AI
        </Button>
        <EffortSelector value={effort} onChange={setEffort} disabled={submitting} />
        {enabledModels.length > 1 && (
          <ModelSelector
            models={models}
            value={model}
            onChange={(m) => {
              setModel(m);
              storeModel("task", m);
            }}
            disabled={submitting}
          />
        )}
      </Cluster>
      <p className="text-[11px] text-[var(--text-muted)]">
        Athena edits the prototype and saves a new version - the current version stays in history.
      </p>
    </Stack>
  );
}
