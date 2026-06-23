"use client";

/**
 * Film scenes - the working artifact shown for each segment. One scene per
 * segment, every one a faithful miniature of the REAL product surface it
 * depicts, built from the app's own components and idioms. The rule is strict:
 * a scene mirrors a real screen. Where a screen carries a status, a chip, a
 * column, or a row treatment, the scene uses the SAME one (`.phase-status-pill`,
 * the `TaskStatusPill` color map, the `CitationChip` shape, the `DiffView` rows,
 * the `ScopeHeader` + `FreshnessPill`, the cost KPI tiles + breakdown table).
 * If a scene drifts from the real component, fix the scene - never the product,
 * and never invent UI the product does not have.
 *
 * Scenes are PURE functions of `t` (the segment's local play progress, 0..1).
 * At rest the scene sits at t=1, so the settled end-state must read as a
 * complete picture on its own. Tokens only - no color literals, no em dashes.
 */

import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, BookOpen, Boxes, Brain, Check,
  CheckCircle2, CircleDashed, Code2, Database, ExternalLink,
  Eye, FileCode2, FileDiff, GitFork, GitMerge,
  GitPullRequest, History, Info, ListChecks, Lock, Network, PencilLine, PenTool,
  Plug, ScrollText, Sparkles, SquarePen, User, Wrench,
} from "lucide-react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { cn } from "@/lib/cn";
import { win } from "./kit";
import type { SceneKey } from "./data";

const usd = (n: number) => `$${n.toFixed(2)}`;

/* ---- shared idioms ------------------------------------------------------ */

/** The window chrome - frames each miniature like a screenshot of the app. */
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

function Foot({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-auto truncate pt-1 font-mono text-[9.5px] leading-none text-[var(--text-subtle)]">
      {children}
    </p>
  );
}

/** The generic `.pill` idiom (globals.css). */
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

/** Citation chip - the real `<CitationChip>` shape: a rounded mono chip whose
 *  icon distinguishes a knowledge ref (Database) from a repo-file ref
 *  (FileCode2). No "Sources" label precedes them in the app. */
function MiniCite({ source, label }: { source: "kn" | "repo"; label: string }) {
  const Icon = source === "kn" ? Database : FileCode2;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="max-w-[160px] truncate">{label}</span>
    </span>
  );
}

/** The cockpit stage-rail status label (`.phase-status-pill`). Ink-on-transparent
 *  for every state except the one attention state (needs-review = amber fill). */
function PhasePill({ status, label }: { status: "running" | "needs-review" | "approved"; label?: string }) {
  const cls =
    status === "running" ? "text-[var(--info-ink)]"
      : status === "approved" ? "text-[var(--success-ink)]"
        : "rounded-full bg-[var(--warning-soft)] px-2 py-[3px] text-[var(--warning-ink)]";
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.04em] leading-none", cls)}>
      {status === "running" && <Sparkles className="size-3" />}
      {status === "approved" && <CheckCircle2 className="size-3" />}
      {status === "needs-review" && <Eye className="size-3" />}
      {label ?? (status === "running" ? "Athena working" : status === "approved" ? "Approved" : "Needs your review")}
    </span>
  );
}

/** One agent-activity row (components/agent/agent-activity.tsx): icon + verb +
 *  detail, a spinner while running, a check when settled. */
function WorkRow({
  icon: Icon, verb, detail, running, shown,
}: {
  icon: typeof Eye;
  verb: string;
  detail?: string;
  running?: boolean;
  shown: boolean;
}) {
  return (
    <div className="flex items-start gap-1.5 text-[10.5px] leading-snug transition-opacity duration-150" style={{ opacity: shown ? 1 : 0.12 }}>
      {running && shown ? (
        <Wrench className="mt-px size-3 shrink-0 animate-pulse text-[var(--text-muted)]" />
      ) : (
        <Icon className="mt-px size-3 shrink-0 text-[var(--text-subtle)]" />
      )}
      <span className="min-w-0 flex-1">
        <span className="font-medium text-[var(--text)]">{verb}</span>
        {detail && <span className="text-[var(--text-muted)]"> · {detail}</span>}
      </span>
      {!running && shown && <Check className="mt-px size-3 shrink-0 text-[var(--success)]" />}
    </div>
  );
}

/* ============================================================ 00 foundation */
/* The domain knowledge home: <ScopeHeader> (gradient name + slug + identity
 * chips + freshness pill) over <ScopeTabs>, with the Blueprint tab open. The
 * Blueprint is category-grouped (Identity / Architecture / Operations) with a
 * section body that, like the real one, can carry an architecture diagram. */

