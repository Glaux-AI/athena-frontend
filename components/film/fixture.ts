/**
 * Film fixture - "Meridian Systems".
 *
 * Mutates the in-memory mock db (`lib/api/mock/db.ts`) IN PLACE so the real
 * app, running against the in-process mock backend, renders the fictional
 * org the demo film is shot against: Meridian Systems, a fintech-ish company
 * with 312 repositories across 8 domains and a small named cast.
 *
 * Imported only by the /film harness (components/film/scene-hosts.tsx).
 * Synchronous, deterministic (no Math.random - index-seeded LCG), and
 * idempotent (calling applyFilmFixture twice is a no-op).
 *
 * NOTE: the mock db module is per-JS-context. IframeScene documents load a
 * fresh copy of the app, so the fixture must also be applied inside that
 * context for iframe scenes to see Meridian data.
 */

import { toast } from "sonner";

import * as db from "@/lib/api/mock/db";
import type { DomainRepo } from "@/lib/api/client";
import { getTemplate } from "@/lib/design/templates";

/* ------------------------------------------------------------ constants */

export const FILM_ORG = "Meridian Systems";

export interface FilmCastMember {
  name: string;
  email: string;
  role: string;
}

/** The on-screen cast. Role strings reuse the org-role names db.ts seeds. */
export const FILM_CAST: readonly FilmCastMember[] = [
  { name: "Maya Rao",   email: "maya@meridian.dev",  role: "admin" },
  { name: "Priya Nair", email: "priya@meridian.dev", role: "ws_admin" },
  { name: "Dev Patel",  email: "dev@meridian.dev",   role: "engineer" },
  { name: "Sara Kim",   email: "sara@meridian.dev",  role: "engineer" },
  { name: "Arjun Mehta",email: "arjun@meridian.dev", role: "engineer" },
  { name: "Rohan Iyer", email: "rohan@meridian.dev", role: "reviewer" },
];

/** Per-person attribution for the finished feature the cost scene tells.
 *  There is no mock endpoint that serves per-person-per-task attribution
 *  (the /v1/cost/summary member table is hard-coded in handlers.ts), so
 *  scenes render this constant directly. Totals: $4.80 / 2.1M tokens. */
export const FILM_FEAT12_COST = {
  task_id: "tsk_feat12",
  display_id: "FEAT-12",
  title: "Same-day refund settlement",
  total_usd: 4.8,
  total_tokens: 2_100_000,
  rows: [
    { who: "Sara Kim",      role: "Design",         tokens: 410_000, usd: 0.92 },
    { who: "Arjun Mehta",   role: "Implementation", tokens: 940_000, usd: 2.1 },
    { who: "Rohan Iyer",    role: "Review",         tokens: 280_000, usd: 0.61 },
    { who: "Athena agents", role: "Spec / plan / CI", tokens: 470_000, usd: 1.17 },
  ],
} as const;

export interface FilmAgent {
  name: string;
  slug: string;
  description: string;
  tools: string[];
  model_role: string;
  status: "active" | "draft";
}

/** Custom agents for the registry scene. The mock backend has no /v1/agents
 *  handlers, so the /agents page cannot be fed from the mock db - scenes
 *  that need agents render these rows themselves. */
export const FILM_AGENTS: readonly FilmAgent[] = [
  {
    name: "Release Scout",
    slug: "release-scout",
    description:
      "Watches merged PRs across Payments and Ledger, drafts release notes, and flags settlement-path changes that need a reviewer from the payments rota.",
    tools: ["recent_code_changes", "search_decisions", "read_repo_file", "post_to_thread"],
    model_role: "workhorse",
    status: "active",
  },
  {
    name: "Spec Librarian",
    slug: "spec-librarian",
    description:
      "Keeps specs honest: links every new spec to the ADRs and domain notes it touches, and files a follow-up when a spec contradicts a recorded decision.",
    tools: ["hybrid_retrieval", "search_decisions", "read_blueprint_section"],
    model_role: "workhorse-cheap",
    status: "active",
  },
];

/* ------------------------------------------------------- deterministic rng */

/** Deterministic hex string from an integer seed (tiny LCG, no Math.random). */
function shaHex(seed: number, len: number): string {
  let s = (seed * 2654435761) >>> 0;
  let out = "";
  while (out.length < len) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out += s.toString(16).padStart(8, "0");
  }
  return out.slice(0, len);
}

/* ------------------------------------------------------------ rename pass */

/** Ordered string rewrites: org rename first, then cast renames, then the
 *  email-local remaps (which run after lumen.dev -> meridian.dev). */
const RENAME_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["Lumen", "Meridian"],
  ["LUMEN", "MERIDIAN"],
  ["lumen", "meridian"],
  ["Avi Patel", "Dev Patel"],
  ["Priya Shah", "Priya Nair"],
  ["Jordan Chen", "Sara Kim"],
  ["Tomas Lind", "Arjun Mehta"],
  ["Dana Lin", "Rohan Iyer"],
  ["Avi's", "Dev's"],
  ["Jordan's", "Sara's"],
  ["Tomas's", "Arjun's"],
  ["Dana's", "Rohan's"],
  ["Avi ", "Dev "],
  ["Jordan ", "Sara "],
  ["Tomas ", "Arjun "],
  ["Dana ", "Rohan "],
  ["avi@meridian.dev", "dev@meridian.dev"],
  ["jordan@meridian.dev", "sara@meridian.dev"],
  ["tomas@meridian.dev", "arjun@meridian.dev"],
  ["dana@meridian.dev", "rohan@meridian.dev"],
];

/** Id-bearing tokens that must NOT be renamed: handlers key Records by
 *  db.ORG_ID ("org_lumen", a const primitive binding we cannot reassign)
 *  and mcpRecentCalls is keyed by the seeded server id. Renaming these
 *  string VALUES while the record KEYS stay put would 404 the org
 *  knowledge / decisions / blueprint and MCP call-log lookups. */
const PROTECTED_TOKENS = ["org_lumen", "mcp_lumen_triage"] as const;

