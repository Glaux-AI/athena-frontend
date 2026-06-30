"use client";

/**
 * Settings → Teams - manage the org's squads (the optional people-layer).
 *
 * A team is a roster + an ownership tag that gives a slice of work its own
 * board. It is NEVER an RBAC principal - joining or leaving a team can never
 * change who may execute or approve (that stays domain-scoped), so this surface
 * is purely about organizing people and ownership. An org that never creates a
 * team sees today's product unchanged; "Enable teams" seeds a starter General
 * team with everyone in it so the board is non-empty day one.
 */

import { useCallback, useEffect, useState } from "react";
import { CheckCheck, Play, Plus, Sparkles, Trash2, UsersRound, X } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/overlay";
import { EmptyState } from "@/components/ui/empty-state";
import { Cluster, Stack } from "@/components/layout/primitives";
import { ActorAvatar } from "@/components/mascot/actor-avatar";
import { MemberPicker } from "@/components/ui/member-picker";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { useMembers } from "@/hooks/use-members";
import { usePermissions } from "@/lib/session/use-permissions";
import {
  api,
  ApiError,
  type Cycle,
  type Member,
  type Team,
  type TeamDetail,
  type TeamMember,
  type TeamMemberRole,
} from "@/lib/api/client";

const INPUT_CLASS =
  "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]";

export default function TeamsPage() {
  const { can } = usePermissions();
  const canManage = can("team:manage");
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openNew, setOpenNew] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const t = await api.teams.list();
      setTeams(t);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load teams.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const seedDefault = async () => {
    setSeeding(true);
    try {
      await api.teams.seedDefault();
      toast.success("Teams enabled - a General team was created with everyone.");
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't enable teams.");
    } finally {
      setSeeding(false);
    }
  };

  return (
    <Stack gap="6">
      <SettingsPageHeader
        title="Teams"
        subtitle="Group people into squads that own work and get their own board. Teams never change who can do what - that stays with domains and roles."
        action={
          canManage && teams.length > 0 ? (
            <Button size="sm" onClick={() => setOpenNew(true)}>
              <Plus className="mr-1.5 size-4" aria-hidden />
              New team
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <TeamsSkeleton />
      ) : error ? (
        <p
          role="alert"
          className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger-ink)]"
        >
          {error}
        </p>
      ) : teams.length === 0 ? (
        <EmptyState
          icon={<UsersRound className="size-5" />}
          title="No teams yet"
          description="Teams are optional. Enable them to give each squad its own board, or stay as you are - nothing changes until you create one."
          action={
            canManage ? (
              <Cluster gap="2">
                <Button onClick={seedDefault} loading={seeding}>
                  <Sparkles className="mr-1.5 size-4" aria-hidden />
                  Enable teams
                </Button>
                <Button variant="outline" onClick={() => setOpenNew(true)}>
                  <Plus className="mr-1.5 size-4" aria-hidden />
                  Create a team
                </Button>
              </Cluster>
            ) : undefined
          }
        />
      ) : (
        <Stack gap="3">
          {teams.map((t) => (
            <TeamRow
              key={t.id}
              team={t}
              canManage={canManage}
              expanded={selected === t.id}
              onToggle={() => setSelected(selected === t.id ? null : t.id)}
              onChanged={load}
            />
          ))}
        </Stack>
      )}

      <NewTeamModal
        open={openNew}
        onOpenChange={setOpenNew}
        onCreated={async (team) => {
          setOpenNew(false);
          await load();
          setSelected(team.id);
        }}
      />
    </Stack>
  );
}

/** One team in the list - a header row that expands to the roster + actions. */
function TeamRow({
  team,
  canManage,
  expanded,
  onToggle,
  onChanged,
}: {
  team: Team;
  canManage: boolean;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => Promise<void>;
}) {
  return (
    <Card className="p-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 rounded-[inherit] px-4 py-3 text-left transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
          <UsersRound className="size-4.5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-[var(--text)]">
              {team.name}
            </span>
            {team.is_default && (
              <span className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                Default
              </span>
            )}
          </span>
          {team.description && (
            <span className="mt-0.5 block truncate text-xs text-[var(--text-subtle)]">
              {team.description}
            </span>
          )}
        </span>
        <span className="shrink-0 text-xs text-[var(--text-muted)]">
          {team.member_count} {team.member_count === 1 ? "member" : "members"}
        </span>
      </button>
      {expanded && (
        <TeamPanel team={team} canManage={canManage} onChanged={onChanged} />
      )}
    </Card>
  );
}