const FND_TABS = ["Blueprint", "Topology", "Decisions", "Repos"] as const;
const FND_SECTIONS: { cat: string; name: string }[] = [
  { cat: "Identity", name: "Overview" },
  { cat: "Architecture", name: "Services" },
  { cat: "Architecture", name: "Stack" },
  { cat: "Operations", name: "Runbook" },
];
const FND_NODES = [
  { x: 18, y: 24, r: 4.5, lead: false },
  { x: 50, y: 38, r: 6, lead: true },
  { x: 80, y: 22, r: 4.5, lead: false },
  { x: 64, y: 60, r: 3.6, lead: false },
];
const FND_EDGES = [[0, 1], [1, 2], [1, 3]] as const;

function FoundationScene({ t }: { t: number }) {
  const draw = win(t, 0.15, 0.8);
  return (
    <Scene crumb="app.athena.dev/domains/billing">
      {/* ScopeHeader: name + slug | identity chips + freshness */}
      <div className="flex items-start justify-between gap-2 rounded-lg border border-[var(--border)] bg-gradient-to-b from-[var(--surface-2)] to-transparent px-2.5 py-2">
        <span className="flex items-baseline gap-1.5">
          <span className="text-[15px] font-semibold tracking-tight text-[var(--text)]">Billing</span>
          <code className="rounded bg-[var(--surface-2)] px-1 py-px font-mono text-[8.5px] text-[var(--text-subtle)]">billing</code>
        </span>
        <span className="flex items-center gap-1">
          <span className="hidden items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[8.5px] text-[var(--text-muted)] sm:inline-flex">
            <span className="font-semibold uppercase tracking-wider text-[var(--text-subtle)]">repos</span>3
          </span>
          <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-wider transition-colors duration-300",
            t > 0.82 ? "bg-[var(--success-soft)] text-[var(--success-ink)]" : "bg-[var(--info-soft)] text-[var(--info-ink)]")}>
            {t > 0.82 ? <Sparkles className="size-2.5" /> : <CircleDashed className="size-2.5 animate-spin" />}
            {t > 0.82 ? "Up to date" : "Indexing"}
          </span>
        </span>
      </div>
      {/* ScopeTabs */}
      <div className="flex items-center gap-1 border-b border-[var(--border)] pb-1.5 text-[10px]">
        {FND_TABS.map((tab, i) => (
          <span key={tab} className={cn("rounded-md px-1.5 py-0.5 font-medium",
            i === 0 ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--text-muted)]")}>
            {tab}
          </span>
        ))}
      </div>
      {/* Blueprint body: category TOC + an Architecture section with a diagram */}
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_1.25fr] gap-2">
        <div className="flex min-h-0 flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
          <span className="flex items-center gap-1 text-[9.5px] font-semibold text-[var(--text)]">
            <ScrollText className="size-3 text-[var(--primary)]" /> Blueprint
          </span>
          {FND_SECTIONS.map((s, i) => {
            const on = t > 0.3 + i * 0.14;
            const firstOfCat = i === 0 || FND_SECTIONS[i - 1]!.cat !== s.cat;
            return (
              <div key={s.name}>
                {firstOfCat && (
                  <span className="mt-1 block text-[7.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{s.cat}</span>
                )}
                <span className="flex items-center justify-between text-[10px]" style={{ opacity: on ? 1 : 0.3 }}>
                  <span className="text-[var(--text-muted)]">{s.name}</span>
                  {on ? <Check className="size-2.5 text-[var(--success)]" /> : <CircleDashed className="size-2.5 text-[var(--text-subtle)]" />}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex min-h-0 flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
          <span className="flex items-center gap-1 text-[9.5px] font-semibold text-[var(--text)]">
            <Boxes className="size-3 text-[var(--primary)]" /> Services
          </span>
          <div className="relative min-h-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--code-bg)]">
            <svg viewBox="0 0 96 76" className="absolute inset-0 size-full" fill="none" aria-hidden>
              {FND_EDGES.map(([a, b], i) => {
                const p = FND_NODES[a]!; const q = FND_NODES[b]!;
                return (
                  <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y}
                    stroke="var(--primary)" strokeWidth={1} vectorEffect="non-scaling-stroke"
                    opacity={0.6} strokeDasharray={60} strokeDashoffset={60 * (1 - win(draw, i * 0.18, 1))} />
                );
              })}
              {FND_NODES.map((n, i) => (
                <circle key={i} cx={n.x} cy={n.y} r={n.r}
                  fill={n.lead ? "var(--primary)" : "var(--surface-3)"}
                  stroke="var(--primary)" strokeWidth={1} vectorEffect="non-scaling-stroke"
                  opacity={draw > i * 0.18 ? 1 : 0.15} />
              ))}
            </svg>
            <span className="absolute bottom-1 left-1.5 font-mono text-[8px] text-[var(--text-subtle)]">billing-svc relies on payments-api</span>
          </div>
          <p className="text-[8.5px] leading-snug text-[var(--text-muted)]" style={{ opacity: t > 0.6 ? 1 : 0.2 }}>
            Retries are idempotent; charges route through payments-api.
          </p>
        </div>
      </div>
      <Foot>One Blueprint per repo, per domain, and the whole org</Foot>
    </Scene>
  );
}

/* ================================================================= 01 stack */
/* The stack the work runs on. This segment spans more than one settings screen
 * (integrations, model providers, decision records + skills, MCP), so it reads
 * as an honest montage - each cluster faithful to its real surface. */

const STACK_WORK = ["GitHub", "Jira", "Linear", "Slack"] as const;
const STACK_AI = ["Anthropic", "OpenAI", "Google Gemini", "AWS Bedrock"] as const;

function StackCluster({
  icon: Icon, label, at, t, children,
}: {
  icon: typeof Plug;
  label: string;
  at: number;
  t: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-col gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 transition-opacity duration-200" style={{ opacity: t > at ? 1 : 0.2 }}>
      <span className="flex items-center gap-1 text-[8.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
        <Icon className="size-2.5" /> {label}
      </span>
      {children}
    </div>
  );
}

function StackScene({ t }: { t: number }) {
  return (
    <Scene crumb="app.athena.dev/settings/integrations">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--text)]">
          <Plug className="size-3.5 text-[var(--primary)]" /> Integrations
        </span>
        <span className="font-mono text-[9px] text-[var(--text-subtle)]">11 providers</span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-1.5">
        <StackCluster icon={Plug} label="Integrations" at={0.08} t={t}>
          <div className="flex flex-wrap gap-1">
            {STACK_WORK.map((n, i) => (
              <span key={n} className="inline-flex h-6 items-center gap-1 rounded-md border border-[var(--border)] px-1.5 text-[9.5px] font-medium text-[var(--text-muted)]">
                <BrandLogo name={n} size={12} />
                {n}
                {t > 0.16 + i * 0.05 && (
                  <span className="rounded-[3px] bg-[var(--success-soft)] px-1 text-[7.5px] font-semibold uppercase text-[var(--success-ink)]">on</span>
                )}
              </span>
            ))}
          </div>
          <span className="mt-auto text-[8.5px] leading-snug text-[var(--text-subtle)]">tickets and threads add context; updates flow back</span>
        </StackCluster>
        <StackCluster icon={Sparkles} label="Model providers" at={0.3} t={t}>
          <div className="flex flex-wrap gap-1">
            {STACK_AI.map((n) => (
              <span key={n} className="inline-flex size-6 items-center justify-center rounded-md border border-[var(--border)]" title={n}>
                <BrandLogo name={n} size={14} />
              </span>
            ))}
            <span className="inline-flex h-6 items-center rounded-md border border-[var(--border)] px-1.5 text-[9.5px] font-medium text-[var(--text-subtle)]">+10</span>
          </div>
          <span className="mt-auto flex items-center gap-1 text-[8.5px] leading-snug text-[var(--text-subtle)]">
            <span className="rounded-[3px] bg-[var(--acc-violet-soft)] px-1 py-px font-semibold text-[var(--acc-violet-ink)]">your key</span>
            or Athena credit, per model
          </span>
        </StackCluster>
        <StackCluster icon={BookOpen} label="Records & skills" at={0.5} t={t}>
          <span className="flex items-center gap-1.5 text-[10px] text-[var(--text)]">
            <BookOpen className="size-3 shrink-0 text-[var(--text-subtle)]" />
            Decision records, read on every run
            {t > 0.58 && <Check className="ml-auto size-2.5 shrink-0 text-[var(--success)]" />}
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-[var(--text)]">
            <Sparkles className="size-3 shrink-0 text-[var(--text-subtle)]" />
            Skills, playbooks Athena can run
            {t > 0.64 && <Check className="ml-auto size-2.5 shrink-0 text-[var(--success)]" />}
          </span>
        </StackCluster>
        <StackCluster icon={Network} label="MCP servers" at={0.68} t={t}>
          <span className="flex items-center gap-1.5 text-[10px] text-[var(--text)]">
            <Wrench className="size-3 shrink-0 text-[var(--text-subtle)]" />
            Your MCP tools, callable in runs
            {t > 0.76 && <Check className="ml-auto size-2.5 shrink-0 text-[var(--success)]" />}
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-[var(--text)]">
            <Plug className="size-3 shrink-0 text-[var(--text-subtle)]" />
            Coding agents connect the other way
            {t > 0.84 && <Check className="ml-auto size-2.5 shrink-0 text-[var(--success)]" />}
          </span>
        </StackCluster>
      </div>
      <Foot>Source control alone is enough to start; wire the rest anytime</Foot>
    </Scene>
  );
}

