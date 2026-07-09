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
  type TaskHealth,
  type TaskPriority,
  type TaskSort,
  type TaskStatus,
  type TaskType,
} from "@/lib/api/client";

export interface TaskListParams {
  domain_id?: string;
  type?: TaskType;
  /** One status or several (repeatable server param) - the List view sends the
   *  live set so cancelled work stays in History. */
  status?: TaskStatus | TaskStatus[];
  parent_id?: string;
  /** The person doing the work (a member user id) - never `"athena"`; AI
   *  execution is the separate `ai_delegated` flag. */
  assignee?: string;
  /** Tasks a person is accountable for (`owner_user_id`). */
  owner?: string;
  /** "My tasks" fence - a user id matched against `owner_user_id` OR
   *  `created_by_user_id` (Athena is the executor, so a human's tasks are the
   *  ones they own or created). */
  mine?: string;
  /** One squad (or `teamless`), one label (or `unlabeled`), one sprint
   *  (or `no_cycle` = backlog) - all server-side lenses. `team_ids` is the
   *  "my teams" union (repeatable param; the row cap applies AFTER it). */
  team_id?: string;
  team_ids?: string[];
  teamless?: boolean;
  label_id?: string;
  unlabeled?: boolean;
  cycle_id?: string;
  no_cycle?: boolean;
  priority?: TaskPriority;
  health?: TaskHealth;
  /** Free-text title-or-display-id search. */
  q?: string;
  /** List ordering; omit for the stable board order. */
  sort?: TaskSort;
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
