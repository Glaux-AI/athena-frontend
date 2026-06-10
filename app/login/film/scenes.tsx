"use client";

/**
 * Film scenes — the working artifact shown while each segment is under the
 * playhead. One scene per segment, every one a miniature of the REAL product
 * surface it depicts, built from the app's own idioms: `.phase-status-pill`
 * (cockpit), `.pill` chips, the chat bubble + citation-chip shapes, the
 * agent-activity verb rows, diff-line token pairs, board cards. If a scene
 * drifts from the real component, fix the scene — never the product.
 *
 * Scenes are PURE functions of `t` (the segment's local scrub progress,
 * 0..1). Scrubbing backwards rewinds them exactly. At rest outside the
 * playhead they sit at t=0 or t=1, so the settled end-state must read as a
 * complete picture on its own. Tokens only.
 */

import {
  Brain, Check, CheckCircle2, CircleDashed, Database, Eye,
  FileCode2, Gauge, GitMerge, GitPullRequest, ListChecks, Lock,
  MessageSquare, PencilLine, Plug, ScrollText, ShieldCheck, Sparkles, Wrench,
} from "lucide-react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { cn } from "@/lib/cn";
import { win } from "./kit";
import type { SceneKey } from "./data";

const usd = (n: number) => `$${n.toFixed(2)}`;

/* ---- shared idioms ------------------------------------------------------ */

function Scene({ crumb, children }: { crumb: string; children: React.ReactNode }) {
  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)]"
      style={{ boxShadow: "var(--shadow-3), var(--inner-highlight)" }}
    >
      <div className="flex h-6 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-2)]/60 px-2.5">
        <span className="flex gap-1" aria-hidden>
          <span className="size-1.5 rounded-full bg-[var(--text-subtle)]" />
          <span className="size-1.5 rounded-full bg-[var(--text-subtle)]" />
        </span>
        <span className="mx-auto truncate font-mono text-[9.5px] text-[var(--text-muted)]">{crumb}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">{children}</div>
    </div>
  );
}

function Pill({
  tone, live, children, className,
}: {
  tone?: "info" | "warning" | "success" | "violet";
  live?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("pill", tone && `pill-${tone}`, live && "pill-live", className)}>
      {live && <span className="dot" aria-hidden />}
      {children}
    </span>
  );
}

function MiniCitation({ source, label }: { source: "kn" | "repo"; label: string }) {
  const Icon = source === "kn" ? Database : FileCode2;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="max-w-[170px] truncate">{label}</span>
    </span>
  );
}

/** One agent-activity verb row (components/agent/agent-activity.tsx idiom). */
function WorkRow({
  icon: Icon, verb, detail, running, shown, actor,
}: {
  icon: typeof Eye;
  verb: string;
  detail?: string;
  running?: boolean;
  shown: boolean;
  actor?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1.5 text-[10.5px] leading-snug transition-opacity duration-150")} style={{ opacity: shown ? 1 : 0.12 }}>
      {running && shown ? (
        <CircleDashed className="size-3 shrink-0 animate-spin text-[var(--primary)]" />
      ) : (
        <Icon className="size-3 shrink-0 text-[var(--text-subtle)]" />
      )}
      <span className="shrink-0 font-medium text-[var(--text)]">
        {actor && <span className="mr-1 rounded-[3px] bg-[var(--primary-soft)] px-1 font-mono text-[8.5px] text-[var(--primary)]">{actor}</span>}
        {verb}
      </span>
      {detail && <span className="min-w-0 truncate text-[var(--text-muted)]">· {detail}</span>}
      {!running && shown && <Check className="ml-auto size-3 shrink-0 text-[var(--success)]" />}
    </div>
  );
}

function Foot({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-auto truncate pt-1 font-mono text-[9.5px] leading-none text-[var(--text-subtle)]">
      {children}
    </p>
  );
}

/* ============================================================ 00 foundation */

