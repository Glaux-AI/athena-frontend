"use client";

/**
 * Chapter 07 - Design. Build. Review.
 * S23 chapter card, S24 Sara's design stage (design artifact card landing in
 * the task), S25 Arjun picks his task -> Cursor capture slot -> DiffView,
 * S26 Rohan reviews + approves + PR options -> GitHub PR slot, S27 shipped.
 *
 * Athena surfaces are the real components (StageRail, StageWorklog, DiffView,
 * TaskIdChip, TaskStatusPill, ActorAvatar, Button, Card) inside the real
 * cockpit chrome (TaskCockpit). Third-party tools (Cursor, GitHub) are
 * faithful in-film recreations from ../clients, built to each tool's own UI.
 */

import { GitBranch, PenTool, Sparkles } from "lucide-react";

import { StageRail } from "@/components/work/stage-rail";
import { StageWorklog } from "@/components/work/stage-worklog";
import { DiffView } from "@/components/work/diff-view";
import { TaskIdChip } from "@/components/work/task-id-chip";
import { TaskStatusPill } from "@/components/ui/task-status-pill";
import { ActorAvatar } from "@/components/mascot/actor-avatar";
import { OwlAvatar } from "@/components/mascot/owl-avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { LedgerStep, TaskStage } from "@/lib/api/client";

import { evo, lerp, seg, type SceneDef } from "../engine";
import { Caption, Callout, ChapterCard, Cursor } from "../language";
import { ShellScene } from "../scene-hosts";
import { AgentWindow, GitHubPR } from "../clients";
import { TaskCockpit, GateComposer, AthenaChrome } from "../task-cockpit";
import { CAST, Msg, ShellFit, mkStage } from "./ch6-research";

/** Compact right-sidebar card matching the cockpit sidebar treatment. */
function SideCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-1)]">
      <div className="mb-2.5 border-b border-[var(--border)] pb-2 text-sm font-semibold text-[var(--text)]">{title}</div>
      {children}
    </div>
  );
}

const noop = () => {};

/* ------------------------------------------------------------------ patch */

const PATCH = `diff --git a/services/settlement/scheduler.py b/services/settlement/scheduler.py
--- a/services/settlement/scheduler.py
+++ b/services/settlement/scheduler.py
@@ -12,20 +12,26 @@ from settlement.reconciliation import ReconciliationEngine

 logger = logging.getLogger(__name__)

-# Refunds settle in one nightly batch (ADR-041): cheap, but a refund
-# approved at 09:00 waits up to 41h end to end.
-NIGHTLY_BATCH_CRON = "0 2 * * *"
+# Same-day settlement (FEAT-12): settle on refund.approved events in
+# bounded micro-batches, so fees stay capped by the batch window.
+SETTLEMENT_WINDOW_SECONDS = 900
+MAX_BATCH_SIZE = 500


 class SettlementScheduler:
-    def __init__(self, engine: ReconciliationEngine) -> None:
+    def __init__(self, engine: ReconciliationEngine, bus: EventBus) -> None:
         self.engine = engine
-        self._cron = NIGHTLY_BATCH_CRON
+        self._bus = bus
+        self._pending: list[str] = []

     def start(self) -> None:
-        schedule_cron(self._cron, self.run_nightly_batch)
+        self._bus.subscribe("refund.approved", self._enqueue)
+        schedule_interval(SETTLEMENT_WINDOW_SECONDS, self.flush_window)

-    def run_nightly_batch(self) -> None:
-        batch = self.engine.collect_pending(limit=None)
-        self.engine.settle(batch, mode="nightly")
+    def _enqueue(self, event: RefundApproved) -> None:
+        self._pending.append(event.refund_id)
+        if len(self._pending) >= MAX_BATCH_SIZE:
+            self.flush_window()
+
+    def flush_window(self) -> None:
+        batch = self.engine.collect(self._pending[:MAX_BATCH_SIZE])
+        self._pending = self._pending[MAX_BATCH_SIZE:]
+        self.engine.settle(batch, mode="same_day")
diff --git a/tests/settlement/test_scheduler.py b/tests/settlement/test_scheduler.py
--- a/tests/settlement/test_scheduler.py
+++ b/tests/settlement/test_scheduler.py
@@ -41,3 +41,15 @@ def test_nightly_batch_settles_pending():
     scheduler.run_nightly_batch()
     assert engine.settled == ["r_1", "r_2"]
     assert engine.mode == "nightly"
+
+
+def test_refund_settles_same_day():
+    engine = FakeEngine()
+    bus = FakeBus()
+    scheduler = SettlementScheduler(engine=engine, bus=bus)
+    scheduler.start()
+    bus.emit("refund.approved", RefundApproved(refund_id="r_9"))
+    scheduler.flush_window()
+    assert engine.settled == ["r_9"]
+    assert engine.mode == "same_day"
`;

