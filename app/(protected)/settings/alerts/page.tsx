"use client";

/**
 * /settings/alerts - budgets & alerts configuration.
 *
 * Two stacked surfaces:
 *  1. Budgets - the org's monthly budget cap + a per-domain budget table
 *     (PUT /v1/orgs/{id}/cost/budget; enforcement already lives in the BE
 *     budget pyramid).
 *  2. Alert rules - configurable thresholds (% of budget) with a role-based
 *     audience and in-app / email channels. Each rule fires once per
 *     calendar month; email goes to active members whose role is selected
 *     (the org owner always receives alerts).
 *
 * Read gated on `notifications:read` (nav), saves gated on
 * `notifications:manage` (rules) / `org:manage` (budgets) - the BE enforces
 * both; the FE disables controls for read-only viewers.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
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
  type AlertSettings,
  type DomainBudget,
  type OrgRole,
} from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session/SessionProvider";
import { usePermissions } from "@/lib/session/use-permissions";

const THRESHOLD_PRESETS = [50, 80, 100];

/** The closed alert-category catalog - must mirror the BE's
 *  `athena/billing/alert_prefs.py::ALERT_CATEGORIES`. Everything is
 *  OPT-IN: a category left off fires no alert anywhere. */
const ALERT_CATEGORIES: { key: keyof AlertSettings; label: string; description: string }[] = [
  {
    key: "cost_badges",
    label: "Cost dashboard badges",
    description: "Org and per-domain budget utilization banners on the Cost page.",
  },
  {
    key: "ingest_anomaly",
    label: "Ingestion cost anomalies",
    description:
      "Inbox alert when ingestion cost spikes 3× the rolling 7-day average. (The 10× automatic ingest pause is a safety action and always runs.)",
  },
  {
    key: "credit_warning",
    label: "Credit balance warning",
    description:
      "Banner when 80% of monthly credits are used. Exhausted and spend-cap hard-stops always show - they block usage.",
  },
];

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
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!activeOrgId) return;
    setLoading(true);
    setError(null);
    try {
      const [ruleRows, roleRows, budgets, summary, prefs] = await Promise.all([
        api.alerts.listRules(activeOrgId),
        api.roles.list(activeOrgId),
        api.cost.domainBudgets(activeOrgId),
        api.cost.summary(),
        api.alerts.getSettings(activeOrgId),
      ]);
      setSettings(prefs);
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

  /** Per-rule validation + "this rule will never fire" diagnosis.
   *  `error` blocks save (mirrors the BE validators so the user never
   *  sees a 400); `warning` saves fine but flags a rule that can't fire
   *  in its current state. */
  const ruleIssue = (
    rule: AlertRule,
    idx: number,
  ): { level: "error" | "warning"; text: string } | null => {
    if (!Number.isInteger(rule.threshold_pct) || rule.threshold_pct < 1 || rule.threshold_pct > 1000) {
      return { level: "error", text: "Threshold must be a whole number between 1 and 1000." };
    }
    if (rule.channels.length === 0) {
      return { level: "error", text: "Select at least one channel - a rule with none notifies nobody." };
    }
    const isDup = rules.some(
      (other, i) =>
        i < idx &&
        other.kind === rule.kind &&
        (other.domain_id ?? null) === (rule.domain_id ?? null) &&
        other.threshold_pct === rule.threshold_pct,
    );
    if (isDup) {
      return { level: "error", text: "Duplicate of another rule on the same scope and threshold - remove one." };
    }
    if (rule.kind === "org_budget" && orgBudget == null) {
      return {
        level: "warning",
        text: "The organization has no monthly budget yet - this rule won't fire until you set one above.",
      };
    }
    if (rule.kind === "domain_budget") {
      const domain = domainBudgets.find((d) => d.domain_id === rule.domain_id);
      if (domain && domain.budget_mtd_usd == null) {
        return {
          level: "warning",
          text: `'${domain.name}' has no monthly budget yet - this rule won't fire until you set one above.`,
        };
      }
    }
    if (!rule.enabled) {
      return { level: "warning", text: "This rule is disabled and won't fire." };
    }
    return null;
  };

  const hasBlockingIssues = rules.some((r, i) => ruleIssue(r, i)?.level === "error");

  const saveRules = async () => {
    if (!activeOrgId || hasBlockingIssues) return;
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

  const toggleCategory = async (key: keyof AlertSettings, value: boolean) => {
    if (!activeOrgId || settings == null) return;
    const next = { ...settings, [key]: value };
    setSettings(next); // optimistic - reverted on failure
    try {
      setSettings(await api.alerts.replaceSettings(activeOrgId, next));
    } catch (e) {
      setSettings(settings);
      toast.error(e instanceof ApiError ? e.message : "Couldn't save alert settings.");
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

      <Card>
        <CardHeader>
          <CardTitle>Alert categories</CardTitle>
          <CardDescription>
            Every alert is opt-in - a category left off fires nothing,
            anywhere. Only credit-exhausted and spend-cap hard-stops (which
            block usage) always show.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Stack gap="3">
            {ALERT_CATEGORIES.map((cat) => (
              <Cluster key={cat.key} gap="3" align="start" className="flex-wrap">
                <label className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={settings?.[cat.key] ?? false}
                    disabled={!canManageRules || settings == null}
                    onChange={(e) => void toggleCategory(cat.key, e.target.checked)}
                    className="mt-0.5 accent-[var(--primary)]"
                  />
                  <span>
                    <span className="block text-sm font-medium">{cat.label}</span>
                    <span className="block text-xs text-[var(--text-muted)]">{cat.description}</span>
                  </span>
                </label>
              </Cluster>
            ))}
          </Stack>
        </CardContent>
      </Card>

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
            threshold. Email goes to active members whose role is selected -
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
                issue={ruleIssue(rule, idx)}
                onChange={(patch) => updateRule(idx, patch)}
                onRemove={() => removeRule(idx)}
              />
            ))}
            <Cluster gap="2" align="center">
              <Button variant="outline" size="sm" onClick={addRule} disabled={!canManageRules}>
                <Plus className="size-4" /> Add rule
              </Button>
              <Button
                size="sm"
                onClick={() => void saveRules()}
                disabled={!canManageRules || !dirty || hasBlockingIssues}
                loading={saving}
              >
                Save rules
              </Button>
              {dirty && !hasBlockingIssues && (
                <span className="text-xs text-[var(--text-muted)]">Unsaved changes</span>
              )}
              {hasBlockingIssues && (
                <span className="text-xs text-[var(--danger-ink)]">
                  Fix the highlighted rules to save.
                </span>
              )}
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
  issue,
  onChange,
  onRemove,
}: {
  rule: AlertRule;
  roles: OrgRole[];
  domains: DomainBudget[];
  disabled: boolean;
  issue: { level: "error" | "warning"; text: string } | null;
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
        "rounded-lg border bg-[var(--surface)] p-3",
        issue?.level === "error" ? "border-[var(--danger)]" : "border-[var(--border)]",
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

        <p className="text-xs text-[var(--text-muted)]">{describeRule(rule, domains)}</p>

        {issue && (
          <Cluster
            gap="1.5"
            align="center"
            className={cn(
              "rounded-md px-2 py-1.5",
              issue.level === "error"
                ? "bg-[var(--danger-soft)] text-[var(--danger-ink)]"
                : "bg-[var(--warning-soft)] text-[var(--warning-ink)]",
            )}
          >
            <AlertTriangle className="size-3.5 shrink-0" />
            <span className="text-xs">{issue.text}</span>
          </Cluster>
        )}
      </Stack>
    </div>
  );
}

/** Human-readable restatement of what a rule does - the user should be
 *  able to confirm intent without decoding the controls. */
function describeRule(rule: AlertRule, domains: DomainBudget[]): string {
  const scope =
    rule.kind === "org_budget"
      ? "the organization's monthly budget"
      : `'${domains.find((d) => d.domain_id === rule.domain_id)?.name ?? "unknown domain"}'s monthly budget`;
  const channels = [
    rule.channels.includes("in_app") ? "an inbox alert" : null,
    rule.channels.includes("email") ? "email" : null,
  ]
    .filter(Boolean)
    .join(" and ");
  const audience =
    rule.audience_roles.length > 0
      ? `the owner and everyone with the ${rule.audience_roles.join(", ")} role${rule.audience_roles.length > 1 ? "s" : ""}`
      : "the org owner";
  return `When spend reaches ${rule.threshold_pct}% of ${scope}, send ${channels || "nothing"} to ${audience}. Fires at most once per month.`;
}