const SECTIONS = ["Overview", "Architecture", "Conventions"] as const;
const TOPO = {
  nodes: [
    { x: 20, y: 20, r: 4 }, { x: 46, y: 36, r: 5.5 }, { x: 72, y: 20, r: 4 }, { x: 60, y: 54, r: 3.2 },
  ],
  edges: [[0, 1], [1, 2], [1, 3]] as const,
};

function FoundationScene({ t }: { t: number }) {
  const draw = win(t, 0.1, 0.7);
  return (
    <Scene crumb="app.athena.dev/domains/billing">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--text)]">
          <ScrollText className="size-3.5 text-[var(--primary)]" /> Domain · Billing
        </span>
        <span className="flex items-center gap-1">
          {(["GitHub", "GitLab", "Bitbucket"] as const).map((p, i) => (
            <span key={p} className={cn("inline-flex size-5 items-center justify-center rounded-sm border", i === 0 ? "border-[var(--border-accent)] bg-[var(--primary-soft)]/50" : "border-[var(--border)] opacity-50")}>
              <BrandLogo name={p} size={12} />
            </span>
          ))}
        </span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[1.25fr_1fr] gap-2">
        <div className="relative rounded-md border border-[var(--border)] bg-[var(--code-bg)]">
          <svg viewBox="0 0 92 68" className="absolute inset-0 size-full" fill="none" aria-hidden>
            <rect x={9} y={7} width={74} height={54} rx={9} stroke="var(--border-accent)" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="3 3" opacity={0.35 + 0.5 * draw} />
            {TOPO.edges.map(([a, b], i) => {
              const p = TOPO.nodes[a]!; const q = TOPO.nodes[b]!;
              return (
                <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y}
                  stroke="var(--primary)" strokeWidth={1.1} vectorEffect="non-scaling-stroke"
                  opacity={0.65} strokeDasharray={60} strokeDashoffset={60 * (1 - win(draw, i * 0.2, 1))} />
              );
            })}
            {TOPO.nodes.map((n, i) => (
              <circle key={i} cx={n.x} cy={n.y} r={n.r}
                fill={i === 1 ? "var(--primary)" : "var(--surface-3)"}
                stroke="var(--primary)" strokeWidth={1} vectorEffect="non-scaling-stroke"
                opacity={draw > i * 0.2 ? 1 : 0.15} />
            ))}
          </svg>
          <span className="absolute left-2 top-1.5 font-mono text-[8.5px] text-[var(--text-subtle)]">billing-svc → payments-api</span>
        </div>
        <div className="flex min-h-0 flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
          <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--text)]">
            <ScrollText className="size-3 text-[var(--primary)]" /> Blueprint
          </span>
          {SECTIONS.map((s, i) => {
            const on = t > 0.25 + i * 0.18;
            return (
              <span key={s} className="flex items-center justify-between text-[10px]" style={{ opacity: on ? 1 : 0.25 }}>
                <span className="text-[var(--text-muted)]">{s}</span>
                {on ? <Check className="size-3 text-[var(--success)]" /> : <CircleDashed className="size-3 text-[var(--text-subtle)]" />}
              </span>
            );
          })}
          <span className="mt-auto border-t border-[var(--border-soft)] pt-1 text-[9px] leading-snug text-[var(--text-subtle)]">
            Per repo · per domain · org-wide
          </span>
        </div>
      </div>
      <Foot>{t > 0.8 ? "12 repos indexed · synced just now" : "reading billing-svc …"}</Foot>
    </Scene>
  );
}

/* ================================================================= 01 stack */

const STACK_WORK = ["Jira", "Linear", "Slack", "Asana"] as const;
const STACK_AI = ["Anthropic", "OpenAI", "Google Gemini", "AWS Bedrock"] as const;

/** One cluster of the stack — label + content, revealing at its window. */
function StackCluster({
  label, at, t, children,
}: {
  label: string;
  at: number;
  t: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex min-h-0 flex-col gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 transition-opacity duration-200"
      style={{ opacity: t > at ? 1 : 0.2 }}
    >
      <span className="text-[8.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{label}</span>
      {children}
    </div>
  );
}