/* ---------------------------------------------------------------- scenes */

const S23: SceneDef = {
  id: "s23-ch7-card",
  dur: 3,
  Comp: ({ t, dur }) => (
    <ChapterCard t={t} dur={dur} num="07" kicker="Chapter 07" title="Design. Build. Review." />
  ),
};

/* S24 - Sara designs with the org's tokens (15s). */

/** The design system's own colors are DATA (a palette being designed), not UI
 *  theming - literal values are the point of the shot. */
const PALETTE_BEFORE = ["oklch(50% 0.18 260)", "oklch(70% 0.12 260)", "oklch(85% 0.05 260)", "oklch(96% 0.01 260)", "oklch(25% 0.03 255)"];
const PALETTE_AFTER = ["oklch(48% 0.19 262)", "oklch(66% 0.14 250)", "oklch(80% 0.09 210)", "oklch(97% 0.008 250)", "oklch(22% 0.03 255)"];

function DesignArtifactCard({ t }: { t: number }) {
  const refined = t >= 6.6;
  const palette = refined ? PALETTE_AFTER : PALETTE_BEFORE;
  const accent = palette[0]!;
  const landing = evo(t, 1.6, 2.5);
  return (
    <div
      style={{
        transform: `translateY(${lerp(24, 0, landing)}px) scale(${lerp(0.97, 1, landing)})`,
        opacity: landing,
      }}
    >
      <Card variant="elevated" className="p-0">
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
          <div className="flex size-7 items-center justify-center rounded-md bg-[var(--primary-soft)] text-[var(--primary)]">
            <PenTool className="size-4" aria-hidden />
          </div>
          <span className="text-sm font-semibold text-[var(--text)]">design spec</span>
          <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
            Meridian design system
          </span>
          {refined && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--primary)]">
              <Sparkles className="size-3" aria-hidden /> AI refined · v2
            </span>
          )}
        </div>
        <div className="grid grid-cols-[220px_1fr] gap-5 p-4">
          <div className="flex flex-col gap-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Palette
            </span>
            <div className="flex gap-1.5">
              {palette.map((c, i) => (
                <div
                  key={i}
                  style={{ background: c, width: 36, height: 36, borderRadius: 8, outline: "1px solid oklch(20% 0.02 250 / 0.12)" }}
                />
              ))}
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Type
            </span>
            <span className="text-xs text-[var(--text-muted)]">Inter · 5 sizes · 3 weights</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Radius
            </span>
            <span className="text-xs text-[var(--text-muted)]">8 / 12 / 16</span>
          </div>
          {/* Live preview: the refund timeline card, rendered from the tokens above. */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Live preview
            </span>
            <div
              className="mt-2 rounded-xl bg-[var(--surface)] p-4"
              style={{ boxShadow: "0 8px 24px oklch(20% 0.02 250 / 0.08)", outline: "1px solid oklch(20% 0.02 250 / 0.08)" }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[var(--text)]">Refund #R-2841</span>
                <span
                  style={{ background: accent, color: "oklch(100% 0 0)", borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}
                >
                  {refined ? "Settles today" : "Settles T+2"}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                {["Requested", "Approved", "Settled"].map((step, i) => (
                  <div key={step} className="flex flex-1 items-center gap-2">
                    <div className="flex flex-col gap-1" style={{ flex: 1 }}>
                      <div
                        style={{
                          height: 5,
                          borderRadius: 4,
                          background: i < 2 || refined ? accent : "oklch(90% 0.01 260)",
                          opacity: i === 2 && refined ? 0.7 : 1,
                        }}
                      />
                      <span className="text-[10px] text-[var(--text-muted)]">{step}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                {refined
                  ? "Approved 09:14 · settling in this window"
                  : "Approved 09:14 · waiting for the nightly batch"}
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

const S24: SceneDef = {
  id: "s24-sara-design",
  dur: 15,
  Comp: ({ t }) => {
    const designStatus: TaskStage["status"] = t < 11.8 ? "running" : "approved";
    const stages: TaskStage[] = [
      mkStage("frame", "Frame", 1, "approved"),
      mkStage("design", "Design", 2, designStatus),
      mkStage("spec", "Build spec", 3, t < 11.8 ? "locked" : "ready"),
    ];
    const reviewing = t >= 8.6 && t < 11.8;
    const approved = t >= 11.8;
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <ShellFit />
        <ShellScene user={CAST.sara}>
          <TaskCockpit
            idChip="FEAT-13"
            title="Same-day settlement design"
            status={approved ? "done" : "in_progress"}
            owner={{ name: CAST.sara.name }}
            domainLabel="Payments"
            spent={0.92}
            budget={8}
            stages={stages}
            selectedStage="design"
            left={
              <>
                <DesignArtifactCard t={t} />
                <GateComposer
                  mode={approved ? "approved" : reviewing ? "review" : "running"}
                  stageTitle="Design"
                  approveLabel="Approve &amp; advance"
                  runningLabel="Athena is drafting the design in your token system."
                  approvedLabel="Approved - the build spec unlocks next."
                />
              </>
            }
            right={
              <SideCard title="Details">
                <div className="flex flex-col gap-2 text-xs text-[var(--text-muted)]">
                  <div>
                    Part of <span className="font-medium text-[var(--text)]">FEAT-12</span>
                  </div>
                  <div>
                    Design system{" "}
                    <span className="font-medium text-[var(--text)]">Meridian Design Language</span>
                  </div>
                </div>
              </SideCard>
            }
          />
        </ShellScene>
        <Cursor
          t={t}
          path={[
            { at: 2.0, x: 700, y: 560 },
            { at: 6.2, x: 620, y: 470 },
            { at: 6.6, x: 620, y: 470, click: true },
            { at: 11.2, x: 560, y: 700 },
            { at: 11.6, x: 560, y: 700, click: true },
          ]}
        />
        <Caption t={t} a={0.8} b={4.4}>
          Design, in your design language.
        </Caption>
      </div>
    );
  },
};

/* S25 - Arjun builds in Cursor (22s). */

const IMPL_LEDGER: LedgerStep[] = [
  {
    id: "ls_c1",
    stage_key: "implement",
    seq: 1,
    kind: "write",
    tool_name: null,
    summary:
      "Code edits received from Cursor - services/settlement/scheduler.py, tests/settlement/test_scheduler.py",
    input_refs: [],
    output_refs: [],
    status: "ok",
    call_id: null,
    actor_label: "Cursor",
    created_at: "2026-07-02T14:20:00Z",
  },
];

function MyWorkRow({
  id,
  title,
  status,
  onYou,
  ready,
}: {
  id: string;
  title: string;
  status: "todo" | "in_review";
  onYou: boolean;
  ready?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3">
      <TaskIdChip id={id} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text)]">{title}</span>
      {ready && (
        <span className="rounded-full bg-[var(--success-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--success-ink)]">
          Ready
        </span>
      )}
      {onYou && (
        <span className="rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--warning-ink)]">
          On you
        </span>
      )}
      <TaskStatusPill status={status} />
    </div>
  );
}

/* The coding agent's Athena MCP calls, revealed by progress - the SAME source
 * drives the agent panel and the Athena worklog so both sides stay in sync. */
const CURSOR_STEP_DEFS = [
  { at: 0.06, tool: "search_decisions", detail: "ADR-041 settlement batching" },
  { at: 0.22, tool: "read_repo_file", detail: "services/settlement/scheduler.py" },
  { at: 0.38, tool: "lookup_symbol", detail: "ReconciliationEngine.process()" },
  { at: 0.54, tool: "hybrid_retrieval", detail: "refund.approved event flow" },
];

function cursorLedger(p: number): LedgerStep[] {
  const out: LedgerStep[] = CURSOR_STEP_DEFS.filter((s) => p >= s.at).map((s, i) => ({
    id: `cl_${i}`,
    stage_key: "implement",
    seq: i + 1,
    kind: "tool_call",
    tool_name: s.tool,
    summary: `${s.tool} - ${s.detail}`,
    input_refs: [],
    output_refs: [],
    status: "ok",
    call_id: null,
    actor_label: "Coding agent",
    created_at: `2026-07-02T14:2${i}:00Z`,
  }));
  if (p >= 0.9) {
    out.push({
      id: "cl_w",
      stage_key: "implement",
      seq: out.length + 1,
      kind: "write",
      tool_name: null,
      summary: "Code edits received from the coding agent - scheduler.py, tests/test_scheduler.py",
      input_refs: [],
      output_refs: [],
      status: "ok",
      call_id: null,
      actor_label: "Coding agent",
      created_at: "2026-07-02T14:29:00Z",
    });
  }
  return out;
}

const S25: SceneDef = {
  id: "s25-arjun-cursor",
  dur: 22,
  Comp: ({ t }) => {
    // 0-3.9 My Work (real shell) -> 3.5+ split: Cursor working (left) and the
    // live Athena cockpit (right) updating in sync as the agent works.
    const myworkOut = 1 - seg(t, 3.5, 3.9);
    const splitIn = evo(t, 3.6, 4.3);
    const p = seg(t, 4.2, 16.0); // shared progress for both panels
    const done = p >= 0.92;
    const implStages: TaskStage[] = [
      mkStage("plan", "Plan", 1, "approved"),
      mkStage("implement", "Implement", 2, done ? "in_review" : "running"),
      mkStage("review", "Review", 3, "locked"),
    ];
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        {/* Intro: My Work in the real shell. */}
        {myworkOut > 0 && (
          <div style={{ position: "absolute", inset: 0, opacity: myworkOut, zIndex: 5 }}>
            <ShellFit />
            <ShellScene user={CAST.arjun}>
              <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4" style={{ height: 780 }}>
                <div>
                  <div className="text-lg font-semibold text-[var(--text)]">My Work</div>
                  <div className="text-sm text-[var(--text-muted)]">What needs you, in order.</div>
                </div>
                <MyWorkRow id="FEAT-14" title="Event-driven settlement scheduler" status="todo" onYou ready />
                <MyWorkRow id="PAY-27" title="Webhook signature rotation" status="in_review" onYou={false} />
              </div>
            </ShellScene>
          </div>
        )}

        {/* Split: Cursor (left) + live Athena cockpit (right), one clock. */}
        {t >= 3.5 && (
          <div style={{ position: "absolute", inset: 0, opacity: splitIn, zIndex: 10 }}>
            {/* left - the coding agent working */}
            <div style={{ position: "absolute", left: 44, top: 150, width: 900, height: 760 }}>
              <AgentWindow progress={p} />
              <div className="mt-2 text-center text-sm font-semibold text-[oklch(62%_0.01_260)]">Your coding agent</div>
            </div>

            {/* MCP link */}
            <div
              style={{
                position: "absolute",
                left: 944,
                top: 500,
                width: 32,
                textAlign: "center",
                color: "var(--primary)",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.06em",
              }}
            >
              <div style={{ height: 2, background: "var(--primary)", opacity: 0.5, marginBottom: 6 }} />
              MCP
              <div style={{ height: 2, background: "var(--primary)", opacity: 0.5, marginTop: 6 }} />
            </div>

            {/* right - the real Athena cockpit, updating live */}
            <div style={{ position: "absolute", left: 976, top: 150, width: 900, height: 760, overflow: "hidden" }}>
              <div style={{ width: 1280, transformOrigin: "top left", transform: "scale(0.703)" }}>
                <AthenaChrome url="app.tryathena.dev/work/FEAT-14" style={{ height: 1080 }}>
                  <div className="px-5 pb-4 pt-3">
                    <TaskCockpit
                      idChip="FEAT-14"
                      title="Event-driven settlement scheduler"
                      status={done ? "in_review" : "in_progress"}
                      owner={{ name: CAST.arjun.name }}
                      domainLabel="Payments"
                      {...(done ? {} : { externalExecutor: "coding agent" })}
                      spent={1.1 + p * 1.0}
                      budget={12}
                      stages={implStages}
                      selectedStage="implement"
                      left={
                        <>
                          <div className="overflow-hidden rounded-xl" style={{ maxHeight: p >= 0.82 ? 220 : 420 }}>
                            <StageWorklog
                              stageTitle="Implement"
                              ledger={cursorLedger(p)}
                              ledgerLoading={false}
                              events={[]}
                              stageKey="implement"
                              status="open"
                              isRunning={!done}
                              executorLabel="coding agent"
                            />
                          </div>
                          {p >= 0.82 && (
                            <div className="overflow-hidden rounded-xl border border-[var(--border)]" style={{ maxHeight: 300 }}>
                              <DiffView patch={PATCH} />
                            </div>
                          )}
                        </>
                      }
                      right={
                        <SideCard title="Details">
                          <div className="flex flex-col gap-2 text-xs text-[var(--text-muted)]">
                            <div>
                              Part of <span className="font-medium text-[var(--text)]">FEAT-12</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              Reviewer <ActorAvatar name={CAST.rohan.name} size={16} />
                              <span className="font-medium text-[var(--text)]">{CAST.rohan.name}</span>
                            </div>
                            <div>
                              Executor <span className="font-medium text-[var(--text)]">your coding agent</span>, over MCP
                            </div>
                          </div>
                        </SideCard>
                      }
                    />
                  </div>
                </AthenaChrome>
              </div>
            </div>
          </div>
        )}

        <Cursor
          t={t}
          path={[
            { at: 1.2, x: 1000, y: 320 },
            { at: 3.2, x: 1000, y: 245 },
            { at: 3.5, x: 1000, y: 245, click: true },
          ]}
        />
        <Caption t={t} a={4.6} b={8.6}>
          Your engineers build where they always build.
        </Caption>
        <Callout t={t} a={9.2} b={13.0} x={470} y={928}>
          your coding agent, using Athena&apos;s knowledge
        </Callout>
        <Caption t={t} a={13.6} b={17.4}>
          Athena watches every step, live.
        </Caption>
        <Caption t={t} a={18.0} b={21.4}>
          Grounded in decisions your org already made.
        </Caption>
      </div>
    );
  },
};

/* S26 - Rohan reviews & approves (14s). */

const S26: SceneDef = {
  id: "s26-rohan-review",
  dur: 14,
  Comp: ({ t }) => {
    const approved = t >= 8.6;
    const reviewStages: TaskStage[] = [
      mkStage("plan", "Plan", 1, "approved"),
      mkStage("implement", "Implement", 2, "approved"),
      mkStage("review", "Review", 3, approved ? "approved" : "in_review"),
    ];
    const pan = lerp(0, -260, seg(t, 1.6, 6.4));
    const prIn = evo(t, 9.2, 10.0);
    const ghSlot = t >= 11.2 && t < 13.8;
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <ShellFit />
        <ShellScene user={CAST.rohan}>
          <TaskCockpit
            idChip="FEAT-14"
            title="Event-driven settlement scheduler"
            status={approved ? "done" : "in_review"}
            owner={{ name: CAST.arjun.name }}
            domainLabel="Payments"
            spent={2.1}
            budget={12}
            stages={reviewStages}
            selectedStage="review"
            left={
              !approved ? (
                <>
                  <div className="overflow-hidden rounded-xl border border-[var(--border)]" style={{ maxHeight: 430 }}>
                    <div style={{ transform: `translateY(${pan}px)` }}>
                      <DiffView patch={PATCH} />
                    </div>
                  </div>
                  <GateComposer
                    mode="review"
                    stageTitle="changes"
                    approveLabel="Approve &amp; advance"
                  />
                </>
              ) : (
                <>
                  <GateComposer
                    mode="approved"
                    stageTitle="Review"
                    approvedLabel="Approved - Athena is opening the pull request."
                  />
                  <div style={{ opacity: prIn, transform: `translateY(${lerp(16, 0, prIn)}px)` }}>
                    <Card variant="elevated" className="p-0">
                      <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
                        <GitBranch className="size-4 text-[var(--primary)]" aria-hidden />
                        <span className="text-sm font-semibold text-[var(--text)]">Pull request options</span>
                        {t >= 10.6 && (
                          <span className="ml-auto rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--success-ink)]">
                            PR #482 opened
                          </span>
                        )}
                      </div>
                      <div className="grid gap-3 p-4">
                        <div className="grid gap-1">
                          <span className="text-xs font-medium text-[var(--text-muted)]">Branch name</span>
                          <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm text-[var(--text)]">
                            athena/feat-14-same-day-settlement
                          </div>
                        </div>
                        <div className="grid gap-1">
                          <span className="text-xs font-medium text-[var(--text-muted)]">PR title</span>
                          <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]">
                            Same-day refund settlement scheduler
                          </div>
                        </div>
                        <div className="grid gap-1">
                          <span className="text-xs font-medium text-[var(--text-muted)]">Description</span>
                          <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-muted)]">
                            Switches the nightly settlement batch to event-driven same-day windows
                            (FEAT-12). Approved plan + review notes attached.
                          </div>
                        </div>
                      </div>
                    </Card>
                  </div>
                </>
              )
            }
            right={
              <SideCard title="Review">
                <div className="flex flex-col gap-2 text-xs text-[var(--text-muted)]">
                  <div className="flex items-center gap-1.5">
                    You <ActorAvatar name={CAST.rohan.name} size={16} />
                    <span className="font-medium text-[var(--text)]">{CAST.rohan.name}</span>
                  </div>
                  <div>
                    Author <span className="font-medium text-[var(--text)]">{CAST.arjun.name}</span>
                  </div>
                  <div>
                    Part of <span className="font-medium text-[var(--text)]">FEAT-12</span>
                  </div>
                </div>
              </SideCard>
            }
          />
        </ShellScene>
        {ghSlot && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              background: "oklch(97.5% 0.005 264)",
              opacity: Math.min(seg(t, 11.2, 11.6), 1 - seg(t, 13.4, 13.8)),
              zIndex: 20,
            }}
          >
            <div style={{ width: 1660, height: 934 }}>
              <GitHubPR />
            </div>
          </div>
        )}
        <Cursor
          t={t}
          path={[
            { at: 1.4, x: 760, y: 560 },
            { at: 7.6, x: 1640, y: 911 },
            { at: 8.2, x: 1640, y: 911, click: true },
          ]}
        />
        <Caption t={t} a={0.8} b={4.4}>
          A human approves every gate.
        </Caption>
        <Caption t={t} a={9.2} b={13.6}>
          Athena opens the PR. Your team merges it.
        </Caption>
      </div>
    );
  },
};

