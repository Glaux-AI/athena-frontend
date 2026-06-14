"use client";

/**
 * Task-list hook - the data source for the `/work` board. Returns the canonical
 * `{ tasks, isLoading, error }` shape (the repo's useEffect+useState fetch
 * pattern; React Query isn't used on these surfaces). Re-fetches when the
 * filter params change.
 */
import { useCallback, useEffect, useState } from "react";

import {
  ApiError,
  api,
  type Task,
  type TaskStatus,
  type TaskType,
} from "@/lib/api/client";

export interface TaskListParams {
  domain_id?: string;
  type?: TaskType;
  status?: TaskStatus;
  parent_id?: string;
  /** A user id or the `athena` executor sentinel. */
  assignee?: string;
  /** "My tasks" fence - a user id matched against `owner_user_id` OR
   *  `created_by_user_id` (Athena is the executor, so a human's tasks are the
   *  ones they own or created). */
  mine?: string;
  /** Free-text title search. */
  q?: string;
  limit?: number;
  offset?: number;
}

interface UseTasksResult {
  tasks: Task[];
  isLoading: boolean;
  error: string | null;
  /** Re-fetch with the current params (after a board mutation). */
  reload: () => void;
}

/** `enabled` lets a caller hold the fetch when this view isn't the active one
 *  (e.g. the Tree view is hidden), so switching views doesn't fire three
 *  list/board/history requests at once. */
export function useTasks(
  params: TaskListParams = {},
  enabled = true,
): UseTasksResult {
  // Serialize the filters so the effect re-runs on value change, not on every
  // render's fresh object identity.
  const key = JSON.stringify(params);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  // Bump to force a re-fetch without changing the filter params.
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
        const result = await api.tasks.list(JSON.parse(key) as TaskListParams);
        if (!cancelled) setTasks(result);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : "Failed to load tasks");
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
