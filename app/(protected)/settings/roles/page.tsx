"use client";

/**
 * Settings → Roles & permissions — the org's fully data-driven RBAC
 * surface (admin-grade: every mutation needs `roles:manage`).
 *
 * Nothing is hardcoded: every assignable role is a row the org owns.
 * The page lists roles with usage counts, and swaps to an inline
 * editor (grouped permission picker) for create / edit / duplicate.
 * Deleting an in-use role demands a reassignment target so member
 * access never silently evaporates. The Owner is intentionally absent —
 * ownership is structural (transferred, never assigned).
 */

import { useCallback, useEffect, useState } from "react";
import { Copy, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Stack, Cluster } from "@/components/layout/primitives";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { RoleEditor, type RoleDraft } from "@/components/settings/roles/role-editor";
import { DeleteRoleDialog } from "@/components/settings/roles/delete-role-dialog";
import { useSession } from "@/lib/session/SessionProvider";
import { usePermissions } from "@/lib/session/use-permissions";
import {
  api,
  ApiError,
  type OrgRole,
  type PermissionCatalog,
} from "@/lib/api/client";

type View =
  | { mode: "list" }
  | { mode: "create"; draft?: RoleDraft }
  | { mode: "edit"; role: OrgRole };

export default function RolesPage() {
  const { activeOrgId } = useSession();
  const { can } = usePermissions();
  const canManage = can("roles:manage");

  const [roles, setRoles] = useState<OrgRole[] | null>(null);
  const [catalog, setCatalog] = useState<PermissionCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ mode: "list" });
  const [deleting, setDeleting] = useState<OrgRole | null>(null);

  const load = useCallback(async () => {
    if (!activeOrgId) return;
    try {
      const [r, c] = await Promise.all([
        api.roles.list(activeOrgId),
        api.roles.catalog(activeOrgId),
      ]);
      setRoles(r);
      setCatalog(c);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load roles");
    }
  }, [activeOrgId]);

  useEffect(() => { void load(); }, [load]);

  const closeEditor = async () => {
    setView({ mode: "list" });
    await load();
  };

  const totalPermissions =
    catalog?.org.reduce((n, g) => n + g.permissions.length, 0) ?? 0;

  return (
    <Stack gap="4">
      <SettingsPageHeader
        title="Roles & permissions"
        subtitle="Define what each role can do. Roles are fully yours — rename, re-permission, or delete any of them."
        action={
          canManage && view.mode === "list" ? (
            <Button size="sm" onClick={() => setView({ mode: "create" })} data-testid="new-role">
              <Plus className="size-3.5" />
              New role
            </Button>
          ) : undefined
        }
      />

      {error && (
        <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger-ink)]">{error}</p>
        </Card>
      )}

      {!canManage && roles !== null && (
        <Card>
          <p className="text-sm text-[var(--text-muted)]">
            You can see this org&rsquo;s roles, but changing them needs the
            {" "}<strong>Manage roles &amp; permissions</strong> grant — ask an admin.
          </p>
        </Card>
      )}

      {view.mode === "list" && (
        roles === null || catalog === null ? (
          <RolesSkeleton />
        ) : roles.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="size-5" />}
            title="No roles yet"
            description="Create your first role to control what members can do. New orgs are normally seeded with a starter set."
            action={
              canManage ? (
                <Button size="sm" onClick={() => setView({ mode: "create" })}>
                  <Plus className="size-3.5" />
                  New role
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Stack gap="2">
            {roles.map((role) => (
              <RoleRow
                key={role.id}
                role={role}
                totalPermissions={totalPermissions}
                canManage={canManage}
                onEdit={() => setView({ mode: "edit", role })}
                onDuplicate={() =>
                  setView({
                    mode: "create",
                    draft: {
                      name: `${role.name} (copy)`,
                      description: role.description ?? "",
                      permissions: role.permissions,
                    },
                  })
                }
                onDelete={() => setDeleting(role)}
              />
            ))}
            <p className="px-1 text-xs text-[var(--text-subtle)]">
              The org owner always has every permission and is never listed here —
              ownership moves only via Members → Transfer ownership.
            </p>
          </Stack>
        )
      )}

      {(view.mode === "create" || view.mode === "edit") && activeOrgId && catalog && (
        <RoleEditor
          orgId={activeOrgId}
          catalog={catalog.org}
          role={view.mode === "edit" ? view.role : null}
          initialDraft={view.mode === "create" ? view.draft : undefined}
          onSaved={closeEditor}
          onCancel={() => setView({ mode: "list" })}
        />
      )}

      {deleting && activeOrgId && roles && (
        <DeleteRoleDialog
          orgId={activeOrgId}
          role={deleting}
          otherRoles={roles.filter((r) => r.id !== deleting.id)}
          onClose={() => setDeleting(null)}
          onDeleted={async () => {
            setDeleting(null);
            await load();
          }}
        />
      )}
    </Stack>
  );
}

function RoleRow({
  role,
  totalPermissions,
  canManage,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  role: OrgRole;
  totalPermissions: number;
  canManage: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <Card variant="elevated" data-testid={`role-row-${role.name}`}>
      <CardContent>
        <Cluster gap="3" align="center" justify="between">
          <Stack gap="0.5" className="min-w-0">
            <Cluster gap="2" align="center">
              <span className="truncate text-sm font-semibold">{role.name}</span>
              {role.is_system && (
                <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                  Starter
                </span>
              )}
              {role.is_default_for_invite && (
                <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--primary)]">
                  Default for new members
                </span>
              )}
            </Cluster>
            {role.description && (
              <p className="truncate text-xs text-[var(--text-muted)]">{role.description}</p>
            )}
            <p className="text-xs text-[var(--text-subtle)]">
              {role.member_count} member{role.member_count === 1 ? "" : "s"}
              {role.pending_invitation_count > 0 &&
                ` · ${role.pending_invitation_count} pending invite${role.pending_invitation_count === 1 ? "" : "s"}`}
              {" · "}
              {role.permissions.length}/{totalPermissions} permissions
            </p>
          </Stack>
          {canManage && (
            <Cluster gap="1" className="shrink-0">
              <Button size="sm" variant="ghost" onClick={onEdit} data-testid={`edit-role-${role.name}`}>
                <Pencil className="size-3.5" />
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={onDuplicate} aria-label={`Duplicate ${role.name}`}>
                <Copy className="size-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onDelete}
                aria-label={`Delete ${role.name}`}
                className="text-[var(--danger)] hover:bg-[var(--danger-soft)]"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </Cluster>
          )}
        </Cluster>
      </CardContent>
    </Card>
  );
}

function RolesSkeleton() {
  return (
    <Stack gap="2" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <Card key={i}>
          <CardContent>
            <Stack gap="2">
              <div className="h-4 w-40 animate-pulse rounded bg-[var(--surface-2)]" />
              <div className="h-3 w-72 animate-pulse rounded bg-[var(--surface-2)]" />
              <div className="h-3 w-52 animate-pulse rounded bg-[var(--surface-2)]" />
            </Stack>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}
