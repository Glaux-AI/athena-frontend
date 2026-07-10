"use client";

/**
 * /domains - grid of domain cards. Each card carries a per-domain
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
import { GradientText } from "@/components/ui/gradient-text";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Pill, type PillTone } from "@/components/ui/pill";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { api, ApiError, type Domain, type DomainKnowledge, type IncludeDeletedFilter } from "@/lib/api/client";
import { NewDomainDialog } from "@/components/domains/new-domain-dialog";
import { cn } from "@/lib/cn";

/** §5.31 - chip-row filter for the cap list. The query param drives
 *  it so the Danger zone tab can redirect to `?status=deleted` and
 *  land users on the trash view in one click. */
type DomainStatusFilter = "active" | "deleted" | "all";

function statusToInclude(s: DomainStatusFilter): IncludeDeletedFilter {
  return s === "active" ? "false" : s === "deleted" ? "only" : "true";
}

function isDomainStatus(v: string | null | undefined): v is DomainStatusFilter {
  return v === "active" || v === "deleted" || v === "all";
}

const EMBLEM_BG: Record<string, string> = {
  violet: "bg-[var(--acc-violet-soft)] text-[var(--acc-violet-ink)]",
  cyan:   "bg-[var(--acc-cyan-soft)] text-[var(--acc-cyan-ink)]",
  amber:  "bg-[var(--acc-amber-soft)] text-[var(--acc-amber-ink)]",
  indigo: "bg-[var(--acc-indigo-soft)] text-[var(--acc-indigo-ink)]",
  rose:   "bg-[var(--acc-rose-soft)] text-[var(--acc-rose-ink)]",
  mint:   "bg-[var(--acc-mint-soft)] text-[var(--acc-mint-ink)]",
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

const INGESTION_TONE: Record<NonNullable<DomainKnowledge["ingestion_status"]>, PillTone> = {
  fresh:             "success",
  debouncing:        "info",
  // A paused/behind sync at rollup scope - knowledge usable but not current.
  stale:             "warning",
  stale_but_usable:  "warning",
  ingesting:         "primary",
  failed:            "danger",
  // Batch 12k - ingest finished but at least one per-file enrichment
  // fell through; warning tone since the KG is usable but missing
  // signal (per-row Retry CTA lives on the cap-page Repos tab).
  degraded:          "warning",
};

export default function DomainsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusParam = searchParams.get("status");
  const status: DomainStatusFilter = isDomainStatus(statusParam) ? statusParam : "active";

  const [caps, setCaps] = useState<Domain[]>([]);
  const [knowledgeMap, setKnowledgeMap] = useState<Record<string, DomainKnowledge>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const list = await api.domains.list(statusToInclude(status));
        setCaps(list);
        // Fetch per-cap KG stats only for live caps; deleted caps don't
        // expose knowledge surfaces.
        const live = list.filter((c) => !c.deleted_at);
        const stats = await Promise.all(
          live.map(async (c) => {
            try { return [c.id, await api.domains.knowledge(c.id)] as const; }
            catch { return null; }
          }),
        );
        const map: Record<string, DomainKnowledge> = {};
        for (const entry of stats) if (entry) map[entry[0]] = entry[1];
        setKnowledgeMap(map);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load domains");
      } finally {
        setLoading(false);
      }
    })();
  }, [status]);

  const setStatusFilter = (next: DomainStatusFilter) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (next === "active") sp.delete("status");
    else sp.set("status", next);
    const qs = sp.toString();
    router.push(`/domains${qs ? `?${qs}` : ""}`);
  };

  return (
    <Stack gap="6">
      <Cluster justify="between" align="center">
        <Stack gap="1">
          <GradientText as="h1" className="text-2xl font-semibold tracking-tight">Domains</GradientText>
          <p className="text-sm text-[var(--text-muted)]">
            Business surfaces your team owns. Each one bundles repos, rules, and history.
          </p>
        </Stack>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          New domain
        </Button>
      </Cluster>

      <Segmented
        ariaLabel="Filter domains by status"
        options={[
          { value: "active", label: "Active" },
          { value: "deleted", label: "Deleted" },
          { value: "all", label: "All" },
        ]}
        value={status}
        onChange={setStatusFilter}
        className="self-start"
      />

      {error && (
        <div className="rounded-lg border border-[var(--border-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]">
          {error}
        </div>
      )}

      {loading ? (
        <Grid cols="auto-fit-320" gap="4" aria-busy="true" aria-label="Loading domains">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="flex h-full flex-col gap-3 rounded-xl p-6">
              <Skeleton className="size-9 rounded-md" />
              <div className="flex flex-col gap-1">
                <Skeleton className="h-4 w-40 rounded-md" />
                <Skeleton className="h-3 w-24 rounded-md" />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <Skeleton className="h-3 w-full rounded-md" />
                <Skeleton className="h-3 w-5/6 rounded-md" />
              </div>
              <Cluster gap="4" className="pt-1">
                {Array.from({ length: 4 }).map((__, j) => (
                  <div key={j} className="flex flex-col gap-1">
                    <Skeleton className="h-2 w-12 rounded" />
                    <Skeleton className="h-3 w-8 rounded" />
                  </div>
                ))}
              </Cluster>
            </Card>
          ))}
        </Grid>
      ) : caps.length === 0 ? (
        <EmptyState
          title="No domains yet"
          description="Create your first domain to start grouping repos and tasks."
        />
      ) : (
        <Grid cols="auto-fit-320" gap="4">
          {caps.map((c) => <DomainCard key={c.id} cap={c} knowledge={knowledgeMap[c.id] ?? null} />)}
        </Grid>
      )}

      <NewDomainDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(cap) => router.push(`/domains/${cap.id}`)}
      />
    </Stack>
  );
}

