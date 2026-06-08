/**
 * Build Floor beat configuration for /login scrollytelling.
 * Flow: connect repos → ingest → domain graph → optional stack → chat →
 * tasks → stages → gates → PR → cost → ready.
 */

import type { OwlMood } from "@/components/mascot/owl-avatar";

export type SurfaceKey =
  | "connect"
  | "ingest"
  | "graph"
  | "integrations"
  | "chat"
  | "newTask"
  | "stageRail"
  | "gateRibbon"
  | "prBoundary"
  | "costLedger"
  | "cta";

export type GateKind = "open" | "soft" | "hard" | "read" | "none";

export interface Beat {
  id: string;
  kicker: string;
  headline: string;
  sub: string;
  microcopy: string;
  integrations: string[];
  gate: { kind: GateKind; label: string };
  cost: string;
  surface: SurfaceKey;
  mood: OwlMood;
  breadcrumb: string;
}

export const BEATS: readonly Beat[] = [
  {
    id: "act1a-connect-repo",
    kicker: "01 / CONNECT REPOS",
    headline: "Connect GitHub, GitLab, or Bitbucket.",
    sub: "OAuth in and attach the repos you want Athena to learn. Each attach pins a commit SHA and enqueues ingest — the first step toward your org's knowledge graph. Source control is the only required connector.",
    microcopy: "Pick repos yourself. No agent runs until you attach.",
    integrations: ["GitHub", "GitLab", "Bitbucket"],
    gate: { kind: "open", label: "You pick repos" },
    cost: "Embeddings only · no LLM",
    surface: "connect",
    mood: "reading",
    breadcrumb: "athena · source control",
  },
  {
    id: "act1b-ingest-progress",
    kicker: "02 / BUILD KNOWLEDGE",
    headline: "Clone. Parse. Embed. Index.",
    sub: "An Arq worker fetches the file tree, batches files, and embeds each into a 1536-dim vector, writing KnowledgeNodes and a per-repo graph. Progress polls live — Stop or Skip any file anytime.",
    microcopy: "A later push flags the graph stale; click Sync when you want a refresh.",
    integrations: ["GitHub", "GitLab", "Bitbucket"],
    gate: { kind: "open", label: "You control sync" },
    cost: "Metered embeddings",
    surface: "ingest",
    mood: "working",
    breadcrumb: "athena · ingest",
  },
  {
    id: "act2-knowledge-graph-domain",
    kicker: "03 / DOMAIN KNOWLEDGE",
    headline: "Repos roll up into domains, then your org.",
    sub: "Group repositories into domains like Payments, then into an org-wide view. Athena synthesizes Blueprint sections — overview, conventions, stack, glossary, decisions — per repo, domain, and org. Never written back into your repo.",
    microcopy: "Protected Blueprint edits go to an approval queue; viewing is always open.",
    integrations: ["GitHub"],
    gate: { kind: "soft", label: "Edits need approval" },
    cost: "~cents per rebuild",
    surface: "graph",
    mood: "thinking",
    breadcrumb: "athena · knowledge",
  },
  {
    id: "act2c-connect-stack",
    kicker: "04 / YOUR STACK",
    headline: "Optionally wire Jira, Slack, and AI models.",
    sub: "Tickets, comms, and knowledge bases enrich the graph on OAuth. Bring your own Anthropic, Bedrock, or Azure OpenAI key — inference bills your provider — or route through Athena credit.",
    microcopy: "All optional. Athena works with source control alone.",
    integrations: ["Jira", "Linear", "Slack", "Notion", "Anthropic", "AWS Bedrock", "Azure OpenAI"],
    gate: { kind: "open", label: "All optional" },
    cost: "No LLM yet",
    surface: "integrations",
    mood: "focused",
    breadcrumb: "athena · connectors",
  },
  {
    id: "act3-cited-chat",
    kicker: "05 / CHAT",
    headline: "Ask. Get a cited answer.",
    sub: "Plain-language questions about your code, docs, and decisions. Answers stream live with citations — files, ADRs, PRs, URLs. Athena reads your repos here; it never writes them.",
    microcopy: "A proposed task only starts when you click it.",
    integrations: ["Anthropic", "Azure OpenAI"],
    gate: { kind: "read", label: "Read-only" },
    cost: "~cents per turn",
    surface: "chat",
    mood: "focused",
    breadcrumb: "athena · chat",
  },
  {
    id: "act4-new-task",
    kicker: "06 / CREATE A TASK",
    headline: "Turn a goal into a task.",
    sub: "New Task → pick a type (feature, implementation, design, bug, incident, spike, chore) → title, domain, optional AI budget cap. Athena seeds a fixed, ordered stage sequence for that type.",
    microcopy: "Stages are fixed and ordered — never model-chosen. Free at creation.",
    integrations: [],
    gate: { kind: "open", label: "Free to create" },
    cost: "Free",
    surface: "newTask",
    mood: "writing",
    breadcrumb: "athena · tasks",
  },
  {
    id: "act5-stage-rail",
    kicker: "07 / FEATURE FLOW",
    headline: "Design → Architecture → Implement.",
    sub: "A feature moves through framing + PRD (design), decomposition (architecture), then plan + code on a draft branch (implement). One recursive task spine — not a separate engine. Execution opens a draft PR; Athena never merges.",
    microcopy: "Opens a draft PR for your review — never ships on its own.",
    integrations: ["GitHub", "Anthropic"],
    gate: { kind: "hard", label: "Hard gates pause for you" },
    cost: "Capped per stage",
    surface: "stageRail",
    mood: "working",
    breadcrumb: "athena · run",
  },
  {
    id: "act6-gate-interrupt",
    kicker: "08 / YOU ARE THE GATE",
    headline: "Athena pauses. You decide.",
    sub: "At every consequential step Athena opens a blocking approval and waits. Approve to unlock the next stage; reject to re-run with your feedback. Steer mid-run or Stop the AI anytime.",
    microcopy: "This is the guardrail — Athena opens PRs but never merges or deploys.",
    integrations: ["GitHub"],
    gate: { kind: "hard", label: "You approve" },
    cost: "$0 while waiting",
    surface: "gateRibbon",
    mood: "waiting",
    breadcrumb: "athena · approval",
  },
  {
    id: "act7-pr-boundary",
    kicker: "08 / THE BOUNDARY",
    headline: "It opens the PR. You merge.",
    sub: "Execution edits on a draft branch and runs your real CI — not an Athena sandbox. It reads check results, fixes failing builds, and updates the PR. Never merges. Never deploys.",
    microcopy: "Draft PR for your review; end-to-end diffs still being completed.",
    integrations: ["GitHub"],
    gate: { kind: "hard", label: "Never auto-merges" },
    cost: "~cents per heal",
    surface: "prBoundary",
    mood: "focused",
    breadcrumb: "athena · pull-request",
  },
  {
    id: "act8-cost-ledger",
    kicker: "09 / COST",
    headline: "Every step is metered and attributed.",
    sub: "Every LLM call writes one ledger row — org, stage, model, provider, tokens, exact cost, and whether your key paid. Roll up per repo, task, stage, domain, model, and provider. Soft alert at 80%, hard stop at 100%.",
    microcopy: "Metered as the provider returned it — figures shown, not promised.",
    integrations: ["Anthropic", "AWS Bedrock", "Azure OpenAI"],
    gate: { kind: "soft", label: "Hard stop at 100%" },
    cost: "Credit or your key",
    surface: "costLedger",
    mood: "happy",
    breadcrumb: "athena · cost",
  },
  {
    id: "act9-ready",
    kicker: "10 / READY",
    headline: "Same engine. Your org.",
    sub: "You just watched the full flow — connect repos, build knowledge, chat with citations, run gated tasks, and meter every step. Sign in above to attach your first repo. Free to start.",
    microcopy: "You approve every gate. Athena never merges or deploys.",
    integrations: ["GitHub", "GitLab", "Bitbucket"],
    gate: { kind: "none", label: "You hold every gate" },
    cost: "Free to start",
    surface: "cta",
    mood: "happy",
    breadcrumb: "athena · ready",
  },
] as const;

