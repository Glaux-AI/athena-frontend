"use client";

/**
 * /capabilities — grid of capability cards. Each card carries a per-capability
 * accent emblem, name + slug, description, and a KPI strip
 * (Repos / Open tasks / Notes / Last active).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  CircleDollarSign, GitBranch, Shield, Database, ListTree, Star, Circle, Inbox,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { api, ApiError, type Capability, type CapabilityKnowledge, type IncludeDeletedFilter } from "@/lib/api/client";
import { cn } from "@/lib/cn";

/** §5.31 — chip-row filter for the cap list. The query param drives
 *  it so the Danger zone tab can redirect to `?status=deleted` and
 *  land users on the trash view in one click. */
type CapStatusFilter = "active" | "deleted" | "all";

function statusToInclude(s: CapStatusFilter): IncludeDeletedFilter {
  return s === "active" ? "false" : s === "deleted" ? "only" : "true";
}

function isCapStatus(v: string | null | undefined): v is CapStatusFilter {
  return v === "active" || v === "deleted" || v === "all";
}

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
  // Batch 12k — ingest finished but at least one per-file enrichment
  // fell through; warning tone since the KG is usable but missing
  // signal (per-row Retry CTA lives on the cap-page Repos tab).
  degraded:          "bg-[var(--warning-soft)] text-[var(--warning)]",
};

export default function CapabilitiesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusParam = searchParams.get("status");
  const status: CapStatusFilter = isCapStatus(statusParam) ? statusParam : "active";

  const [caps, setCaps] = useState<Capability[]>([]);
  const [knowledgeMap, setKnowledgeMap] = useState<Record<string, CapabilityKnowledge>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const list = await api.capabilities.list(statusToInclude(status));
        setCaps(list);
        // Fetch per-cap KG stats only for live caps; deleted caps don't
        // expose knowledge surfaces.
        const live = list.filter((c) => !c.deleted_at);
        const stats = await Promise.all(
          live.map(async (c) => {
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
  }, [status]);

  const setStatusFilter = (next: CapStatusFilter) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (next === "active") sp.delete("status");
    else sp.set("status", next);
    const qs = sp.toString();
    router.push(`/capabilities${qs ? `?${qs}` : ""}`);
  };

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

      <Cluster gap="2" align="center">
        {(["active", "deleted", "all"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              s === status
                ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]",
            )}
          >
            {s === "active" ? "Active" : s === "deleted" ? "Deleted" : "All"}
          </button>
        ))}
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
  const isDeleted = !!cap.deleted_at;
  return (
    <Link
      href={`/capabilities/${encodeURIComponent(cap.id)}${isDeleted ? "?tab=danger" : ""}`}
      className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      <Card className={cn(
        "flex h-full flex-col gap-3 p-5 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-2)]",
        isDeleted && "opacity-75 border-dashed border-[var(--warning)]",
      )}>
        <Cluster justify="between" align="start">
          <div className={cn("flex size-9 items-center justify-center rounded-md text-white", emblemClass)}>
            <Icon className="size-[18px]" strokeWidth={2.25} />
          </div>
          {isDeleted ? (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-[var(--warning-soft)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--warning)]"
              title={`Soft-deleted ${cap.deleted_at}`}
            >
              <Trash2 className="size-3" />
              Deleted
            </span>
          ) : knowledge && (
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
          <h2 className={cn(
            "text-base font-semibold leading-tight tracking-tight",
            isDeleted && "line-through decoration-[var(--warning)]",
          )}>{cap.name}</h2>
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
