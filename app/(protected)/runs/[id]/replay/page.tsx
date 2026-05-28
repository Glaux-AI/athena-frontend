"use client";

/**
 * §7 Replay UI GA — `/runs/[id]/replay`.
 *
 * Scrubs through a run's persisted `run_events` history without holding
 * an SSE connection. Per §3.3 ✅ the events table is the durable spine,
 * so a completed run's full playback is just a paginated read.
 *
 * Renders:
 *   - A header with the run goal + "event N of M" position counter.
 *   - Play / pause / step-back / step-forward controls.
 *   - A range-input scrubber keyed on event index (0..events.length-1).
 *   - The same `<ReplayActivityStrip>` render used by `<LiveActivityStrip>`,
 *     but populated from the loaded array — no SSE.
 *
 * Mock-mode friendly: hits `/v1/runs/{id}/events/replay` which the mock
 * handler in `lib/api/mock/handlers.ts` serves from `replayEventsFor`.
 */

import { use, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Brain,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Eye,
  Hammer,
  Hourglass,
  Pause,
  PencilLine,
  Play,
  Wrench,
} from "lucide-react";

import { api, ApiError, type ReplayEvent, type RunDetail } from "@/lib/api/client";
import { Stack, Cluster } from "@/components/layout/primitives";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const KIND_ICON: Record<string, typeof Brain> = {
  plan: Brain, reason: Brain, retrieve: Eye, read: Eye,
  draft: PencilLine, write: PencilLine,
};

const PLAYBACK_INTERVAL_MS = 900;

export default function RunReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [run, setRun] = useState<RunDetail | null>(null);
  const [events, setEvents] = useState<ReplayEvent[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "missing">("loading");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Fetch run metadata + all replay pages. Loops on `has_more` so very
  // long histories still resolve to a full array client-side.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const detail = await api.runs.get(id);
        if (cancelled) return;
        setRun(detail);
        const collected: ReplayEvent[] = [];
        let cursor: number | undefined = undefined;
        // Bound the loop so a malformed BE page can't pin the client.
        for (let i = 0; i < 64; i++) {
          const page: { events: ReplayEvent[]; next_cursor: number | null; has_more: boolean } =
            cursor === undefined
              ? await api.runs.replay(id)
              : await api.runs.replay(id, { cursor });
          if (cancelled) return;
          collected.push(...page.events);
          if (!page.has_more || page.next_cursor === null) break;
          cursor = page.next_cursor;
        }
        if (cancelled) return;
        setEvents(collected);
        setLoadState("ready");
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) setLoadState("missing");
        else setLoadState("missing");
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  // Playback loop — advances `index` every `PLAYBACK_INTERVAL_MS` while
  // `playing` is true and we haven't reached the end. Auto-pauses on the
  // last event so the UI doesn't get stuck in a no-op tick.
  useEffect(() => {
    if (!playing) return;
    if (events.length === 0) return;
    if (index >= events.length - 1) {
      setPlaying(false);
      return;
    }
    timerRef.current = window.setTimeout(() => {
      setIndex((i) => Math.min(i + 1, events.length - 1));
    }, PLAYBACK_INTERVAL_MS);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [playing, index, events.length]);

  const togglePlay = useCallback(() => setPlaying((p) => !p), []);
  const stepBack = useCallback(() => {
    setPlaying(false);
    setIndex((i) => Math.max(0, i - 1));
  }, []);
  const stepForward = useCallback(() => {
    setPlaying(false);
    setIndex((i) => Math.min(events.length - 1, i + 1));
  }, [events.length]);

  if (loadState === "loading") {
    return (
      <Stack gap="4">
        <div className="h-8 w-40 animate-pulse rounded-md bg-[var(--surface-2)]" />
        <div className="h-32 animate-pulse rounded-lg bg-[var(--surface-2)]" />
        <div className="h-64 animate-pulse rounded-lg bg-[var(--surface-2)]" />
      </Stack>
    );
  }
  if (loadState === "missing" || run === null) {
    return (
      <Stack gap="4">
        <Card>
          <p className="text-sm text-[var(--text-muted)]">Run not found or not available for replay.</p>
        </Card>
      </Stack>
    );
  }

  const total = events.length;
  const visible = events.slice(0, Math.min(index + 1, total));
  const current = events[index] ?? null;

  return (
    <Stack gap="4">
      <Cluster gap="2" align="center">
        <Button variant="ghost" size="sm" asChild>
          <a href={`/runs/${encodeURIComponent(id)}`} aria-label="Back to run">
            <ArrowLeft className="size-4" />
            Back to run
          </a>
        </Button>
      </Cluster>

      <Card data-testid="replay-header">
        <Stack gap="2">
          <Cluster gap="2" align="center">
            <span className="rounded-full bg-[var(--info-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--info)]">
              Replay
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              read-only · driven by run_events
            </span>
          </Cluster>
          <h1 className="text-lg font-bold leading-tight tracking-tight">{run.goal}</h1>
        </Stack>
      </Card>

      <Card>
        <Stack gap="3">
          <Cluster justify="between" align="center">
            <Cluster gap="2" align="center">
              <Button
                size="sm"
                variant="outline"
                onClick={stepBack}
                disabled={index === 0 || total === 0}
                aria-label="Step backward"
                data-testid="replay-step-back"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                size="sm"
                onClick={togglePlay}
                disabled={total === 0 || index >= total - 1}
                aria-label={playing ? "Pause replay" : "Play replay"}
                data-testid="replay-play-pause"
              >
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
                {playing ? "Pause" : "Play"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={stepForward}
                disabled={total === 0 || index >= total - 1}
                aria-label="Step forward"
                data-testid="replay-step-forward"
              >
                <ChevronRight className="size-4" />
              </Button>
            </Cluster>
            <span className="text-xs text-[var(--text-muted)] tabular-nums" data-testid="replay-position">
              event {total === 0 ? 0 : index + 1} of {total}
            </span>
          </Cluster>

          <input
            type="range"
            min={0}
            max={Math.max(0, total - 1)}
            value={index}
            disabled={total === 0}
            onChange={(e) => {
              setPlaying(false);
              setIndex(Number(e.target.value));
            }}
            aria-label="Scrub through events"
            data-testid="replay-scrubber"
            className="w-full accent-[var(--primary)]"
          />
        </Stack>
      </Card>

      <ReplayActivityStrip events={visible} current={current} />
    </Stack>
  );
}

/** Read-only timeline rendered from a loaded `ReplayEvent[]`. Mirrors the
 * expanded body of `<LiveActivityStrip>` so the look-and-feel matches the
 * live surface — but reads from props, not SSE. Kept colocated with the
 * replay page since it consumes the `ReplayEvent` wire shape (which carries
 * `seq` + `created_at` whereas the SSE flavour carries `id` + `receivedAt`). */
function ReplayActivityStrip({
  events, current,
}: {
  events: ReplayEvent[];
  current: ReplayEvent | null;
}) {
  return (
    <Card data-testid="replay-activity-strip">
      <Stack gap="3">
        <Cluster justify="between" align="center">
          <span className="text-sm font-semibold">Activity replay</span>
          <span className="text-xs text-[var(--text-muted)]" data-testid="replay-current-event">
            {current ? `#${current.seq} · ${current.event}` : "—"}
          </span>
        </Cluster>
        <div
          id="replay-activity-body"
          className="max-h-64 overflow-auto rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-3"
          aria-live="off"
        >
          {events.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No events to replay yet.</p>
          ) : (
            <ol className="flex flex-col gap-2" data-testid="replay-event-list">
              {events.map((ev) => (
                <ReplayEventRow key={ev.seq} ev={ev} />
              ))}
            </ol>
          )}
        </div>
      </Stack>
    </Card>
  );
}

