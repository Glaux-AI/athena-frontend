"use client";

/**
 * useMembers - the active org's members, for resolving a task's owner id to a
 * person and for the assign/pick dropdown. Soft-fails (members are additive: the
 * surface still works without them). `byId` is the id→member lookup the board
 * tree and cockpit use to render an owner avatar/name.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { api, type Member } from "@/lib/api/client";
import { useSession } from "@/lib/session/SessionProvider";

export interface UseMembersResult {
  /** Active members only - the assign dropdown (you can't assign a deactivated user). */
  members: Member[];
  /** Lookup over ALL members incl. deactivated - so a task whose owner was later
   *  deactivated still resolves to a name/avatar instead of looking unowned. */
  byId: Map<string, Member>;
  isLoading: boolean;
  refresh: () => void;
}

export function useMembers(): UseMembersResult {
  const { activeOrgId } = useSession();
  const [all, setAll] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const load = useCallback(
    async (cancelledRef?: { cancelled: boolean }) => {
      if (!activeOrgId) {
        if (!cancelledRef?.cancelled) {
          setAll([]);
          setIsLoading(false);
        }
        return;
      }
      try {
        const res = await api.members.list(activeOrgId);
        if (!cancelledRef?.cancelled) setAll(res);
      } catch {
        if (!cancelledRef?.cancelled) setAll([]);
      } finally {
        if (!cancelledRef?.cancelled) setIsLoading(false);
      }
    },
    [activeOrgId],
  );

  useEffect(() => {
    const ref = { cancelled: false };
    setIsLoading(true);
    void load(ref);
    return () => {
      ref.cancelled = true;
    };
  }, [load]);

  const members = useMemo(
    () => all.filter((m) => m.deactivated_at === null),
    [all],
  );
  const byId = useMemo(() => new Map(all.map((m) => [m.user_id, m])), [all]);

  return { members, byId, isLoading, refresh: () => load() };
}