/* =================================================================== 01 ask */
/* The /chat surface: a chromeless header (history + thread title + scope pill),
 * a right-aligned user bubble, a bare-markdown answer led by the agent avatar +
 * name, citation chips (no "Sources" label), a real <TaskProposalCard>, and the
 * floating composer with its quiet model + effort pickers. */

const ASK_ANSWER =
  "Retries can't double-charge: every attempt reuses the idempotency key minted in charge.py, so the gateway settles one charge no matter how many land.";

function AskScene({ t }: { t: number }) {
  const typed = Math.round(ASK_ANSWER.length * win(t, 0.12, 0.6));
  const propose = t > 0.82;
  return (
    <Scene crumb="app.athena.dev/chat">
      {/* chromeless conversation header */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] pb-1.5">
        <History className="size-3.5 text-[var(--text-muted)]" />
        <span className="truncate text-[11px] font-semibold text-[var(--text)]">Billing retries</span>
        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-soft)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[8.5px] text-[var(--text-muted)]">
          <span className="size-1 rounded-full bg-[var(--primary)]" aria-hidden /> org-wide
        </span>
        <SquarePen className="ml-auto size-3.5 text-[var(--text-muted)]" />
      </div>
      {/* user bubble */}
      <div className="flex justify-end">
        <div className="max-w-[82%] rounded-2xl rounded-br-md border border-[var(--border-soft)] bg-[var(--surface-2)] px-3 py-1.5 text-[11px] leading-relaxed text-[var(--text)]">
          Why do billing retries sometimes double-charge?
        </div>
      </div>
      {/* assistant turn: avatar + name, then bare markdown + citations */}
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex size-4 items-center justify-center rounded-full bg-[var(--primary-soft)]">
            <Sparkles className="size-2.5 text-[var(--primary)]" />
          </span>
          <span className="text-[10px] font-semibold text-[var(--text)]">Athena</span>
        </div>
        <p className="text-[11px] leading-relaxed text-[var(--text)]">
          {ASK_ANSWER.slice(0, typed)}
          {typed > 0 && typed < ASK_ANSWER.length && <span className="bf-caret font-semibold text-[var(--primary)]">|</span>}
        </p>
        <div className="flex min-h-5 flex-wrap items-center gap-1.5">
          {t > 0.6 && <span className="ff-pop inline-flex"><MiniCite source="repo" label="billing-svc/charge.py L84" /></span>}
          {t > 0.68 && <span className="ff-pop inline-flex"><MiniCite source="kn" label="ADR-041 idempotent retries" /></span>}
        </div>
        {/* the real propose_task card: "Athena proposes" + Start task */}
        {propose && (
          <div className="bf-slide-in mt-auto overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-1)]">
            <div className="flex flex-col gap-1 p-2">
              <span className="flex items-center gap-1.5">
                <span className="inline-flex size-4 items-center justify-center rounded bg-[var(--primary-soft)] text-[var(--primary)]"><Sparkles className="size-2.5" /></span>
                <span className="text-[8px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Athena proposes</span>
                <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-1.5 py-px text-[8px] font-medium text-[var(--text-muted)]">Feature</span>
              </span>
              <span className="text-[10px] font-semibold leading-snug text-[var(--text)]">Retry billing webhooks safely</span>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5">
              <span className="flex items-center gap-1 text-[8px] text-[var(--text-muted)]"><Info className="size-2.5" /> Review and confirm next</span>
              <span className="inline-flex items-center gap-1 rounded-md bg-[var(--primary)] px-2 py-0.5 text-[9px] font-semibold text-[var(--primary-fg)]">
                Start task <ArrowUpRight className="size-2.5" />
              </span>
            </div>
          </div>
        )}
      </div>
      {/* floating composer */}
      <div className="flex items-center gap-1.5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 shadow-[var(--shadow-2)]">
        <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--text-subtle)]">Message Athena about org-wide</span>
        <span className="inline-flex items-center gap-0.5 text-[8.5px] text-[var(--text-muted)]"><Sparkles className="size-2.5" /> Opus 4.8</span>
        <span className="inline-flex size-5 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-fg)]"><ArrowUpRight className="size-3 -rotate-45" /></span>
      </div>
    </Scene>
  );
}

