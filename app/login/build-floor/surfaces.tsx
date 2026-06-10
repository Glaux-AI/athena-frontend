"use client";

/**
 * Build Floor interior surfaces for /login scrollytelling.
 *
 * Ten surfaces rendered inside the one persistent <ProductStage>. Each is a
 * PURE FUNCTION of `t` (the beat's 0..1 scroll progress from useBeatTrack), so
 * scrolling up rewinds the surface exactly. Under reduced motion the kit pins
 * t=1, so every surface MUST read correctly at its settled end-state — that
 * static frame IS the design.
 *
 * Density is a law: the stage owns a CONSTANT p-4 lg:p-5 inset, and every
 * surface holds to a max of 8 rows on an 8px sub-grid (list rows h-9, chips
 * h-6) so the densest (cost ledger, stage rail) and emptiest (chat) read at
 * the same apparent density.
 *
 * Tokens only — no color literals. -soft backgrounds pair with the matching
 * -ink; solid semantic/brand fills pair with -fg. THROWAWAY with the route.
 */

import {
  Github, GitBranch, Check, Square, SkipForward,
  FileCode2, ScanLine, Boxes, Layers, MessageSquare,
  ListTree, GitPullRequest, ShieldCheck, Gauge, Sparkles,
  CircleCheckBig, CircleDashed, Lock, Plus, Plug, Key, ArrowRight,
} from "lucide-react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { cn } from "@/lib/cn";
import { clamp01, lerp, countTo } from "../scroll-kit";
import type { SurfaceKey } from "./beats";

/* ---- pure scrub helpers ------------------------------------------------- */

/** Sub-progress of a [lo,hi] window of t, clamped to 0..1. Lets one surface
 *  sequence several gestures across its single t. */
const seg = (t: number, lo: number, hi: number) => clamp01((t - lo) / (hi - lo));
/** Integer count-up to `final` driven by progress p. */
const count = (final: number, p: number) => Math.round(countTo(final, p));
const usd = (n: number) => `$${n.toFixed(2)}`;

