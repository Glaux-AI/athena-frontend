"use client";

/**
 * TierExplorer — ADR-042 five-tier navigable KG hierarchy.
 *
 * The KG ingests at five tiers (Repo / Service / Module / Component / File),
 * each with a precomputed auto-summary. Flat lists do not scale past ~50
 * services or ~200 modules. This component lets a user drill down one tier
 * at a time, with the current tier path encoded in the URL so any tier in
 * a million-node repo is a sharable, bookmarkable surface.
 *
 * Wire format for the URL param (read by parent via `useSearchParams`):
 *   ?tier=                              → repo (root)
 *   ?tier=service:auth                  → service tier
 *   ?tier=service:auth/module:handlers  → module tier
 *   ?tier=service:auth/module:handlers/component:AuthHandler
 *   ?tier=service:auth/module:handlers/component:AuthHandler/file:handlers.py
 *
 * Each segment is `<tier_kind>:<id>`. The id is the URL-safe child node id
 * (slug or hash), not the human label.
 *
 * Caller passes `root: TierNode` (the precomputed tree for this repo) and
 * `tierPath: string | null` (the current selected path from the URL). The
 * component computes the visible tier by walking the tree.
 */

import { ChevronRight, Boxes, Box, Component, FileCode, Database } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";

export type TierKind = "repo" | "service" | "module" | "component" | "file";

export interface TierMetric {
  label: string;
  value: string;
}

export interface TierNode {
  /** URL-safe id used to build the tier path (slug or short hash). */
  id: string;
  /** Display name (e.g. service "auth", module "handlers"). */
  name: string;
  /** Repo-relative path of the artefact this tier represents. */
  path: string;
  /** Tier kind, drives the icon and child-tier label. */
  tier: TierKind;
  /** ADR-042 auto-summary at this tier (≈100–300 words). */
  summary: string;
  /** Per-tier counts. Free-form so each tier surfaces what's relevant. */
  metrics: TierMetric[];
  /** Children at the next tier down. Empty for `file` tier. */
  children: TierNode[];
}

const TIER_ICON: Record<TierKind, typeof Boxes> = {
  repo:      Database,
  service:   Boxes,
  module:    Box,
  component: Component,
  file:      FileCode,
};

const TIER_LABEL: Record<TierKind, string> = {
  repo:      "Repo",
  service:   "Service",
  module:    "Module",
  component: "Component",
  file:      "File",
};

/** The tier that a kind's children belong to. Used to label the
 *  "next-tier" header above the children list. */
const CHILD_TIER_LABEL: Record<TierKind, string | null> = {
  repo:      "Services",
  service:   "Modules",
  module:    "Components",
  component: "Files",
  file:      null,
};

/** Parse a `?tier=service:auth/module:handlers` URL value into a list of
 *  `{tier, id}` segments. Empty / nullish input means "root (repo tier)". */
export function parseTierPath(raw: string | null | undefined): Array<{ tier: TierKind; id: string }> {
  if (!raw) return [];
  return raw
    .split("/")
    .filter(Boolean)
    .map((seg) => {
      const [tier, id] = seg.split(":");
      return { tier: (tier ?? "service") as TierKind, id: id ?? "" };
    });
}

/** Serialise the inverse of `parseTierPath`. */
export function serialiseTierPath(segments: Array<{ tier: TierKind; id: string }>): string {
  return segments.map((s) => `${s.tier}:${s.id}`).join("/");
}

/** Walk `root` along `segments`, returning the matched node and the chain
 *  of ancestors. If a segment doesn't resolve, walk stops at the deepest
 *  match (so a stale URL drops back to the deepest valid tier). */
function resolveTierPath(root: TierNode, segments: Array<{ tier: TierKind; id: string }>): {
  current: TierNode;
  chain: TierNode[];
} {
  const chain: TierNode[] = [root];
  let current: TierNode = root;
  for (const seg of segments) {
    const next = current.children.find((c) => c.tier === seg.tier && c.id === seg.id);
    if (!next) break;
    chain.push(next);
    current = next;
  }
  return { current, chain };
}

export interface TierExplorerProps {
  /** Precomputed tier tree rooted at the repo. */
  root: TierNode;
  /** Current tier path from the URL (e.g. "service:auth/module:handlers"). */
  tierPath: string | null;
  /** Called with the next tier path when the user drills in or up. Pass an
   *  empty string to reset to the repo root. */
  onNavigate: (nextPath: string) => void;
  className?: string | undefined;
}

