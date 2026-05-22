"use client";

/**
 * /capabilities — grid of capability cards. Each card carries a per-capability
 * accent emblem, name + slug, description, and a KPI strip
 * (Repos / Open tasks / Notes / Last active).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus, Loader2,
  CircleDollarSign, GitBranch, Shield, Database, ListTree, Star, Circle,
  type LucideIcon,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { api, ApiError, type Capability } from "@/lib/api/client";
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
};

export default function CapabilitiesPage() {
  const [caps, setCaps] = useState<Capability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setCaps(await api.capabilities.list());
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
        <Cluster gap="2" align="center">
          <Loader2 className="size-4 animate-spin text-[var(--text-muted)]" />
          <span className="text-sm text-[var(--text-muted)]">Loading…</span>
        </Cluster>
      ) : caps.length === 0 ? (
        <EmptyState
          title="No capabilities yet"
          description="Create your first capability to start grouping repos and tasks."
        />
      ) : (
        <Grid cols="auto-fit-320" gap="4">
          {caps.map((c) => <CapabilityCard key={c.id} cap={c} />)}
        </Grid>
      )}
    </Stack>
  );
}

function CapabilityCard({ cap }: { cap: Capability }) {
  const emblemClass = EMBLEM_BG[cap.emblem] ?? EMBLEM_BG.violet;
  const Icon = ICON_MAP[cap.icon] ?? Circle;
  return (
    <Link
      href={`/capabilities/${encodeURIComponent(cap.id)}`}
      className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      <Card className="flex h-full flex-col gap-3 p-5 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-2)]">
        <div className={cn("flex size-9 items-center justify-center rounded-md text-white", emblemClass)}>
          <Icon className="size-[18px]" strokeWidth={2.25} />
        </div>
        <Stack gap="0">
          <h2 className="text-base font-semibold leading-tight tracking-tight">{cap.name}</h2>
          <span className="font-mono text-[11.5px] text-[var(--text-muted)]">cap:{cap.slug}</span>
        </Stack>
        {cap.description && (
          <p className="line-clamp-3 flex-1 text-[13px] leading-[1.55] text-[var(--text-muted)]">{cap.description}</p>
        )}
        <Cluster gap="4" className="pt-1">
          <Stat label="Repos"        value={cap.repos.toString()} />
          <Stat label="Open tasks"   value={cap.open_tasks.toString()} />
          <Stat label="Notes"        value={cap.domain_notes.toString()} />
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
