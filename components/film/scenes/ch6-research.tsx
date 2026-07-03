"use client";

/**
 * Chapter 06 - From question to plan.
 * S18 chapter card, S19 Priya's chat research, S20 share + viewer swap,
 * S21 Dev's task proposal -> FEAT-12 on the kanban, S22 decompose + assign.
 *
 * Every product surface is the REAL component fed fixture props as a pure
 * function of t: ChatMessage / ReasoningPanel / ChatComposer /
 * ShareThreadDialog / TaskProposalCard (via ChatMessage) / KanbanBoard /
 * StageRail / StageWorklog / SubtaskPanel / TaskIdChip / TaskStatusPill /
 * ActorAvatar - all inside the real AppShell (ShellScene).
 */

import { useEffect, useRef } from "react";

import { ChatMessage as ChatMessageRow } from "@/components/chat/chat-message";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ReasoningPanel } from "@/components/chat/reasoning-panel";
import { ShareThreadDialog } from "@/components/chat/share-thread-dialog";
import { ActorAvatar } from "@/components/mascot/actor-avatar";
import { KanbanBoard } from "@/components/board/kanban-board";
import { StageRail } from "@/components/work/stage-rail";
import { StageWorklog } from "@/components/work/stage-worklog";
import { SubtaskPanel } from "@/components/work/subtask-panel";
import { TaskIdChip } from "@/components/work/task-id-chip";
import { TaskStatusPill } from "@/components/ui/task-status-pill";
import { Button } from "@/components/ui/button";
import type {
  ChatMessage as ChatMessageT,
  KanbanColumn,
  LedgerStep,
  Member,
  SubtaskNode,
  Task,
  TaskStage,
  TaskType,
  TaskStatus,
} from "@/lib/api/client";

import { seg, evo, lerp, typed, type SceneDef } from "../engine";
import { Caption, Callout, ChapterCard, Cursor } from "../language";
import { ShellScene } from "../scene-hosts";
import { TaskCockpit, SubtasksCard, GateComposer } from "../task-cockpit";

/* ------------------------------------------------------------------ cast */

export const CAST = {
  priya: { name: "Priya Nair", email: "priya@meridian.dev", id: "u_priya" },
  dev: { name: "Dev Patel", email: "dev@meridian.dev", id: "u_dev" },
  sara: { name: "Sara Kim", email: "sara@meridian.dev", id: "u_sara" },
  arjun: { name: "Arjun Mehta", email: "arjun@meridian.dev", id: "u_arjun" },
  rohan: { name: "Rohan Iyer", email: "rohan@meridian.dev", id: "u_rohan" },
} as const;

export const FILM_MEMBERS: Member[] = Object.values(CAST).map((p, i) => ({
  user_id: p.id,
  membership_id: `fm_${i}`,
  email: p.email,
  display_name: p.name,
  avatar_url: null,
  role: "engineer",
  is_owner: false,
  joined_at: "2026-06-01T09:00:00Z",
  deactivated_at: null,
}));

export const MEMBERS_BY_ID = new Map(FILM_MEMBERS.map((m) => [m.user_id, m]));

/** AppShell inside the 1600x940 film frame: its root uses h-screen (100vh of
 *  the real viewport), which would overflow the frame - pin it to the frame. */
export function ShellFit() {
  return (
    <style>{`.film-shell .h-screen { height: 100% !important; }`}</style>
  );
}

/* ----------------------------------------------------------- task fixture */

