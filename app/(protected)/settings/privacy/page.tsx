"use client";

/**
 * /settings/privacy — redaction (top), then tabbed Retention / Encryption /
 * Regions sections sourced from `GET /v1/orgs/{id}/privacy`. Per-field
 * PATCHes via `api.privacy.patch`. Encryption + Regions are read-only in
 * dev mode; Retention exposes numeric day inputs with sane bounds (§5.29.6).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Database, Globe, Key, Lock, RotateCcw, Download } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { useSession } from "@/lib/session/SessionProvider";
import { api, ApiError, type PrivacySettings } from "@/lib/api/client";
import { cn } from "@/lib/cn";

type RetentionField = "task_artifacts" | "chat_history" | "audit_events";
type TabId = "retention" | "encryption" | "regions";

const TABS: { id: TabId; label: string; icon: typeof Database }[] = [
  { id: "retention",  label: "Retention",  icon: Database },
  { id: "encryption", label: "Encryption", icon: Key },
  { id: "regions",    label: "Regions",    icon: Globe },
];

/* BE-canonical defaults — kept here so "Reset to industry defaults"
 * doesn't need to round-trip through a separate endpoint. Must match
 * `_DEFAULT_*` in athena-backend/athena/api/routers/privacy.py. */
const INDUSTRY_DEFAULTS = {
  task_artifacts: "90d",
  chat_history: "180d",
  audit_events: "7y",
  raw_customer_context_in_prompts: "never_stored",
} as const;

const FIELD_BOUNDS: Record<RetentionField, { min: number; max: number; help: string }> = {
  task_artifacts: { min: 1, max: 3650, help: "Spec/plan/code artifacts produced by a run. 1 day to 10 years." },
  chat_history:   { min: 1, max: 3650, help: "User ↔ Athena chat threads. 1 day to 10 years." },
  audit_events:   { min: 365, max: 3650, help: "Compliance audit log. SOX-style retention typically 7 years." },
};

