"use client";

/**
 * <TaskProperties> - the one home for every work-item fact on the task detail
 * page (Work OS rehaul W8). A right-rail card of compact rows (label left,
 * value right), each inline-editable via the shared property controls
 * (`property-controls.tsx`) and the `<MemberPicker>` primitive:
 *
 *   Status / Priority / Due date / Estimate - the shared controls.
 *   Owner / Assignee / Reviewer              - MemberPicker (a live task always
 *       keeps an owner - clearing is server-rejected, so the picker only offers
 *       reassign; Unassign appears once the task is terminal).
 *   Team / Cycle / Labels / Domains          - the planning axes. The team +
 *       cycle rows hide entirely when the org has no teams; cycles load from
 *       the owning team.
 *   Budget (cost-gated) / "Athena runs this" (railed only) / Created by/at.
 *
 * The parent owns the task object + refetch: every mutation PATCHes (or
 * attaches/detaches a label) then calls `onChanged()`; failures surface as
 * toasts (the server's message verbatim - e.g. the owner-clear 409).
 */

import {
  forwardRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { ChevronDown, Settings2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import {
  ApiError,
  api,
  type Domain,
  type Member,
  type Task,
  type TaskPatchInput,
  type TaskType,
} from "@/lib/api/client";
import { Card, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Cluster, Stack } from "@/components/layout/primitives";
import { ActorAvatar } from "@/components/mascot/actor-avatar";
import { MemberPicker } from "@/components/ui/member-picker";
import {
  CycleControl,
  DueDateControl,
  EstimateControl,
  LabelsControl,
  PriorityControl,
  PropertyPopover,
  StatusControl,
} from "@/components/work/property-controls";
import { TaskDomainChips } from "@/components/work/task-domain-chips";
import { useOrgLabels, useTeamCycles, useTeams } from "@/hooks/use-work";
import { labelColorClass, splitLabelKey } from "@/lib/work/label-meta";
import { formatDateTime, formatUsd } from "@/lib/utils/format";
import { cn } from "@/lib/cn";

/** Every type except the plain `task` mints an AI stage rail (W1). The page
 *  and this card both key their AI affordances off this one predicate. */
export function isRailedTask(type: TaskType): boolean {
  return type !== "task";
}

export function TaskProperties({
  task,
  members,
  membersLoading = false,
  memberById,
  meId,
  domainById,
  onChanged,
}: {
  task: Task;
  members: Member[];
  membersLoading?: boolean;
  memberById: Map<string, Member>;
  meId: string | null;
  domainById: Map<string, Domain>;
  onChanged: () => void | Promise<void>;
}) {
  const railed = isRailedTask(task.type);
  const isTerminal = task.status === "done" || task.status === "cancelled";
  const teams = useTeams();
  const labels = useOrgLabels();
  const cycles = useTeamCycles(task.owning_team_id);
  const [busy, setBusy] = useState(false);

  const patch = async (body: TaskPatchInput, ok?: string) => {
    setBusy(true);
    try {
      await api.tasks.patch(task.id, body);
      if (ok) toast.success(ok);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save that change.");
    } finally {
      setBusy(false);
    }
  };

  const toggleLabel = async (labelId: string, next: boolean) => {
    try {
      if (next) await api.labels.attach(task.id, labelId);
      else await api.labels.detach(task.id, labelId);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't update the labels.");
    }
  };

  const owner = task.owner_user_id ? memberById.get(task.owner_user_id) ?? null : null;
  const assignee = task.assignee ? memberById.get(task.assignee) ?? null : null;
  const reviewer = task.reviewer_user_id
    ? memberById.get(task.reviewer_user_id) ?? null
    : null;
  const creator = task.created_by_user_id
    ? memberById.get(task.created_by_user_id) ?? null
    : null;
  const taskLabels = labels.data.filter((l) => task.label_ids.includes(l.id));
  // Cost is leadership-only: `spent_usd` is null without cost:read, so the
  // budget row renders only when a cost signal is actually visible.
  const showBudget = task.budget_usd !== null || task.spent_usd !== null;

  return (
    <Card>
      <Stack gap="0.5">
        <CardHeader rule className="mb-2">
          <Cluster gap="2" align="center">
            <Settings2 className="size-4 text-[var(--text-muted)]" aria-hidden />
            <span className="text-sm font-semibold">Properties</span>
          </Cluster>
        </CardHeader>

        <Row label="Status">
          <StatusControl
            value={task.status}
            railed={railed}
            onChange={(next) => patch({ status: next })}
          />
        </Row>

        <Row label="Priority">
          <PriorityControl
            value={task.priority}
            onChange={(next) => patch({ priority: next })}
          />
        </Row>

        <Row label="Due date">
          <DueDateControl
            value={task.target_date}
            onChange={(next) => patch({ target_date: next })}
          />
        </Row>

        <Row label="Estimate">
          <EstimateControl
            value={task.estimate_points}
            onChange={(next) => patch({ estimate_points: next })}
          />
        </Row>

        <Row label="Owner">
          <MemberPicker
            members={members}
            value={task.owner_user_id}
            loading={membersLoading}
            align="end"
            listLabel="Reassign to"
            contentClassName="w-64"
            onSelect={(m) => {
              if (m.user_id !== task.owner_user_id) {
                void patch(
                  { owner_user_id: m.user_id },
                  m.user_id === meId
                    ? "You're on it - you own this task."
                    : "Owner reassigned.",
                );
              }
            }}
            {...(meId && task.owner_user_id !== meId
              ? {
                  header: (close: () => void) => (
                    <PickerItem
                      onClick={() => {
                        close();
                        void patch(
                          { owner_user_id: meId },
                          "You're on it - you own this task.",
                        );
                      }}
                    >
                      <UserPlus className="size-3.5 text-[var(--primary)]" aria-hidden />
                      Pick up (assign to me)
                    </PickerItem>
                  ),
                }
              : {})}
            {...(task.owner_user_id && isTerminal
              ? {
                  // A LIVE task always keeps an owner (the server 409s a clear) -
                  // Unassign is only offered once the task is terminal.
                  footer: (close: () => void) => (
                    <>
                      <hr className="hr-horizon my-1" aria-hidden />
                      <PickerItem
                        onClick={() => {
                          close();
                          void patch({ owner_user_id: null }, "Owner cleared.");
                        }}
                      >
                        Unassign
                      </PickerItem>
                    </>
                  ),
                }
              : {})}
          >
            <PersonTrigger
              person={owner}
              set={task.owner_user_id !== null}
              emptyLabel="Assign"
              ariaLabel={owner ? `Reassign owner (now ${owner.display_name})` : "Assign an owner"}
              disabled={busy}
            />
          </MemberPicker>
        </Row>

        <Row label="Assignee">
          <MemberPicker
            members={members}
            value={task.assignee}
            loading={membersLoading}
            align="end"
            listLabel="Members"
            contentClassName="w-64"
            onSelect={(m) => {
              if (m.user_id !== task.assignee) {
                void patch({ assignee: m.user_id });
              }
            }}
            {...(meId && task.assignee !== meId
              ? {
                  header: (close: () => void) => (
                    <PickerItem
                      onClick={() => {
                        close();
                        void patch({ assignee: meId });
                      }}
                    >
                      <UserPlus className="size-3.5 text-[var(--primary)]" aria-hidden />
                      Assign to me
                    </PickerItem>
                  ),
                }
              : {})}
            {...(task.assignee
              ? {
                  footer: (close: () => void) => (
                    <>
                      <hr className="hr-horizon my-1" aria-hidden />
                      <PickerItem
                        onClick={() => {
                          close();
                          void patch({ assignee: null });
                        }}
                      >
                        Unassign
                      </PickerItem>
                    </>
                  ),
                }
              : {})}
          >
            <PersonTrigger
              person={assignee}
              set={task.assignee !== null}
              emptyLabel="Assign"
              ariaLabel={
                assignee ? `Change assignee (now ${assignee.display_name})` : "Assign someone"
              }
              disabled={busy}
            />
          </MemberPicker>
        </Row>

        <Row
          label="Reviewer"
          {...(railed ? { hint: "Signs off hard gates" } : {})}
        >
          <MemberPicker
            members={members}
            value={task.reviewer_user_id}
            loading={membersLoading}
            align="end"
            listLabel="Members"
            contentClassName="w-64"
            onSelect={(m) => {
              if (m.user_id !== task.reviewer_user_id) {
                void patch({ reviewer_user_id: m.user_id });
              }
            }}
            {...(task.reviewer_user_id
              ? {
                  footer: (close: () => void) => (
                    <>
                      <hr className="hr-horizon my-1" aria-hidden />
                      <PickerItem
                        onClick={() => {
                          close();
                          void patch({ reviewer_user_id: null });
                        }}
                      >
                        Clear
                      </PickerItem>
                    </>
                  ),
                }
              : {})}
          >
            <PersonTrigger
              person={reviewer}
              set={task.reviewer_user_id !== null}
              emptyLabel="Anyone"
              ariaLabel={
                reviewer
                  ? `Change reviewer (now ${reviewer.display_name})`
                  : "Set a reviewer"
              }
              disabled={busy}
            />
          </MemberPicker>
        </Row>

        {/* Team + Cycle only exist once the org has teams - a teamless org
            never sees the rows (cycles are a per-team concept). */}
        {teams.data.length > 0 && (
          <>
            <Row label="Team">
              <TeamSelect
                teams={teams.data}
                value={task.owning_team_id}
                disabled={busy}
                onChange={(next) => void patch({ owning_team_id: next })}
              />
            </Row>
            <Row label="Cycle">
              <CycleControl
                value={task.cycle_id}
                cycles={cycles.data}
                onChange={(next) => patch({ cycle_id: next })}
              />
            </Row>
          </>
        )}

        <Row label="Labels">
          <LabelsControl
            value={task.label_ids}
            labels={labels.data}
            onToggle={toggleLabel}
            {...(taskLabels.length > 0
              ? {
                  trigger: (
                    <span className="flex max-w-full flex-wrap items-center justify-end gap-1">
                      {taskLabels.map((l) => {
                        const { prefix, value } = splitLabelKey(l.key);
                        return (
                          <span
                            key={l.id}
                            className={cn(
                              "inline-flex items-center rounded px-1.5 py-0.5 text-micro font-medium",
                              labelColorClass(l.color),
                            )}
                          >
                            {prefix && <span className="mr-0.5 opacity-60">{prefix}:</span>}
                            {value}
                          </span>
                        );
                      })}
                    </span>
                  ),
                }
              : {})}
          />
        </Row>

        <Row label="Domains">
          {task.domain_ids.length > 0 ? (
            <span className="flex flex-wrap items-center justify-end gap-1">
              <TaskDomainChips domainIds={task.domain_ids} byId={domainById} />
            </span>
          ) : (
            <span className="px-1 text-xs text-[var(--text-subtle)]">None</span>
          )}
        </Row>

        {showBudget && (
          <Row label="Budget">
            <span className="px-1 text-[13px] tabular-nums text-[var(--text)]">
              {task.spent_usd !== null ? formatUsd(task.spent_usd) : "0"}
              {task.budget_usd !== null && (
                <span className="text-[var(--text-subtle)]"> / {formatUsd(task.budget_usd)}</span>
              )}
            </span>
          </Row>
        )}

        {/* "Run with Athena" is a delegation toggle, never an identity - and it
            only exists on railed tasks (a plain task has no stages to run). */}
        {railed && (
          <Row label="Athena runs this">
            <Switch
              size="sm"
              checked={task.ai_delegated}
              disabled={busy}
              aria-label="Athena runs this"
              onCheckedChange={() =>
                void patch(
                  { ai_delegated: !task.ai_delegated },
                  task.ai_delegated
                    ? "Handed back to a human."
                    : "Athena will run this task.",
                )
              }
            />
          </Row>
        )}

        <Row label="Created">
          <span className="px-1 text-right text-xs text-[var(--text-muted)]">
            {creator ? `${creator.display_name} · ` : ""}
            {formatDateTime(task.created_at)}
          </span>
        </Row>
      </Stack>
    </Card>
  );
}

/** One compact property row: label left, inline-editable value right. */
function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="py-0.5">
      <div className="flex min-h-7 items-center justify-between gap-3">
        <span className="shrink-0 text-xs text-[var(--text-muted)]">{label}</span>
        <div className="flex min-w-0 items-center justify-end text-[13px]">{children}</div>
      </div>
      {hint && (
        <p className="-mt-0.5 text-right text-micro text-[var(--text-subtle)]">{hint}</p>
      )}
    </div>
  );
}

