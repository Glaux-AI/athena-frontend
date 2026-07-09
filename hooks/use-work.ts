"use client";

/**
 * Cockpit data-fetch hooks for `/work/[id]` - the canonical
 * `{ data, isLoading, error, refresh }` shape (the repo's useEffect+useState
 * fetch pattern; React Query isn't used on these surfaces). Each hook returns a
 * `refresh()` callback so the page can re-fetch a single slice when an SSE
 * signal lands (artifact_ready → re-fetch the artifact; thread_entry → re-fetch
 * the thread; phase_step → re-fetch the stages) without reloading the whole
 * cockpit. Params are serialized with `JSON.stringify` so the effect re-runs on
 * value change, not on fresh object identity (mirrors `hooks/use-tasks.ts`).
 */

import { useCallback, useEffect, useState } from "react";

import {
  ApiError,
  api,
  type Cycle,
  type Label,
  type LedgerStep,
  type RelatedArtifact,
  type SubtaskNode,
  type Task,
  type TaskStage,
  type TaskSuggestion,
  type TaskUsage,
  type Team,
  type ThreadEntry,
} from "@/lib/api/client";

interface UseResource<T> {
  data: T;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useTask(id: string): UseResource<Task | null> {
  const [data, setData] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (cancelledRef?: { cancelled: boolean }) => {
      try {
        const result = await api.tasks.get(id);
        if (!cancelledRef?.cancelled) setData(result);
      } catch (e) {
        if (cancelledRef?.cancelled) return;
        setError(e instanceof ApiError ? e.message : "Failed to load task");
      } finally {
        if (!cancelledRef?.cancelled) setIsLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    const ref = { cancelled: false };
    setIsLoading(true);
    setError(null);
    void load(ref);
    return () => {
      ref.cancelled = true;
    };
  }, [load]);

  return { data, isLoading, error, refresh: () => load() };
}

export function useTaskUsage(id: string): UseResource<TaskUsage | null> {
  const [data, setData] = useState<TaskUsage | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (cancelledRef?: { cancelled: boolean }) => {
      try {
        const result = await api.tasks.usage(id);
        if (!cancelledRef?.cancelled) setData(result);
      } catch (e) {
        if (cancelledRef?.cancelled) return;
        setError(e instanceof ApiError ? e.message : "Failed to load usage");
      } finally {
        if (!cancelledRef?.cancelled) setIsLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    const ref = { cancelled: false };
    setIsLoading(true);
    setError(null);
    void load(ref);
    return () => {
      ref.cancelled = true;
    };
  }, [load]);

  return { data, isLoading, error, refresh: () => load() };
}

export function useStages(id: string): UseResource<TaskStage[]> {
  const [data, setData] = useState<TaskStage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (cancelledRef?: { cancelled: boolean }) => {
      try {
        const result = await api.tasks.stages(id);
        if (!cancelledRef?.cancelled) setData(result);
      } catch (e) {
        if (cancelledRef?.cancelled) return;
        setError(e instanceof ApiError ? e.message : "Failed to load stages");
        setData([]);
      } finally {
        if (!cancelledRef?.cancelled) setIsLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    const ref = { cancelled: false };
    setIsLoading(true);
    setError(null);
    void load(ref);
    return () => {
      ref.cancelled = true;
    };
  }, [load]);

  return { data, isLoading, error, refresh: () => load() };
}

export function useLedger(id: string, stage?: string): UseResource<LedgerStep[]> {
  // Serialize the param so the effect re-runs on value change, not identity.
  const key = JSON.stringify({ id, stage: stage ?? null });
  const [data, setData] = useState<LedgerStep[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (cancelledRef?: { cancelled: boolean }) => {
      const { id: taskId, stage: stageKey } = JSON.parse(key) as {
        id: string;
        stage: string | null;
      };
      try {
        const result = await api.tasks.ledger(
          taskId,
          stageKey ? { stage: stageKey } : {},
        );
        if (!cancelledRef?.cancelled) setData(result);
      } catch (e) {
        if (cancelledRef?.cancelled) return;
        setError(e instanceof ApiError ? e.message : "Failed to load work log");
        setData([]);
      } finally {
        if (!cancelledRef?.cancelled) setIsLoading(false);
      }
    },
    [key],
  );

  useEffect(() => {
    const ref = { cancelled: false };
    setIsLoading(true);
    setError(null);
    void load(ref);
    return () => {
      ref.cancelled = true;
    };
  }, [load]);

  return { data, isLoading, error, refresh: () => load() };
}

export function useThread(id: string): UseResource<ThreadEntry[]> {
  const [data, setData] = useState<ThreadEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (cancelledRef?: { cancelled: boolean }) => {
      try {
        const result = await api.tasks.thread(id);
        if (!cancelledRef?.cancelled) setData(result);
      } catch (e) {
        if (cancelledRef?.cancelled) return;
        setError(e instanceof ApiError ? e.message : "Failed to load thread");
        setData([]);
      } finally {
        if (!cancelledRef?.cancelled) setIsLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    const ref = { cancelled: false };
    setIsLoading(true);
    setError(null);
    void load(ref);
    return () => {
      ref.cancelled = true;
    };
  }, [load]);

  return { data, isLoading, error, refresh: () => load() };
}

export function useSubtree(id: string): UseResource<SubtaskNode[]> {
  const [data, setData] = useState<SubtaskNode[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  // Subtasks are additive - soft-fail so the cockpit still loads without them.
  const error: string | null = null;

  const load = useCallback(
    async (cancelledRef?: { cancelled: boolean }) => {
      try {
        const result = await api.tasks.subtree(id);
        if (!cancelledRef?.cancelled) setData(result);
      } catch {
        if (cancelledRef?.cancelled) return;
        setData([]);
      } finally {
        if (!cancelledRef?.cancelled) setIsLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    const ref = { cancelled: false };
    setIsLoading(true);
    void load(ref);
    return () => {
      ref.cancelled = true;
    };
  }, [load]);

  return { data, isLoading, error, refresh: () => load() };
}

export function useSuggestions(id: string): UseResource<TaskSuggestion[]> {
  const [data, setData] = useState<TaskSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  // Follow-up proposals are additive - soft-fail so the cockpit loads without them.
  const error: string | null = null;

  const load = useCallback(
    async (cancelledRef?: { cancelled: boolean }) => {
      try {
        const result = await api.tasks.suggestions(id);
        if (!cancelledRef?.cancelled) setData(result);
      } catch {
        if (cancelledRef?.cancelled) return;
        setData([]);
      } finally {
        if (!cancelledRef?.cancelled) setIsLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    const ref = { cancelled: false };
    setIsLoading(true);
    void load(ref);
    return () => {
      ref.cancelled = true;
    };
  }, [load]);

  return { data, isLoading, error, refresh: () => load() };
}

/** The org's teams - feeds the TaskProperties team row (hidden when empty)
 *  and the create dialog's team select. Soft-fail (teams are additive). */
export function useTeams(): UseResource<Team[]> {
  const [data, setData] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const error: string | null = null;

  const load = useCallback(async (cancelledRef?: { cancelled: boolean }) => {
    try {
      const result = await api.teams.list();
      if (!cancelledRef?.cancelled) setData(result);
    } catch {
      if (cancelledRef?.cancelled) return;
      setData([]);
    } finally {
      if (!cancelledRef?.cancelled) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const ref = { cancelled: false };
    setIsLoading(true);
    void load(ref);
    return () => {
      ref.cancelled = true;
    };
  }, [load]);

  return { data, isLoading, error, refresh: () => load() };
}

/** The org's curated label vocabulary - resolves a task's `label_ids` to
 *  key/color chips and feeds the LabelsControl. Soft-fail (additive). */
export function useOrgLabels(): UseResource<Label[]> {
  const [data, setData] = useState<Label[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const error: string | null = null;

  const load = useCallback(async (cancelledRef?: { cancelled: boolean }) => {
    try {
      const result = await api.labels.list();
      if (!cancelledRef?.cancelled) setData(result);
    } catch {
      if (cancelledRef?.cancelled) return;
      setData([]);
    } finally {
      if (!cancelledRef?.cancelled) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const ref = { cancelled: false };
    setIsLoading(true);
    void load(ref);
    return () => {
      ref.cancelled = true;
    };
  }, [load]);

  return { data, isLoading, error, refresh: () => load() };
}

/** The owning team's cycles - feeds the CycleControl. Fetches only when a
 *  team is set (`teamId` non-null); resolves to `[]` otherwise. Soft-fail. */
export function useTeamCycles(teamId: string | null): UseResource<Cycle[]> {
  const [data, setData] = useState<Cycle[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const error: string | null = null;

  const load = useCallback(
    async (cancelledRef?: { cancelled: boolean }) => {
      if (!teamId) {
        if (!cancelledRef?.cancelled) {
          setData([]);
          setIsLoading(false);
        }
        return;
      }
      try {
        const result = await api.cycles.listForTeam(teamId);
        if (!cancelledRef?.cancelled) setData(result);
      } catch {
        if (cancelledRef?.cancelled) return;
        setData([]);
      } finally {
        if (!cancelledRef?.cancelled) setIsLoading(false);
      }
    },
    [teamId],
  );

  useEffect(() => {
    const ref = { cancelled: false };
    setIsLoading(Boolean(teamId));
    void load(ref);
    return () => {
      ref.cancelled = true;
    };
  }, [load, teamId]);

  return { data, isLoading, error, refresh: () => load() };
}

export function useRelatedArtifacts(id: string): UseResource<RelatedArtifact[]> {
  const [data, setData] = useState<RelatedArtifact[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  // Related artifacts are additive - this hook soft-fails (the cockpit still
  // loads without them), so `error` stays null but is kept in the shared shape.
  const error: string | null = null;

  const load = useCallback(
    async (cancelledRef?: { cancelled: boolean }) => {
      try {
        const result = await api.tasks.relatedArtifacts(id);
        if (!cancelledRef?.cancelled) setData(result);
      } catch {
        if (cancelledRef?.cancelled) return;
        setData([]);
      } finally {
        if (!cancelledRef?.cancelled) setIsLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    const ref = { cancelled: false };
    setIsLoading(true);
    void load(ref);
    return () => {
      ref.cancelled = true;
    };
  }, [load]);

  return { data, isLoading, error, refresh: () => load() };
}