export function mkTask(over: Partial<Task> & { id: string; display_id: string; title: string; type: TaskType; status: TaskStatus }): Task {
  return {
    org_id: "org_lumen",
    domain_id: null,
    domain_ids: [],
    parent_id: null,
    depends_on: [],
    blocks: [],
    owning_team_id: null,
    owner_user_id: null,
    assignee: null,
    reviewer_user_id: null,
    ai_delegated: false,
    label_ids: [],
    cycle_id: null,
    estimate_points: null,
    design_token_set_ids: [],
    auto_approve: false,
    auto_approve_descendants: false,
    body: "",
    priority: null,
    target_date: null,
    health: null,
    cancel_reason: null,
    spent_usd: null,
    budget_usd: null,
    stream_url: "",
    artifact_ids: [],
    run_ids: [],
    child_ids: [],
    children_total: 0,
    children_done: 0,
    children_blocked: 0,
    created_by_user_id: null,
    created_at: "2026-07-01T09:00:00Z",
    updated_at: "2026-07-02T10:00:00Z",
    completed_at: null,
    ...over,
  } as Task;
}

export function mkStage(
  stage_key: string,
  title: string,
  ordinal: number,
  status: TaskStage["status"],
  gate: "hard" | "soft" = "hard",
): TaskStage {
  return {
    stage_key,
    title,
    ordinal,
    action: stage_key,
    artifact_kind: null,
    gate,
    status,
    artifact_id: null,
    gate_input_id: null,
  };
}

/* ------------------------------------------------------- chat transcript */

const QUESTION = "Why do refunds take two days to settle?";

const REASONING =
  "The question spans two repos. refunds-api owns the approval flow; money movement lives in settlement-service. I should check how settlement is scheduled - the reconciliation engine and any batching decision on record - then explain the end-to-end delay with sources.";

const ANSWER_P1 =
  "Refunds settle on a **nightly batch**, not on approval. `refunds-api` marks a refund `approved` immediately, but money only moves when `settlement-service` runs reconciliation - a cron at **02:00 UTC**. A refund approved at 09:00 waits for that night's file, and the bank confirms the transfer the following day:";

const ANSWER_MERMAID = [
  "```mermaid",
  "sequenceDiagram",
  "    participant R as refunds-api",
  "    participant S as settlement-service",
  "    participant B as bank rails",
  "    R->>S: refund.approved event",
  "    Note over S: queued until the 02:00 UTC batch",
  "    S->>B: settlement file (T+1)",
  "    B-->>S: confirmation (T+2)",
  "```",
].join("\n");

const ANSWER_P2 =
  "Two days is a **batching policy, not a bank constraint**: ADR-041 chose nightly batching to cap per-transfer fees. The reconciliation engine already supports incremental runs, so a same-day window is an achievable change.";

function answerContent(t: number, a: number): string {
  // Paragraph 1 types, the diagram lands whole, paragraph 2 types.
  const p1 = typed(ANSWER_P1, t, a, a + 2.8);
  if (t < a + 3.0) return p1;
  const p2 = typed(ANSWER_P2, t, a + 3.4, a + 6.2);
  return `${ANSWER_P1}\n\n${ANSWER_MERMAID}\n\n${p2}`;
}

const CITATIONS: NonNullable<ChatMessageT["citations"]> = [
  { label: "settlement-service/reconciliation.py", kind: "file", ref: "settlement-service/reconciliation.py" },
  { label: "ADR-041 Settlement batching", kind: "adr", ref: "docs/decisions/ADR-041-settlement-batching.md" },
  { label: "refunds-api", kind: "file", ref: "meridian/refunds-api" },
];

const TOOL_CALLS: NonNullable<ChatMessageT["tool_calls"]> = [
  { name: "hybrid_retrieval", args: { query: "refund settlement batch schedule" } },
  { name: "search_decisions", args: { query: "settlement batching" } },
  { name: "read_repo_file", args: { path: "settlement-service/reconciliation.py" } },
];

function userMsg(id: string, content: string, who: string): ChatMessageT {
  return {
    id: `__local_${id}`,
    thread_id: "th_film",
    role: "user",
    who,
    avatar: "",
    content,
    created_at: "2026-07-02T10:04:00Z",
  };
}

function athenaMsg(content: string, opts?: Partial<ChatMessageT>): ChatMessageT {
  return {
    id: "__local_a1",
    thread_id: "th_film",
    role: "assistant",
    who: "Athena",
    avatar: "AT",
    content,
    created_at: "2026-07-02T10:04:30Z",
    ...opts,
  };
}