export default function PrivacyPage() {
  const { activeOrgId } = useSession();
  const [privacy, setPrivacy] = useState<PrivacySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("retention");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!activeOrgId) return;
    (async () => {
      try {
        const p = await api.privacy.get(activeOrgId);
        setPrivacy(p);
      } catch (e) {
        setLoadError(e instanceof ApiError ? e.message : "Couldn't load privacy settings.");
      } finally {
        setLoading(false);
      }
    })();
  }, [activeOrgId]);

  const toggleRedactionClass = useCallback(async (classId: string, enabled: boolean) => {
    if (!activeOrgId || !privacy) return;
    const next = {
      ...privacy.redaction,
      classes: privacy.redaction.classes.map((c) => c.id === classId ? { ...c, enabled } : c),
    };
    try {
      const updated = await api.privacy.patch(activeOrgId, { redaction: next });
      setPrivacy(updated);
      toast.success(`Redaction class ${enabled ? "enabled" : "disabled"}.`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't update redaction.");
    }
  }, [activeOrgId, privacy]);

  const updateRetention = useCallback(async (field: RetentionField, days: number) => {
    if (!activeOrgId || !privacy) return;
    const next = { ...privacy.data_retention, [field]: `${days}d` };
    setSubmitting(true);
    try {
      const updated = await api.privacy.patch(activeOrgId, { data_retention: next });
      setPrivacy(updated);
      toast.success(`Retention updated.`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't update retention.");
    } finally {
      setSubmitting(false);
    }
  }, [activeOrgId, privacy]);

  const resetToDefaults = useCallback(async () => {
    if (!activeOrgId || !privacy) return;
    if (!window.confirm("Reset retention windows to industry defaults? Encryption and region settings are unaffected.")) return;
    setSubmitting(true);
    try {
      const updated = await api.privacy.patch(activeOrgId, { data_retention: INDUSTRY_DEFAULTS });
      setPrivacy(updated);
      toast.success("Reset to industry defaults.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't reset to defaults.");
    } finally {
      setSubmitting(false);
    }
  }, [activeOrgId, privacy]);

  const exportConfiguration = useCallback(() => {
    if (!privacy) return;
    const blob = new Blob([JSON.stringify(privacy, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `athena-privacy-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Configuration exported.");
  }, [privacy]);

  if (loading) return <PrivacySkeleton />;
  if (loadError || !privacy) {
    return (
      <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
        <p className="text-sm text-[var(--danger)]">{loadError ?? "Not configured."}</p>
      </Card>
    );
  }

  return (
    <Stack gap="6">
      <Stack gap="1">
        <h1 className="text-2xl font-semibold">Privacy &amp; data handling</h1>
        <p className="text-sm text-[var(--text-muted)]">Redaction, retention windows, encryption, and residency.</p>
      </Stack>

      <RedactionCard
        privacy={privacy}
        onToggle={(id, enabled) => void toggleRedactionClass(id, enabled)}
      />

      <Stack gap="3">
        <TabBar active={activeTab} onChange={setActiveTab} />
        <div role="tabpanel" aria-labelledby={`tab-${activeTab}`}>
          {activeTab === "retention"  && <RetentionTab privacy={privacy} submitting={submitting} onUpdate={updateRetention} />}
          {activeTab === "encryption" && <EncryptionTab privacy={privacy} />}
          {activeTab === "regions"    && <RegionsTab privacy={privacy} />}
        </div>
      </Stack>

      <Cluster gap="2" justify="end">
        <Button variant="outline" onClick={exportConfiguration}>
          <Download className="size-4" />
          Export configuration
        </Button>
        <Button variant="outline" onClick={() => void resetToDefaults()} disabled={submitting}>
          <RotateCcw className="size-4" />
          Reset to industry defaults
        </Button>
      </Cluster>
    </Stack>
  );
}

/* ============================ Sub-components ============================ */

function TabBar({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  return (
    <div role="tablist" aria-label="Privacy sections" className="flex gap-1 border-b border-[var(--border)]">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          id={`tab-${id}`}
          role="tab"
          aria-selected={active === id}
          aria-controls={`tabpanel-${id}`}
          onClick={() => onChange(id)}
          className={cn(
            "inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors",
            active === id
              ? "border-[var(--primary)] text-[var(--text)]"
              : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]",
          )}
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}

function RedactionCard({
  privacy,
  onToggle,
}: {
  privacy: PrivacySettings;
  onToggle: (id: string, enabled: boolean) => void;
}) {
  return (
    <Card>
      <Stack gap="3">
        <Cluster gap="2" align="center">
          <Lock className="size-4 text-[var(--text-muted)]" aria-hidden />
          <span className="text-sm font-semibold">Redaction before model calls</span>
        </Cluster>
        <p className="text-xs text-[var(--text-muted)]">
          Pattern-match + entropy-detect sensitive values; mask or block before any content reaches a model.
          Last updated {prettyTimestamp(privacy.redaction.last_updated)} by {privacy.redaction.last_updated_by}.
        </p>
        <Stack gap="2" as="ul">
          {privacy.redaction.classes.map((c) => (
            <li key={c.id} className="flex items-center justify-between rounded-md border border-[var(--border)] p-3 text-sm">
              <Stack gap="0" className="min-w-0 flex-1">
                <span className="font-medium">{c.label}</span>
                <span className="text-xs text-[var(--text-muted)]">{c.description}</span>
              </Stack>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={c.enabled}
                  onChange={(e) => onToggle(c.id, e.target.checked)}
                  className="size-4 accent-[var(--primary)]"
                />
                <span className="text-xs text-[var(--text-muted)]">{c.enabled ? "On" : "Off"}</span>
              </label>
            </li>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}

function RetentionTab({
  privacy,
  submitting,
  onUpdate,
}: {
  privacy: PrivacySettings;
  submitting: boolean;
  onUpdate: (field: RetentionField, days: number) => void;
}) {
  return (
    <Card>
      <Stack gap="4">
        <Cluster gap="2" align="center">
          <Database className="size-4 text-[var(--text-muted)]" aria-hidden />
          <span className="text-sm font-semibold">Data retention</span>
        </Cluster>
        <p className="text-xs text-[var(--text-muted)]">
          Each row is the maximum age Athena keeps that data class before automatic deletion.
          Enterprise tier: longer windows available on request.
        </p>
        <Stack gap="3">
          <RetentionRow
            field="task_artifacts"
            label="Task artifacts"
            description="Spec, plan, code patches, and review threads produced by a run."
            current={privacy.data_retention.task_artifacts}
            submitting={submitting}
            onSubmit={(d) => onUpdate("task_artifacts", d)}
          />
          <RetentionRow
            field="chat_history"
            label="Chat history"
            description="User ↔ Athena conversations and clarifications."
            current={privacy.data_retention.chat_history}
            submitting={submitting}
            onSubmit={(d) => onUpdate("chat_history", d)}
          />
          <RetentionRow
            field="audit_events"
            label="Audit events"
            description="Compliance-grade append-only log of every state change."
            current={privacy.data_retention.audit_events}
            submitting={submitting}
            onSubmit={(d) => onUpdate("audit_events", d)}
          />
          <ReadonlyRetentionRow
            label="Raw customer context in prompts"
            value={privacy.data_retention.raw_customer_context_in_prompts}
            description="Never persisted — content is forwarded only to the model and dropped from logs."
          />
        </Stack>
      </Stack>
    </Card>
  );
}

function RetentionRow({
  field,
  label,
  description,
  current,
  submitting,
  onSubmit,
}: {
  field: RetentionField;
  label: string;
  description: string;
  current: string;
  submitting: boolean;
  onSubmit: (days: number) => void;
}) {
  const bounds = FIELD_BOUNDS[field];
  const initial = useMemo(() => parseRetentionDays(current), [current]);
  const [draft, setDraft] = useState(initial);
  useEffect(() => { setDraft(initial); }, [initial]);
  const dirty = draft !== initial;
  const valid = Number.isFinite(draft) && draft >= bounds.min && draft <= bounds.max;
  return (
    <div className="rounded-md border border-[var(--border)] p-3">
      <Cluster justify="between" align="start" gap="3">
        <Stack gap="0" className="min-w-0 flex-1">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-[var(--text-muted)]">{description}</span>
          <span className="mt-1 text-[10px] text-[var(--text-subtle)]">{bounds.help}</span>
        </Stack>
        <Cluster gap="2" align="center">
          <input
            type="number"
            min={bounds.min}
            max={bounds.max}
            value={Number.isFinite(draft) ? draft : ""}
            onChange={(e) => setDraft(Number.parseInt(e.target.value, 10))}
            className={cn(
              "w-24 rounded-md border bg-[var(--surface)] px-2 py-1 text-right text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              valid ? "border-[var(--border)]" : "border-[var(--danger)]",
            )}
            aria-label={`${label} retention in days`}
          />
          <span className="text-xs text-[var(--text-muted)]">days</span>
          <Button
            size="sm"
            variant="outline"
            disabled={!dirty || !valid || submitting}
            onClick={() => onSubmit(draft)}
          >
            Save
          </Button>
        </Cluster>
      </Cluster>
    </div>
  );
}

function ReadonlyRetentionRow({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <Cluster justify="between" align="start" gap="3">
        <Stack gap="0" className="min-w-0 flex-1">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-[var(--text-muted)]">{description}</span>
        </Stack>
        <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {value === "never_stored" ? "Never stored" : value}
        </span>
      </Cluster>
    </div>
  );
}

function EncryptionTab({ privacy }: { privacy: PrivacySettings }) {
  return (
    <Card>
      <Stack gap="3">
        <Cluster gap="2" align="center">
          <Key className="size-4 text-[var(--text-muted)]" aria-hidden />
          <span className="text-sm font-semibold">Encryption</span>
        </Cluster>
        <p className="text-xs text-[var(--text-muted)]">
          Cryptographic boundaries Athena enforces in production. Read-only in dev — see Operations runbook for rotation cadence.
        </p>
        <Grid cols="auto-fit-260" gap="3">
          <KvCard label="At rest"   value={privacy.encryption.at_rest} />
          <KvCard label="In transit" value={privacy.encryption.in_transit} />
          <KvCard label="BYOK"      value={`${privacy.encryption.byok.enabled ? "On" : "Off"} · ${privacy.encryption.byok.status}`} />
          <KvCard label="BYOK provider" value={privacy.encryption.byok.provider} />
        </Grid>
      </Stack>
    </Card>
  );
}

function RegionsTab({ privacy }: { privacy: PrivacySettings }) {
  return (
    <Card>
      <Stack gap="3">
        <Cluster gap="2" align="center">
          <Globe className="size-4 text-[var(--text-muted)]" aria-hidden />
          <span className="text-sm font-semibold">Residency</span>
        </Cluster>
        <p className="text-xs text-[var(--text-muted)]">
          Athena pins customer data and model calls to the primary region. Read-only in dev mode — contact your CSM to change.
        </p>
        <Grid cols="auto-fit-260" gap="3">
          <KvCard label="Primary region" value={privacy.residency.primary_region} />
          <KvCard label="Available" value={privacy.residency.available.join(", ")} />
          <KvCard label="Model egress" value={privacy.residency.model_egress} />
        </Grid>
      </Stack>
    </Card>
  );
}

function KvCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] p-3">
      <Stack gap="1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{label}</span>
        <span className="text-sm text-[var(--text)]">{value}</span>
      </Stack>
    </div>
  );
}

function PrivacySkeleton() {
  return (
    <Stack gap="6" aria-busy="true" aria-label="Loading privacy settings">
      <Stack gap="1">
        <div className="h-7 w-72 animate-pulse rounded-md bg-[var(--surface-2)]" />
        <div className="h-4 w-96 animate-pulse rounded-md bg-[var(--surface-2)]" />
      </Stack>
      <Card>
        <Stack gap="3">
          <div className="h-4 w-56 animate-pulse rounded-md bg-[var(--surface-2)]" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
          ))}
        </Stack>
      </Card>
      <div className="h-9 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
      <div className="h-44 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
    </Stack>
  );
}

/* ================================ Helpers ================================ */

/** Parse the BE's retention string (`"90d" | "7y" | "never_stored"`) into
 * an integer day count for the numeric inputs. Returns `NaN` for
 * `never_stored` — callers gate that field as readonly. */
function parseRetentionDays(s: string): number {
  if (s === "never_stored") return Number.NaN;
  const trimmed = s.trim();
  const m = /^(\d+)([dy])$/i.exec(trimmed);
  if (!m) return Number.parseInt(trimmed, 10);
  const n = Number.parseInt(m[1]!, 10);
  return m[2]!.toLowerCase() === "y" ? n * 365 : n;
}

function prettyTimestamp(s: string): string {
  if (!s || s === "never") return "never";
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}
