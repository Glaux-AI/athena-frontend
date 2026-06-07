"use client";

/**
 * Task-list hook — the data source for the `/work` board. Returns the canonical
 * `{ tasks, isLoading, error }` shape (the repo's useEffect+useState fetch
 * pattern; React Query isn't used on these surfaces). Re-fetches when the
 * filter params change.
 */
import { useEffect, useState } from "react";

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
}

interface UseTasksResult {
  tasks: Task[];
  isLoading: boolean;
  error: string | null;
}

export function useTasks(params: TaskListParams = {}): UseTasksResult {
  // Serialize the filters so the effect re-runs on value change, not on every
  // render's fresh object identity.
  const key = JSON.stringify(params);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, [key]);

  return { tasks, isLoading, error };
}
