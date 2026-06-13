"use client";

/**
 * DomainMembersTab - §5.30 per-domain access control, fine-grained.
 *
 * Lists every member attached to this domain + their access level:
 * `admin` (everything), `viewer` (read-only), or `custom` (a per-member
 * subset of the domain permissions - add repos, sync, edit/approve
 * blueprint, approve gates, manage members/settings/lifecycle).
 * Whoever holds the domain's `members:manage` permission (or an
 * org-wide admin) gets full controls: add by email, edit access,
 * remove. Anyone else gets the same list read-only.
 *
 * The permission catalog (labels + descriptions) comes from
 * `api.roles.catalog` so the BE stays the source of truth; a static
 * fallback keeps the tab usable against older backends.
 *
 * Add-by-email semantics: the email must belong to an existing user
 * with an active org membership. Unknown email returns 404 with the
 * `user_not_in_org` code - we surface that as an inline CTA pointing
 * at the org-invite flow.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Mail, Pencil, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";

import {
  api,
  ApiError,
  type DomainMember,
  type DomainRole,
  type PermissionEntry,
} from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Stack, Cluster } from "@/components/layout/primitives";
import { useSession } from "@/lib/session/SessionProvider";
import { cn } from "@/lib/cn";

interface Props {
  domainId: string;
  members: DomainMember[];
  /** Current viewer's user_id. Used to disable "remove yourself" + to flag
   *  the row visually so users can find themselves quickly. */
  currentUserId: string;
  /** True iff the current viewer can manage this cap's members (the
   *  domain `members:manage` permission, incl. org-wide admins). Drives
   *  whether the Add / Edit-access / Remove controls render. */
  canManage: boolean;
  /** Fired after a successful add / patch / remove. */
  onChanged: () => Promise<void> | void;
}

/** Static fallback when the catalog endpoint is unavailable (older BE). */
const DOMAIN_PERMISSION_FALLBACK: PermissionEntry[] = [
  { key: "repos:manage", label: "Manage repos", description: "Attach and detach repos.", danger: false },
  { key: "knowledge:sync", label: "Sync knowledge", description: "Trigger / cancel knowledge syncs.", danger: false },
  { key: "blueprint:edit", label: "Edit blueprint", description: "Edit sections and submit proposals.", danger: false },
  { key: "blueprint:approve", label: "Approve blueprint changes", description: "Accept / reject proposals and rebuild.", danger: false },
  { key: "gates:approve", label: "Approve task gates", description: "Decide stage gates on this domain's tasks.", danger: false },
  { key: "members:manage", label: "Manage members", description: "Add / remove members and configure access.", danger: false },
  { key: "settings:manage", label: "Manage settings", description: "Rename; budgets, models, and skills.", danger: false },
  { key: "lifecycle:manage", label: "Manage lifecycle", description: "Archive, delete, restore the domain.", danger: true },
];

function useDomainPermissionCatalog(): PermissionEntry[] {
  const { activeOrgId } = useSession();
  const [entries, setEntries] = useState<PermissionEntry[]>(DOMAIN_PERMISSION_FALLBACK);
  useEffect(() => {
    if (!activeOrgId) return;
    let cancelled = false;
    void api.roles
      .catalog(activeOrgId)
      .then((c) => {
        if (!cancelled && c.domain.length > 0) setEntries(c.domain);
      })
      .catch(() => { /* fallback already in place */ });
    return () => { cancelled = true; };
  }, [activeOrgId]);
  return entries;
}

export function DomainMembersTab({
  domainId,
  members,
  currentUserId,
  canManage,
  onChanged,
}: Props) {
  const catalog = useDomainPermissionCatalog();
  return (
    <Stack gap="4">
      {canManage && <AddMemberCard domainId={domainId} catalog={catalog} onAdded={onChanged} />}
      <MembersListCard
        domainId={domainId}
        members={members}
        currentUserId={currentUserId}
        canManage={canManage}
        catalog={catalog}
        onChanged={onChanged}
      />
    </Stack>
  );
}

/* --------------------------- Role controls --------------------------- */

const ROLE_CHOICES: { value: DomainRole; label: string; hint: string }[] = [
  { value: "viewer", label: "Viewer", hint: "Read-only" },
  { value: "custom", label: "Custom", hint: "Pick permissions" },
  { value: "admin", label: "Admin", hint: "Everything" },
];

