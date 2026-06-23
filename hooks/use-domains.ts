"use client";

/**
 * useDomains - the active org's domains, for resolving a task's domain_ids to
 * names/emblems (the cockpit domain chips) and for pickers. Soft-fails (domains
 * are additive: the surface still works without them). `byId` is the id->domain
 * lookup; `domains` is the ordered list for a picker.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { api, type Domain } from "@/lib/api/client";
import { useSession } from "@/lib/session/SessionProvider";

export interface UseDomainsResult {
  domains: Domain[];
  byId: Map<string, Domain>;
  isLoading: boolean;
  refresh: () => void;
}

export function useDomains(): UseDomainsResult {
  const { activeOrgId } = useSession();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const load = useCallback(
    async (cancelledRef?: { cancelled: boolean }) => {
      if (!activeOrgId) {
        if (!cancelledRef?.cancelled) {
          setDomains([]);
          setIsLoading(false);
        }
        return;
      }
      try {
        const res = await api.domains.list();
        if (!cancelledRef?.cancelled) setDomains(res);
      } catch {
        if (!cancelledRef?.cancelled) setDomains([]);
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

  const byId = useMemo(() => new Map(domains.map((d) => [d.id, d])), [domains]);

  return { domains, byId, isLoading, refresh: () => load() };
}
