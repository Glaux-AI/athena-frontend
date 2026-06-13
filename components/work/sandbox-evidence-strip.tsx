"use client";

/**
 * SandboxEvidenceStrip - the advisory build+test evidence above the execution
 * DiffView (ADR-086 Inc 4). Mounts ONLY when the execution diff carries a
 * `sandbox_result` (absent => today's gate, zero regression).
 *
 * Deliberately UNDERSTATED: calm pills on a neutral surface, never a big green
 * banner - the verdict is advisory ("CI is authoritative"), and it must not
 * visually outweigh the diff or invite rubber-stamping. A failed change-coverage
 * check raises a loud warning chip so reviewers never read absence as a pass.
 */

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FlaskConical,
  RefreshCw,
  XCircle,
} from "lucide-react";

import type { SandboxResult } from "@/lib/api/client";
import { Cluster, Stack } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";

type Tone = "success" | "danger" | "warning" | "muted";

const VERDICT: Record<SandboxResult["status"], { label: string; tone: Tone; Icon: typeof CheckCircle2 }> = {
  green: { label: "Built · tests passed", tone: "success", Icon: CheckCircle2 },
  red: { label: "Build or tests failing", tone: "danger", Icon: XCircle },
  budget_exhausted: { label: "Stopped at budget", tone: "warning", Icon: AlertTriangle },
  degraded: { label: "Advisory unavailable", tone: "muted", Icon: AlertTriangle },
  error: { label: "Sandbox error", tone: "muted", Icon: AlertTriangle },
};

const TONE_TEXT: Record<Tone, string> = {
  success: "text-[var(--success-ink)]",
  danger: "text-[var(--danger-ink)]",
  warning: "text-[var(--warning-ink)]",
  muted: "text-[var(--text-muted)]",
};

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text)]">
      {children}
    </span>
  );
}

export function SandboxEvidenceStrip({ result }: { result: SandboxResult }) {
  const [showLog, setShowLog] = useState(false);
  const v = VERDICT[result.status] ?? VERDICT.degraded;
  const { Icon } = v;
  const log = [result.build_log_tail, result.test_log_tail].filter(Boolean).join("\n\n");
  const notExercised = result.change_coverage === "not_verified";

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <Stack gap="2.5" className="min-w-0">
        <Cluster gap="2" className="items-center">
          <FlaskConical className="size-3.5 text-[var(--text-muted)]" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Sandbox check
          </span>
          <span className="ml-auto text-xs text-[var(--text-subtle)]">
            advisory · CI is authoritative
          </span>
        </Cluster>
        <Cluster gap="2" className="flex-wrap items-center">
          <Pill>
            <Icon className={cn("size-3.5", TONE_TEXT[v.tone])} aria-hidden />
            <span className="font-medium">{v.label}</span>
          </Pill>
          {result.tests_total != null && (
            <Pill>
              <FlaskConical className="size-3.5 text-[var(--text-muted)]" aria-hidden />
              {result.tests_passed ?? 0}/{result.tests_total} unit tests
            </Pill>
          )}
          {result.iterations > 0 && (
            <Pill>
              <RefreshCw className="size-3.5 text-[var(--text-muted)]" aria-hidden />
              {result.iterations} {result.iterations === 1 ? "iteration" : "iterations"}
            </Pill>
          )}
          {notExercised && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--warning-soft)] px-2.5 py-1 text-xs font-medium text-[var(--warning-ink)]">
              <AlertTriangle className="size-3.5" aria-hidden />
              change-coverage NOT verified
            </span>
          )}
          {log && (
            <button
              type="button"
              onClick={() => setShowLog((s) => !s)}
              className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              {showLog ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              {showLog ? "Hide log" : "View build log"}
            </button>
          )}
        </Cluster>
        {showLog && log && (
          <pre className="max-h-[320px] overflow-auto rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 text-xs leading-relaxed text-[var(--text)]">
            <code className="font-mono">{log}</code>
          </pre>
        )}
      </Stack>
    </div>
  );
}
