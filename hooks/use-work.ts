"use client";

/**
 * Cockpit data-fetch hooks for `/work/[id]` — the canonical
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
  type LedgerStep,
  type RelatedArtifact,
  type Task,
  type TaskChild,
  type TaskStage,
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

export function useChildren(id: string): UseResource<TaskChild[]> {
  const [data, setData] = useState<TaskChild[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  // Subtasks are additive — soft-fail so the cockpit still loads without them.
  const error: string | null = null;

  const load = useCallback(
    async (cancelledRef?: { cancelled: boolean }) => {
      try {
        const result = await api.tasks.children(id);
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

export function useRelatedArtifacts(id: string): UseResource<RelatedArtifact[]> {
  const [data, setData] = useState<RelatedArtifact[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  // Related artifacts are additive — this hook soft-fails (the cockpit still
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