/* =================================================================== 02 prd */
/* The /work cockpit on a document stage: a compact stage rail (one focal chip),
 * the agent worklog (real verb rows), the drafted PRD as prose, and the gate -
 * the `.phase-status-pill` that says whose turn it is. */

const PRD_RAIL = [
  { name: "Frame", st: "approved" as const },
  { name: "Research", st: "approved" as const },
  { name: "PRD", st: "current" as const },
  { name: "Decompose", st: "locked" as const },
];

function PrdScene({ t }: { t: number }) {
  const gateOpen = t > 0.82;
  const proseLines = Math.floor(win(t, 0.34, 0.8) * 4 + 0.0001);
  return (
    <Scene crumb="app.athena.dev/work/TSK-214">
      {/* cockpit header: id chip + type + the stage's status */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="rounded bg-[var(--surface-2)] px-1 py-px font-mono text-[9px] font-medium text-[var(--text-muted)]">TSK-214</span>
          <span className="truncate text-[11.5px] font-semibold text-[var(--text)]">Retry billing webhooks safely</span>
        </span>
        {gateOpen ? <PhasePill status="needs-review" /> : <PhasePill status="running" />}
      </div>
      {/* stage rail */}
      <div className="grid grid-cols-4 gap-1">
        {PRD_RAIL.map((s) => (
          <div key={s.name} className={cn("flex flex-col gap-0.5 rounded-md border px-1.5 py-1",
            s.st === "current" ? "border-[var(--primary)] bg-[var(--primary-soft)]"
              : s.st === "locked" ? "border-[var(--border)] opacity-55"
                : "border-[var(--border)] bg-[var(--surface)]")}>
            <span className="text-[9px] font-semibold text-[var(--text)]">{s.name}</span>
            <span className="flex items-center gap-0.5 text-[7.5px] font-semibold uppercase tracking-wider">
              {s.st === "approved" && <><Check className="size-2 text-[var(--success-ink)]" /><span className="text-[var(--success-ink)]">Approved</span></>}
              {s.st === "current" && <><Sparkles className="size-2 text-[var(--info-ink)]" /><span className="text-[var(--info-ink)]">{gateOpen ? "Review" : "Working"}</span></>}
              {s.st === "locked" && <><Lock className="size-2 text-[var(--text-subtle)]" /><span className="text-[var(--text-subtle)]">Locked</span></>}
            </span>
          </div>
        ))}
      </div>
      {/* worklog */}
      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)]">
        <div className="flex items-center gap-1.5 px-2 py-1">
          <ScrollText className={cn("size-3", !gateOpen && "animate-pulse text-[var(--primary)]")} />
          <span className="text-[9.5px] text-[var(--text)]">Athena&apos;s work</span>
          <span className="ml-auto text-[8.5px] tabular-nums text-[var(--text-muted)]">4 steps</span>
        </div>
        <div className="flex flex-col gap-1 border-t border-[var(--border)] px-2 py-1.5">
          <WorkRow icon={Eye} verb="Searching the codebase" detail="webhook retries, 12 results" shown={t > 0.08} />
          <WorkRow icon={Eye} verb="Reading the blueprint" detail="billing-svc, Architecture" shown={t > 0.18} />
          <WorkRow icon={Brain} verb="Checking past decisions" detail="ADR-041" shown={t > 0.26} />
          <WorkRow icon={PencilLine} verb="Drafting" detail="PRD" running={!gateOpen} shown={t > 0.34} />
        </div>
      </div>
      {/* the artifact: prose, citations clustered at the foot */}
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
        <span className="text-[10px] font-semibold text-[var(--text)]">PRD</span>
        {["Make webhook retries idempotent so a duplicated delivery never settles twice.", "Approach: reuse the idempotency key on every attempt; backfill failed deliveries.", "Acceptance: no double charge under N retries; failures observable."]
          .map((line, i) => (
            <p key={i} className="line-clamp-1 text-[9px] leading-relaxed text-[var(--text-muted)]" style={{ opacity: i < proseLines ? 1 : 0.12 }}>{line}</p>
          ))}
        <span className="mt-auto flex flex-wrap gap-1 pt-0.5">
          {t > 0.6 && <span className="ff-pop inline-flex"><MiniCite source="kn" label="ADR-041" /></span>}
          {t > 0.68 && <span className="ff-pop inline-flex"><MiniCite source="repo" label="charge.py" /></span>}
        </span>
      </div>
      <Foot>Steer or stop anytime; the log is the audit trail</Foot>
    </Scene>
  );
}