export const ACT0 = {
  kicker: "00 / WHAT ATHENA IS",
  headline_pre: "Connect your repos. Turn knowledge into ",
  headline_accent: "work that ships",
  headline_post: ".",
  sub: "Attach GitHub, GitLab, or Bitbucket and Athena builds a living knowledge graph from your code and docs — then answers grounded questions and runs product tasks through design, architecture, and implementation, opening pull requests at the end. You approve every gate; Athena never merges or deploys.",
  microcopy: "Scroll to watch it run",
} as const;

export const GATE_STYLES: Record<GateKind, { cls: string; dot: string }> = {
  open: {
    cls: "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)]",
    dot: "bg-[var(--text-subtle)]",
  },
  soft: {
    cls: "border-[var(--info)] bg-[var(--info-soft)] text-[var(--info-ink)]",
    dot: "bg-[var(--info)]",
  },
  hard: {
    cls: "border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
    dot: "bg-[var(--warning)]",
  },
  read: {
    cls: "border-[var(--info)] bg-[var(--info-soft)] text-[var(--info-ink)]",
    dot: "bg-[var(--info)]",
  },
  none: {
    cls: "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success-ink)]",
    dot: "bg-[var(--success)]",
  },
};

export const BEAT_RUNNING_USD: readonly number[] = [
  0, 0, 0.18, 0.18, 0.21, 0.21, 0.94, 0.94, 0.97, 1.42, 1.42,
];