const noop = () => {};

/** Shared, read-only render of a ChatMessage with all callbacks inert. */
export function Msg({ m }: { m: ChatMessageT }) {
  return (
    <ChatMessageRow
      message={m}
      onCitationOpen={noop}
      onEdit={noop}
      editDisabled
      onPickClarification={noop}
      cardsDisabled
    />
  );
}

/** The centered open-canvas chat column (mirrors /chat's layout rhythm). */
function ChatCanvas({ children, composer }: { children: React.ReactNode; composer?: React.ReactNode }) {
  return (
    <div className="mx-auto flex h-full w-full max-w-[860px] flex-col" style={{ height: 780 }}>
      <div className="min-h-0 flex-1 space-y-6 overflow-hidden pt-2">{children}</div>
      {composer && <div className="pb-2 pt-4">{composer}</div>}
    </div>
  );
}

/** Fire a real DOM interaction once when t crosses `at` (film-realm scenes
 *  can't reach component-internal state any other way). `fire` returns true
 *  on success; until then it retries every frame - the target may still be
 *  loading (e.g. the share dialog's member list). Replayable after a
 *  backward seek, so RENDER(t) stays repeatable. */
function useDomBeat(t: number, at: number, fire: () => boolean) {
  const done = useRef(false);
  useEffect(() => {
    if (t >= at && !done.current) {
      if (fire()) done.current = true;
    } else if (t < at - 0.5 && done.current) {
      done.current = false;
    }
  }, [t, at, fire]);
}

/* ---------------------------------------------------------------- scenes */

const S18: SceneDef = {
  id: "s18-ch6-card",
  dur: 3,
  Comp: ({ t, dur }) => (
    <ChapterCard t={t} dur={dur} num="06" kicker="Chapter 06" title="From question to plan" />
  ),
};

/* S19 - Priya researches (17s). */
const S19: SceneDef = {
  id: "s19-priya-research",
  dur: 17,
  Comp: ({ t }) => {
    const sent = t >= 2.7;
    const thinking = t >= 3.0 && t < 5.6;
    const answering = t >= 5.6;
    const settled = t >= 12.6;
    const citeCount = Math.floor(seg(t, 11.6, 13.4) * 3.0001);
    const draft = sent ? "" : typed(QUESTION, t, 0.6, 2.4);

    const answer = athenaMsg(answerContent(t, 5.8), {
      ...(answering && t >= 5.9 ? { reasoning: REASONING } : {}),
      ...(citeCount > 0 ? { citations: CITATIONS.slice(0, citeCount) } : {}),
      ...(settled
        ? {
            tool_calls: TOOL_CALLS,
            confidence_score: 0.93,
            confidence_reason: "Grounded in the settlement scheduler source and ADR-041.",
            token_usage: { prompt_tokens: 18400, completion_tokens: 960, total_cost_usd: 0.14 },
          }
        : {}),
    });

    const zoom = evo(t, 13.2, 16.4);

    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <ShellFit />
        <ShellScene
          user={CAST.priya}
          frameStyle={{
            transform: `scale(${lerp(1, 1.07, zoom)}) translateY(${lerp(0, -60, zoom)}px)`,
          }}
        >
          <ChatCanvas
            composer={
              <ChatComposer
                value={draft}
                onChange={noop}
                onSend={noop}
                onStop={noop}
                sending={sent && !settled}
              />
            }
          >
            <div className="text-xs font-medium text-[var(--text-subtle)]">
              Refund settlement · org scope
            </div>
            {sent && <Msg m={userMsg("u1", QUESTION, CAST.priya.name)} />}
            {thinking && (
              <div className="flex gap-3">
                <ActorAvatar name="Athena" agent size={26} className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="text-xs font-semibold text-[var(--text)]">Athena</div>
                  <ReasoningPanel reasoning={typed(REASONING, t, 3.2, 5.4)} defaultOpen />
                </div>
              </div>
            )}
            {answering && <Msg m={answer} />}
          </ChatCanvas>
        </ShellScene>
        <Cursor
          t={t}
          path={[
            { at: 0.4, x: 1180, y: 760 },
            { at: 2.5, x: 1480, y: 900 },
            { at: 2.7, x: 1480, y: 900, click: true },
            { at: 4.5, x: 1300, y: 620 },
          ]}
        />
        <Caption t={t} a={0.6} b={4.6}>
          Ask your whole organization anything.
        </Caption>
        <Callout t={t} a={13.8} b={16.4} x={700} y={600}>
          every claim, cited
        </Callout>
      </div>
    );
  },
};