function StackScene({ t }: { t: number }) {
  return (
    <Scene crumb="app.athena.dev/settings/integrations">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--text)]">
          <Plug className="size-3.5 text-[var(--primary)]" /> Integrations &amp; AI
        </span>
        <Pill>All optional</Pill>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-1.5">
        <StackCluster label="Work & comms" at={0.08} t={t}>
          <div className="flex flex-wrap gap-1">
            {STACK_WORK.map((n, i) => (
              <span key={n} className="inline-flex h-6 items-center gap-1 rounded-md border border-[var(--border)] px-1.5 text-[9.5px] font-medium text-[var(--text-muted)]">
                <BrandLogo name={n} size={12} />
                {n}
                {t > 0.18 + i * 0.05 && <Check className="size-2.5 text-[var(--success)]" />}
              </span>
            ))}
          </div>
          <span className="mt-auto text-[8.5px] leading-snug text-[var(--text-subtle)]">tickets + threads add context · updates flow back</span>
        </StackCluster>
        <StackCluster label="AI models" at={0.3} t={t}>
          <div className="flex flex-wrap gap-1">
            {STACK_AI.map((n) => (
              <span key={n} className="inline-flex size-6 items-center justify-center rounded-md border border-[var(--border)]" title={n}>
                <BrandLogo name={n} size={14} />
              </span>
            ))}
            <span className="inline-flex h-6 items-center rounded-md border border-[var(--border)] px-1.5 text-[9.5px] font-medium text-[var(--text-subtle)]">
              +10
            </span>
          </div>
          <span className="mt-auto flex items-center gap-1 text-[8.5px] leading-snug text-[var(--text-subtle)]">
            <span className="rounded-[3px] bg-[var(--acc-violet-soft)] px-1 py-px font-semibold text-[var(--acc-violet-ink)]">your key</span>
            or Athena credit — per model, per role
          </span>
        </StackCluster>
        <StackCluster label="Rules & skills" at={0.5} t={t}>
          <span className="flex items-center gap-1.5 text-[10px] text-[var(--text)]">
            <ScrollText className="size-3 shrink-0 text-[var(--text-subtle)]" />
            Org rules — read on every run
            {t > 0.58 && <Check className="ml-auto size-2.5 shrink-0 text-[var(--success)]" />}
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-[var(--text)]">
            <Sparkles className="size-3 shrink-0 text-[var(--text-subtle)]" />
            Skills — playbooks Athena can run
            {t > 0.64 && <Check className="ml-auto size-2.5 shrink-0 text-[var(--success)]" />}
          </span>
        </StackCluster>
        <StackCluster label="MCP servers" at={0.68} t={t}>
          <span className="flex items-center gap-1.5 text-[10px] text-[var(--text)]">
            <Wrench className="size-3 shrink-0 text-[var(--text-subtle)]" />
            Your MCP tools — callable in runs
            {t > 0.76 && <Check className="ml-auto size-2.5 shrink-0 text-[var(--success)]" />}
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-[var(--text)]">
            <Plug className="size-3 shrink-0 text-[var(--text-subtle)]" />
            Coding agents — connect the other way
            {t > 0.84 && <Check className="ml-auto size-2.5 shrink-0 text-[var(--success)]" />}
          </span>
        </StackCluster>
      </div>
      <Foot>source control alone is enough to start — wire the rest anytime</Foot>
    </Scene>
  );
}

/* =================================================================== 01 ask */

const ANSWER =
  "They can't double-charge anymore — every retry reuses the idempotency key minted in charge.py, so the gateway sees one charge no matter how many attempts land.";

