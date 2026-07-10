"use client";

/**
 * ContextChips - the "Context loaded" strip on a stage's run card.
 *
 * Shows EXACTLY what the agent's seed brief will carry for this stage,
 * source by source - the backend's `context-preview` endpoint runs the same
 * gather (and the same bounded caps) the driver composes the brief from, so
 * this strip can never misstate what the agent knows. The point: the user
 * spots a context gap ("it doesn't know about the Slack thread") and adds a
 * steer BEFORE burning a run, instead of guessing what Athena has.
 *
 * Progressive disclosure (no overwhelm): one collapsed summary row of chips;
 * clicking a chip expands the literal bounded text underneath. Absent
 * sources render greyed with the reason. Loads lazily on mount; failures
 * degrade to nothing (the strip is informative, never blocking).
 */

import { useEffect, useState } from "react";
import { Check, ChevronDown, Circle } from "lucide-react";

import { api, type ContextSource } from "@/lib/api/client";
import { Cluster, Stack } from "@/components/layout/primitives";
import { Eyebrow } from "@/components/ui/eyebrow";
import { focusRing } from "@/components/ui/focus";
import { cn } from "@/lib/cn";

export function ContextChips({
  taskId,
  stageKey,
}: {
  taskId: string;
  stageKey: string;
}) {
  const [sources, setSources] = useState<ContextSource[] | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSources(null);
    setOpenKey(null);
    void api.tasks
      .contextPreview(taskId, stageKey)
      .then((s) => {
        if (!cancelled) setSources(s);
      })
      .catch(() => {
        if (!cancelled) setSources([]);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId, stageKey]);

  if (sources === null) {
    return <div className="skeleton h-7 w-2/3 rounded-md" aria-hidden />;
  }
  if (sources.length === 0) return null;

  const open = sources.find((s) => s.key === openKey) ?? null;

  return (
    <Stack gap="1.5">
      <Cluster gap="1.5" align="center" className="flex-wrap">
        <Eyebrow>Athena starts with</Eyebrow>
        {sources.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setOpenKey(openKey === s.key ? null : s.key)}
            aria-expanded={openKey === s.key}
            title={
              s.present
                ? `Loaded into the agent's brief - click to see exactly what it gets`
                : `Not available for this run - click for why`
            }
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-micro font-medium transition-colors",
              focusRing,
              s.present
                ? "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]"
                : "border-dashed border-[var(--border)] text-[var(--text-subtle)]",
              openKey === s.key && "border-[var(--border-strong)] ring-1 ring-[var(--ring)]",
            )}
          >
            {s.present ? (
              <Check className="size-3 text-[var(--success-ink)]" aria-hidden />
            ) : (
              <Circle className="size-2.5" aria-hidden />
            )}
            {s.label}
            <ChevronDown
              className={cn(
                "size-3 text-[var(--text-subtle)] transition-transform",
                openKey === s.key && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        ))}
      </Cluster>
      {open && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
          <Stack gap="1">
            <Cluster gap="2" align="center">
              <span className="text-xs font-semibold text-[var(--text)]">{open.label}</span>
              {open.version != null && (
                <span className="text-micro text-[var(--text-subtle)]">v{open.version}</span>
              )}
              {!open.present && <Eyebrow>not loaded</Eyebrow>}
            </Cluster>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[var(--text-muted)]">
              {open.detail || "(empty)"}
            </pre>
          </Stack>
        </div>
      )}
    </Stack>
  );
}
