"use client";

/**
 * /settings/agents - the Agent Registry (AR.1). Build custom agents (system
 * prompt + model + tools + sharing scope) and pick them per-turn in chat.
 *
 * Any member who can chat may build PRIVATE agents; sharing to a domain or
 * org-wide needs the "Share custom agents" permission. The list shows agents
 * visible to the caller; edit/delete is gated to the owner (or leadership with
 * agents:manage_any).
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot, Pencil, Plus, Trash2 } from "lucide-react";

import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { AgentEditor } from "@/components/settings/agents/agent-editor";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip } from "@/components/ui/tooltip";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { usePermissions } from "@/lib/session/use-permissions";
import { api, ApiError, type Agent, type AgentDetail } from "@/lib/api/client";
import { cn } from "@/lib/cn";

type View = { kind: "list" } | { kind: "editor"; initial: AgentDetail | null };

const VISIBILITY_PILL: Record<Agent["visibility"], string> = {
  private: "bg-[var(--surface-2)] text-[var(--text-muted)]",
  domain: "bg-[var(--primary-soft)] text-[var(--primary)]",
  org: "bg-[var(--success-soft)] text-[var(--success-ink)]",
};
const VISIBILITY_LABEL: Record<Agent["visibility"], string> = {
  private: "Private",
  domain: "Domains",
  org: "Org-wide",
};

export default function AgentsPage() {
  const { can } = usePermissions();
  const canAuthor = can("agents:author");
  const canPublish = can("agents:publish");
  const canManageAny = can("agents:manage_any");

  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: "list" });
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setAgents(await api.agents.list());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load agents.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openEdit = async (id: string) => {
    try {
      setBusyId(id);
      const detail = await api.agents.get(id);
      setView({ kind: "editor", initial: detail });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to open agent.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (a: Agent) => {
    if (!window.confirm(`Delete the "${a.name}" agent? This can't be undone.`)) return;
    try {
      setBusyId(a.id);
      await api.agents.delete(a.id);
      toast.success("Agent deleted");
      await reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to delete agent.");
    } finally {
      setBusyId(null);
    }
  };

  if (view.kind === "editor") {
    return (
      <Stack gap="6">
        <SettingsPageHeader
          title={view.initial ? "Edit agent" : "New agent"}
          subtitle="A custom agent runs in chat with your system prompt, model, and tools."
        />
        <AgentEditor
          initial={view.initial}
          canPublish={canPublish}
          onCancel={() => setView({ kind: "list" })}
          onSaved={() => {
            setView({ kind: "list" });
            void reload();
          }}
        />
      </Stack>
    );
  }

  return (
    <Stack gap="6">
      <SettingsPageHeader
        title="Custom agents"
        subtitle="Build agents with your own prompt + tools, then pick them in chat."
        action={
          canAuthor ? (
            <Button onClick={() => setView({ kind: "editor", initial: null })} data-testid="agents-new">
              <Plus className="size-4" />New agent
            </Button>
          ) : undefined
        }
      />

      {error && (
        <Card className="border-[var(--danger)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger-ink)]">{error}</p>
        </Card>
      )}

      {loading ? (
        <Grid cols="auto-fit-320" gap="4" aria-busy="true" aria-label="Loading agents">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <Stack gap="3">
                <div className="h-4 w-40 animate-pulse rounded-md bg-[var(--surface-2)]" />
                <div className="h-3 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
                <div className="h-3 w-1/2 animate-pulse rounded-md bg-[var(--surface-2)]" />
              </Stack>
            </Card>
          ))}
        </Grid>
      ) : agents.length === 0 ? (
        <EmptyState
          icon={<Bot className="size-6" />}
          title="No custom agents yet"
          description={
            canAuthor
              ? "Build an agent with its own system prompt and tools, then pick it in chat."
              : "Ask a teammate with build access to create one, or check back later."
          }
          {...(canAuthor
            ? {
                action: (
                  <Button onClick={() => setView({ kind: "editor", initial: null })}>
                    <Plus className="size-4" />New agent
                  </Button>
                ),
              }
            : {})}
        />
      ) : (
        <Grid cols="auto-fit-320" gap="4">
          {agents.map((a) => {
            const editable = a.is_owner || canManageAny;
            return (
              <Card key={a.id} className="h-full">
                <Stack gap="3">
                  <Cluster justify="between" align="start">
                    <Stack gap="0">
                      <h3 className="text-base font-semibold leading-tight">{a.name}</h3>
                      <span className="text-xs text-[var(--text-muted)]">{a.slug}</span>
                    </Stack>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", VISIBILITY_PILL[a.visibility])}>
                      {VISIBILITY_LABEL[a.visibility]}
                    </span>
                  </Cluster>
                  <Tooltip content={a.description || "No description."} className="max-w-xs text-xs">
                    <p className="line-clamp-2 min-h-[2.5rem] text-sm text-[var(--text-muted)]">
                      {a.description || "No description."}
                    </p>
                  </Tooltip>
                  <Cluster gap="3" align="center" className="text-xs text-[var(--text-muted)]">
                    <span><strong className="text-[var(--text)]">{a.tools.length}</strong> tools</span>
                    <span>·</span>
                    <span><strong className="text-[var(--text)]">{a.usage_count}</strong> uses</span>
                    {a.model_id && (<><span>·</span><span className="truncate">{a.model_id}</span></>)}
                  </Cluster>
                  {editable && (
                    <Cluster gap="2" justify="end" className="border-t border-[var(--border)] pt-3">
                      <Button variant="ghost" onClick={() => void openEdit(a.id)} disabled={busyId === a.id} data-testid={`agent-edit-${a.slug}`}>
                        <Pencil className="size-3.5" />Edit
                      </Button>
                      <Button variant="ghost" onClick={() => void remove(a)} disabled={busyId === a.id} className="text-[var(--danger)] hover:bg-[var(--danger-soft)]">
                        <Trash2 className="size-3.5" />Delete
                      </Button>
                    </Cluster>
                  )}
                </Stack>
              </Card>
            );
          })}
        </Grid>
      )}
    </Stack>
  );
}