/* ================================================================= 03 split */
/* The Decompose gate: the real <SubtaskPlanView>. Each proposed task is a row
 * with its type icon, title, a NEUTRAL uppercase type label (not a colored
 * tint), and a plain-words dependency ("Can start in parallel" / "After: x"). */

const SPLIT_ITEMS: { icon: typeof Code2; type: string; title: string; after: string | null }[] = [
  { icon: Code2, type: "Implementation", title: "Webhook retry queue + idempotency keys", after: null },
  { icon: PenTool, type: "Design", title: "Retry status UI states", after: null },
  { icon: Code2, type: "Implementation", title: "Retry dashboard widget", after: "Retry status UI states" },
  { icon: Wrench, type: "Chore", title: "Backfill failed webhooks", after: "Webhook retry queue" },
];

function SplitScene({ t }: { t: number }) {
  const shown = Math.floor(win(t, 0.1, 0.62) * SPLIT_ITEMS.length + 0.0001);
  const approved = t > 0.86;
  return (
    <Scene crumb="app.athena.dev/work/TSK-214">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--text)]">
          <ListChecks className="size-3.5 text-[var(--primary)]" /> Decompose
        </span>
        {approved ? <PhasePill status="approved" /> : <PhasePill status="needs-review" />}
      </div>
      <p className="text-[9.5px] leading-snug text-[var(--text-muted)]">
        Athena proposes <span className="font-medium text-[var(--text)]">4</span> tasks. <span className="font-medium text-[var(--text)]">2</span> wait on others, the rest can run in parallel.
      </p>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
        {SPLIT_ITEMS.map((s, i) => (
          <div key={s.title} className="flex flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2 transition-opacity duration-150" style={{ opacity: i < shown ? 1 : 0.12 }}>
            <div className="flex items-center gap-1.5">
              <s.icon className="size-3 shrink-0 text-[var(--text-muted)]" />
              <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-[var(--text)]">{s.title}</span>
              <span className="shrink-0 rounded-full bg-[var(--surface-3)] px-1.5 py-px text-[7.5px] font-medium uppercase tracking-wider text-[var(--text-muted)]">{s.type}</span>
            </div>
            {s.after ? (
              <span className="inline-flex items-center gap-1 text-[8.5px] text-[var(--text-muted)]"><ArrowDownRight className="size-2.5" /> After: {s.after}</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[8.5px] text-[var(--text-subtle)]"><GitFork className="size-2.5" /> Can start in parallel</span>
            )}
          </div>
        ))}
      </div>
      {approved && (
        <div className="bf-slide-in flex h-7 items-center gap-1.5 rounded-md border border-[var(--success)] bg-[var(--success-soft)] px-2">
          <CheckCircle2 className="size-3 shrink-0 text-[var(--success-ink)]" />
          <span className="truncate text-[10px] font-semibold text-[var(--success-ink)]">4 tasks created, dependencies wired</span>
        </div>
      )}
      <Foot>The plan is reviewable before anything spawns</Foot>
    </Scene>
  );
}

