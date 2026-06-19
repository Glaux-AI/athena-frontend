"use client";

/**
 * /cost - decision-grade spend analytics.
 *
 * Header: scope subtitle + date-range picker + billing-source toggle + Export.
 * Scope switcher: Organization / Domain / Repository.
 *   - Org   → the tabbed workbench (Overview / Breakdown / Trends / Efficiency /
 *             Attribution* / Budgets* / Ingestion).
 *   - Domain→ that capability's deep cost analysis.
 *   - Repo  → that repo's ingestion economics (repo_id is ingest-only).
 *
 * Permission gating: the page needs `cost:read` (the BE 403s otherwise + the nav
 * hides it). Attribution sections need `cost:attribution`, Export needs
 * `cost:export`, and budget edits need `cost:budgets_manage`.
 */

import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Download, Loader2, Lock, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AmbientBackground } from "@/components/ui/ambient-background";
import { GradientText } from "@/components/ui/gradient-text";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, ApiError, type CostBillingSource, type CostScope, type RepoIngestCycles } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { usePermissions } from "@/lib/session/use-permissions";
import { useSession } from "@/lib/session/SessionProvider";
import { useTabParam } from "@/hooks/use-url-state";

import { BillingSourceToggle } from "@/components/cost/billing-source-toggle";
import { DateRangePicker } from "@/components/cost/date-range-picker";
import { Segmented } from "@/components/cost/segmented";
import { CostOrgTabs } from "@/components/cost/cost-org-tabs";
import { CostDomainView, CostRepoView } from "@/components/cost/cost-scope-views";
import { CostExportReport } from "@/components/cost/cost-export-report";
import { normalizeCost, normalizeCredit, type CostView, type CreditView } from "@/components/cost/cost-view";
import { type CostRange, defaultRange, formatRangeSpan } from "@/components/cost/date-range";

type BudgetTarget = { id: string; name: string; current: number };
type CycleState = RepoIngestCycles["cycles"] | "loading" | "error" | null;

const SCOPE_VALUES: CostScope[] = ["org", "domain", "repo"];

const SOURCE_BLURB: Record<CostBillingSource, string> = {
  all: "all spend · your keys + Athena credits",
  byo: "spend on your own provider keys",
  athena: "spend on your Athena credits",
};