export function TierExplorer({ root, tierPath, onNavigate, className }: TierExplorerProps) {
  const segments = parseTierPath(tierPath);
  const { current, chain } = resolveTierPath(root, segments);
  const childTierLabel = CHILD_TIER_LABEL[current.tier];
  const Icon = TIER_ICON[current.tier];

  return (
    <Stack gap="3" {...(className ? { className } : {})}>
      {/* Breadcrumb of tiers: Repo › Service: auth › Module: handlers */}
      <nav aria-label="Tier breadcrumb" className="text-xs">
        <ol className="flex flex-wrap items-center gap-1">
          {chain.map((node, i) => {
            const isLast = i === chain.length - 1;
            const pathUpToHere = i === 0
              ? ""
              : serialiseTierPath(
                  chain.slice(1, i + 1).map((n) => ({ tier: n.tier, id: n.id })),
                );
            return (
              <li key={`${node.tier}:${node.id}`} className="flex items-center gap-1 min-w-0">
                {isLast ? (
                  <span
                    className="truncate font-medium text-[var(--text)]"
                    aria-current="step"
                    title={`${TIER_LABEL[node.tier]}: ${node.name}`}
                  >
                    <span className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)] mr-1">
                      {TIER_LABEL[node.tier]}
                    </span>
                    {node.name}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="truncate rounded px-1 -mx-1 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                    onClick={() => onNavigate(pathUpToHere)}
                    title={`${TIER_LABEL[node.tier]}: ${node.name}`}
                  >
                    <span className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)] mr-1">
                      {TIER_LABEL[node.tier]}
                    </span>
                    {node.name}
                  </button>
                )}
                {!isLast && (
                  <ChevronRight className="size-3 shrink-0 text-[var(--text-subtle)]" aria-hidden />
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Current tier card: summary + metrics */}
      <Card>
        <Stack gap="2">
          <Cluster gap="2" align="center">
            <Icon className="size-4 text-[var(--primary)]" aria-hidden />
            <span className="text-sm font-semibold">{current.name}</span>
            <code className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-subtle)]">
              {current.path}
            </code>
            <span className="ml-auto rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              {TIER_LABEL[current.tier]} tier · ADR-042
            </span>
          </Cluster>
          {current.metrics.length > 0 && (
            <Cluster gap="3" align="center" className="text-xs text-[var(--text-muted)]">
              {current.metrics.map((m) => (
                <span key={m.label} className="inline-flex items-center gap-1">
                  <span className="font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{m.label}</span>
                  <span className="tabular-nums text-[var(--text)]">{m.value}</span>
                </span>
              ))}
            </Cluster>
          )}
          <p className="text-sm leading-relaxed text-[var(--text-muted)] whitespace-pre-line">
            {current.summary}
          </p>
        </Stack>
      </Card>

      {/* Children at the next tier down */}
      {childTierLabel && current.children.length > 0 && (
        <Stack gap="2">
          <Cluster gap="2" align="center">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              {childTierLabel}
            </span>
            <span className="text-[10px] text-[var(--text-subtle)]">
              {current.children.length} item{current.children.length === 1 ? "" : "s"}
            </span>
          </Cluster>
          <ul className="flex flex-col gap-1.5">
            {current.children.map((child) => {
              const ChildIcon = TIER_ICON[child.tier];
              const pathToChild = serialiseTierPath([
                ...chain.slice(1).map((n) => ({ tier: n.tier, id: n.id })),
                { tier: child.tier, id: child.id },
              ]);
              return (
                <li key={`${child.tier}:${child.id}`}>
                  <button
                    type="button"
                    onClick={() => onNavigate(pathToChild)}
                    className={cn(
                      "w-full rounded-md border border-[var(--border)] p-3 text-left transition-colors",
                      "hover:border-[var(--primary)] hover:bg-[var(--surface-2)]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
                    )}
                  >
                    <Cluster gap="2" align="center">
                      <ChildIcon className="size-3.5 text-[var(--primary)]" aria-hidden />
                      <span className="text-sm font-semibold">{child.name}</span>
                      <code className="font-mono text-[10px] text-[var(--text-subtle)]">{child.path}</code>
                      <Cluster gap="2" align="center" className="ml-auto text-[10px] text-[var(--text-subtle)]">
                        {child.metrics.slice(0, 2).map((m) => (
                          <span key={m.label} className="tabular-nums">
                            {m.value} {m.label.toLowerCase()}
                          </span>
                        ))}
                      </Cluster>
                      <ChevronRight className="size-3 text-[var(--text-subtle)]" aria-hidden />
                    </Cluster>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--text-muted)]">
                      {child.summary}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </Stack>
      )}
    </Stack>
  );
}
