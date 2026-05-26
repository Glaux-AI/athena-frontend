"use client";

/**
 * /settings/notifications — per-event-type → channel routing.
 *
 * The BE stores one row per `(org_id, event)` with a list of channels +
 * an audience selector. The PATCH is a full-replace (delete-then-upsert)
 * so this page edits a local copy and saves the whole set in one shot.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { useSession } from "@/lib/session/SessionProvider";
import { api, ApiError, type NotificationRule } from "@/lib/api/client";
import { cn } from "@/lib/cn";

/** Canonical event set surfaced in the FE picker. The BE accepts any
 * string in `event`, but a closed list keeps the UI predictable; users
 * can still send unknown events via the API directly. Sourced from
 * `04-backend/api-design.md` §SSE events + `dataflow-architecture.md`
 * §inbox kinds. */
const KNOWN_EVENTS: { id: string; label: string; description: string }[] = [
  { id: "gate_pending",          label: "Gate pending",          description: "An agent run paused waiting for human approval." },
  { id: "run_failed",            label: "Run failed",            description: "An agent run hit an unrecoverable error." },
  { id: "clarification_pending", label: "Clarification pending", description: "Agent needs answers before continuing." },
  { id: "integration_degraded",  label: "Integration degraded",  description: "GitHub / Jira / Slack auth needs reattention." },
  { id: "ci_failed",             label: "CI failed",             description: "A PR's CI pipeline failed." },
  { id: "pr_review_requested",   label: "PR review requested",   description: "A reviewer was tagged on a PR Athena opened." },
  { id: "budget_alert",          label: "Budget alert",          description: "Spend crossed a configured threshold." },
  { id: "mention",               label: "@mention",              description: "Someone @-mentioned you in a chat or comment." },
  { id: "digest",                label: "Weekly digest",         description: "Recurring summary of the org's activity." },
];

const CHANNELS = ["email", "in_app", "slack", "pagerduty", "teams", "webhook"] as const;
type Channel = (typeof CHANNELS)[number];

const AUDIENCES = [
  { id: "owner",      label: "Owners" },
  { id: "admins",     label: "Owners + admins" },
  { id: "members",    label: "All members" },
  { id: "mentioned",  label: "Mentioned users only" },
] as const;

export default function NotificationsPage() {
  const { activeOrgId } = useSession();
  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!activeOrgId) return;
    setLoading(true);
    try {
      const r = await api.notifications.routing(activeOrgId);
      setRules(r);
      setDirty(false);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load notification rules.");
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const setChannel = (eventId: string, channel: Channel, on: boolean) => {
    setRules((prev) => {
      const next = prev.map((r) => {
        if (r.event !== eventId) return r;
        const channels = on
          ? Array.from(new Set([...r.channels, channel])) as NotificationRule["channels"]
          : r.channels.filter((c) => c !== channel) as NotificationRule["channels"];
        return { ...r, channels };
      });
      return next;
    });
    setDirty(true);
  };

  const setAudience = (eventId: string, audience: string) => {
    setRules((prev) => prev.map((r) => (r.event === eventId ? { ...r, audience } : r)));
    setDirty(true);
  };

  const addRule = (eventId: string) => {
    if (rules.some((r) => r.event === eventId)) return;
    setRules((prev) => [
      ...prev,
      { event: eventId, channels: ["email"], audience: "members" },
    ]);
    setDirty(true);
  };

  const removeRule = (eventId: string) => {
    setRules((prev) => prev.filter((r) => r.event !== eventId));
    setDirty(true);
  };

  const onSave = async () => {
    if (!activeOrgId) return;
    setSaving(true);
    try {
      const updated = await api.notifications.replaceRouting(activeOrgId, rules);
      setRules(updated);
      setDirty(false);
      toast.success(`Saved ${updated.length} routing rule${updated.length === 1 ? "" : "s"}.`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save rules.");
    } finally {
      setSaving(false);
    }
  };

  const unused = KNOWN_EVENTS.filter((e) => !rules.some((r) => r.event === e.id));

  return (
    <Stack gap="6">
      <Stack gap="1">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Pick which events Athena tells you about and through which channels.
          The audience selector controls who in the org gets each notification.
        </p>
      </Stack>

      {error && (
        <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger)]">{error}</p>
        </Card>
      )}

      {loading ? (
        <NotificationsSkeleton />
      ) : (
        <Stack gap="4">
          {rules.length === 0 ? (
            <Card>
              <Stack gap="2">
                <p className="text-sm text-[var(--text-muted)]">
                  No notification rules configured. Add one from the picker below to start receiving alerts.
                </p>
              </Stack>
            </Card>
          ) : (
            <Card>
              <Stack gap="0">
                {rules.map((rule, idx) => (
                  <RuleRow
                    key={rule.event}
                    rule={rule}
                    isFirst={idx === 0}
                    onChannel={(c, on) => setChannel(rule.event, c, on)}
                    onAudience={(a) => setAudience(rule.event, a)}
                    onRemove={() => removeRule(rule.event)}
                  />
                ))}
              </Stack>
            </Card>
          )}

          {unused.length > 0 && (
            <Card>
              <Stack gap="3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                  Add a rule
                </h2>
                <div className="flex flex-wrap gap-2">
                  {unused.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => addRule(e.id)}
                      title={e.description}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-2)]"
                    >
                      <Plus className="size-3" />
                      {e.label}
                    </button>
                  ))}
                </div>
              </Stack>
            </Card>
          )}

          <Cluster gap="2" justify="end">
            <Button variant="ghost" onClick={() => void refresh()} disabled={!dirty || saving}>
              Discard
            </Button>
            <Button onClick={() => void onSave()} disabled={!dirty || saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save changes
            </Button>
          </Cluster>
        </Stack>
      )}
    </Stack>
  );
}

