"use client";

/**
 * usePermissions — gate UI on the ACTIVE org's effective permission set.
 *
 * Permissions come from `/v1/me` (resolved server-side from the org's
 * data-driven role rows; the owner gets everything). Always gate on
 * permission strings, never on role names — roles are org-defined,
 * renameable, and deletable.
 *
 * `legacyRoleFallback`: orgs created before the roles migration (and the
 * mock backend) don't send `permissions`. For those, a small role-name
 * map keeps the historical admin surfaces usable until `/v1/me` catches
 * up. New code should not extend this map.
 */

import { useCallback, useMemo } from "react";

import { useSession } from "@/lib/session/SessionProvider";

const LEGACY_ADMINISH_ROLES = new Set(["owner", "admin", "ws_admin"]);

const LEGACY_ROLE_GRANTS: Record<string, ReadonlySet<string>> = {
  // Only the gates the FE actually checks need an entry here.
  "members:invite": LEGACY_ADMINISH_ROLES,
  "members:role_change": LEGACY_ADMINISH_ROLES,
  "members:deactivate": LEGACY_ADMINISH_ROLES,
  "members:read": new Set(["owner", "admin", "ws_admin", "engineer", "reviewer", "auditor"]),
  "roles:manage": new Set(["owner", "admin"]),
  "org:manage": new Set(["owner", "admin"]),
  "domains:manage": new Set(["owner", "admin"]),
  "api_tokens:manage_org": new Set(["owner", "admin"]),
  "billing:manage": new Set(["owner"]),
  "org:transfer_ownership": new Set(["owner"]),
};

export interface OrgPermissions {
  /** True when the active-org role grants the permission. */
  can: (permission: string) => boolean;
  /** The raw effective permission set (empty while /me is loading). */
  permissions: ReadonlySet<string>;
  /** True until /me has resolved — callers can render skeletons. */
  loading: boolean;
}

export function usePermissions(): OrgPermissions {
  const { me, activeOrgId } = useSession();
  const membership = me?.memberships.find((m) => m.orgId === activeOrgId);

  const permissions = useMemo(
    () => new Set(me?.permissions ?? []),
    [me],
  );

  const can = useCallback(
    (permission: string): boolean => {
      if (membership?.isOwner) return true;
      if (permissions.size > 0) return permissions.has(permission);
      const legacy = LEGACY_ROLE_GRANTS[permission];
      return legacy != null && membership != null && legacy.has(membership.role);
    },
    [permissions, membership],
  );

  return { can, permissions, loading: me == null };
}
