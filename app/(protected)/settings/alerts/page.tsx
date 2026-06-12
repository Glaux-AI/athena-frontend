"use client";

/**
 * /settings/alerts — budgets & alerts configuration.
 *
 * Two stacked surfaces:
 *  1. Budgets — the org's monthly budget cap + a per-domain budget table
 *     (PUT /v1/orgs/{id}/cost/budget; enforcement already lives in the BE
 *     budget pyramid).
 *  2. Alert rules — configurable thresholds (% of budget) with a role-based
 *     audience and in-app / email channels. Each rule fires once per
 *     calendar month; email goes to active members whose role is selected
 *     (the org owner always receives alerts).
 *
 * Read gated on `notifications:read` (nav), saves gated on
 * `notifications:manage` (rules) / `org:manage` (budgets) — the BE enforces
 * both; the FE disables controls for read-only viewers.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Cluster, Stack } from "@/components/layout/primitives";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import {
  api,
  ApiError,
  type AlertRule,
  type DomainBudget,
  type OrgRole,
} from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session/SessionProvider";
import { usePermissions } from "@/lib/session/use-permissions";

const THRESHOLD_PRESETS = [50, 80, 100];

const inputCls =
  "w-24 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

export default function AlertsSettingsPage() {
  const { activeOrgId } = useSession();
  const { can } = usePermissions();
  const canManageRules = can("notifications:manage");
  const canManageBudgets = can("org:manage");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [roles, setRoles] = useState<OrgRole[]>([]);
  const [domainBudgets, setDomainBudgets] = useState<DomainBudget[]>([]);
  const [orgBudget, setOrgBudget] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!activeOrgId) return;
    setLoading(true);
    setError(null);
    try {
      const [ruleRows, roleRows, budgets, summary] = await Promise.all([
        api.alerts.listRules(activeOrgId),
        api.roles.list(activeOrgId),
        api.cost.domainBudgets(activeOrgId),
        api.cost.summary(),
      ]);
      setRules(ruleRows);
      setRoles(roleRows);
      setDomainBudgets(budgets);
      setOrgBudget(summary.budget_usd && summary.budget_usd > 0 ? summary.budget_usd : null);
      setDirty(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load alert settings.");
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateRule = (idx: number, patch: Partial<AlertRule>) => {
    setRules((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  const addRule = () => {
    setRules((prev) => [
      ...prev,
      {
        kind: "org_budget",
        domain_id: null,
        threshold_pct: 80,
        channels: ["in_app", "email"],
        audience_roles: [],
        enabled: true,
      },
    ]);
    setDirty(true);
  };

  const removeRule = (idx: number) => {
    setRules((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const saveRules = async () => {
    if (!activeOrgId) return;
    setSaving(true);
    try {
      const saved = await api.alerts.replaceRules(
        activeOrgId,
        rules.map((r) => ({
          ...r,
          domain_id: r.kind === "domain_budget" ? (r.domain_id ?? null) : null,
        })),
      );
      setRules(saved);
      setDirty(false);
      toast.success("Alert rules saved.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save alert rules.");
    } finally {
      setSaving(false);
    }
  };

  const saveBudget = async (domainId: string | null, usd: number | null) => {
    if (!activeOrgId) return;
    try {
      await api.cost.setBudget(activeOrgId, {
        ...(domainId ? { domain_id: domainId } : {}),
        usd,
      });
      toast.success(usd == null ? "Budget cleared." : `Budget set: $${usd.toLocaleString()}/mo.`);
      void load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save budget.");
    }
  };

  if (loading) {
    return (
      <Stack gap="4">
        <SettingsPageHeader title="Budgets & alerts" subtitle="Monthly budget caps and threshold alerts." />
        {[0, 1].map((i) => (
          <div key={i} className="h-48 animate-pulse rounded-lg border border-[var(--border)] bg-[var(--surface-2)]" />
        ))}
      </Stack>
    );
  }

  if (error) {
    return (
      <Stack gap="4">
        <SettingsPageHeader title="Budgets & alerts" subtitle="Monthly budget caps and threshold alerts." />
        <Card className="border-[var(--danger)] bg-[var(--danger-soft)]">
          <CardContent>
            <Cluster gap="2" align="center" className="py-3">
              <p className="text-sm text-[var(--danger-ink)]">{error}</p>
              <Button variant="outline" size="sm" onClick={() => void load()}>
                Retry
              </Button>
            </Cluster>
          </CardContent>
        </Card>
      </Stack>
    );
  }

  return (
    <Stack gap="4">
      <SettingsPageHeader
        title="Budgets & alerts"
        subtitle={
          <>
            Monthly budget caps (enforced before every AI call) and threshold
            alerts delivered in-app and by email. Spend lives on the{" "}
            <Link href="/cost" className="underline">
              cost dashboard
            </Link>
            .
          </>
        }
      />

      <BudgetsCard
        orgBudget={orgBudget}
        domainBudgets={domainBudgets}
        canManage={canManageBudgets}
        onSave={saveBudget}
      />

      <Card>
        <CardHeader>
          <CardTitle>Alert rules</CardTitle>
          <CardDescription>
            Each rule fires once per calendar month when spend crosses its
            threshold. Email goes to active members whose role is selected —
            the org owner always receives alerts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Stack gap="3">
            {rules.length === 0 && (
              <p className="text-sm text-[var(--text-muted)]">
                No alert rules configured. Add one to get notified before a
                budget is blown.
              </p>
            )}
            {rules.map((rule, idx) => (
              <RuleRow
                key={rule.id ?? `new-${idx}`}
                rule={rule}
                roles={roles}
                domains={domainBudgets}
                disabled={!canManageRules}
                onChange={(patch) => updateRule(idx, patch)}
                onRemove={() => removeRule(idx)}
              />
            ))}
            <Cluster gap="2">
              <Button variant="outline" size="sm" onClick={addRule} disabled={!canManageRules}>
                <Plus className="size-4" /> Add rule
              </Button>
              <Button size="sm" onClick={() => void saveRules()} disabled={!canManageRules || !dirty} loading={saving}>
                Save rules
              </Button>
            </Cluster>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

function BudgetsCard({
  orgBudget,
  domainBudgets,
  canManage,
  onSave,
}: {
  orgBudget: number | null;
  domainBudgets: DomainBudget[];
  canManage: boolean;
  onSave: (domainId: string | null, usd: number | null) => Promise<void>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Budget caps</CardTitle>
        <CardDescription>
          Calls that would push month-to-date spend past a cap are refused
          (<code>budget_exceeded</code>). Clear a field to remove the cap.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Stack gap="3">
          <BudgetRow
            label="Organization (all domains)"
            spentLabel={null}
            initial={orgBudget}
            disabled={!canManage}
            onSave={(usd) => onSave(null, usd)}
          />
          {domainBudgets.length > 0 && (
            <div className="border-t border-[var(--border)] pt-3">
              <p className="pb-2 text-xs font-medium uppercase tracking-wide text-[var(--text-subtle)]">
                Per-domain caps
              </p>
              <Stack gap="2">
                {domainBudgets.map((d) => (
                  <BudgetRow
                    key={d.domain_id}
                    label={d.name}
                    spentLabel={`$${d.spent_mtd_usd.toFixed(2)} spent this month`}
                    initial={d.budget_mtd_usd}
                    disabled={!canManage}
                    onSave={(usd) => onSave(d.domain_id, usd)}
                  />
                ))}
              </Stack>
            </div>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function BudgetRow({
  label,
  spentLabel,
  initial,
  disabled,
  onSave,
}: {
  label: string;
  spentLabel: string | null;
  initial: number | null;
  disabled: boolean;
  onSave: (usd: number | null) => Promise<void>;
}) {
  const [value, setValue] = useState(initial != null ? String(initial) : "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setValue(initial != null ? String(initial) : "");
  }, [initial]);

  const parsed = value.trim() === "" ? null : Number(value);
  const valid = parsed === null || (Number.isFinite(parsed) && parsed >= 0);
  const changed = (parsed ?? null) !== (initial ?? null);

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      await onSave(parsed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Cluster gap="3" align="center" className="flex-wrap">
      <div className="min-w-44 flex-1">
        <p className="text-sm">{label}</p>
        {spentLabel && <p className="text-xs text-[var(--text-muted)]">{spentLabel}</p>}
      </div>
      <Cluster gap="2" align="center">
        <span className="text-sm text-[var(--text-muted)]">$</span>
        <input
          type="number"
          min={0}
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="No cap"
          disabled={disabled}
          className={cn(inputCls, !valid && "border-[var(--danger)]")}
          aria-label={`Monthly budget for ${label}`}
        />
        <span className="text-sm text-[var(--text-muted)]">/mo</span>
        <Button size="sm" variant="outline" disabled={disabled || !valid || !changed} loading={busy} onClick={() => void save()}>
          Save
        </Button>
      </Cluster>
    </Cluster>
  );
}

function RuleRow({
  rule,
  roles,
  domains,
  disabled,
  onChange,
  onRemove,
}: {
  rule: AlertRule;
  roles: OrgRole[];
  domains: DomainBudget[];
  disabled: boolean;
  onChange: (patch: Partial<AlertRule>) => void;
  onRemove: () => void;
}) {
  const toggleChannel = (channel: "in_app" | "email") => {
    const has = rule.channels.includes(channel);
    onChange({
      channels: has ? rule.channels.filter((c) => c !== channel) : [...rule.channels, channel],
    });
  };

  const toggleRole = (name: string) => {
    const has = rule.audience_roles.includes(name);
    onChange({
      audience_roles: has
        ? rule.audience_roles.filter((r) => r !== name)
        : [...rule.audience_roles, name],
    });
  };

  return (
    <div
      className={cn(
        "rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3",
        !rule.enabled && "opacity-60",
      )}
    >
      <Stack gap="3">
        <Cluster gap="2" align="center" className="flex-wrap">
          <select
            value={rule.kind === "org_budget" ? "org" : (rule.domain_id ?? "")}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "org") onChange({ kind: "org_budget", domain_id: null });
              else onChange({ kind: "domain_budget", domain_id: v });
            }}
            disabled={disabled}
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            aria-label="Alert scope"
          >
            <option value="org">Org budget</option>
            {domains.map((d) => (
              <option key={d.domain_id} value={d.domain_id}>
                Domain: {d.name}
              </option>
            ))}
          </select>

          <Cluster gap="1" align="center">
            <span className="text-sm text-[var(--text-muted)]">at</span>
            <input
              type="number"
              min={1}
              max={1000}
              value={rule.threshold_pct}
              onChange={(e) => onChange({ threshold_pct: Number(e.target.value) })}
              disabled={disabled}
              className={cn(inputCls, "w-16")}
              aria-label="Alert threshold percent"
            />
            <span className="text-sm text-[var(--text-muted)]">% of budget</span>
          </Cluster>

          <Cluster gap="1">
            {THRESHOLD_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onChange({ threshold_pct: p })}
                disabled={disabled}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-xs transition-colors",
                  rule.threshold_pct === p
                    ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]",
                )}
              >
                {p}%
              </button>
            ))}
          </Cluster>

          <div className="ml-auto">
            <Cluster gap="2" align="center">
              <label className="flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(e) => onChange({ enabled: e.target.checked })}
                  disabled={disabled}
                  className="accent-[var(--primary)]"
                />
                Enabled
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={onRemove}
                disabled={disabled}
                aria-label="Remove rule"
                className="text-[var(--danger)] hover:bg-[var(--danger-soft)]"
              >
                <Trash2 className="size-4" />
              </Button>
            </Cluster>
          </div>
        </Cluster>

        <Cluster gap="4" className="flex-wrap">
          <Cluster gap="2" align="center">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-subtle)]">Channels</span>
            {(["in_app", "email"] as const).map((c) => (
              <label key={c} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={rule.channels.includes(c)}
                  onChange={() => toggleChannel(c)}
                  disabled={disabled}
                  className="accent-[var(--primary)]"
                />
                {c === "in_app" ? "In-app" : "Email"}
              </label>
            ))}
          </Cluster>

          <Cluster gap="1.5" align="center" className="flex-wrap">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-subtle)]">
              Notify roles
            </span>
            {roles.map((role) => {
              const selected = rule.audience_roles.includes(role.name);
              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => toggleRole(role.name)}
                  disabled={disabled}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                    selected
                      ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                      : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]",
                  )}
                  aria-pressed={selected}
                >
                  {role.name}
                </button>
              );
            })}
            <span className="text-xs text-[var(--text-subtle)]">owner always included</span>
          </Cluster>
        </Cluster>
      </Stack>
    </div>
  );
}