function DomainCard({ cap, knowledge }: { cap: Domain; knowledge: DomainKnowledge | null }) {
  const emblemClass = EMBLEM_BG[cap.emblem] ?? EMBLEM_BG.violet;
  const Icon = ICON_MAP[cap.icon] ?? Circle;
  const isDeleted = !!cap.deleted_at;
  return (
    <Link
      href={`/domains/${encodeURIComponent(cap.id)}${isDeleted ? "?tab=danger" : ""}`}
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      <Card interactive className={cn(
        "flex h-full flex-col gap-3 rounded-xl p-6",
        isDeleted && "opacity-75 border-dashed border-[var(--warning)]",
      )}>
        <Cluster justify="between" align="start">
          <div className={cn("flex size-9 items-center justify-center rounded-md", emblemClass)}>
            <Icon className="size-[18px]" strokeWidth={2.25} />
          </div>
          {isDeleted ? (
            <Pill tone="warning" size="sm" title={`Soft-deleted ${cap.deleted_at}`}>
              <span className="inline-flex items-center gap-1">
                <Trash2 className="size-3" aria-hidden />
                Deleted
              </span>
            </Pill>
          ) : knowledge && (
            <Pill
              tone={INGESTION_TONE[knowledge.ingestion_status]}
              size="sm"
              live={knowledge.ingestion_status === "ingesting" || knowledge.ingestion_status === "debouncing"}
              title={`Last ingested ${knowledge.last_ingested_at}`}
            >
              {knowledge.ingestion_status.replace(/_/g, " ")}
            </Pill>
          )}
        </Cluster>
        <Stack gap="0">
          <h2 className={cn(
            "text-base font-semibold leading-tight tracking-tight",
            isDeleted && "line-through decoration-[var(--warning)]",
          )}>{cap.name}</h2>
          <span className="font-mono text-micro text-[var(--text-muted)]">dom:{cap.slug}</span>
        </Stack>
        {/* The domain description (set when the domain was created).
         *  Per ADR-071, the LLM-synthesized domain narrative lives in
         *  Blueprint.overview - not duplicated here. */}
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
      <Eyebrow>{label}</Eyebrow>
      <span className={cn("text-sm font-bold tabular-nums", valueClassName)}>{value}</span>
    </div>
  );
}
