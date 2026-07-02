"use client";

/**
 * Film scenes - the working artifact shown for each segment. One scene per
 * segment, every one a faithful zoomed-in miniature of the REAL product
 * surface it depicts, built from the app's own components and idioms. The rule
 * is strict: a scene mirrors a real screen. Where a screen carries a status, a
 * chip, a column, or a row treatment, the scene uses the SAME one (the
 * `AttachRepoDialog` labels, the `IngestTimeline` stepper + counter pill, the
 * `FreshnessPill` states, the Members invite card, the integrations status
 * pills, the coding-agents wizard's real `claude mcp add` snippet, the
 * `.phase-status-pill`, the `TaskStatusPill` color map, the `CitationChip`
 * shape, the `DiffView` rows, the cost KPI tiles + breakdown table). If a
 * scene drifts from the real component, fix the scene - never the product,
 * and never invent UI the product does not have.
 *
 * Scenes are PURE functions of `t` (the segment's local play progress, 0..1).
 * At rest the scene sits at t=1, so the settled end-state must read as a
 * complete picture on its own. Tokens only - no color literals, no em dashes.
 */

import {
  AlertTriangle, ArrowUpRight, Brain, Check, CheckCircle2, ChevronRight,
  CircleDashed, Code2, Database, ExternalLink, Eye, FileCode2, FileDiff,
  Gauge, GitMerge, GitPullRequest, History, Info, KeyRound, ListChecks, Lock,
  PencilLine, PenTool, Plug, Plus, ScrollText, ShieldCheck, Sparkles,
  SquarePen, Terminal, User, UserPlus, Wrench,
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
  tone, children,
}: {
  tone?: "info" | "warning" | "success" | "violet";
  children: React.ReactNode;
}) {
  return (
    <span className={cn("pill", tone && `pill-${tone}`)}>
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

/** The uppercase status pill idiom shared by integrations and freshness. */
function StatusPill({
  tone, spin, icon: Icon, children,
}: {
  tone: "info" | "success" | "muted";
  spin?: boolean;
  icon?: typeof Sparkles;
  children: React.ReactNode;
}) {
  const cls =
    tone === "success" ? "bg-[var(--success-soft)] text-[var(--success-ink)]"
      : tone === "info" ? "bg-[var(--info-soft)] text-[var(--info-ink)]"
        : "bg-[var(--surface-3)] text-[var(--text-muted)]";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider", cls)}>
      {Icon && <Icon className={cn("size-2.5", spin && "animate-spin")} />}
      {children}
    </span>
  );
}

/** A settings-style cluster card (used by the stack + security montages). */
function Cluster({
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

/* =============================================================== 00 connect */
/* The zoom shot the whole film opens on: the real AttachRepoDialog ("Attach a
 * repo", source chip, checkbox rows, "Attach 3 repos"), then the IngestTimeline
 * stepper (Cloning / Scanning / Embedding / Indexing / Completed) with its
 * narration line + tabular counter pill, the FreshnessPill flipping from
 * "Indexing…" to "Up to date", and the Blueprint landing. */

const CONNECT_REPOS = ["billing-svc", "payments-api", "web-checkout"] as const;
const INGEST_STEPS = ["Cloning", "Scanning", "Embedding", "Indexing", "Completed"] as const;
/** Stage boundaries on t - the stepper walks these left to right. */
const INGEST_AT = [0.18, 0.32, 0.48, 0.78, 0.93] as const;

function ConnectScene({ t }: { t: number }) {
  const stage = INGEST_AT.filter((a) => t >= a).length; // 0..5
  const done = t >= 0.93;
  const processed = Math.round(3411 * win(t, 0.32, 0.88));
  const narration =
    stage <= 1 ? "Cloning the repository"
      : stage === 2 ? "Scanning files"
        : stage === 3 ? "Reading & embedding files - src/billing/charge.py"
          : stage === 4 ? "Wiring the graph & blueprints"
            : "Completed";
  return (
    <Scene crumb="app.athena.dev/domains/billing">
      {/* the AttachRepoDialog, condensed */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10.5px] font-semibold text-[var(--text)]">Attach a repo</span>
          <span className="inline-flex items-center gap-1 rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[8.5px] text-[var(--text-muted)]">
            <BrandLogo name="GitHub" size={10} /> acme-co
          </span>
        </div>
        <div className="mt-1.5 flex flex-col gap-1">
          {CONNECT_REPOS.map((r, i) => {
            const picked = t > 0.03 + i * 0.04;
            return (
              <span key={r} className="flex items-center gap-1.5 text-[9.5px] text-[var(--text-muted)]">
                <span className={cn("grid size-3 place-items-center rounded-[3px] border transition-colors duration-150",
                  picked ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-fg)]" : "border-[var(--border-strong)]")}>
                  {picked && <Check className="size-2" />}
                </span>
                <span className="font-mono">{r}</span>
              </span>
            );
          })}
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-[8px] text-[var(--text-subtle)]">3 selected · jobs queued and processed one by one.</span>
          <span className={cn("rounded-md px-2 py-0.5 text-[9px] font-semibold transition-colors duration-200",
            t > 0.16 ? "bg-[var(--surface-2)] text-[var(--text-subtle)]" : "bg-[var(--primary)] text-[var(--primary-fg)]")}>
            {t > 0.16 ? "Queueing…" : "Attach 3 repos"}
          </span>
        </div>
      </div>
      {/* the IngestTimeline: stepper + narration + counter, freshness on top */}
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 font-mono text-[9.5px] text-[var(--text)]">
            <FileCode2 className="size-3 text-[var(--text-subtle)]" /> billing-svc
          </span>
          {done
            ? <StatusPill tone="success" icon={Sparkles}>Up to date</StatusPill>
            : <StatusPill tone="info" icon={CircleDashed} spin>Indexing…</StatusPill>}
        </div>
        <div className="flex items-center gap-1">
          {INGEST_STEPS.map((s, i) => {
            const reached = stage > i;
            const active = stage === i;
            return (
              <span key={s} className="flex min-w-0 flex-1 items-center gap-1">
                <span className={cn("grid size-3.5 shrink-0 place-items-center rounded-full border transition-colors duration-200",
                  reached ? "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success-ink)]"
                    : active ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                      : "border-[var(--border)] text-[var(--text-subtle)]")}>
                  {reached ? <Check className="size-2" /> : <span className={cn("size-1 rounded-full", active ? "animate-pulse bg-[var(--primary)]" : "bg-[var(--text-subtle)]")} />}
                </span>
                <span className={cn("truncate text-[8px] font-medium", active ? "text-[var(--text)]" : "text-[var(--text-subtle)]")}>{s}</span>
                {i < INGEST_STEPS.length - 1 && <span className={cn("h-px flex-1", reached ? "bg-[var(--success)]" : "bg-[var(--border)]")} />}
              </span>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[9px] text-[var(--text-muted)]">{narration}</span>
          <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[9px] font-semibold tabular-nums text-[var(--text-muted)]">
            {processed.toLocaleString()}/3,411
          </span>
        </div>
        {/* what indexing produced - the Blueprint lands */}
        <div className="mt-auto flex flex-col gap-1 border-t border-[var(--border-soft)] pt-1.5">
          <span className="flex items-center gap-1.5 text-[9.5px] transition-opacity duration-200" style={{ opacity: done ? 1 : 0.15 }}>
            <ScrollText className="size-3 shrink-0 text-[var(--primary)]" />
            <span className="font-medium text-[var(--text)]">Blueprint drafted</span>
            <span className="text-[var(--text-muted)]">· Identity · Architecture · Operations</span>
            {done && <Check className="ml-auto size-3 shrink-0 text-[var(--success)]" />}
          </span>
          <span className="flex items-center gap-1.5 text-[9.5px] transition-opacity duration-200" style={{ opacity: done ? 1 : 0.15 }}>
            <Database className="size-3 shrink-0 text-[var(--primary)]" />
            <span className="font-medium text-[var(--text)]">Files, connections, and decisions mapped</span>
            {done && <Check className="ml-auto size-3 shrink-0 text-[var(--success)]" />}
          </span>
        </div>
      </div>
      <Foot>Synced on your call; Athena flags a repo the moment it&apos;s behind</Foot>
    </Scene>
  );
}

/* =================================================================== 01 ask */
/* The /chat surface, zoomed on the act of typing: the question keys itself into
 * the user bubble, the answer streams back led by the agent avatar + name with
 * a "Reasoning" disclosure, citation chips pop (no "Sources" label), the real
 * <TaskProposalCard> lands, and the floating composer shows its quiet pickers
 * (plus-menu, effort, model). */

const ASK_Q = "Why do billing retries sometimes double-charge?";
const ASK_ANSWER =
  "Retries can't double-charge: every attempt reuses the idempotency key minted in charge.py, so the gateway settles one charge no matter how many land.";

function AskScene({ t }: { t: number }) {
  const typedQ = Math.round(ASK_Q.length * win(t, 0.02, 0.2));
  const typedA = Math.round(ASK_ANSWER.length * win(t, 0.3, 0.68));
  const propose = t > 0.86;
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
      {/* user bubble - the question types itself */}
      <div className="flex min-h-8 justify-end">
        {typedQ > 0 && (
          <div className="max-w-[82%] rounded-2xl rounded-br-md border border-[var(--border-soft)] bg-[var(--surface-2)] px-3 py-1.5 text-[11px] leading-relaxed text-[var(--text)]">
            {ASK_Q.slice(0, typedQ)}
            {typedQ < ASK_Q.length && <span className="bf-caret font-semibold text-[var(--primary)]">|</span>}
          </div>
        )}
      </div>
      {/* assistant turn: avatar + name, reasoning disclosure, bare markdown + citations */}
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-1.5 transition-opacity duration-150" style={{ opacity: t > 0.24 ? 1 : 0 }}>
          <span className="inline-flex size-4 items-center justify-center rounded-full bg-[var(--primary-soft)]">
            <Sparkles className="size-2.5 text-[var(--primary)]" />
          </span>
          <span className="text-[10px] font-semibold text-[var(--text)]">Athena</span>
          <span className="ml-1 inline-flex items-center gap-0.5 text-[8.5px] text-[var(--text-subtle)]">
            <Brain className="size-2.5" /> Reasoning <ChevronRight className="size-2" />
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-[var(--text)]">
          {ASK_ANSWER.slice(0, typedA)}
          {typedA > 0 && typedA < ASK_ANSWER.length && <span className="bf-caret font-semibold text-[var(--primary)]">|</span>}
        </p>
        <div className="flex min-h-5 flex-wrap items-center gap-1.5">
          {t > 0.7 && <span className="ff-pop inline-flex"><MiniCite source="repo" label="billing-svc/charge.py L84" /></span>}
          {t > 0.76 && <span className="ff-pop inline-flex"><MiniCite source="kn" label="ADR-041 idempotent retries" /></span>}
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
      {/* floating composer with its quiet pickers */}
      <div className="flex items-center gap-1.5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 shadow-[var(--shadow-2)]">
        <Plus className="size-3 shrink-0 text-[var(--text-muted)]" />
        <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--text-subtle)]">Message Athena about org-wide</span>
        <span className="inline-flex items-center gap-0.5 text-[8.5px] text-[var(--text-muted)]"><Gauge className="size-2.5" /> Medium</span>
        <span className="inline-flex items-center gap-0.5 text-[8.5px] text-[var(--text-muted)]"><Sparkles className="size-2.5" /> Opus 4.8</span>
        <span className="inline-flex size-5 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-fg)]"><ArrowUpRight className="size-3 -rotate-45" /></span>
      </div>
    </Scene>
  );
}

/* ================================================================== 02 team */
/* The Members settings page: the "Invite a teammate" card (email + role +
 * Send invitation), the pending-invite row with its "Awaiting accept" state,
 * and the data-driven "Roles & permissions" rail below. */

const TEAM_ROLES = ["admin", "engineer", "reviewer", "auditor"] as const;
const TEAM_EMAIL = "priya@acme.dev";

function TeamScene({ t }: { t: number }) {
  const typed = Math.round(TEAM_EMAIL.length * win(t, 0.06, 0.3));
  const sent = t > 0.55;
  return (
    <Scene crumb="app.athena.dev/settings/members">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold tracking-tight text-[var(--text)]">Members</span>
        <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[8.5px] text-[var(--text-muted)]">5 seats</span>
      </div>
      {/* the invite card */}
      <div className="flex flex-col gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
        <span className="text-[10px] font-semibold text-[var(--text)]">Invite a teammate</span>
        <span className="text-[8.5px] leading-snug text-[var(--text-muted)]">Email + role. Recipients sign in with GitHub to accept.</span>
        <div className="flex items-center gap-1.5">
          <span className="flex h-6 min-w-0 flex-1 items-center rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 font-mono text-[9.5px] text-[var(--text)]">
            {TEAM_EMAIL.slice(0, typed)}
            {typed > 0 && typed < TEAM_EMAIL.length && <span className="bf-caret font-semibold text-[var(--primary)]">|</span>}
            {typed === 0 && <span className="text-[var(--text-subtle)]">alice@yourorg.com</span>}
          </span>
          <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-[var(--border)] px-1.5 text-[9px] font-medium text-[var(--text-muted)]" style={{ opacity: t > 0.34 ? 1 : 0.4 }}>
            engineer <ChevronRight className="size-2 rotate-90" />
          </span>
          <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-[9px] font-semibold transition-colors duration-200",
            sent ? "bg-[var(--surface-2)] text-[var(--text-subtle)]" : "bg-[var(--primary)] text-[var(--primary-fg)]")}>
            <UserPlus className="size-2.5" /> {sent ? "Sent" : "Send invitation"}
          </span>
        </div>
      </div>
      {/* pending invite row */}
      <div className="flex min-h-7 flex-col justify-center">
        {sent && (
          <div className="bf-slide-in flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
            <span className="min-w-0 flex-1 truncate font-mono text-[9.5px] text-[var(--text)]">{TEAM_EMAIL}</span>
            <span className="rounded-full bg-[var(--surface-3)] px-1.5 py-px text-[8px] font-medium text-[var(--text-muted)]">engineer</span>
            <StatusPill tone="info">Awaiting accept</StatusPill>
          </div>
        )}
      </div>
      {/* roles & permissions rail - fully data-driven */}
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
        <span className="flex items-center gap-1 text-[9.5px] font-semibold text-[var(--text)]">
          <ShieldCheck className="size-3 text-[var(--primary)]" /> Roles &amp; permissions
        </span>
        <div className="flex flex-wrap gap-1">
          {TEAM_ROLES.map((r, i) => (
            <span key={r} className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-[9px] font-medium text-[var(--text)] transition-opacity duration-150" style={{ opacity: t > 0.6 + i * 0.07 ? 1 : 0.25 }}>
              {r}
            </span>
          ))}
          <span className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-[var(--border-strong)] px-2 py-0.5 text-[9px] font-medium text-[var(--text-muted)] transition-opacity duration-150" style={{ opacity: t > 0.9 ? 1 : 0.25 }}>
            <Plus className="size-2.5" /> New role
          </span>
        </div>
        <span className="text-[8.5px] leading-snug text-[var(--text-muted)]" style={{ opacity: t > 0.9 ? 1 : 0.3 }}>
          Roles are fully yours - rename, re-permission, or delete any of them.
        </span>
      </div>
      <Foot>Teams get their own board; roles decide what each person can do</Foot>
    </Scene>
  );
}

/* ================================================================= 03 stack */
/* The Integrations settings page: the real provider card grid with its
 * uppercase status pills flipping to Connected, plus the model-provider strip
 * (15 providers, your key or Athena credit). */

const STACK_TILES = ["GitHub", "Jira", "Linear", "Slack", "Notion", "Figma"] as const;
const STACK_AI = ["Anthropic", "OpenAI", "Google Gemini", "AWS Bedrock"] as const;

function StackScene({ t }: { t: number }) {
  return (
    <Scene crumb="app.athena.dev/settings/integrations">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--text)]">
          <Plug className="size-3.5 text-[var(--primary)]" /> Integrations
        </span>
        <span className="font-mono text-[9px] text-[var(--text-subtle)]">and growing</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {STACK_TILES.map((n, i) => {
          const on = n === "GitHub" || t > 0.12 + i * 0.11;
          return (
            <div key={n} className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
              <BrandLogo name={n} size={14} />
              <span className="min-w-0 flex-1 truncate text-[9.5px] font-medium text-[var(--text)]">{n}</span>
              {on
                ? <StatusPill tone="success">{n === "GitHub" ? "Active" : "Connected"}</StatusPill>
                : <span className="rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[8px] font-semibold text-[var(--text-muted)]">Connect</span>}
            </div>
          );
        })}
      </div>
      <span className="text-[8.5px] text-[var(--text-subtle)]">+ more across source control, trackers, comms, docs, design</span>
      {/* model providers strip */}
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2" style={{ opacity: t > 0.66 ? 1 : 0.25 }}>
        <span className="flex items-center gap-1 text-[8.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
          <Sparkles className="size-2.5" /> Model providers
        </span>
        <div className="flex flex-wrap items-center gap-1">
          {STACK_AI.map((n) => (
            <span key={n} className="inline-flex size-6 items-center justify-center rounded-md border border-[var(--border)]" title={n}>
              <BrandLogo name={n} size={14} />
            </span>
          ))}
          <span className="inline-flex h-6 items-center rounded-md border border-[var(--border)] px-1.5 text-[9.5px] font-medium text-[var(--text-subtle)]">+ more</span>
        </div>
        <span className="mt-auto flex items-center gap-1 text-[8.5px] leading-snug text-[var(--text-subtle)]">
          <span className="rounded-[3px] bg-[var(--acc-violet-soft)] px-1 py-px font-semibold text-[var(--acc-violet-ink)]">your key</span>
          or Athena credit, per model - any major provider
        </span>
      </div>
      <Foot>Connect in a click; any key you store is encrypted</Foot>
    </Scene>
  );
}