const fmtTokens = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`;

/* A small mono breadcrumb-grade footnote line. */
function Foot({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-auto truncate pt-1 font-mono text-[10px] leading-none text-[var(--text-subtle)]">
      {children}
    </p>
  );
}

/* Every surface fills the stage interior and lays rows on an 8px column. */
function Surface({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col gap-2 overflow-hidden">{children}</div>;
}

/* A surface section header (row 1) — kept identical height across surfaces. */
function Head({
  icon: Icon, title, trailing,
}: {
  icon: typeof Github;
  title: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-6 shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 lg:h-6 lg:flex-nowrap">
      <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-semibold text-[var(--text)]">
        <Icon className="size-3.5 shrink-0 text-[var(--primary)]" strokeWidth={2.25} />
        <span className="truncate">{title}</span>
      </span>
      {trailing}
    </div>
  );
}

/* ========================================================== 01a ConnectRepo */

const PROVIDERS = ["GitHub", "GitLab", "Bitbucket"] as const;

const REPOS = [
  { name: "athena-backend", brand: "GitHub" as const, lang: "Python" },
  { name: "billing-service", brand: "GitLab" as const, lang: "Go" },
  { name: "payments-api", brand: "Bitbucket" as const, lang: "Java" },
];

function ConnectRepoSurface({ t }: { t: number }) {
  const connectedProvider = t > 0.2 ? (t > 0.55 ? 2 : t > 0.38 ? 1 : 0) : -1;
  const attachedCount = connectedProvider + 1;
  const line = seg(t, 0.6, 1);
  return (
    <Surface>
      <Head
        icon={Github}
        title="Connect source control"
        trailing={
          <span className="flex shrink-0 items-center gap-0.5">
            {PROVIDERS.map((p, i) => (
              <span
                key={p}
                className={cn(
                  "inline-flex size-5 items-center justify-center rounded-sm border transition-colors",
                  i <= connectedProvider
                    ? "border-[var(--border-accent)] bg-[var(--primary-soft)]/50"
                    : "border-[var(--border)] bg-[var(--surface)] opacity-50",
                )}
              >
                <BrandLogo name={p} size={12} />
              </span>
            ))}
          </span>
        }
      />
      <div className="flex flex-1 flex-col gap-1.5">
        {REPOS.map((r, i) => {
          const shown = t > i * 0.14;
          const isAttached = i < attachedCount && attachedCount > 0;
          return (
            <div
              key={r.name}
              className={cn(
                "flex h-9 items-center justify-between gap-2 rounded-md border px-2.5 transition-opacity duration-200",
                isAttached
                  ? "border-[var(--border-accent)] bg-[var(--primary-soft)]/40"
                  : "border-[var(--border)] bg-[var(--surface)]",
              )}
              style={{ opacity: shown ? 1 : 0.25 }}
            >
              <span className="flex min-w-0 items-center gap-2">
                <BrandLogo name={r.brand} size={16} />
                <span className="truncate text-[12px] font-medium text-[var(--text)]">{r.name}</span>
                <span className="hidden shrink-0 text-[10px] text-[var(--text-subtle)] sm:inline">{r.lang}</span>
              </span>
              {isAttached ? (
                <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-sm bg-[var(--success-soft)] px-1.5 text-[10px] font-semibold text-[var(--success-ink)]">
                  <Check className="size-3" /> Attached
                </span>
              ) : (
                <span className="inline-flex h-5 shrink-0 items-center rounded-sm border border-[var(--border)] px-1.5 text-[10px] font-medium text-[var(--text-muted)]">
                  Attach
                </span>
              )}
            </div>
          );
        })}
        <div className="relative mt-1 h-4">
          <svg viewBox="0 0 100 12" preserveAspectRatio="none" className="absolute inset-0 size-full" fill="none" aria-hidden>
            <line
              x1="6" y1="6" x2="94" y2="6"
              stroke="var(--border-accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke"
              strokeDasharray={88} strokeDashoffset={88 * (1 - line)}
            />
            <circle cx="6" cy="6" r="2.5" fill="var(--primary)" />
            <circle cx="94" cy="6" r="2.5" fill={line > 0.9 ? "var(--primary)" : "var(--text-subtle)"} />
          </svg>
        </div>
      </div>
      <Foot>OAuth + app install · ingest starts on attach</Foot>
    </Surface>
  );
}

/* ========================================================== 01b Ingest */

const INGEST_STEPS = ["Cloning", "Parsing", "Embedding", "Indexing"] as const;
const TREE = [
  { name: "src/auth.py", d: 0 },
  { name: "src/billing/", d: 1 },
  { name: "  charge.py", d: 2 },
  { name: "api/routes.ts", d: 1 },
  { name: "README.md", d: 1 },
];

function IngestProgressSurface({ t }: { t: number }) {
  const stepF = clamp01(t) * INGEST_STEPS.length; // 0..4
  const activeStep = Math.min(INGEST_STEPS.length - 1, Math.floor(stepF));
  const files = count(248, t);
  const tokens = count(41200, t);
  const stale = t > 0.92;
  return (
    <Surface>
      <Head
        icon={GitBranch}
        title="Ingest · main"
        trailing={
          <span className="flex shrink-0 items-center gap-1">
            <span className="inline-flex h-5 items-center gap-1 rounded-sm border border-[var(--border)] px-1.5 text-[10px] text-[var(--text-muted)]"><Square className="size-2.5" /> Stop</span>
            <span className="inline-flex h-5 items-center gap-1 rounded-sm border border-[var(--border)] px-1.5 text-[10px] text-[var(--text-muted)]"><SkipForward className="size-2.5" /> Skip</span>
          </span>
        }
      />
      {/* 4-segment progress chip — fills directly off t */}
      <div className="grid grid-cols-4 gap-1">
        {INGEST_STEPS.map((s, i) => {
          const done = i < activeStep || t >= 1;
          const on = i === activeStep && t < 1;
          return (
            <div key={s} className="flex flex-col gap-1">
              <div
                className={cn(
                  "h-1.5 rounded-full",
                  done ? "bg-[var(--primary)]" : on ? "bg-[var(--primary)]/55" : "bg-[var(--surface-3)]",
                )}
              />
              <span className={cn("text-[9px] font-medium leading-none", done || on ? "text-[var(--text)]" : "text-[var(--text-subtle)]")}>{s}</span>
            </div>
          );
        })}
      </div>
      {/* faux file tree with a scan sweep reading it */}
      <div className="bf-scan flex-1 rounded-md border border-[var(--border)] bg-[var(--code-bg)] p-2">
        <div className="flex flex-col gap-0.5">
          {TREE.map((f) => (
            <span key={f.name} className="flex items-center gap-1.5 font-mono text-[10px] leading-tight text-[var(--text-muted)]" style={{ paddingLeft: f.d * 10 }}>
              <FileCode2 className="size-2.5 shrink-0 text-[var(--text-subtle)]" />
              {f.name}
            </span>
          ))}
        </div>
      </div>
      {/* counters + the deliberate freshness hint at the end */}
      <div className="flex min-h-6 flex-wrap items-center justify-between gap-x-2 gap-y-1 lg:h-6 lg:flex-nowrap">
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-[var(--text-muted)]">
          <span className="tabular-nums"><b className="font-semibold text-[var(--text)]">{files}</b> files</span>
          <span className="tabular-nums"><b className="font-semibold text-[var(--text)]">{fmtTokens(tokens)}</b> embed tokens</span>
          <span className="hidden font-mono text-[var(--text-subtle)] sm:inline">1536-dim</span>
        </span>
        {stale && (
          <span className="ff-pop inline-flex h-5 shrink-0 items-center gap-1 rounded-sm border border-[var(--warning)] bg-[var(--warning-soft)] px-1.5 text-[10px] font-semibold text-[var(--warning-ink)]">
            <ScanLine className="size-2.5" /> Stale · Sync now
          </span>
        )}
      </div>
      <Foot>Arq worker · pgvector · re-ingest runs only when you click Sync</Foot>
    </Surface>
  );
}

/* ========================================================== 02 Graph */

// Three repo nodes group into a Payments domain, then ease out to an org ring.
const G_NODES = [
  { x: 28, y: 30 }, { x: 52, y: 22 }, { x: 40, y: 46 },
];
const BLUEPRINT_TABS = ["Overview", "Conventions", "Stack", "Glossary", "Decisions"];

function KnowledgeGraphSurface({ t }: { t: number }) {
  const draw = seg(t, 0.05, 0.55);   // edges draw on
  const ring = seg(t, 0.45, 0.8);    // domain containment ring grows
  const org = seg(t, 0.75, 1);       // org ring eases in
  const C = 100;
  const crumb = org > 0.5 ? "repo → domain → org" : ring > 0.4 ? "repo → domain" : "repo";
  return (
    <Surface>
      <Head
        icon={Boxes}
        title="Topology"
        trailing={<span className="font-mono text-[10px] text-[var(--text-subtle)]">{crumb}</span>}
      />
      <div className="grid flex-1 grid-cols-1 gap-2 lg:grid-cols-[1.35fr_1fr]">
        {/* graph */}
        <div className="relative h-32 rounded-md border border-[var(--border)] bg-[var(--code-bg)] lg:h-auto">
          <svg viewBox="0 0 80 70" className="absolute inset-0 size-full" fill="none" aria-hidden>
            {/* org ring */}
            <circle cx="40" cy="35" r="32" stroke="var(--border-accent)" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={org} strokeDasharray="3 3" />
            {/* domain containment capsule */}
            <rect x={16} y={14} width={44} height={40} rx={10}
              stroke="var(--primary)" strokeWidth={1.25} vectorEffect="non-scaling-stroke"
              fill="var(--primary-soft)" fillOpacity={0.18 * ring} opacity={0.3 + 0.5 * ring}
              style={{ transformOrigin: "38px 34px", transform: `scale(${lerp(0.6, 1, ring)})` }} />
            {/* edges between repo nodes */}
            {G_NODES.map((p, i) => {
              const q = G_NODES[(i + 1) % G_NODES.length]!;
              return <line key={`e${i}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y}
                stroke="var(--primary)" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.7}
                strokeDasharray={C} strokeDashoffset={C * (1 - draw)} />;
            })}
            {/* repo nodes */}
            {G_NODES.map((p, i) => (
              <circle key={`n${i}`} cx={p.x} cy={p.y} r={i === 0 ? 3.4 : 2.6}
                fill="var(--primary)" className={draw > 0.9 ? undefined : "ff-node"} style={{ animationDelay: `${i * 0.3}s` }} />
            ))}
          </svg>
          <span className="absolute bottom-1 left-2 font-mono text-[9px] text-[var(--text-subtle)]">Payments</span>
        </div>
        {/* blueprint section list types in */}
        <div className="flex flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
          <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--text)]"><Layers className="size-3 text-[var(--primary)]" /> Blueprint</span>
          {BLUEPRINT_TABS.map((s, i) => {
            const shown = t > 0.2 + i * 0.13;
            return (
              <span key={s} className="flex items-center justify-between gap-1 text-[10px] leading-tight" style={{ opacity: shown ? 1 : 0.25 }}>
                <span className="min-w-0 truncate text-[var(--text-muted)]">{s}</span>
                <span className={cn("shrink-0 rounded-[3px] px-1 text-[8px] font-semibold", i < 2 ? "bg-[var(--acc-mint-soft)] text-[var(--acc-mint-ink)]" : "bg-[var(--surface-2)] text-[var(--text-subtle)]")}>
                  {i < 2 ? "derived" : "authored"}
                </span>
              </span>
            );
          })}
        </div>
      </div>
      <Foot>Athena owns these docs — never written back into your repo</Foot>
    </Surface>
  );
}