function AskScene({ t }: { t: number }) {
  const typed = Math.round(ANSWER.length * win(t, 0.1, 0.62));
  return (
    <Scene crumb="app.athena.dev/chat">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--text)]">
          <MessageSquare className="size-3.5 text-[var(--primary)]" /> Chat · org-wide
        </span>
        <Pill>Read-only</Pill>
      </div>
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md border border-[var(--border-soft)] bg-[var(--surface-2)] px-3 py-1.5 text-[11px] leading-relaxed text-[var(--text)]">
          Why do billing retries sometimes double-charge?
        </div>
      </div>
      <p className="min-h-0 flex-1 overflow-hidden text-[11px] leading-relaxed text-[var(--text)]">
        {ANSWER.slice(0, typed)}
        {typed > 0 && typed < ANSWER.length && <span className="bf-caret font-semibold text-[var(--primary)]">▍</span>}
      </p>
      <div className="flex min-h-5 flex-wrap items-center gap-1.5">
        <span className="text-[8.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Sources</span>
        {t > 0.62 && <span className="ff-pop inline-flex"><MiniCitation source="repo" label="billing-svc/charge.py · L84" /></span>}
        {t > 0.7 && <span className="ff-pop inline-flex"><MiniCitation source="kn" label="ADR-041 · idempotent retries" /></span>}
      </div>
      <div
        className={cn("flex h-8 items-center gap-2 rounded-md border px-2.5 transition-colors duration-200",
          t > 0.84 ? "border-[var(--primary)] bg-[var(--primary-soft)]/50" : "border-[var(--border)] bg-[var(--surface)]")}
      >
        <Sparkles className="size-3.5 shrink-0 text-[var(--primary)]" />
        <span className="min-w-0 truncate text-[10.5px] font-medium text-[var(--text)]">
          Propose as a feature — &ldquo;Retry billing webhooks safely&rdquo;
        </span>
        {t > 0.84 && <Check className="ml-auto size-3.5 shrink-0 text-[var(--success)]" />}
      </div>
      <Foot>1.4k tokens · $0.03 · every claim cites its source</Foot>
    </Scene>
  );
}

/* =================================================================== 02 prd */

const PRD_SECTIONS = ["Goal", "Context", "Approach", "Acceptance", "Risks"] as const;

function PrdScene({ t }: { t: number }) {
  const rows = Math.floor(win(t, 0.3, 0.78) * PRD_SECTIONS.length + 0.0001);
  const gateOpen = t > 0.84;
  return (
    <Scene crumb="app.athena.dev/work/TSK-214">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] font-semibold text-[var(--text)]">
          <ScrollText className="size-3.5 shrink-0 text-[var(--primary)]" />
          <span className="truncate">PRD · Retry billing webhooks safely</span>
        </span>
        {gateOpen
          ? <span className="phase-status-pill s-needs-review shrink-0"><Eye className="size-3" /> Needs your review</span>
          : <span className="phase-status-pill s-running shrink-0"><Sparkles className="size-3" /> Athena working</span>}
      </div>
      {/* the worklog — every step on the record as it happens */}
      <div className="flex flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
        <WorkRow icon={Eye} verb="Searching the codebase" detail="webhook retry paths · 12 results" shown={t > 0.08} />
        <WorkRow icon={Eye} verb="Reading the Blueprint" detail="billing-svc · Architecture" shown={t > 0.16} />
        <WorkRow icon={Brain} verb="Planning" detail="PRD outline · 5 sections" shown={t > 0.24} />
      </div>
      {/* the artifact, assembling section by section */}
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--code-bg)] p-2">
        {PRD_SECTIONS.map((s, i) => (
          <span key={s} className="flex items-center gap-1.5 text-[10.5px]" style={{ opacity: i < rows ? 1 : 0.15 }}>
            <PencilLine className="size-3 shrink-0 text-[var(--text-subtle)]" />
            <span className="font-medium text-[var(--text)]">{s}</span>
            <span className="min-w-0 flex-1 truncate text-[var(--text-subtle)]">{"—".repeat(2)} drafted, cited</span>
          </span>
        ))}
        <span className="mt-auto flex flex-wrap gap-1 pt-1">
          {t > 0.6 && <span className="ff-pop inline-flex"><MiniCitation source="kn" label="ADR-041" /></span>}
          {t > 0.68 && <span className="ff-pop inline-flex"><MiniCitation source="repo" label="charge.py" /></span>}
          {t > 0.74 && <span className="ff-pop inline-flex"><MiniCitation source="repo" label="PR #812" /></span>}
        </span>
      </div>
      <Foot>steer or stop anytime · the log is the audit trail</Foot>
    </Scene>
  );
}