/** Compact person trigger for the Owner / Assignee / Reviewer pickers. `set`
 *  but unresolvable (roster still loading / removed user) renders "Assigned",
 *  never the misleading empty state. Forwards the ref + props Radix injects
 *  (it is the `Popover.Trigger asChild` child - a plain component would
 *  swallow the onClick and the popover would never open). */
const PersonTrigger = forwardRef<
  HTMLButtonElement,
  {
    person: Member | null;
    set: boolean;
    emptyLabel: string;
    ariaLabel: string;
  } & ButtonHTMLAttributes<HTMLButtonElement>
>(function PersonTrigger({ person, set, emptyLabel, ariaLabel, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      {...rest}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-[13px] text-[var(--text)]",
        "transition-colors hover:bg-[var(--surface-2)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50",
      )}
    >
      {person ? (
        <>
          <ActorAvatar name={person.display_name} size={16} />
          <span className="max-w-[130px] truncate">{person.display_name}</span>
        </>
      ) : set ? (
        <>
          <ActorAvatar name="Member" size={16} />
          <span className="text-[var(--text-muted)]">Assigned</span>
        </>
      ) : (
        <span className="text-xs text-[var(--text-subtle)]">{emptyLabel}</span>
      )}
      <ChevronDown className="size-3 shrink-0 text-[var(--text-subtle)]" aria-hidden />
    </button>
  );
});