/* S20 - share the thread + viewer swap (8s). */
const S20: SceneDef = {
  id: "s20-share-thread",
  dur: 8,
  Comp: ({ t }) => {
    const asDev = t >= 4.4;
    const dialogOpen = t >= 0.9 && t < 4.1;

    // Real click on a teammate row so the checkbox actually ticks. Prefer the
    // Dev Patel row; retry until the member list has loaded.
    useDomBeat(t, 2.3, () => {
      const rows = Array.from(
        document.querySelectorAll<HTMLButtonElement>(
          '.film-stage [role="dialog"] ul li button[aria-pressed="false"]',
        ),
      );
      const row = rows.find((r) => r.textContent?.includes("Dev")) ?? rows[0];
      if (!row) return false;
      row.click();
      return true;
    });

    const transcript = (
      <>
        <div className="text-xs font-medium text-[var(--text-subtle)]">
          Refund settlement · org scope
          {asDev && (
            <span className="ml-2 rounded-full bg-[var(--info-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--info-ink)]">
              Shared by Priya Nair
            </span>
          )}
        </div>
        <Msg m={userMsg("u1", QUESTION, CAST.priya.name)} />
        <Msg
          m={athenaMsg(`${ANSWER_P1}\n\n${ANSWER_MERMAID}\n\n${ANSWER_P2}`, {
            reasoning: REASONING,
            citations: CITATIONS,
            tool_calls: TOOL_CALLS,
            confidence_score: 0.93,
            confidence_reason: "Grounded in the settlement scheduler source and ADR-041.",
            token_usage: { prompt_tokens: 18400, completion_tokens: 960, total_cost_usd: 0.14 },
          })}
        />
      </>
    );

    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <ShellFit />
        <ShellScene user={asDev ? CAST.dev : CAST.priya}>
          <ChatCanvas>{transcript}</ChatCanvas>
        </ShellScene>
        {dialogOpen && (
          <ShareThreadDialog
            threadId="th_film"
            orgId="org_lumen"
            currentUserId={CAST.priya.id}
            threadTitle="Refund settlement"
            onClose={noop}
            onShared={noop}
          />
        )}
        <Cursor
          t={t}
          path={[
            { at: 0.5, x: 1520, y: 150 },
            { at: 0.9, x: 1520, y: 150, click: true },
            { at: 2.1, x: 900, y: 490 },
            { at: 2.3, x: 900, y: 490, click: true },
            { at: 3.5, x: 1157, y: 729 },
            { at: 3.8, x: 1157, y: 729, click: true },
          ]}
        />
        <Caption t={t} a={1.2} b={4.0}>
          Share what you learn.
        </Caption>
      </div>
    );
  },
};

/* S21 - Dev turns it into a Feature (12s). */
const DEV_ASK =
  "Create a feature task: same-day refund settlement. Use this thread as context.";