const sentinel = (i: number): string => String.fromCharCode(0) + String(i) + String.fromCharCode(0);

function renameText(input: string): string {
  let out = input;
  for (let i = 0; i < PROTECTED_TOKENS.length; i++) {
    const token = PROTECTED_TOKENS[i];
    if (token && out.includes(token)) {
      out = out.split(token).join(sentinel(i));
    }
  }
  for (const [from, to] of RENAME_PAIRS) {
    if (out.includes(from)) out = out.split(from).join(to);
  }
  for (let i = 0; i < PROTECTED_TOKENS.length; i++) {
    const token = PROTECTED_TOKENS[i];
    if (token && out.includes(sentinel(i))) {
      out = out.split(sentinel(i)).join(token);
    }
  }
  return out;
}

/** Walk a fixture object graph and rewrite every string value in place. */
function deepRename(value: unknown, seen: WeakSet<object>): void {
  if (!value || typeof value !== "object") return;
  const obj = value as object;
  if (seen.has(obj)) return;
  seen.add(obj);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const v: unknown = value[i];
      if (typeof v === "string") value[i] = renameText(v);
      else deepRename(v, seen);
    }
    return;
  }
  const rec = value as Record<string, unknown>;
  for (const k of Object.keys(rec)) {
    const v = rec[k];
    if (typeof v === "string") rec[k] = renameText(v);
    else deepRename(v, seen);
  }
}

/* -------------------------------------------------------------- repo plan */

const CAST_IDS = ["u_maya", "u_avi", "u_priya", "u_jordan", "u_tomas"] as const;

interface DomainRepoPlan {
  domainId: string;
  curated: string[];
  fillerPrefix: string;
  fillerCount: number;
}

/** 301 new attachments + the 11 seeded ones = 312 repos org-wide.
 *  Per-domain totals: Payments 60, Identity 36, Data 40, Notifications 24,
 *  Ledger 36, Web 44, Mobile 28, Infra 44. */
const REPO_PLAN: readonly DomainRepoPlan[] = [
  {
    domainId: "dom_billing", // Payments (3 seeded + 57)
    curated: [
      "settlement-service", "reconciliation-engine", "refunds-api", "webhook-gateway",
      "payouts-service", "card-issuing-api", "fraud-scoring", "fx-rates-service",
      "dispute-center", "merchant-onboarding", "invoicing-api", "statement-generator",
      "payment-links", "checkout-sdk", "terminal-bridge", "chargeback-worker",
      "ach-processor", "upi-gateway", "settlement-batch", "pricing-engine",
    ],
    fillerPrefix: "bank-connector",
    fillerCount: 37,
  },
  {
    domainId: "dom_platform", // Identity (3 seeded + 33)
    curated: [
      "kyc-service", "aml-screening", "auth-gateway", "session-service",
      "permissions-engine", "org-directory", "scim-bridge", "sso-proxy",
      "device-trust", "audit-vault",
    ],
    fillerPrefix: "identity-module",
    fillerCount: 23,
  },
  {
    domainId: "dom_ledger", // Ledger (36)
    curated: [
      "ledger-core", "ledger-api", "double-entry-engine", "balance-snapshots",
      "journal-ingest", "gl-export", "reconciliation-jobs", "treasury-sync",
      "interest-engine", "fee-ledger",
    ],
    fillerPrefix: "ledger-shard",
    fillerCount: 26,
  },
  {
    domainId: "dom_inbox", // Notifications (3 seeded + 21)
    curated: [
      "notifications-hub", "email-render", "sms-router", "push-gateway",
      "digest-composer", "template-studio", "webhook-fanout", "comms-prefs",
    ],
    fillerPrefix: "notif-channel",
    fillerCount: 13,
  },
  {
    domainId: "dom_data", // Data Platform (2 seeded + 38)
    curated: [
      "warehouse-models", "event-collector", "feature-store", "metrics-catalog",
      "stream-router", "cdc-pipe", "quality-monitor", "ml-scoring",
    ],
    fillerPrefix: "data-pipeline",
    fillerCount: 30,
  },
  {
    domainId: "dom_web", // Web (44)
    curated: [
      "web-dashboard", "merchant-portal", "admin-console", "docs-site",
      "marketing-site", "onboarding-flow", "design-system", "charts-kit",
    ],
    fillerPrefix: "web-app",
    fillerCount: 36,
  },
  {
    domainId: "dom_mobile", // Mobile (28)
    curated: [
      "mobile-wallet-ios", "mobile-wallet-android", "merchant-app-ios",
      "merchant-app-android", "mobile-core", "push-kit", "mobile-design-kit",
      "biometrics-kit",
    ],
    fillerPrefix: "mobile-module",
    fillerCount: 20,
  },
  {
    domainId: "dom_infra", // Infra (44)
    curated: [
      "infra-terraform", "k8s-manifests", "ci-pipelines", "secrets-broker",
      "observability-stack", "service-mesh-config", "edge-proxy", "backup-jobs",
    ],
    fillerPrefix: "infra-module",
    fillerCount: 36,
  },
];

let repoSeq = 0;
/** Generated film repos by bare name (no meridian/ prefix). */
const filmReposByName = new Map<string, DomainRepo>();

function makeRepo(domainId: string, name: string): DomainRepo {
  repoSeq += 1;
  const id = `repo_f${String(repoSeq).padStart(3, "0")}`;
  const sha = shaHex(repoSeq * 7919 + 17, 12);
  const createdAt = new Date(
    Date.UTC(2026, 5, 1, 9, 0, 0) + repoSeq * 90_000,
  ).toISOString();
  const row: DomainRepo = {
    id,
    repo_id: id,
    domain_id: domainId,
    integration_id: "int_github",
    repo_full_name: `meridian/${name}`,
    default_branch: "main",
    attached_by_user_id: CAST_IDS[repoSeq % CAST_IDS.length] ?? "u_maya",
    created_at: createdAt,
    branch_head_sha: sha,
    last_indexed_sha: sha,
    last_sync_attempt_at: "2026-06-28T08:00:00Z",
    current_sync_stage: "completed",
    commits_behind: repoSeq % 37 === 0 ? 3 : 0,
  };
  filmReposByName.set(name, row);
  return row;
}