function RuleRow({
  rule,
  isFirst,
  onChannel,
  onAudience,
  onRemove,
}: {
  rule: NotificationRule;
  isFirst: boolean;
  onChannel: (c: Channel, on: boolean) => void;
  onAudience: (a: string) => void;
  onRemove: () => void;
}) {
  const known = KNOWN_EVENTS.find((e) => e.id === rule.event);
  return (
    <div className={cn("flex flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between", !isFirst && "border-t border-[var(--border)]")}>
      <Stack gap="0" className="lg:min-w-[200px]">
        <span className="text-sm font-medium">{known?.label ?? rule.event}</span>
        {known?.description && (
          <span className="text-xs text-[var(--text-muted)]">{known.description}</span>
        )}
      </Stack>

      <Cluster gap="2" className="flex-wrap">
        {CHANNELS.map((ch) => {
          const on = rule.channels.includes(ch);
          return (
            <button
              key={ch}
              type="button"
              onClick={() => onChannel(ch, !on)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                on
                  ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                  : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]",
              )}
            >
              {ch.replace("_", " ")}
            </button>
          );
        })}
      </Cluster>

      <Cluster gap="2" align="center">
        <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <span>Audience</span>
          <select
            value={rule.audience}
            onChange={(e) => onAudience(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs"
          >
            {AUDIENCES.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
            {!AUDIENCES.some((a) => a.id === rule.audience) && (
              <option value={rule.audience}>{rule.audience}</option>
            )}
          </select>
        </label>
        <button
          type="button"
          aria-label={`Remove rule for ${known?.label ?? rule.event}`}
          onClick={onRemove}
          className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
        >
          <Trash2 className="size-4" />
        </button>
      </Cluster>
    </div>
  );
}

function NotificationsSkeleton() {
  return (
    <Card>
      <Stack gap="0" aria-busy="true" aria-label="Loading notification rules">
        {[0, 1, 2].map((i) => (
          <div key={i} className={cn("flex flex-col gap-3 py-3 lg:flex-row lg:items-center", i > 0 && "border-t border-[var(--border)]")}>
            <div className="h-4 w-40 animate-pulse rounded-md bg-[var(--surface-2)]" />
            <Cluster gap="2">
              {[0, 1, 2, 3].map((j) => (
                <div key={j} className="h-5 w-16 animate-pulse rounded-full bg-[var(--surface-2)]" />
              ))}
            </Cluster>
            <div className="h-6 w-32 animate-pulse rounded-md bg-[var(--surface-2)]" />
          </div>
        ))}
      </Stack>
    </Card>
  );
}