const PROPOSAL: ChatMessageT = {
  id: "__local_p1",
  thread_id: "th_film",
  role: "task_created",
  who: "Athena",
  avatar: "AT",
  content: "prop_film_1",
  created_at: "2026-07-02T10:12:00Z",
  payload: {
    proposal_id: "prop_film_1",
    type: "feature" as TaskType,
    domain_id: null,
    title: "Same-day refund settlement",
    goal:
      "Move refund settlement from the nightly 02:00 UTC batch to event-driven same-day settlement windows, keeping reconciliation deterministic and per-transfer fees bounded. Grounded in this thread's research.",
    stages: ["Frame", "PRD", "Design", "Decompose", "Implement", "Review"],
    cta_text: "Start task",
    cta_url: "/work?new=1&proposal_id=prop_film_1",
  },
};

const BOARD_FILLER: { col: TaskStatus; t: Task }[] = [
  { col: "backlog", t: mkTask({ id: "t_pay31", display_id: "PAY-31", title: "Retry webhook deliveries with backoff", type: "feature", status: "backlog", owner_user_id: CAST.priya.id }) },
  { col: "backlog", t: mkTask({ id: "t_led8", display_id: "LED-8", title: "Ledger export v2 (parquet)", type: "chore", status: "backlog" }) },
  { col: "todo", t: mkTask({ id: "t_risk4", display_id: "RISK-4", title: "Tune risk-scoring thresholds", type: "spike", status: "todo", owner_user_id: CAST.rohan.id }) },
  { col: "in_progress", t: mkTask({ id: "t_pay27", display_id: "PAY-27", title: "Webhook signature rotation", type: "implementation", status: "in_progress", owner_user_id: CAST.arjun.id, ai_delegated: true, spent_usd: 3.12 }) },
  { col: "in_review", t: mkTask({ id: "t_kyc9", display_id: "KYC-9", title: "KYC document OCR pass", type: "implementation", status: "in_review", owner_user_id: CAST.sara.id }) },
];

const FEAT12 = mkTask({
  id: "t_feat12",
  display_id: "FEAT-12",
  title: "Same-day refund settlement",
  type: "feature",
  status: "todo",
  owner_user_id: CAST.dev.id,
  ai_delegated: true,
  priority: "high",
});

function boardColumns(withFeat12: boolean): KanbanColumn[] {
  const cols: Record<string, Task[]> = { backlog: [], todo: [], in_progress: [], in_review: [] };
  for (const { col, t } of BOARD_FILLER) cols[col]!.push(t);
  if (withFeat12) cols["todo"]!.unshift(FEAT12);
  return (Object.keys(cols) as TaskStatus[]).map((status) => ({
    status,
    tasks: cols[status]!,
    total: cols[status]!.length,
  }));
}

const S21: SceneDef = {
  id: "s21-task-proposal",
  dur: 12,
  Comp: ({ t }) => {
    const sent = t >= 2.6;
    const proposalIn = t >= 3.4;
    const started = t >= 5.9;
    const onBoard = t >= 7.2;
    const feat12In = t >= 8.0;
    const draft = sent ? "" : typed(DEV_ASK, t, 0.3, 2.3);

    const proposalMsg: ChatMessageT = started
      ? { ...PROPOSAL, spawned_run_id: "t_feat12" }
      : PROPOSAL;

    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <ShellFit />
        <ShellScene user={CAST.dev}>
          {!onBoard ? (
            <ChatCanvas
              composer={
                <ChatComposer value={draft} onChange={noop} onSend={noop} onStop={noop} sending={false} />
              }
            >
              <div className="text-xs font-medium text-[var(--text-subtle)]">
                Refund settlement · org scope
              </div>
              {sent && <Msg m={userMsg("u2", DEV_ASK, CAST.dev.name)} />}
              {proposalIn && (
                <ChatMessageRow
                  message={proposalMsg}
                  onCitationOpen={noop}
                  onEdit={noop}
                  editDisabled
                  onPickClarification={noop}
                  cardsDisabled
                  onStartProposal={noop}
                />
              )}
              {started && (
                <Msg
                  m={{
                    id: "__local_tc1",
                    thread_id: "th_film",
                    role: "task_created",
                    who: "Athena",
                    avatar: "AT",
                    content: "FEAT-12",
                    created_at: "2026-07-02T10:13:00Z",
                  }}
                />
              )}
            </ChatCanvas>
          ) : (
            <div className="flex h-full flex-col gap-4" style={{ height: 780 }}>
              <div>
                <div className="text-lg font-semibold text-[var(--text)]">Work</div>
                <div className="text-sm text-[var(--text-muted)]">Meridian Systems · board</div>
              </div>
              <KanbanBoard columns={boardColumns(feat12In)} membersById={MEMBERS_BY_ID} />
            </div>
          )}
        </ShellScene>
        <Cursor
          t={t}
          path={[
            { at: 0.3, x: 1200, y: 800 },
            { at: 2.4, x: 1480, y: 900 },
            { at: 2.6, x: 1480, y: 900, click: true },
            { at: 5.4, x: 1440, y: 476 },
            { at: 5.8, x: 1440, y: 476, click: true },
            { at: 9.2, x: 915, y: 310 },
          ]}
        />
        <Caption t={t} a={4.4} b={9.6}>
          One sentence becomes real work.
        </Caption>
      </div>
    );
  },
};