/* ================================================================ 04 agents */
/* The "Coding agents (MCP)" wizard on /settings/integrations: pick the agent,
 * mint a scoped token, paste one command - then the cockpit attribution the
 * moment the agent claims a stage ("Claude Code working"). The connect snippet
 * is the wizard's real one, verbatim. */

const AGENT_CHIPS = ["Claude Code", "Codex CLI", "Cursor", "Gemini CLI"] as const;

function AgentsScene({ t }: { t: number }) {
  const minted = t > 0.38;
  const snippet = t > 0.5;
  const claimed = t > 0.78;
  return (
    <Scene crumb="app.athena.dev/settings/integrations">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--text)]">
          <Terminal className="size-3.5 text-[var(--primary)]" /> Coding agents (MCP)
        </span>
        <span className="font-mono text-[9px] text-[var(--text-subtle)]">one command</span>
      </div>
      {/* step 1: pick your coding agent */}
      <div className="flex flex-wrap gap-1">
        {AGENT_CHIPS.map((n, i) => (
          <span key={n} className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[9px] font-medium transition-colors duration-150",
            i === 0 && t > 0.06 ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--text)]" : "border-[var(--border)] text-[var(--text-muted)]")}>
            <BrandLogo name={n} size={11} /> {n}
          </span>
        ))}
        <span className="inline-flex items-center rounded-md border border-[var(--border)] px-1.5 py-1 text-[9px] font-medium text-[var(--text-subtle)]">+2</span>
      </div>
      {/* step 2: scoped token */}
      <div className="flex items-center gap-1.5" style={{ opacity: t > 0.2 ? 1 : 0.25 }}>
        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-[8.5px] font-medium text-[var(--text)]">
          <KeyRound className="size-2.5 text-[var(--text-subtle)]" /> Full agent (recommended)
        </span>
        {minted
          ? <span className="bf-slide-in inline-flex items-center gap-1 text-[8.5px] font-medium text-[var(--success-ink)]"><Check className="size-2.5" /> Token created - baked into the snippet below.</span>
          : <span className="rounded-md bg-[var(--primary)] px-2 py-0.5 text-[8.5px] font-semibold text-[var(--primary-fg)]">Create token</span>}
      </div>
      {/* step 3: the wizard's real connect snippet */}
      <div className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--code-bg)] p-2 font-mono text-[8.5px] leading-relaxed text-[var(--text-muted)] transition-opacity duration-200" style={{ opacity: snippet ? 1 : 0.15 }}>
        <span className="text-[var(--text-subtle)]">$</span> claude mcp add --transport http athena \<br />
        &nbsp;&nbsp;https://api.tryathena.dev/mcp \<br />
        &nbsp;&nbsp;--header &quot;Authorization: Bearer atna_51xK…&quot;
      </div>
      {/* the payoff: live attribution in the cockpit */}
      <div className="flex min-h-0 flex-1 flex-col justify-end gap-1">
        {claimed && (
          <div className="bf-slide-in flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
            <span className="rounded bg-[var(--surface-2)] px-1 py-px font-mono text-[9px] font-medium text-[var(--text-muted)]">TSK-215</span>
            <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-[var(--text)]">Webhook retry queue</span>
            <PhasePill status="running" label="Claude Code working" />
          </div>
        )}
      </div>
      <Foot>Same gates, its name on every step - attributed live in the cockpit</Foot>
    </Scene>
  );
}

