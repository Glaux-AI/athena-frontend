"use client";

/**
 * /capabilities — grid of capability cards. Each card carries a per-capability
 * accent emblem, name + slug, description, and a KPI strip
 * (Repos / Open tasks / Notes / Last active).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus,
  CircleDollarSign, GitBranch, Shield, Database, ListTree, Star, Circle, Inbox,
  type LucideIcon,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { api, ApiError, type Capability, type CapabilityKnowledge } from "@/lib/api/client";
import { cn } from "@/lib/cn";

const EMBLEM_BG: Record<string, string> = {
  violet: "bg-[var(--acc-violet)]",
  cyan:   "bg-[var(--acc-cyan)]",
  amber:  "bg-[var(--acc-amber)]",
  indigo: "bg-[var(--acc-indigo)]",
  rose:   "bg-[var(--acc-rose)]",
  mint:   "bg-[var(--acc-mint)]",
};

const ICON_MAP: Record<string, LucideIcon> = {
  "circle-dollar": CircleDollarSign,
  "git-branch":    GitBranch,
  "shield":        Shield,
  "database":      Database,
  "list-tree":     ListTree,
  "star":          Star,
  "circle":        Circle,
  "inbox":         Inbox,
};

const INGESTION_TONE: Record<NonNullable<CapabilityKnowledge["ingestion_status"]>, string> = {
  fresh:             "bg-[var(--success-soft)] text-[var(--success)]",
  debouncing:        "bg-[var(--info-soft)]    text-[var(--info)]",
  stale_but_usable:  "bg-[var(--warning-soft)] text-[var(--warning)]",
  ingesting:         "bg-[var(--primary-soft)] text-[var(--primary)]",
  failed:            "bg-[var(--danger-soft)]  text-[var(--danger)]",
};

export default function CapabilitiesPage() {
  const [caps, setCaps] = useState<Capability[]>([]);
  const [knowledgeMap, setKnowledgeMap] = useState<Record<string, CapabilityKnowledge>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const list = await api.capabilities.list();
        setCaps(list);
        // Fetch per-cap KG stats in parallel so the cards can show
        // capability summary, ingestion status, and node counts at a glance.
        const stats = await Promise.all(
          list.map(async (c) => {
            try { return [c.id, await api.capabilities.knowledge(c.id)] as const; }
            catch { return null; }
          }),
        );
        const map: Record<string, CapabilityKnowledge> = {};
        for (const entry of stats) if (entry) map[entry[0]] = entry[1];
        setKnowledgeMap(map);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load capabilities");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <Stack gap="6">
      <Cluster justify="between" align="center">
        <Stack gap="1">
          <h1 className="text-2xl font-semibold tracking-tight">Capabilities</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Business surfaces your team owns. Each one bundles repos, rules, and history.
          </p>
        </Stack>
        <Button>
          <Plus className="size-4" />
          New capability
        </Button>
      </Cluster>

      {error && (
        <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger)]">{error}</p>
        </Card>
      )}

      {loading ? (
        <Grid cols="auto-fit-320" gap="4" aria-busy="true" aria-label="Loading capabilities">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="flex h-full flex-col gap-3 p-5">
              <div className="size-9 animate-pulse rounded-md bg-[var(--surface-2)]" />
              <div className="flex flex-col gap-1">
                <div className="h-4 w-40 animate-pulse rounded-md bg-[var(--surface-2)]" />
                <div className="h-3 w-24 animate-pulse rounded-md bg-[var(--surface-2)]" />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <div className="h-3 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
                <div className="h-3 w-5/6 animate-pulse rounded-md bg-[var(--surface-2)]" />
              </div>
              <Cluster gap="4" className="pt-1">
                {Array.from({ length: 4 }).map((__, j) => (
                  <div key={j} className="flex flex-col gap-1">
                    <div className="h-2 w-12 animate-pulse rounded bg-[var(--surface-2)]" />
                    <div className="h-3 w-8 animate-pulse rounded bg-[var(--surface-2)]" />
                  </div>
                ))}
              </Cluster>
            </Card>
          ))}
        </Grid>
      ) : caps.length === 0 ? (
        <EmptyState
          title="No capabilities yet"
          description="Create your first capability to start grouping repos and tasks."
        />
      ) : (
        <Grid cols="auto-fit-320" gap="4">
          {caps.map((c) => <CapabilityCard key={c.id} cap={c} knowledge={knowledgeMap[c.id] ?? null} />)}
        </Grid>
      )}
    </Stack>
  );
}

function CapabilityCard({ cap, knowledge }: { cap: Capability; knowledge: CapabilityKnowledge | null }) {
  const emblemClass = EMBLEM_BG[cap.emblem] ?? EMBLEM_BG.violet;
  const Icon = ICON_MAP[cap.icon] ?? Circle;
  return (
    <Link
      href={`/capabilities/${encodeURIComponent(cap.id)}`}
      className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      <Card className="flex h-full flex-col gap-3 p-5 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-2)]">
        <Cluster justify="between" align="start">
          <div className={cn("flex size-9 items-center justify-center rounded-md text-white", emblemClass)}>
            <Icon className="size-[18px]" strokeWidth={2.25} />
          </div>
          {knowledge && (
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                INGESTION_TONE[knowledge.ingestion_status],
              )}
              title={`Last ingested ${knowledge.last_ingested_at}`}
            >
              {knowledge.ingestion_status.replace("_", " ")}
            </span>
          )}
        </Cluster>
        <Stack gap="0">
          <h2 className="text-base font-semibold leading-tight tracking-tight">{cap.name}</h2>
          <span className="font-mono text-[11.5px] text-[var(--text-muted)]">cap:{cap.slug}</span>
        </Stack>
        {/* The capability description (set when the capability was created).
         *  Per ADR-071, the LLM-synthesized capability narrative lives in
         *  Blueprint.overview — not duplicated here. */}
        <p className="line-clamp-3 flex-1 text-[13px] leading-[1.55] text-[var(--text-muted)]">
          {cap.description}
        </p>
        <Cluster gap="4" className="pt-1 flex-wrap">
          <Stat label="Repos"        value={cap.repos.toString()} />
          <Stat label="Open tasks"   value={cap.open_tasks.toString()} />
          <Stat label="Notes"        value={cap.domain_notes.toString()} />
          {knowledge && <Stat label="KG nodes" value={knowledge.nodes_total.toLocaleString()} />}
          {knowledge && <Stat label="Decisions" value={knowledge.decision_records.toString()} />}
          <Stat label="Last active"  value={cap.last_activity} valueClassName="text-xs" />
        </Cluster>
      </Card>
    </Link>
  );
}

function Stat({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex flex-col gap-px">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-[var(--text-subtle)]">{label}</span>
      <span className={cn("text-sm font-bold tabular-nums", valueClassName)}>{value}</span>
    </div>
  );
}