function ReplayEventRow({ ev }: { ev: ReplayEvent }) {
  if (ev.event === "agent_step") {
    const kind = String(ev.payload["kind"] ?? "");
    const Icon = KIND_ICON[kind] ?? Brain;
    const label = String(ev.payload["label"] ?? kind);
    const durationMs = typeof ev.payload["duration_ms"] === "number"
      ? (ev.payload["duration_ms"] as number) : null;
    return (
      <li className="flex items-start gap-2 text-sm">
        <Icon className="mt-0.5 size-4 shrink-0 text-[var(--primary)]" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="text-[var(--text-muted)]">{kind} · </span>
          <span>{label}</span>
          {durationMs !== null && (
            <span className="ml-2 text-xs text-[var(--text-muted)]">{(durationMs / 1000).toFixed(1)}s</span>
          )}
        </span>
      </li>
    );
  }
  if (ev.event === "tool_call") {
    const name = String(ev.payload["name"] ?? "tool");
    const argsSummary = String(ev.payload["args_summary"] ?? "");
    const durationMs = typeof ev.payload["duration_ms"] === "number"
      ? (ev.payload["duration_ms"] as number) : null;
    return (
      <li className="ml-6 flex items-start gap-2 text-sm">
        <Wrench className="mt-0.5 size-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
        <span className="min-w-0 flex-1 font-mono text-xs text-[var(--text-muted)]">
          {name}
          {argsSummary && ` (${argsSummary})`}
          {durationMs !== null && <span className="ml-2 text-[10px]">{durationMs}ms</span>}
        </span>
      </li>
    );
  }
  if (ev.event === "gate_pending") {
    return (
      <li className="flex items-start gap-2 text-sm">
        <Hourglass className="mt-0.5 size-4 shrink-0 text-[var(--warning)]" aria-hidden />
        <span>
          Awaiting approval:{" "}
          <span className="font-medium">{String(ev.payload["gate"] ?? "gate")}</span>
        </span>
      </li>
    );
  }
  if (ev.event === "phase_transition") {
    return (
      <li className="flex items-start gap-2 text-sm text-[var(--text-muted)]">
        <span className="font-mono text-xs">
          {String(ev.payload["from"] ?? "")} <span aria-hidden>→</span>{" "}
          {String(ev.payload["to"] ?? "")}
        </span>
      </li>
    );
  }
  if (ev.event === "run_status") {
    const status = String(ev.payload["status"] ?? "");
    if (status === "completed") {
      return (
        <li className="flex items-start gap-2 text-sm">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--success)]" aria-hidden />
          <span>Run completed</span>
        </li>
      );
    }
    if (status === "running") {
      return (
        <li className="flex items-start gap-2 text-sm text-[var(--text-muted)]">
          <Hammer className="mt-0.5 size-4 shrink-0 text-[var(--primary)]" aria-hidden />
          <span>Run started</span>
        </li>
      );
    }
    return (
      <li className="flex items-start gap-2 text-sm">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-[var(--info)]" aria-hidden />
        <span>{status.replace("_", " ")}</span>
      </li>
    );
  }
  return null;
}

// Exported for unit tests so we can render the page logic without going
// through Next.js's `params: Promise` shell.
export { ReplayActivityStrip };