/** The expanded team editor - roster management + delete. */
function TeamPanel({
  team,
  canManage,
  onChanged,
}: {
  team: Team;
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const { members: orgMembers, isLoading: membersLoading } = useMembers();
  const [detail, setDetail] = useState<TeamDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // People already on this team are dropped from the add-picker's suggestions.
  const existingUserIds = new Set((detail?.members ?? []).map((m) => m.user_id));
  const candidates = orgMembers.filter((m) => !existingUserIds.has(m.user_id));

  const reload = useCallback(async () => {
    try {
      setDetail(await api.teams.get(team.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load this team.");
    }
  }, [team.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const addMember = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await api.teams.addMember(team.id, { email: selected.email });
      setSelected(null);
      await reload();
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't add that member.");
    } finally {
      setBusy(false);
    }
  };

  const setRole = async (m: TeamMember, role: TeamMemberRole) => {
    try {
      await api.teams.changeMemberRole(team.id, m.user_id, role);
      await reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't change the role.");
    }
  };

  const removeMember = async (m: TeamMember) => {
    try {
      await api.teams.removeMember(team.id, m.user_id);
      await reload();
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't remove that member.");
    }
  };

  const deleteTeam = async () => {
    try {
      await api.teams.remove(team.id);
      toast.success(`Deleted "${team.name}". Its tasks are now teamless.`);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't delete the team.");
    }
  };

  return (
    <div className="border-t border-[var(--border)] p-4">
      {error && (
        <p className="mb-3 text-sm text-[var(--danger-ink)]">{error}</p>
      )}
      {canManage && (
        <Cluster gap="2" align="start" className="mb-4">
          <div className="flex-1">
            <MemberPicker
              members={candidates}
              value={selected?.user_id ?? null}
              onSelect={setSelected}
              loading={membersLoading}
              disabled={busy}
              placeholder="Add someone - search by name or email…"
              listLabel="In your org"
              data-testid="team-add-member-picker"
              emptyState={
                candidates.length === 0 && orgMembers.length > 0
                  ? "Everyone in your org is already on this team."
                  : undefined
              }
            />
          </div>
          <Button size="sm" onClick={addMember} loading={busy} disabled={!selected}>
            Add
          </Button>
        </Cluster>
      )}

      <Stack gap="1">
        {(detail?.members ?? []).map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-[var(--surface-2)]"
          >
            <ActorAvatar name={m.display_name ?? m.email} size={28} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-[var(--text)]">
                {m.display_name ?? m.email}
              </span>
              {m.display_name && (
                <span className="block truncate text-xs text-[var(--text-subtle)]">
                  {m.email}
                </span>
              )}
            </span>
            {canManage ? (
              <select
                value={m.role}
                onChange={(e) => void setRole(m, e.target.value as TeamMemberRole)}
                aria-label={`Role for ${m.display_name ?? m.email}`}
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text)] focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              >
                <option value="lead">Lead</option>
                <option value="member">Member</option>
              </select>
            ) : (
              <span className="text-xs capitalize text-[var(--text-muted)]">{m.role}</span>
            )}
            {canManage && (
              <button
                type="button"
                onClick={() => void removeMember(m)}
                aria-label={`Remove ${m.display_name ?? m.email}`}
                className="inline-flex size-7 items-center justify-center rounded-md text-[var(--text-subtle)] transition-colors hover:bg-[var(--danger-soft)] hover:text-[var(--danger-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
        ))}
        {detail && detail.members.length === 0 && (
          <p className="px-2 py-1.5 text-sm text-[var(--text-subtle)]">
            No members yet - add someone by email above.
          </p>
        )}
      </Stack>

      <CyclesSection teamId={team.id} canManage={canManage} />

      {canManage && (
        <div className="mt-4 flex justify-end border-t border-[var(--border)] pt-3">
          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="mr-1.5 size-3.5 text-[var(--danger-ink)]" aria-hidden />
            Delete team
          </Button>
        </div>
      )}

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete "${team.name}"?`}
        description="The team's tasks become teamless (nothing is lost). This can't be undone."
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setConfirmDelete(false);
                void deleteTeam();
              }}
            >
              Delete team
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--text)]">{team.name}</p>
      </Modal>
    </div>
  );
}

function NewTeamModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (team: Team) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName("");
    setDescription("");
  };

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const team = await api.teams.create({
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      reset();
      await onCreated(team);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't create the team.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      title="New team"
      description="Give your squad a name. You can add members and configure its board next."
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={create} loading={busy} disabled={!name.trim()}>
            Create team
          </Button>
        </>
      }
    >
      <Stack gap="3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void create();
            }}
            placeholder="Platform, Growth, Mobile…"
            className={INPUT_CLASS}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
            Description <span className="text-[var(--text-subtle)]">(optional)</span>
          </span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this squad owns"
            className={INPUT_CLASS}
          />
        </label>
      </Stack>
    </Modal>
  );
}

/** Sprint/cycle management for a team - list + create + start + complete. */
function CyclesSection({ teamId, canManage }: { teamId: string; canManage: boolean }) {
  const [cycles, setCycles] = useState<Cycle[] | null>(null);
  const [openNew, setOpenNew] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCycles(await api.cycles.listForTeam(teamId));
    } catch {
      setCycles([]);
    }
  }, [teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusyId(id);
    try {
      await fn();
      toast.success(ok);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "That didn't work.");
    } finally {
      setBusyId(null);
    }
  };

  if (cycles === null) return null;

  return (
    <div className="mt-4 border-t border-[var(--border)] pt-4">
      <Cluster justify="between" align="center" className="mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Sprints
        </span>
        {canManage && (
          <Button size="sm" variant="ghost" onClick={() => setOpenNew(true)}>
            <Plus className="mr-1 size-3.5" aria-hidden />
            New sprint
          </Button>
        )}
      </Cluster>

      {cycles.length === 0 ? (
        <p className="text-xs text-[var(--text-subtle)]">
          No sprints yet. Create one to plan and track work in time-boxes.
        </p>
      ) : (
        <Stack gap="1.5">
          {cycles.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 rounded-md border border-[var(--border)] px-3 py-2"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm text-[var(--text)]">{c.name}</span>
                  <CycleStateBadge state={c.state} />
                </span>
                <span className="mt-0.5 block text-xs text-[var(--text-subtle)]">
                  {c.summary.completed_points}/{c.summary.committed_points} pts done
                  {c.summary.over_capacity && (
                    <span className="ml-1.5 text-[var(--warning-ink)]">over capacity</span>
                  )}
                  {c.summary.unpointed_count > 0 && (
                    <span className="ml-1.5">· {c.summary.unpointed_count} unpointed</span>
                  )}
                </span>
              </span>
              {canManage && c.state === "planned" && (
                <Button
                  size="sm"
                  variant="outline"
                  loading={busyId === c.id}
                  onClick={() =>
                    void act(c.id, () => api.cycles.start(c.id), "Sprint started.")
                  }
                >
                  <Play className="mr-1 size-3.5" aria-hidden />
                  Start
                </Button>
              )}
              {canManage && c.state === "active" && (
                <Button
                  size="sm"
                  variant="outline"
                  loading={busyId === c.id}
                  onClick={() =>
                    void act(
                      c.id,
                      () => api.cycles.complete(c.id),
                      "Sprint completed - unfinished work moved to the backlog.",
                    )
                  }
                >
                  <CheckCheck className="mr-1 size-3.5" aria-hidden />
                  Complete
                </Button>
              )}
            </div>
          ))}
        </Stack>
      )}

      <CreateCycleModal
        teamId={teamId}
        open={openNew}
        onOpenChange={setOpenNew}
        onCreated={async () => {
          setOpenNew(false);
          await load();
        }}
      />
    </div>
  );
}

function CycleStateBadge({ state }: { state: Cycle["state"] }) {
  const cls =
    state === "active"
      ? "bg-[var(--primary-soft)] text-[var(--primary)]"
      : state === "completed"
        ? "bg-[var(--success-soft)] text-[var(--success-ink)]"
        : "bg-[var(--surface-3)] text-[var(--text-muted)]";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${cls}`}>
      {state}
    </span>
  );
}

function CreateCycleModal({
  teamId,
  open,
  onOpenChange,
  onCreated,
}: {
  teamId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.cycles.create(teamId, {
        name: name.trim(),
        ...(capacity.trim() ? { capacity_points: Number(capacity) } : {}),
      });
      setName("");
      setCapacity("");
      await onCreated();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't create the sprint.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      title="New sprint"
      description="A time-box for this team. Add tasks to it from the board; start it when you're ready."
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={create} loading={busy} disabled={!name.trim()}>
            Create sprint
          </Button>
        </>
      }
    >
      <Stack gap="3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sprint 24, Q3 W1…"
            className={INPUT_CLASS}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
            Capacity (points) <span className="text-[var(--text-subtle)]">(optional)</span>
          </span>
          <input
            type="number"
            min={0}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            placeholder="e.g. 40"
            className={INPUT_CLASS}
          />
        </label>
      </Stack>
    </Modal>
  );
}

function TeamsSkeleton() {
  return (
    <Stack gap="3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-16 animate-pulse rounded-xl bg-[var(--surface-2)]"
        />
      ))}
    </Stack>
  );
}