/* S27 - Done (6s). */

const S27: SceneDef = {
  id: "s27-shipped",
  dur: 6,
  Comp: ({ t }) => {
    const stages: TaskStage[] = [
      mkStage("frame", "Frame", 1, "approved"),
      mkStage("prd", "PRD", 2, "approved"),
      mkStage("design", "Design", 3, "approved"),
      mkStage("decompose", "Decompose", 4, "approved"),
      mkStage("implement", "Implement", 5, "approved"),
      mkStage("review", "Review", 6, "approved"),
    ];
    const settle = evo(t, 0.2, 1.0);
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <ShellFit />
        <ShellScene user={CAST.dev}>
          <div className="flex flex-col gap-4" style={{ height: 780, opacity: settle }}>
            <div className="flex items-center gap-3">
              <TaskIdChip id="FEAT-12" className="text-[13px]" />
              <span className="text-lg font-semibold text-[var(--text)]">
                Same-day refund settlement
              </span>
              <TaskStatusPill status="done" />
              <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                <ActorAvatar name={CAST.dev.name} size={18} />
                {CAST.dev.name}
              </span>
            </div>
            <StageRail stages={stages} selectedStage="review" onSelect={noop} />
            <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--success-soft)] px-4 py-3">
              <OwlAvatar size={30} mood={t > 1.6 ? "happy" : "working"} />
              <span className="text-sm font-medium text-[var(--success-ink)]">
                Approved - task complete.
              </span>
              <span className="ml-auto text-xs text-[var(--success-ink)]">
                3 subtasks done · PR #482 merged
              </span>
            </div>
          </div>
        </ShellScene>
        <Caption t={t} a={1.4} b={5.2}>
          Shipped.
        </Caption>
      </div>
    );
  },
};

export const CH7: SceneDef[] = [S23, S24, S25, S26, S27];
