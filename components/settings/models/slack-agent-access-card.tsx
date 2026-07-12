"use client";

/**
 * SlackAgentAccessCard - the org-level ACCESS policy for the @Athena Slack agent
 * (ADR-092 follow-up), sat next to the Slack agent MODEL card on /settings/models.
 *
 * Two dials:
 *   1. Mode - `read_only` (answer from knowledge only, the default) vs
 *      `read_write` (may ALSO propose task/stage changes a member confirms in
 *      Athena; nothing mutates from Slack directly).
 *   2. Tools - which built-in tools the agent may use. "All tools" (the default)
 *      is stored as `null`; a custom selection is stored as an explicit name list.
 *
 * The agent always runs AS the member who mentioned it, capped to THEIR own
 * permissions - this policy is the org-wide ceiling on top of that runtime gate.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  api,
  ApiError,
  type SlackAgentAccess,
  type SlackAgentAccessMode,
  type SlackAgentToolSpec,
} from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { focusRing } from "@/components/ui/focus";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";

// Display order for the built-in tool groups (the BE returns a `group` per tool).
// Knowledge first (the read ladder), then the action/system groups; anything
// unknown falls to the end. Mirrors the Agent Registry editor's ordering.
const GROUP_ORDER = [
  "Knowledge",
  "Tasks",
  "Stages",
  "Org",
  "Activity",
  "Cost",
  "Conversation",
  "Settings",
  "Web",
] as const;

// Groups that only take effect in read & act mode (the read-only agent carries
// no caller identity, so its action tools never build). Shown as a hint.
const ACTION_GROUPS = new Set(["Tasks", "Stages", "Conversation", "Web"]);

function groupTools(
  tools: SlackAgentToolSpec[],
): [string, SlackAgentToolSpec[]][] {
  const byGroup = new Map<string, SlackAgentToolSpec[]>();
  for (const t of tools) {
    const g = t.group || "Other";
    const arr = byGroup.get(g);
    if (arr) arr.push(t);
    else byGroup.set(g, [t]);
  }
  const ordered: [string, SlackAgentToolSpec[]][] = [];
  for (const g of GROUP_ORDER) {
    const arr = byGroup.get(g);
    if (arr) {
      ordered.push([g, arr]);
      byGroup.delete(g);
    }
  }
  for (const [g, arr] of byGroup) ordered.push([g, arr]);
  return ordered;
}

/** True when two allowlists mean the same thing (order-insensitive; `null` =
 *  all, so it never equals a partial list). */
function sameTools(a: string[] | null, b: string[] | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((n) => set.has(n));
}