/* ================================================================= 03 split */

const SUBTASKS = [
  { id: "TSK-215", kind: "implementation", title: "Webhook retry queue + idempotency keys", after: null },
  { id: "TSK-216", kind: "design", title: "Retry status UI states", after: null },
  { id: "TSK-217", kind: "implementation", title: "Retry dashboard widget", after: "TSK-216" },
  { id: "TSK-218", kind: "chore", title: "Backfill failed webhooks", after: "TSK-215" },
] as const;

const KIND_TINT: Record<string, string> = {
  implementation: "bg-[var(--acc-violet-soft)] text-[var(--acc-violet-ink)]",
  design: "bg-[var(--acc-cyan-soft)] text-[var(--acc-cyan-ink)]",
  chore: "bg-[var(--surface-2)] text-[var(--text-subtle)]",
};

function SplitScene({ t }: { t: number }) {
  const shown = Math.floor(win(t, 0.08, 0.6) * SUBTASKS.length + 0.0001);
  const approved = t > 0.86;
  return (
    <Scene crumb="app.athena.dev/work/TSK-214">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--text)]">
          <ListChecks className="size-3.5 text-[var(--primary)]" /> Decompose · subtask plan
        </span>
        {approved
          ? <span className="phase-status-pill s-approved"><CheckCircle2 className="size-3" /> Approved</span>
          : <span className="phase-status-pill s-needs-review"><Eye className="size-3" /> Needs review — your lead</span>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
        <span className="text-[8.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
          Proposed split — typed, ordered by dependencies
        </span>
        {SUBTASKS.map((s, i) => (
          <div key={s.id} className="flex h-8 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)]/50 px-2 transition-opacity duration-150" style={{ opacity: i < shown ? 1 : 0.12 }}>
            <span className="shrink-0 font-mono text-[9px] text-[var(--text-subtle)]">{s.id}</span>
            <span className={cn("shrink-0 rounded-[3px] px-1 py-px text-[8px] font-semibold", KIND_TINT[s.kind])}>{s.kind}</span>
            <span className="min-w-0 truncate text-[10px] text-[var(--text)]">{s.title}</span>
            {s.after && (
              <span className="ml-auto shrink-0 rounded-[3px] bg-[var(--warning-soft)] px-1 py-px font-mono text-[8px] font-semibold text-[var(--warning-ink)]">
                after {s.after}
              </span>
            )}
          </div>
        ))}
      </div>
      {approved && (
        <div className="bf-slide-in flex h-8 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--success-soft)] px-2.5">
          <CheckCircle2 className="size-3.5 shrink-0 text-[var(--success)]" />
          <span className="min-w-0 truncate text-[10.5px] font-semibold text-[var(--success-ink)]">
            4 subtasks created — dependencies wired
          </span>
        </div>
      )}
      <Foot>AI proposes the split and the order — nothing exists until a human approves</Foot>
    </Scene>
  );
}

/* ================================================================= 04 build */

/** Column index per card as a step function of t — the board choreography.
 *  TSK-218 is BLOCKED until its dependency (TSK-215) reaches Done: the
 *  topological unblock, made visible. */
const COLS = ["To do", "In progress", "In review", "Done"] as const;

function colOf(card: "215" | "216" | "217" | "218", t: number): number {
  switch (card) {
    case "215": return t < 0.18 ? 1 : t < 0.4 ? 2 : 3;            // impl → your diff review → done
    case "216": return t < 0.3 ? 1 : t < 0.5 ? 2 : 3;             // the design lane
    case "217": return t < 0.34 ? 0 : t < 0.62 ? 1 : t < 0.8 ? 2 : 3; // Cursor's lane
    case "218": return t < 0.4 ? 0 : t < 0.66 ? 1 : t < 0.86 ? 2 : 3; // blocked until 215 lands
  }
}