/* ------------------------------------------------------------- helpers */

/** Narrow escape hatch: MockIntegration's status union has no
 *  "disconnected", but the integrations page's wire type does. */
function forceIntegrationStatus(row: db.MockIntegration, status: string): void {
  (row as { status: string }).status = status;
}

function findIntegration(provider: string): db.MockIntegration | undefined {
  const p = provider.toLowerCase();
  return db.integrations.find(
    (i) =>
      i.provider === p ||
      i.id === p ||
      i.id === `int_${p}` ||
      i.name.toLowerCase() === p,
  );
}

function setMember(
  userId: string,
  patch: Partial<Pick<(typeof db.members)[number], "display_name" | "email" | "role">>,
): void {
  const row = db.members.find((u) => u.user_id === userId);
  if (row) Object.assign(row, patch);
}

function patchDomain(
  id: string,
  patch: Partial<Pick<db.MockDomain, "name" | "slug" | "description" | "repos" | "last_activity">>,
): void {
  const row = db.domains.find((d) => d.id === id);
  if (row) Object.assign(row, patch);
}

function scaleDomainKnowledge(
  id: string,
  patch: {
    nodes_total: number;
    nodes_by_kind: Record<string, number>;
    edges_total: number;
    repos_indexed: number;
    decision_records: number;
    domain_concepts: number;
  },
): void {
  const k = db.domainKnowledge[id];
  if (k) Object.assign(k, patch);
}

function minimalDomainKnowledge(
  id: string,
  patch: {
    nodes_total: number;
    nodes_by_kind: Record<string, number>;
    edges_total: number;
    repos_indexed: number;
    decision_records: number;
    domain_concepts: number;
    top_entities: db.MockDomainKnowledge["top_entities"];
    overlay_terms: db.MockDomainKnowledge["overlay_terms"];
    recent_changes: db.MockDomainKnowledge["recent_changes"];
  },
): void {
  db.domainKnowledge[id] = {
    domain_id: id,
    ingestion_status: "fresh",
    last_ingested_at: "38m ago",
    ...patch,
  };
}

/** Clone a seeded rich RepoKnowledge row onto a film repo so its detail
 *  page renders fully. JSON clone: the fixture rows are plain data. */
function cloneRepoKnowledge(
  srcKey: string,
  domainId: string,
  bareName: string,
  summary: string,
): void {
  const src = db.repoKnowledge[srcKey];
  const repo = filmReposByName.get(bareName);
  if (!src || !repo) return;
  const rid = repo.repo_id ?? repo.id;
  const clone = JSON.parse(JSON.stringify(src)) as db.MockRepoKnowledge;
  clone.repo_id = rid;
  clone.repo_full_name = `meridian/${bareName}`;
  clone.summary = summary;
  clone.last_indexed_sha = repo.last_indexed_sha ?? null;
  clone.branch_head_sha = repo.branch_head_sha ?? null;
  db.repoKnowledge[`${domainId}::${rid}`] = clone;
}

/* -------------------------------------------------------------- fixture */

let applied = false;