/** Row inside the pickers' header/footer slots (Assign to me / Unassign). */
function PickerItem({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[var(--text)] transition-colors",
        "hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
      )}
    >
      {children}
    </button>
  );
}

/** Team - a small popover select over the org's teams + "No team". */
function TeamSelect({
  teams,
  value,
  disabled,
  onChange,
}: {
  teams: { id: string; name: string }[];
  value: string | null;
  disabled: boolean;
  onChange: (next: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = teams.find((t) => t.id === value) ?? null;
  return (
    <PropertyPopover
      open={open}
      onOpenChange={setOpen}
      align="end"
      ariaLabel={current ? `Change team (now ${current.name})` : "Set a team"}
      disabled={disabled}
      trigger={
        <span
          className={cn(
            "text-[13px]",
            current ? "text-[var(--text)]" : "text-xs text-[var(--text-subtle)]",
          )}
        >
          {current ? current.name : "No team"}
        </span>
      }
    >
      {(close) => (
        <div role="menu">
          <TeamOption
            selected={value === null}
            muted
            onPick={() => {
              close();
              if (value !== null) onChange(null);
            }}
          >
            No team
          </TeamOption>
          {teams.map((t) => (
            <TeamOption
              key={t.id}
              selected={t.id === value}
              onPick={() => {
                close();
                if (t.id !== value) onChange(t.id);
              }}
            >
              {t.name}
            </TeamOption>
          ))}
        </div>
      )}
    </PropertyPopover>
  );
}

function TeamOption({
  selected,
  muted = false,
  onPick,
  children,
}: {
  selected: boolean;
  muted?: boolean;
  onPick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        muted ? "text-[var(--text-muted)]" : "text-[var(--text)]",
        selected && "bg-[var(--primary-soft)] text-[var(--primary)]",
        "hover:bg-[var(--surface-2)]",
      )}
    >
      {children}
    </button>
  );
}