/* S22 - decompose & assign (12s). */

const FEAT12_STAGES = (t: number): TaskStage[] => {
  const decomposeStatus: TaskStage["status"] = t < 4.0 ? "running" : t < 7.4 ? "in_review" : "approved";
  return [
    mkStage("frame", "Frame", 1, "approved"),
    mkStage("prd", "PRD", 2, "approved"),
    mkStage("design", "Design", 3, "approved"),
    mkStage("decompose", "Decompose", 4, decomposeStatus),
    mkStage("implement", "Implement", 5, t < 7.4 ? "locked" : "ready"),
    mkStage("review", "Review", 6, "locked"),
  ];
};

const DECOMPOSE_LEDGER: { at: number; step: Omit<LedgerStep, "created_at"> }[] = [
  { at: 0.7, step: { id: "ls1", stage_key: "decompose", seq: 1, kind: "plan", tool_name: null, summary: "Reading the approved PRD + the research thread context", input_refs: [], output_refs: [], status: "ok", call_id: null } },
  { at: 1.6, step: { id: "ls2", stage_key: "decompose", seq: 2, kind: "tool_call", tool_name: "hybrid_retrieval", summary: "query=settlement batch scheduler ownership", input_refs: [], output_refs: [], status: "ok", call_id: "c1" } },
  { at: 2.5, step: { id: "ls3", stage_key: "decompose", seq: 3, kind: "draft", tool_name: null, summary: "Splitting into design, implementation, and rollout review", input_refs: [], output_refs: [], status: "ok", call_id: null } },
  { at: 3.4, step: { id: "ls4", stage_key: "decompose", seq: 4, kind: "write", tool_name: null, summary: "Materializing 3 subtasks with a design -> implementation dependency", input_refs: [], output_refs: [], status: "ok", call_id: null } },
];

function decomposeLedger(t: number): LedgerStep[] {
  return DECOMPOSE_LEDGER.filter((r) => t >= r.at).map((r) => ({
    ...r.step,
    created_at: "2026-07-02T10:14:00Z",
  }));
}

const SUBTASKS: { at: number; node: SubtaskNode }[] = [
  {
    at: 4.4,
    node: { id: "t_feat13", display_id: "FEAT-13", type: "design", title: "Same-day settlement design", status: "todo", ready: true, depends_on: [], blocked_by: [] },
  },
  {
    at: 5.1,
    node: {
      id: "t_feat14", display_id: "FEAT-14", type: "implementation", title: "Event-driven settlement scheduler", status: "todo", ready: false,
      depends_on: ["t_feat13"],
      blocked_by: [{ id: "t_feat13", display_id: "FEAT-13", title: "Same-day settlement design" }],
    },
  },
  {
    at: 5.8,
    node: {
      id: "t_feat15", display_id: "FEAT-15", type: "test", title: "Rollout review + settlement verification", status: "todo", ready: false,
      depends_on: ["t_feat14"],
      blocked_by: [{ id: "t_feat14", display_id: "FEAT-14", title: "Event-driven settlement scheduler" }],
    },
  },
];