export default function CostPage() {
  const { activeOrgId } = useSession();
  const { can, loading: permsLoading } = usePermissions();
  const canViewCost = can("cost:read");
  const canAttribution = can("cost:attribution");
  const canExport = can("cost:export");
  const canBudgets = can("cost:budgets_manage");

  // The viewer's IANA timezone. `from`/`to` are LOCAL calendar dates; the BE
  // resolves the window + buckets the daily series in this zone (not UTC), so
  // "Today" / "This month" / the daily bars match the viewer's own calendar.
  const tz = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined; } catch { return undefined; }
  }, []);

  const [range, setRange] = useState<CostRange>(() => defaultRange());
  const [source, setSource] = useState<CostBillingSource>("all");
  // Scope (Org / Domain / Repo) lives in the URL so Back returns to the
  // previous scope instead of leaving the page. The drill-down selection
  // (which domain / which repo) stays local - stepping Back through every
  // dropdown pick would be noise, not navigation.
  const [scope, setScope] = useTabParam<CostScope>("scope", "org", SCOPE_VALUES);
  const [domainId, setDomainId] = useState<string | null>(null);
  const [repoId, setRepoId] = useState<string | null>(null);

  const [org, setOrg] = useState<CostView | null>(null);
  const [credit, setCredit] = useState<CreditView | null>(null);
  const [scoped, setScoped] = useState<CostView | null>(null);
  const [cycles, setCycles] = useState<CycleState>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [budgetTarget, setBudgetTarget] = useState<BudgetTarget | null>(null);

  // --- org summary + credit (always; powers the pickers + the org view) ---
  useEffect(() => {
    if (permsLoading || !canViewCost) return;
    let cancelled = false;
    setRefreshing(true);
    (async () => {
      try {
        const [summary, bal] = await Promise.all([
          api.cost.summary({ source, from: range.from, to: range.to, label: range.label, preset: range.preset, tz }),
          activeOrgId ? api.credits.getBalance(activeOrgId).catch(() => null) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        const view = normalizeCost(summary);
        setOrg(view);
        setCredit(normalizeCredit(bal, Math.max(1, view.spend_daily.length)));
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Failed to load cost data");
      } finally {
        if (!cancelled) { setLoading(false); setRefreshing(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [source, range, permsLoading, canViewCost, activeOrgId, tz]);

  // --- pickers: domains + repos (from the org summary) --------------------
  const domainOpts = useMemo(() => (org?.spend_by_domain ?? []).filter((d) => d.id !== "org").map((d) => ({ value: d.id, label: d.name })), [org]);
  const repoOpts = useMemo(() => (org?.spend_by_repo ?? []).map((r) => ({ value: r.repo_id, label: r.name })), [org]);
  const selectedDomain = useMemo(() => org?.spend_by_domain.find((d) => d.id === domainId), [org, domainId]);
  const selectedRepo = useMemo(() => org?.spend_by_repo.find((r) => r.repo_id === repoId), [org, repoId]);

  // Default the scoped selection to the first available option.
  useEffect(() => {
    if (scope === "domain" && !domainId && domainOpts[0]) setDomainId(domainOpts[0].value);
    if (scope === "repo" && !repoId && repoOpts[0]) setRepoId(repoOpts[0].value);
  }, [scope, domainId, repoId, domainOpts, repoOpts]);

  // --- scoped summary (+ repo cycles) -------------------------------------
  useEffect(() => {
    if (permsLoading || !canViewCost) return;
    if (scope === "org") { setScoped(null); return; }
    const id = scope === "domain" ? domainId : repoId;
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const summary = await api.cost.summary({
          source, from: range.from, to: range.to, label: range.label, preset: range.preset, tz,
          scope, ...(scope === "domain" ? { domain_id: id } : { repo_id: id }),
        });
        if (!cancelled) setScoped(normalizeCost(summary));
      } catch {
        if (!cancelled) setScoped(null);
      }
    })();
    if (scope === "repo") {
      setCycles("loading");
      api.cost.repoIngestCycles(id, { from: range.from, to: range.to, source, tz })
        .then((res) => { if (!cancelled) setCycles(res.cycles); })
        .catch(() => { if (!cancelled) setCycles("error"); });
    }
    return () => { cancelled = true; };
  }, [scope, domainId, repoId, source, range, permsLoading, canViewCost, tz]);

  const refetchOrg = async () => {
    try {
      const summary = await api.cost.summary({ source, from: range.from, to: range.to, label: range.label, preset: range.preset, tz });
      setOrg(normalizeCost(summary));
    } catch { /* keep prior */ }
  };

  const subtitle = !org
    ? "Spend analytics"
    : scope === "org"
      ? `${formatRangeSpan(range)} · ${SOURCE_BLURB[source]}`
      : scope === "domain"
        ? `${selectedDomain?.name ?? "Domain"} · deep cost analysis`
        : `${selectedRepo?.name ?? "Repository"} · ingestion economics`;

  const Header = (
    <div className="relative overflow-hidden rounded-xl">
      <AmbientBackground variant="subtle" grid={false} />
      <Cluster justify="between" align="end" className="relative flex-wrap gap-3">
        <Stack gap="1">
          <GradientText as="h1" className="text-2xl font-semibold tracking-tight">Cost</GradientText>
          <p className="text-sm text-[var(--text-muted)]">{subtitle}</p>
        </Stack>
        <Cluster gap="2" align="center" className="flex-wrap">
          <DateRangePicker value={range} onChange={setRange} />
          <BillingSourceToggle value={source} onChange={setSource} busy={refreshing} />
          {canExport && (
            <button type="button" onClick={() => setShowExport(true)} disabled={!org} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-2)] disabled:opacity-50">
              <Download className="size-3.5" /> Export
            </button>
          )}
        </Cluster>
      </Cluster>
    </div>
  );

  if (!permsLoading && !canViewCost) {
    return (
      <Stack gap="6">
        {Header}
        <EmptyState icon={<Lock className="size-5" />} title="Cost data is restricted"
          description="You don't have permission to view cost and token usage. Ask an org admin to grant you the 'View cost & token usage' permission." />
      </Stack>
    );
  }

  if (loading || !org) {
    if (error) {
      return (
        <Stack gap="6">{Header}
          <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
            <Cluster gap="2" align="center"><AlertTriangle className="size-4 text-[var(--danger-ink)]" /><p className="text-sm text-[var(--danger-ink)]">{error}</p></Cluster>
          </Card>
        </Stack>
      );
    }
    return <CostSkeleton header={Header} />;
  }

  const ScopeSwitcher = (
    <Cluster gap="3" align="center" className="flex-wrap">
      <Segmented<CostScope> ariaLabel="Cost scope" size="md" value={scope} onChange={setScope}
        options={[{ value: "org", label: "Organization" }, { value: "domain", label: "Domain" }, { value: "repo", label: "Repository" }]} />
      {scope === "domain" && domainOpts.length > 0 && <ScopePicker label="Domain" value={domainId ?? domainOpts[0]!.value} onChange={setDomainId} options={domainOpts} />}
      {scope === "repo" && repoOpts.length > 0 && <ScopePicker label="Repository" value={repoId ?? repoOpts[0]!.value} onChange={setRepoId} options={repoOpts} />}
    </Cluster>
  );

  const openDomain = (id: string) => { setDomainId(id); setScope("domain"); };
  const openRepo = (id: string) => { setRepoId(id); setScope("repo"); };

  return (
    <Stack gap="6">
      {Header}
      {ScopeSwitcher}

      <div className={cn("transition-opacity duration-200", refreshing && "pointer-events-none opacity-60")}>
        {scope === "org" && (
          <CostOrgTabs data={org} credit={credit} source={source} fromISO={range.from} toISO={range.to}
            canAttribution={canAttribution} canBudgets={canBudgets} onSetBudget={setBudgetTarget}
            onOpenDomain={openDomain} onOpenRepo={openRepo} />
        )}
        {scope === "domain" && (
          domainOpts.length === 0 ? (
            <EmptyState title="No domains with spend" description="Domain-level cost appears once a capability accrues spend in this window." />
          ) : !scoped ? (
            <ScopeSkeleton />
          ) : (
            <CostDomainView data={scoped} name={selectedDomain?.name ?? "Domain"} budget={selectedDomain?.budget ?? 0}
              canAttribution={canAttribution} canBudgets={canBudgets} onSetBudget={setBudgetTarget} />
          )
        )}
        {scope === "repo" && (
          repoOpts.length === 0 ? (
            <EmptyState title="No repos with ingestion spend" description="Per-repo ingestion cost appears here after a sync in this window." />
          ) : !scoped ? (
            <ScopeSkeleton />
          ) : (
            <CostRepoView data={scoped} name={selectedRepo?.name ?? "Repository"} cycles={cycles} />
          )
        )}
      </div>

      {showExport && (
        <CostExportReport data={scope === "org" ? org : scoped ?? org} credit={credit} source={source}
          orgName={org.scope.name ?? "Organization"} onClose={() => setShowExport(false)} />
      )}

      <SetBudgetDialog orgId={activeOrgId} target={budgetTarget} onOpenChange={(o) => { if (!o) setBudgetTarget(null); }}
        onSaved={async () => { await refetchOrg(); }} />
    </Stack>
  );
}

function ScopePicker({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm">
      <span className="text-xs font-medium text-[var(--text-subtle)]">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="max-w-[240px] truncate bg-transparent text-sm font-medium text-[var(--text)] focus:outline-none">
        {options.map((o) => <option key={o.value} value={o.value} className="bg-[var(--surface)] text-[var(--text)]">{o.label}</option>)}
      </select>
    </label>
  );
}

function CostSkeleton({ header }: { header: React.ReactNode }) {
  return (
    <Stack gap="6" aria-busy="true" aria-label="Loading cost summary">
      {header}
      <div className="h-9 w-80 animate-pulse rounded-lg bg-[var(--surface-2)]" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-32 w-full animate-pulse rounded-xl bg-[var(--surface-2)]" />)}
      </div>
      <div className="h-28 w-full animate-pulse rounded-xl bg-[var(--surface-2)]" />
      <div className="h-[320px] w-full animate-pulse rounded-xl bg-[var(--surface-2)]" />
    </Stack>
  );
}

function ScopeSkeleton() {
  return (
    <Stack gap="5" aria-busy="true">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-32 w-full animate-pulse rounded-xl bg-[var(--surface-2)]" />)}
      </div>
      <div className="h-[260px] w-full animate-pulse rounded-xl bg-[var(--surface-2)]" />
    </Stack>
  );
}

/** Set (or clear) the monthly budget for a domain. cost:budgets_manage gated by the caller. */
function SetBudgetDialog({ orgId, target, onOpenChange, onSaved }: {
  orgId: string | null; target: BudgetTarget | null; onOpenChange: (open: boolean) => void; onSaved: () => Promise<void> | void;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (target) setValue(target.current ? String(Math.round(target.current)) : ""); }, [target]);
  const parsed = Number(value);
  const canSave = !saving && Number.isFinite(parsed) && parsed > 0 && !!orgId;
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || !target || !orgId) return;
    setSaving(true);
    try {
      await api.cost.setBudget(orgId, { domain_id: target.id, usd: parsed });
      await onSaved();
      toast.success(`Budget set: ${target.name} → $${parsed.toLocaleString()}/mo.`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save budget.");
    } finally { setSaving(false); }
  };
  return (
    <Dialog.Root open={!!target} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-sm" />
        <Dialog.Content className="glass fixed left-1/2 top-1/2 z-50 w-[min(92vw,440px)] -translate-x-1/2 -translate-y-1/2 rounded-xl p-5 shadow-[var(--shadow-3)]">
          <div className="-mx-5 -mt-5 mb-4 flex items-start justify-between border-b border-[var(--border)] bg-gradient-to-b from-[var(--surface-2)] to-transparent px-5 py-3">
            <div>
              <Dialog.Title className="text-base font-semibold">Set monthly budget</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-[var(--text-muted)]">{target?.name ?? ""} · agents refuse new runs once this domain hits its budget.</Dialog.Description>
            </div>
            <Dialog.Close className="-mr-1 inline-flex size-7 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]" aria-label="Close"><X className="size-4" /></Dialog.Close>
          </div>
          <form onSubmit={onSubmit}>
            <Stack gap="3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Budget (USD / month)</span>
                <div className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 focus-within:border-[var(--primary)] focus-within:ring-2 focus-within:ring-[var(--ring)]">
                  <span className="text-sm font-semibold text-[var(--text-muted)]">$</span>
                  <input type="number" inputMode="numeric" min={0} step={50} value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 1500" className="w-full bg-transparent text-sm focus:outline-none" autoFocus required />
                </div>
              </label>
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
                <Button type="submit" disabled={!canSave}>{saving ? <Loader2 className="size-3.5 animate-spin" /> : null}Save budget</Button>
              </div>
            </Stack>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