/* ================================================================= 04 build */
/* Two real screens for one segment. The /work board: status columns with the
 * real <TaskStatusPill> colors and the real card idiom (kind icon + id, no kind
 * tint, Athena/assignee, subtask count, spend), blocked work in its own column.
 * Then the cockpit moment that owns the segment: the <DiffView> hard gate. */

const STATUS_STYLE: Record<string, string> = {
  todo: "bg-[var(--info-soft)] text-[var(--info-ink)]",
  in_progress: "bg-[var(--primary-soft)] text-[var(--primary)]",
  in_review: "bg-[var(--warning-soft)] text-[var(--warning-ink)]",
  blocked: "bg-[var(--danger-soft)] text-[var(--danger-ink)]",
  done: "bg-[var(--success-soft)] text-[var(--success-ink)]",
};
const STATUS_LABEL: Record<string, string> = {
  todo: "To do", in_progress: "In progress", in_review: "In review", blocked: "Blocked", done: "Done",
};

/** Which column a card sits in, as a step function of t (the board choreography).
 *  The settled end-state reads as a complete parallel build: 215 done, design
 *  (216) in review, a teammate's lane (217) still in progress, and 218 just
 *  unblocked once 215 landed - exactly what Sophia narrates ("it's free now"). */
function buildCol(card: "215" | "216" | "217" | "218", t: number): keyof typeof STATUS_LABEL {
  switch (card) {
    case "215": return t < 0.28 ? "in_progress" : t < 0.55 ? "in_review" : "done";   // Athena, lands first
    case "216": return t < 0.45 ? "in_progress" : "in_review";                        // design, into review
    case "217": return t < 0.3 ? "todo" : "in_progress";                              // the teammate's lane
    case "218": return t < 0.55 ? "blocked" : "todo";                                 // blocked until 215 lands
  }
}

const BUILD_CARDS: { id: "215" | "216" | "217" | "218"; icon: typeof Code2; athena: boolean }[] = [
  { id: "215", icon: Code2, athena: true },
  { id: "216", icon: PenTool, athena: false },
  { id: "217", icon: Code2, athena: false },
  { id: "218", icon: Wrench, athena: true },
];
const BUILD_COLS: (keyof typeof STATUS_LABEL)[] = ["todo", "in_progress", "in_review", "blocked", "done"];

