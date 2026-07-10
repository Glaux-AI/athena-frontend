"use client";

/**
 * AgentsPanel - the Agent Registry (AR.1) list + inline editor. Build custom
 * agents (system prompt + model + tools + sharing scope) and pick them per-turn
 * in chat. Rendered as the "Agents" tab of the top-level `/agents` page.
 *
 * Any member who can chat may build PRIVATE agents; sharing to a domain or
 * org-wide needs the "Share custom agents" permission. The list shows agents
 * visible to the caller; edit/delete is gated to the owner (or leadership with
 * agents:manage_any).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Bot, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";

import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { AgentEditor } from "@/components/settings/agents/agent-editor";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { focusRing } from "@/components/ui/focus";
import { ConfirmDialog } from "@/components/ui/overlay";
import { Pill, type PillTone } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { usePermissions } from "@/lib/session/use-permissions";
import { api, ApiError, type Agent, type AgentDetail } from "@/lib/api/client";
import { cn } from "@/lib/cn";

type View = { kind: "list" } | { kind: "editor"; initial: AgentDetail | null };

const VISIBILITY_TONE: Record<Agent["visibility"], PillTone> = {
  private: "neutral",
  domain: "primary",
  org: "success",
};
const VISIBILITY_LABEL: Record<Agent["visibility"], string> = {
  private: "Private",
  domain: "Domains",
  org: "Org-wide",
};

export function AgentsPanel() {
  const { can } = usePermissions();
  const canAuthor = can("agents:author");
  const canPublish = can("agents:publish");
  const canManageAny = can("agents:manage_any");

  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: "list" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<Agent | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    try {
      setDeleting(true);
      setBusyId(a.id);
      await api.agents.delete(a.id);
      toast.success("Agent deleted");
      await reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to delete agent.");
    } finally {
      setDeleting(false);
      setBusyId(null);
      setConfirmTarget(null);
    }
  };

  if (view.kind === "editor") {
    return (
      <Stack gap="6">
        <SettingsPageHeader
          title={view.initial ? "Edit agent" : "New agent"}
          subtitle="A custom agent runs in chat with your system prompt, model, and tools."
          as="h2"
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
    <Stack gap="5">
      {canAuthor && (
        <Cluster justify="end">
          <Button onClick={() => setView({ kind: "editor", initial: null })} data-testid="agents-new">
            <Plus className="size-4" />New agent
          </Button>
        </Cluster>
      )}

      {error && (
        <div className="rounded-lg border border-[var(--border-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]">
          {error}
        </div>
      )}

      {loading ? (
        <Grid cols="auto-fit-320" gap="4" aria-busy="true" aria-label="Loading agents">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <Stack gap="3">
                <Skeleton className="h-4 w-40 rounded-md" />
                <Skeleton className="h-3 w-full rounded-md" />
                <Skeleton className="h-3 w-1/2 rounded-md" />
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
              <div key={a.id} className="relative h-full">
                <Card variant="moment" interactive={editable} className="h-full">
                  <Stack gap="3">
                    <Cluster justify="between" align="start">
                      <Stack gap="0">
                        <h3 className="text-base font-semibold leading-tight">{a.name}</h3>
                        <span className="text-xs text-[var(--text-muted)]">{a.slug}</span>
                      </Stack>
                      <Cluster gap="1" align="center" className={cn(editable && "mr-7")}>
                        <Pill size="sm" tone={VISIBILITY_TONE[a.visibility]}>
                          {VISIBILITY_LABEL[a.visibility]}
                        </Pill>
                      </Cluster>
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
                  </Stack>
                </Card>
                {editable && (
                  <>
                    {/* Whole card opens the editor (stretched click target). */}
                    <button
                      type="button"
                      onClick={() => void openEdit(a.id)}
                      disabled={busyId === a.id}
                      aria-label={`Edit ${a.name}`}
                      data-testid={`agent-edit-${a.slug}`}
                      className={cn("absolute inset-0 rounded-xl", focusRing)}
                    />
                    <AgentCardMenu
                      agent={a}
                      busy={busyId === a.id}
                      onEdit={() => void openEdit(a.id)}
                      onDelete={() => setConfirmTarget(a)}
                    />
                  </>
                )}
              </div>
            );
          })}
        </Grid>
      )}

      <ConfirmDialog
        open={confirmTarget != null}
        onClose={() => { if (!deleting) setConfirmTarget(null); }}
        onConfirm={() => { if (confirmTarget) void remove(confirmTarget); }}
        tone="danger"
        title={`Delete the "${confirmTarget?.name ?? ""}" agent?`}
        description="This can't be undone."
        confirmLabel="Delete agent"
        loading={deleting}
      />
    </Stack>
  );
}

/** Kebab menu (glass-panel) with Edit/Delete - sits above the stretched card link. */
function AgentCardMenu({
  agent, busy, onEdit, onDelete,
}: {
  agent: Agent;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close when focus/click leaves the menu.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="absolute right-3 top-3 z-10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${agent.name}`}
        className={cn(
          "inline-flex size-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
          focusRing,
        )}
      >
        <MoreVertical className="size-4" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="glass-panel absolute right-0 z-[var(--z-popover)] mt-1 w-36 p-1">
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onEdit(); }}
            className={cn("flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-[var(--text)] transition-colors hover:bg-[var(--surface-2)]", focusRing)}
          >
            <Pencil className="size-3.5" aria-hidden />Edit
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onDelete(); }}
            className={cn("flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-[var(--danger-ink)] transition-colors hover:bg-[var(--danger-soft)]", focusRing)}
          >
            <Trash2 className="size-3.5" aria-hidden />Delete
          </button>
        </div>
      )}
    </div>
  );
}