/* ========================================================== 02c Integrations */

const CONNECTORS: { group: string; items: { name: string; byok?: boolean }[] }[] = [
  { group: "Work", items: [{ name: "Jira" }, { name: "Linear" }] },
  { group: "Comms", items: [{ name: "Slack" }, { name: "Microsoft Teams" }] },
  { group: "Knowledge", items: [{ name: "Notion" }, { name: "Confluence" }] },
  { group: "Models", items: [{ name: "Anthropic", byok: true }, { name: "AWS Bedrock", byok: true }, { name: "Azure OpenAI", byok: true }] },
];

function IntegrationsSurface({ t }: { t: number }) {
  let row = 0;
  return (
    <Surface>
      <Head
        icon={Plug}
        title="Connect your stack"
        trailing={
          <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-sm border border-[var(--border)] px-1.5 text-[10px] text-[var(--text-muted)]">
            <Key className="size-2.5" /> BYOK supported
          </span>
        }
      />
      <div className="flex flex-1 flex-col gap-1.5 overflow-hidden">
        {CONNECTORS.map((g) => (
          <div key={g.group} className="flex flex-col gap-0.5">
            <span className="text-[8px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{g.group}</span>
            <div className="flex flex-wrap gap-1">
              {g.items.map((item) => {
                const shown = t > row * 0.12;
                row += 1;
                const connected = t > row * 0.12 + 0.08;
                return (
                  <span
                    key={item.name}
                    className={cn(
                      "inline-flex h-6 items-center gap-1 rounded-sm border px-1.5 text-[10px] font-medium transition-all duration-200",
                      connected
                        ? "border-[var(--border-accent)] bg-[var(--primary-soft)]/50 text-[var(--text)]"
                        : "border-[var(--border)] text-[var(--text-muted)]",
                    )}
                    style={{ opacity: shown ? 1 : 0.2 }}
                  >
                    <BrandLogo name={item.name} size={14} />
                    {item.name}
                    {item.byok && (
                      <span className="rounded-[3px] bg-[var(--acc-violet-soft)] px-1 text-[8px] font-semibold text-[var(--acc-violet-ink)]">key</span>
                    )}
                    {connected && <Check className="size-2.5 text-[var(--success)]" />}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <Foot>Jira · Slack · Notion optional — source control is enough to start</Foot>
    </Surface>
  );
}

/* ========================================================== 03 CitedChat */

const ANSWER =
  "Charges flow through charge.py, which calls the gateway adapter and writes a ledger row per attempt. Retries are idempotent by the request key set in ADR-041.";
const CITES = [
  { label: "charge.py", at: 0.42 },
  { label: "ADR-041", at: 0.7 },
  { label: "#812", at: 0.9 },
];

function CitedChatSurface({ t }: { t: number }) {
  const typeP = seg(t, 0.05, 0.85);
  const shownChars = Math.round(ANSWER.length * typeP);
  const turnUsd = countTo(0.03, t);
  return (
    <Surface>
      <Head
        icon={MessageSquare}
        title="Chat"
        trailing={
          <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-sm border border-[var(--border)] px-1.5 text-[10px] text-[var(--text-muted)]">
            Scope: Org-wide
          </span>
        }
      />
      {/* question */}
      <div className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[11px] text-[var(--text)]">
        <span className="truncate">How do retries work in billing?</span>
      </div>
      {/* streamed, cited answer */}
      <div className="flex-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)]/50 p-2">
        <p className="text-[11px] leading-relaxed text-[var(--text)]">
          {ANSWER.slice(0, shownChars)}
          {typeP < 1 && <span className="bf-caret font-semibold text-[var(--primary)]">▍</span>}
        </p>
      </div>
      {/* citation chips pop after their sentence lands */}
      <div className="flex h-6 flex-wrap items-center gap-1">
        {CITES.map((c) =>
          t >= c.at ? (
            <span key={c.label} className="ff-pop inline-flex h-5 items-center gap-1 rounded-sm border border-[var(--info)] bg-[var(--info-soft)] px-1.5 font-mono text-[10px] font-medium text-[var(--info-ink)]">
              <span className="size-1 rounded-full bg-[var(--info)]" />{c.label}
            </span>
          ) : null,
        )}
      </div>
      <div className="flex h-6 items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1 text-[10px] font-medium text-[var(--text-muted)]" style={{ opacity: t > 0.95 ? 1 : 0.3 }}>
          <Sparkles className="size-3 shrink-0 text-[var(--primary)]" /> <span className="truncate">Propose task →</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-[var(--acc-mint-soft)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--acc-mint-ink)]">
          <Gauge className="size-3" /> {usd(turnUsd)}/turn
        </span>
      </div>
    </Surface>
  );
}

/* ========================================================== 04 NewTask */

const TASK_TYPES = ["feature", "implementation", "design", "bug", "incident", "spike", "chore"];
const SEED_STAGES = ["frame", "research", "prd", "decompose", "plan", "execution", "raise_pr", "pr_heal"];

function NewTaskSurface({ t }: { t: number }) {
  const seededCount = Math.round(clamp01(seg(t, 0.3, 1)) * SEED_STAGES.length);
  const free = t > 0.85;
  return (
    <Surface>
      <Head icon={Plus} title="New Task" trailing={<span className="shrink-0 font-mono text-[10px] text-[var(--text-subtle)]">status: backlog</span>} />
      {/* type chips — feature selected */}
      <div className="flex flex-wrap gap-1">
        {TASK_TYPES.map((tp) => {
          const sel = tp === "feature";
          return (
            <span key={tp} className={cn(
              "inline-flex h-5 items-center rounded-sm border px-1.5 text-[10px] font-medium",
              sel ? "border-[var(--primary)] bg-[var(--primary-soft)]/60 text-[var(--primary)]" : "border-[var(--border)] text-[var(--text-muted)]",
            )}>
              {tp}
            </span>
          );
        })}
      </div>
      {/* title + budget cap */}
      <div className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5">
        <span className="truncate text-[11px] text-[var(--text)]">Add idempotency keys to billing retries</span>
        <span className="bf-caret ml-auto font-semibold text-[var(--primary)]">▍</span>
      </div>
      {/* seeded stage rail — pills, EMPTY/grey: nothing has run, cost zero */}
      <div className="flex flex-1 flex-col justify-center gap-1.5 rounded-md border border-dashed border-[var(--border)] p-2">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Seeded stages — fixed, ordered, no model-chosen order</span>
        <div className="flex flex-wrap gap-1">
          {SEED_STAGES.map((s, i) => (
            <span key={s} className={cn(
              "inline-flex h-6 items-center rounded-sm border px-1.5 text-[10px] font-medium transition-opacity duration-150",
              i < seededCount ? "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)]" : "border-transparent text-transparent",
            )} style={{ opacity: i < seededCount ? 1 : 0 }}>
              {s}
            </span>
          ))}
        </div>
      </div>
      <div className="flex min-h-6 flex-wrap items-center justify-between gap-x-2 gap-y-1 lg:h-6 lg:flex-nowrap">
        <span className="shrink-0 text-[10px] text-[var(--text-muted)]">AI budget cap · $5.00</span>
        {free && (
          <span className="ff-pop inline-flex min-h-5 min-w-0 items-center gap-1 rounded-sm bg-[var(--acc-mint-soft)] px-1.5 text-[10px] font-semibold leading-tight text-[var(--acc-mint-ink)] lg:h-5">
            Free — AI runs only when you run a stage
          </span>
        )}
      </div>
    </Surface>
  );
}

/* ========================================================== 05 StageRail */

const RAIL: { group: string; stages: { key: string; gate: "soft" | "hard" }[] }[] = [
  { group: "DESIGN", stages: [{ key: "frame", gate: "soft" }, { key: "research", gate: "soft" }, { key: "prd", gate: "hard" }] },
  { group: "ARCHITECTURE", stages: [{ key: "decompose", gate: "hard" }] },
  { group: "IMPLEMENT", stages: [{ key: "plan", gate: "hard" }, { key: "execution", gate: "soft" }, { key: "raise_pr", gate: "soft" }, { key: "pr_heal", gate: "soft" }] },
];
const FLAT = RAIL.flatMap((g) => g.stages);

function StageRailSurface({ t }: { t: number }) {
  const lit = clamp01(t) * FLAT.length;
  const activeIdx = Math.min(FLAT.length - 1, Math.floor(lit));
  const runUsd = countTo(0.94, t);
  const showManifest = t > 0.7;
  return (
    <Surface>
      <Head
        icon={ListTree}
        title="Feature run"
        trailing={
          <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-sm bg-[var(--acc-mint-soft)] px-1.5 text-[10px] font-semibold tabular-nums text-[var(--acc-mint-ink)]">
            <Gauge className="size-3" /> {usd(runUsd)}
          </span>
        }
      />
      {/* grouped horizontal rail */}
      <div className="flex flex-wrap items-end gap-1.5 lg:flex-nowrap">
        {RAIL.map((g) => (
          <div key={g.group} className="flex flex-col gap-0.5">
            <span className="text-[8px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{g.group}</span>
            <div className="flex flex-wrap gap-1 lg:flex-nowrap">
              {g.stages.map((s) => {
                const idx = FLAT.findIndex((f) => f.key === s.key);
                const done = idx < activeIdx;
                const on = idx === activeIdx;
                return (
                  <span key={s.key}
                    className={cn(
                      "relative inline-flex h-6 items-center rounded-sm border px-1 text-[9px] font-medium",
                      on ? "flow-step-active border-[var(--primary)] bg-[var(--primary-soft)]/60 text-[var(--primary)] shadow-[var(--shadow-glow)]"
                        : done ? "border-[var(--border-accent)] bg-[var(--surface-2)] text-[var(--text-muted)]"
                        : "border-[var(--border)] text-[var(--text-subtle)]",
                    )}>
                    {s.gate === "hard" && <Lock className="mr-0.5 size-2 text-[var(--warning)]" aria-hidden />}
                    {s.key}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {/* artifact panel — worklog ticker → change manifest + draft-PR intent */}
      <div className="flex-1 rounded-md border border-[var(--border)] bg-[var(--code-bg)] p-2">
        {showManifest ? (
          <div className="bf-slide-in flex flex-col gap-1">
            <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--text)]"><GitPullRequest className="size-3 text-[var(--primary)]" /> Change manifest</span>
            <span className="font-mono text-[9px] leading-tight text-[var(--text-muted)]">~ src/billing/charge.py · +idempotency_key</span>
            <span className="font-mono text-[9px] leading-tight text-[var(--text-muted)]">+ tests/test_retry_idempotent.py</span>
            <span className="text-[9px] text-[var(--text-subtle)]">blast radius: 2 files · 1 symbol</span>
            <span className="mt-0.5 inline-flex max-w-full items-center gap-1 rounded-sm border border-[var(--info)] bg-[var(--info-soft)] px-1.5 py-0.5 text-[9px] font-medium leading-tight text-[var(--info-ink)]">
              Draft PR · end-to-end diffs in progress
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--text)]"><CircleDashed className="size-3 animate-spin text-[var(--primary)]" /> {FLAT[activeIdx]?.key}</span>
            <span className="font-mono text-[9px] leading-tight text-[var(--text-muted)]">· reading knowledge graph + decision records</span>
            <span className="font-mono text-[9px] leading-tight text-[var(--text-muted)]">· streaming steps · model per action</span>
          </div>
        )}
      </div>
      <Foot>opens a draft PR for your review — never ships code on its own</Foot>
    </Surface>
  );
}

/* ========================================================== 06 GateRibbon */

function GateRibbonSurface({ t }: { t: number }) {
  // Scrolling past t≈0.6 IS the approval: the device dims under an --overlay
  // wash while it waits, the glass ribbon rises above it, and at t≥0.6 the
  // ribbon collapses to a settled success state and the dim lifts.
  const approved = t >= 0.6;
  const rise = seg(t, 0.1, 0.45);
  return (
    <Surface>
      <Head icon={ShieldCheck} title="PRD ready for your approval" trailing={<span className="font-mono text-[10px] text-[var(--text-subtle)]">hard gate</span>} />
      {/* the run paused behind the gate */}
      <div className="relative flex-1 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--code-bg)]">
        <div className="flex flex-col gap-1 p-2">
          <span className="text-[10px] font-semibold text-[var(--text)]">PRD · idempotent billing retries</span>
          <span className="text-[9px] leading-tight text-[var(--text-muted)]">Goal · Context · Approach · Acceptance · Risks</span>
          <span className="font-mono text-[9px] text-[var(--text-subtle)]">cited: ADR-041 · charge.py · #812</span>
        </div>
        {/* --overlay wash dimming the run; lifts as the approval resolves */}
        <div
          className="pointer-events-none absolute inset-0 bg-[var(--overlay)] transition-opacity duration-300"
          style={{ opacity: approved ? 0 : 0.6 }}
          aria-hidden
        />
        {/* glass approval ribbon rises above the wash, breathes on Approve */}
        <div
          className="absolute inset-x-2 bottom-2 rounded-md border border-[var(--border-strong)] bg-[var(--surface-glass)] p-2 shadow-[var(--shadow-2)] backdrop-blur-md transition-all duration-300"
          style={{ opacity: 0.4 + 0.6 * (approved ? 1 : rise), transform: `translateY(${lerp(12, 0, approved ? 1 : rise)}px)` }}
        >
          {approved ? (
            <div className="bf-slide-in flex items-center gap-2">
              <CircleCheckBig className="size-4 text-[var(--success)]" />
              <span className="text-[11px] font-semibold text-[var(--success-ink)]">Approved by you</span>
              <span className="ml-auto font-mono text-[9px] text-[var(--text-subtle)]">decision · note · $0.00</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0 text-[10px] font-medium leading-snug text-[var(--text)]">Paused — waiting for you.</span>
              <span className="flex shrink-0 items-center gap-1">
                <span className="bf-breathe inline-flex h-6 items-center rounded-sm bg-[var(--primary)] px-2 text-[10px] font-semibold text-[var(--primary-fg)]">Approve</span>
                <span className="inline-flex h-6 items-center rounded-sm border border-[var(--border)] px-2 text-[10px] font-medium text-[var(--text-muted)]">Reject</span>
              </span>
            </div>
          )}
        </div>
      </div>
      <Foot>scroll past this gate to approve · Athena never merges or deploys</Foot>
    </Surface>
  );
}

/* ========================================================== 07 PRBoundary */

const CHECKS = [
  { name: "unit", state: "pass" },
  { name: "typecheck", state: "pass" },
  { name: "e2e", state: "pass" },
];

function PRBoundarySurface({ t }: { t: number }) {
  const assemble = seg(t, 0.05, 0.6);
  return (
    <Surface>
      <Head
        icon={GitPullRequest}
        title="Add idempotency keys"
        trailing={<span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-sm bg-[var(--info-soft)] px-1.5 text-[10px] font-semibold text-[var(--info-ink)]">Open · draft branch</span>}
      />
      <div className="flex flex-1 flex-col gap-1.5" style={{ opacity: 0.4 + 0.6 * assemble }}>
        <span className="truncate font-mono text-[10px] text-[var(--text-subtle)]">athena/billing-idempotency → main</span>
        {/* CI check-run list */}
        <div className="flex flex-col gap-0.5 rounded-md border border-[var(--border)] bg-[var(--surface)] p-1.5">
          {CHECKS.map((c) => (
            <span key={c.name} className="flex items-center gap-1.5 text-[10px]">
              <CircleCheckBig className="size-3 text-[var(--success)]" />
              <span className="text-[var(--text)]">{c.name}</span>
              <span className="ml-auto text-[var(--text-subtle)]">passed</span>
            </span>
          ))}
        </div>
        <span className="text-[10px] leading-tight text-[var(--text-muted)]">
          CI-heal fixes failing builds on your real CI.
        </span>
      </div>
      <div className="flex h-9 shrink-0 items-center gap-2">
        <span
          aria-disabled="true"
          title="You merge — Athena never merges."
          className="inline-flex h-7 shrink-0 cursor-not-allowed items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 text-[11px] font-semibold text-[var(--text-subtle)] opacity-60"
        >
          <Lock className="size-3" /> Merge
        </span>
        <span className="min-w-0 truncate text-[10px] font-medium text-[var(--text-muted)]">You merge</span>
      </div>
      <Foot>opens a draft PR for your review · applying real end-to-end diffs is being completed</Foot>
    </Surface>
  );
}

/* ========================================================== 08 CostLedger */

const LEDGER = [
  { stage: "frame", model: "Haiku 4.5", usd: 0.04, key: false },
  { stage: "research", model: "Sonnet 4.6", usd: 0.21, key: false },
  { stage: "prd", model: "Opus 4.8", usd: 0.38, key: true },
  { stage: "decompose", model: "Sonnet 4.6", usd: 0.12, key: false },
  { stage: "plan", model: "Sonnet 4.6", usd: 0.19, key: false },
];

function CostLedgerSurface({ t }: { t: number }) {
  const fill = clamp01(t);
  const pct = Math.round(fill * 100);
  const total = countTo(LEDGER.reduce((s, r) => s + r.usd, 0), t);
  const hardStop = pct >= 100;
  return (
    <Surface>
      <Head
        icon={Gauge}
        title="Cost ledger"
        trailing={<span className="shrink-0 text-[10px] font-semibold tabular-nums text-[var(--text)]">{usd(total)} so far</span>}
      />
      {/* budget bar with 80% amber tick + 100% red hard-stop */}
      <div className="relative h-2 rounded-full bg-[var(--surface-3)]">
        <div className={cn("absolute inset-y-0 left-0 rounded-full transition-[background] duration-150", hardStop ? "bg-[var(--danger)]" : pct >= 80 ? "bg-[var(--warning)]" : "bg-[var(--primary)]")} style={{ width: `${pct}%` }} />
        <span className="absolute -top-0.5 bottom-[-2px] w-px bg-[var(--warning)]" style={{ left: "80%" }} aria-hidden />
        <span className="absolute -top-0.5 bottom-[-2px] w-px bg-[var(--danger)]" style={{ left: "100%" }} aria-hidden />
      </div>
      <div className="flex h-4 items-center justify-between text-[9px] text-[var(--text-subtle)]">
        <span className="tabular-nums">{pct}% of cap</span>
        <span className="flex items-center gap-2">
          <span className="text-[var(--warning-ink)]">80% alert</span>
          <span className="text-[var(--danger-ink)]">100% stop</span>
        </span>
      </div>
      {/* ledger rows stream in with counting costs */}
      <div className="flex flex-1 flex-col gap-0.5 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] p-1.5">
        {LEDGER.map((r, i) => {
          const shown = t > i * 0.14;
          return (
            <span key={r.stage} className={cn("flex items-center gap-1.5 text-[10px] transition-opacity duration-150", shown && "bf-slide-in")} style={{ opacity: shown ? 1 : 0 }}>
              <span className="w-16 shrink-0 truncate font-medium text-[var(--text)]">{r.stage}</span>
              <span className="min-w-0 truncate text-[var(--text-muted)]">{r.model}</span>
              <span className={cn("ml-auto shrink-0 rounded-[3px] px-1 text-[8px] font-semibold", r.key ? "bg-[var(--acc-violet-soft)] text-[var(--acc-violet-ink)]" : "bg-[var(--surface-2)] text-[var(--text-subtle)]")}>
                {r.key ? "your key" : "credit"}
              </span>
              <span className="w-10 shrink-0 text-right tabular-nums text-[var(--text)]">{usd(shown ? r.usd : 0)}</span>
            </span>
          );
        })}
      </div>
      {hardStop && (
        <span className="ff-pop inline-flex min-h-5 w-fit max-w-full items-center gap-1 rounded-sm border border-[var(--danger)] bg-[var(--danger-soft)] px-1.5 text-[10px] font-semibold leading-tight text-[var(--danger-ink)] lg:h-5">
          Hard stop — raise the budget to resume
        </span>
      )}
      <Foot>metered exactly as the provider returned it</Foot>
    </Surface>
  );
}

/* ========================================================== 09 CTA */

function CtaSurface({ t }: { t: number }) {
  const show = t > 0.2;
  return (
    <Surface>
      <Head icon={Sparkles} title="Ready to run it on your org" />
      <div className="flex flex-1 flex-col justify-center gap-2" style={{ opacity: 0.3 + 0.7 * clamp01(t) }}>
        {[
          "Connect GitHub · ingest your repos",
          "Wire Jira, Slack, and your AI models",
          "Chat with citations · run gated tasks",
          "Open PRs — you merge, Athena never deploys",
        ].map((line, i) => (
          <span
            key={line}
            className={cn("flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] transition-opacity", show && i <= Math.floor(t * 4) && "bf-slide-in")}
            style={{ opacity: t > 0.15 + i * 0.18 ? 1 : 0.25 }}
          >
            <CircleCheckBig className="size-3 shrink-0 text-[var(--success)]" />
            {line}
          </span>
        ))}
      </div>
      <div className="flex h-8 items-center gap-2" style={{ opacity: t > 0.75 ? 1 : 0.3 }}>
        <span className="inline-flex h-7 min-w-0 flex-1 items-center justify-center gap-1 rounded-md bg-[var(--primary)] px-2 text-[10px] font-semibold text-[var(--primary-fg)]">
          Sign in <ArrowRight className="size-3 shrink-0" />
        </span>
        <span className="inline-flex h-7 shrink-0 items-center rounded-md border border-[var(--border)] px-2 text-[10px] font-medium text-[var(--text-muted)]">
          Free
        </span>
      </div>
      <Foot>sign in above · pricing below</Foot>
    </Surface>
  );
}

/* ========================================================== Surface router */

const REGISTRY: Record<SurfaceKey, (props: { t: number }) => React.JSX.Element> = {
  connect: ConnectRepoSurface,
  ingest: IngestProgressSurface,
  graph: KnowledgeGraphSurface,
  integrations: IntegrationsSurface,
  chat: CitedChatSurface,
  newTask: NewTaskSurface,
  stageRail: StageRailSurface,
  gateRibbon: GateRibbonSurface,
  prBoundary: PRBoundarySurface,
  costLedger: CostLedgerSurface,
  cta: CtaSurface,
};

export function StageSurface({ surface, t }: { surface: SurfaceKey; t: number }) {
  const Comp = REGISTRY[surface];
  return <Comp t={t} />;
}