function RoleToggle({
  role,
  onChange,
  disabled,
}: {
  role: DomainRole;
  onChange: (r: DomainRole) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex rounded-md border border-[var(--border)] bg-[var(--surface)] p-0.5 shadow-[var(--inner-highlight)]">
      {ROLE_CHOICES.map((r) => (
        <button
          key={r.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(r.value)}
          title={r.hint}
          className={cn(
            "rounded-[5px] px-3 py-1 text-xs font-medium transition-colors duration-150",
            role === r.value
              ? "bg-[var(--primary-soft)] text-[var(--primary-ink)] shadow-[var(--shadow-1)]"
              : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

function PermissionPicker({
  catalog,
  selected,
  onToggle,
}: {
  catalog: PermissionEntry[];
  selected: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-x-4 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 md:grid-cols-2">
      {catalog.map((p) => (
        <label
          key={p.key}
          className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--surface-2)]"
        >
          <input
            type="checkbox"
            checked={selected.has(p.key)}
            onChange={() => onToggle(p.key)}
            data-testid={`domain-perm-${p.key}`}
            className="mt-0.5 size-3.5 shrink-0 accent-[var(--primary)]"
          />
          <span className="min-w-0">
            <span className="block text-xs font-medium">{p.label}</span>
            <span className="block text-[11px] leading-snug text-[var(--text-muted)]">{p.description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

/* ----------------------------- Add member ---------------------------- */

function AddMemberCard({
  domainId,
  catalog,
  onAdded,
}: {
  domainId: string;
  catalog: PermissionEntry[];
  onAdded: () => Promise<void> | void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<DomainRole>("viewer");
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [notInOrg, setNotInOrg] = useState(false);

  const togglePermission = (key: string) =>
    setPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || saving) return;
    if (role === "custom" && permissions.size === 0) {
      toast.error("Pick at least one permission for a custom member - or use Viewer for read-only.");
      return;
    }
    setSaving(true);
    setNotInOrg(false);
    try {
      await api.domains.members.addByEmail(domainId, {
        email: email.trim(),
        role,
        ...(role === "custom" ? { permissions: [...permissions] } : {}),
      });
      toast.success(`Added ${email.trim()} as ${role}.`);
      setEmail("");
      setRole("viewer");
      setPermissions(new Set());
      await onAdded();
    } catch (e) {
      if (e instanceof ApiError && e.code === "user_not_in_org") {
        setNotInOrg(true);
      } else {
        toast.error(e instanceof ApiError ? e.message : "Couldn't add member.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <form onSubmit={onSubmit}>
        <Stack gap="3">
          <Cluster gap="2" align="center" className="border-b border-[var(--border)] pb-2">
            <UserPlus className="size-4 text-[var(--primary)]" aria-hidden />
            <span className="text-sm font-semibold">Add a member</span>
            <span className="text-xs text-[var(--text-muted)]">
              Must already be an org member.
            </span>
          </Cluster>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto]">
            <div className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 transition-[border-color,box-shadow] duration-150 focus-within:border-[var(--border-accent)] focus-within:ring-2 focus-within:ring-[var(--ring)]">
              <Mail className="size-3.5 text-[var(--text-subtle)]" aria-hidden />
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setNotInOrg(false); }}
                placeholder="teammate@yourorg.com"
                required
                className="w-full bg-transparent text-sm focus:outline-none"
              />
            </div>
            <RoleToggle role={role} onChange={setRole} disabled={saving} />
            <Button type="submit" disabled={saving || !email.trim()}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
              Add
            </Button>
          </div>
          {role === "custom" && (
            <PermissionPicker catalog={catalog} selected={permissions} onToggle={togglePermission} />
          )}
          {notInOrg && (
            <div className="rounded-md border border-[var(--warning)] bg-[var(--warning-soft)] p-2.5 text-xs">
              <Cluster gap="2" align="center">
                <span className="font-semibold text-[var(--warning-ink)]">
                  No Athena user with that email is in your org.
                </span>
                <Link
                  href="/settings/members"
                  className="ml-auto inline-flex items-center gap-1 font-semibold text-[var(--primary)] hover:underline"
                >
                  Invite to Athena →
                </Link>
              </Cluster>
              <p className="mt-1 text-[var(--text-muted)]">
                Invite them to the org first; once they accept you can add them to
                this domain.
              </p>
            </div>
          )}
        </Stack>
      </form>
    </Card>
  );
}

/* ----------------------------- Member list --------------------------- */

const ROLE_TONE: Record<DomainRole, string> = {
  admin:  "bg-[var(--primary-soft)] text-[var(--primary-ink)]",
  custom: "bg-[var(--success-soft)] text-[var(--success-ink)]",
  viewer: "bg-[var(--surface-2)]    text-[var(--text-muted)]",
};

function MembersListCard({
  domainId,
  members,
  currentUserId,
  canManage,
  catalog,
  onChanged,
}: {
  domainId: string;
  members: DomainMember[];
  currentUserId: string;
  canManage: boolean;
  catalog: PermissionEntry[];
  onChanged: () => Promise<void> | void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const onRemove = async (m: DomainMember) => {
    setPendingId(m.id);
    try {
      await api.domains.members.remove(domainId, m.user_id);
      toast.success(`Removed ${m.display_name ?? m.email}.`);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't remove member.");
    } finally {
      setPendingId(null);
    }
  };

  if (members.length === 0) {
    return (
      <EmptyState
        icon={<Users className="size-6" aria-hidden />}
        title="No members on this domain yet"
        description="Add a teammate by email above - full admin, read-only viewer, or a custom permission set."
      />
    );
  }

  const labelFor = (key: string) =>
    catalog.find((p) => p.key === key)?.label ?? key;

  return (
    <Card variant="elevated">
      <Stack gap="3">
        <Cluster gap="2" align="center" className="border-b border-[var(--border)] pb-2">
          <ShieldCheck className="size-4 text-[var(--primary)]" aria-hidden />
          <span className="text-sm font-semibold">Members</span>
          <span className="text-xs text-[var(--text-muted)]">{members.length} on this domain</span>
        </Cluster>
        <Stack gap="1.5" as="ul">
          {members.map((m) => {
            const isSelf = m.user_id === currentUserId;
            const initials = (m.display_name ?? m.email)
              .split(/\s+/)
              .map((p) => p[0])
              .slice(0, 2)
              .join("")
              .toUpperCase();
            return (
              <li
                key={m.id}
                className={cn(
                  "rounded-md border border-[var(--border)] bg-[var(--surface)] p-2.5 transition-colors duration-150 hover:bg-[var(--surface-2)]",
                  isSelf && "border-[var(--border-accent)] bg-[var(--primary-soft)]",
                )}
              >
                <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded-full bg-[var(--surface-2)] text-xs font-semibold text-[var(--text-muted)]">
                    {initials}
                  </div>
                  <Stack gap="0" className="min-w-0">
                    <Cluster gap="2" align="center">
                      <span className="truncate font-medium">{m.display_name ?? m.email}</span>
                      {isSelf && <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--primary)]">you</span>}
                    </Cluster>
                    <span className="truncate text-xs text-[var(--text-muted)]">{m.email}</span>
                    {m.role === "custom" && m.permissions.length > 0 && (
                      <Cluster gap="1" className="mt-1">
                        {m.permissions.map((p) => (
                          <span
                            key={p}
                            className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]"
                          >
                            {labelFor(p)}
                          </span>
                        ))}
                      </Cluster>
                    )}
                  </Stack>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", ROLE_TONE[m.role])}>
                    {m.role}
                  </span>
                  {canManage ? (
                    <Cluster gap="1" align="center">
                      <button
                        type="button"
                        onClick={() => setEditingId(editingId === m.id ? null : m.id)}
                        disabled={pendingId === m.id}
                        title="Edit access"
                        data-testid={`edit-access-${m.user_id}`}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:opacity-50"
                      >
                        <Pencil className="size-3" aria-hidden />
                        Edit access
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemove(m)}
                        disabled={pendingId === m.id || isSelf}
                        title={isSelf ? "You can't remove yourself" : "Remove from this domain"}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--danger)] disabled:opacity-40 disabled:hover:bg-transparent"
                      >
                        {pendingId === m.id ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" aria-hidden />}
                        Remove
                      </button>
                    </Cluster>
                  ) : (
                    <span className="text-[10px] text-[var(--text-subtle)]">view only</span>
                  )}
                </div>
                {editingId === m.id && canManage && (
                  <AccessEditor
                    domainId={domainId}
                    member={m}
                    catalog={catalog}
                    onClose={() => setEditingId(null)}
                    onSaved={async () => {
                      setEditingId(null);
                      await onChanged();
                    }}
                  />
                )}
              </li>
            );
          })}
        </Stack>
      </Stack>
    </Card>
  );
}

/* --------------------------- Access editor --------------------------- */

function AccessEditor({
  domainId,
  member,
  catalog,
  onClose,
  onSaved,
}: {
  domainId: string;
  member: DomainMember;
  catalog: PermissionEntry[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [role, setRole] = useState<DomainRole>(member.role);
  const [permissions, setPermissions] = useState<Set<string>>(
    () => new Set(member.role === "custom" ? member.permissions : []),
  );
  const [saving, setSaving] = useState(false);

  const toggle = (key: string) =>
    setPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const save = async () => {
    if (saving) return;
    if (role === "custom" && permissions.size === 0) {
      toast.error("Pick at least one permission - or use Viewer for read-only.");
      return;
    }
    setSaving(true);
    try {
      await api.domains.members.patch(domainId, member.user_id, {
        role,
        ...(role === "custom" ? { permissions: [...permissions] } : {}),
      });
      toast.success(`Updated access for ${member.display_name ?? member.email}.`);
      await onSaved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't update access.");
      setSaving(false);
    }
  };

  return (
    <Stack gap="2" className="mt-2 border-t border-[var(--border)] pt-2">
      <Cluster gap="2" align="center" justify="between">
        <RoleToggle role={role} onChange={setRole} disabled={saving} />
        <Cluster gap="1">
          <Button type="button" size="sm" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void save()}
            disabled={saving}
            loading={saving}
            data-testid="save-access"
          >
            Save
          </Button>
        </Cluster>
      </Cluster>
      {role === "custom" && (
        <PermissionPicker catalog={catalog} selected={permissions} onToggle={toggle} />
      )}
    </Stack>
  );
}