const BUILD_CARDS: { id: "215" | "216" | "217" | "218"; kind: keyof typeof KIND_TINT; tag?: "cursor" | "design" }[] = [
  { id: "215", kind: "implementation" },
  { id: "216", kind: "design", tag: "design" },
  { id: "217", kind: "implementation", tag: "cursor" },
  { id: "218", kind: "chore" },
];

function BuildScene({ t }: { t: number }) {
  const blocked218 = t < 0.4;
  const yourDiffGate = t >= 0.18 && t < 0.4;
  const allDone = t >= 0.86;
  return (
    <Scene crumb="app.athena.dev/work">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--text)]">
          <ListChecks className="size-3.5 text-[var(--primary)]" /> Board · Retry billing webhooks
        </span>
        {allDone
          ? <Pill tone="success"><Check className="size-3" /> 4 / 4 done</Pill>
          : <Pill tone="info" live>{`${BUILD_CARDS.filter((c) => colOf(c.id, t) === 3).length} / 4 done`}</Pill>}
      </div>
      {/* the kanban — each lane runs its own playbook */}
      <div className="grid min-h-0 flex-1 grid-cols-4 gap-1.5">
        {COLS.map((col, ci) => (
          <div key={col} className="flex min-h-0 flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] p-1.5">
            <span className="truncate text-[8.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{col}</span>
            {BUILD_CARDS.filter((c) => colOf(c.id, t) === ci).map((c) => (
              <div key={c.id} className="bf-slide-in flex flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)]/60 p-1.5">
                <span className="flex items-center justify-between gap-1">
                  <span className="font-mono text-[9px] font-medium text-[var(--text)]">TSK-{c.id}</span>
                  {c.tag === "cursor" && ci === 1 && <BrandLogo name="Cursor" size={11} />}
                </span>
                <span className={cn("w-fit rounded-[3px] px-1 py-px text-[7.5px] font-semibold", KIND_TINT[c.kind])}>{c.kind}</span>
                {c.id === "218" && blocked218 && (
                  <span className="inline-flex items-center gap-0.5 text-[8px] font-semibold text-[var(--warning-ink)]">
                    <Lock className="size-2.5" /> waits on 215
                  </span>
                )}
                {c.id === "217" && ci === 1 && (
                  <span className="truncate text-[8px] font-medium text-[var(--info-ink)]">Cursor working</span>
                )}
                {c.id === "216" && ci <= 2 && (
                  <span className="truncate text-[8px] text-[var(--text-subtle)]">Design · critique</span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      {/* the diff hard-gate on TSK-215 — reviewed before any PR exists */}
      {yourDiffGate ? (
        <div className="flex flex-col gap-0.5 rounded-md border border-[var(--border)] bg-[var(--code-bg)] p-1.5 font-mono text-[9.5px] leading-[1.5]">
          <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
            <FileCode2 className="size-3" /> charge.py
            <span className="phase-status-pill s-needs-review ml-auto !text-[9px]"><Eye className="size-2.5" /> You&apos;re reviewing</span>
          </span>
          <span className="rounded-sm bg-[var(--danger-soft)] px-1 text-[var(--danger-ink)]">-  key = uuid4()</span>
          <span className="rounded-sm bg-[var(--success-soft)] px-1 text-[var(--success-ink)]">+  key = req.idempotency_key</span>
        </div>
      ) : (
        <div className={cn("flex h-7 items-center gap-2 rounded-md border border-[var(--border)] px-2", t >= 0.4 ? "bg-[var(--success-soft)]" : "bg-[var(--surface)]")}>
          {t >= 0.4
            ? <><ShieldCheck className="size-3.5 shrink-0 text-[var(--success)]" /><span className="truncate text-[10px] font-semibold text-[var(--success-ink)]">Diff approved by you — line by line, before any PR</span></>
            : <><Lock className="size-3 shrink-0 text-[var(--text-subtle)]" /><span className="truncate text-[10px] text-[var(--text-muted)]">Hard gates wait on each subtask</span></>}
        </div>
      )}
      <Foot>picked up by your team · blocked work waits for its dependency graph</Foot>
    </Scene>
  );
}

/* ================================================================== 05 ship */

function ShipScene({ t }: { t: number }) {
  const healStarted = t > 0.2;
  const healed = t > 0.52;
  const merged = t > 0.82;
  return (
    <Scene crumb="github.com · your-org/billing-svc · PR #812">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] font-semibold text-[var(--text)]">
          <GitPullRequest className="size-3.5 shrink-0 text-[var(--primary)]" />
          <span className="truncate">Retry billing webhooks safely</span>
        </span>
        {merged
          ? <Pill tone="success"><GitMerge className="size-3" /> Merged</Pill>
          : <Pill tone="info">Draft PR</Pill>}
      </div>
      <span className="truncate font-mono text-[9.5px] text-[var(--text-subtle)]">
        athena/tsk-215-retry-webhooks → main · your CI, not a sandbox
      </span>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
        {[{ name: "unit" }, { name: "typecheck" }].map((c) => (
          <span key={c.name} className="flex items-center gap-1.5 text-[10.5px]">
            <CheckCircle2 className="size-3 text-[var(--success)]" />
            <span className="font-mono text-[var(--text)]">{c.name}</span>
            <span className="ml-auto text-[9.5px] text-[var(--text-subtle)]">passed</span>
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[10.5px]">
          {healed
            ? <CheckCircle2 className="size-3 text-[var(--success)]" />
            : <CircleDashed className={cn("size-3", healStarted ? "animate-spin text-[var(--primary)]" : "text-[var(--danger)]")} />}
          <span className="font-mono text-[var(--text)]">e2e</span>
          <span className={cn("ml-auto text-[9.5px]", healed ? "text-[var(--text-subtle)]" : healStarted ? "text-[var(--info-ink)]" : "text-[var(--danger-ink)]")}>
            {healed ? "passed · fixed by Athena" : healStarted ? "Athena pushing a fix" : "failed"}
          </span>
        </span>
        {t > 0.62 && (
          <span className="bf-slide-in mt-auto flex items-center gap-1.5 border-t border-[var(--border-soft)] pt-1.5 text-[10px] text-[var(--text-muted)]">
            <ListChecks className="size-3 text-[var(--primary)]" /> 4 subtasks rolled up — feature complete when the graph is
          </span>
        )}
      </div>
      <div className="flex h-8 items-center gap-2">
        {merged ? (
          <span className="bf-slide-in inline-flex h-7 items-center gap-1.5 rounded-md bg-[var(--success-soft)] px-2.5 text-[10.5px] font-semibold text-[var(--success-ink)]">
            <GitMerge className="size-3.5" /> Merged by you
          </span>
        ) : (
          <span className="inline-flex h-7 cursor-not-allowed items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 text-[10.5px] font-semibold text-[var(--text-subtle)] opacity-70" title="Athena never merges.">
            <Lock className="size-3" /> Merge
          </span>
        )}
        <span className="min-w-0 truncate text-[9.5px] font-medium text-[var(--text-muted)]">
          {merged ? "— a human, every time" : "— that button isn't Athena's"}
        </span>
      </div>
      <Foot>your repo · your CI · your merge</Foot>
    </Scene>
  );
}

/* =============================================================== 06 receipt */

const LEDGER = [
  { stage: "prd", model: "Opus 4.8", source: "your key", usd: 0.38 },
  { stage: "design", model: "Sonnet 4.6", source: "credit", usd: 0.22 },
  { stage: "execution", model: "Sonnet 4.6", source: "your key", usd: 0.31 },
  { stage: "pr_heal", model: "Haiku 4.5", source: "credit", usd: 0.05 },
];

function ReceiptScene({ t }: { t: number }) {
  const fillPct = Math.round(win(t, 0.1, 0.85) * 48);
  return (
    <Scene crumb="app.athena.dev/cost">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--text)]">
          <Gauge className="size-3.5 text-[var(--primary)]" /> Cost · this feature
        </span>
        <span className="shrink-0 text-[11px] font-semibold tabular-nums text-[var(--text)]">
          {usd(0.94 + win(t, 0, 0.8) * 1.47)} · 184k tokens
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] p-1.5">
        <span className="px-1 pb-0.5 text-[8.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
          Ledger — one row per AI call
        </span>
        {LEDGER.map((r, i) => {
          const shown = t > 0.1 + i * 0.12;
          return (
            <span key={r.stage} className="flex items-center gap-2 rounded-sm px-1 py-0.5 text-[10px] transition-opacity duration-150" style={{ opacity: shown ? 1 : 0.12 }}>
              <span className="w-16 shrink-0 truncate font-mono font-medium text-[var(--text)]">{r.stage}</span>
              <span className="min-w-0 truncate text-[var(--text-muted)]">{r.model}</span>
              <span className={cn("ml-auto shrink-0 rounded-[3px] px-1 py-px text-[8px] font-semibold",
                r.source === "your key" ? "bg-[var(--acc-violet-soft)] text-[var(--acc-violet-ink)]" : "bg-[var(--surface-2)] text-[var(--text-subtle)]")}>
                {r.source}
              </span>
              <span className="w-9 shrink-0 text-right font-mono tabular-nums text-[var(--text)]">{usd(shown ? r.usd : 0)}</span>
            </span>
          );
        })}
        <span className="px-1 text-[8.5px] text-[var(--text-subtle)]" style={{ opacity: t > 0.6 ? 1 : 0 }}>… 14 more rows · roll up by task, repo, domain, model, person</span>
      </div>
      <div className="flex flex-col gap-1">
        <div className="relative h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]">
          <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--primary)]" style={{ width: `${fillPct}%`, transition: "width 100ms linear" }} />
          <span className="absolute inset-y-0 w-px bg-[var(--warning)]" style={{ left: "80%" }} aria-hidden />
        </div>
        <div className="flex items-center justify-between text-[8.5px] text-[var(--text-subtle)]">
          <span className="tabular-nums">{fillPct}% of the org&apos;s monthly budget</span>
          <span>hard stop at 100% — no overruns</span>
        </div>
      </div>
      <Foot>as billed by the provider · your key or Athena credit, attributed</Foot>
    </Scene>
  );
}

/* =================================================================== 07 cta */

const RECAP = [
  "A question answered with citations",
  "A PRD drafted, gated, approved",
  "Split into subtasks, built in parallel — design included",
  "A diff reviewed by a human, then a draft PR",
  "Merged by you · $2.41 on the ledger",
];

function CtaScene({ t }: { t: number }) {
  return (
    <Scene crumb="app.athena.dev">
      <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--text)]">
        <Sparkles className="size-3.5 text-[var(--primary)]" /> The whole product, in one feature
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-1.5">
        {RECAP.map((line, i) => (
          <span key={line} className="flex items-start gap-1.5 text-[10.5px] leading-snug text-[var(--text-muted)] transition-opacity duration-150" style={{ opacity: t > 0.08 + i * 0.13 ? 1 : 0.15 }}>
            <CheckCircle2 className="mt-px size-3 shrink-0 text-[var(--success)]" />
            {line}
          </span>
        ))}
      </div>
      <Foot>you hold every gate · free to start, no card</Foot>
    </Scene>
  );
}

/* ============================================================ scene router */

const SCENES: Record<SceneKey, (props: { t: number }) => React.JSX.Element> = {
  foundation: FoundationScene,
  stack: StackScene,
  ask: AskScene,
  prd: PrdScene,
  split: SplitScene,
  build: BuildScene,
  ship: ShipScene,
  receipt: ReceiptScene,
  cta: CtaScene,
};

export function FilmScene({ scene, t }: { scene: SceneKey; t: number }) {
  const Comp = SCENES[scene];
  return <Comp t={t} />;
}
