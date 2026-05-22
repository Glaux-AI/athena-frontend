"use client";

/**
 * /settings/privacy — redaction, data retention, encryption,
 * residency, and BYOK controls.
 *
 * Everything an enterprise security review asks about, in one page.
 */

import { useEffect, useState } from "react";
import { Lock, Loader2, Database, Globe, Key } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { useSession } from "@/lib/session/SessionProvider";
import { api, ApiError, type PrivacySettings } from "@/lib/api/client";

export default function PrivacyPage() {
  const { activeOrgId } = useSession();
  const [privacy, setPrivacy] = useState<PrivacySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeOrgId) return;
    (async () => {
      try {
        const p = await api.privacy.get(activeOrgId);
        setPrivacy(p);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load privacy settings");
      } finally {
        setLoading(false);
      }
    })();
  }, [activeOrgId]);

  const toggle = async (classId: string, enabled: boolean) => {
    if (!activeOrgId) return;
    try {
      const updated = await api.privacy.update(activeOrgId, { redaction_class_id: classId, enabled });
      setPrivacy(updated);
      toast.success(`Redaction class ${enabled ? "enabled" : "disabled"}.`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't update redaction.");
    }
  };

  if (loading) return <Cluster gap="2" align="center"><Loader2 className="size-4 animate-spin text-[var(--text-muted)]" /><span className="text-sm text-[var(--text-muted)]">Loading…</span></Cluster>;
  if (error || !privacy) return <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]"><p className="text-sm text-[var(--danger)]">{error ?? "Not configured"}</p></Card>;

  return (
    <Stack gap="6">
      <Stack gap="1">
        <h1 className="text-2xl font-semibold">Privacy &amp; data handling</h1>
        <p className="text-sm text-[var(--text-muted)]">Redaction, retention windows, encryption, residency, BYOK.</p>
      </Stack>

      <Card>
        <Stack gap="3">
          <Cluster gap="2" align="center"><Lock className="size-4 text-[var(--text-muted)]" /><span className="text-sm font-semibold">Redaction before model calls</span></Cluster>
          <p className="text-xs text-[var(--text-muted)]">Pattern-match + entropy-detect sensitive values; mask or block before any content reaches a model. Last updated {privacy.redaction.last_updated} by {privacy.redaction.last_updated_by}.</p>
          <Stack gap="2" as="ul">
            {privacy.redaction.classes.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-md border border-[var(--border)] p-3 text-sm">
                <Stack gap="0" className="flex-1 min-w-0">
                  <span className="font-medium">{c.label}</span>
                  <span className="text-xs text-[var(--text-muted)]">{c.description}</span>
                </Stack>
                <label className="inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={c.enabled}
                    onChange={(e) => toggle(c.id, e.target.checked)}
                    className="size-4 rounded border-[var(--border-strong)]"
                  />
                  <span className="text-xs text-[var(--text-muted)]">{c.enabled ? "On" : "Off"}</span>
                </label>
              </li>
            ))}
          </Stack>
        </Stack>
      </Card>

      <Grid cols="auto-fit-280" gap="3">
        <Card>
          <Stack gap="2">
            <Cluster gap="2" align="center"><Database className="size-4 text-[var(--text-muted)]" /><span className="text-sm font-semibold">Data retention</span></Cluster>
            <dl className="space-y-1 text-xs">
              <KvRow label="Task artifacts" value={privacy.data_retention.task_artifacts} />
              <KvRow label="Chat history" value={privacy.data_retention.chat_history} />
              <KvRow label="Audit events" value={privacy.data_retention.audit_events} />
              <KvRow label="Raw context in prompts" value={privacy.data_retention.raw_customer_context_in_prompts} />
            </dl>
          </Stack>
        </Card>
        <Card>
          <Stack gap="2">
            <Cluster gap="2" align="center"><Key className="size-4 text-[var(--text-muted)]" /><span className="text-sm font-semibold">Encryption</span></Cluster>
            <dl className="space-y-1 text-xs">
              <KvRow label="At rest" value={privacy.encryption.at_rest} />
              <KvRow label="In transit" value={privacy.encryption.in_transit} />
              <KvRow label="BYOK" value={`${privacy.encryption.byok.enabled ? "On" : "Off"} — ${privacy.encryption.byok.status}`} />
              <KvRow label="BYOK provider" value={privacy.encryption.byok.provider} />
            </dl>
          </Stack>
        </Card>
        <Card>
          <Stack gap="2">
            <Cluster gap="2" align="center"><Globe className="size-4 text-[var(--text-muted)]" /><span className="text-sm font-semibold">Residency</span></Cluster>
            <dl className="space-y-1 text-xs">
              <KvRow label="Primary region" value={privacy.residency.primary_region} />
              <KvRow label="Available" value={privacy.residency.available.join(", ")} />
              <KvRow label="Model egress" value={privacy.residency.model_egress} />
            </dl>
          </Stack>
        </Card>
      </Grid>

    </Stack>
  );
}

function KvRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="text-right text-[var(--text)]">{value}</dd>
    </div>
  );
}