/** Mutate the mock db into the Meridian Systems film org. Idempotent. */
export function applyFilmFixture(): void {
  if (applied || db.orgs[0]?.name === FILM_ORG) {
    applied = true;
    return;
  }
  applied = true;

  /* 1 - global Lumen -> Meridian + cast rename over every narrative surface. */
  const seen = new WeakSet<object>();
  const renameTargets: unknown[] = [
    db.orgs, db.me, db.members, db.invitations, db.emailDomains, db.ssoConfig,
    db.domains, db.domainRepos, db.integrations, db.mcpServers, db.mcpRecentCalls,
    db.auditEvents, db.apiTokens, db.modelProviders, db.providerUsageByModelProviderId,
    db.privacySettings, db.inboxItems, db.costData, db.skills, db.skillDetails,
    db.activity, db.chatThreads, db.knowledgeNodes, db.knowledgeEdges,
    db.domainKnowledge, db.repoKnowledge, db.orgKnowledge, db.rules,
    db.domainResources, db.designSystems, db.domainConfigs, db.domainNotes,
    db.blueprints, db.onboardingState, db.orgOperations, db.orgDecisions,
    db.domainMembers, db.domainDecisions, db.tierTrees,
  ];
  for (const target of renameTargets) deepRename(target, seen);

  /* 2 - org identity. */
  const org = db.orgs[0];
  if (org) {
    org.name = FILM_ORG;
    org.display_name = FILM_ORG;
    org.slug = "meridian-systems";
    org.verified_domains = ["meridian.dev"];
  }
  db.me.display_name = "Maya Rao";
  db.me.email = "maya@meridian.dev";
  db.me.org_name = FILM_ORG;
  const membership = db.me.memberships[0];
  if (membership) {
    membership.org_name = FILM_ORG;
    membership.org_slug = "meridian-systems";
  }

  /* 3 - cast. deepRename already renamed display names + emails; pin roles
   *     and emails explicitly so the members page matches FILM_CAST. */
  setMember("u_maya",   { display_name: "Maya Rao",    email: "maya@meridian.dev",  role: "admin" });
  setMember("u_priya",  { display_name: "Priya Nair",  email: "priya@meridian.dev", role: "ws_admin" });
  setMember("u_avi",    { display_name: "Dev Patel",   email: "dev@meridian.dev",   role: "engineer" });
  setMember("u_jordan", { display_name: "Sara Kim",    email: "sara@meridian.dev",  role: "engineer" });
  setMember("u_tomas",  { display_name: "Arjun Mehta", email: "arjun@meridian.dev", role: "engineer" });
  setMember("u_dana",   { display_name: "Rohan Iyer",  email: "rohan@meridian.dev", role: "reviewer" });

  /* 4 - domains: rename the four seeded ones, add four more (8 total). */
  patchDomain("dom_billing",  { name: "Payments",      slug: "payments",      description: "Money movement end to end: settlement, refunds, reconciliation, payouts, and the webhook edge. Owns the processor integrations and the $5k ACH floor." });
  patchDomain("dom_platform", { name: "Identity",      slug: "identity",      description: "KYC/AML, auth, sessions, RBAC, SCIM, and workspace state. The keystone every authenticated call passes through." });
  patchDomain("dom_inbox",    { name: "Notifications", slug: "notifications", description: "Customer and merchant comms: email, SMS, push, webhooks, digests, and per-channel preference routing." });
  patchDomain("dom_data",     { description: "Lake to warehouse to mart. Owns event collection, the metrics catalog, freshness SLAs, and the feature store." });

  const newDomains: db.MockDomain[] = [
    { id: "dom_ledger", org_id: db.ORG_ID, slug: "ledger", name: "Ledger",
      description: "The double-entry core: journals, balances, GL export, and treasury sync. Every money movement lands here exactly once.",
      created_by_user_id: "u_avi", archived_at: null, created_at: "2026-05-06T09:00:00Z",
      emblem: "rose", icon: "list-tree", repos: 36, open_tasks: 1, domain_notes: 11, last_activity: "22m ago" },
    { id: "dom_web", org_id: db.ORG_ID, slug: "web", name: "Web",
      description: "Merchant-facing web: dashboard, portal, onboarding, docs, and the shared design system.",
      created_by_user_id: "u_jordan", archived_at: null, created_at: "2026-05-06T09:05:00Z",
      emblem: "mint", icon: "star", repos: 44, open_tasks: 2, domain_notes: 8, last_activity: "1h ago" },
    { id: "dom_mobile", org_id: db.ORG_ID, slug: "mobile", name: "Mobile",
      description: "Wallet and merchant apps on iOS and Android, plus the shared mobile core and push kit.",
      created_by_user_id: "u_dana", archived_at: null, created_at: "2026-05-06T09:10:00Z",
      emblem: "violet", icon: "circle", repos: 28, open_tasks: 0, domain_notes: 6, last_activity: "3h ago" },
    { id: "dom_infra", org_id: db.ORG_ID, slug: "infra", name: "Infra",
      description: "Terraform, Kubernetes, CI, secrets, and the observability stack shared by every other domain.",
      created_by_user_id: "u_tomas", archived_at: null, created_at: "2026-05-06T09:15:00Z",
      emblem: "cyan", icon: "git-branch", repos: 44, open_tasks: 1, domain_notes: 7, last_activity: "yesterday" },
  ];
  for (const d of newDomains) {
    if (!db.domains.some((x) => x.id === d.id)) db.domains.push(d);
  }

  /* 5 - repos at scale: 301 generated attachments -> 312 org-wide. */
  for (const plan of REPO_PLAN) {
    const list = (db.domainRepos[plan.domainId] ??= []);
    for (const name of plan.curated) list.push(makeRepo(plan.domainId, name));
    for (let n = 1; n <= plan.fillerCount; n++) {
      list.push(makeRepo(plan.domainId, `${plan.fillerPrefix}-${String(n).padStart(2, "0")}`));
    }
  }

  /* 6 - rich detail for the flagship film repos (the rest are list rows). */
  cloneRepoKnowledge("dom_billing::repo_b1", "dom_billing", "settlement-service",
    "meridian/settlement-service - the same-day settlement engine. Batches captured payments into settlement windows, drives the payout rails, and emits settlement.completed events the ledger consumes.");
  cloneRepoKnowledge("dom_billing::repo_b3", "dom_billing", "reconciliation-engine",
    "meridian/reconciliation-engine - three-way reconciliation between processor reports, the ledger, and bank statements. Flags drift into the reconciliation queue.");
  cloneRepoKnowledge("dom_billing::repo_b1", "dom_billing", "refunds-api",
    "meridian/refunds-api - refund intake and orchestration. Same-day refund settlement (FEAT-12) lands refunds inside the current settlement window instead of T+2.");
  cloneRepoKnowledge("dom_inbox::repo_n2", "dom_billing", "webhook-gateway",
    "meridian/webhook-gateway - the inbound processor-webhook edge. HMAC verification, idempotency keys, replay protection, and fan-out to domain topics.");
  cloneRepoKnowledge("dom_billing::repo_b1", "dom_ledger", "ledger-core",
    "meridian/ledger-core - the double-entry ledger. Append-only journals, balance snapshots, and the invariant checker that blocks unbalanced postings.");
  cloneRepoKnowledge("dom_platform::repo_p1", "dom_platform", "kyc-service",
    "meridian/kyc-service - merchant KYC/AML orchestration. Document checks, sanctions screening, and the re-verification flow for dormant merchants.");
  cloneRepoKnowledge("dom_inbox::repo_n2", "dom_inbox", "notifications-hub",
    "meridian/notifications-hub - the comms router. Consumes domain events, resolves per-channel preferences, and dispatches email / SMS / push / webhooks.");
  cloneRepoKnowledge("dom_inbox::repo_n1", "dom_web", "web-dashboard",
    "meridian/web-dashboard - the merchant dashboard. Next.js 15 console for payments, refunds, settlement views, and the FEAT-12 same-day refund surface.");

  /* 7 - domain knowledge at Meridian scale (existing four, then new four). */
  scaleDomainKnowledge("dom_billing", {
    nodes_total: 9846,
    nodes_by_kind: { service: 74, module: 1130, function: 5216, class: 862, config: 512, document: 431, test: 1621 },
    edges_total: 41_230, repos_indexed: 60, decision_records: 412, domain_concepts: 118,
  });
  scaleDomainKnowledge("dom_inbox", {
    nodes_total: 4270,
    nodes_by_kind: { service: 38, module: 486, function: 2214, class: 402, config: 168, document: 154, test: 808 },
    edges_total: 17_840, repos_indexed: 24, decision_records: 241, domain_concepts: 64,
  });
  scaleDomainKnowledge("dom_data", {
    nodes_total: 5118,
    nodes_by_kind: { service: 41, module: 592, function: 2688, class: 396, config: 262, document: 197, test: 942 },
    edges_total: 20_112, repos_indexed: 40, decision_records: 298, domain_concepts: 77,
  });
  scaleDomainKnowledge("dom_platform", {
    nodes_total: 6431,
    nodes_by_kind: { service: 52, module: 741, function: 3369, class: 517, config: 386, document: 240, test: 1126 },
    edges_total: 25_476, repos_indexed: 36, decision_records: 357, domain_concepts: 89,
  });
  minimalDomainKnowledge("dom_ledger", {
    nodes_total: 7910,
    nodes_by_kind: { service: 61, module: 902, function: 4222, class: 688, config: 371, document: 305, test: 1361 },
    edges_total: 31_280, repos_indexed: 36, decision_records: 402, domain_concepts: 96,
    top_entities: [
      { id: "ld1", name: "ledger-core",        kind: "service",  path: "services/ledger-core",              importance: 0.97, description: "The double-entry core. Every money movement posts here exactly once.", repo: "meridian/ledger-core" },
      { id: "ld2", name: "PostingEngine",      kind: "class",    path: "ledger-core/src/posting/engine.py", importance: 0.93, description: "Validates and applies journal postings; rejects unbalanced entries.", repo: "meridian/ledger-core" },
      { id: "ld3", name: "balance_snapshots",  kind: "db_table", path: "ledger-core/db/models.py",          importance: 0.86, description: "Hourly balance snapshots read by settlement and reconciliation.", repo: "meridian/balance-snapshots" },
    ],
    overlay_terms: [
      { term: "double-entry invariant", confidence: 0.94, matched_node_ids: ["ld2", "ld1"], matched_node_labels: ["PostingEngine", "ledger-core"], extracted_from: { resource_id: "res_ld1", line_range: "L4-L30" } },
    ],
    recent_changes: [
      { when: "22m ago", repo: "meridian/ledger-core",        summary: "Same-day refund postings (FEAT-12): refunds settle inside the current window.", nodes_affected: 9, change_class: "material" },
      { when: "2d ago",  repo: "meridian/balance-snapshots",  summary: "Snapshot compaction moved to hourly rollups.",                                   nodes_affected: 4, change_class: "minor" },
    ],
  });
  minimalDomainKnowledge("dom_web", {
    nodes_total: 6540,
    nodes_by_kind: { service: 33, module: 861, function: 3407, class: 598, config: 331, document: 262, test: 1048 },
    edges_total: 24_966, repos_indexed: 44, decision_records: 288, domain_concepts: 71,
    top_entities: [
      { id: "wb1", name: "web-dashboard",   kind: "service", path: "apps/web-dashboard",              importance: 0.95, description: "The merchant console. Payments, refunds, and settlement views.", repo: "meridian/web-dashboard" },
      { id: "wb2", name: "merchant-portal", kind: "service", path: "apps/merchant-portal",            importance: 0.88, description: "Self-serve onboarding and account management.", repo: "meridian/merchant-portal" },
      { id: "wb3", name: "design-system",   kind: "module",  path: "packages/design-system",          importance: 0.82, description: "Shared tokens + components consumed by every web surface.", repo: "meridian/design-system" },
    ],
    overlay_terms: [
      { term: "settlement view", confidence: 0.9, matched_node_ids: ["wb1"], matched_node_labels: ["web-dashboard"], extracted_from: { resource_id: "res_wb1", line_range: "L10-L44" } },
    ],
    recent_changes: [
      { when: "1h ago", repo: "meridian/web-dashboard", summary: "FEAT-12 refund timeline card shipped to the payments detail page.", nodes_affected: 7, change_class: "material" },
    ],
  });
  minimalDomainKnowledge("dom_mobile", {
    nodes_total: 3822,
    nodes_by_kind: { service: 18, module: 468, function: 2011, class: 402, config: 197, document: 122, test: 604 },
    edges_total: 14_205, repos_indexed: 28, decision_records: 176, domain_concepts: 44,
    top_entities: [
      { id: "mb1", name: "mobile-wallet-ios", kind: "service", path: "apps/mobile-wallet-ios",  importance: 0.92, description: "Consumer wallet on iOS. Shares mobile-core with Android.", repo: "meridian/mobile-wallet-ios" },
      { id: "mb2", name: "mobile-core",       kind: "module",  path: "packages/mobile-core",    importance: 0.87, description: "Shared networking, auth, and offline queue for both apps.", repo: "meridian/mobile-core" },
    ],
    overlay_terms: [
      { term: "offline queue", confidence: 0.85, matched_node_ids: ["mb2"], matched_node_labels: ["mobile-core"], extracted_from: { resource_id: "res_mb1", line_range: "L2-L28" } },
    ],
    recent_changes: [
      { when: "3h ago", repo: "meridian/mobile-core", summary: "Retry budget added to the offline posting queue.", nodes_affected: 5, change_class: "minor" },
    ],
  });
  minimalDomainKnowledge("dom_infra", {
    nodes_total: 4277,
    nodes_by_kind: { service: 24, module: 517, function: 1966, class: 214, config: 861, document: 262, test: 433 },
    edges_total: 15_013, repos_indexed: 44, decision_records: 226, domain_concepts: 58,
    top_entities: [
      { id: "inf1", name: "infra-terraform",     kind: "config",  path: "infra-terraform/root",          importance: 0.94, description: "Terraform root. Per-env tfvars shared by every service.", repo: "meridian/infra-terraform" },
      { id: "inf2", name: "observability-stack", kind: "service", path: "services/observability-stack",  importance: 0.85, description: "Metrics, traces, and the paging rules every domain inherits.", repo: "meridian/observability-stack" },
    ],
    overlay_terms: [
      { term: "golden paging rules", confidence: 0.82, matched_node_ids: ["inf2"], matched_node_labels: ["observability-stack"], extracted_from: { resource_id: "res_if1", line_range: "L6-L40" } },
    ],
    recent_changes: [
      { when: "yesterday", repo: "meridian/k8s-manifests", summary: "Settlement workers moved to a dedicated node pool ahead of FEAT-12 launch.", nodes_affected: 6, change_class: "minor" },
    ],
  });

  /* 8 - per-domain config + membership rows for the new domains. */
  const stdModels = {
    spec: "claude-opus-4-7", plan: "claude-opus-4-7", implement: "claude-sonnet-4-6",
    review: "claude-opus-4-7", ci: "claude-haiku-4-5", pr: "claude-haiku-4-5",
  };
  const newDomainConfigs: Record<string, db.MockDomainConfig> = {
    dom_ledger: { models: { ...stdModels }, skills: [], review_policy: { spec_approvers: 2, review_approvers: 2, ci_must_pass: true, auto_merge: false }, context_repos: ["ledger-core", "ledger-api", "double-entry-engine"] },
    dom_web:    { models: { ...stdModels }, skills: [], review_policy: { spec_approvers: 1, review_approvers: 1, ci_must_pass: true, auto_merge: false }, context_repos: ["web-dashboard", "merchant-portal", "design-system"] },
    dom_mobile: { models: { ...stdModels }, skills: [], review_policy: { spec_approvers: 1, review_approvers: 1, ci_must_pass: true, auto_merge: false }, context_repos: ["mobile-core", "mobile-wallet-ios", "mobile-wallet-android"] },
    dom_infra:  { models: { ...stdModels }, skills: [], review_policy: { spec_approvers: 1, review_approvers: 2, ci_must_pass: true, auto_merge: false }, context_repos: ["infra-terraform", "k8s-manifests", "ci-pipelines"] },
  };
  for (const [capId, cfg] of Object.entries(newDomainConfigs)) {
    if (!db.domainConfigs[capId]) db.domainConfigs[capId] = cfg;
    if (!db.domainMembers[capId]) {
      db.domainMembers[capId] = [
        { id: `cm_${capId}_1`, domain_id: capId, user_id: "u_maya", role: "admin", joined_at: "2026-05-06T09:20:00Z", added_by_user_id: "u_maya", deactivated_at: null },
      ];
    }
  }

  /* 9 - org knowledge rollup: 8 domains, film-scale totals. The /knowledge
   *     topology header reads these display fields; the rendered graph
   *     arrays (knowledgeNodes/Edges) stay small and sane on purpose. */
  const orgK = db.orgKnowledge[db.ORG_ID];
  if (orgK) {
    orgK.domains.splice(0, orgK.domains.length,
      { id: "dom_billing",  slug: "payments",      name: "Payments",      lead_user_id: "u_avi",    repos_indexed: 60, open_tasks: 3, nodes_total: 9846, decisions: 412, ingestion_status: "fresh", material_changes_7d: 14 },
      { id: "dom_ledger",   slug: "ledger",        name: "Ledger",        lead_user_id: "u_avi",    repos_indexed: 36, open_tasks: 1, nodes_total: 7910, decisions: 402, ingestion_status: "fresh", material_changes_7d: 9 },
      { id: "dom_platform", slug: "identity",      name: "Identity",      lead_user_id: "u_tomas",  repos_indexed: 36, open_tasks: 2, nodes_total: 6431, decisions: 357, ingestion_status: "fresh", material_changes_7d: 7 },
      { id: "dom_web",      slug: "web",           name: "Web",           lead_user_id: "u_jordan", repos_indexed: 44, open_tasks: 2, nodes_total: 6540, decisions: 288, ingestion_status: "fresh", material_changes_7d: 11 },
      { id: "dom_data",     slug: "data-platform", name: "Data Platform", lead_user_id: "u_priya",  repos_indexed: 40, open_tasks: 1, nodes_total: 5118, decisions: 298, ingestion_status: "fresh", material_changes_7d: 6 },
      { id: "dom_infra",    slug: "infra",         name: "Infra",         lead_user_id: "u_tomas",  repos_indexed: 44, open_tasks: 1, nodes_total: 4277, decisions: 226, ingestion_status: "fresh", material_changes_7d: 4 },
      { id: "dom_inbox",    slug: "notifications", name: "Notifications", lead_user_id: "u_jordan", repos_indexed: 24, open_tasks: 1, nodes_total: 4270, decisions: 241, ingestion_status: "fresh", material_changes_7d: 5 },
      { id: "dom_mobile",   slug: "mobile",        name: "Mobile",        lead_user_id: "u_dana",   repos_indexed: 28, open_tasks: 0, nodes_total: 3822, decisions: 176, ingestion_status: "fresh", material_changes_7d: 3 },
    );
    orgK.totals.nodes = 48_214;
    orgK.totals.edges = 189_632;
    orgK.totals.repos = 312;
    orgK.totals.decisions = 3400;
    orgK.totals.open_questions = 57;
    const settlement = filmReposByName.get("settlement-service");
    const refunds = filmReposByName.get("refunds-api");
    const ledgerCore = filmReposByName.get("ledger-core");
    const dashboard = filmReposByName.get("web-dashboard");
    if (settlement && refunds && ledgerCore && dashboard) {
      orgK.cross_repo_edges.total = 1284;
      orgK.cross_repo_edges.by_kind.splice(0, orgK.cross_repo_edges.by_kind.length,
        { kind: "consumes_api",       count: 862 },
        { kind: "consumes_event",     count: 297 },
        { kind: "depends_on_package", count: 125 },
      );
      orgK.cross_repo_edges.connections.splice(0, orgK.cross_repo_edges.connections.length,
        { src_repo_id: dashboard.id,  src_repo: "meridian/web-dashboard",  dst_repo_id: refunds.id,    dst_repo: "meridian/refunds-api",        kind: "consumes_api",       count: 86 },
        { src_repo_id: refunds.id,    src_repo: "meridian/refunds-api",    dst_repo_id: settlement.id, dst_repo: "meridian/settlement-service", kind: "consumes_event",     count: 41 },
        { src_repo_id: settlement.id, src_repo: "meridian/settlement-service", dst_repo_id: ledgerCore.id, dst_repo: "meridian/ledger-core",    kind: "depends_on_package", count: 23 },
      );
    }
  }

  /* 10 - integrations: rows for all 11 catalog providers. GitHub connected,
   *      the rest present-but-disconnected so scenes flip them one by one. */
  const providerToRowId: ReadonlyArray<readonly [string, string]> = [
    ["github", "int_github"], ["gitlab", "int_gitlab"], ["bitbucket", "int_bitbucket"],
    ["jira", "int_jira"], ["linear", "int_linear"], ["asana", "int_asana"],
    ["azure_devops", "int_azure_devops"], ["slack", "int_slack"], ["figma", "int_figma"],
    ["notion", "int_notion"], ["confluence", "int_confluence"],
  ];
  for (const [provider, rowId] of providerToRowId) {
    const row = db.integrations.find((i) => i.id === rowId);
    if (!row) continue;
    row.provider = provider;
    if (provider === "github") {
      row.status = "active";
      row.connected_as = "meridian (org-admin)";
      row.scope = {
        kind: "repos",
        count: 312,
        preview: ["meridian/settlement-service", "meridian/ledger-core", "meridian/web-dashboard"],
        more: 309,
      };
      row.config = { connect_kind: "app", account_login: "meridian" };
      row.last_sync = "4m ago";
    } else {
      forceIntegrationStatus(row, "disconnected");
      delete row.connected_as;
      delete row.connected_at;
      delete row.last_sync;
      delete row.scope;
    }
  }

  /* 11 - model providers: Anthropic keyed (…A1B4) + OpenAI already keyed. */
  setProviderKeyed("mp_anthropic_direct", "A1B4");

  /* 12 - cost: 8-domain split, FEAT-12 in top tasks, film repo ingest rows. */
  db.costData.spend_by_domain.splice(0, db.costData.spend_by_domain.length,
    { id: "dom_billing",  name: "Payments",      usd: 1835, pct: 0.24, budget: 2600, trend: "+21%", top_task: "FEAT-12 Same-day refund settlement" },
    { id: "dom_ledger",   name: "Ledger",        usd: 1299, pct: 0.17, budget: 1900, trend: "+12%", top_task: "Ledger snapshot compaction" },
    { id: "dom_platform", name: "Identity",      usd: 1070, pct: 0.14, budget: 1600, trend: "+9%",  top_task: "KYC re-verification flow" },
    { id: "dom_data",     name: "Data Platform", usd: 994,  pct: 0.13, budget: 1500, trend: "+26%", top_task: "Settlement mart backfill" },
    { id: "dom_inbox",    name: "Notifications", usd: 764,  pct: 0.10, budget: 1200, trend: "+6%",  top_task: "Digest composer revamp" },
    { id: "dom_web",      name: "Web",           usd: 688,  pct: 0.09, budget: 1100, trend: "+15%", top_task: "Refund timeline card" },
    { id: "dom_mobile",   name: "Mobile",        usd: 459,  pct: 0.06, budget: 800,  trend: "-4%",  top_task: "Offline queue retry budget" },
    { id: "dom_infra",    name: "Infra",         usd: 535,  pct: 0.07, budget: 900,  trend: "+3%",  top_task: "Settlement node pool" },
  );
  db.costData.top_tasks.splice(0, db.costData.top_tasks.length,
    { id: "tsk_101",    title: "Reconciliation drift alerts for settlement batches", usd: 412, runs: 9, last_used: "38m ago" },
    { id: "tsk_102",    title: "KYC re-verification flow for dormant merchants",     usd: 287, runs: 7, last_used: "3h ago" },
    { id: "tsk_103",    title: "Webhook gateway retry-storm hardening",              usd: 201, runs: 5, last_used: "yesterday" },
    { id: "tsk_104",    title: "Ledger snapshot compaction - expand/contract",       usd: 154, runs: 8, last_used: "2d ago" },
    { id: "tsk_feat12", title: "FEAT-12 Same-day refund settlement",                 usd: 4.8, runs: 6, last_used: "2h ago" },
  );
  const settlementRepo = filmReposByName.get("settlement-service");
  const ledgerRepo = filmReposByName.get("ledger-core");
  const dashboardRepo = filmReposByName.get("web-dashboard");
  if (settlementRepo && ledgerRepo && dashboardRepo) {
    db.costData.spend_by_repo.splice(0, db.costData.spend_by_repo.length,
      { repo_id: settlementRepo.id, name: "meridian/settlement-service", usd: 186, pct: 0.024, calls: 742, prompt_tokens: 5_940_000, completion_tokens: 1_310_000, last_used: "2026-06-28" },
      { repo_id: ledgerRepo.id,     name: "meridian/ledger-core",        usd: 142, pct: 0.019, calls: 511, prompt_tokens: 4_120_000, completion_tokens: 880_000,   last_used: "2026-06-27" },
      { repo_id: dashboardRepo.id,  name: "meridian/web-dashboard",      usd: 54,  pct: 0.007, calls: 196, prompt_tokens: 1_480_000, completion_tokens: 240_000,   last_used: "2026-06-24" },
    );
  }
  db.activity.unshift({
    id: "a_feat12",
    dom_id: "dom_billing",
    who: "Athena", who_avatar: "AT", who_kind: "agent",
    text: "Closed <strong>FEAT-12 Same-day refund settlement</strong> - shipped across settlement-service, refunds-api, and web-dashboard. Total AI cost $4.80 across 2.1M tokens.",
    tech: "task.completed task=tsk_feat12 cost_usd=4.80 tokens=2100000",
    when: "2h ago",
    task_id: "tsk_feat12",
  });

  /* 13 - skills: add the film's named skill (the library already has 10). */
  if (!db.skills.some((s) => s.id === "skl_api_sweep")) {
    const sweep: db.MockSkill = {
      id: "skl_api_sweep", name: "API deprecation sweep", slug: "api-deprecation-sweep",
      version: "v1", status: "active",
      description: "Scans every plan and diff for calls into endpoints marked deprecated in the interface registry, and proposes the replacement route with a migration note.",
      icon: "refresh-cw", phases: ["plan", "review"],
      attached_domains: ["dom_billing", "dom_platform", "dom_web"],
      usage_count: 23, last_used: "1h ago",
    };
    db.skills.unshift(sweep);
    db.skillDetails["skl_api_sweep"] = {
      ...sweep,
      author: "Dev Patel",
      last_updated: "4 days ago",
      system_prompt: "You are the API deprecation auditor. For every plan or diff:\n1. Cross-check each outbound call against the deprecated-endpoints list.\n2. Propose the documented replacement route.\n3. Block merges that add NEW calls to deprecated endpoints.",
      knowledge_refs: [
        { kind: "doc", id: "interface-registry", title: "Interface registry" },
      ],
    };
  }

  /* 14 - design systems: the film's named system (origin: ai). */
  const tpl = getTemplate("midnight-saas");
  if (tpl && !db.designSystems.some((s) => s.id === "ds_meridian")) {
    db.designSystems.push({
      id: "ds_meridian",
      name: "Meridian Design Language",
      description: "The unified product language for Meridian's web and mobile surfaces. Generated by Athena from the dashboard's real tokens, then curated.",
      css: tpl.css,
      origin: "ai",
      updated_at: "2026-07-01T10:00:00Z",
      domain_ids: ["dom_web", "dom_billing"],
      components: db.designComponentsFromInput("ds_meridian", tpl.components),
    });
  }

  /* 15 - operations rollup + onboarding echoes of the new scale. */
  for (const step of db.onboardingState.steps) {
    if (step.id === "connect_scm") step.detail = "GitHub · 312 repos indexed";
    if (step.id === "create_domain") step.detail = "8 domains defined";
    if (step.id === "attach_repo") step.detail = "312 repos attached";
  }
  db.orgOperations.cost.top_caps.splice(0, db.orgOperations.cost.top_caps.length,
    { domain_id: "dom_billing",  domain_name: "Payments", spent_usd: 26.18 },
    { domain_id: "dom_ledger",   domain_name: "Ledger",   spent_usd: 19.04 },
    { domain_id: "dom_platform", domain_name: "Identity", spent_usd: 13.2 },
  );
  const ghOps = db.orgOperations.integrations.find((i) => i.id === "int_github");
  if (ghOps) {
    ghOps.label = "GitHub · meridian";
    ghOps.detail = "312 repos";
  }
  db.orgOperations.members.total = 7;
  db.orgOperations.members.by_role.splice(0, db.orgOperations.members.by_role.length,
    { role: "owner", count: 1 },
    { role: "admin", count: 1 },
    { role: "ws_admin", count: 1 },
    { role: "engineer", count: 3 },
    { role: "reviewer", count: 1 },
  );

  /* 16 - misc identity echoes. */
  const emailDomain = db.emailDomains[0];
  if (emailDomain) {
    emailDomain.domain = "meridian.dev";
    emailDomain.dns_txt_record_name = "_athena.meridian.dev";
  }
  db.ssoConfig.domains = ["meridian.dev"];

  /* 17 - film-only capability flags: the Agent + Tool registry (S16) needs
   *      the paid-tier flag + read permission so the sidebar shows the
   *      "Custom agents" nav row inside ShellScene / iframe realms. */
  db.me.features = { ...db.me.features, custom_agents: true };
  if (db.me.permissions && !db.me.permissions.includes("agents:read")) {
    db.me.permissions.push("agents:read");
  }

  /* 18 - scene bridge: expose the REAL sonner toast + fixture mutators to
   *      IframeScene steps (each iframe is its own realm; the step code runs
   *      in the film realm but calls through the iframe's contentWindow). */
  if (typeof window !== "undefined") {
    (window as FilmBridgeWindow).__film = {
      toast,
      setIntegrationStatus,
      setFilmUser,
      setProviderKeyed,
    };
  }
}

