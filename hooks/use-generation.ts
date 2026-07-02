"use client";

/**
 * useGenerationPoll - follow a durable one-shot AI generation to its end.
 *
 * Generations (design drafts, component imports, agent drafts) run on the
 * worker and persist server-side; this hook polls `GET /v1/generations/{id}`
 * while one is active and hands the terminal row to `onSettled` exactly once.
 * Because the row is durable, `start` can be given a generation fetched AFTER
 * a remount (`api.generations.list({active:true, contextKey})`) - the page
 * reattaches to work it started before navigating away, and a generation that
 * finished while unmounted settles on the first poll.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { api, type AiGeneration } from "@/lib/api/client";

const POLL_MS = 1500;

export function useGenerationPoll<TResult = Record<string, unknown>>(
  onSettled: (gen: AiGeneration<TResult>) => void,
) {
  const [generation, setGeneration] = useState<AiGeneration<TResult> | null>(null);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;
  const activeIdRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    activeIdRef.current = null;
    setGeneration(null);
  }, []);

  /** Follow `gen` (a just-enqueued row, or an active one found on remount). */
  const start = useCallback((gen: AiGeneration<TResult>) => {
    activeIdRef.current = gen.id;
    setGeneration(gen);
    if (["completed", "failed", "cancelled"].includes(gen.status)) {
      activeIdRef.current = null;
      setGeneration(null);
      onSettledRef.current(gen);
    }
  }, []);

  useEffect(() => {
    if (!generation || activeIdRef.current !== generation.id) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void (async () => {
        const id = activeIdRef.current;
        if (!id || cancelled) return;
        try {
          const next = await api.generations.get<TResult>(id);
          if (cancelled || activeIdRef.current !== id) return;
          if (["completed", "failed", "cancelled"].includes(next.status)) {
            activeIdRef.current = null;
            setGeneration(null);
            onSettledRef.current(next);
          } else {
            setGeneration(next);
          }
        } catch {
          // Transient poll failure - keep trying; the row is durable.
        }
      })();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [generation]);

  const cancel = useCallback(() => {
    const id = activeIdRef.current;
    if (!id) return;
    void api.generations.cancel(id).catch(() => undefined);
  }, []);

  return {
    /** The active generation being followed (null when idle). */
    generation,
    /** True while a generation is being followed. */
    busy: generation !== null,
    start,
    cancel,
    /** Stop following WITHOUT cancelling (unmount-safe - the row persists). */
    stopPolling,
  };
}
