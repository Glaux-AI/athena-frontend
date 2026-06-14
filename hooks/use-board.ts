"use client";

/**
 * Board + history hooks for `/work`. The active board reads the server-bucketed
 * `api.tasks.board` (columns come pre-windowed - the Done column is the recent
 * shipped work only, so a busy org's board never grows without bound). The
 * History view reads `api.tasks.history` (everything that has left the board:
 * shipped + removed). Both mirror `useTasks`'s `{ ..., isLoading, error,
 * reload }` shape and honor an `enabled` flag so a hidden view doesn't fetch.
 */
import { useCallback, useEffect, useState } from "react";

import {
  ApiError,
  api,
  type KanbanColumn,
  type Task,
  type TaskBoardParams,
  type TaskHistoryParams,
} from "@/lib/api/client";

interface UseBoardResult {
  columns: KanbanColumn[];
  isLoading: boolean;
  error: string | null;
  reload: () => void;
}

export function useBoard(
  params: TaskBoardParams = {},
  enabled = true,
): UseBoardResult {
  const key = JSON.stringify(params);
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const cols = await api.tasks.board(JSON.parse(key) as TaskBoardParams);
        if (!cancelled) setColumns(cols);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : "Failed to load the board");
        setColumns([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, nonce, enabled]);

  return { columns, isLoading, error, reload };
}

interface UseHistoryResult {
  tasks: Task[];
  isLoading: boolean;
  error: string | null;
  reload: () => void;
}

export function useHistory(
  params: TaskHistoryParams = {},
  enabled = true,
): UseHistoryResult {
  const key = JSON.stringify(params);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const result = await api.tasks.history(
          JSON.parse(key) as TaskHistoryParams,
        );
        if (!cancelled) setTasks(result);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : "Failed to load history");
        setTasks([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, nonce, enabled]);

  return { tasks, isLoading, error, reload };
}