const ASSIGNMENTS: { at: number; taskId: string; person: { name: string } }[] = [
  { at: 8.4, taskId: "FEAT-13", person: CAST.sara },
  { at: 9.3, taskId: "FEAT-14", person: CAST.arjun },
  { at: 10.2, taskId: "FEAT-15", person: CAST.rohan },
];

const S22: SceneDef = {
  id: "s22-decompose-assign",
  dur: 12,
  Comp: ({ t }) => {
    const stages = FEAT12_STAGES(t);
    const inReview = t >= 4.0 && t < 7.4;
    const approved = t >= 7.4;
    const subtasks = SUBTASKS.filter((s) => t >= s.at).map((s) => s.node);

    const worklogNode = (
      <div className="overflow-hidden rounded-xl" style={{ maxHeight: 300 }}>
        <StageWorklog
          stageTitle="Decompose"
          ledger={decomposeLedger(t)}
          ledgerLoading={false}
          events={[]}
          stageKey="decompose"
          status="open"
          isRunning={t < 4.0}
        />
      </div>
    );
    const composerNode = (
      <GateComposer
        mode={approved ? "approved" : inReview ? "review" : "running"}
        stageTitle="Decompose"
        approveLabel="Approve - create the subtasks"
        runningLabel="Athena is breaking the feature down - steps show above."
        approvedLabel="Approved - the subtasks are created and on the board."
      />
    );
    const rightNode = (
      <>
        <SubtasksCard>
          <SubtaskPanel subtasks={subtasks} loading={t < 4.4 && t >= 3.9} />
          {ASSIGNMENTS.some((a) => t >= a.at) && (
            <div className="mt-1 flex flex-col gap-1.5 border-t border-[var(--border)] pt-2.5">
              {ASSIGNMENTS.filter((a) => t >= a.at).map((a) => (
                <div key={a.taskId} className="flex items-center gap-2 text-xs">
                  <TaskIdChip id={a.taskId} />
                  <span className="text-[var(--text-muted)]">assigned to</span>
                  <ActorAvatar name={a.person.name} size={16} />
                  <span className="font-medium text-[var(--text)]">{a.person.name}</span>
                </div>
              ))}
            </div>
          )}
        </SubtasksCard>
      </>
    );

    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <ShellFit />
        <ShellScene user={CAST.dev}>
          <TaskCockpit
            idChip="FEAT-12"
            title="Same-day refund settlement"
            status="in_progress"
            owner={{ name: CAST.dev.name }}
            domainLabel="Payments"
            spent={1.2 + seg(t, 0, 11) * 1.1}
            budget={20}
            stages={stages}
            selectedStage="decompose"
            left={
              <>
                {worklogNode}
                {composerNode}
              </>
            }
            right={rightNode}
          />
        </ShellScene>
        <Cursor
          t={t}
          path={[
            { at: 1.0, x: 720, y: 520 },
            { at: 6.4, x: 620, y: 690 },
            { at: 6.9, x: 620, y: 690, click: true },
            { at: 8.4, x: 1360, y: 430 },
            { at: 8.5, x: 1360, y: 430, click: true },
            { at: 9.3, x: 1360, y: 500 },
            { at: 9.4, x: 1360, y: 500, click: true },
            { at: 10.1, x: 1360, y: 570 },
            { at: 10.2, x: 1360, y: 570, click: true },
          ]}
        />
        <Caption t={t} a={0.6} b={3.8}>
          Athena breaks it down.
        </Caption>
        <Caption t={t} a={8.2} b={11.5}>
          Your team picks it up.
        </Caption>
      </div>
    );
  },
};

export const CH6: SceneDef[] = [S18, S19, S20, S21, S22];