/* ================================================================== 05 plan */
/* The /work cockpit on a document stage: the stage rail (one focal chip), the
 * agent worklog (real verb rows), the drafted PRD as prose with citations at
 * the foot, the gate flipping to "Needs your review", and the decompose plan
 * waiting behind it. */

const PLAN_RAIL = [
  { name: "Frame", st: "approved" as const },
  { name: "Research", st: "approved" as const },
  { name: "PRD", st: "current" as const },
  { name: "Decompose", st: "locked" as const },
];

function PlanScene({ t }: { t: number }) {
  const gateOpen = t > 0.76;
  const proseLines = Math.floor(win(t, 0.3, 0.72) * 3 + 0.0001);
  return (
    <Scene crumb="app.athena.dev/work/TSK-214">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="rounded bg-[var(--surface-2)] px-1 py-px font-mono text-[9px] font-medium text-[var(--text-muted)]">TSK-214</span>
          <span className="truncate text-[11.5px] font-semibold text-[var(--text)]">Retry billing webhooks safely</span>
        </span>
        {gateOpen ? <PhasePill status="needs-review" /> : <PhasePill status="running" />}
      </div>
      {/* stage rail */}
      <div className="grid grid-cols-4 gap-1">
        {PLAN_RAIL.map((s) => (
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
          <WorkRow icon={Eye} verb="Searching the codebase" detail="webhook retries, 12 results" shown={t > 0.06} />
          <WorkRow icon={Brain} verb="Checking past decisions" detail="ADR-041" shown={t > 0.16} />
          <WorkRow icon={PencilLine} verb="Drafting" detail="PRD" running={!gateOpen} shown={t > 0.26} />
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
          {t > 0.56 && <span className="ff-pop inline-flex"><MiniCite source="kn" label="ADR-041" /></span>}
          {t > 0.62 && <span className="ff-pop inline-flex"><MiniCite source="repo" label="charge.py" /></span>}
        </span>
      </div>
      {/* the split waiting behind the gate */}
      {gateOpen && (
        <div className="bf-slide-in flex h-7 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2">
          <ListChecks className="size-3 shrink-0 text-[var(--primary)]" />
          <span className="truncate text-[9.5px] text-[var(--text-muted)]">Next: Decompose - subtasks of any type, dependencies wired, gated again</span>
        </div>
      )}
      <Foot>Steer or stop anytime; the log is the audit trail</Foot>
    </Scene>
  );
}

/* ================================================================= 06 build */
/* Two real screens for one segment. The /work board: status columns with the
 * real <TaskStatusPill> colors and the real card idiom (kind icon + id, no kind
 * tint, Athena/assignee), blocked work in its own column. Then the cockpit
 * moment that owns the segment: the <DiffView> hard gate. */

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
 *  The four subtasks build in parallel, then land in Done ONE BY ONE: Athena's
 *  (215) first, design (216) next, the teammate's lane (217) after, and finally
 *  218 - which was blocked until 215 landed (Sophia: "it's free now"). By t=1
 *  every card has rolled up to Done. */
function buildCol(card: "215" | "216" | "217" | "218", t: number): keyof typeof STATUS_LABEL {
  switch (card) {
    case "215": return t < 0.16 ? "in_progress" : t < 0.34 ? "in_review" : "done";                  // done ~0.34
    case "216": return t < 0.26 ? "in_progress" : t < 0.52 ? "in_review" : "done";                  // done ~0.52
    case "217": return t < 0.18 ? "todo" : t < 0.42 ? "in_progress" : t < 0.7 ? "in_review" : "done"; // done ~0.70
    case "218": return t < 0.34 ? "blocked" : t < 0.55 ? "todo" : t < 0.86 ? "in_progress" : "done";  // done ~0.86
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

/* ================================================================== 07 ship */
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

/* ============================================================== 08 security */
/* The security floor, as an honest montage of what's enforced in the code
 * today: row-level isolation with an explicit org fence, AES-256-GCM sealed
 * keys, gates no agent can approve, and spend that's checked before every
 * model call. Every line maps to a shipped mechanism. */

function SecurityRow({ label, at, t }: { label: string; at: number; t: number }) {
  const on = t > at;
  return (
    <span className="flex items-center gap-1.5 text-[10px] text-[var(--text)]" style={{ opacity: on ? 1 : 0.25 }}>
      <span className="min-w-0 flex-1 leading-snug">{label}</span>
      {on && <Check className="size-2.5 shrink-0 text-[var(--success)]" />}
    </span>
  );
}

function SecurityScene({ t }: { t: number }) {
  return (
    <Scene crumb="app.athena.dev/settings/privacy">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--text)]">
          <ShieldCheck className="size-3.5 text-[var(--primary)]" /> Security
        </span>
        <StatusPill tone="success">On by default</StatusPill>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-1.5">
        <Cluster icon={Lock} label="Isolation" at={0.05} t={t}>
          <SecurityRow label="Your org's data, walled off" at={0.12} t={t} />
          <SecurityRow label="Enforced twice, never once" at={0.2} t={t} />
        </Cluster>
        <Cluster icon={KeyRound} label="Keys" at={0.28} t={t}>
          <SecurityRow label="Encrypted at rest" at={0.36} t={t} />
          <SecurityRow label="Never shared between people" at={0.44} t={t} />
        </Cluster>
        <Cluster icon={ShieldCheck} label="Gates" at={0.52} t={t}>
          <SecurityRow label="No AI approves its own work" at={0.6} t={t} />
          <SecurityRow label="Merges happen on your call" at={0.68} t={t} />
        </Cluster>
        <Cluster icon={Gauge} label="Spend" at={0.76} t={t}>
          <SecurityRow label="Budgets checked before every call" at={0.84} t={t} />
          <SecurityRow label="One switch pauses all AI" at={0.92} t={t} />
        </Cluster>
      </div>
      <Foot>Delete a repo and everything Athena learned from it is erased</Foot>
    </Scene>
  );
}

/* =============================================================== 09 receipt */
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

/* =================================================================== 10 cta */

const RECAP = [
  "Your repos became one living map",
  "Answers with sources, for anyone who asks",
  "Your team and your agents on one board",
  "A brief, a plan, a change - each approved by a person",
  "Every AI dollar metered, budgets that stop hard",
];

function CtaScene({ t }: { t: number }) {
  return (
    <Scene crumb="app.athena.dev">
      <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--text)]">
        <Sparkles className="size-3.5 text-[var(--primary)]" /> The whole product, in one story
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
  connect: ConnectScene,
  ask: AskScene,
  team: TeamScene,
  stack: StackScene,
  agents: AgentsScene,
  plan: PlanScene,
  build: BuildScene,
  ship: ShipScene,
  security: SecurityScene,
  receipt: ReceiptScene,
  cta: CtaScene,
};

export function FilmScene({ scene, t }: { scene: SceneKey; t: number }) {
  const Comp = SCENES[scene];
  return <Comp t={t} />;
}