/** Window carrying the film bridge (set per realm by applyFilmFixture). */
export interface FilmBridgeWindow extends Window {
  __film?: {
    toast: typeof toast;
    setIntegrationStatus: typeof setIntegrationStatus;
    setFilmUser: typeof setFilmUser;
    setProviderKeyed: typeof setProviderKeyed;
  };
}

/* --------------------------------------------------------- scene helpers */

/** Swap the visible identity between scenes; the film calls this and then
 *  the app's refreshMe() so the TopBar re-reads /v1/me. */
export function setFilmUser(displayName: string, email: string): void {
  db.me.display_name = displayName;
  db.me.email = email;
}

/** Flip an integration row's lifecycle status at runtime (connect montage).
 *  `provider` accepts the catalog slug ("github"), the row id ("int_github"),
 *  or the display name. Connected-ish statuses also stamp display fields. */
export function setIntegrationStatus(provider: string, status: string): void {
  const row = findIntegration(provider);
  if (!row) return;
  forceIntegrationStatus(row, status);
  if (status === "connected" || status === "active") {
    row.connected_as = row.connected_as ?? `meridian (${row.name})`;
    row.connected_at = "just now";
    row.last_sync = "just now";
  }
  if (status === "disconnected" || status === "revoked") {
    delete row.connected_at;
    delete row.last_sync;
  }
}

/** Mark a model provider as keyed (BYO key saved) with the given last4.
 *  `providerId` accepts the row id ("mp_anthropic_direct") or the provider
 *  slug ("anthropic"). */
export function setProviderKeyed(providerId: string, last4: string): void {
  const row =
    db.modelProviders.find((p) => p.id === providerId) ??
    db.modelProviders.find((p) => p.provider === providerId);
  if (!row) return;
  row.has_api_key = true;
  row.api_key_last4 = last4;
}