function BuildScene({ t }: { t: number }) {
  const reviewing = t >= 0.35 && t < 0.75;
  const reviewed = t >= 0.75;
  return (
    <Scene crumb="app.athena.dev/work">
      <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--text)]">
        <ListChecks className="size-3.5 text-[var(--primary)]" /> Work
      </span>
      {/* the board */}
      <div className="grid grid-cols-5 gap-1">
        {BUILD_COLS.map((col) => {
          const cards = BUILD_CARDS.filter((c) => buildCol(c.id, t) === col);
          return (
            <div key={col} className="flex min-h-[88px] flex-col gap-1 rounded-lg bg-[var(--surface-2)] p-1">
              <div className="flex items-center justify-between px-0.5">
                <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1 py-px text-[7px] font-medium leading-tight", STATUS_STYLE[col])}>
                  {col === "in_progress" && <span className="size-1 animate-pulse rounded-full bg-[var(--primary)]" aria-hidden />}
                  {STATUS_LABEL[col]}
                </span>
                <span className="text-[7.5px] tabular-nums text-[var(--text-subtle)]">{cards.length}</span>
              </div>
              {cards.map((c) => (
                <div key={c.id} className="bf-slide-in flex flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] p-1">
                  <span className="flex items-center gap-0.5">
                    <c.icon className="size-2.5 shrink-0 text-[var(--text-muted)]" />
                    <span className="font-mono text-[7.5px] font-medium text-[var(--text)]">TSK-{c.id}</span>
                  </span>
                  {c.id === "218" && col === "blocked" && (
                    <span className="inline-flex w-fit items-center gap-0.5 rounded bg-[var(--danger-soft)] px-1 text-[6.5px] font-medium text-[var(--danger-ink)]"><AlertTriangle className="size-2" /> Blocked</span>
                  )}
                  <span className="flex items-center gap-0.5 text-[6.5px] text-[var(--text-subtle)]">
                    {c.athena ? <Sparkles className="size-2 text-[var(--primary)]" /> : <User className="size-2" />}
                    {c.athena ? "Athena" : "Assigned"}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {/* the diff hard gate (cockpit) - reviewed before any PR */}
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] p-1.5">
        <div className="flex items-center gap-1.5">
          <FileDiff className="size-3 text-[var(--primary)]" />
          <span className="text-[9px] font-medium text-[var(--text-muted)]">1 file changed</span>
          <span className="text-[8.5px] font-medium tabular-nums"><span className="text-[var(--success-ink)]">+1</span> <span className="text-[var(--danger-ink)]">-1</span></span>
          {reviewing && <span className="ml-auto"><PhasePill status="needs-review" label="You're reviewing" /></span>}
          {reviewed && (
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--success-ink)]">
              <Check className="size-3" /> Approved by you
            </span>
          )}
        </div>
        <div className="overflow-hidden rounded border border-[var(--border)] font-mono text-[8.5px] leading-[1.5]">
          <div className="flex items-center gap-1 border-b border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[var(--text)]">
            <FileCode2 className="size-2.5" /> charge.py
          </div>
          <div className="bg-[var(--danger-soft)] px-1.5 text-[var(--danger-ink)]">- key = uuid4()</div>
          <div className="bg-[var(--success-soft)] px-1.5 text-[var(--success-ink)]">+ key = req.idempotency_key</div>
        </div>
      </div>
      <Foot>Your team picks it up; blocked work waits on its dependency graph</Foot>
    </Scene>
  );
}

/* ================================================================== 05 ship */
/* The cockpit's ship stage: the registered pull-request artifact ("Open pull
 * request" leads out to your repo), your real CI checks, the pr_heal step that
 * pushes a fix when one fails, and the merge that stays on your call. */

function ShipScene({ t }: { t: number }) {
  const healing = t > 0.22 && t < 0.55;
  const healed = t > 0.55;
  const merged = t > 0.82;
  return (
    <Scene crumb="app.athena.dev/work/TSK-215">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="rounded bg-[var(--surface-2)] px-1 py-px font-mono text-[9px] font-medium text-[var(--text-muted)]">TSK-215</span>
          <span className="truncate text-[11.5px] font-semibold text-[var(--text)]">Webhook retry queue</span>
        </span>
        {merged ? <Pill tone="success"><GitMerge className="size-3" /> Merged</Pill> : <Pill tone="info">Draft PR</Pill>}
      </div>
      {/* the PR artifact: lead with "Open pull request" */}
      <div className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5">
        <GitPullRequest className="size-3.5 shrink-0 text-[var(--primary)]" />
        <span className="text-[10px] font-medium text-[var(--text)]">Open pull request</span>
        <ExternalLink className="size-2.5 text-[var(--text-subtle)]" />
        <span className="ml-auto truncate font-mono text-[8px] text-[var(--text-subtle)]">athena/tsk-215 to main</span>
      </div>
      {/* your CI checks */}
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Your CI, not a sandbox</span>
        {["unit", "typecheck"].map((c) => (
          <span key={c} className="flex items-center gap-1.5 text-[10px]">
            <CheckCircle2 className="size-3 text-[var(--success)]" />
            <span className="font-mono text-[var(--text)]">{c}</span>
            <span className="ml-auto text-[9px] text-[var(--text-subtle)]">passed</span>
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[10px]">
          {healed
            ? <CheckCircle2 className="size-3 text-[var(--success)]" />
            : <CircleDashed className={cn("size-3", healing ? "animate-spin text-[var(--primary)]" : "text-[var(--danger)]")} />}
          <span className="font-mono text-[var(--text)]">e2e</span>
          <span className={cn("ml-auto text-[9px]", healed ? "text-[var(--text-subtle)]" : healing ? "text-[var(--info-ink)]" : "text-[var(--danger-ink)]")}>
            {healed ? "passed, fixed by Athena" : healing ? "Athena pushing a fix" : "failed"}
          </span>
        </span>
        {t > 0.64 && (
          <span className="bf-slide-in mt-auto flex items-center gap-1.5 border-t border-[var(--border-soft)] pt-1 text-[9px] text-[var(--text-muted)]">
            <ListChecks className="size-2.5 text-[var(--primary)]" /> 4 subtasks rolled up
          </span>
        )}
      </div>
      {/* merge: your call */}
      <div className="flex h-7 items-center gap-1.5">
        {merged ? (
          <span className="bf-slide-in inline-flex items-center gap-1 rounded-md bg-[var(--success-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--success-ink)]"><GitMerge className="size-3" /> Merged by you</span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-[10px] font-semibold text-[var(--text-subtle)] opacity-70"><Lock className="size-2.5" /> Merge</span>
        )}
        <span className="truncate text-[9px] text-[var(--text-muted)]">{merged ? "on your call" : "waiting on your review"}</span>
      </div>
      <Foot>Your repo, your CI, your merge</Foot>
    </Scene>
  );
}

/* =============================================================== 06 receipt */
/* The /cost dashboard Overview: KPI tiles (real provenance hints), the "who
 * pays the vendor" split, and the by-model breakdown table - the real
 * components/cost surface. There is no per-call ledger view in the app, so the
 * scene shows what the dashboard actually shows. */

const MODEL_ROWS = [
  { model: "Opus 4.8", usd: 1.23, pct: 51, calls: 47 },
  { model: "Sonnet 4.6", usd: 0.92, pct: 38, calls: 96 },
  { model: "Haiku 4.5", usd: 0.26, pct: 11, calls: 41 },
];

function ReceiptScene({ t }: { t: number }) {
  const total = win(t, 0, 0.7) * 2.41;
  const byoPct = Math.round(win(t, 0.1, 0.7) * 39);
  return (
    <Scene crumb="app.athena.dev/cost">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold tracking-tight text-[var(--text)]">Cost</span>
        <span className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[8.5px] text-[var(--text-muted)]">Last 30 days</span>
      </div>
      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
          <span className="flex items-center gap-1 text-[8px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Total spend <Info className="size-2.5" /></span>
          <span className="text-[16px] font-semibold tabular-nums text-[var(--text)]">{usd(total)}</span>
          <span className="block text-[8px] text-[var(--text-muted)]">prior period $1.85</span>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
          <span className="flex items-center justify-between text-[8px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            Forecast vs budget
            <span className="rounded-full bg-[var(--success-soft)] px-1 py-px text-[7px] normal-case text-[var(--success-ink)]">On track</span>
          </span>
          <span className="text-[16px] font-semibold tabular-nums text-[var(--text)]">$3.10</span>
          <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-2)]"><div className="h-full rounded-full bg-[var(--success)]" style={{ width: `${win(t, 0.2, 0.8) * 62}%` }} /></div>
        </div>
      </div>
      {/* who pays the vendor */}
      <div className="flex flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
        <span className="text-[8px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Who pays the vendor</span>
        <div className="flex h-2 w-full overflow-hidden rounded-full">
          <div style={{ width: `${100 - byoPct}%`, backgroundColor: "var(--acc-violet)" }} />
          <div style={{ width: `${byoPct}%`, backgroundColor: "var(--acc-amber)" }} />
        </div>
        <div className="flex items-center gap-3 text-[8px] text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm" style={{ backgroundColor: "var(--acc-violet)" }} /> Athena credits <span className="font-medium tabular-nums text-[var(--text)]">{100 - byoPct}%</span></span>
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm" style={{ backgroundColor: "var(--acc-amber)" }} /> Your keys <span className="font-medium tabular-nums text-[var(--text)]">{byoPct}%</span></span>
        </div>
      </div>
      {/* by-model breakdown table */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 pt-1.5">
        <div className="flex items-center gap-2 border-b border-[var(--border-strong)] pb-1 text-[7.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
          <span className="flex-1">Model</span><span className="w-10 text-right">Spend</span><span className="w-8 text-right">Share</span><span className="w-8 text-right">Calls</span>
        </div>
        {MODEL_ROWS.map((r, i) => (
          <div key={r.model} className="flex items-center gap-2 border-b border-[var(--border)] py-1 text-[9px] tabular-nums last:border-0 transition-opacity duration-150" style={{ opacity: t > 0.3 + i * 0.12 ? 1 : 0.12 }}>
            <span className="flex-1 truncate font-medium text-[var(--text)]">{r.model}</span>
            <span className="w-10 text-right text-[var(--text-muted)]">{usd(r.usd)}</span>
            <span className="w-8 text-right text-[var(--text-muted)]">{r.pct}%</span>
            <span className="w-8 text-right text-[var(--text-muted)]">{r.calls}</span>
          </div>
        ))}
      </div>
      <Foot>As billed by the provider; attributed to model, team, and person</Foot>
    </Scene>
  );
}

/* =================================================================== 07 cta */

const RECAP = [
  "A question answered with citations",
  "A PRD drafted, gated, approved",
  "Split into typed subtasks, built in parallel",
  "A diff you reviewed, then a draft PR",
  "Merged by you, every token on the ledger",
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
      <Foot>You hold every gate; free to start, no card</Foot>
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