export function SlackAgentAccessCard() {
  const [catalog, setCatalog] = useState<SlackAgentToolSpec[] | null>(null);
  const [mode, setMode] = useState<SlackAgentAccessMode>("read_only");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // The last-saved policy - the baseline the Save button diffs against.
  const [baseline, setBaseline] = useState<SlackAgentAccess | null>(null);
  const [saving, setSaving] = useState(false);

  const catalogNames = useMemo(
    () => (catalog ? catalog.map((t) => t.name) : []),
    [catalog],
  );

  const applyTools = useCallback(
    (tools: string[] | null, names: string[]) => {
      // `null` = every tool; else the stored list intersected with what's still
      // offerable (a delisted / disconnected tool simply drops out of the UI).
      const nameSet = new Set(names);
      setSelected(
        tools === null
          ? new Set(names)
          : new Set(tools.filter((n) => nameSet.has(n))),
      );
    },
    [],
  );

  const refresh = useCallback(async () => {
    const [access, cat] = await Promise.all([
      api.models.slackAgentAccess(),
      api.models.slackAgentToolCatalog(),
    ]);
    setCatalog(cat.builtin);
    setMode(access.mode);
    setBaseline(access);
    applyTools(access.tools, cat.builtin.map((t) => t.name));
  }, [applyTools]);

  useEffect(() => {
    void refresh().catch(() => {
      /* the parent page surfaces load errors; this card stays quiet */
    });
  }, [refresh]);

  const allSelected =
    catalogNames.length > 0 && selected.size === catalogNames.length;
  // "All" is stored as null so the policy stays future-proof as the catalog grows.
  const currentTools = allSelected ? null : [...selected];
  const dirty =
    baseline !== null &&
    (mode !== baseline.mode || !sameTools(currentTools, baseline.tools));

  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(catalogNames));

  const save = async () => {
    setSaving(true);
    try {
      const body: SlackAgentAccess = { mode, tools: currentTools };
      const updated = await api.models.setSlackAgentAccess(body);
      setBaseline(updated);
      setMode(updated.mode);
      applyTools(updated.tools, catalogNames);
      toast.success("Slack agent access updated.");
    } catch (e) {
      toast.error(
        e instanceof ApiError
          ? e.message
          : "Couldn't update the Slack agent access.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <Stack gap="4">
        <Stack gap="1">
          <h2 className="text-sm font-semibold text-[var(--text)]">
            Slack agent access
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            What @Athena can do when mentioned in Slack. It always runs as the
            member who asks, capped to their own permissions - this sets the
            org-wide ceiling on top of that.
          </p>
        </Stack>

        {!catalog || !baseline ? (
          <SlackAgentAccessSkeleton />
        ) : (
          <>
            <Stack gap="2">
              <Eyebrow>Mode</Eyebrow>
              <Cluster gap="2" className="flex-wrap">
                <ModeOption
                  label="Read-only"
                  desc="Answer from your org's knowledge. Can't change anything."
                  on={mode === "read_only"}
                  onPick={() => setMode("read_only")}
                />
                <ModeOption
                  label="Read & act"
                  desc="Also propose task & stage changes - each confirmed in Athena."
                  on={mode === "read_write"}
                  onPick={() => setMode("read_write")}
                />
              </Cluster>
            </Stack>

            <Stack gap="2">
              <Cluster justify="between" align="center">
                <Eyebrow>Tools it can use</Eyebrow>
                <button
                  type="button"
                  onClick={toggleAll}
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text)]",
                    focusRing,
                  )}
                >
                  {allSelected ? "Clear all" : "Select all"}
                </button>
              </Cluster>
              {groupTools(catalog).map(([label, tools]) => (
                <Stack key={label} gap="1.5">
                  <span className="text-micro font-medium uppercase tracking-wide text-[var(--text-subtle)]">
                    {label}
                    {mode === "read_only" && ACTION_GROUPS.has(label) && (
                      <span className="ml-1 normal-case tracking-normal text-[var(--text-subtle)]">
                        · read &amp; act only
                      </span>
                    )}
                  </span>
                  <Grid cols="auto-fit-220" gap="2">
                    {tools.map((t) => (
                      <ToolChip
                        key={t.name}
                        title={t.name}
                        subtitle={t.description}
                        on={selected.has(t.name)}
                        dimmed={mode === "read_only" && ACTION_GROUPS.has(label)}
                        onToggle={() => toggle(t.name)}
                      />
                    ))}
                  </Grid>
                </Stack>
              ))}
              {selected.size === 0 && (
                <p className="text-xs text-[var(--warning-ink)]">
                  No tools selected - the agent will answer from the model alone,
                  without your org&apos;s knowledge.
                </p>
              )}
            </Stack>

            <Cluster justify="between" align="center" className="flex-wrap gap-2">
              <span className="text-xs text-[var(--text-muted)]">
                Takes effect on the next mention.
              </span>
              <Button
                variant="default"
                size="sm"
                onClick={() => void save()}
                disabled={!dirty || saving}
                loading={saving}
              >
                Save changes
              </Button>
            </Cluster>
          </>
        )}
      </Stack>
    </Card>
  );
}

function ModeOption({
  label,
  desc,
  on,
  onPick,
}: {
  label: string;
  desc: string;
  on: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={on}
      className={cn(
        "flex flex-1 basis-56 flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors",
        focusRing,
        on
          ? "border-[var(--primary)] bg-[var(--primary-soft)]"
          : "border-[var(--border)] hover:bg-[var(--surface-2)]",
      )}
    >
      <span
        className={cn(
          "text-sm font-medium",
          on ? "text-[var(--primary)]" : "text-[var(--text)]",
        )}
      >
        {label}
      </span>
      <span className="text-micro text-[var(--text-subtle)]">{desc}</span>
    </button>
  );
}

function ToolChip({
  title,
  subtitle,
  on,
  dimmed,
  onToggle,
}: {
  title: string;
  subtitle: string;
  on: boolean;
  dimmed?: boolean;
  onToggle: () => void;
}) {
  return (
    <Tooltip content={subtitle} className="w-full">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        className={cn(
          "flex w-full flex-col items-start gap-0.5 rounded-md border px-2.5 py-1.5 text-left transition-colors",
          focusRing,
          on
            ? "border-[var(--primary)] bg-[var(--primary-soft)]"
            : "border-[var(--border)] hover:bg-[var(--surface-2)]",
          dimmed && !on && "opacity-60",
        )}
      >
        <span
          className={cn(
            "w-full truncate font-mono text-xs font-medium",
            on ? "text-[var(--primary)]" : "text-[var(--text)]",
          )}
        >
          {title}
        </span>
        <span className="line-clamp-1 w-full text-micro text-[var(--text-subtle)]">
          {subtitle}
        </span>
      </button>
    </Tooltip>
  );
}

function SlackAgentAccessSkeleton() {
  return (
    <Stack gap="3" aria-busy="true" aria-label="Loading the Slack agent access policy">
      <Skeleton className="h-4 w-16" />
      <Cluster gap="2">
        <Skeleton className="h-12 flex-1 basis-56 rounded-md" />
        <Skeleton className="h-12 flex-1 basis-56 rounded-md" />
      </Cluster>
      <Skeleton className="h-4 w-24" />
      <Grid cols="auto-fit-220" gap="2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 rounded-md" />
        ))}
      </Grid>
    </Stack>
  );
}
