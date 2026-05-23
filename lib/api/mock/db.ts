/**
 * Mock database — the canonical demo dataset behind `NEXT_PUBLIC_API_MODE=mock`.
 *
 * Lumen, a fictional B2B AI-powered customer-support platform (Series A,
 * ~$8M ARR, ~14 engineers + ops), has been using Athena for ~3 weeks. Four
 * capabilities (Inbox, Billing, Data, Platform), 10 repos across FE/BE/data/
 * config, and exactly two precomputed exemplar tasks — one Implement task
 * (Stripe ACH) and one PRD task (Workspace snooze). The "New task" button
 * routes any user input into one of these two precomputed flows so reviewers
 * always land in a fully-populated demo.
 *
 * The shapes here mirror the typed response envelopes in `lib/api/client.ts`.
 * New endpoints (inbox, cost, integrations, settings) extend the surface via
 * the `Mock*` types exported below.
 */

import type {
  Capability,
  CapabilityRepo,
  DomainVerification,
  Invitation,
  Me,
  Member,
  Org,
  Run,
  AuditEvent,
  ApiTokenSummary,
  McpServer as ClientMcpServer,
  McpRecentCall as ClientMcpRecentCall,
  BriefSection,
  BriefSectionRevision,
  BriefSectionProposal,
  BriefToc,
  IntegrationScope,
  IntegrationConnectKind as ClientIntegrationConnectKind,
  RunClarification,
  RunDecisionRow,
} from "@/lib/api/client";

/* ------------------------------------------------------------------ identity */
export const ORG_ID = "org_lumen";
export const USER_ID = "u_maya";
export const SERVER_TIME = () => new Date().toISOString();

export const orgs: Org[] = [
  {
    id: ORG_ID,
    name: "Lumen",
    display_name: "Lumen",
    slug: "lumen",
    edition: "pro",
    verified_domains: ["lumen.dev"],
    auto_join_for_verified_domain: true,
    default_role_for_invite: "engineer",
    created_at: "2026-05-01T09:00:00Z",
  },
];

export const me: Me = {
  id: USER_ID,
  email: "maya@lumen.dev",
  display_name: "Maya Rao",
  avatar_url: null,
  is_employee: false,
  org_id: ORG_ID,
  org_name: "Lumen",
  role: "admin",
  server_time: SERVER_TIME(),
  memberships: [
    {
      org_id: ORG_ID,
      org_name: "Lumen",
      org_slug: "lumen",
      org_edition: "pro",
      role: "admin",
      is_owner: false,
    },
  ],
};

/* Lumen is a ~14-person Series A startup. Six teammates surface across the
 * demo (PR feedback, decision authors, sign-off threads, integration
 * connect-as). The remaining people are referenced through inbox digests and
 * activity items but don't need full Member rows. */
export const members: Member[] = [
  { user_id: USER_ID,    membership_id: "m_1", email: "maya@lumen.dev",   display_name: "Maya Rao",     avatar_url: null, role: "admin",    is_owner: false, joined_at: "2026-05-01T09:10:00Z", deactivated_at: null },
  { user_id: "u_owen",   membership_id: "m_2", email: "owen@lumen.dev",   display_name: "Owen Petrov",  avatar_url: null, role: "owner",    is_owner: true,  joined_at: "2026-05-01T08:00:00Z", deactivated_at: null },
  { user_id: "u_avi",    membership_id: "m_3", email: "avi@lumen.dev",    display_name: "Avi Patel",    avatar_url: null, role: "engineer", is_owner: false, joined_at: "2026-05-01T09:12:00Z", deactivated_at: null },
  { user_id: "u_priya",  membership_id: "m_4", email: "priya@lumen.dev",  display_name: "Priya Shah",   avatar_url: null, role: "engineer", is_owner: false, joined_at: "2026-05-03T14:20:00Z", deactivated_at: null },
  { user_id: "u_jordan", membership_id: "m_5", email: "jordan@lumen.dev", display_name: "Jordan Chen",  avatar_url: null, role: "pm",       is_owner: false, joined_at: "2026-05-02T11:30:00Z", deactivated_at: null },
  { user_id: "u_tomas",  membership_id: "m_6", email: "tomas@lumen.dev",  display_name: "Tomas Lind",   avatar_url: null, role: "admin",    is_owner: false, joined_at: "2026-05-04T08:00:00Z", deactivated_at: null },
  { user_id: "u_dana",   membership_id: "m_7", email: "dana@lumen.dev",   display_name: "Dana Lin",     avatar_url: null, role: "reviewer", is_owner: false, joined_at: "2026-05-05T10:00:00Z", deactivated_at: null },
];

export const invitations: Invitation[] = [
  { id: "inv_1", org_id: ORG_ID, email: "rachel@lumen.dev", role: "engineer", invited_by_user_id: USER_ID,  expires_at: "2026-06-22T00:00:00Z", accepted_at: null, revoked_at: null, created_at: "2026-05-20T10:00:00Z" },
  { id: "inv_2", org_id: ORG_ID, email: "kai@lumen.dev",    role: "pm",       invited_by_user_id: "u_owen", expires_at: "2026-06-21T00:00:00Z", accepted_at: null, revoked_at: null, created_at: "2026-05-19T15:30:00Z" },
];

export const domains: DomainVerification[] = [
  { id: "dom_1", domain: "lumen.dev", dns_txt_record_name: "_athena.lumen.dev", dns_txt_value: "athena-verify=ZxQ8KqM2nP", verified_at: "2026-05-02T11:00:00Z", last_checked_at: SERVER_TIME(), last_error: null },
];

/* ------------------------------------------------------------- capabilities */
export interface MockCapability extends Capability {
  emblem: "violet" | "cyan" | "amber" | "indigo" | "rose" | "mint";
}

/* Lumen ships four capabilities — chosen so the demo touches every shape of
 * code (FE, BE, data, infra/config). Each capability has 2–3 attached repos
 * that mirror the real prod cardinality of an early-Series-A SaaS startup:
 *   cap_inbox    → inbox-web (FE)        + inbox-svc (BE)    + triage-worker (ML)
 *   cap_billing  → billing-web (FE)      + billing-svc (BE)  + finance-pipeline (data)
 *   cap_data     → dbt-models (data)     + lake-ingest (data infra)
 *   cap_platform → admin-web (FE/admin)  + identity-svc (BE) + infra (config/IaC)
 */
export const capabilities: MockCapability[] = [
  { id: "cap_inbox",    org_id: ORG_ID, slug: "inbox",            name: "Inbox & Conversations", description: "Lumen's flagship surface — the unified support inbox where customer-team conversations land, get routed, and (since Q1) get AI-triaged. Owns conversation state, the routing rules engine, and the triage worker.", created_by_user_id: "u_avi",   archived_at: null, created_at: "2026-05-01T09:30:00Z", emblem: "cyan",   icon: "inbox",         repos: 3, open_tasks: 0, domain_notes: 22, last_activity: "12m ago"   },
  { id: "cap_billing",  org_id: ORG_ID, slug: "billing",          name: "Billing & Subscriptions", description: "Subscription pricing, invoicing, dunning, revenue recognition. Owns the Stripe integration end-to-end and the Snowflake → NetSuite revenue rollup.", created_by_user_id: USER_ID,    archived_at: null, created_at: "2026-05-01T09:35:00Z", emblem: "violet", icon: "circle-dollar", repos: 3, open_tasks: 1, domain_notes: 18, last_activity: "3h ago"    },
  { id: "cap_data",     org_id: ORG_ID, slug: "data-platform",    name: "Data Platform",        description: "Lake → warehouse → mart pipelines. Owns the dbt models, the freshness SLAs, and the metrics catalog every internal dashboard reads from.", created_by_user_id: "u_priya", archived_at: null, created_at: "2026-05-01T09:40:00Z", emblem: "indigo", icon: "database",       repos: 2, open_tasks: 0, domain_notes: 14, last_activity: "1h ago"    },
  { id: "cap_platform", org_id: ORG_ID, slug: "platform-identity",name: "Platform & Identity", description: "Cross-cutting infrastructure: SSO/SCIM, account & workspace state, RBAC, the admin console, and the IaC/CI configuration shared by every other capability.", created_by_user_id: "u_tomas", archived_at: null, created_at: "2026-05-01T09:45:00Z", emblem: "amber",  icon: "shield",         repos: 3, open_tasks: 1, domain_notes: 16, last_activity: "yesterday" },
];

export const capabilityRepos: Record<string, CapabilityRepo[]> = {
  cap_inbox: [
    { id: "repo_n1", capability_id: "cap_inbox",    integration_id: "int_github", repo_full_name: "lumen/inbox-web",        default_branch: "main", attached_by_user_id: "u_avi",    created_at: "2026-05-02T10:00:00Z" },
    { id: "repo_n2", capability_id: "cap_inbox",    integration_id: "int_github", repo_full_name: "lumen/inbox-svc",        default_branch: "main", attached_by_user_id: "u_avi",    created_at: "2026-05-02T10:01:00Z" },
    { id: "repo_n3", capability_id: "cap_inbox",    integration_id: "int_github", repo_full_name: "lumen/triage-worker",    default_branch: "main", attached_by_user_id: "u_priya",  created_at: "2026-05-02T10:02:00Z" },
  ],
  cap_billing: [
    { id: "repo_b1", capability_id: "cap_billing",  integration_id: "int_github", repo_full_name: "lumen/billing-svc",      default_branch: "main", attached_by_user_id: USER_ID,    created_at: "2026-05-02T10:10:00Z" },
    { id: "repo_b2", capability_id: "cap_billing",  integration_id: "int_github", repo_full_name: "lumen/billing-web",      default_branch: "main", attached_by_user_id: USER_ID,    created_at: "2026-05-02T10:11:00Z" },
    { id: "repo_b3", capability_id: "cap_billing",  integration_id: "int_github", repo_full_name: "lumen/finance-pipeline", default_branch: "main", attached_by_user_id: "u_jordan", created_at: "2026-05-02T10:12:00Z" },
  ],
  cap_data: [
    { id: "repo_d1", capability_id: "cap_data",     integration_id: "int_github", repo_full_name: "lumen/dbt-models",       default_branch: "main", attached_by_user_id: "u_priya",  created_at: "2026-05-03T11:00:00Z" },
    { id: "repo_d2", capability_id: "cap_data",     integration_id: "int_github", repo_full_name: "lumen/lake-ingest",      default_branch: "main", attached_by_user_id: "u_priya",  created_at: "2026-05-03T11:01:00Z" },
  ],
  cap_platform: [
    { id: "repo_p1", capability_id: "cap_platform", integration_id: "int_github", repo_full_name: "lumen/identity-svc",     default_branch: "main", attached_by_user_id: "u_tomas",  created_at: "2026-05-04T09:00:00Z" },
    { id: "repo_p2", capability_id: "cap_platform", integration_id: "int_github", repo_full_name: "lumen/admin-web",        default_branch: "main", attached_by_user_id: "u_tomas",  created_at: "2026-05-04T09:01:00Z" },
    { id: "repo_p3", capability_id: "cap_platform", integration_id: "int_github", repo_full_name: "lumen/infra",            default_branch: "main", attached_by_user_id: "u_tomas",  created_at: "2026-05-04T09:02:00Z" },
  ],
};

/* ----------------------------------------------------------- runs (== tasks) */
export interface MockRunPhaseStaleness {
  stale_since: string;
  upstream_doc_label: string;
  upstream_phase_key: string;
}

export interface MockRun extends Run {
  kind: "implement" | "prd";
  capability_id: string;
  current_phase: number;
  progress: number;
  assignee: string;
  requested_by: string;
  source: { kind: "prd" | "jira" | "raw" | "linear"; label: string };
  summary: string;
  /** F-04.13 — true when any downstream phase has output based on an
   * older revision of an upstream doc that has since been improved. */
  downstream_stale?: boolean;
  /** F-04.13 — per-phase staleness markers keyed by phase key. */
  phase_staleness?: Record<string, MockRunPhaseStaleness>;
}

/* The demo carries exactly two precomputed exemplar tasks. POST /v1/runs
 * (in handlers.ts) routes any user input into one of these two based on
 * the picked intent, so reviewers always land in a fully-populated flow. */
export const runs: MockRun[] = [
  { id: "tsk_001", goal: "Add Stripe ACH support for mid-market invoices",     intent: null,           status: "running", spent_usd: 0.47, created_at: "2026-05-22T12:32:00Z", output_summary: null, stream_url: "/v1/runs/tsk_001/events", kind: "implement", capability_id: "cap_billing",  current_phase: 5, progress: 92, assignee: "Athena", requested_by: "Maya Rao", source: { kind: "prd", label: "PRD: Mid-market payments expansion" }, summary: "Mid-market customers (ACV $25k–$250k) currently can only pay by card. Add ACH debit as a checkout option for invoices ≥ $5k.", downstream_stale: true, phase_staleness: { plan: { stale_since: "2026-05-23T07:50:00Z", upstream_doc_label: "Spec", upstream_phase_key: "spec" } } },
  { id: "tsk_002", goal: "Self-serve workspace snooze for hospitality customers", intent: "generate_prd", status: "running", spent_usd: 0.24, created_at: "2026-05-21T19:00:00Z", output_summary: null, stream_url: "/v1/runs/tsk_002/events", kind: "prd",       capability_id: "cap_platform", current_phase: 3, progress: 62, assignee: "Athena", requested_by: "Maya Rao", source: { kind: "raw", label: "Hospitality customer workshop · 2026-02-14" }, summary: "Hospitality customers want to temporarily pause their entire Lumen workspace during slow season instead of cancelling. Ops absorbs ~12 manual pause requests/week. Self-serve pause unblocks the Q4 hospitality push." },
];

/* -------------------------------------------------------- phase definitions */
export const phaseDefinition = [
  { key: "spec",      num: "01", name: "Spec",         icon: "file-text",        description: "What and why — agreed and signed off." },
  { key: "plan",      num: "02", name: "Plan",         icon: "list-tree",        description: "Tasks, blast radius, dependencies." },
  { key: "implement", num: "03", name: "Implement",    icon: "hammer",           description: "Code changes in scratch space." },
  { key: "review",    num: "04", name: "Review",       icon: "eye",              description: "Human-readable diff + design check." },
  { key: "ci",        num: "05", name: "CI Gate",      icon: "shield",           description: "Tests, lint, security pass." },
  { key: "pr",        num: "06", name: "Pull request", icon: "git-pull-request", description: "Draft PR opened. Humans merge." },
];

export const prdPhaseDefinition = [
  { key: "frame",    num: "01", name: "Frame the problem", icon: "target",    description: "What's broken, who it hurts, why now." },
  { key: "research", num: "02", name: "Research",          icon: "search",    description: "Athena pulls evidence from your knowledge base." },
  { key: "draft",    num: "03", name: "Draft the PRD",     icon: "file-text", description: "Goals, options, and the full document — together." },
  { key: "signoff",  num: "04", name: "Get sign-off",      icon: "users",     description: "Stakeholders weigh in. Athena waits for green." },
];

/* ------------------------------------------------------- per-task phase data
 * The handler returns `taskPhaseData[runId][phaseKey]` directly to
 * /v1/runs/{id}/phases/{phase}. Each phase slice is self-contained and rich.
 *
 * Two tracks:
 *   - Implementation tasks (6 phases): Spec → Plan → Implement → Review → CI → PR
 *   - PRD tasks (4 phases): Frame → Research → Draft → Sign-off
 */
export const taskPhaseData: Record<string, Record<string, unknown>> = {
  /* ============================== Implementation task ============================== */
  tsk_001: {
    spec: {
      doc: "spec.md",
      currentVersion: "v3",
      status: "approved",
      revisions: [
        { id: "v1", author: "Athena",     authorKind: "agent",  date: "2h ago",  note: "Initial draft from the PRD.", changes: "Drafted all 5 sections from the PRD." },
        { id: "v2", author: "Demo User",   authorKind: "human",  date: "1h ago",  note: "Clarified mid-market threshold; flagged payment-data flow.", changes: "Set ACH min to $5k · added payment-data flow clarification" },
        { id: "v3", author: "Athena",     authorKind: "agent",  date: "42m ago", note: "Incorporated payment-data flow notes. Approved by Demo User.", changes: "Spelled out Stripe Elements boundary · added ach_pending state transition rules" },
      ],
      body: `<h1>Add Stripe ACH support for mid-market invoices</h1><p><strong>Status</strong> approved · v3</p><h2>1. Why</h2><p>Mid-market customers (ACV $25k–$250k) have asked for ACH debit on every onboarding call since Q3. The current card-only checkout caps net-30 invoices at $5k due to interchange fees, and CFOs at mid-market companies prefer ACH for cash-flow reasons. ACH expands the addressable invoice size by ~7×.</p><h2>2. Who it's for</h2><ul><li><strong>Finance admin at the customer</strong> — enters bank details, owns the relationship.</li><li><strong>AR analyst on our side</strong> — needs to see ACH-pending separately from card-pending so the dunning workflow doesn't fire on the 3-day ACH float.</li></ul><h2>3. Scope</h2><ul><li>Add ACH as a checkout method on invoices ≥ $5k. Default to card under $5k.</li><li>New invoice state: <code>ach_pending</code>. Held for 4 business days then auto-confirms.</li><li>Webhook listener for Stripe's <code>charge.dispute.created</code> (ACH chargeback risk is non-trivial).</li><li><strong>Payment-data flow</strong> — bank-account details enter through Stripe Elements only; never touch our backend.</li></ul><h2>4. Out of scope</h2><ul><li>International ACH equivalents (SEPA, BACS). Tracked separately.</li><li>ACH for self-serve invoices under $5k. Revisit Q3 once unit economics are known.</li></ul><h2>5. Success metrics</h2><ul><li>30% of mid-market invoices ≥ $5k are paid via ACH within 90 days of launch.</li><li>No regression in invoice-paid-rate within 7 days.</li><li>ACH dispute rate under 0.4% in steady state.</li></ul>`,
      markdown: "# Add Stripe ACH support for mid-market invoices\n\n**Status** approved · v3\n\n## 1. Why\n\nMid-market customers (ACV $25k–$250k) have asked for ACH debit on every onboarding call since Q3…\n\n## 2. Who it's for\n\n- **Finance admin at the customer**\n- **AR analyst on our side**\n\n## 3. Scope\n\n- Add ACH as a checkout method on invoices ≥ $5k.\n- New invoice state: `ach_pending`.\n- Webhook listener for `charge.dispute.created`.\n- **Payment-data flow** — bank-account details enter through Stripe Elements only.\n\n## 4. Out of scope\n\n- International ACH equivalents (SEPA, BACS).\n- ACH for self-serve invoices under $5k.\n\n## 5. Success metrics\n\n- 30% of mid-market invoices ≥ $5k paid via ACH in 90 days.\n- No regression in invoice-paid-rate within 7 days.\n- ACH dispute rate < 0.4% in steady state.\n",
      approvedBy: [
        { name: "Demo User",    role: "Product", avatar: "DU" },
        { name: "Jordan Chen", role: "Finance", avatar: "JC" },
      ],
      capabilitiesDetected: [
        { id: "cap_billing",  confidence: 0.94, primary: true,  why: "PRD explicitly mentions invoices, ACH, and Stripe checkout — direct ownership.", files: 14 },
        { id: "cap_data",     confidence: 0.61, primary: false, why: "Revenue mart writeback depends on the new `ach_pending` state.",                  files: 3  },
        { id: "cap_platform", confidence: 0.27, primary: false, why: "Finance-admin permission check + workspace policy may need a touch.",             files: 1  },
        { id: "cap_inbox",    confidence: 0.09, primary: false, why: "Support thread tags reference invoice state — minimal impact.",                   files: 0  },
      ],
      blastRadius: {
        repos: [
          { id: "billing-svc",      files: 8, kind: "modify", desc: "Stripe webhook handlers + invoice state machine" },
          { id: "billing-web",      files: 3, kind: "modify", desc: "Checkout UI: ACH option on invoices ≥ $5k" },
          { id: "finance-pipeline", files: 2, kind: "modify", desc: "Split ACH-pending from card-pending dunning cohort" },
          { id: "infra",            files: 1, kind: "create", desc: "Stripe webhook subscription config" },
        ],
        services: [
          { name: "billing-svc",      impact: "schema + handlers",       risk: "medium" },
          { name: "finance-pipeline", impact: "cohort split",            risk: "low"    },
          { name: "dunning-worker",   impact: "indirect — reads cohort", risk: "low"    },
        ],
        dataStores: [
          { name: "invoice_status enum", impact: "expand: + ach_pending", risk: "low" },
          { name: "Stripe webhooks",     impact: "+1 subscription",        risk: "low" },
        ],
        compliance: ["PCI", "SOX"],
      },
      kbSources: [
        { label: "PRD · Mid-market payments expansion", kind: "PRD",            count: 1, icon: "file-text", detail: "Original change request from Demo User — anchor for scope + success metrics." },
        { label: "ADR-014 · Money handling",            kind: "decision",       count: 1, icon: "book-open", detail: "Currency stored as integer minor-units; ACH disputes never auto-retry (60-day dispute window)." },
        { label: "Stripe ACH onboarding (Notion)",      kind: "runbook",        count: 1, icon: "link",      detail: "Step-by-step config of ACH on a Stripe Connect account." },
        { label: "Mid-market payments playbook.pdf",    kind: "playbook",       count: 1, icon: "file-text", detail: "Finance team's playbook — invoice timing, ACH vs card economics." },
        { label: "47 support tickets · tag pause-order",kind: "support data",   count: 47,icon: "database",  detail: "+22% Q-o-Q. 60% hospitality concentration." },
      ],
      clarifyingQuestions: [
        {
          id: "q1", status: "answered",
          question: "Should ACH be available on existing unpaid invoices, or only on new ones created after launch?",
          context: "The current schema doesn't track which payment methods an invoice was originally created with. If we want to retroactively allow ACH on already-issued invoices, we'd need an additive migration on invoice_methods.",
          suggestedAnswers: [
            { id: "a", label: "New invoices only",          description: "Cleanest scope. Existing unpaid stays card-only." },
            { id: "b", label: "All unpaid invoices",        description: "Higher value, slightly bigger scope." },
            { id: "c", label: "Existing customers can opt-in via support", description: "Manual fallback; lowest scope creep." },
          ],
          chosen: "a",
          answer: "New invoices only. We can come back to retroactive ACH in a separate change once we have a few weeks of data.",
          answeredBy: "Demo User",
          answeredAt: "2h ago",
        },
        {
          id: "q2", status: "answered",
          question: "What's the threshold for showing the ACH option — $5,000 (matches the PRD) or do we want to test a lower threshold?",
          context: "$5,000 is the breakeven for card interchange savings. Some customers may want ACH on smaller invoices too.",
          suggestedAnswers: [
            { id: "a", label: "$5,000 (per the PRD)", description: "Matches what the team agreed." },
            { id: "b", label: "$2,500",                description: "Wider availability; revisit interchange math." },
            { id: "c", label: "$1,000 with a fee surcharge", description: "Pass ACH cost back to the customer." },
          ],
          chosen: "a", answer: "$5,000 — per the PRD. We'll review after 90 days.", answeredBy: "Demo User", answeredAt: "2h ago",
        },
        {
          id: "q3", status: "pending",
          question: "When an ACH payment is disputed, should the customer's overall account be auto-flagged for review, or only the specific invoice?",
          context: "Decision Record ADR-014 says we never auto-retry ACH disputes — but it's silent on whether to flag the customer relationship. Right now we have no 'customer flagged' state at all.",
          suggestedAnswers: [
            { id: "a", label: "Flag the invoice only",                description: "Smallest blast radius. Finance handles escalation manually." },
            { id: "b", label: "Flag the customer if 2+ disputes in 90d", description: "Auto-pattern detection; needs new state on customer." },
            { id: "c", label: "Out of scope — track separately",      description: "Move to a follow-up change request." },
          ],
          chosen: null, answer: null, answeredBy: null, answeredAt: null,
        },
      ],
      regenerateOptions: [
        { id: "opt_strict",  label: "Tighter scope",         description: "Drop the dispute-handler scope; ship it in a follow-up task." },
        { id: "opt_broad",   label: "Broader scope",         description: "Include international ACH (SEPA, BACS) in the same change." },
        { id: "opt_pm_lens", label: "Re-draft in PM voice",  description: "Rewrite sections 1, 2, 5 plain-language; flatten engineering jargon." },
      ],
    },

    plan: {
      doc: "plan.md",
      currentVersion: "v1",
      status: "approved",
      revisions: [
        { id: "v1", author: "Athena", authorKind: "agent", date: "30m ago", note: "Plan drafted from spec. Awaits engineering review." },
      ],
      body: `<h1>Implementation plan — Stripe ACH</h1><h2>Blast radius</h2><ul><li>3 repos touched: <code>billing-svc</code>, <code>billing-web</code>, <code>finance-pipeline</code>.</li><li>1 schema change: add <code>ach_pending</code> to <code>invoice_status</code> enum.</li></ul><h2>Tasks</h2><ol><li>Schema — migration 0042</li><li>billing-svc — ACH checkout handler</li><li>billing-svc — dispute handler</li><li>billing-web — checkout UI for ACH</li><li>finance-pipeline — dunning cohort split</li><li>Integration + property-based tests</li></ol>`,
      markdown: "# Implementation plan — Stripe ACH\n\n## Blast radius\n\n- 3 repos touched: `billing-svc`, `billing-web`, `finance-pipeline`.\n- 1 schema change: add `ach_pending` to `invoice_status` enum.\n\n## Tasks\n\n1. Schema — migration 0042\n2. billing-svc — ACH checkout handler\n3. billing-svc — dispute handler\n4. billing-web — checkout UI for ACH\n5. finance-pipeline — dunning cohort split\n6. Integration + property-based tests\n",
      components: [
        { n: 1, name: "invoice_status migration",
          plainEnglish: "We're adding a new value, ach_pending, to the list of states an invoice can live in.",
          technical: "Migration 0042: ALTER TYPE invoice_status ADD VALUE 'ach_pending'. Not transactional, but safe — no existing rows reference it.",
          why: "Required before any handler can write the new state. Must land first in deploy order.",
          repo: "billing-svc",
          touchpoints: { consumes: ["invoice_status"], publishes: [], calls: [], writes: ["invoice_status enum"], exposes: [] },
          files: [{ name: "migrations/0042_ach_pending.sql", change: "create" }],
        },
        { n: 2, name: "ACH checkout handler",
          plainEnglish: "When the customer picks ACH on the checkout page, we tell Stripe to use bank-account flow and pre-set the state.",
          technical: "New POST /checkout/ach. Calls stripe.checkout.sessions.create({ payment_method_types: ['us_bank_account'] }). Persists invoice in ach_pending.",
          why: "Bank-detail entry must stay in Stripe Elements; never crosses our origin.",
          repo: "billing-svc",
          touchpoints: { consumes: ["StripeClient"], publishes: ["invoice.ach_pending"], calls: ["stripe.checkout.sessions"], writes: ["invoices"], exposes: ["POST /checkout/ach"] },
          files: [{ name: "src/checkout/ach.ts", change: "create" }, { name: "src/checkout/index.ts", change: "modify" }],
        },
        { n: 3, name: "Dispute handler",
          plainEnglish: "If a customer's bank disputes the ACH later, we flag the invoice and page the on-call.",
          technical: "Webhook listener for charge.dispute.created. Updates invoice.status='disputed'. Triggers PagerDuty incident via existing alerts module.",
          why: "ACH chargeback risk is non-trivial (60-day dispute window). ADR-014 forbids auto-retry.",
          repo: "billing-svc",
          touchpoints: { consumes: ["StripeWebhook"], publishes: ["alerts:dispute"], calls: ["PagerDutyClient"], writes: ["invoices"], exposes: ["POST /stripe/webhooks"] },
          files: [{ name: "src/webhooks/dispute.ts", change: "create" }, { name: "src/webhooks/router.ts", change: "modify" }],
        },
        { n: 4, name: "Checkout UI — ACH option",
          plainEnglish: "When the invoice is $5k or more, show 'Pay by ACH' alongside 'Pay by card'.",
          technical: "Conditional render on InvoiceTotalUSD >= 5000. Reuses Stripe Elements <PaymentElement>. No PII touches our origin.",
          why: "Bank details must enter through Stripe Elements only.",
          repo: "billing-web",
          touchpoints: { consumes: ["InvoiceAPI"], publishes: [], calls: ["stripe-js"], writes: [], exposes: [] },
          files: [{ name: "app/invoices/[id]/checkout.tsx", change: "modify" }, { name: "components/PayMethodPicker.tsx", change: "create" }],
        },
        { n: 5, name: "Dunning cohort split",
          plainEnglish: "Our 'overdue' workflow should ignore ACH invoices for the first 4 business days while they're settling.",
          technical: "Add ach_pending to the exclusion clause in finance-pipeline/dunning.ts:88. Boundary check: 4-business-day inclusive.",
          why: "Customers get false 'overdue' emails today if we don't gate.",
          repo: "finance-pipeline",
          touchpoints: { consumes: ["invoices"], publishes: ["dunning.queue"], calls: [], writes: [], exposes: [] },
          files: [{ name: "src/dunning.ts", change: "modify" }, { name: "src/cohorts.ts", change: "modify" }],
        },
      ],
      dependencyMatrix: [
        ["",   "C1", "C2", "C3", "C4", "C5"],
        ["C1", "—",  "→",  "→",  "",   ""  ],
        ["C2", "",   "—",  "",   "→",  "→" ],
        ["C3", "",   "",   "—",  "",   ""  ],
        ["C4", "",   "",   "",   "—",  ""  ],
        ["C5", "",   "",   "",   "",   "—" ],
      ],
      subtasks: [
        { id: "st_1", title: "Add ach_pending to invoice_status enum",   component: "Schema",          status: "done",    files: 1, jira: "ACME-1801", dependsOn: [],
          acceptanceCriteria: ["Migration applies without lock contention", "Enum value visible in downstream schemas"],
          doc: { current: "v1", revisions: [{ id: "v1", author: "Athena", authorKind: "agent", date: "30m ago", note: "Initial subtask draft." }],
            body: "Add the new ach_pending state to the invoice_status enum. Non-transactional ALTER TYPE — safe because no rows reference the new value yet. Must land before the handler change so the writer doesn't fail."} },
        { id: "st_2", title: "Implement /checkout/ach endpoint",         component: "ACH checkout",    status: "done",    files: 2, jira: "ACME-1802", dependsOn: ["st_1"],
          acceptanceCriteria: ["Returns Stripe Checkout session URL", "Persists invoice in ach_pending", "Idempotent on retry"],
          doc: { current: "v1", revisions: [{ id: "v1", author: "Athena", authorKind: "agent", date: "28m ago", note: "Drafted from component C2." }],
            body: "Add POST /checkout/ach. Calls stripe.checkout.sessions.create with payment_method_types=['us_bank_account']. Persists invoice in ach_pending and returns the Stripe-hosted URL. Idempotency key is the invoice id."} },
        { id: "st_3", title: "Listen for charge.dispute.created",        component: "Dispute handler", status: "done",    files: 2, jira: "ACME-1803", dependsOn: ["st_1"],
          acceptanceCriteria: ["Webhook signature verified", "Invoice transitions to disputed", "PagerDuty incident fired"],
          doc: { current: "v1", revisions: [{ id: "v1", author: "Athena", authorKind: "agent", date: "26m ago", note: "Drafted from component C3." }],
            body: "New webhook handler for charge.dispute.created. Marks invoice as disputed, pages on-call finance. Per ADR-014 we never auto-retry ACH disputes."},
          aiSuggestPromote: true,
          promoteReason: "Different state-machine concern from the checkout flow. Splitting this into its own ticket isolates the 60-day dispute-window risk and lets Security review independently." },
        { id: "st_4", title: "Checkout UI — ACH option ≥ $5,000",        component: "Checkout UI",     status: "done",    files: 2, jira: "ACME-1804", dependsOn: ["st_2"],
          acceptanceCriteria: ["Only shows when total ≥ $5,000", "Stripe Elements only — no bank fields on our origin"],
          doc: { current: "v1", revisions: [{ id: "v1", author: "Athena", authorKind: "agent", date: "24m ago", note: "Drafted from component C4." }],
            body: "Conditional render in CheckoutPage when invoice.totalUsd >= 5000. Adds PayMethodPicker which surfaces ACH alongside card. Bank-detail entry stays in Stripe Elements."} },
        { id: "st_5", title: "Exclude ach_pending from dunning cohort",  component: "Dunning",         status: "done",    files: 2, jira: "ACME-1805", dependsOn: ["st_1"],
          acceptanceCriteria: ["No 'overdue' email within 4 business days", "Tests cover the boundary case"],
          doc: { current: "v1", revisions: [{ id: "v1", author: "Athena", authorKind: "agent", date: "22m ago", note: "Drafted from component C5." }],
            body: "Update finance-pipeline cohort builder so ach_pending invoices are excluded for 4 business days. Reuses the existing exclusion list."} },
        { id: "st_6", title: "Integration tests — happy + dispute",      component: "Tests",           status: "done",    files: 3, jira: "ACME-1806", dependsOn: ["st_2","st_3","st_4","st_5"],
          acceptanceCriteria: ["Happy path: ACH → settled → invoice marked paid", "Dispute path: bank rejects → invoice marked disputed → PagerDuty fires"],
          doc: { current: "v1", revisions: [{ id: "v1", author: "Athena", authorKind: "agent", date: "18m ago", note: "Test-scaffold draft." }],
            body: "End-to-end integration tests across billing-svc + billing-web + finance-pipeline. Covers happy path (ACH → settled) and dispute path (rejected → disputed → page)."},
          aiSuggestPromote: true,
          promoteReason: "Cross-component fan-in — depends on 4 sibling subtasks. Easier to track as its own ticket once the upstream components land; lets QA own the schedule independently." },
      ],
      consequences: {
        severity: "medium",
        summary: "Schema migration + 3 new webhook surfaces. Reversible. Sensitive-data flow unchanged (Stripe Elements only).",
        breakingChanges: [
          { area: "invoice_status enum", desc: "+1 value. Backwards-compatible reads; new writes use ach_pending.", risk: "low" },
          { area: "Webhook surface",     desc: "New listener for charge.dispute.created. Must register endpoint in Stripe dashboard.", risk: "low" },
        ],
        dataImpacts: [
          { entity: "invoices",      impact: "New transition: ach_pending → paid/disputed. Audit row per transition.", risk: "low" },
          { entity: "dunning_queue", impact: "ach_pending excluded for 4 business days. Reduces volume ~7%.",            risk: "low" },
        ],
        runtimeRisks: [
          { name: "ACH-during-deploy race", desc: "Brief window where checkout writes ach_pending but old handler reads. Mitigation: feature flag.", severity: "medium" },
          { name: "Stripe webhook 5xx",     desc: "Dispute webhooks must be idempotent. Mitigation: existing idempotency layer.",                     severity: "low" },
        ],
        mitigations: [
          { kind: "Feature flag", desc: "Roll out behind billing.ach.enabled, on per-org." },
          { kind: "Canary",       desc: "5% of mid-market for 48h before broad enable." },
        ],
      },
      regenerateOptions: [
        { id: "opt_smaller",    label: "Tighter plan",       description: "Drop the dispute handler from this task; ship it in a follow-up." },
        { id: "opt_more_tests", label: "More test coverage", description: "Add property-based tests for the state machine + load test for the dispute webhook." },
        { id: "opt_swap_repo",  label: "Re-shard repos",     description: "Move the dunning cohort change to billing-svc to avoid the finance-pipeline touch." },
      ],
      clarifyingQuestions: [
        {
          id: "plq1", status: "pending",
          question: "Do we split the migration into its own deploy, or land it with the handlers?",
          context: "Splitting helps reviewers but adds 1 day. Single deploy is faster but couples the schema and handler revert paths.",
          suggestedAnswers: [
            { id: "a", label: "Split — migration first, then handlers", description: "Safer revert path. +1 day total." },
            { id: "b", label: "Single deploy",                          description: "Faster. Feature flag still gates the handler." },
          ],
          chosen: null, answer: null, answeredBy: null, answeredAt: null,
        },
      ],
    },

    implement: {
      summaryPM: "Generated 12 files across 3 repos. 47 unit + 18 integration tests added — all green. Generation took 12m, cost $0.27.",
      stages: [
        { name: "Load context",         state: "done", detail: "Resolved 14 nodes, 6 ADRs, 3 domain notes",          duration: "8s"    },
        { name: "Code generation — C1", state: "done", detail: "migrations/0042_ach_pending.sql (1 file)",          duration: "11s"   },
        { name: "Code generation — C2", state: "done", detail: "src/checkout/ach.ts + index.ts (2 files)",          duration: "44s"   },
        { name: "Code generation — C3", state: "done", detail: "src/webhooks/dispute.ts + router.ts (2 files)",     duration: "36s"   },
        { name: "Code generation — C4", state: "done", detail: "checkout.tsx + PayMethodPicker.tsx (2 files)",      duration: "52s"   },
        { name: "Code generation — C5", state: "done", detail: "dunning.ts + cohorts.ts (2 files)",                  duration: "21s"   },
        { name: "Test scaffolds",       state: "done", detail: "47 unit + 18 integration tests across 3 repos",     duration: "1m 12s"},
        { name: "Lint / format",        state: "done", detail: "Auto-fixed 14 issues; manual review on 2",          duration: "9s"    },
        { name: "Static analysis",      state: "done", detail: "0 type errors; 0 security warnings",                 duration: "18s"   },
        { name: "Local test run",       state: "done", detail: "65 tests passed; 0 failed",                          duration: "2m 4s" },
        { name: "Cross-component check",state: "done", detail: "All touchpoints align; no orphan exports",           duration: "6s"    },
        { name: "Diff bundle",          state: "done", detail: "Wrote diff to s3://athena-artifacts/tsk_001/diff.json", duration: "2s" },
      ],
      stats: { files: 12, totalTests: 65, retries: 1, costSoFar: 0.27, tokens: 42000 },
      clarifyingQuestions: [
        {
          id: "dq1", status: "pending",
          question: "The Stripe webhook for dispute creation can fire twice in rare retry cases — dedup by what key?",
          context: "Looking at the existing webhook router, we dedup on event.id. For dispute lifecycle we may want (dispute.id, status) to cover transitions too.",
          suggestedAnswers: [
            { id: "a", label: "Dedup by (dispute.id, status)",     description: "Standard pattern for lifecycle events." },
            { id: "b", label: "Stick with event.id",                description: "Smallest scope, matches existing convention." },
          ],
          chosen: null, answer: null, answeredBy: null, answeredAt: null,
        },
      ],
    },

    review: {
      diffStats: { files: 12, additions: 487, deletions: 23, repos: 3 },
      reviewers: [
        { name: "Avi Patel",   role: "Eng lead", avatar: "AP", state: "approved", note: "LGTM. Verified idempotency + feature flag wiring." },
        { name: "Jordan Chen", role: "Finance",  avatar: "JC", state: "approved", note: "Dunning split verified against last quarter's cohort." },
        { name: "Tomas Lind",  role: "Security", avatar: "TL", state: "approved", note: "Payment-data sensitivity auditor passed after hash-charge-id fix." },
      ],
      approvalPolicy: [
        { label: "1 engineering approval",              met: true,  blocker: "required for merge" },
        { label: "1 finance approval",                  met: true,  blocker: "payment-affecting change" },
        { label: "1 security approval (payment data)",  met: true,  blocker: "PCI scope touch" },
        { label: "CI must pass",                        met: true,  blocker: "all green required" },
      ],
      diffs: [
        { repo: "billing-svc", file: "src/checkout/ach.ts", additions: 84, deletions: 0,
          purposePM: "New endpoint that hands the customer off to Stripe Elements to enter their bank details. Never sees the bank info itself.",
          hunks: [{ header: "@@ -0,0 +1,84 @@", lines: [
            { type: "add", n: 1,  t: "import { StripeClient } from '../stripe';" },
            { type: "add", n: 2,  t: "import { Invoice } from '../models';" },
            { type: "add", n: 3,  t: "import { logger, audit } from '../obs';" },
            { type: "add", n: 4,  t: "" },
            { type: "add", n: 5,  t: "export async function createAchCheckout(invoice: Invoice) {" },
            { type: "add", n: 6,  t: "  if (invoice.totalUsd < 5000) {" },
            { type: "add", n: 7,  t: "    throw new MinAchAmountError('ACH minimum is $5k');" },
            { type: "add", n: 8,  t: "  }" },
            { type: "add", n: 9,  t: "  const session = await StripeClient.checkout.sessions.create({" },
            { type: "add", n: 10, t: "    payment_method_types: ['us_bank_account']," },
            { type: "add", n: 11, t: "    invoice: invoice.stripeId," },
            { type: "add", n: 12, t: "    success_url: invoice.successUrl," },
            { type: "add", n: 13, t: "    cancel_url: invoice.cancelUrl," },
            { type: "add", n: 14, t: "  });" },
          ]}] },
        { repo: "billing-svc", file: "src/webhooks/dispute.ts", additions: 62, deletions: 0,
          purposePM: "Catches the bank's 'I dispute this' signal, marks the invoice as disputed, and pages whoever is on-call for finance.",
          hunks: [{ header: "@@ -0,0 +1,62 @@", lines: [
            { type: "add", n: 1, t: "export async function handleDispute(event: Stripe.Event) {" },
            { type: "add", n: 2, t: "  // ADR-014: ACH disputes never auto-retry." },
            { type: "add", n: 3, t: "  const charge = event.data.object as Stripe.Charge;" },
            { type: "add", n: 4, t: "  const invoice = await Invoice.byStripeChargeId(charge.id);" },
            { type: "add", n: 5, t: "  if (!invoice) return logger.warn('dispute_for_unknown_charge', { id: sha256(charge.id).slice(0, 12) });" },
            { type: "add", n: 6, t: "  await invoice.transition('disputed', { reason: charge.dispute?.reason });" },
            { type: "add", n: 7, t: "  await pageOnCall('finance', `Invoice ${invoice.id} disputed`);" },
            { type: "add", n: 8, t: "}" },
          ]}] },
        { repo: "billing-web", file: "app/invoices/[id]/checkout.tsx", additions: 36, deletions: 12,
          purposePM: "Adds 'Pay by ACH' as an option whenever the invoice is $5k or more.",
          hunks: [{ header: "@@ -23,12 +23,24 @@ export default function CheckoutPage({ invoice }) {", lines: [
            { type: "ctx", n: 23, t: "  const stripe = useStripe();" },
            { type: "rem", n: 24, t: "  return <PaymentElement />;" },
            { type: "add", n: 24, t: "  const showAch = invoice.totalUsd >= 5000;" },
            { type: "add", n: 25, t: "  return (" },
            { type: "add", n: 26, t: "    <>" },
            { type: "add", n: 27, t: "      <PayMethodPicker showAch={showAch} />" },
            { type: "add", n: 28, t: "      <PaymentElement />" },
            { type: "add", n: 29, t: "    </>" },
            { type: "add", n: 30, t: "  );" },
            { type: "ctx", n: 31, t: "}" },
          ]}] },
      ],
      clarifyingQuestions: [
        {
          id: "rvq1", status: "pending",
          question: "Should we require a Finance reviewer on every checkout-touching PR, or only when the schema changes?",
          context: "Today Finance reviews every payment-data PR. That's high overhead. We could narrow it to schema-touching PRs only.",
          suggestedAnswers: [
            { id: "a", label: "Every checkout-touching PR",     description: "Status quo. Most conservative." },
            { id: "b", label: "Schema-touching PRs only",        description: "Narrower scope, faster median review." },
          ],
          chosen: null, answer: null, answeredBy: null, answeredAt: null,
        },
      ],
    },

    ci: {
      state: "passed",
      elapsedSeconds: 184,
      attemptsByRepo: {
        "billing-svc": {
          branch: "athena/ach-support-tsk_001",
          sha: "a3f12ab",
          ciTool: "GitHub Actions",
          checks: [
            { name: "lint",          state: "success", startedAt: "0:00", completedAt: "0:18", outputSummary: "0 errors, 0 warnings" },
            { name: "typecheck",     state: "success", startedAt: "0:18", completedAt: "0:42", outputSummary: "tsc --noEmit clean" },
            { name: "unit tests",    state: "success", startedAt: "0:42", completedAt: "1:24", outputSummary: "47 passed, 0 failed" },
            { name: "integration",   state: "success", startedAt: "1:24", completedAt: "2:42", outputSummary: "18 passed, 0 failed" },
            { name: "security scan", state: "success", startedAt: "0:00", completedAt: "0:54", outputSummary: "0 high, 0 medium" },
          ],
          classifier: null,
        },
        "billing-web": {
          branch: "athena/ach-support-tsk_001",
          sha: "b1c9d40",
          ciTool: "GitHub Actions",
          checks: [
            { name: "lint",              state: "success", startedAt: "0:00", completedAt: "0:11", outputSummary: "0 errors" },
            { name: "typecheck",         state: "success", startedAt: "0:11", completedAt: "0:28", outputSummary: "clean" },
            { name: "unit tests",        state: "success", startedAt: "0:28", completedAt: "0:51", outputSummary: "12 passed" },
            { name: "visual regression", state: "success", startedAt: "0:51", completedAt: "1:15", outputSummary: "snapshot regenerated after hover-state fix" },
          ],
          classifier: {
            category: "Visual regression",
            confidence: 0.81,
            deterministic: true,
            errorExcerpt: "Snapshot 'PayMethodPicker__hover' differs by 18px (button alignment).",
            failingFiles: ["app/__snapshots__/PayMethodPicker.test.tsx"],
            triageNote: "Likely caused by new button: regenerate snapshot if visually verified.",
            resolution: "auto-healed",
          },
        },
        "finance-pipeline": {
          branch: "athena/ach-support-tsk_001",
          sha: "c8d2e91",
          ciTool: "GitHub Actions",
          checks: [
            { name: "lint",         state: "success", startedAt: "0:00", completedAt: "0:09", outputSummary: "0 errors" },
            { name: "unit tests",   state: "success", startedAt: "0:09", completedAt: "0:42", outputSummary: "23 passed" },
            { name: "dbt parse",    state: "success", startedAt: "0:42", completedAt: "1:01", outputSummary: "all models compile" },
            { name: "data quality", state: "success", startedAt: "1:01", completedAt: "1:48", outputSummary: "all checks pass" },
          ],
          classifier: null,
        },
      },
      healHistory: [
        { n: 1, outcome: "fixed", filesModified: 1, costUsd: 0.04, note: "Snapshot regenerated for billing-web/PayMethodPicker after visual review." },
      ],
      clarifyingQuestions: [
        {
          id: "ciq1", status: "pending",
          question: "Visual-regression snapshot diffed by 18px — auto-heal or escalate to Design?",
          context: "The classifier flagged the diff as deterministic. Auto-heal regenerates the snapshot; escalating sends it to Priya before continuing.",
          suggestedAnswers: [
            { id: "a", label: "Auto-heal (regenerate snapshot)", description: "Confidence 81% — the classifier is highly sure." },
            { id: "b", label: "Escalate to Design",              description: "Slower but safer if visual fidelity matters." },
          ],
          chosen: null, answer: null, answeredBy: null, answeredAt: null,
        },
      ],
    },

    pr: {
      prs: [
        { repo: "billing-svc",      branch: "athena/ach-support-tsk_001", sha: "a3f12ab", status: "open", number: 412, files: 8, additions: 313, deletions: 8,  url: "https://github.com/lumen/billing-svc/pull/412" },
        { repo: "billing-web",      branch: "athena/ach-support-tsk_001", sha: "b1c9d40", status: "open", number: 218, files: 3, additions: 96,  deletions: 12, url: "https://github.com/lumen/billing-web/pull/218" },
        { repo: "finance-pipeline", branch: "athena/ach-support-tsk_001", sha: "c8d2e91", status: "open", number: 88,  files: 2, additions: 78,  deletions: 3,  url: "https://github.com/lumen/finance-pipeline/pull/88" },
      ],
      mode: "draft",
      clarifyingQuestions: [
        {
          id: "prq1", status: "pending",
          question: "Promote PRs from draft to ready-for-review once CI + reviewers green, or always require a human flip?",
          context: "Athena always opens PRs as drafts. Auto-promotion would move them when all gates pass, removing a manual step.",
          suggestedAnswers: [
            { id: "a", label: "Auto-promote when all gates pass", description: "Removes a manual step. Trusted only after CI + reviewers approve." },
            { id: "b", label: "Always require a human flip",      description: "Status quo. One last sanity check before broadcasting." },
          ],
          chosen: null, answer: null, answeredBy: null, answeredAt: null,
        },
      ],
    },
  },

  /* =============================== PRD task =============================== */
  tsk_002: {
    frame: {
      problemStatement: "Customers can pause card subscriptions but cannot pause orders mid-flight. Operations absorbs ~12 manual pause requests every week, taking ~3 staff-hours of toil. The friction is most acute for mid-market hospitality customers heading into their slow season — and our top three hospitality prospects cited 'no order pause' as a blocker in win/loss calls last quarter.",
      problemCitations: [
        { label: "47 support tickets · last 90d", icon: "message-circle", title: "Tickets tagged pause-order in Zendesk" },
        { label: "Hospitality workshop",          icon: "users",          title: "Customer workshop · 2026-02-14" },
        { label: "Win/loss · hospitality",        icon: "file-text",      title: "3 of 8 calls cited the gap" },
      ],
      whyNow: "Q4 hospitality push starts in 6 weeks. 40% of mid-market pipeline is hospitality. Win/loss data shows the gap costs us 1-2 deals per quarter. Auto-pause-on-payment-failure (a follow-up project) is blocked on this one shipping first.",
      whyNowCitations: [
        { label: "Q4 roadmap · hospitality",   icon: "target",    title: "Sales kickoff deck · Feb 2026" },
        { label: "Pipeline data · 40% hospitality", icon: "database", title: "Salesforce export · Feb 2026" },
      ],
      affectedUsers: [
        { id: "u1", role: "Operations admin",         description: "Today fields 12 'please pause order X' requests/week. Each takes ~15 minutes (context switch + manual state edit). About 3 hr/week of pure toil.", impact: "high",    source: "Zendesk ticket tags · 90d window" },
        { id: "u2", role: "Customer finance admin",   description: "Currently has to email their account manager to pause. Average round-trip is 1.4 days. Hospitality finance teams want this in their own hands.",  impact: "high",    source: "Customer workshop · 2026-02-14" },
        { id: "u3", role: "Customer ops manager",     description: "Wants to pause whole regions during seasonal closures. Today does it order-by-order via support tickets.",                                            impact: "medium",  source: "Sales call notes · 3 accounts" },
        { id: "u4", role: "Order Mgmt product manager",description: "Cannot ship 'auto-pause on payment failure' until self-serve manual pause exists.",                                                                  impact: "blocker", source: "Internal roadmap · order-mgmt capability" },
      ],
      urgency: "high",
      problemConfidence: 0.86,
      kbSources: [
        { label: "Hospitality customer workshop",      kind: "transcript",    count: 8,  icon: "message-circle", detail: "8 customer quotes pulled from the Feb 14 workshop" },
        { label: "Zendesk ticket export",               kind: "support data",  count: 47, icon: "database",       detail: "47 tickets tagged pause-order in 90 days" },
        { label: "Win/loss interviews · hospitality",   kind: "doc",           count: 8,  icon: "file-text",      detail: "3 of 8 calls cited this gap" },
        { label: "Q3 NPS verbatims",                    kind: "spreadsheet",   count: 12, icon: "clipboard",      detail: "12 detractor quotes about rigid workflow" },
      ],
      clarifyingQuestions: [
        {
          id: "fq1", status: "answered",
          question: "Which segment is this really for — enterprise, mid-market, or self-serve hospitality?",
          context: "Each segment has different cost-to-build and ARR upside. Pinning the primary user shapes scope.",
          suggestedAnswers: [
            { id: "a", label: "Mid-market hospitality",  description: "Primary deal lever. ACV $25k–$250k." },
            { id: "b", label: "Enterprise hospitality",  description: "Different sales motion. Custom contracts." },
            { id: "c", label: "Self-serve hospitality",  description: "Under $1k ARR — not worth the build." },
          ],
          chosen: "a", answer: "Mid-market hospitality is the primary user. Enterprise + self-serve out of scope.", answeredBy: "Demo User", answeredAt: "2h ago",
        },
      ],
    },
    research: {
      synthesis: "Strong qualitative + quantitative signal that customers want self-serve pause. 47 support tickets in 90 days, +22% Q-o-Q. Three competitors offer it; one of ours doesn't. The order state machine already has a `paused` state — currently gated to ops only — so the engineering surface is UX and gating, not foundational. Ship before the Q4 push.",
      synthesisConfidence: 0.78,
      synthesisBreakdown: { pastPrds: 3, signals: 67, decisions: 2 },
      pastPrds: [
        { id: "prd_subs_pause",   title: "Subscription pause (card billing)",    date: "2025 · Q2", status: "shipped", relevance: "Same UX pattern but for subscriptions. Adoption: 14% of card customers use it. Most pause within first 60 days; median pause length 18 days." },
        { id: "prd_order_cancel", title: "Self-service order cancel",            date: "2025 · Q3", status: "shipped", relevance: "Adjacent flow. Support tagged ~8% of cancels as 'meant to pause'. We need a clear visual distinction (separate CTAs, separate confirmation copy)." },
        { id: "prd_region_close", title: "Region-level order suspension (ops)",  date: "2024 · Q4", status: "shipped", relevance: "Ops-only tool. Same underlying state machine — opens path to surfacing it externally." },
      ],
      customerSignals: [
        { source: "Support tickets",      count: 47, trend: "+22% Q-o-Q",     summary: "Tickets tagged 'pause-order' across 90 days. Top theme: 'I want to pause for 2 weeks, not cancel.' Hospitality concentration (~60%).",
          cite: { label: "Zendesk export · 90d", icon: "database" } },
        { source: "NPS verbatims",        count: 12, trend: "stable",          summary: "Detractor comments mention 'rigid order workflow' and 'have to call to pause' explicitly.",
          cite: { label: "Q3 NPS verbatims", icon: "clipboard" } },
        { source: "Win/loss interviews",  count:  8, trend: "n/a (one-shot)",  summary: "3 of 8 hospitality prospects flagged 'no order pause' as a competitive gap.",
          cite: { label: "Win/loss calls · Q4", icon: "message-circle" } },
      ],
      relatedDecisions: [
        { id: "ADR-018", title: "Order state machine — paused vs. cancelled",
          relevance: "Existing decision document defines `paused` distinctly from `cancelled`. Self-serve pause reuses that state — no new state needed." },
        { id: "ADR-027", title: "Customer-initiated reversible actions",
          relevance: "All customer-reversible actions must be auditable + revertable from the same surface. Constrains the resume button placement." },
      ],
      resourcesUsed: [
        { title: "Hospitality customer workshop · 2026-02-14", kind: "transcript", nodes: 8 },
        { title: "Zendesk pause-order ticket export · 90d",    kind: "support data", nodes: 47 },
        { title: "Q3 NPS verbatims",                            kind: "spreadsheet",  nodes: 12 },
        { title: "Subscription pause PRD",                      kind: "PRD",          nodes: 1 },
      ],
      competitiveLandscape: [
        { name: "Brex Spend",       supports: "Pause + resume up to 90 days · explicit calendar picker", notes: "Marketed as 'seasonal mode'. Used in hospitality + retail.",
          cite: { label: "Brex docs · 2026-01", icon: "link" } },
        { name: "Ramp",             supports: "Cancel only — no pause",                                   notes: "Forces customer to re-onboard if they come back. Friction.",
          cite: { label: "Win/loss · 3 calls", icon: "message-circle" } },
        { name: "Mercury Payments", supports: "Pause + auto-resume on payment failure recovery",         notes: "Different model — recovery-driven, not customer-driven.",
          cite: { label: "Mercury changelog", icon: "link" } },
      ],
      clarifyingQuestions: [
        {
          id: "rsq1", status: "pending",
          question: "Should the research pull include enterprise hospitality data too, or stay scoped to mid-market only?",
          context: "Enterprise customers may have different needs but require manual review. Including them widens the data set ~30%.",
          suggestedAnswers: [
            { id: "a", label: "Mid-market only", description: "Matches the framing decision. Faster synthesis." },
            { id: "b", label: "Include enterprise", description: "Wider data set. May reveal cross-segment patterns." },
          ],
          chosen: null, answer: null, answeredBy: null, answeredAt: null,
        },
      ],
    },
    draft: {
      doc: "prd.md",
      currentVersion: "v2",
      status: "needs-review",
      revisions: [
        { id: "v1", author: "Athena",   authorKind: "agent", date: "30m ago", note: "Initial draft synthesizing frame, research, and the chosen approach.", changes: "Drafted all 10 sections from scratch." },
        { id: "v2", author: "Demo User", authorKind: "human", date: "12m ago", note: "Tightened the success-metrics section + added the 90-day cap callout per the constraint.", changes: "+1 goal (G3) · tightened M2 baseline · added 90-day pause cap to Constraints" },
      ],
      body: `<h1>PRD: Customer-paused workflows</h1><h2>TL;DR</h2><p>Mid-market hospitality customers need self-serve order pause. We're shipping a hard-pause + explicit resume date in 3 weeks. Target: ops workload from 12/wk to under 2/wk; 30% mid-market hospitality adoption within 90 days.</p><h2>Background &amp; why now</h2><p>Customers can pause subscriptions but not orders. Ops handles ~12 manual pauses/week (~3 hr toil). Hospitality slow-season is 6 weeks out; this unblocks the Q4 hospitality demo cycle.</p><h2>Solution</h2><p>Hard pause with explicit resume date (1–90 days). Auto-resumes at midnight on selected date. Email reminders 3 days before and on the day. Resume early via the same button. Audit logged per ADR-015.</p>`,
      markdown: "# PRD: Customer-paused workflows\n\n## TL;DR\n\nMid-market hospitality customers need self-serve order pause. We're shipping a hard-pause + explicit resume date in 3 weeks.\n\n## Background & why now\n\nCustomers can pause subscriptions but not orders. Ops handles ~12 manual pauses/week.\n\n## Solution\n\nHard pause with explicit resume date (1–90 days). Auto-resumes at midnight on selected date.\n",
      goals: [
        { id: "g1", text: "Reduce ops manual-pause workload from 12/wk to under 2/wk within 60 days of launch.", primary: true,
          cites: [{ label: "Zendesk · 47 tickets", icon: "database" }, { label: "Ops survey", icon: "clipboard" }] },
        { id: "g2", text: "30% of active mid-market hospitality customers initiate at least one pause within 90 days of launch.", primary: true,
          cites: [{ label: "Subscription pause · 14% baseline", icon: "file-text" }] },
        { id: "g3", text: "Cancellation rate among hospitality customers drops by 2 percentage points.", primary: false,
          cites: [{ label: "Win/loss · hospitality", icon: "search" }] },
      ],
      nonGoals: [
        "Auto-pause on payment failure — separate project, follows this one.",
        "Per-line-item pause — we pause the whole order or nothing.",
        "Subscription-style recurrence on resume — resume picks up from where it left off; no re-billing logic changes.",
        "Bulk pause across multiple orders — ship single-order first, evaluate bulk after 60 days.",
      ],
      users: [
        { persona: "Hospitality finance admin", goals: "Pause the next 6 weeks of orders during slow season", success: "Single click, end date picker, email confirmation." },
        { persona: "Customer ops manager",       goals: "Pause specific regions during seasonal closures",     success: "Resume early when bookings pick up; no support ticket needed." },
        { persona: "Internal ops admin",          goals: "Stop fielding 12 manual pause requests per week",    success: "Inbox empties out; weekly toil drops below 30 minutes." },
      ],
      constraints: [
        { text: "Don't break the existing state machine — `paused` is reused, not re-introduced.", cite: { label: "ADR-018", icon: "book-open" } },
        { text: "Audit logged per ADR-027 — all customer-reversible actions are revertable from the same surface.", cite: { label: "ADR-027", icon: "book-open" } },
        { text: "Resume reminder emails go through the existing notification pipeline — no new sender domains." },
      ],
      timeline: "Target ship: 3 weeks from PRD sign-off. Hospitality demo: 4 weeks. Beta cohort: 3 design-partner customers in week 2.",
      chosenOptionId: "opt_simple",
      options: [
        { id: "opt_simple", title: "Hard pause with explicit resume date", recommended: true,
          effort: "small", risk: "low", duration: "3 weeks",
          adoption: "Predictable — matches subscription pause flow customers already know",
          pros: ["Familiar UX (matches subscription pause)", "Crystal-clear semantics — pick a date, auto-resume", "Reversible (customer can change date or resume early)"],
          cons: ["Customer has to know how long they want to pause", "No 'pause until next reorder' or other conditional logic"],
          description: "Customer picks an end date (1–90 days). The order auto-resumes at midnight on that date. We email reminders 3 days before and on the day. Resume early via the same button.",
          informedBy: [{ label: "Past PRD · Subscription pause", icon: "file-text" }, { label: "Brex seasonal mode", icon: "search" }] },
        { id: "opt_smart",  title: "Smart pause with conditions", recommended: false,
          effort: "medium", risk: "medium", duration: "5 weeks",
          adoption: "Higher ceiling — conditional resume covers more use cases",
          pros: ["Handles 'pause until next quarter' / 'pause until reorder' use cases", "Less customer effort — they don't have to remember to come back"],
          cons: ["More UI surface (conditional resume builder)", "Tricky edge cases around event-based resume", "Customer education needed"],
          description: "Customer picks 'pause until [date] OR [event]' — e.g. 'pause until 2026-04-01' OR 'pause until I make my next reorder'.",
          informedBy: [{ label: "Mercury auto-resume pattern", icon: "search" }] },
        { id: "opt_indef",  title: "Indefinite pause (manual resume only)", recommended: false,
          effort: "small", risk: "high", duration: "2 weeks",
          adoption: "Risky — customers forget to resume, order stays paused forever",
          pros: ["Simplest possible UX"],
          cons: ["Customers forget to resume — order stranded", "Ops still cleans up after 6 months", "Confusion with cancel"],
          description: "No end date. Customer must manually resume.",
          informedBy: [{ label: "Ramp cancel-only model (anti-pattern)", icon: "search" }] },
      ],
      chosenRationale: "We're picking the hard-pause + explicit resume date approach. It matches the subscription pause UX customers already know (familiarity beats novelty here), ships in 3 weeks (clears the Q4 hospitality demo deadline with margin), and the failure modes are bounded — at worst, the customer resumes a day later than intended.",
      metrics: [
        { id: "m1", name: "Ops weekly pause-request volume",   baseline: "12 / wk",                  target: "under 2 / wk",                       owner: "Demo User",
          how: "Tickets tagged `pause-order` in Zendesk; rolling 60-day average; PM owns reporting.",
          cites: [{ label: "Zendesk tag export", icon: "database" }] },
        { id: "m2", name: "Self-serve pause adoption",          baseline: "0 (feature doesn't exist)",target: "30% of mid-market hospitality in 90d",owner: "Demo User",
          how: "Distinct customers with at least one pause action / total active mid-market hospitality customers, measured at day 90.",
          cites: [{ label: "Product analytics", icon: "clipboard" }] },
        { id: "m3", name: "Confusion rate (pause vs. cancel)",  baseline: "~8%",                      target: "under 5%",                            owner: "Tomas Lind",
          how: "Cancellations tagged by support as 'meant to pause' / total cancellations.",
          cites: [{ label: "Support ticket tags", icon: "message-circle" }] },
        { id: "m4", name: "Win rate — hospitality vertical",    baseline: "31%",                      target: "+3pp within 90 days of launch",       owner: "Demo User",
          how: "Closed-won hospitality deals / qualified hospitality opps, rolling 90 days.",
          cites: [{ label: "Salesforce pipeline", icon: "database" }] },
      ],
      clarifyingQuestions: [
        {
          id: "dfq1", status: "answered",
          question: "Should we cap the pause length, or allow indefinite?",
          context: "Indefinite pause has known failure modes (orders stranded). Capping at 90 days matches subscription pause precedent.",
          suggestedAnswers: [
            { id: "a", label: "Cap at 90 days",      description: "Matches subscription pause precedent." },
            { id: "b", label: "Allow indefinite",    description: "Simpler UX. Risk: orders stranded." },
          ],
          chosen: "a", answer: "Cap at 90 days. Longer than 90 is effectively cancel — we steer customers there.", answeredBy: "Demo User", answeredAt: "1h ago",
        },
      ],
      kbSources: [
        { label: "Subscription pause PRD",       kind: "PRD",          count: 1,  icon: "file-text", detail: "Same UX pattern, adjacent product surface." },
        { label: "ADR-018 · Order state machine",kind: "decision",     count: 1,  icon: "book-open", detail: "Definition of paused vs. cancelled states." },
        { label: "Brex seasonal mode (research)",kind: "competitor",   count: 1,  icon: "search",    detail: "Reference UX for explicit calendar resume." },
      ],
    },
    signoff: {
      readinessScore: 0.72,
      readinessBreakdown: { approved: 2, blockers: 1, pending: 1 },
      stakeholders: [
        { name: "Demo User",    role: "Product (author)",         avatar: "DU", state: "owner",              order: 0, source: "Author — owns this PRD",                                       comment: "" },
        { name: "Avi Patel",   role: "Engineering — Order Mgmt", avatar: "AP", state: "approved",            order: 1, source: "Pulled from capability owners · Order Management",             comment: "Existing state machine supports this. 3-week estimate aligns with our scope. Approved." },
        { name: "Jordan Chen", role: "Finance impact",           avatar: "JC", state: "approved",            order: 2, source: "Past PRD · Subscription pause · finance reviewer",            comment: "Revenue impact modeled — pause doesn't break MRR recognition. Approved." },
        { name: "Priya Shah",  role: "Design",                   avatar: "PS", state: "changes-requested",  order: 3, source: "Past PRD · Self-serve cancel · design reviewer",              comment: "Date picker UX needs a closer look — propose calendar widget over dropdown. Also, confirmation modal copy needs revision.", nextAction: "Reply to Priya — switch to calendar widget" },
        { name: "Tomas Lind",  role: "Customer success",         avatar: "TL", state: "pending",             order: 4, source: "Customer-success rotation · hospitality vertical lead",       comment: "", nextAction: "Nudge Tomas — 2 days since invite" },
      ],
      commentThread: [
        { author: "Priya Shah", avatar: "PS", date: "15m ago", text: "I'd like to see the date picker pattern before approving. The dropdown approach in v1 felt clunky on mobile." },
        { author: "Demo User",   avatar: "DU", date: "8m ago",  text: "Fair — switching to a calendar widget. Will pair with you on the spec edits this afternoon." },
        { author: "Avi Patel",  avatar: "AP", date: "5m ago",  text: "Calendar widget is fine on our end; we'll lean on the existing date primitive from the billing-web checkout flow." },
      ],
      clarifyingQuestions: [
        {
          id: "sfq1", status: "pending",
          question: "Block sign-off on a Design approval, or accept Design changes-requested as advisory?",
          context: "Priya has requested calendar-widget changes. Some teams treat Design as a hard block; others as advisory.",
          suggestedAnswers: [
            { id: "a", label: "Block until Design approves",     description: "Highest bar. Slows ship by ~1 day for the widget swap." },
            { id: "b", label: "Accept as advisory, ship in parallel", description: "Engineering proceeds; Design lands in week 2." },
          ],
          chosen: null, answer: null, answeredBy: null, answeredAt: null,
        },
      ],
    },
  },
};

/** Decisions accumulated across the task lifecycle. */
export const taskDecisions: Record<string, Array<{
  id: string; when: string; whoName: string; whoAvatar: string; whoKind: "agent" | "human"; phase: string; kind: "clarify" | "manual" | "selection" | "iterate"; title: string; body: string; source: string;
}>> = {
  tsk_001: [
    { id: "dec_1", when: "2h ago",  whoName: "Demo User",   whoAvatar: "DU", whoKind: "human", phase: "spec",  kind: "clarify",   title: "ACH applies to new invoices only",                  body: "We're not retroactively applying ACH to invoices already issued. Existing unpaid invoices stay card-only. Revisit after 90 days.",       source: "Clarifying question · Q1" },
    { id: "dec_2", when: "2h ago",  whoName: "Demo User",   whoAvatar: "DU", whoKind: "human", phase: "spec",  kind: "clarify",   title: "$5,000 ACH threshold (per the change request)",     body: "$5,000 is the breakeven for card interchange savings. We'll review the threshold after 90 days of data.",                                source: "Clarifying question · Q2" },
    { id: "dec_3", when: "1h ago",  whoName: "Jordan Chen",whoAvatar: "JC", whoKind: "human", phase: "spec",  kind: "manual",    title: "No auto-retry on ACH disputes",                     body: "Per Decision Record ADR-014 (Money handling), ACH disputes never auto-retry. Finance handles every one manually within 24h of webhook.", source: "Added manually" },
    { id: "dec_4", when: "55m ago", whoName: "Athena",     whoAvatar: "AT", whoKind: "agent", phase: "spec",  kind: "iterate",   title: "Spec rewritten to spell out payment-data flow",         body: "Demo User asked to spell out the payment-data flow. Section 3 now states that bank-account fields flow through Stripe Elements only.",  source: "Iterate prompt by Demo User" },
    { id: "dec_5", when: "30m ago", whoName: "Avi Patel",  whoAvatar: "AP", whoKind: "human", phase: "plan",  kind: "manual",    title: "Roll out behind a feature flag",                    body: "billing.ach.enabled — per-org rollout. 5% canary for 48 hours before broad enable.",                                                       source: "Added manually during plan review" },
  ],
  tsk_002: [
    { id: "dec_p1", when: "2h ago",  whoName: "Demo User",   whoAvatar: "DU", whoKind: "human", phase: "frame",   kind: "clarify",   title: "Mid-market hospitality is the primary user", body: "Not enterprise hospitality (different sales motion) and not self-serve (under $1k/yr — not worth the build).",      source: "Clarifying question · Q1" },
    { id: "dec_p2", when: "1h ago",  whoName: "Demo User",   whoAvatar: "DU", whoKind: "human", phase: "draft",   kind: "manual",    title: "Pause cap at 90 days",                       body: "Matches subscription pause precedent. Longer than 90 days is effectively cancel — we steer customers to that flow.", source: "Manual" },
    { id: "dec_p3", when: "45m ago", whoName: "Demo User",   whoAvatar: "DU", whoKind: "human", phase: "draft",   kind: "selection", title: "Going with the simple hard-pause option",    body: "Smart-pause adds 2 weeks for a feature we can layer on later. Indefinite-pause has known failure modes.",            source: "Draft phase · option pick" },
    { id: "dec_p4", when: "12m ago", whoName: "Priya Shah", whoAvatar: "PS", whoKind: "human", phase: "signoff", kind: "manual",    title: "Date picker = calendar widget (not dropdown)", body: "Dropdown felt clunky in user testing of the v1 mockup.",                                                            source: "Design review comment" },
  ],
};

/* --------------------------------------------------------- F-04.7 — run_decisions extended rows
 *
 * The richer `RunDecisionRow` shape consumed by the decision-list pane.
 * Stores scope / supersedes / status / impact / user_editable plus the
 * existing fields. The list endpoint returns these; the lightweight
 * `taskDecisions` above continues to power the decisions strip.
 */
export const runDecisions: Record<string, RunDecisionRow[]> = {
  tsk_001: [
    {
      id: "rd_001", who_name: "Demo User", who_avatar: "DU", who_kind: "human",
      phase: "spec", kind: "choice", title: "ACH applies to new invoices only",
      body: "We're not retroactively applying ACH to invoices already issued. Existing unpaid invoices stay card-only. Revisit after 90 days.",
      source: "Clarifying question · Q1", when: "2h ago",
      created_at: "2026-05-23T07:00:00Z",
      scope_kind: "global", scope_doc_id: null, scope_section_anchor: null, scope_selection: null,
      supersedes_decision_id: null, status: "active", impact: "medium", user_editable: false,
    },
    {
      id: "rd_002", who_name: "Demo User", who_avatar: "DU", who_kind: "human",
      phase: "spec", kind: "choice", title: "$5,000 ACH threshold",
      body: "$5,000 is the breakeven for card interchange savings. We'll review the threshold after 90 days of data.",
      source: "Clarifying question · Q2", when: "2h ago",
      created_at: "2026-05-23T07:10:00Z",
      scope_kind: "section", scope_doc_id: "doc_spec_001", scope_section_anchor: "scope",
      scope_selection: null,
      supersedes_decision_id: null, status: "active", impact: "high", user_editable: false,
    },
    {
      id: "rd_003", who_name: "Jordan Chen", who_avatar: "JC", who_kind: "human",
      phase: "spec", kind: "user_decision", title: "No auto-retry on ACH disputes",
      body: "Per ADR-014 (Money handling), ACH disputes never auto-retry. Finance handles every one manually within 24h of webhook.",
      source: "Added manually", when: "1h ago",
      created_at: "2026-05-23T08:00:00Z",
      scope_kind: "global", scope_doc_id: null, scope_section_anchor: null, scope_selection: null,
      supersedes_decision_id: null, status: "active", impact: "high", user_editable: true,
    },
    {
      id: "rd_004", who_name: "Athena", who_avatar: "AT", who_kind: "agent",
      phase: "spec", kind: "improve", title: "Spec rewritten to spell out payment-data flow",
      body: "Demo User asked to spell out the payment-data flow. Section 3 now states that bank-account fields flow through Stripe Elements only.",
      source: "Improve prompt by Demo User", when: "55m ago",
      created_at: "2026-05-23T08:10:00Z",
      scope_kind: "section", scope_doc_id: "doc_spec_001", scope_section_anchor: "scope",
      scope_selection: null,
      supersedes_decision_id: null, status: "active", impact: "medium", user_editable: false,
    },
    {
      id: "rd_005", who_name: "Avi Patel", who_avatar: "AP", who_kind: "human",
      phase: "plan", kind: "user_decision", title: "Roll out behind a feature flag",
      body: "billing.ach.enabled — per-org rollout. 5% canary for 48 hours before broad enable.",
      source: "Added manually during plan review", when: "30m ago",
      created_at: "2026-05-23T08:40:00Z",
      scope_kind: "global", scope_doc_id: null, scope_section_anchor: null, scope_selection: null,
      supersedes_decision_id: null, status: "active", impact: "medium", user_editable: true,
    },
    {
      id: "rd_006", who_name: "Avi Patel", who_avatar: "AP", who_kind: "human",
      phase: "plan", kind: "user_decision", title: "Roll out behind a feature flag (revised)",
      body: "billing.ach.enabled — start at 1% canary instead of 5% per Tomas's recommendation. 48h soak, then 5%, then broad.",
      source: "Edited", when: "25m ago",
      created_at: "2026-05-23T08:45:00Z",
      scope_kind: "global", scope_doc_id: null, scope_section_anchor: null, scope_selection: null,
      supersedes_decision_id: "rd_005", status: "active", impact: "medium", user_editable: true,
    },
    {
      id: "rd_007", who_name: "Demo User", who_avatar: "DU", who_kind: "human",
      phase: "spec", kind: "approve", title: "Spec approved — advancing to plan",
      body: "Spec v3 looks good. Approved.",
      source: "Gate approve", when: "40m ago",
      created_at: "2026-05-23T08:30:00Z",
      scope_kind: "global", scope_doc_id: null, scope_section_anchor: null, scope_selection: null,
      supersedes_decision_id: null, status: "active", impact: "low", user_editable: false,
    },
    {
      id: "rd_008", who_name: "Demo User", who_avatar: "DU", who_kind: "human",
      phase: "spec", kind: "comment", title: "Watch for invoice_status enum migration",
      body: "Heads up — the ach_pending enum value addition isn't transactional. Coordinate the cherry-pick window with the release.",
      source: "Comment composer · marked as decision", when: "20m ago",
      created_at: "2026-05-23T08:50:00Z",
      scope_kind: "section", scope_doc_id: "doc_spec_001", scope_section_anchor: "scope",
      scope_selection: null,
      supersedes_decision_id: null, status: "active", impact: "medium", user_editable: true,
    },
    {
      id: "rd_009", who_name: "Athena", who_avatar: "AT", who_kind: "agent",
      phase: "plan", kind: "manual_edit", title: "Reverted accidental component reorder",
      body: "Auto-rolled back the reordering of C2/C3 in plan.md after C2 became invalid (depended on C3's output).",
      source: "Splice rollback", when: "10m ago",
      created_at: "2026-05-23T09:00:00Z",
      scope_kind: "section", scope_doc_id: "doc_plan_001", scope_section_anchor: "components",
      scope_selection: null,
      supersedes_decision_id: null, status: "reverted", impact: "low", user_editable: false,
    },
  ],
  tsk_002: [
    {
      id: "rd_p001", who_name: "Demo User", who_avatar: "DU", who_kind: "human",
      phase: "frame", kind: "choice", title: "Mid-market hospitality is the primary user",
      body: "Not enterprise hospitality (different sales motion) and not self-serve (under $1k/yr — not worth the build).",
      source: "Clarifying question · Q1", when: "2h ago",
      created_at: "2026-05-23T07:00:00Z",
      scope_kind: "global", scope_doc_id: null, scope_section_anchor: null, scope_selection: null,
      supersedes_decision_id: null, status: "active", impact: "high", user_editable: false,
    },
    {
      id: "rd_p002", who_name: "Demo User", who_avatar: "DU", who_kind: "human",
      phase: "draft", kind: "user_decision", title: "Pause cap at 90 days",
      body: "Matches subscription pause precedent. Longer than 90 days is effectively cancel — we steer customers to that flow.",
      source: "Manual", when: "1h ago",
      created_at: "2026-05-23T08:00:00Z",
      scope_kind: "global", scope_doc_id: null, scope_section_anchor: null, scope_selection: null,
      supersedes_decision_id: null, status: "active", impact: "medium", user_editable: true,
    },
  ],
};

/* --------------------------------------------------- F-04.14 — run_clarifications */
const tsk001Clarifications: RunClarification[] = [
  {
    id: "clr_001", qid: "q_scope_collision_001", run_id: "tsk_001", phase_key: "spec",
    question: "Heads up — others are working in your scope. How would you like to proceed?",
    rationale: "The slicer found 1 open PR + 1 active branch + 3 recent main commits touching the same files. Picking a coordination strategy is required before the spec finalizes.",
    question_kind: "single_choice", priority: "blocker", origin: "scope_collisions",
    status: "pending",
    created_at: "2026-05-23T08:55:00Z", expires_at: "2026-05-24T08:55:00Z", resolved_at: null,
    batch_id: null, defer_count: 0,
    scope_doc_id: null, scope_section_anchor: null,
    options: [
      { id: "coordinate", label: "Coordinate", body: "Wait for these to merge before continuing." },
      { id: "parallel", label: "Parallel", body: "Proceed knowing there will be conflicts (risky).", requires_restart: true },
      { id: "review", label: "Review", body: "Open the items, then decide." },
      { id: "take_over", label: "Take over", body: "Close conflicting items and continue." },
    ],
    reference_picker: null, numeric_constraints: null, free_text_constraints: null,
    free_text_allowed: false, on_expire: { action: "continue_with_warning" },
    metadata: {
      open_prs: [
        {
          integration: "github", number: 482, title: "ACH receiver flow", author: "Maya Rao",
          url: "https://github.com/lumen/billing-svc/pull/482",
          touches: ["apps/billing/services/dunning.py", "apps/billing/api/refunds.py"],
          state: "open",
        },
      ],
      active_branches: [
        {
          name: "fix/dunning-edge-cases", author: "Avi Patel", ahead_of_main: 4,
          touches: ["apps/billing/services/dunning.py"],
        },
      ],
      recent_main_commits: [
        { sha: "a1b2c3d", author: "Tomas Lind", when: "3d ago", summary: "billing-svc: tighten refund webhook validation", touches: ["apps/billing/api/refunds.py"] },
        { sha: "e5f6a7b", author: "Priya Shah", when: "5d ago", summary: "billing-web: ACH form fields skeleton", touches: ["apps/billing-web/components/PayMethodPicker.tsx"] },
        { sha: "9c8d7e6", author: "Dana Lin", when: "6d ago", summary: "tests: property tests for invoice state machine", touches: ["apps/billing/tests/states/test_transitions.py"] },
      ],
    },
    answer: null, answered_by_user_id: null, answered_at: null,
  },
  {
    id: "clr_002", qid: "q_unknown_term_001", run_id: "tsk_001", phase_key: "spec",
    question: "What does `ach_pending` mean in this context? Need to confirm before generating the state-machine transition.",
    rationale: "This term doesn't appear in the capability glossary. Picking 'Add to glossary' will record the term for future runs.",
    question_kind: "single_choice_with_free_text", priority: "blocker", origin: "no_unknown_term",
    status: "pending",
    created_at: "2026-05-23T09:00:00Z", expires_at: "2026-05-24T09:00:00Z", resolved_at: null,
    batch_id: null, defer_count: 0,
    scope_doc_id: "doc_spec_001", scope_section_anchor: "scope",
    options: [
      { id: "ach_pending_state", label: "Intermediate invoice state — held 4 business days then auto-confirms" },
      { id: "ach_pending_status", label: "A flag on the customer-side, not the invoice" },
      { id: "other", label: "Other (specify)", requires_free_text: true },
    ],
    reference_picker: null, numeric_constraints: null,
    free_text_constraints: { min_length: 20, max_length: 280 },
    free_text_allowed: true, on_expire: { action: "fail_phase" },
    metadata: null,
    answer: null, answered_by_user_id: null, answered_at: null,
  },
  {
    id: "clr_003", qid: "q_reviewer_assign_001", run_id: "tsk_001", phase_key: "plan",
    question: "Who should review this change?",
    rationale: "ACH affects compliance + finance flows. Picking reviewers seeds the review phase.",
    question_kind: "multi_choice", priority: "normal", origin: "agent",
    status: "pending",
    created_at: "2026-05-23T09:05:00Z", expires_at: "2026-05-24T09:05:00Z", resolved_at: null,
    batch_id: null, defer_count: 0,
    scope_doc_id: null, scope_section_anchor: null,
    options: [
      { id: "u_avi", label: "Avi Patel (eng — billing)" },
      { id: "u_jordan", label: "Jordan Chen (finance reviewer)" },
      { id: "u_priya", label: "Priya Shah (front-end)", is_optional: true },
      { id: "u_tomas", label: "Tomas Lind (security)", is_optional: true },
    ],
    reference_picker: null, numeric_constraints: null, free_text_constraints: null,
    free_text_allowed: false, on_expire: { action: "choose_default", default_choice_id: "u_avi" },
    metadata: null,
    answer: null, answered_by_user_id: null, answered_at: null,
  },
  {
    id: "clr_004", qid: "q_confirm_breaking_001", run_id: "tsk_001", phase_key: "plan",
    question: "This change adds a new value to invoice_status enum — that's a breaking change for downstream consumers without the new value mapped. Confirm to proceed.",
    rationale: "ADR-014 marks invoice_status changes as breaking. Confirmation is required so it shows up in the supersedure chain.",
    question_kind: "confirm", priority: "blocker", origin: "agent",
    status: "pending",
    created_at: "2026-05-23T09:10:00Z", expires_at: "2026-05-24T09:10:00Z", resolved_at: null,
    batch_id: null, defer_count: 0,
    scope_doc_id: null, scope_section_anchor: null,
    options: [],
    reference_picker: null, numeric_constraints: null, free_text_constraints: null,
    free_text_allowed: false, on_expire: { action: "fail_phase" },
    metadata: null,
    answer: null, answered_by_user_id: null, answered_at: null,
  },
  {
    id: "clr_005", qid: "q_free_text_followup_001", run_id: "tsk_001", phase_key: "spec",
    question: "Any additional notes for the dispute-handling section?",
    rationale: "Optional — surfaces as a comment + context for the spec author.",
    question_kind: "free_text", priority: "optional", origin: "agent",
    status: "pending",
    created_at: "2026-05-23T09:15:00Z", expires_at: "2026-05-24T09:15:00Z", resolved_at: null,
    batch_id: null, defer_count: 0,
    scope_doc_id: null, scope_section_anchor: null,
    options: [],
    reference_picker: null, numeric_constraints: null,
    free_text_constraints: { min_length: 10, max_length: 500 },
    free_text_allowed: true, on_expire: { action: "continue_with_warning" },
    metadata: null,
    answer: null, answered_by_user_id: null, answered_at: null,
  },
  {
    id: "clr_006", qid: "q_reference_pick_001", run_id: "tsk_001", phase_key: "implement",
    question: "Pick the utility to extend for the ACH validator.",
    rationale: "The agent is about to add validation; if a similar utility exists, prefer extending it over creating a new one.",
    question_kind: "reference_pick", priority: "normal", origin: "agent",
    status: "pending",
    created_at: "2026-05-23T09:20:00Z", expires_at: "2026-05-24T09:20:00Z", resolved_at: null,
    batch_id: null, defer_count: 0,
    scope_doc_id: null, scope_section_anchor: null,
    options: [],
    reference_picker: {
      entity_kind: "file", multi: false, min_selected: 1, max_selected: 1,
      candidates_hint: [
        { id: "billing-svc/src/validators/iban.ts", label: "validators/iban.ts", description: "IBAN — closest analog" },
        { id: "billing-svc/src/validators/routing.ts", label: "validators/routing.ts", description: "US routing number" },
        { id: "billing-svc/src/utils/regex.ts", label: "utils/regex.ts", description: "Generic regex pool" },
      ],
    },
    numeric_constraints: null, free_text_constraints: null,
    free_text_allowed: false, on_expire: { action: "continue_with_warning" },
    metadata: null,
    answer: null, answered_by_user_id: null, answered_at: null,
  },
];

/* --------------------------------------------------- tsk_002 (PRD) clarifications
 *
 * Covers the four PRD phases (frame / research / draft / signoff) with one
 * representative kind per phase. The agent surfaces a question and the user
 * answers it inline in the per-phase widget — no modals, no page-blockers.
 */
const tsk002Clarifications: RunClarification[] = [
  {
    id: "clr_p001", qid: "q_segment_scope_001", run_id: "tsk_002", phase_key: "frame",
    question: "Which segment is this PRD primarily for?",
    rationale: "We want to scope the workshop evidence + competitive landscape to the right tier. The TL;DR will adopt the chosen segment.",
    question_kind: "single_choice", priority: "normal", origin: "agent",
    status: "answered",
    created_at: "2026-05-23T07:00:00Z", expires_at: "2026-05-24T07:00:00Z", resolved_at: "2026-05-23T07:30:00Z",
    batch_id: null, defer_count: 0,
    scope_doc_id: null, scope_section_anchor: null,
    options: [
      { id: "mid_market_hospitality", label: "Mid-market hospitality",  body: "Primary deal lever. ACV $25k–$250k." },
      { id: "enterprise_hospitality", label: "Enterprise hospitality",  body: "Different sales motion. Custom contracts." },
      { id: "self_serve_hospitality", label: "Self-serve hospitality",  body: "Under $1k ARR — not worth the build." },
    ],
    reference_picker: null, numeric_constraints: null, free_text_constraints: null,
    free_text_allowed: false, on_expire: { action: "choose_default", default_choice_id: "mid_market_hospitality" },
    metadata: null,
    answer: { choice_id: "mid_market_hospitality" },
    answered_by_user_id: USER_ID, answered_at: "2026-05-23T07:30:00Z",
  },
  {
    id: "clr_p002", qid: "q_research_scope_001", run_id: "tsk_002", phase_key: "research",
    question: "Should the research pull include enterprise hospitality data too, or stay scoped to mid-market only?",
    rationale: "Enterprise customers may have different needs but require manual review. Including them widens the data set ~30%.",
    question_kind: "single_choice", priority: "normal", origin: "agent",
    status: "pending",
    created_at: "2026-05-23T08:00:00Z", expires_at: "2026-05-24T08:00:00Z", resolved_at: null,
    batch_id: null, defer_count: 0,
    scope_doc_id: null, scope_section_anchor: null,
    options: [
      { id: "mid_market_only", label: "Mid-market only",  body: "Matches the framing decision. Faster synthesis." },
      { id: "include_enterprise", label: "Include enterprise", body: "Wider data set. May reveal cross-segment patterns." },
    ],
    reference_picker: null, numeric_constraints: null, free_text_constraints: null,
    free_text_allowed: false, on_expire: { action: "continue_with_warning" },
    metadata: null,
    answer: null, answered_by_user_id: null, answered_at: null,
  },
  {
    id: "clr_p003", qid: "q_pause_cap_001", run_id: "tsk_002", phase_key: "draft",
    question: "How many days should the maximum pause length be?",
    rationale: "Subscription pause caps at 90 days. Workspace snooze can be the same, longer, or shorter. ADR-018 doesn't prescribe.",
    question_kind: "numeric", priority: "blocker", origin: "agent",
    status: "pending",
    created_at: "2026-05-23T08:15:00Z", expires_at: "2026-05-24T08:15:00Z", resolved_at: null,
    batch_id: null, defer_count: 0,
    scope_doc_id: null, scope_section_anchor: null,
    options: [],
    reference_picker: null,
    numeric_constraints: { min: 7, max: 365, step: 1, unit: "days" },
    free_text_constraints: null,
    free_text_allowed: false, on_expire: { action: "fail_phase" },
    metadata: null,
    answer: null, answered_by_user_id: null, answered_at: null,
  },
  {
    id: "clr_p004", qid: "q_design_advisory_001", run_id: "tsk_002", phase_key: "signoff",
    question: "Block sign-off on a Design approval, or accept Design changes-requested as advisory?",
    rationale: "Priya has requested calendar-widget changes. Some teams treat Design as a hard block; others as advisory.",
    question_kind: "single_choice_with_free_text", priority: "normal", origin: "reviewer",
    status: "pending",
    created_at: "2026-05-23T08:50:00Z", expires_at: "2026-05-24T08:50:00Z", resolved_at: null,
    batch_id: null, defer_count: 0,
    scope_doc_id: null, scope_section_anchor: null,
    options: [
      { id: "block_design", label: "Block until Design approves", body: "Highest bar. Slows ship by ~1 day for the widget swap." },
      { id: "advisory", label: "Accept as advisory, ship in parallel", body: "Engineering proceeds; Design lands in week 2." },
      { id: "other", label: "Other (specify)", requires_free_text: true },
    ],
    reference_picker: null, numeric_constraints: null,
    free_text_constraints: { min_length: 10, max_length: 280 },
    free_text_allowed: true, on_expire: { action: "continue_with_warning" },
    metadata: null,
    answer: null, answered_by_user_id: null, answered_at: null,
  },
];

export const runClarifications: Record<string, RunClarification[]> = {
  tsk_001: tsk001Clarifications,
  tsk_002: tsk002Clarifications,
};

/** Re-export so handlers don't need to import the client type directly. */
export type { RunClarification, RunDecisionRow };

/* --------------------------------------------------------- PR back-flow data */
export const prFeedback: Record<string, unknown> = {
  tsk_001: [
    { id: "prf_1", repo: "billing-svc", pr_number: 412, reviewer: "Avi Patel",   reviewer_avatar: "AP", at: "38m ago", file: "src/checkout/ach.ts",           line: 7,  body: "This `throw new Error('ACH minimum is $5k')` should be a typed domain error (`MinAchAmountError`) so the API layer can map it to a 422 instead of a generic 500.", status: "addressed",       athena_response: { at: "34m ago", summary: "Replaced raw Error with MinAchAmountError; added handler mapping in checkout/index.ts.", commits: [{ sha: "e1c4a7b", msg: "checkout/ach: throw typed MinAchAmountError", files_changed: 2 }] } },
    { id: "prf_2", repo: "billing-svc", pr_number: 412, reviewer: "Tomas Lind",  reviewer_avatar: "TL", at: "24m ago", file: "src/webhooks/dispute.ts",       line: 5,  body: "Please hash the charge.id before logging. Payment-data sensitivity auditor flagged this — hash it.",                                                                                  status: "addressed",       athena_response: { at: "19m ago", summary: "Replaced raw charge.id with SHA-256 hash (first 12 chars). Payment-data sensitivity auditor now passes.", commits: [{ sha: "a98e012", msg: "webhooks/dispute: hash charge.id in log line", files_changed: 1 }] } },
    { id: "prf_3", repo: "billing-web", pr_number: 218, reviewer: "Priya Shah",  reviewer_avatar: "PS", at: "11m ago", file: "components/PayMethodPicker.tsx",line: 34, body: "Hover state needs a 1px outline at 40% opacity to meet our component spec. Visual-regression snapshot will fail until this is fixed.",                                            status: "addressed",       athena_response: { at: "8m ago",  summary: "Added 1px outline at 40% opacity to hover state. Snapshot regenerated.",                  commits: [{ sha: "f7c2a91", msg: "PayMethodPicker: add 1px hover outline",      files_changed: 1 }] } },
    { id: "prf_4", repo: "billing-web", pr_number: 218, reviewer: "Priya Shah",  reviewer_avatar: "PS", at: "9m ago",  file: "app/invoices/[id]/checkout.tsx",line: 24, body: "Question — what's our keyboard tab order between PayMethodPicker and PaymentElement?",                                                                                            status: "awaiting_athena", athena_response: null },
  ],
};

/* ----------------------------------------------------- integrations (24 logos) */
/**
 * F-07.1 — full framework status set. F-07.3 — `github_app` + `pat` kinds.
 * F-07.4 — `provides_mcp` is required, default `false`. F-07.5 — `scope` is
 * a structured shape, not a free-form string. F-09.1 — Jira/Linear/Asana
 * use `oauth`; Jira Server / DC uses `pat`; GitHub uses `github_app`.
 */
export type IntegrationStatus =
  | "available"
  | "coming_soon"
  | "pending"
  | "connected"
  | "active"
  | "degraded"
  | "revoked";

export type IntegrationConnectKind = ClientIntegrationConnectKind;

export interface MockIntegration {
  id: string;
  name: string;
  category: string;
  status: IntegrationStatus;
  connect_kind?: IntegrationConnectKind;
  blurb: string;
  connected_as?: string;
  connected_at?: string;
  scope?: IntegrationScope;
  last_sync?: string;
  instructions?: string;
  flagship?: boolean;
  /** F-07.4 — required. `true` triggers MCP auto-provision on connect. */
  provides_mcp: boolean;
}

export const integrations: MockIntegration[] = [
  /* Tier 1 — connected */
  {
    id: "int_github", name: "GitHub", category: "SCM",
    status: "active", connect_kind: "github_app",
    blurb: "Pull requests, branch protection, CODEOWNERS, CI status.",
    connected_as: "lumen (org-admin)", connected_at: "3 weeks ago",
    scope: { kind: "repos", count: 11, preview: ["lumen/inbox-web", "lumen/inbox-svc", "lumen/billing-svc"], more: 8 },
    last_sync: "30m ago", flagship: true, provides_mcp: true,
  },
  {
    id: "int_jira", name: "Jira Cloud", category: "Work mgmt",
    status: "active", connect_kind: "oauth",
    blurb: "Issue tracker — task source for tickets that pre-date Lumen's Linear migration. Two-way sync.",
    connected_as: "lumen.atlassian.net", connected_at: "2 weeks ago",
    scope: { kind: "projects", count: 3, preview: ["LUMEN", "INBOX", "BILL"], more: 0 },
    last_sync: "7m ago", flagship: true, provides_mcp: true,
  },
  {
    id: "int_slack", name: "Slack", category: "Comms",
    status: "active", connect_kind: "oauth",
    blurb: "Notifications, @athena chat-ops, approval pings, daily digest.",
    connected_as: "lumenhq.slack.com", connected_at: "3 weeks ago",
    scope: { kind: "channels", count: 6, preview: ["#athena", "#eng-billing", "#eng-inbox"], more: 3 },
    last_sync: "30s ago", flagship: true, provides_mcp: true,
  },
  {
    id: "int_anthropic", name: "Anthropic", category: "Model provider",
    status: "active", connect_kind: "key",
    blurb: "Default model provider. Claude Opus / Sonnet / Haiku via direct API.",
    connected_as: "sk-ant-...kQ8 (rotated 12d ago)", connected_at: "3 weeks ago",
    scope: { kind: "models", count: 5, preview: ["claude-opus-4", "claude-sonnet-4", "claude-haiku-4"], more: 2 },
    last_sync: "now", flagship: true, provides_mcp: false,
  },
  /* Tier 2 — available */
  { id: "int_gitlab",       name: "GitLab",            category: "SCM",            status: "available", connect_kind: "pat",     blurb: "Repos + merge requests on GitLab.com or self-managed.",        instructions: "Personal access token with api + read_repository scopes.", provides_mcp: true },
  { id: "int_bitbucket",    name: "Bitbucket",         category: "SCM",            status: "available", connect_kind: "oauth",   blurb: "Repos + pull requests on Bitbucket Cloud.",                    instructions: "OAuth — admin authorises the Athena app.",                  provides_mcp: false },
  { id: "int_jira_dc",      name: "Jira Server / DC",  category: "Work mgmt",      status: "available", connect_kind: "pat",     blurb: "Self-hosted Jira (Data Center) via personal access token.",    instructions: "PAT + base URL from your Jira admin.",                       provides_mcp: false },
  { id: "int_linear",       name: "Linear",            category: "Work mgmt",      status: "available", connect_kind: "oauth",   blurb: "Issues + cycles. Modern teams' alternative to Jira.",          instructions: "OAuth — sign in with your Linear workspace.",               provides_mcp: true },
  { id: "int_asana",        name: "Asana",             category: "Work mgmt",      status: "available", connect_kind: "oauth",   blurb: "Project + task source for ops-leaning teams.",                 instructions: "OAuth — sign in with your Asana workspace.",                provides_mcp: false },
  { id: "int_bedrock",      name: "AWS Bedrock",       category: "Model provider", status: "available", connect_kind: "aws",     blurb: "Claude, Llama, Cohere via your AWS account. US/EU residency.", instructions: "IAM role ARN with bedrock:InvokeModel + region.",            provides_mcp: false },
  { id: "int_azure_openai", name: "Azure OpenAI",      category: "Model provider", status: "available", connect_kind: "endpoint",blurb: "GPT-4o + GPT-5 via your Azure subscription.",                   instructions: "Endpoint URL + API key from your Azure deployment.",         provides_mcp: false },
  { id: "int_openai",       name: "OpenAI",            category: "Model provider", status: "available", connect_kind: "key",     blurb: "Direct OpenAI API for GPT-4o / GPT-5.",                        instructions: "API key from platform.openai.com.",                          provides_mcp: false },
  { id: "int_confluence",   name: "Confluence",        category: "Knowledge",      status: "available", connect_kind: "token",   blurb: "Indexes spaces as a knowledge source for capability research.",instructions: "API token + workspace URL.",                                 provides_mcp: true },
  { id: "int_notion",       name: "Notion",            category: "Knowledge",      status: "available", connect_kind: "token",   blurb: "Indexes pages + databases as a knowledge source.",             instructions: "Internal integration token from notion.so/integrations.",    provides_mcp: true },
  { id: "int_pagerduty",    name: "PagerDuty",         category: "Incidents",      status: "available", connect_kind: "key",     blurb: "Page on-call when canary breaches SLO. Incident loop back into Athena.", instructions: "REST API key from PagerDuty → Integrations.",       provides_mcp: false },
  { id: "int_datadog",      name: "Datadog",           category: "Observability",  status: "available", connect_kind: "keypair", blurb: "SLO checks at deploy + post-deploy health verification.",      instructions: "API key + Application key from Organization Settings.",      provides_mcp: true },
  { id: "int_launchdarkly", name: "LaunchDarkly",      category: "Feature flags",  status: "available", connect_kind: "key",     blurb: "Feature-flag rollout + canary controls in the Deploy phase.",   instructions: "SDK key + project key.",                                    provides_mcp: false },
  { id: "int_sentry",       name: "Sentry",            category: "Observability",  status: "available", connect_kind: "token",   blurb: "Error tracking + release health.",                              instructions: "Auth token with project:read + project:write.",              provides_mcp: true },
  { id: "int_figma",        name: "Figma",             category: "Design",         status: "available", connect_kind: "token",   blurb: "Attach frames to specs; reviewers see linked design nodes.",   instructions: "Personal access token from Figma → Settings.",               provides_mcp: true },
  { id: "int_teams",        name: "Microsoft Teams",   category: "Comms",          status: "available", connect_kind: "webhook", blurb: "Notifications + approvals for Microsoft-first teams.",         instructions: "Incoming webhook URL from a Teams channel.",                 provides_mcp: false },
  { id: "int_salesforce",   name: "Salesforce",        category: "CRM",            status: "available", connect_kind: "oauth",   blurb: "Win/loss data + customer accounts behind PRD evidence.",       instructions: "Connected App OAuth — admin one-click consent.",            provides_mcp: true },
  { id: "int_zendesk",      name: "Zendesk",           category: "Support",        status: "available", connect_kind: "token",   blurb: "Ticket evidence chain — citations into PRD Frame phase.",      instructions: "API token + subdomain from Zendesk → Admin.",                provides_mcp: false },
  /* Tier 3 — coming soon */
  { id: "int_azure_devops", name: "Azure DevOps",      category: "SCM",            status: "coming_soon", blurb: "Repos + Boards + Pipelines in one. Targeted for July.",        provides_mcp: false },
  { id: "int_vertex",       name: "Google Vertex AI",  category: "Model provider", status: "coming_soon", blurb: "Gemini + Anthropic-on-GCP. Targeted for July.",                 provides_mcp: false },
  { id: "int_circleci",     name: "CircleCI",          category: "CI/CD",          status: "coming_soon", blurb: "CI gate provider beyond GitHub Actions. Targeted for August.", provides_mcp: false },
  { id: "int_clickup",      name: "ClickUp",           category: "Work mgmt",      status: "coming_soon", blurb: "Alternative work-management source. Targeted for August.",     provides_mcp: false },
];

/* ----------------------------------------------------------- MCP servers
 * Org-scoped Model Context Protocol servers. Some are auto-provisioned from
 * a connected integration (source: "integration"), some are user-added custom
 * endpoints (source: "custom" — typically self-hosted in the enterprise VPC).
 *
 * Auth tokens are never stored in the mock seed. The `auth` fields carry only
 * the display-safe hints that the real backend would return.
 */

export type MockMcpServer = ClientMcpServer;
export type MockMcpRecentCall = ClientMcpRecentCall;

export const mcpServers: MockMcpServer[] = [
  {
    id: "mcp_github",
    org_id: ORG_ID,
    slug: "github",
    name: "GitHub",
    source: "integration",
    integration_id: "int_github",
    transport: "http",
    endpoint_url: "https://api.githubcopilot.com/mcp/",
    auth: { method: "oauth", oauth_app_id: "Athena (lumen)", oauth_connected_as: "lumen (org-admin)", last_rotated_at: "12 days ago" },
    egress_policy: "any",
    version: "1.4.2",
    version_last_reviewed: "2026-05-04",
    health: {
      status: "connected",
      last_check_at: SERVER_TIME(),
      latency_p50_ms: 184,
      latency_p95_ms: 412,
      error_rate_24h: 0.002,
      uptime_30d: 0.9993,
    },
    tools: [
      { id: "tl_gh_1", name: "search_issues",       description: "Search GitHub issues across attached repos.",                              enabled: true,  approval: "none",        risk: "read",        usage_count_30d: 1842, last_used_at: "12m ago" },
      { id: "tl_gh_2", name: "get_pr",              description: "Fetch a PR with diff, reviews, and check status.",                         enabled: true,  approval: "none",        risk: "read",        usage_count_30d: 920,  last_used_at: "4m ago" },
      { id: "tl_gh_3", name: "create_comment",      description: "Post a comment to a PR or issue (Athena-authored).",                       enabled: true,  approval: "per_session", risk: "write",       usage_count_30d: 312,  last_used_at: "21m ago" },
      { id: "tl_gh_4", name: "open_pr",             description: "Open a draft PR from an Athena-prepared branch.",                          enabled: true,  approval: "per_call",    risk: "write",       usage_count_30d: 47,   last_used_at: "1h ago" },
      { id: "tl_gh_5", name: "merge_pr",            description: "Merge a PR. Allowed only after CI passes and approvers sign off.",         enabled: false, approval: "per_call",    risk: "destructive", usage_count_30d: 0,    last_used_at: null },
      { id: "tl_gh_6", name: "delete_branch",       description: "Delete a remote branch.",                                                  enabled: false, approval: "per_call",    risk: "destructive", usage_count_30d: 0,    last_used_at: null },
      { id: "tl_gh_7", name: "list_actions_runs",   description: "List recent Actions workflow runs for a repo.",                            enabled: true,  approval: "none",        risk: "read",        usage_count_30d: 218,  last_used_at: "8m ago" },
    ],
    created_by_user_id: USER_ID,
    created_at: "2026-05-02T11:00:00Z",
  },
  {
    id: "mcp_jira",
    org_id: ORG_ID,
    slug: "jira",
    name: "Jira Cloud",
    source: "integration",
    integration_id: "int_jira",
    transport: "http",
    endpoint_url: "https://lumen.atlassian.net/mcp",
    auth: { method: "bearer", bearer_hint: "••• ending bP8a", last_rotated_at: "2 weeks ago" },
    egress_policy: "region_pinned",
    egress_region: "US (us-east-1)",
    version: "0.9.1",
    version_last_reviewed: "2026-05-09",
    health: {
      status: "connected",
      last_check_at: SERVER_TIME(),
      latency_p50_ms: 248,
      latency_p95_ms: 612,
      error_rate_24h: 0.004,
      uptime_30d: 0.998,
    },
    tools: [
      { id: "tl_ji_1", name: "search_issues",   description: "JQL search across the connected Jira projects.",     enabled: true,  approval: "none",        risk: "read",  usage_count_30d: 712, last_used_at: "20m ago" },
      { id: "tl_ji_2", name: "get_issue",       description: "Fetch an issue with comments + attachments.",        enabled: true,  approval: "none",        risk: "read",  usage_count_30d: 514, last_used_at: "9m ago" },
      { id: "tl_ji_3", name: "transition_issue",description: "Move an issue across the workflow (e.g. To Do → In Progress).", enabled: true,  approval: "per_session", risk: "write", usage_count_30d: 124, last_used_at: "1h ago" },
      { id: "tl_ji_4", name: "add_comment",     description: "Post a comment on an issue.",                        enabled: true,  approval: "per_session", risk: "write", usage_count_30d: 88,  last_used_at: "42m ago" },
      { id: "tl_ji_5", name: "create_issue",    description: "Create a new issue in a project.",                   enabled: false, approval: "per_call",    risk: "write", usage_count_30d: 0,   last_used_at: null },
    ],
    created_by_user_id: USER_ID,
    created_at: "2026-05-03T08:00:00Z",
  },
  {
    id: "mcp_notion",
    org_id: ORG_ID,
    slug: "notion",
    name: "Notion",
    source: "integration",
    integration_id: "int_notion",
    transport: "sse",
    endpoint_url: "https://mcp.notion.com/v1/sse",
    auth: { method: "oauth", oauth_app_id: "Athena · lumen", oauth_connected_as: "lumen.notion.so", last_rotated_at: "5 days ago" },
    egress_policy: "any",
    version: "2.1.0",
    version_last_reviewed: "2026-04-28",
    pending_drift: true,
    health: {
      status: "degraded",
      status_message: "p95 latency >1s for the last hour — Notion API may be under load.",
      last_check_at: SERVER_TIME(),
      latency_p50_ms: 612,
      latency_p95_ms: 1820,
      error_rate_24h: 0.018,
      uptime_30d: 0.991,
    },
    tools: [
      { id: "tl_no_1", name: "search_pages",   description: "Full-text search across workspaces Athena can read.",       enabled: true,  approval: "none",        risk: "read",  usage_count_30d: 412, last_used_at: "32m ago" },
      { id: "tl_no_2", name: "get_page",       description: "Fetch a page (blocks + properties).",                       enabled: true,  approval: "none",        risk: "read",  usage_count_30d: 308, last_used_at: "11m ago" },
      { id: "tl_no_3", name: "query_database", description: "Run a query against a Notion database.",                    enabled: true,  approval: "none",        risk: "read",  usage_count_30d: 198, last_used_at: "55m ago" },
      { id: "tl_no_4", name: "create_page",    description: "Create a page (e.g., publish a PRD draft into Notion).",    enabled: true,  approval: "per_session", risk: "write", usage_count_30d: 17,  last_used_at: "yesterday" },
      { id: "tl_no_5", name: "append_blocks",  description: "Append blocks to an existing page.",                        enabled: false, approval: "per_session", risk: "write", usage_count_30d: 0,   last_used_at: null },
      { id: "tl_no_6", name: "delete_page",    description: "Move a page to trash.",                                     enabled: false, approval: "per_call",    risk: "destructive", usage_count_30d: 0, last_used_at: null, added_since_review: true },
    ],
    created_by_user_id: USER_ID,
    created_at: "2026-05-05T14:30:00Z",
  },
  {
    id: "mcp_lumen_triage",
    org_id: ORG_ID,
    slug: "lumen-triage",
    name: "Lumen Triage Tools",
    source: "custom",
    transport: "http",
    endpoint_url: "https://mcp-triage.internal.lumen.dev/v1",
    auth: { method: "mtls", mtls_cert_subject: "CN=athena-prod, O=lumen", last_rotated_at: "3 weeks ago" },
    egress_policy: "vpc_peered",
    egress_region: "US (us-east-1)",
    version: "0.4.0-internal",
    version_last_reviewed: "2026-05-12",
    health: {
      status: "connected",
      last_check_at: SERVER_TIME(),
      latency_p50_ms: 38,
      latency_p95_ms: 72,
      error_rate_24h: 0.0,
      uptime_30d: 0.9999,
    },
    tools: [
      { id: "tl_tr_1", name: "lookup_routing_rule",   description: "Resolve a label → team mapping for a given workspace.",       enabled: true,  approval: "none",        risk: "read",        usage_count_30d: 184, last_used_at: "2h ago" },
      { id: "tl_tr_2", name: "preview_classification",description: "Run the triage classifier offline on a sample message.",     enabled: true,  approval: "none",        risk: "read",        usage_count_30d: 421, last_used_at: "3m ago" },
      { id: "tl_tr_3", name: "replay_decision",       description: "Re-classify a historical conversation against a new policy.", enabled: true,  approval: "per_session", risk: "read",        usage_count_30d: 64,  last_used_at: "yesterday" },
      { id: "tl_tr_4", name: "force_reroute",         description: "Override the auto-routing for an in-flight conversation.",   enabled: false, approval: "per_call",    risk: "destructive", usage_count_30d: 0,   last_used_at: null },
    ],
    created_by_user_id: "u_avi",
    created_at: "2026-05-10T09:00:00Z",
  },
  {
    id: "mcp_figma",
    org_id: ORG_ID,
    slug: "figma",
    name: "Figma",
    source: "integration",
    integration_id: "int_figma",
    transport: "http",
    endpoint_url: "https://mcp.figma.com/v1",
    auth: { method: "oauth", oauth_app_id: "Athena", oauth_connected_as: "design@lumen.dev", last_rotated_at: "61 days ago" },
    egress_policy: "any",
    version: "1.0.7",
    version_last_reviewed: "2026-03-22",
    health: {
      status: "error",
      status_message: "OAuth token expired. Reconnect Figma in Settings → Integrations.",
      last_check_at: SERVER_TIME(),
      latency_p50_ms: 0,
      latency_p95_ms: 0,
      error_rate_24h: 1.0,
      uptime_30d: 0.612,
    },
    tools: [
      { id: "tl_fg_1", name: "get_file",        description: "Fetch a Figma file's frame tree + metadata.",         enabled: true,  approval: "none",     risk: "read",  usage_count_30d: 0, last_used_at: "61 days ago" },
      { id: "tl_fg_2", name: "render_image",    description: "Render a frame as a PNG/SVG and return a URL.",       enabled: true,  approval: "none",     risk: "read",  usage_count_30d: 0, last_used_at: "61 days ago" },
      { id: "tl_fg_3", name: "list_components", description: "Enumerate components from a team's design library.",  enabled: true,  approval: "none",     risk: "read",  usage_count_30d: 0, last_used_at: "61 days ago" },
      { id: "tl_fg_4", name: "post_comment",    description: "Post a comment on a frame (e.g., reviewer feedback).",enabled: false, approval: "per_session", risk: "write", usage_count_30d: 0, last_used_at: null },
    ],
    created_by_user_id: USER_ID,
    created_at: "2026-03-21T10:00:00Z",
  },
];

/* Recent tool-call audit log — keyed by mcp_server_id, last ~10 each. */
export const mcpRecentCalls: Record<string, MockMcpRecentCall[]> = {
  mcp_github: [
    { id: "mc_g1", tool_id: "tl_gh_2", tool_name: "get_pr",         when: "4m ago",  created_at: SERVER_TIME(), actor: "agent:review",     task_id: "tsk_001", duration_ms: 184, status: "ok",    result_preview: "PR #412 · 12 files · 487+/23−" },
    { id: "mc_g2", tool_id: "tl_gh_1", tool_name: "search_issues",  when: "12m ago", created_at: SERVER_TIME(), actor: "agent:spec",       task_id: "tsk_001", duration_ms: 220, status: "ok",    result_preview: "8 issues · scope: ACH" },
    { id: "mc_g3", tool_id: "tl_gh_3", tool_name: "create_comment", when: "21m ago", created_at: SERVER_TIME(), actor: "agent:pr_builder", task_id: "tsk_001", duration_ms: 412, status: "ok",    result_preview: "Comment posted to PR #412" },
    { id: "mc_g4", tool_id: "tl_gh_4", tool_name: "open_pr",        when: "1h ago",  created_at: SERVER_TIME(), actor: "agent:pr_builder", task_id: "tsk_001", duration_ms: 1840, status: "ok",   result_preview: "Draft PR #412 opened" },
    { id: "mc_g5", tool_id: "tl_gh_2", tool_name: "get_pr",         when: "2h ago",  created_at: SERVER_TIME(), actor: "agent:review",     task_id: "tsk_003", duration_ms: 192, status: "ok",    result_preview: "PR #88 · 4 files · 67+/12−" },
  ],
  mcp_jira: [
    { id: "mc_j1", tool_id: "tl_ji_2", tool_name: "get_issue",        when: "9m ago",  created_at: SERVER_TIME(), actor: "agent:spec",   task_id: "tsk_003", duration_ms: 312, status: "ok",    result_preview: "FLEET-2147 · charger arbitration race" },
    { id: "mc_j2", tool_id: "tl_ji_1", tool_name: "search_issues",    when: "20m ago", created_at: SERVER_TIME(), actor: "agent:plan",   task_id: "tsk_003", duration_ms: 412, status: "ok",    result_preview: "12 issues · cap: fleet-ops" },
    { id: "mc_j3", tool_id: "tl_ji_3", tool_name: "transition_issue", when: "1h ago",  created_at: SERVER_TIME(), actor: "user:u_demo",  task_id: "tsk_001", duration_ms: 488, status: "ok",    result_preview: "ACME-1801 → In Progress" },
  ],
  mcp_notion: [
    { id: "mc_n1", tool_id: "tl_no_1", tool_name: "search_pages",   when: "11m ago", created_at: SERVER_TIME(), actor: "agent:spec",   task_id: "tsk_001", duration_ms: 1240, status: "ok",   result_preview: "14 pages · ACH onboarding runbook" },
    { id: "mc_n2", tool_id: "tl_no_2", tool_name: "get_page",       when: "32m ago", created_at: SERVER_TIME(), actor: "agent:spec",   task_id: "tsk_001", duration_ms: 1820, status: "ok",   result_preview: "Mid-market payments playbook" },
    { id: "mc_n3", tool_id: "tl_no_3", tool_name: "query_database", when: "55m ago", created_at: SERVER_TIME(), actor: "agent:plan",   task_id: "tsk_002", duration_ms: 920,  status: "ok",   result_preview: "47 tickets · pause-order tag" },
    { id: "mc_n4", tool_id: "tl_no_1", tool_name: "search_pages",   when: "1h ago",  created_at: SERVER_TIME(), actor: "agent:research", task_id: "tsk_002", duration_ms: 2100, status: "timeout", result_preview: "Request exceeded 2s deadline" },
  ],
  mcp_acme_warehouse: [
    { id: "mc_w1", tool_id: "tl_wh_2", tool_name: "locate_robot",  when: "3m ago",  created_at: SERVER_TIME(), actor: "agent:review", task_id: "tsk_003", duration_ms: 38, status: "ok", result_preview: "robot-A42 · aisle 7 · 78% battery" },
    { id: "mc_w2", tool_id: "tl_wh_1", tool_name: "query_inventory", when: "2h ago", created_at: SERVER_TIME(), actor: "agent:spec",  task_id: "tsk_003", duration_ms: 64, status: "ok", result_preview: "SKU 14882 · 412 units · aisle 7" },
  ],
  mcp_figma: [],
};

/* ------------------------------------------------------------- SSO + roles */
export interface MockSsoConfig {
  provider_id: string;
  provider_name: string;
  method: "SAML 2.0" | "OIDC";
  status: "enforced" | "optional" | "disabled";
  enforced_since: string;
  domains: string[];
  scim_enabled: boolean;
  scim_last_sync: string;
  scim_users_provisioned: number;
  scim_groups_mapped: number;
  jit_provisioning: boolean;
  session_timeout_hours: number;
  group_role_map: { group: string; role: string; count: number }[];
  cert_expires: string;
  metadata_url: string;
}

export const ssoConfig: MockSsoConfig = {
  provider_id: "int_okta",
  provider_name: "Okta",
  method: "SAML 2.0",
  status: "enforced",
  enforced_since: "2026-02-01",
  domains: ["lumen.dev"],
  scim_enabled: true,
  scim_last_sync: "4m ago",
  scim_users_provisioned: 14,
  scim_groups_mapped: 4,
  jit_provisioning: true,
  session_timeout_hours: 8,
  group_role_map: [
    { group: "lumen-admins",    role: "admin",    count: 2 },
    { group: "lumen-engineers", role: "engineer", count: 8 },
    { group: "lumen-pms",       role: "pm",       count: 2 },
    { group: "lumen-reviewers", role: "reviewer", count: 2 },
  ],
  cert_expires: "2027-01-14",
  metadata_url: "https://athena.example.com/saml/lumen/metadata",
};

/* ------------------------------------------------------------- audit events */
export const auditEvents: AuditEvent[] = [
  { id: "ae_001", org_id: ORG_ID, actor_kind: "user",   actor_id: USER_ID,    action: "task.spec.approved",          resource_kind: "task",        resource_id: "tsk_001", metadata: { version: "v3" },                            ip_address: "73.218.4.12",  user_agent: "Chrome/138 macOS", prev_hash: null,  hash: "h_001", created_at: "2026-05-22T14:32:10Z" },
  { id: "ae_002", org_id: ORG_ID, actor_kind: "agent",  actor_id: "athena",   action: "agent.spec_builder.completed",resource_kind: "task",        resource_id: "tsk_001", metadata: { artifact: "spec.md@v3" },                   ip_address: null,           user_agent: null,                prev_hash: "h_001",hash: "h_002", created_at: "2026-05-22T14:30:55Z" },
  { id: "ae_003", org_id: ORG_ID, actor_kind: "user",   actor_id: "u_tomas",  action: "integration.api_token.created",resource_kind: "api_token", resource_id: "tok_3",   metadata: { name: "audit-export" },                     ip_address: "73.218.4.12",  user_agent: "Chrome/138 macOS", prev_hash: "h_002",hash: "h_003", created_at: "2026-05-22T14:18:02Z" },
  { id: "ae_004", org_id: ORG_ID, actor_kind: "user",   actor_id: "u_avi",    action: "task.plan.approved",          resource_kind: "task",        resource_id: "tsk_003", metadata: { version: "v1" },                            ip_address: "45.91.22.7",   user_agent: "Chrome/138 macOS", prev_hash: "h_003",hash: "h_004", created_at: "2026-05-22T13:46:11Z" },
  { id: "ae_005", org_id: ORG_ID, actor_kind: "system", actor_id: "scim",     action: "scim.user.provisioned",       resource_kind: "member",      resource_id: "u_dana",  metadata: { source: "Okta" },                           ip_address: null,           user_agent: null,                prev_hash: "h_004",hash: "h_005", created_at: "2026-05-22T13:12:48Z" },
  { id: "ae_006", org_id: ORG_ID, actor_kind: "user",   actor_id: "u_jordan", action: "settings.cost.budget_changed",resource_kind: "capability",  resource_id: "cap_billing", metadata: { from: 4000, to: 5500 },                  ip_address: "73.218.4.12",  user_agent: "Chrome/138 macOS", prev_hash: "h_005",hash: "h_006", created_at: "2026-05-22T11:04:22Z" },
  { id: "ae_007", org_id: ORG_ID, actor_kind: "agent",  actor_id: "athena",   action: "agent.code_writer.completed", resource_kind: "task",        resource_id: "tsk_005", metadata: {},                                           ip_address: null,           user_agent: null,                prev_hash: "h_006",hash: "h_007", created_at: "2026-05-22T10:18:39Z" },
  { id: "ae_008", org_id: ORG_ID, actor_kind: "user",   actor_id: "u_owen",   action: "member.role.changed",         resource_kind: "member",      resource_id: "u_jordan2", metadata: { from: "reviewer", to: "engineer" },        ip_address: "82.4.66.39",   user_agent: "Chrome/138 macOS", prev_hash: "h_007",hash: "h_008", created_at: "2026-05-22T09:55:01Z" },
  { id: "ae_009", org_id: ORG_ID, actor_kind: "user",   actor_id: "u_avi",    action: "integration.github.repo_added",resource_kind: "repo",       resource_id: "billing-svc", metadata: {},                                        ip_address: "45.91.22.7",   user_agent: "Chrome/138 macOS", prev_hash: "h_008",hash: "h_009", created_at: "2026-05-22T09:24:14Z" },
  { id: "ae_010", org_id: ORG_ID, actor_kind: "agent",  actor_id: "athena",   action: "ci.gate_passed",              resource_kind: "task",        resource_id: "tsk_005", metadata: { checks: "11/11" },                          ip_address: null,           user_agent: null,                prev_hash: "h_009",hash: "h_010", created_at: "2026-05-22T08:11:42Z" },
  { id: "ae_011", org_id: ORG_ID, actor_kind: "user",   actor_id: "anonymous",action: "auth.login.failed",           resource_kind: null,          resource_id: null,      metadata: { reason: "SSO required" },                    ip_address: "203.0.113.4",  user_agent: "Firefox/126",       prev_hash: "h_010",hash: "h_011", created_at: "2026-05-21T22:45:08Z" },
  { id: "ae_012", org_id: ORG_ID, actor_kind: "user",   actor_id: USER_ID,    action: "task.created",                resource_kind: "task",        resource_id: "tsk_002", metadata: {},                                           ip_address: "73.218.4.12",  user_agent: "Chrome/138 macOS", prev_hash: "h_011",hash: "h_012", created_at: "2026-05-21T19:32:51Z" },
  { id: "ae_013", org_id: ORG_ID, actor_kind: "user",   actor_id: "u_tomas",  action: "sso.config.changed",          resource_kind: "org",         resource_id: ORG_ID,    metadata: { field: "groupRoleMap" },                    ip_address: "73.218.4.12",  user_agent: "Chrome/138 macOS", prev_hash: "h_012",hash: "h_013", created_at: "2026-05-21T17:08:30Z" },
  { id: "ae_014", org_id: ORG_ID, actor_kind: "agent",  actor_id: "athena",   action: "agent.ci_triager.healed",     resource_kind: "task",        resource_id: "tsk_001", metadata: { repo: "billing-web" },                       ip_address: null,           user_agent: null,                prev_hash: "h_013",hash: "h_014", created_at: "2026-05-21T15:44:19Z" },
  { id: "ae_015", org_id: ORG_ID, actor_kind: "user",   actor_id: "u_jordan", action: "task.review.commented",       resource_kind: "task",        resource_id: "tsk_002", metadata: {},                                           ip_address: "73.218.4.12",  user_agent: "Chrome/138 macOS", prev_hash: "h_014",hash: "h_015", created_at: "2026-05-21T14:01:55Z" },
];

/* ------------------------------------------------------------- API tokens */
export const apiTokens: ApiTokenSummary[] = [
  { id: "tok_1", name: "ci-readonly",     prefix: "ath_live_8k…fT2", scopes: ["tasks:read","activity:read"],                  expires_at: null,                          last_used_at: "2026-05-22T14:28:00Z", revoked_at: null, created_at: "2026-05-01T10:00:00Z" },
  { id: "tok_2", name: "slackbot-ingest", prefix: "ath_live_92…hH9", scopes: ["chat:write","tasks:read","notifications:write"],expires_at: "2027-02-01T00:00:00Z",         last_used_at: "2026-05-22T14:31:30Z", revoked_at: null, created_at: "2026-05-08T10:00:00Z" },
  { id: "tok_3", name: "audit-export",    prefix: "ath_live_Lm…s4P", scopes: ["audit:read"],                                  expires_at: "2027-05-22T00:00:00Z",         last_used_at: "2026-05-22T12:00:00Z", revoked_at: null, created_at: "2026-05-17T10:00:00Z" },
  { id: "tok_4", name: "cli-dev",         prefix: "ath_live_q4…X0v", scopes: ["tasks:read","tasks:write"],                    expires_at: "2026-08-22T00:00:00Z",         last_used_at: "2026-05-21T16:00:00Z", revoked_at: null, created_at: "2026-05-21T10:00:00Z" },
];

/* --------------------------------------------------------- model providers */
export interface MockModelProvider {
  id: string;
  provider: string;
  via: string;
  region: string;
  status: "primary" | "available" | "enabled";
  enabled_models: string[];
  request_count: number;
  cost_mtd: number;
  residency_note: string;
}

export const modelProviders: MockModelProvider[] = [
  { id: "mp_anthropic_direct",  provider: "Anthropic", via: "direct",       region: "us-east-1",    status: "primary",   enabled_models: ["claude-opus-4-7","claude-sonnet-4-6","claude-haiku-4-5"], request_count: 22324, cost_mtd: 5100, residency_note: "Anthropic-hosted. Zero-retention enterprise terms." },
  { id: "mp_anthropic_bedrock", provider: "Anthropic", via: "AWS Bedrock",  region: "eu-central-1", status: "available", enabled_models: ["claude-opus-4-7","claude-sonnet-4-6"],                   request_count: 0,     cost_mtd: 0,    residency_note: "EU-only routing. Inherits your AWS BAA + IAM." },
  { id: "mp_openai_azure",      provider: "OpenAI",    via: "Azure OpenAI", region: "eastus2",      status: "available", enabled_models: ["gpt-5","gpt-4o"],                                        request_count: 0,     cost_mtd: 0,    residency_note: "Uses your Azure subscription's data-handling agreement." },
  { id: "mp_openai_direct",     provider: "OpenAI",    via: "direct",       region: "us-east-1",    status: "enabled",   enabled_models: ["gpt-5"],                                                 request_count: 412,   cost_mtd: 478,  residency_note: "Direct API. Enterprise zero-retention available on request." },
  { id: "mp_gemini_vertex",     provider: "Google",    via: "Vertex AI",    region: "us-central1",  status: "available", enabled_models: ["gemini-2-pro"],                                          request_count: 188,   cost_mtd: 264,  residency_note: "Vertex AI in your GCP project." },
];

/* ----------------------------------------------------------------- privacy */
export const privacySettings = {
  redaction: {
    enabled: true,
    classes: [
      { id: "pii_email", label: "Email addresses",     enabled: true,  description: "Mask before sending to model." },
      { id: "pii_phone", label: "Phone numbers",       enabled: true,  description: "Mask before sending to model." },
      { id: "pii_ssn",   label: "SSN / national IDs",  enabled: true,  description: "Block. Never sent to model." },
      { id: "pci_pan",   label: "Credit card numbers", enabled: true,  description: "Block. Never sent to model." },
      { id: "secret",    label: "API keys + secrets",  enabled: true,  description: "Detected via entropy + known prefixes; block + alert." },
      { id: "phi",       label: "PHI (health)",        enabled: false, description: "Off — enable for healthcare orgs (BAA required)." },
    ],
    last_updated: "2 weeks ago",
    last_updated_by: "Tomas Lind",
  },
  data_retention: {
    task_artifacts: "90 days then archive",
    chat_history: "180 days",
    audit_events: "7 years",
    raw_customer_context_in_prompts: "Not retained — context is built per-request from indexed knowledge",
  },
  encryption: {
    at_rest: "AES-256, KMS-managed",
    in_transit: "TLS 1.3",
    byok: { enabled: false, status: "Available on Enterprise plan", provider: "AWS KMS / Azure Key Vault" },
  },
  residency: {
    primary_region: "US (us-east-1)",
    available: ["US","EU (eu-central-1)","UK (eu-west-2)","Canada (ca-central-1)","Australia (ap-southeast-2)"],
    model_egress: "Region-pinned per provider above.",
  },
};

/* ------------------------------------------------------------------- inbox */
export interface MockInboxItem {
  id: string;
  kind: "review_requested" | "mention" | "approval_needed" | "ci_failed" | "comment" | "budget_alert" | "digest";
  priority: "high" | "normal" | "low";
  when: string;
  task_id?: string;
  title: string;
  actor: string;
  actor_avatar?: string;
  actor_kind: "agent" | "human";
  context: string;
  cta: string;
  phase?: string;
  to?: string;
}

export const inboxItems: MockInboxItem[] = [
  { id: "ib_1", kind: "review_requested",priority: "high",   when: "12m ago", task_id: "tsk_002", title: "Sign-off needed: Workspace snooze for hospitality",  actor: "Athena",     actor_avatar: "AT", actor_kind: "agent", context: "PRD v2 ready for your final approval. Priya + Avi + Jordan have weighed in.", cta: "Open Sign-off", phase: "signoff" },
  { id: "ib_2", kind: "mention",        priority: "normal", when: "38m ago", task_id: "tsk_001", title: "@maya — Avi tagged you on the PR thread",            actor: "Avi Patel",  actor_avatar: "AP", actor_kind: "human", context: "\"Should we cut a follow-up for retroactive ACH on existing invoices, or wait for production data?\"", cta: "Reply in thread", phase: "pr" },
  { id: "ib_3", kind: "approval_needed",priority: "normal", when: "1h ago",  task_id: "tsk_001", title: "Spec approved · plan now needs your sign-off",       actor: "Athena",     actor_avatar: "AT", actor_kind: "agent", context: "Engineering proposed splitting the migration + webhook into 2 subtasks.",   cta: "Review plan",     phase: "plan" },
  { id: "ib_4", kind: "ci_failed",      priority: "high",   when: "2h ago",  task_id: "tsk_001", title: "CI gate is in-flight · 1 check failed",              actor: "Athena",     actor_avatar: "AT", actor_kind: "agent", context: "billing-web visual regression. CI triager classified as deterministic.",   cta: "Open CI",          phase: "ci" },
  { id: "ib_5", kind: "comment",        priority: "normal", when: "yesterday",task_id: "tsk_002", title: "Priya left 3 comments on spec.md",                   actor: "Priya Shah", actor_avatar: "PS", actor_kind: "human", context: "Re: date-picker UX. Wants calendar widget over dropdown.",                 cta: "View comments",    phase: "signoff" },
  { id: "ib_6", kind: "budget_alert",   priority: "normal", when: "yesterday",                   title: "Billing capability at 93% of monthly budget",         actor: "Athena",     actor_avatar: "AT", actor_kind: "agent", context: "Projected to exceed by May 28. Consider routing more Plan calls to Sonnet.",cta: "Open Cost",        to: "/cost" },
  { id: "ib_7", kind: "digest",         priority: "low",    when: "2d ago",                       title: "Weekly digest: 4 tasks shipped, 2 in flight",         actor: "Athena",     actor_avatar: "AT", actor_kind: "agent", context: "Lead time: 6.2 days (-12% wow). Throughput: 4 (+1 wow). 0 incidents.",      cta: "Open digest",      to: "/activity" },
];

/* -------------------------------------------------------------------- cost */
export const costData = {
  month: "May 2026",
  spend_usd: 6842,
  forecast_usd: 9300,
  budget_usd: 10000,
  budget_utilization: 0.93,
  trend: "+18%",
  spend_daily: [
    { day: "May 1",  usd: 142 },{ day: "May 2",  usd: 188 },{ day: "May 3",  usd: 201 },{ day: "May 4",  usd: 97 },
    { day: "May 5",  usd: 312 },{ day: "May 6",  usd: 268 },{ day: "May 7",  usd: 344 },{ day: "May 8",  usd: 289 },
    { day: "May 9",  usd: 412 },{ day: "May 10", usd: 478 },{ day: "May 11", usd: 521 },{ day: "May 12", usd: 354 },
    { day: "May 13", usd: 298 },{ day: "May 14", usd: 380 },{ day: "May 15", usd: 402 },{ day: "May 16", usd: 368 },
    { day: "May 17", usd: 289 },{ day: "May 18", usd: 441 },{ day: "May 19", usd: 478 },{ day: "May 20", usd: 519 },
    { day: "May 21", usd: 432 },{ day: "May 22", usd: 431 },
  ],
  spend_by_capability: [
    { id: "cap_billing",  name: "Billing & Subscriptions", usd: 2614, pct: 0.38, budget: 3500, trend: "+22%", top_task: "Add Stripe ACH support" },
    { id: "cap_inbox",    name: "Inbox & Conversations",   usd: 1842, pct: 0.27, budget: 2800, trend: "+9%",  top_task: "Triage confidence revisit" },
    { id: "cap_data",     name: "Data Platform",           usd: 1294, pct: 0.19, budget: 1800, trend: "+34%", top_task: "Usage rollup migration" },
    { id: "cap_platform", name: "Platform & Identity",     usd: 1092, pct: 0.16, budget: 1900, trend: "+11%", top_task: "Workspace snooze (PRD)" },
  ],
  spend_by_model: [
    { id: "claude-opus-4-7",   name: "Claude Opus 4.7",   provider: "Anthropic", usd: 3941, pct: 0.58, calls: 4218,  input_tok_k: 1842, output_tok_k: 412 },
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "Anthropic", usd: 1521, pct: 0.22, calls: 6122,  input_tok_k: 3018, output_tok_k: 541 },
    { id: "claude-haiku-4-5",  name: "Claude Haiku 4.5",  provider: "Anthropic", usd: 638,  pct: 0.09, calls: 11984, input_tok_k: 5104, output_tok_k: 881 },
    { id: "gpt-5",             name: "GPT-5",             provider: "OpenAI",    usd: 478,  pct: 0.07, calls: 412,   input_tok_k: 184,  output_tok_k: 38 },
    { id: "gemini-2-pro",      name: "Gemini 2 Pro",      provider: "Vertex AI", usd: 264,  pct: 0.04, calls: 188,   input_tok_k: 412,  output_tok_k: 64 },
  ],
  spend_by_phase: [
    { name: "Spec",      usd: 1278, pct: 0.19 },
    { name: "Plan",      usd: 1424, pct: 0.21 },
    { name: "Implement", usd: 2752, pct: 0.40 },
    { name: "Review",    usd: 730,  pct: 0.11 },
    { name: "CI Gate",   usd: 532,  pct: 0.07 },
    { name: "PR",        usd: 126,  pct: 0.02 },
  ],
  top_tasks: [
    { id: "tsk_001", title: "Add Stripe ACH support for mid-market invoices",       usd: 472, runs: 11, last_used: "42m ago" },
    { id: "tsk_002", title: "Self-serve workspace snooze for hospitality customers", usd: 241, runs: 6,  last_used: "yesterday" },
  ],
  alerts: [
    { level: "warning", text: "Billing capability at 93% of monthly budget — projected to exceed by May 28." },
    { level: "info",    text: "Sonnet 4.6 routing saved an estimated $1,840 vs all-Opus this month." },
  ],
};

/* ------------------------------------------------------------------ skills */
export interface MockSkill {
  id: string;
  name: string;
  slug: string;
  version: string;
  status: "active" | "draft";
  description: string;
  icon: string;
  phases: string[];
  attached_capabilities: string[];
  usage_count: number;
  last_used: string;
}

export interface MockSkillDetail extends MockSkill {
  system_prompt: string;
  knowledge_refs: { kind: string; id: string; title: string }[];
  author: string;
  last_updated: string;
}

export const skillDetails: Record<string, MockSkillDetail> = {
  skl_stripe: {
    id: "skl_stripe", name: "Stripe payments expert", slug: "stripe-expert", version: "v4", status: "active",
    description: "Deep knowledge of Stripe Elements, Connect, ACH, dispute lifecycle, SCA, and webhook idempotency. Surfaces Stripe-specific gotchas during spec and review.",
    icon: "circle-dollar", phases: ["spec","plan","review"],
    attached_capabilities: ["cap_billing"], usage_count: 47, last_used: "2h ago",
    author: "Maya Rao", last_updated: "1 week ago",
    system_prompt: "You are a Stripe integration expert. When drafting specs or reviewing changes that touch Stripe, you ALWAYS:\n1. Surface the relevant ADRs (especially ADR-014 on money handling).\n2. Verify idempotency on every webhook handler.\n3. Flag any payment-data flow through non-Stripe-Elements code paths.\n4. Distinguish card vs ACH chargeback windows (60 vs 7-60 days).\n5. Refuse auto-retry on ACH disputes (per ADR-014).",
    knowledge_refs: [
      { kind: "ADR",  id: "ADR-014", title: "Money handling" },
      { kind: "doc",  id: "stripe-runbook", title: "Stripe ACH runbook" },
      { kind: "node", id: "n3", title: "InvoiceStateMachine" },
    ],
  },
  skl_pci: {
    id: "skl_pci", name: "Payment-data sensitivity auditor", slug: "payment-data-auditor", version: "v2", status: "active",
    description: "Audits every diff for handling of payment instruments (PAN, CVV, account numbers). Flags any change that moves these through code paths that aren't already classified as sensitive.",
    icon: "shield", phases: ["review","ci"],
    attached_capabilities: ["cap_billing"], usage_count: 31, last_used: "6h ago",
    author: "Tomas Lind", last_updated: "3 weeks ago",
    system_prompt: "You are a payment-data sensitivity auditor. For every diff:\n1. Search for PAN / CVV / track-data patterns.\n2. Verify Stripe Elements (not our origin) handles all sensitive entry.\n3. Flag any new env var or config that looks like a key.",
    knowledge_refs: [{ kind: "ADR", id: "ADR-014", title: "Money handling" }],
  },
  skl_rls: {
    id: "skl_rls", name: "RLS / tenant-isolation checker", slug: "rls-checker", version: "v3", status: "active",
    description: "Verifies every new tenant-bearing table has RLS ENABLE + FORCE + a policy keyed on org_id. Per ADR-015 + Phase 5.3 RLS.",
    icon: "lock", phases: ["plan","review","ci"],
    attached_capabilities: ["cap_billing","cap_platform","cap_data","cap_inbox"], usage_count: 142, last_used: "30m ago",
    author: "Avi Patel", last_updated: "2 weeks ago",
    system_prompt: "You are an RLS auditor. For every migration:\n1. Verify ENABLE + FORCE RLS on every new table.\n2. Verify a policy keyed on `current_setting('athena.current_org_id')`.\n3. Reject migrations that add tenant-bearing tables without policies.",
    knowledge_refs: [{ kind: "ADR", id: "ADR-015", title: "Tenancy isolation" }],
  },
};

export const skills: MockSkill[] = [
  { id: "skl_stripe",            name: "Stripe payments expert",          slug: "stripe-expert",        version: "v4", status: "active", description: "Deep knowledge of Stripe Elements, Connect, ACH, dispute lifecycle, SCA, and webhook idempotency.",                            icon: "circle-dollar", phases: ["spec","plan","review"],   attached_capabilities: ["cap_billing"],                                          usage_count: 47,  last_used: "2h ago"     },
  { id: "skl_pci",               name: "Payment-data sensitivity auditor",slug: "payment-data-auditor", version: "v2", status: "active", description: "Audits every diff for handling of payment instruments (PAN, CVV, account numbers). Flags any change that moves these through non-Elements paths.", icon: "shield",         phases: ["review","ci"],            attached_capabilities: ["cap_billing"],                                          usage_count: 31,  last_used: "6h ago"     },
  { id: "skl_rls",               name: "RLS / tenant-isolation checker",  slug: "rls-checker",          version: "v3", status: "active", description: "Verifies every new tenant-bearing table has RLS + a policy keyed on workspace_id.",                                            icon: "lock",            phases: ["plan","review","ci"],     attached_capabilities: ["cap_billing","cap_platform","cap_data","cap_inbox"],     usage_count: 142, last_used: "30m ago"    },
  { id: "skl_migration_safety",  name: "Migration safety reviewer",        slug: "migration-safety",    version: "v1", status: "active", description: "Reviews schema migrations for locking risk, backfill behaviour, and expand-migrate-contract correctness.",                  icon: "database",        phases: ["plan","review","ci"],     attached_capabilities: ["cap_billing","cap_data","cap_platform"],                 usage_count: 18,  last_used: "yesterday"  },
  { id: "skl_adr_linker",        name: "ADR linker",                       slug: "adr-linker",          version: "v2", status: "active", description: "During spec drafting, surfaces every ADR + convention + past design relevant to the change.",                                icon: "book-open",       phases: ["spec"],                    attached_capabilities: ["cap_billing","cap_inbox","cap_platform","cap_data"],     usage_count: 89,  last_used: "42m ago"    },
  { id: "skl_triage_quality",    name: "Triage policy reviewer",           slug: "triage-quality",      version: "v1", status: "active", description: "For Inbox: reviews any change to triage labels, confidence thresholds, or routing rules. Catches per-label threshold drift.", icon: "compass",         phases: ["plan","review"],          attached_capabilities: ["cap_inbox"],                                           usage_count: 14,  last_used: "1d ago"     },
  { id: "skl_perf",              name: "p99 latency guardian",             slug: "p99-guardian",        version: "v1", status: "draft",  description: "For Inbox: any change to the routing / hydration paths runs through a synthetic load profile before review.",                  icon: "zap",             phases: ["plan","review","ci"],     attached_capabilities: ["cap_inbox"],                                           usage_count: 4,   last_used: "3 days ago" },
  { id: "skl_pm_voice",          name: "PM voice for spec drafts",         slug: "pm-voice",            version: "v3", status: "active", description: "Rewrites every spec draft in product voice — plain language, user-first framing, non-engineer success metrics.",          icon: "users",           phases: ["spec"],                    attached_capabilities: ["cap_billing","cap_inbox","cap_platform"],                usage_count: 28,  last_used: "5h ago"     },
  { id: "skl_test_gen",          name: "Test scaffold generator",          slug: "test-scaffold",       version: "v2", status: "active", description: "Generates unit + integration test scaffolds. Refuses to skip tests on payment paths.",                                    icon: "check",           phases: ["implement"],               attached_capabilities: ["cap_billing","cap_inbox","cap_data"],                    usage_count: 64,  last_used: "1h ago"     },
  { id: "skl_ci_triage",         name: "CI failure triager",               slug: "ci-triager",          version: "v1", status: "active", description: "Classifies CI failures (flake / real bug / infra / dependency) and either auto-fixes or escalates.",                       icon: "refresh-cw",      phases: ["ci"],                      attached_capabilities: ["cap_billing","cap_inbox","cap_data","cap_platform"],     usage_count: 51,  last_used: "20m ago"    },
];

/* ----------------------------------------------------------------- activity */
export interface MockActivityItem {
  id: string;
  cap_id?: string;
  who: string;
  who_avatar?: string;
  who_kind: "agent" | "human";
  text: string;       // HTML-safe (no user-supplied input)
  tech: string;
  when: string;
  task_id?: string;
}

export const activity: MockActivityItem[] = [
  { id: "a1", cap_id: "cap_billing",  who: "Athena",     who_avatar: "AT", who_kind: "agent",  text: "Drafted <strong>spec.md v3</strong> for Add Stripe ACH support — incorporating payment-data flow notes from Maya.", tech: "agent.spec_builder.completed run_id=tsk_001 artifact=spec.md@v3 cost_usd=0.0142", when: "42m ago", task_id: "tsk_001" },
  { id: "a2", cap_id: "cap_billing",  who: "Maya Rao",   who_avatar: "MR", who_kind: "human",  text: "Approved <strong>spec.md v3</strong>. Next gate: <em>plan</em>.",                                                    tech: "gate.spec_approved task=tsk_001 actor=user:u_maya version=3",                     when: "39m ago", task_id: "tsk_001" },
  { id: "a3", cap_id: "cap_billing",  who: "Athena",     who_avatar: "AT", who_kind: "agent",  text: "Built the implementation <strong>plan.md</strong> — 6 sub-tasks across 3 repos. Awaiting engineering review.",    tech: "agent.plan_builder.completed run_id=tsk_001 artifact=plan.md@v1",                 when: "30m ago", task_id: "tsk_001" },
  { id: "a4", cap_id: "cap_platform", who: "Maya Rao",   who_avatar: "MR", who_kind: "human",  text: "Opened PRD task <strong>Self-serve workspace snooze</strong> from the hospitality customer workshop.",            tech: "task.created task=tsk_002 intent=generate_prd thread=thr_1",                      when: "2h ago",  task_id: "tsk_002" },
  { id: "a5", cap_id: "cap_inbox",    who: "Athena",     who_avatar: "AT", who_kind: "agent",  text: "Surfaced a domain pattern worth saving: triage confidence threshold has moved from 0.75 → 0.85 over 6 months.",  tech: "agent.chat.tool_call name=propose_domain_note capability=cap_inbox",              when: "yesterday" },
  { id: "a6", cap_id: "cap_inbox",    who: "Avi Patel",  who_avatar: "AP", who_kind: "human",  text: "Started a chat thread: How does our triage worker decide when to escalate to a human?",                          tech: "chat.thread_created thread=thr_3 scope=cap_inbox",                                when: "yesterday" },
  { id: "a7", cap_id: "cap_platform", who: "Athena",     who_avatar: "AT", who_kind: "agent",  text: "Workspace state machine touched in PRD draft. Confirmed paused/active/snoozed transitions in ADR-018.",         tech: "agent.research.adr_linked task=tsk_002 adr=ADR-018",                              when: "3h ago",  task_id: "tsk_002" },
];

/* ------------------------------------------------------------- chat threads
 *
 * Five fully-worked example conversations, each demonstrating a different
 * Athena capability:
 *
 *   thr_1 — PRD framing  → produced tsk_002 (workspace snooze PRD)
 *   thr_2 — Bug → task    → produced tsk_001 (Stripe ACH implementation)
 *   thr_3 — Codebase Q&A  → multi-turn citations, no task
 *   thr_4 — Architecture  → org-scoped routing-engine deep-dive, no task
 *   thr_5 — Skill lookup  → short ad-hoc query showing skill registry
 */
export interface MockChatThread {
  id: string;
  title: string;
  scope: { kind: "capability" | "org"; id?: string; label: string };
  preview: string;
  updated_at: string;
  created_task?: { id: string; kind: "implement" | "prd"; goal: string } | null;
  flavour?: "prd_framing" | "bug_investigation" | "codebase_qa" | "architecture" | "knowledge_lookup" | null;
  messages: {
    role: "user" | "assistant" | "task_created";
    who: string;
    avatar: string;
    content: string;
    citations?: { label: string; kind: "file" | "adr" | "doc" | "ticket" | "pr" | "skill" | "url"; ref?: string }[];
  }[];
}

export const chatThreads: MockChatThread[] = [
  /* ─── thr_1: PRD framing → produced tsk_002 ─────────────────────────── */
  {
    id: "thr_1",
    title: "Hospitality customers keep asking to pause for slow season",
    scope: { kind: "org", label: "Lumen · org-wide" },
    preview: "Started a PRD task: Self-serve workspace snooze for hospitality customers.",
    updated_at: "2h ago",
    flavour: "prd_framing",
    created_task: { id: "tsk_002", kind: "prd", goal: "Self-serve workspace snooze for hospitality customers" },
    messages: [
      { role: "user", who: "Maya Rao", avatar: "MR",
        content: "We just got off the hospitality customer workshop — half the room asked if they could 'pause Lumen' for their slow season instead of cancelling. Today they have to email their AM. Is this a real signal or just three loud customers?" },
      { role: "assistant", who: "Athena", avatar: "AT",
        content: "It looks like a real signal. I'm seeing three independent corroborating sources over the last 90 days. Pulled them together below.\n\n• <strong>Zendesk</strong> — 47 tickets tagged <code>pause-order</code>, +22% Q-o-Q. 60% of them are hospitality accounts.\n• <strong>Win/loss interviews</strong> — 3 of 8 hospitality prospects called out 'no way to pause' as a competitive gap in the last quarter.\n• <strong>Q3 NPS verbatims</strong> — 12 detractor quotes specifically mention 'rigid workflow' or 'have to call to pause'.\n\nIt's also blocking the 'auto-pause on payment failure' project Jordan has on her Q3 list — that one assumes a manual pause flow already exists.",
        citations: [
          { label: "Zendesk · 47 tickets", kind: "ticket", ref: "zendesk:tag=pause-order&range=90d" },
          { label: "Win/loss · Q4 hospitality", kind: "doc", ref: "drive://win-loss-hospitality-q4.md" },
          { label: "Q3 NPS verbatims", kind: "doc", ref: "drive://nps-q3-verbatims.xlsx" },
        ] },
      { role: "user", who: "Maya Rao", avatar: "MR",
        content: "OK. What's the cheapest version that solves it for mid-market? Don't include enterprise — that's a different sales motion." },
      { role: "assistant", who: "Athena", avatar: "AT",
        content: "We've shipped two adjacent flows that give us almost the whole UX for free:\n\n1. <strong>Subscription pause</strong> (Q2 '25) — same picker-+-resume-date pattern. 14% of card customers use it. Median pause length: 18 days. We can reuse the same React component and the same audit pipeline.\n2. <strong>Region-level suspension</strong> (Q4 '24) — ops-only, but it already wires through the <code>workspace.paused</code> state in identity-svc. The state exists; we just don't expose it to customers.\n\nSo the cheapest version is: expose the existing <code>workspace.paused</code> state behind a self-serve UI with explicit resume-date and email reminders. ADR-018 already defines paused vs cancelled cleanly, ADR-027 governs reversible customer actions.",
        citations: [
          { label: "ADR-018 · Workspace state machine", kind: "adr", ref: "adr-018" },
          { label: "ADR-027 · Reversible customer actions", kind: "adr", ref: "adr-027" },
          { label: "Past PRD · Subscription pause", kind: "doc", ref: "prd_subs_pause" },
          { label: "Past PRD · Region suspension (ops)", kind: "doc", ref: "prd_region_close" },
        ] },
      { role: "user", who: "Maya Rao", avatar: "MR",
        content: "Good. Spin this up as a PRD task. Mid-market hospitality only, point it at cap_platform since the state lives in identity-svc." },
      { role: "assistant", who: "Athena", avatar: "AT",
        content: "Done. Created PRD task <strong>tsk_002</strong> on capability Platform &amp; Identity. I've pre-loaded the four citations above into the Frame phase as evidence, and seeded the first clarifying question (segment scope) as already answered. You'll land in the Frame phase — Athena has 47 ticket excerpts indexed and ready to cite as you draft." },
      { role: "task_created", who: "Athena", avatar: "AT",
        content: "tsk_002" },
    ],
  },

  /* ─── thr_2: Bug investigation → produced tsk_001 ───────────────────── */
  {
    id: "thr_2",
    title: "We're losing mid-market deals — invoices >$5k are card-only",
    scope: { kind: "capability", id: "cap_billing", label: "Billing & Subscriptions" },
    preview: "Started an Implement task: Add Stripe ACH support for mid-market invoices.",
    updated_at: "5h ago",
    flavour: "bug_investigation",
    created_task: { id: "tsk_001", kind: "implement", goal: "Add Stripe ACH support for mid-market invoices" },
    messages: [
      { role: "user", who: "Maya Rao", avatar: "MR",
        content: "Got a complaint from the CFO at Foundry that they can't pay our $24k annual invoice by ACH — only card. Their finance team won't put that on a card. Is this just Foundry or are we leaving money on the table?" },
      { role: "assistant", who: "Athena", avatar: "AT",
        content: "It's not just Foundry. Looking at the billing-svc checkout config, ACH was never wired in — the codebase only registers <code>'card'</code> as a Stripe Checkout <code>payment_method_types</code> entry. I checked <code>src/checkout/index.ts</code> at line 47 and the only registered handler is <code>cardCheckout</code>. There's no ACH file in <code>src/checkout/</code> at all.\n\nFrom a quick scan of Salesforce closed-lost reasons for mid-market deals in the last 90 days, 4 of 23 lost deals (~17%) cite 'payment terms' or 'ACH only' as a stated reason.",
        citations: [
          { label: "billing-svc/src/checkout/index.ts:47", kind: "file", ref: "lumen/billing-svc:src/checkout/index.ts#L47" },
          { label: "Salesforce closed-lost · 90d", kind: "doc", ref: "salesforce://reports/lost-mid-market" },
        ] },
      { role: "user", who: "Maya Rao", avatar: "MR",
        content: "What's the actual breakeven for ACH vs card? Where's the threshold?" },
      { role: "assistant", who: "Athena", avatar: "AT",
        content: "On Stripe's pricing, card interchange is 2.9% + $0.30. ACH is 0.8% capped at $5. The crossover where ACH becomes economically cheaper than card is ~$240, but the operational complexity (4-day settlement, dispute handling, longer dispute window) only justifies the spend on larger invoices.\n\n<strong>ADR-014 (Money handling)</strong> caps the dispute window concern by forbidding auto-retry on ACH disputes — Finance handles each one manually. Given the manual-handling cost, the practical breakeven is around $5,000 / invoice. Below that, the interchange savings don't cover the ops time.\n\nMid-market ACVs are $25k–$250k — every renewal invoice in that band is comfortably over $5k.",
        citations: [
          { label: "ADR-014 · Money handling", kind: "adr", ref: "adr-014" },
          { label: "Mid-market payments playbook", kind: "doc", ref: "drive://mid-market-payments.pdf" },
        ] },
      { role: "user", who: "Maya Rao", avatar: "MR",
        content: "OK, spin this up as a real change. ACH for invoices ≥$5k, mid-market only first, follow ADR-014 on disputes. I want PRs in flight by end of week." },
      { role: "assistant", who: "Athena", avatar: "AT",
        content: "Created implement task <strong>tsk_001</strong> on capability Billing &amp; Subscriptions. I've pre-loaded the spec with the $5k threshold, the ADR-014 dispute constraint, and the four KB sources we just looked at. The spec already has 3 clarifying questions queued — first answer needed: 'new invoices only, or retroactively too?' — you can pick it from the spec phase." },
      { role: "task_created", who: "Athena", avatar: "AT",
        content: "tsk_001" },
    ],
  },

  /* ─── thr_3: Multi-turn codebase Q&A with citations ──────────────────── */
  {
    id: "thr_3",
    title: "How does our triage worker decide when to escalate to a human?",
    scope: { kind: "capability", id: "cap_inbox", label: "Inbox & Conversations" },
    preview: "Confidence threshold lives in triage-worker/policy.yaml; default 0.85; below that…",
    updated_at: "yesterday",
    flavour: "codebase_qa",
    created_task: null,
    messages: [
      { role: "user", who: "Avi Patel", avatar: "AP",
        content: "How does our triage worker decide when to escalate to a human? I'm reviewing Dana's PR on the confidence model and want to make sure the threshold is documented somewhere." },
      { role: "assistant", who: "Athena", avatar: "AT",
        content: "The escalation rule lives in two places — a YAML policy file and the worker itself:\n\n1. <strong>Policy threshold</strong> in <code>triage-worker/config/policy.yaml</code> at <code>routing.confidence_floor</code>. Default <code>0.85</code>. Anything below this is routed to <code>queue: human</code> regardless of the predicted label.\n2. <strong>Tie-breakers</strong> in <code>triage-worker/src/router.py</code> at lines 88–124. If the top-2 labels are within 0.05 of each other, the worker forces escalation even if the top confidence is &gt;0.85 — that's the 'uncertain between billing-question and refund-request' case.\n\nThe documented behavior is in <strong>ADR-031 (Confidence-graded routing)</strong>, which also gates auto-routing on a per-customer trust score (new accounts &lt;14 days old never auto-route, regardless of confidence).",
        citations: [
          { label: "triage-worker/config/policy.yaml", kind: "file", ref: "lumen/triage-worker:config/policy.yaml" },
          { label: "triage-worker/src/router.py:88-124", kind: "file", ref: "lumen/triage-worker:src/router.py#L88-L124" },
          { label: "ADR-031 · Confidence-graded routing", kind: "adr", ref: "adr-031" },
        ] },
      { role: "user", who: "Avi Patel", avatar: "AP",
        content: "Has the threshold ever moved? I remember someone arguing for 0.90 a few months ago." },
      { role: "assistant", who: "Athena", avatar: "AT",
        content: "Yes — there's a thread of changes:\n\n• <strong>2025-Q3</strong>: Initial value <code>0.75</code>. Was producing too many wrong-queue routes — Dana flagged it after 11% of auto-routed billing tickets were actually refund requests.\n• <strong>2025-Q4</strong>: Moved to <code>0.85</code> after Priya's experiment on 14 days of held-out traffic. Wrong-routes dropped to 3.2%.\n• <strong>2026-Q1</strong>: Owen proposed <code>0.90</code> in a strategy review. The counter from Dana was that 0.90 would over-escalate (~28% of traffic to human queue, which the team can't absorb). Threshold stayed at 0.85; a follow-up was opened to add per-label thresholds instead.\n\nThe per-label threshold work is tracked but not yet started — it'd be a Lumen-flavored PRD task if you wanted to scope one.",
        citations: [
          { label: "Past PR · #387 triage-worker", kind: "pr", ref: "lumen/triage-worker#387" },
          { label: "Dana's threshold experiment", kind: "doc", ref: "drive://threshold-experiment-q4.md" },
        ] },
      { role: "user", who: "Avi Patel", avatar: "AP",
        content: "Got it. Promote this whole thread to a domain note on cap_inbox — useful next time someone asks." },
      { role: "assistant", who: "Athena", avatar: "AT",
        content: "Promoted to a domain note under <code>cap_inbox</code>: <strong>'Triage confidence threshold history &amp; rationale'</strong>. It's now searchable from the capability's domain-notes pane and will surface as a citation in the next triage-policy task." },
    ],
  },

  /* ─── thr_4: Architecture deep-dive across capabilities ──────────────── */
  {
    id: "thr_4",
    title: "Walk me through how a customer reply flows through our stack",
    scope: { kind: "org", label: "Lumen · org-wide" },
    preview: "From inbound webhook through triage, conversation state, billing tag, and SLA timers.",
    updated_at: "3 days ago",
    flavour: "architecture",
    created_task: null,
    messages: [
      { role: "user", who: "Owen Petrov", avatar: "OP",
        content: "I'm onboarding our new VP of Engineering next week. Walk me through what happens when a customer hits Reply on a Lumen support email — every system it touches, in order." },
      { role: "assistant", who: "Athena", avatar: "AT",
        content: "Here's the end-to-end path. I'm pulling the data from the four capability briefs plus the org capability graph.\n\n<strong>1. Ingress</strong> — Customer reply lands at <code>postmark.lumen.dev</code>. Postmark webhook fires into <code>inbox-svc</code> at <code>POST /v1/webhooks/inbound</code>. Auth via shared HMAC.\n\n<strong>2. Conversation hydration</strong> — <code>inbox-svc</code> resolves the email's <code>In-Reply-To</code> header against <code>conversations</code> table. If no match, opens a new conversation row (RLS-scoped by workspace).\n\n<strong>3. Triage</strong> — A Kafka event lands on <code>conversation.message_received</code>. <code>triage-worker</code> consumes, calls Anthropic with the conversation history + the org's triage prompt template. Returns label + confidence. If conf ≥ 0.85, writes the label and routes; otherwise queues for human.\n\n<strong>4. Routing</strong> — Routed conversations are assigned to the right team based on label → team mapping in <code>inbox-svc/config/routing.yaml</code>. SLA timer starts; conversation appears in the assignee's inbox view (via WebSocket push).\n\n<strong>5. Billing side-effect</strong> — Every routed conversation increments a usage counter in <code>finance-pipeline</code>'s usage rollup. That feeds monthly overage billing in <code>billing-svc</code>.\n\n<strong>6. Audit</strong> — Every step emits to the central audit log via <code>identity-svc/audit</code>.",
        citations: [
          { label: "Capability brief · Inbox", kind: "doc", ref: "brief://cap_inbox" },
          { label: "Capability brief · Billing", kind: "doc", ref: "brief://cap_billing" },
          { label: "Org capability graph", kind: "doc", ref: "brief://org/capability_graph" },
          { label: "ADR-031 · Confidence-graded routing", kind: "adr", ref: "adr-031" },
        ] },
      { role: "user", who: "Owen Petrov", avatar: "OP",
        content: "Where's the gnarliest piece of this for someone new to learn? What part takes the longest to internalize?" },
      { role: "assistant", who: "Athena", avatar: "AT",
        content: "Two non-obvious places, in my reading of the codebase and the past PR review comments:\n\n<strong>The conversation-hydration logic</strong> in <code>inbox-svc/src/conversations/hydrate.py</code>. It does multi-stage matching: <code>In-Reply-To</code> first, then <code>References</code>, then a 30-day-window fuzzy match on sender + subject. The fuzzy match has caused incidents twice (LUMEN-1402 and LUMEN-1611) — Priya wrote an explainer in the inbox capability brief.\n\n<strong>The usage-counter side-effect</strong>. It looks innocuous but it's the source of every 'why did my bill jump' support ticket. The counter is eventually consistent (Kafka → finance-pipeline → daily rollup) and the latency is sometimes 6–18 hours, which surprises people who expect real-time usage.\n\nIf I were Owen for a day I'd block off 90 minutes with Priya for the conversation-hydration walkthrough and 60 minutes with Jordan for the usage-counter story.",
        citations: [
          { label: "inbox-svc/src/conversations/hydrate.py", kind: "file", ref: "lumen/inbox-svc:src/conversations/hydrate.py" },
          { label: "Inbox capability brief · §Hydration gotchas", kind: "doc", ref: "brief://cap_inbox#hydration_gotchas" },
          { label: "Incident · LUMEN-1611", kind: "ticket", ref: "linear://LUMEN-1611" },
        ] },
    ],
  },

  /* ─── thr_5: Short ad-hoc skill / knowledge lookup ───────────────────── */
  {
    id: "thr_5",
    title: "Which skills run on billing tasks today?",
    scope: { kind: "capability", id: "cap_billing", label: "Billing & Subscriptions" },
    preview: "Five skills attached: Stripe expert, payment-data auditor, RLS checker, migration safety…",
    updated_at: "4h ago",
    flavour: "knowledge_lookup",
    created_task: null,
    messages: [
      { role: "user", who: "Maya Rao", avatar: "MR",
        content: "Quick one — which Athena skills run on cap_billing tasks?" },
      { role: "assistant", who: "Athena", avatar: "AT",
        content: "Five active skills are attached to <code>cap_billing</code> today:\n\n• <strong>Stripe payments expert</strong> (v4) — phases: spec, plan, review. Used 47× last 30d.\n• <strong>Payment-data sensitivity auditor</strong> (v2) — phases: review, ci. The one that blocked Maya's PR last week on the raw <code>charge.id</code> in logs.\n• <strong>RLS / tenant-isolation checker</strong> (v3) — phases: plan, review, ci. Org-wide skill, also attached here.\n• <strong>Migration safety reviewer</strong> (v1) — phases: plan, review, ci. Catches non-transactional <code>ALTER TYPE</code> situations like <code>invoice_status</code>.\n• <strong>Test scaffold generator</strong> (v2) — phases: implement. Won't let you skip tests on payment paths.\n\nOne draft skill — <strong>p99 latency guardian</strong> — was scoped for inbox originally but Owen flagged it as billing-relevant for the upcoming overage-billing rollout. It's not attached yet.",
        citations: [
          { label: "Skill · Stripe expert", kind: "skill", ref: "skl_stripe" },
          { label: "Skill · Payment-data auditor", kind: "skill", ref: "skl_pci" },
          { label: "Skill · RLS checker", kind: "skill", ref: "skl_rls" },
        ] },
    ],
  },
];

/* ------------------------------------------------------- knowledge nodes */
export interface MockKnowledgeNode { id: string; kind: string; name: string; path: string; layer: string; x: number; y: number; color: string }
export interface MockKnowledgeEdge { src: string; dst: string; kind: string }

export const knowledgeNodes: MockKnowledgeNode[] = [
  { id: "n1", kind: "service",  name: "billing-svc",          path: "services/billing-svc",         layer: "Service",    x: 240, y: 120, color: "violet" },
  { id: "n2", kind: "service",  name: "billing-web",          path: "apps/billing-web",             layer: "UI",         x: 480, y: 60,  color: "cyan" },
  { id: "n3", kind: "module",   name: "InvoiceStateMachine",  path: "billing-svc/invoice/state.ts", layer: "Service",    x: 380, y: 220, color: "violet" },
  { id: "n4", kind: "config",   name: "stripe.webhooks.yaml", path: "infra/stripe",                 layer: "Infra",      x: 120, y: 280, color: "amber" },
  { id: "n5", kind: "function", name: "createCheckoutSession",path: "billing-svc/checkout.ts:42",   layer: "Service",    x: 260, y: 360, color: "violet" },
  { id: "n6", kind: "service",  name: "finance-pipeline",     path: "services/finance-pipeline",    layer: "Data",       x: 580, y: 320, color: "indigo" },
  { id: "n7", kind: "document", name: "ADR-014: Money handling",path: "docs/adr/014.md",            layer: "Convention", x: 440, y: 420, color: "mint" },
  { id: "n8", kind: "class",    name: "DunningWorker",        path: "finance-pipeline/dunning.py:88",layer: "Data",      x: 700, y: 220, color: "indigo" },
];

export const knowledgeEdges: MockKnowledgeEdge[] = [
  { src: "n2", dst: "n1", kind: "calls" },
  { src: "n1", dst: "n3", kind: "contains" },
  { src: "n4", dst: "n1", kind: "configures" },
  { src: "n1", dst: "n5", kind: "contains" },
  { src: "n5", dst: "n3", kind: "calls" },
  { src: "n3", dst: "n7", kind: "references" },
  { src: "n1", dst: "n6", kind: "calls" },
  { src: "n6", dst: "n8", kind: "contains" },
  { src: "n8", dst: "n3", kind: "references" },
];

/* ----------------------------------------------------- capability knowledge */

export interface MockCapabilityKnowledge {
  capability_id: string;
  nodes_total: number;
  nodes_by_kind: Record<string, number>;
  edges_total: number;
  repos_indexed: number;
  decision_records: number;
  domain_concepts: number;
  capability_summary: string;
  top_entities: Array<{ id: string; name: string; kind: string; path: string; importance: number; description: string; repo: string }>;
  recent_changes: Array<{ when: string; repo: string; summary: string; nodes_affected: number }>;
  ingestion_status: "fresh" | "debouncing" | "stale_but_usable" | "ingesting" | "failed";
  last_ingested_at: string;
}

export const capabilityKnowledge: Record<string, MockCapabilityKnowledge> = {
  cap_billing: {
    capability_id: "cap_billing",
    nodes_total: 412,
    nodes_by_kind: { service: 3, module: 47, function: 218, class: 36, config: 22, document: 18, test: 68 },
    edges_total: 1247,
    repos_indexed: 3,
    decision_records: 8,
    domain_concepts: 12,
    capability_summary:
      "Billing owns the customer-facing pricing model, invoicing pipeline, and reconciliation with Stripe and the data warehouse. The state machine in `billing-svc/invoice/state.ts` is the canonical authority for invoice lifecycle; `finance-pipeline` reads its events for revenue recognition. ACH dispute handling is gated by ADR-014 (no auto-retry); the dunning worker in `finance-pipeline/dunning.py` reads dispute state and produces customer-comms tasks. Public surfaces are HTTPS to `billing-svc` and Stripe webhook callbacks; both authenticate via per-tenant secrets in Vault.",
    top_entities: [
      { id: "n1", name: "billing-svc",         kind: "service",  path: "services/billing-svc",          importance: 0.96, description: "Primary subscription + invoicing service. Owns the invoice state machine.", repo: "lumen/billing-svc" },
      { id: "n3", name: "InvoiceStateMachine", kind: "class",    path: "billing-svc/invoice/state.ts",  importance: 0.92, description: "Canonical invoice lifecycle: draft → issued → paid | disputed | written_off.", repo: "lumen/billing-svc" },
      { id: "n6", name: "finance-pipeline",    kind: "service",  path: "services/finance-pipeline",     importance: 0.84, description: "Revenue recognition + dunning. Consumes invoice events from billing-svc.", repo: "lumen/finance-pipeline" },
      { id: "n5", name: "createCheckoutSession",kind: "function", path: "billing-svc/checkout.ts:42",   importance: 0.78, description: "Stripe Checkout entry point. Most-edited function in the capability.", repo: "lumen/billing-svc" },
      { id: "n8", name: "DunningWorker",       kind: "class",    path: "finance-pipeline/dunning.py:88", importance: 0.74, description: "Bot that drives ACH dispute customer-comms once a dispute is filed.", repo: "lumen/finance-pipeline" },
      { id: "n7", name: "ADR-014",             kind: "document", path: "docs/adr/014.md",               importance: 0.71, description: "Money handling — fixed-point, no floats. Referenced by every numeric path.", repo: "lumen/billing-svc" },
      { id: "n4", name: "stripe.webhooks.yaml",kind: "config",   path: "infra/stripe",                  importance: 0.65, description: "Stripe webhook allowlist + signing key rotations.", repo: "lumen/billing-svc" },
    ],
    recent_changes: [
      { when: "12m ago", repo: "lumen/billing-svc",      summary: "Refactored `InvoiceStateMachine.transitionTo` to validate target state against capability config.", nodes_affected: 6 },
      { when: "1h ago",  repo: "lumen/finance-pipeline", summary: "Added `dispute_window_extended` event handler in DunningWorker.",                                 nodes_affected: 3 },
      { when: "3h ago",  repo: "lumen/billing-web",      summary: "Re-indexed UI components after pricing-display rewrite.",                                          nodes_affected: 11 },
      { when: "yesterday",repo: "lumen/billing-svc",     summary: "ADR-014 promoted; new edges from 14 funcs that handle currency.",                                  nodes_affected: 14 },
      { when: "2d ago",  repo: "lumen/finance-pipeline", summary: "Imported new Snowflake → NetSuite mapping; 9 module nodes added.",                                  nodes_affected: 9 },
    ],
    ingestion_status: "fresh",
    last_ingested_at: "12m ago",
  },
  cap_inbox: {
    capability_id: "cap_inbox",
    nodes_total: 624,
    nodes_by_kind: { service: 3, module: 71, function: 318, class: 58, config: 24, document: 22, test: 128 },
    edges_total: 1942,
    repos_indexed: 3,
    decision_records: 9,
    domain_concepts: 22,
    capability_summary:
      "Inbox is Lumen's flagship surface — the unified customer-support inbox. `inbox-svc` (Python/FastAPI) holds conversation state and routing rules; `triage-worker` (Python ML) runs the AI label-and-confidence model on every new message and emits decisions to a Kafka topic. `inbox-web` (Next.js) is the live console where the support team works. Public surfaces are HTTPS (browser → inbox-svc) + Postmark inbound webhooks + WebSocket push for real-time inbox updates. The triage worker calls Anthropic via LiteLLM and writes its decisions through the `decisions/store.py` log for replay.",
    top_entities: [
      { id: "in1", name: "inbox-svc",          kind: "service",  path: "services/inbox-svc",                   importance: 0.95, description: "Conversation state, routing rules, SLA timers. The 'system of record' for the inbox.", repo: "lumen/inbox-svc" },
      { id: "in2", name: "ConversationHydrator",kind: "class",   path: "inbox-svc/src/conversations/hydrate.py:32", importance: 0.91, description: "Multi-stage email-thread reassembly. Caused incidents LUMEN-1402 and LUMEN-1611.", repo: "lumen/inbox-svc" },
      { id: "in3", name: "triage-worker",      kind: "service",  path: "services/triage-worker",               importance: 0.88, description: "Calls Anthropic to label conversations + assign confidence. ADR-031 gates escalation.", repo: "lumen/triage-worker" },
      { id: "in4", name: "RoutingPolicy",      kind: "config",   path: "inbox-svc/config/routing.yaml",        importance: 0.83, description: "Label → team mapping. Edited frequently; covered by skl_triage_quality.", repo: "lumen/inbox-svc" },
      { id: "in5", name: "inbox-web",          kind: "service",  path: "apps/inbox-web",                       importance: 0.79, description: "Next.js inbox console — live updates via WebSocket push.", repo: "lumen/inbox-web" },
      { id: "in6", name: "ADR-031 routing",    kind: "document", path: "docs/adr/031.md",                      importance: 0.72, description: "Confidence-graded routing. Auto-route only ≥ 0.85; per-customer trust score gate.", repo: "lumen/triage-worker" },
      { id: "in7", name: "PostmarkWebhook",    kind: "module",   path: "inbox-svc/src/webhooks/postmark.py",   importance: 0.66, description: "Inbound email ingress. HMAC-authenticated.", repo: "lumen/inbox-svc" },
    ],
    recent_changes: [
      { when: "12m ago",  repo: "lumen/inbox-svc",      summary: "Tuned ConversationHydrator 30-day fuzzy-match window after LUMEN-1611 post-mortem.",            nodes_affected: 4 },
      { when: "2h ago",   repo: "lumen/triage-worker",  summary: "Per-label confidence floor experiment behind feature flag `triage.per_label_threshold.enabled`.", nodes_affected: 6 },
      { when: "yesterday",repo: "lumen/inbox-web",      summary: "WebSocket reconnect backoff updated to 2^n with jitter.",                                       nodes_affected: 3 },
      { when: "2d ago",   repo: "lumen/triage-worker",  summary: "Added trust-score gate; new accounts < 14d never auto-route.",                                  nodes_affected: 8 },
    ],
    ingestion_status: "fresh",
    last_ingested_at: "12m ago",
  },
  cap_data: {
    capability_id: "cap_data",
    nodes_total: 248,
    nodes_by_kind: { service: 2, module: 28, function: 142, class: 19, config: 14, document: 11, test: 32 },
    edges_total: 712,
    repos_indexed: 2,
    decision_records: 5,
    domain_concepts: 14,
    capability_summary:
      "Data Platform owns the lake → warehouse → mart pipelines that every internal dashboard reads from. `lake-ingest` is the streaming/batch ingest into S3 + Snowflake (raw layer); `dbt-models` defines the staging + mart layers and the metrics catalog. The data team owns freshness SLAs (15-min lag for usage events, 4-hour lag for revenue rollups). The usage rollup that feeds Lumen's overage billing is materialised by `dbt-models/marts/usage/conversations_routed_daily.sql`.",
    top_entities: [
      { id: "dt1", name: "lake-ingest",            kind: "service", path: "services/lake-ingest",                            importance: 0.93, description: "Streaming + batch ingest. Postmark + Kafka → S3 → Snowflake raw layer.", repo: "lumen/lake-ingest" },
      { id: "dt2", name: "conversations_routed_daily", kind: "module", path: "dbt-models/models/marts/usage/conversations_routed_daily.sql", importance: 0.88, description: "The usage rollup that feeds Lumen's overage billing.", repo: "lumen/dbt-models" },
      { id: "dt3", name: "metrics_catalog.yml",    kind: "config",  path: "dbt-models/metrics_catalog.yml",                  importance: 0.82, description: "All exposed metrics live here. Read by every internal dashboard.", repo: "lumen/dbt-models" },
      { id: "dt4", name: "freshness_sla.py",       kind: "module",  path: "lake-ingest/src/sla/freshness_sla.py",            importance: 0.76, description: "Pager-firing freshness checks. 15-min lag for usage, 4-hour lag for revenue.", repo: "lumen/lake-ingest" },
      { id: "dt5", name: "ADR-029 freshness",      kind: "document",path: "docs/adr/029.md",                                  importance: 0.69, description: "How we pick freshness SLAs per pipeline. Why we page at 2× the SLA.", repo: "lumen/dbt-models" },
    ],
    recent_changes: [
      { when: "1h ago",  repo: "lumen/dbt-models", summary: "Added `conversations_routed_daily` to the usage rollup; backfilled 90 days.", nodes_affected: 7 },
      { when: "yesterday", repo: "lumen/lake-ingest", summary: "Tightened freshness-SLA breach pager threshold to 2× lag.",                  nodes_affected: 3 },
    ],
    ingestion_status: "fresh",
    last_ingested_at: "1h ago",
  },
  cap_platform: {
    capability_id: "cap_platform",
    nodes_total: 312,
    nodes_by_kind: { service: 2, module: 34, function: 168, class: 28, config: 31, document: 14, test: 51 },
    edges_total: 891,
    repos_indexed: 3,
    decision_records: 7,
    domain_concepts: 16,
    capability_summary:
      "Platform & Identity is the cross-cutting layer every other capability depends on: SSO (SAML + OIDC), SCIM, RBAC, the workspace-state machine (paused/active/snoozed), and the IaC config used by every service deploy. `identity-svc` (Go) issues + verifies tokens and owns the workspace state column that the rest of the platform reads through RLS (ADR-015). `admin-web` is the admin console where workspace owners manage seats, snooze the workspace, and audit access. `infra` holds the Terraform + Helm charts that ship every service.",
    top_entities: [
      { id: "pl1", name: "identity-svc",       kind: "service",  path: "services/identity-svc",            importance: 0.96, description: "Token issuance, verification, workspace state, RBAC. The keystone of every authenticated call.", repo: "lumen/identity-svc" },
      { id: "pl2", name: "WorkspaceStateMachine", kind: "class", path: "identity-svc/workspace/state.go:42", importance: 0.92, description: "Owns the paused/active/snoozed transitions. ADR-018. The PRD task (tsk_002) lives here.", repo: "lumen/identity-svc" },
      { id: "pl3", name: "ADR-015 RLS",        kind: "document", path: "docs/adr/015.md",                  importance: 0.84, description: "Tenancy via Postgres RLS; workspace_id on every tenant table.", repo: "lumen/identity-svc" },
      { id: "pl4", name: "admin-web",          kind: "service",  path: "apps/admin-web",                   importance: 0.81, description: "Admin console — seat mgmt, audit log, SSO config, billing portal entrypoint.", repo: "lumen/admin-web" },
      { id: "pl5", name: "terraform/lumen",    kind: "config",   path: "infra/terraform/lumen",            importance: 0.74, description: "Terraform root. Per-env tfvars (dev/staging/prod). Shared by every service.", repo: "lumen/infra" },
      { id: "pl6", name: "ADR-018 workspace",  kind: "document", path: "docs/adr/018.md",                  importance: 0.68, description: "Workspace state semantics. The active source-of-truth for the snooze PRD.", repo: "lumen/identity-svc" },
    ],
    recent_changes: [
      { when: "yesterday",repo: "lumen/identity-svc", summary: "Added `snoozed_until` column to workspaces. Migration pending review.",           nodes_affected: 4 },
      { when: "3d ago",   repo: "lumen/admin-web",    summary: "Refactored SSO config screen into a step wizard. Re-indexed 11 components.",       nodes_affected: 11 },
      { when: "5d ago",   repo: "lumen/infra",        summary: "Bumped Helm chart for inbox-svc to v0.14; added envoy sidecar.",                    nodes_affected: 6 },
    ],
    ingestion_status: "fresh",
    last_ingested_at: "yesterday",
  },
};

/* ----------------------------------------------------- repo knowledge */

export interface MockRepoKnowledge {
  repo_id: string;
  repo_full_name: string;
  primary_language: string;
  files_indexed: number;
  loc: number;
  last_commit: { sha: string; when: string; author: string; message: string };
  summary: string;
  services: Array<{ id: string; name: string; path: string; description: string; symbols: number }>;
  modules: Array<{ id: string; name: string; path: string; kind: string; symbols: number }>;
  exports: number;
  decision_records_referenced: number;
  ingestion_status: "fresh" | "debouncing" | "stale_but_usable" | "ingesting" | "failed";
  last_ingested_at: string;
  recent_commits: Array<{ sha: string; author: string; when: string; nodes_affected: number; message: string }>;
}

/** Keyed by `${capability_id}::${repo_id}` so each capability scopes its repos. */
export const repoKnowledge: Record<string, MockRepoKnowledge> = {
  /* ─── cap_inbox: 3 repos (FE + BE + ML worker) ───────────────────────── */
  "cap_inbox::repo_n1": {
    repo_id: "repo_n1", repo_full_name: "lumen/inbox-web", primary_language: "TypeScript",
    files_indexed: 412, loc: 31_840,
    last_commit: { sha: "f8a2e1c", when: "8m ago", author: "Priya Shah", message: "Stabilise WebSocket reconnect with jittered exponential backoff" },
    summary: "Lumen's customer-support inbox console (Next.js 15 + React 19). The live list view, the conversation pane, the routing rules editor, and the team-admin surfaces. No backend logic — every action calls `inbox-svc` via the typed client. WebSocket subscription via `features/stream/use-inbox-stream.ts` powers live updates.",
    services: [
      { id: "iw_s1", name: "inbox-web", path: "apps/inbox-web", description: "Next.js 15 inbox console.", symbols: 412 },
    ],
    modules: [
      { id: "iw_m1", name: "inbox/list/page.tsx",            path: "inbox-web/app/inbox/list/page.tsx",                  kind: "module", symbols: 28 },
      { id: "iw_m2", name: "inbox/[id]/page.tsx",            path: "inbox-web/app/inbox/[id]/page.tsx",                  kind: "module", symbols: 41 },
      { id: "iw_m3", name: "routing/rules-editor.tsx",       path: "inbox-web/app/settings/routing/rules-editor.tsx",    kind: "module", symbols: 36 },
      { id: "iw_m4", name: "features/stream/use-inbox-stream.ts", path: "inbox-web/features/stream/use-inbox-stream.ts", kind: "module", symbols: 18 },
      { id: "iw_m5", name: "components/conversation-pane.tsx", path: "inbox-web/components/conversation-pane.tsx",       kind: "module", symbols: 24 },
    ],
    exports: 94,
    decision_records_referenced: 3,
    ingestion_status: "fresh",
    last_ingested_at: "8m ago",
    recent_commits: [
      { sha: "f8a2e1c", author: "Priya Shah", when: "8m ago",     nodes_affected: 3, message: "Stabilise WebSocket reconnect with jittered exponential backoff" },
      { sha: "1d4caaa", author: "Avi Patel",  when: "yesterday",  nodes_affected: 7, message: "Routing rules editor — diff view between draft and applied" },
      { sha: "92ab1f0", author: "Priya Shah", when: "2d ago",     nodes_affected: 4, message: "Conversation pane keyboard shortcut: J/K to navigate threads" },
    ],
  },
  "cap_inbox::repo_n2": {
    repo_id: "repo_n2", repo_full_name: "lumen/inbox-svc", primary_language: "Python",
    files_indexed: 318, loc: 24_140,
    last_commit: { sha: "c41e7d9", when: "12m ago", author: "Avi Patel", message: "ConversationHydrator: tighten 30-day fuzzy-match window per LUMEN-1611" },
    summary: "Conversation state, routing rules engine, SLA timers, Postmark webhook ingress. FastAPI app on Python 3.12. The 'system of record' for the inbox — every conversation row is RLS-scoped by workspace_id. Routing rules engine in `routing/engine.py` reads `config/routing.yaml` plus the per-workspace overrides table.",
    services: [
      { id: "is_s1", name: "inbox-svc", path: "services/inbox-svc", description: "FastAPI conversation + routing service.", symbols: 318 },
    ],
    modules: [
      { id: "is_m1", name: "conversations/hydrate.py",  path: "inbox-svc/src/conversations/hydrate.py",  kind: "module", symbols: 42 },
      { id: "is_m2", name: "conversations/state.py",    path: "inbox-svc/src/conversations/state.py",    kind: "module", symbols: 38 },
      { id: "is_m3", name: "routing/engine.py",         path: "inbox-svc/src/routing/engine.py",         kind: "module", symbols: 51 },
      { id: "is_m4", name: "webhooks/postmark.py",      path: "inbox-svc/src/webhooks/postmark.py",      kind: "module", symbols: 24 },
      { id: "is_m5", name: "sla/timers.py",             path: "inbox-svc/src/sla/timers.py",             kind: "module", symbols: 19 },
      { id: "is_m6", name: "config/routing.yaml",       path: "inbox-svc/config/routing.yaml",           kind: "config", symbols: 12 },
    ],
    exports: 88,
    decision_records_referenced: 6,
    ingestion_status: "fresh",
    last_ingested_at: "12m ago",
    recent_commits: [
      { sha: "c41e7d9", author: "Avi Patel",  when: "12m ago",   nodes_affected: 4, message: "ConversationHydrator: tighten 30-day fuzzy-match window per LUMEN-1611" },
      { sha: "9e2b3a4", author: "Dana Lin",   when: "yesterday", nodes_affected: 6, message: "Routing engine: per-workspace label → team overrides" },
      { sha: "44f1c01", author: "Avi Patel",  when: "3d ago",    nodes_affected: 9, message: "Add Idempotency-Key check on Postmark webhook handler" },
    ],
  },
  "cap_inbox::repo_n3": {
    repo_id: "repo_n3", repo_full_name: "lumen/triage-worker", primary_language: "Python",
    files_indexed: 184, loc: 12_640,
    last_commit: { sha: "7e2b401", when: "2h ago", author: "Dana Lin", message: "Per-label confidence floor experiment behind feature flag" },
    summary: "ML worker that consumes the `conversation.message_received` Kafka topic, calls Anthropic via LiteLLM with the customer's triage prompt template, and emits a label + confidence to `conversation.triaged`. ADR-031 governs the confidence-floor logic (default 0.85; gates auto-routing on trust score for accounts < 14d old). Decisions are logged via `decisions/store.py` so we can replay any classification.",
    services: [
      { id: "tw_s1", name: "triage-worker", path: "services/triage-worker", description: "ML triage worker. Anthropic → routing decisions.", symbols: 184 },
    ],
    modules: [
      { id: "tw_m1", name: "src/router.py",         path: "triage-worker/src/router.py",         kind: "module", symbols: 36 },
      { id: "tw_m2", name: "src/classifier.py",     path: "triage-worker/src/classifier.py",     kind: "module", symbols: 28 },
      { id: "tw_m3", name: "src/decisions/store.py",path: "triage-worker/src/decisions/store.py",kind: "module", symbols: 22 },
      { id: "tw_m4", name: "config/policy.yaml",    path: "triage-worker/config/policy.yaml",    kind: "config", symbols: 14 },
    ],
    exports: 41,
    decision_records_referenced: 4,
    ingestion_status: "fresh",
    last_ingested_at: "2h ago",
    recent_commits: [
      { sha: "7e2b401", author: "Dana Lin",  when: "2h ago",    nodes_affected: 6, message: "Per-label confidence floor experiment behind feature flag" },
      { sha: "a0b1c2d", author: "Avi Patel", when: "2d ago",    nodes_affected: 8, message: "Trust-score gate: accounts < 14d never auto-route" },
      { sha: "f17e9c0", author: "Dana Lin",  when: "1w ago",    nodes_affected: 11, message: "Migrate classifier to LiteLLM (was direct Anthropic SDK)" },
    ],
  },

  /* ─── cap_billing: 3 repos ───────────────────────────────────────────── */
  "cap_billing::repo_b1": {
    repo_id: "repo_b1", repo_full_name: "lumen/billing-svc", primary_language: "TypeScript",
    files_indexed: 312, loc: 24_180,
    last_commit: { sha: "a12c4f9", when: "12m ago", author: "Jordan Chen", message: "Tighten InvoiceStateMachine transition guards" },
    summary: "Primary subscription + invoicing service. The state machine in `invoice/state.ts` is the canonical authority for invoice lifecycle; checkout flow goes through `checkout.ts` and Stripe Connect. Public ports: HTTPS on 8443 (REST), webhook ingress from Stripe via `/webhooks/stripe`.",
    services: [
      { id: "svc1", name: "billing-svc",        path: "services/billing-svc",            description: "REST API for subscriptions + invoices.", symbols: 218 },
    ],
    modules: [
      { id: "m1", name: "invoice/state.ts",     path: "billing-svc/invoice/state.ts",     kind: "module", symbols: 36 },
      { id: "m2", name: "checkout.ts",          path: "billing-svc/checkout.ts",          kind: "module", symbols: 24 },
      { id: "m3", name: "webhooks/stripe.ts",   path: "billing-svc/webhooks/stripe.ts",   kind: "module", symbols: 18 },
      { id: "m4", name: "dunning/handlers.ts",  path: "billing-svc/dunning/handlers.ts",  kind: "module", symbols: 14 },
    ],
    exports: 72,
    decision_records_referenced: 5,
    ingestion_status: "fresh",
    last_ingested_at: "12m ago",
    recent_commits: [
      { sha: "a12c4f9", author: "Jordan Chen", when: "12m ago",   nodes_affected: 6,  message: "Tighten InvoiceStateMachine transition guards" },
      { sha: "31de8b1", author: "Maya Rao",    when: "3h ago",    nodes_affected: 2,  message: "Fix Stripe webhook signature verification edge case" },
      { sha: "9f01b22", author: "Jordan Chen", when: "yesterday", nodes_affected: 14, message: "Promote ADR-014 references in money-touching code" },
    ],
  },
  "cap_billing::repo_b2": {
    repo_id: "repo_b2", repo_full_name: "lumen/billing-web", primary_language: "TypeScript",
    files_indexed: 184, loc: 12_540,
    last_commit: { sha: "77b8e2c", when: "3h ago", author: "Maya Rao", message: "Redesign pricing card; consolidate billing-display components" },
    summary: "Customer-facing billing UI (Next.js). Renders the pricing page, the customer portal entry, and the invoice download flow. No backend logic — every action calls `billing-svc` via the typed API client.",
    services: [
      { id: "svc2", name: "billing-web", path: "apps/billing-web", description: "Next.js front-end for billing surfaces.", symbols: 96 },
    ],
    modules: [
      { id: "bw1", name: "pricing/page.tsx",        path: "billing-web/app/pricing/page.tsx",       kind: "module", symbols: 12 },
      { id: "bw2", name: "portal/checkout.tsx",     path: "billing-web/app/portal/checkout.tsx",    kind: "module", symbols: 18 },
      { id: "bw3", name: "invoices/list.tsx",       path: "billing-web/app/invoices/list.tsx",      kind: "module", symbols: 9 },
    ],
    exports: 31,
    decision_records_referenced: 2,
    ingestion_status: "fresh",
    last_ingested_at: "3h ago",
    recent_commits: [
      { sha: "77b8e2c", author: "Maya Rao",   when: "3h ago",    nodes_affected: 11, message: "Redesign pricing card; consolidate billing-display components" },
      { sha: "f2018a5", author: "Avi Patel",  when: "1d ago",    nodes_affected: 4,  message: "Add ACH disclosure to checkout flow" },
    ],
  },
  "cap_billing::repo_b3": {
    repo_id: "repo_b3", repo_full_name: "lumen/finance-pipeline", primary_language: "Python",
    files_indexed: 156, loc: 9_820,
    last_commit: { sha: "c5d3a17", when: "1h ago", author: "Tomas Lind", message: "Handle dispute_window_extended event in DunningWorker" },
    summary: "Revenue recognition + dunning. Reads invoice events from billing-svc via Kafka, materialises rollups into Snowflake, and pushes journal entries to NetSuite. DunningWorker is the long-running process that drives ACH dispute customer-comms.",
    services: [
      { id: "fp1", name: "finance-pipeline", path: "services/finance-pipeline", description: "Kafka consumer → Snowflake → NetSuite revenue pipeline.", symbols: 145 },
    ],
    modules: [
      { id: "fp_m1", name: "dunning.py",       path: "finance-pipeline/dunning.py",        kind: "module", symbols: 28 },
      { id: "fp_m2", name: "revrec/journal.py",path: "finance-pipeline/revrec/journal.py", kind: "module", symbols: 22 },
      { id: "fp_m3", name: "consumers/kafka.py",path: "finance-pipeline/consumers/kafka.py",kind: "module", symbols: 16 },
    ],
    exports: 41,
    decision_records_referenced: 4,
    ingestion_status: "fresh",
    last_ingested_at: "1h ago",
    recent_commits: [
      { sha: "c5d3a17", author: "Tomas Lind",  when: "1h ago", nodes_affected: 3, message: "Handle dispute_window_extended event in DunningWorker" },
      { sha: "8a014cc", author: "Jordan Chen", when: "2d ago", nodes_affected: 9, message: "Import new Snowflake → NetSuite mapping; 9 module nodes" },
    ],
  },

  /* ─── cap_data: 2 repos (dbt + ingest) ───────────────────────────────── */
  "cap_data::repo_d1": {
    repo_id: "repo_d1", repo_full_name: "lumen/dbt-models", primary_language: "SQL",
    files_indexed: 148, loc: 6_840,
    last_commit: { sha: "b9c4f12", when: "1h ago", author: "Priya Shah", message: "Add conversations_routed_daily to usage rollup; backfill 90d" },
    summary: "dbt project that defines Lumen's staging + mart layers and the metrics catalog. The usage rollup that feeds the overage-billing pipeline (`marts/usage/conversations_routed_daily.sql`) lives here. Every metric exposed to internal dashboards is registered in `metrics_catalog.yml` (read by Mode + Looker).",
    services: [],
    modules: [
      { id: "dbt_m1", name: "marts/usage/conversations_routed_daily.sql", path: "dbt-models/models/marts/usage/conversations_routed_daily.sql", kind: "module", symbols: 18 },
      { id: "dbt_m2", name: "marts/revenue/arr_monthly.sql",              path: "dbt-models/models/marts/revenue/arr_monthly.sql",              kind: "module", symbols: 22 },
      { id: "dbt_m3", name: "staging/stg_conversations.sql",              path: "dbt-models/models/staging/stg_conversations.sql",              kind: "module", symbols: 14 },
      { id: "dbt_m4", name: "metrics_catalog.yml",                        path: "dbt-models/metrics_catalog.yml",                                kind: "config", symbols: 28 },
    ],
    exports: 62,
    decision_records_referenced: 3,
    ingestion_status: "fresh",
    last_ingested_at: "1h ago",
    recent_commits: [
      { sha: "b9c4f12", author: "Priya Shah", when: "1h ago",    nodes_affected: 7, message: "Add conversations_routed_daily to usage rollup; backfill 90d" },
      { sha: "44a9e02", author: "Priya Shah", when: "yesterday", nodes_affected: 3, message: "Tighten freshness SLA on arr_monthly to 4h" },
    ],
  },
  "cap_data::repo_d2": {
    repo_id: "repo_d2", repo_full_name: "lumen/lake-ingest", primary_language: "Python",
    files_indexed: 96, loc: 5_840,
    last_commit: { sha: "20efc81", when: "yesterday", author: "Priya Shah", message: "Tighten freshness-SLA breach pager threshold to 2× lag" },
    summary: "Streaming + batch ingest. Postmark webhooks + Kafka topics → S3 raw layer → Snowflake. Owns freshness SLA pagers (15-min lag for usage, 4-hour lag for revenue rollups). Per ADR-029, every pipeline emits a heartbeat we monitor centrally.",
    services: [
      { id: "li_s1", name: "lake-ingest", path: "services/lake-ingest", description: "S3 + Snowflake ingest worker.", symbols: 96 },
    ],
    modules: [
      { id: "li_m1", name: "src/consumers/postmark.py",    path: "lake-ingest/src/consumers/postmark.py",    kind: "module", symbols: 21 },
      { id: "li_m2", name: "src/consumers/kafka_inbox.py", path: "lake-ingest/src/consumers/kafka_inbox.py", kind: "module", symbols: 26 },
      { id: "li_m3", name: "src/sla/freshness_sla.py",     path: "lake-ingest/src/sla/freshness_sla.py",     kind: "module", symbols: 18 },
    ],
    exports: 24,
    decision_records_referenced: 2,
    ingestion_status: "fresh",
    last_ingested_at: "yesterday",
    recent_commits: [
      { sha: "20efc81", author: "Priya Shah", when: "yesterday", nodes_affected: 3, message: "Tighten freshness-SLA breach pager threshold to 2× lag" },
    ],
  },

  /* ─── cap_platform: 3 repos (BE + admin UI + infra/IaC) ──────────────── */
  "cap_platform::repo_p1": {
    repo_id: "repo_p1", repo_full_name: "lumen/identity-svc", primary_language: "Go",
    files_indexed: 142, loc: 9_180,
    last_commit: { sha: "01fae23", when: "yesterday", author: "Tomas Lind", message: "Add snoozed_until column to workspaces (migration pending review)" },
    summary: "Token issuance, verification, and RBAC role-permission lookup. Brokered through Supabase for SaaS tenants; supports per-tenant IdP for SCIM customers. The workspace state machine (active / paused / snoozed) lives in `workspace/state.go` — every tenant-bearing table reads through it via RLS (ADR-015). Source of truth for the in-flight `tsk_002` PRD.",
    services: [
      { id: "isv1", name: "identity-svc", path: "services/identity-svc", description: "Identity + RBAC + workspace state + tenancy context.", symbols: 168 },
    ],
    modules: [
      { id: "is_m1", name: "rbac/roles.go",          path: "identity-svc/rbac/roles.go",            kind: "module", symbols: 24 },
      { id: "is_m2", name: "rbac/policy.go",         path: "identity-svc/rbac/policy.go",           kind: "module", symbols: 18 },
      { id: "is_m3", name: "sso/oidc.go",            path: "identity-svc/sso/oidc.go",              kind: "module", symbols: 14 },
      { id: "is_m4", name: "workspace/state.go",     path: "identity-svc/workspace/state.go",       kind: "module", symbols: 32 },
      { id: "is_m5", name: "audit/log.go",           path: "identity-svc/audit/log.go",             kind: "module", symbols: 12 },
    ],
    exports: 58,
    decision_records_referenced: 5,
    ingestion_status: "fresh",
    last_ingested_at: "yesterday",
    recent_commits: [
      { sha: "01fae23", author: "Tomas Lind",  when: "yesterday", nodes_affected: 4, message: "Add snoozed_until column to workspaces (migration pending review)" },
      { sha: "9c4a217", author: "Tomas Lind",  when: "3d ago",    nodes_affected: 6, message: "Tighten OIDC redirect-URL validation" },
    ],
  },
  "cap_platform::repo_p2": {
    repo_id: "repo_p2", repo_full_name: "lumen/admin-web", primary_language: "TypeScript",
    files_indexed: 218, loc: 14_280,
    last_commit: { sha: "5d22e91", when: "3d ago", author: "Priya Shah", message: "Refactor SSO config screen into step wizard" },
    summary: "Admin console for workspace owners. Seat management, SSO/SCIM config, audit log viewer, snooze workspace (in-flight per tsk_002), billing-portal entrypoint. No customer-facing surfaces — all routes gated on the `admin` role.",
    services: [
      { id: "aw_s1", name: "admin-web", path: "apps/admin-web", description: "Next.js admin console.", symbols: 218 },
    ],
    modules: [
      { id: "aw_m1", name: "seats/page.tsx",                  path: "admin-web/app/seats/page.tsx",                 kind: "module", symbols: 22 },
      { id: "aw_m2", name: "sso/wizard.tsx",                  path: "admin-web/app/sso/wizard.tsx",                 kind: "module", symbols: 41 },
      { id: "aw_m3", name: "audit/log-view.tsx",              path: "admin-web/app/audit/log-view.tsx",             kind: "module", symbols: 18 },
      { id: "aw_m4", name: "workspace/snooze-drawer.tsx",     path: "admin-web/app/workspace/snooze-drawer.tsx",    kind: "module", symbols: 24 },
    ],
    exports: 54,
    decision_records_referenced: 3,
    ingestion_status: "fresh",
    last_ingested_at: "3d ago",
    recent_commits: [
      { sha: "5d22e91", author: "Priya Shah",  when: "3d ago", nodes_affected: 11, message: "Refactor SSO config screen into step wizard" },
      { sha: "0c184bb", author: "Tomas Lind",  when: "1w ago", nodes_affected: 5,  message: "Audit log: filter by action type" },
    ],
  },
  "cap_platform::repo_p3": {
    repo_id: "repo_p3", repo_full_name: "lumen/infra", primary_language: "HCL",
    files_indexed: 184, loc: 6_240,
    last_commit: { sha: "84e1f07", when: "5d ago", author: "Tomas Lind", message: "Bump Helm chart for inbox-svc to v0.14; add envoy sidecar" },
    summary: "Infrastructure-as-code shared by every service: Terraform root (per-env tfvars dev/staging/prod), Helm charts per service, GitHub Actions reusable workflows, and the shared `module.observability` for Datadog/Sentry wiring. PRs here gate on Terraform plan + tfsec + the `infra-readonly` review group.",
    services: [],
    modules: [
      { id: "inf_m1", name: "terraform/lumen",          path: "infra/terraform/lumen",          kind: "module", symbols: 48 },
      { id: "inf_m2", name: "helm/inbox-svc",          path: "infra/helm/inbox-svc",            kind: "module", symbols: 22 },
      { id: "inf_m3", name: "helm/billing-svc",        path: "infra/helm/billing-svc",          kind: "module", symbols: 21 },
      { id: "inf_m4", name: "module.observability",   path: "infra/terraform/modules/observability", kind: "module", symbols: 28 },
      { id: "inf_m5", name: "github/workflows",       path: "infra/.github/workflows",          kind: "config", symbols: 18 },
    ],
    exports: 12,
    decision_records_referenced: 2,
    ingestion_status: "fresh",
    last_ingested_at: "5d ago",
    recent_commits: [
      { sha: "84e1f07", author: "Tomas Lind", when: "5d ago", nodes_affected: 6, message: "Bump Helm chart for inbox-svc to v0.14; add envoy sidecar" },
      { sha: "2c1abc4", author: "Tomas Lind", when: "1w ago", nodes_affected: 3, message: "GHA: reusable workflow for the four deploys" },
    ],
  },
};

/* ----------------------------------------------------------------- rules */
export const rules = [
  { id: "ADR-006",       title: "Single LLM egress through LiteLLM",            tag: "platform",  author: "Avi Patel",   date: "12 weeks ago", kind: "ADR",           summary: "Every LLM call goes through Lumen's LiteLLM client." },
  { id: "ADR-014",       title: "Money handling — fixed-point, no floats",       tag: "billing",   author: "Jordan Chen", date: "8 weeks ago",  kind: "ADR",           summary: "Currency stored as integer minor-units. ACH disputes auto-retry is forbidden." },
  { id: "ADR-015",       title: "Tenancy isolation via Postgres RLS",            tag: "platform",  author: "Avi Patel",   date: "7 weeks ago",  kind: "ADR",           summary: "Every tenant-bearing table has RLS + a policy keyed on workspace_id." },
  { id: "ADR-018",       title: "Workspace state machine (paused/active/snoozed)",tag: "platform", author: "Tomas Lind",  date: "6 weeks ago",  kind: "ADR",           summary: "Defines the canonical workspace lifecycle. Source of truth for any snooze/pause feature." },
  { id: "ADR-027",       title: "Lumen never executes customer code",             tag: "security",  author: "Tomas Lind",  date: "5 weeks ago",  kind: "ADR",           summary: "Sandbox is for agent scratch. PRs always draft. Humans merge." },
  { id: "ADR-031",       title: "Confidence-graded routing for triage",           tag: "inbox",     author: "Avi Patel",   date: "4 weeks ago",  kind: "ADR",           summary: "Auto-route only when confidence ≥ 0.85. Trust-score gate for new accounts." },
  { id: "brief:org/standards", title: "Lumen engineering standards (Brief)",     tag: "convention",author: "Engineering", date: "Quarterly",     kind: "Brief section", summary: "Python 3.12 + FastAPI for new services. TypeScript strict mode on every FE. Postgres for tenant data; RLS is the boundary. Edited in-app under Settings → Org Standards (per ADR-059)." },
  { id: "note:billing/01",title: "Stripe is the only payment processor for v1",   tag: "billing",  author: "Maya Rao",   date: "promoted",       kind: "Domain note",   summary: "No fallback processor in v1; multi-processor is FY26." },
  { id: "note:inbox/01",  title: "Triage confidence threshold history & rationale",tag: "inbox",    author: "Avi Patel",  date: "yesterday",      kind: "Domain note",   summary: "Threshold moved 0.75 → 0.85 over 6 months. Owen proposed 0.90; vetoed for over-escalation." },
];

/* ------------------------------------------------- capability resources */
export interface MockCapabilityResource {
  id: string;
  title: string;
  kind: "file" | "link" | "note";
  source: string;
  format: string;
  size_kb?: number;
  uploaded_by: string;
  uploaded_at: string;
  status: "indexed" | "indexing" | "queued" | "failed";
  nodes_generated: number;
  summary: string;
  tags: string[];
  last_used: string | null;
  progress?: number;
}

export const capabilityResources: Record<string, MockCapabilityResource[]> = {
  cap_inbox: [
    { id: "res_n1", title: "Customer-support triage playbook.pdf",        kind: "file", source: "Support Wiki · Q1 2026",                 format: "PDF",         size_kb: 980,  uploaded_by: "Avi Patel",   uploaded_at: "1 week ago",  status: "indexed",  nodes_generated: 14, summary: "16-page playbook covering ticket labels, escalation criteria, hand-off scripts, and the 18-minute first-response SLA. Cited 12 times this week.", tags: ["triage","playbook","sla","support"], last_used: "1h ago" },
    { id: "res_n2", title: "ADR-031 · Confidence-graded routing",          kind: "link", source: "lumen/triage-worker/docs/adr/031.md",     format: "Markdown",    uploaded_by: "Avi Patel",   uploaded_at: "4 weeks ago", status: "indexed",  nodes_generated: 8,  summary: "Authoritative decision record on the 0.85 confidence floor + trust-score gate. Source for any triage-policy change.", tags: ["adr","triage","confidence"], last_used: "yesterday" },
    { id: "res_n3", title: "LUMEN-1611 post-mortem — fuzzy-match incident",kind: "file", source: "Notion · Engineering",                   format: "Markdown",    size_kb: 32,   uploaded_by: "Priya Shah",  uploaded_at: "3 weeks ago", status: "indexed",  nodes_generated: 5,  summary: "Post-mortem for the conversation-hydration fuzzy-match incident that misrouted 218 conversations. Action items shipped in `c41e7d9`.", tags: ["incident","hydration","post-mortem"], last_used: "2d ago" },
    { id: "res_n4", title: "Hospitality workshop transcript · 2026-02-14",kind: "file", source: "Otter.ai · 2026-02-14",                  format: "VTT",         size_kb: 92,   uploaded_by: "Maya Rao",    uploaded_at: "3 months ago",status: "indexed",  nodes_generated: 11, summary: "67-min workshop with 8 mid-market hospitality customers. 47 ticket excerpts referenced. Source for `tsk_002` framing.", tags: ["workshop","hospitality","prd"], last_used: "2h ago" },
    { id: "res_n5", title: "Threshold experiment notes (Dana, Q4)",        kind: "note", source: "pasted by Dana Lin",                     format: "Markdown",    uploaded_by: "Dana Lin",    uploaded_at: "2 weeks ago", status: "indexed",  nodes_generated: 4,  summary: "14-day held-out experiment that moved the confidence floor from 0.75 → 0.85. Cited in the chat thread thr_3 promotion.", tags: ["experiment","triage","data"], last_used: "yesterday" },
  ],
  cap_billing: [
    { id: "res_b1", title: "Mid-Market Payments Playbook.pdf",            kind: "file", source: "Finance Wiki · Q1 2026",                 format: "PDF",         size_kb: 1240, uploaded_by: "Jordan Chen", uploaded_at: "1 week ago",  status: "indexed",  nodes_generated: 18, summary: "12-page playbook covering customer segmentation, invoice timing, ACH vs. card economics, dispute escalation runbook. Cited 7 times this week.", tags: ["payments","playbook","ach","dispute"], last_used: "3h ago" },
    { id: "res_b2", title: "Stripe Connect → ACH onboarding (Notion)",     kind: "link", source: "lumen.notion.site/Stripe-ACH-Onboarding", format: "Notion page", uploaded_by: "Maya Rao",    uploaded_at: "3 weeks ago", status: "indexed",  nodes_generated: 9,  summary: "Step-by-step onboarding instructions for enabling ACH on a Stripe Connect account. Updated every release.", tags: ["stripe","onboarding","ach"], last_used: "yesterday" },
    { id: "res_b3", title: "ACH dispute runbook — finance ops",            kind: "note", source: "pasted by Jordan Chen",                  format: "Markdown",    uploaded_by: "Jordan Chen", uploaded_at: "4 days ago",  status: "indexed",  nodes_generated: 5,  summary: "How finance ops handles an ACH dispute end-to-end: contact within 24h, file response by day 5, post-mortem day 10.", tags: ["dispute","runbook","finance-ops"], last_used: "1h ago" },
    { id: "res_b4", title: "Q1 invoicing transcript — exec review",        kind: "file", source: "Otter.ai · 2026-02-12",                  format: "VTT",         size_kb: 84,   uploaded_by: "Maya Rao",    uploaded_at: "yesterday",   status: "indexing", nodes_generated: 0,  summary: "53-min meeting transcript where the exec team agreed to push ACH availability earlier. Athena parsing now.", tags: ["meeting","decisions","ach"], last_used: null, progress: 64 },
    { id: "res_b5", title: "ACH dispute timeline cheat-sheet",             kind: "note", source: "pasted by Tomas Lind",                   format: "Markdown",    uploaded_by: "Tomas Lind",  uploaded_at: "2 weeks ago", status: "queued",   nodes_generated: 0,  summary: "Internal cheat-sheet on the ACH dispute timeline (60-day chargeback window, retention rules). Re-indexed quarterly.", tags: ["ach","dispute"], last_used: null },
  ],
  cap_data: [
    { id: "res_d1", title: "Metrics catalog spec · v3.2",                  kind: "file", source: "Engineering shared drive",                format: "PDF",         size_kb: 240,  uploaded_by: "Priya Shah",  uploaded_at: "2 weeks ago", status: "indexed",  nodes_generated: 12, summary: "How metrics are added, who reviews, how to deprecate. Required reading before any change to `metrics_catalog.yml`.", tags: ["metrics","catalog","governance"], last_used: "yesterday" },
    { id: "res_d2", title: "Snowflake → NetSuite mapping",                 kind: "link", source: "lumen.notion.site/Snowflake-NetSuite",    format: "Notion page", uploaded_by: "Jordan Chen", uploaded_at: "1 month ago", status: "indexed",  nodes_generated: 6,  summary: "Field-level mapping between Snowflake revenue mart and NetSuite GL accounts. Reviewed monthly with Finance.", tags: ["snowflake","netsuite","mapping"], last_used: "3d ago" },
  ],
  cap_platform: [
    { id: "res_p1", title: "SOC 2 Type II audit report (Q1 2026)",         kind: "file", source: "Compliance · audit firm",                 format: "PDF",         size_kb: 3200, uploaded_by: "Tomas Lind",  uploaded_at: "3 weeks ago", status: "indexed",  nodes_generated: 22, summary: "Q1 2026 SOC 2 Type II report. Drives most of the platform's audit controls and the access-review cadence.", tags: ["soc2","compliance","audit"], last_used: "5d ago" },
    { id: "res_p2", title: "Lumen SSO admin guide (customer-facing)",      kind: "link", source: "lumen.com/docs/sso-admin",                format: "Public docs", uploaded_by: "Tomas Lind",  uploaded_at: "6 weeks ago", status: "indexed",  nodes_generated: 9,  summary: "Customer-facing setup guide for SAML + SCIM. Used as the design source for the SSO wizard.", tags: ["sso","docs","customer-facing"], last_used: "1w ago" },
    { id: "res_p3", title: "Workspace state machine ADR draft (ADR-018)",  kind: "note", source: "pasted by Tomas Lind",                   format: "Markdown",    uploaded_by: "Tomas Lind",  uploaded_at: "6 weeks ago", status: "indexed",  nodes_generated: 4,  summary: "Defines paused/active/snoozed semantics. Now the active source-of-truth for tsk_002.", tags: ["adr","workspace","state-machine"], last_used: "2h ago" },
  ],
};

/* ------------------------------------------------- capability config (per-phase model + skills + review policy) */
export interface MockCapabilityConfig {
  models: Record<string, string>;
  skills: string[];
  review_policy: {
    spec_approvers: number;
    review_approvers: number;
    ci_must_pass: boolean;
    auto_merge: boolean;
  };
  context_repos: string[];
}

export const capabilityConfigs: Record<string, MockCapabilityConfig> = {
  cap_inbox: {
    models: { spec: "claude-opus-4-7", plan: "claude-opus-4-7", implement: "claude-sonnet-4-6", review: "claude-opus-4-7", ci: "claude-haiku-4-5", pr: "claude-haiku-4-5" },
    skills: ["skl_triage_quality","skl_perf","skl_rls","skl_adr_linker","skl_test_gen","skl_ci_triage"],
    review_policy: { spec_approvers: 2, review_approvers: 2, ci_must_pass: true, auto_merge: false },
    context_repos: ["inbox-web","inbox-svc","triage-worker"],
  },
  cap_billing: {
    models: { spec: "claude-opus-4-7", plan: "claude-opus-4-7", implement: "claude-sonnet-4-6", review: "claude-opus-4-7", ci: "claude-haiku-4-5", pr: "claude-haiku-4-5" },
    skills: ["skl_stripe","skl_pci","skl_rls","skl_migration_safety","skl_adr_linker","skl_pm_voice","skl_test_gen"],
    review_policy: { spec_approvers: 2, review_approvers: 1, ci_must_pass: true, auto_merge: false },
    context_repos: ["billing-svc","billing-web","finance-pipeline"],
  },
  cap_data: {
    models: { spec: "claude-sonnet-4-6", plan: "claude-opus-4-7", implement: "claude-sonnet-4-6", review: "claude-opus-4-7", ci: "claude-haiku-4-5", pr: "claude-haiku-4-5" },
    skills: ["skl_migration_safety","skl_rls","skl_test_gen","skl_adr_linker"],
    review_policy: { spec_approvers: 1, review_approvers: 1, ci_must_pass: true, auto_merge: false },
    context_repos: ["dbt-models","lake-ingest"],
  },
  cap_platform: {
    models: { spec: "claude-opus-4-7", plan: "claude-opus-4-7", implement: "claude-sonnet-4-6", review: "claude-opus-4-7", ci: "claude-haiku-4-5", pr: "claude-haiku-4-5" },
    skills: ["skl_rls","skl_migration_safety","skl_adr_linker","skl_pm_voice"],
    review_policy: { spec_approvers: 2, review_approvers: 2, ci_must_pass: true, auto_merge: false },
    context_repos: ["identity-svc","admin-web","infra"],
  },
};

/* ------------------------------------------------- domain notes (per-capability) */
export const domainNotes: Record<string, { id: string; title: string; body: string; promoted_from: string; author: string; date: string }[]> = {
  cap_inbox: [
    { id: "note_n1", title: "Triage confidence threshold history & rationale", body: "0.75 → 0.85 over 6 months. Held-out experiment (Q4 2025) by Dana validated the lift. Owen proposed 0.90 in Q1 2026; vetoed by Dana — over-escalation pressure. Per-label thresholds are the next experiment.", promoted_from: "chat thread thr_3", author: "Avi Patel", date: "yesterday" },
    { id: "note_n2", title: "Hydration uses 30-day fuzzy match as last resort", body: "ConversationHydrator: In-Reply-To → References → 30d fuzzy match on (sender + subject). Fuzzy match has caused incidents (LUMEN-1402, LUMEN-1611). Never extend the window without a post-mortem.", promoted_from: "post-mortem of LUMEN-1611", author: "Priya Shah", date: "3 weeks ago" },
  ],
  cap_billing: [
    { id: "note_b1", title: "Stripe is the only payment processor for v1",     body: "No fallback processor in v1; multi-processor is FY26.",                                                                                                  promoted_from: "chat thread thr_2", author: "Maya Rao",    date: "1 week ago" },
    { id: "note_b2", title: "ACH disputes never auto-retry",                    body: "Per ADR-014: finance handles every ACH dispute manually within 24h of webhook.",                                                                       promoted_from: "review of tsk_001", author: "Jordan Chen", date: "yesterday" },
  ],
  cap_platform: [
    { id: "note_p1", title: "Workspace state is the single source of truth",   body: "Every tenant-bearing table reads workspace_id + workspace.state for RLS + feature gating. Don't add a parallel 'paused' flag — extend ADR-018 states instead.", promoted_from: "ADR-018",          author: "Tomas Lind",  date: "2 weeks ago" },
  ],
};

/* ----------------------------------------------------------- briefs (Athena-owned knowledge)
 * Per knowledge-model.md §5: the Brief is a structured, multi-section
 * document per scope. Capability Brief for `cap_billing` (8 sections),
 * Repo Brief for `lumen/billing-svc` aliased onto `repo_b1` (12 sections),
 * Org Brief for Lumen (3 sections). Plus two pending proposals on the
 * `conventions` section so the approval-queue UI has something to demo. */

export interface MockBrief {
  toc: BriefToc;
  /** Section bodies keyed by `section_key`. */
  sections: Record<string, BriefSection>;
  /** Revision history per section. */
  revisions: Record<string, BriefSectionRevision[]>;
  /** All proposals (pending + decided) for this brief. */
  proposals: BriefSectionProposal[];
}

const NOW = "2026-05-23T09:00:00Z";

function makeSection(args: {
  brief_id: string;
  section_key: string;
  title: string;
  summary: string;
  ordering: number;
  origin: BriefSection["origin"];
  body: string;
  editable?: boolean;
  locked?: boolean;
  protected_from_ai?: boolean;
  source_refs?: BriefSection["source_refs"];
  /** F-04.9 — mark the section as user-edited for the "edited" badge demo. */
  user_edited?: boolean;
  last_edited_by_user_name?: string;
  last_edited_at?: string;
  last_decision_id?: string;
}): BriefSection {
  const editable = args.editable ?? (args.origin !== "derived");
  const section: BriefSection = {
    section_key: args.section_key,
    title: args.title,
    summary: args.summary,
    token_count: Math.ceil(args.body.length / 4),
    origin: args.origin,
    editable,
    locked: args.locked ?? false,
    protected_from_ai: args.protected_from_ai ?? false,
    current_version: 1,
    has_pending_proposal: false,
    parent_section_key: null,
    ordering: args.ordering,
    body_markdown: args.body,
    body_json: null,
    body_kind: "markdown",
    source_refs: args.source_refs ?? [],
    last_edited_by_user_id: null,
    last_synced_at: NOW,
  };
  if (args.user_edited) section.user_edited = true;
  if (args.last_edited_by_user_name) section.last_edited_by_user_name = args.last_edited_by_user_name;
  if (args.last_edited_at) section.last_edited_at = args.last_edited_at;
  if (args.last_decision_id) section.last_decision_id = args.last_decision_id;
  return section;
}

function makeRevision(args: {
  section_id: string;
  version: number;
  body: string;
  author_kind: BriefSectionRevision["author_kind"];
  author_id: string;
  change_note?: string;
  when: string;
}): BriefSectionRevision {
  return {
    id: `rev_${args.section_id}_${args.version}`,
    version: args.version,
    body_markdown: args.body,
    body_json: null,
    author_kind: args.author_kind,
    author_id: args.author_id,
    change_note: args.change_note ?? null,
    created_at: args.when,
  };
}

const CAP_BRIEF_ID = "brief_cap_billing";

const capBillingSections: BriefSection[] = [
  makeSection({
    brief_id: CAP_BRIEF_ID, section_key: "overview", ordering: 0, origin: "synthesized",
    title: "Overview", summary: "Subscription pricing + invoicing for Lumen. Owns Stripe, the revenue mart, and the dunning workflow.",
    body: `# Overview

The **Billing** capability owns every customer-facing money movement at Lumen:
subscription pricing tiers, invoice generation, dunning, refunds, and revenue
recognition. It is the only capability with direct Stripe access; downstream
systems read invoice state but never write it.

**Primary user.** Finance ops + customer-finance admins.
**Success metric.** Net revenue retention ≥ 110%; invoice-paid-rate ≥ 96% at 30
days; ACH dispute rate < 0.4%.

Owned repos: \`billing-svc\` (state machine + Stripe handlers), \`billing-web\`
(checkout UI), \`finance-pipeline\` (mart writeback + dunning cohorts).
`,
    source_refs: [
      {
        kind: "decision", id: "ADR-014", label: "Money handling",
        drift: "stale",
        content_hash_at_sync: "b1d2e3f4a5c6",
        current_content_hash: "9f8e7d6c5b4a",
        source_changed_at: "2026-05-23T07:50:00Z",
      },
      { kind: "kg_node", id: "svc_billing_svc", label: "billing-svc service", drift: "fresh" },
    ],
  }),
  makeSection({
    brief_id: CAP_BRIEF_ID, section_key: "guardrails", ordering: 1, origin: "authored",
    title: "Guardrails", summary: "DON'Ts: never store raw bank details; never auto-retry ACH disputes; never bypass Stripe Elements.",
    body: `# Guardrails

- **Never** store raw bank account / card numbers. Bank-account entry must go
  through Stripe Elements; PAN / routing-number bytes never touch our origin.
- **Never** auto-retry an ACH dispute. Finance handles every dispute manually
  within 24 hours of the webhook (ADR-014).
- **Never** mutate \`invoice.status\` without going through the
  \`Invoice.transition()\` state machine. Direct UPDATEs are rejected by the
  RLS policy.
- **Never** log charge IDs in plaintext. Hash with SHA-256 and log the first
  12 hex chars only — auditor flagged this in tsk_001 review.
`,
    source_refs: [
      { kind: "decision", id: "ADR-014", label: "Money handling" },
      { kind: "agents_md_section", id: "billing-svc/AGENTS.md#dont", label: "billing-svc AGENTS.md — Don't" },
    ],
  }),
  makeSection({
    brief_id: CAP_BRIEF_ID, section_key: "conventions", ordering: 2, origin: "synthesized",
    title: "Conventions", summary: "Money in minor units (integer); state changes through transition(); ADR linker required on every PR.",
    body: `# Conventions

- **Money in minor units.** Stored as \`Decimal\` in DB, manipulated as
  integer cents in app code. Never \`float\`. ADR-014.
- **State changes** go through \`Invoice.transition(target, reason)\`. The
  state machine validates legality; raw status writes raise
  \`InvalidTransitionError\`.
- **PRs touching \`billing-svc/src/checkout/\` require a Finance reviewer.**
  Auto-applied by CODEOWNERS.
- **Tests:** every state-machine transition has a property-based test in
  \`tests/states/\`. Hypothesis seeds are checked in.
- **Migrations:** non-transactional enum changes use the two-phase pattern
  (ADD VALUE → backfill → DROP). Cherry-picked into the release branch
  only after a successful canary.
`,
    source_refs: [
      { kind: "decision", id: "ADR-014", label: "Money handling", drift: "fresh" },
      { kind: "agents_md_section", id: "billing-svc/AGENTS.md#conventions", label: "billing-svc AGENTS.md — Conventions", drift: "fresh" },
      { kind: "code_path", id: "billing-svc/src/states/", label: "Invoice state machine", drift: "fresh" },
    ],
    protected_from_ai: true,
    user_edited: true,
    last_edited_by_user_name: "Avi Patel",
    last_edited_at: "2026-05-23T08:30:00Z",
    last_decision_id: "rd_004",
  }),
  makeSection({
    brief_id: CAP_BRIEF_ID, section_key: "services", ordering: 3, origin: "derived",
    title: "Services", summary: "billing-svc · billing-web · finance-pipeline · dunning-worker.",
    body: `# Services

- **billing-svc** — Stripe handlers, invoice state machine, webhook router.
  Owned by Engineering (Avi Patel). 47 endpoints, 8 background workers.
- **billing-web** — Customer-facing checkout UI. Owned by Web (Priya Shah).
  3 surfaces: invoices, subscriptions, dispute-response.
- **finance-pipeline** — Mart writeback (NetSuite reconciliation), dunning
  cohort computation, revenue recognition. Owned by Data (Jordan Chen).
- **dunning-worker** — Sidecar that reads cohorts + sends reminders. Read-only
  consumer of \`finance-pipeline\` outputs.
`,
    source_refs: [
      { kind: "kg_node", id: "svc_billing_svc",       label: "billing-svc" },
      { kind: "kg_node", id: "svc_billing_web",       label: "billing-web" },
      { kind: "kg_node", id: "svc_finance_pipeline",  label: "finance-pipeline" },
    ],
    editable: false,
  }),
  makeSection({
    brief_id: CAP_BRIEF_ID, section_key: "domain_glossary", ordering: 4, origin: "synthesized",
    title: "Domain glossary", summary: "ACH · MRR · ARR · dunning · dispute · invoice state machine · revenue mart.",
    body: `# Domain glossary

- **ACH** — Automated Clearing House. US bank-to-bank transfer; 1–4 business
  day settlement, 60-day dispute window.
- **Dunning** — The cohort + reminder flow that nudges customers with overdue
  invoices. Athena's \`dunning-worker\` runs it.
- **Mart** — Aggregated, business-grade table in the warehouse. Our revenue
  mart is the source of truth that finance reads.
- **Dispute** — Customer's bank pulls back a charge. ACH disputes have a much
  longer window than cards (60d vs 120d).
- **MRR / ARR** — Monthly / Annual recurring revenue. Computed nightly from
  the revenue mart.
`,
  }),
  makeSection({
    brief_id: CAP_BRIEF_ID, section_key: "stack", ordering: 5, origin: "derived",
    title: "Stack", summary: "Python 3.12 · FastAPI · SQLAlchemy · Stripe SDK · React 19 · Next.js 15 · Tailwind v4.",
    body: `# Stack

**Backend (\`billing-svc\`, \`finance-pipeline\`).**
- Python 3.12 + FastAPI + Pydantic v2 + SQLAlchemy 2.0.
- Stripe SDK v12. Postgres 16 with RLS.
- Tests: pytest + Hypothesis. CI: GitHub Actions.

**Frontend (\`billing-web\`).**
- React 19 + Next.js 15 + Tailwind v4. Stripe Elements for checkout.
- shadcn-style primitives owned in-repo.
`,
    editable: false,
  }),
  makeSection({
    brief_id: CAP_BRIEF_ID, section_key: "decisions", ordering: 6, origin: "derived",
    title: "Decisions", summary: "ADR-014 (money handling), ADR-015 (audit trail), ADR-027 (reversible actions).",
    body: `# Decisions

- **ADR-014 · Money handling** — Currency is stored as integer minor units.
  ACH disputes never auto-retry.
- **ADR-015 · Audit trail** — Every \`Invoice.transition()\` writes to
  \`audit_log\` synchronously; failures roll back the transition.
- **ADR-027 · Customer-initiated reversible actions** — All customer-reversible
  actions are revertable from the same surface.
`,
    editable: false,
  }),
  makeSection({
    brief_id: CAP_BRIEF_ID, section_key: "open_questions", ordering: 7, origin: "authored",
    title: "Open questions", summary: "How long can dunning continue after an ACH dispute? Should we surface dispute reason to the customer?",
    body: `# Open questions

- How long should dunning continue after an ACH dispute is filed? Today it
  pauses for 60 days; might be too conservative for high-trust customers.
- Should we surface the *bank-stated* dispute reason to the customer? Legal
  hasn't weighed in yet.
- Multi-processor support (Adyen, Braintree) — when do we revisit? Currently
  punted to FY26.
`,
  }),
];

const capBillingProposalConventionsId = "prop_cap_billing_conventions_1";
const capBillingProposalConventionsId2 = "prop_cap_billing_conventions_2";

const capBillingProposals: BriefSectionProposal[] = [
  {
    id: capBillingProposalConventionsId,
    brief_section_id: "section_cap_billing_conventions",
    section_key: "conventions",
    proposed_body_markdown:
      capBillingSections.find((s) => s.section_key === "conventions")!.body_markdown +
      `\n- **Idempotency keys** on every mutating endpoint. Stripe \`event.id\` is the dedup key for webhook handlers; client-supplied \`Idempotency-Key\` for direct API calls.\n`,
    proposed_body_json: null,
    proposed_summary: "Idempotency-key requirement made explicit in conventions",
    proposed_title: null,
    diff_summary: "Added 1 convention: Idempotency-Key on mutating endpoints (sourced from billing-svc AGENTS.md update)",
    reason: "Sync detected new convention in billing-svc/AGENTS.md §Conventions",
    status: "pending",
    proposed_at: "2026-05-22T17:30:00Z",
    proposed_by_run_id: null,
  },
  {
    id: capBillingProposalConventionsId2,
    brief_section_id: "section_cap_billing_conventions",
    section_key: "conventions",
    proposed_body_markdown:
      capBillingSections.find((s) => s.section_key === "conventions")!.body_markdown +
      `\n- **Webhook signature verification** is required on every Stripe-sourced endpoint. Use the canonical \`stripe.Webhook.constructEvent\` helper — never roll your own HMAC.\n`,
    proposed_body_json: null,
    proposed_summary: "Webhook signature requirement formalised",
    proposed_title: null,
    diff_summary: "Added 1 convention: webhook signature must use canonical helper",
    reason: "Sync detected new section in billing-svc/AGENTS.md mentioning webhook verification",
    status: "pending",
    proposed_at: "2026-05-23T03:14:00Z",
    proposed_by_run_id: null,
  },
];

// Mark the conventions section as having a pending proposal for TOC rendering.
capBillingSections.find((s) => s.section_key === "conventions")!.has_pending_proposal = true;

const capBillingBrief: MockBrief = {
  toc: {
    brief_id: CAP_BRIEF_ID,
    scope_kind: "capability",
    capability_id: "cap_billing",
    repo_id: null,
    status: "ready",
    last_synced_at: NOW,
    sections: capBillingSections.map((s) => ({
      section_key: s.section_key,
      title: s.title,
      summary: s.summary,
      token_count: s.token_count,
      origin: s.origin,
      editable: s.editable,
      locked: s.locked,
      protected_from_ai: s.protected_from_ai,
      current_version: s.current_version,
      has_pending_proposal: s.has_pending_proposal,
      parent_section_key: s.parent_section_key,
      ordering: s.ordering,
    })),
    pending_proposals_count: capBillingProposals.filter((p) => p.status === "pending").length,
  },
  sections: Object.fromEntries(capBillingSections.map((s) => [s.section_key, s])),
  revisions: Object.fromEntries(
    capBillingSections.map((s) => [
      s.section_key,
      [
        makeRevision({
          section_id: s.section_key,
          version: 1,
          body: s.body_markdown ?? "",
          author_kind: s.origin === "authored" ? "human" : "agent",
          author_id: s.origin === "authored" ? USER_ID : "athena_brief_builder",
          change_note: "Initial section seed",
          when: "2026-05-01T09:30:00Z",
        }),
      ],
    ]),
  ),
  proposals: capBillingProposals,
};

const REPO_BRIEF_ID = "brief_repo_billing_svc";

const repoBillingSvcSections: BriefSection[] = [
  makeSection({
    brief_id: REPO_BRIEF_ID, section_key: "overview", ordering: 0, origin: "synthesized",
    title: "Overview", summary: "Python 3.12 FastAPI service. Stripe-facing handlers, invoice state machine, dunning sidecar entry point.",
    body: `# lumen/billing-svc

Python 3.12 + FastAPI service backing the Billing capability. Owns the
Stripe-facing webhook router, the invoice state machine, and the dunning
worker entry point. ~18k LOC, 47 endpoints, 12 background workers.

Default branch: \`main\`. Releases cut weekly on Tuesdays from the
\`release\` branch. CI: GitHub Actions, target green time < 6 minutes.
`,
    source_refs: [{ kind: "code_path", id: "billing-svc/README.md", label: "README · first paragraph" }],
  }),
  makeSection({
    brief_id: REPO_BRIEF_ID, section_key: "guardrails", ordering: 1, origin: "authored",
    title: "Guardrails", summary: "DON'Ts specific to billing-svc: no float, no raw status writes, no inline secrets.",
    body: `# Guardrails (repo)

- Never use \`float\` for money — \`Decimal\` only.
- Never write to \`invoice.status\` directly — always
  \`Invoice.transition(target, reason)\`.
- Never inline a secret. Use \`Settings\` (Pydantic) bound to env vars.
- Never \`print()\` — \`log.info()\` via structlog.
`,
    source_refs: [{ kind: "agents_md_section", id: "billing-svc/AGENTS.md#dont", label: "AGENTS.md — Don't" }],
  }),
  makeSection({
    brief_id: REPO_BRIEF_ID, section_key: "conventions", ordering: 2, origin: "synthesized",
    title: "Conventions", summary: "ruff + black; pytest with Hypothesis seeds; module ≤ 250 lines; function ≤ 30 lines.",
    body: `# Conventions (repo)

- **Linting:** ruff + black. Run \`make lint\` before push.
- **Tests:** pytest. Property-based tests with Hypothesis seeds checked in.
- **File budget:** module ≤ 250 lines, function ≤ 30 lines.
- **Imports:** absolute only. \`isort\` profile = black.
- **Type-checking:** \`mypy --strict\`. Every PR must be clean.
`,
    source_refs: [
      { kind: "code_path", id: "billing-svc/pyproject.toml", label: "pyproject.toml · [tool.ruff]" },
      { kind: "agents_md_section", id: "billing-svc/AGENTS.md#conventions", label: "AGENTS.md — Conventions" },
    ],
  }),
  makeSection({
    brief_id: REPO_BRIEF_ID, section_key: "stack", ordering: 3, origin: "derived",
    title: "Stack", summary: "Python 3.12 · FastAPI · Pydantic v2 · SQLAlchemy 2.0 · Postgres 16 · Redis · Stripe SDK 12.",
    body: `# Stack

- Python 3.12, FastAPI 0.115, Pydantic v2, SQLAlchemy 2.0.
- Postgres 16 (RLS on every table), Redis 7.
- Stripe SDK v12. Sentry + OTel for observability.
- Package manager: \`uv\`. Build: \`hatchling\`.
`,
    editable: false,
  }),
  makeSection({
    brief_id: REPO_BRIEF_ID, section_key: "api_surface", ordering: 4, origin: "derived",
    title: "API surface", summary: "47 public endpoints across /invoices, /subscriptions, /webhooks, /admin.",
    body: `# API surface

- \`/invoices/*\` — 18 endpoints (CRUD + state actions).
- \`/subscriptions/*\` — 12 endpoints.
- \`/webhooks/stripe\` — single endpoint, fans out by \`event.type\`.
- \`/admin/*\` — 14 endpoints, owner / admin role only.

OpenAPI is exported via \`uv run python -m athena.api.openapi > openapi.json\`
on every merge.
`,
    editable: false,
  }),
  makeSection({
    brief_id: REPO_BRIEF_ID, section_key: "data_models", ordering: 5, origin: "derived",
    title: "Data models", summary: "Invoice · Subscription · Customer · Charge · DisputeRecord. SQLAlchemy + Pydantic mirrored.",
    body: `# Data models

Primary models live in \`src/models/\`:

- \`Invoice\` — state machine; \`status \\in {draft, open, ach_pending, paid, void, uncollectible, disputed}\`.
- \`Subscription\` — Stripe-mirror; renewal cron at 02:00 UTC.
- \`Customer\` — billing identity only; auth identity lives in \`identity-svc\`.
- \`Charge\` — every Stripe charge mirrored; PII fields hashed.
- \`DisputeRecord\` — append-only; never deleted, never auto-resolved.
`,
    editable: false,
  }),
  makeSection({
    brief_id: REPO_BRIEF_ID, section_key: "entry_points", ordering: 6, origin: "derived",
    title: "Entry points", summary: "src/main.py (HTTP) · src/workers/dunning.py · src/workers/mart_writeback.py · CLI in src/cli/.",
    body: `# Entry points

- \`src/main.py\` — HTTP entry (\`uvicorn athena.billing.main:app\`).
- \`src/workers/dunning.py\` — runs every 4h, computes overdue cohorts.
- \`src/workers/mart_writeback.py\` — nightly, exports to the revenue mart.
- \`src/cli/*\` — admin CLIs (reissue-invoice, replay-webhook, etc.).
`,
    editable: false,
  }),
  makeSection({
    brief_id: REPO_BRIEF_ID, section_key: "hot_files", ordering: 7, origin: "derived",
    title: "Hot files", summary: "Top 5: src/states/invoice.py · src/webhooks/router.py · src/checkout/ach.ts · src/billing/api.py · src/workers/dunning.py.",
    body: `# Hot files

Top files by combined inbound + outbound edges:

1. \`src/states/invoice.py\` — 41 edges in, 18 out.
2. \`src/webhooks/router.py\` — 33 edges in, 22 out.
3. \`src/checkout/ach.ts\` — 21 edges in, 14 out (added by tsk_001).
4. \`src/billing/api.py\` — 19 edges in, 12 out.
5. \`src/workers/dunning.py\` — 17 edges in, 9 out.
`,
    editable: false,
  }),
  makeSection({
    brief_id: REPO_BRIEF_ID, section_key: "tests_and_ci", ordering: 8, origin: "derived",
    title: "Tests + CI", summary: "pytest + Hypothesis · 1,247 tests · target green time 6 min · GitHub Actions.",
    body: `# Tests + CI

- 1,247 tests (847 unit, 312 integration, 88 property-based).
- Target green time: 6 minutes from push to merge-ready.
- CI provider: GitHub Actions. Workflow file: \`.github/workflows/ci.yml\`.
- Coverage gate: 80% line coverage on touched files.
`,
    editable: false,
  }),
  makeSection({
    brief_id: REPO_BRIEF_ID, section_key: "build_and_run", ordering: 9, origin: "derived",
    title: "Build + run", summary: "uv venv && uv pip install -e . · uv run uvicorn billing.main:app --reload · docker compose up.",
    body: `# Build + run

\`\`\`sh
uv venv && uv pip install -e ".[dev]"
docker compose up -d postgres redis        # deps only
uv run uvicorn billing.main:app --reload    # API server
uv run pytest                                # tests
\`\`\`

Migrations: \`uv run alembic upgrade head\`. Reset DB: \`make db-reset\`.
`,
    editable: true,
  }),
  makeSection({
    brief_id: REPO_BRIEF_ID, section_key: "deployment_surface", ordering: 10, origin: "derived",
    title: "Deployment", summary: "Dockerfile · helm/billing-svc chart · canary 5% for 48h before broad enable.",
    body: `# Deployment

- \`Dockerfile\` — multi-stage Python build.
- Helm chart in \`helm/billing-svc/\`.
- Argo CD watches the \`release\` branch.
- Canary: 5% pods for 48h before broad enable.
`,
    editable: false,
  }),
  makeSection({
    brief_id: REPO_BRIEF_ID, section_key: "external_deps", ordering: 11, origin: "derived",
    title: "External deps", summary: "Top 20 from pyproject.toml: fastapi, pydantic, sqlalchemy, stripe, structlog, asyncpg, redis…",
    body: `# External deps (top 20)

\`fastapi\`, \`pydantic\`, \`sqlalchemy\`, \`stripe\`, \`structlog\`,
\`asyncpg\`, \`redis\`, \`opentelemetry-sdk\`, \`sentry-sdk\`, \`uvicorn\`,
\`hatchling\`, \`alembic\`, \`anyio\`, \`hypothesis\`, \`pytest\`,
\`pytest-asyncio\`, \`ruff\`, \`mypy\`, \`black\`, \`pre-commit\`.
`,
    editable: false,
  }),
  makeSection({
    brief_id: REPO_BRIEF_ID, section_key: "local_idioms", ordering: 12, origin: "synthesized",
    title: "Local idioms", summary: "Money in cents; transitions through state machine; webhooks fan out by event.type.",
    body: `# Local idioms

- **Money in cents.** \`Decimal\` in the DB, integer cents at the boundary.
- **\`Invoice.transition(target, reason)\`** — the only legal way to change
  \`invoice.status\`.
- **Webhook router fans out by \`event.type\`.** Don't add inline if/elif
  branches in \`router.py\`; register handlers in \`src/webhooks/handlers/\`
  and re-export.
- **Tests for state transitions are property-based** — see
  \`tests/states/test_invoice_transitions.py\` for the canonical pattern.
`,
  }),
  makeSection({
    brief_id: REPO_BRIEF_ID, section_key: "recent_activity", ordering: 13, origin: "derived",
    title: "Recent activity", summary: "12 PRs merged in the last 30 days · tsk_001 ACH support landed yesterday.",
    body: `# Recent activity

- **tsk_001 · Stripe ACH support** — merged yesterday. 8 PRs, 3 reviewers.
- **tsk_038 · Dunning cadence tweak** — merged 4d ago.
- **infra · Postgres 16 upgrade** — merged 1w ago.
- **tsk_022 · Charge ID hashing** — merged 1w ago (auditor finding).

12 PRs merged in last 30 days. 0 reverts. 1 hotfix.
`,
    editable: false,
  }),
];

const repoBillingSvcBrief: MockBrief = {
  toc: {
    brief_id: REPO_BRIEF_ID,
    scope_kind: "repo",
    capability_id: "cap_billing",
    repo_id: "repo_b1",
    status: "ready",
    last_synced_at: NOW,
    sections: repoBillingSvcSections.map((s) => ({
      section_key: s.section_key,
      title: s.title,
      summary: s.summary,
      token_count: s.token_count,
      origin: s.origin,
      editable: s.editable,
      locked: s.locked,
      protected_from_ai: s.protected_from_ai,
      current_version: s.current_version,
      has_pending_proposal: s.has_pending_proposal,
      parent_section_key: s.parent_section_key,
      ordering: s.ordering,
    })),
    pending_proposals_count: 0,
  },
  sections: Object.fromEntries(repoBillingSvcSections.map((s) => [s.section_key, s])),
  revisions: Object.fromEntries(
    repoBillingSvcSections.map((s) => [
      s.section_key,
      [
        makeRevision({
          section_id: s.section_key,
          version: 1,
          body: s.body_markdown ?? "",
          author_kind: s.origin === "authored" ? "human" : "agent",
          author_id: s.origin === "authored" ? USER_ID : "athena_brief_builder",
          change_note: "Initial section seed",
          when: "2026-05-02T10:00:00Z",
        }),
      ],
    ]),
  ),
  proposals: [],
};

const ORG_BRIEF_ID = "brief_org_lumen";
const orgBriefSections: BriefSection[] = [
  makeSection({
    brief_id: ORG_BRIEF_ID, section_key: "overview", ordering: 0, origin: "authored",
    title: "Overview", summary: "Lumen is a B2B AI-powered customer-support platform — ~14 people, Series A, ~$8M ARR. We sell to mid-market companies (ACV $25k–$250k).",
    body: `# Overview

**Lumen** is a B2B customer-support platform with AI-powered triage at its
core. We sell a single product — the Lumen inbox — to mid-market companies
who run their customer support inside it. The triage worker labels every
incoming conversation, routes high-confidence ones automatically, and
escalates the rest to a human queue. Hospitality and SaaS are our two
strongest verticals; healthcare is on the FY27 roadmap.

## Size & shape

- **Headcount:** 14 people. 8 engineering, 2 PM, 2 design, 1 ops, 1 CEO.
- **Customers:** ~120 mid-market accounts. Median ACV $44k.
- **ARR:** ~$8M, growing ~9% MoM.
- **Stage:** Series A (closed Q3 2025). 18-month runway.

## Primary business motions

1. **Inbound from product-led trial** — companies try the inbox, expand to paid.
2. **Outbound to hospitality** — vertical play, ~40% of pipeline.
3. **Renewals & seat expansion** — biggest growth lever; managed by AM team.
`,
  }),
  makeSection({
    brief_id: ORG_BRIEF_ID, section_key: "capabilities", ordering: 1, origin: "synthesized",
    title: "Capability registry", summary: "Four capabilities: Inbox (flagship product), Billing, Data Platform, Platform & Identity.",
    body: `# Capability registry

Lumen carries four capabilities. Each owns 2–3 repos and has its own
capability Brief with the technical detail:

- **Inbox & Conversations** (\`cap_inbox\`) — the flagship product surface.
  3 repos: inbox-web (FE), inbox-svc (BE), triage-worker (ML). 22 domain
  notes. Avi (eng lead) + Priya (design) own it.
- **Billing & Subscriptions** (\`cap_billing\`) — subscriptions, invoicing,
  dunning, revenue recognition. 3 repos: billing-svc, billing-web,
  finance-pipeline. Maya (PM) + Jordan (finance) own it.
- **Data Platform** (\`cap_data\`) — lake → warehouse → mart pipelines, dbt
  models, freshness SLAs. 2 repos: dbt-models, lake-ingest. Priya owns it.
- **Platform & Identity** (\`cap_platform\`) — SSO/SCIM, workspace state,
  RBAC, infra-as-code. 3 repos: identity-svc, admin-web, infra. Tomas
  (security/CS lead) owns it.

Open the capability detail page for the technical deep-dive on each one.
`,
  }),
  makeSection({
    brief_id: ORG_BRIEF_ID, section_key: "capability_graph", ordering: 2, origin: "synthesized",
    title: "Capability graph", summary: "How the four capabilities interlock: Inbox routes through Triage → emits usage to Data → bills via Billing; all gated by Platform/RLS.",
    body: `# Capability graph

This is the org-level dependency map between capabilities. Edges are
service-to-service or data-flow dependencies that cross capability
boundaries — they are the places where coordination matters.

\`\`\`
Inbox ──(emits routed-conversation events)──▶ Data Platform ──(materialises
                                                                usage rollup)──▶ Billing
   │                                                                              │
   └─(workspace state, auth)─▶ Platform & Identity ◀─(workspace state, auth)──────┘
\`\`\`

## Cross-capability dependencies

- **Inbox → Data**: every routed conversation increments a usage counter
  in \`lake-ingest\`. Used by overage billing.
- **Data → Billing**: \`conversations_routed_daily\` rolls up into the
  monthly invoice generation in \`billing-svc\`.
- **All → Platform**: every tenant-bearing table reads workspace state
  from \`identity-svc\` (RLS gate per ADR-015).
- **Billing → Inbox** (soft): a workspace in \`paused\` state has its
  inbox locked-down — read-only for the customer, no auto-triage.

## Active in-flight changes

- \`tsk_001\` (Billing) — Add Stripe ACH for mid-market invoices. In
  CI/PR phase, 5% canary live.
- \`tsk_002\` (Platform) — Self-serve workspace snooze for hospitality
  customers. Draft phase, awaiting sign-off.
`,
  }),
  makeSection({
    brief_id: ORG_BRIEF_ID, section_key: "glossary", ordering: 3, origin: "authored",
    title: "Glossary", summary: "Lumen-specific terms: conversation · workspace · seat · triage label · confidence floor · MRR vs ARR.",
    body: `# Glossary

## Customer-facing terms

- **Conversation** — one customer-to-team thread. Has a unique id, a
  state (open / pending / resolved), and a triage label.
- **Workspace** — one customer's installation of Lumen. State is one of
  \`active\` / \`paused\` / \`snoozed\` (per ADR-018).
- **Seat** — one customer-team member who can use the workspace. Counted
  monthly for billing.
- **Triage label** — the classification the triage worker assigns to a
  conversation (e.g., \`billing-question\`, \`technical-bug\`).
- **Confidence floor** — the threshold below which a triage label
  triggers escalation to a human (default 0.85; per ADR-031).

## Org-internal terms

- **Capability** — the unit of architectural ownership at Lumen. Owns
  repos, decisions, and a capability Brief. Lumen has four.
- **Brief** — Athena's structured knowledge doc per scope (this thing).
- **Run** — one execution of an Athena task (implement / PRD / quickfix).
- **Phase** — a stage within a run (spec, plan, implement, review, ci, pr).

## Financial terms

- **MRR** — monthly recurring revenue. Lumen's North Star metric.
- **ARR** — annual run-rate of MRR. Reported to investors monthly.
- **NRR** — net revenue retention. The renewals + expansion lever.
`,
  }),
  makeSection({
    brief_id: ORG_BRIEF_ID, section_key: "security_policies", ordering: 4, origin: "authored",
    title: "Security policies", summary: "No PII in logs · no kubectl in agent tools · no auto-merge · WORM audit log · SOC 2 Type II certified Q1 2026.",
    body: `# Security policies

## Authoritative policies

- **No PII in logs.** Hash PII fields (charge IDs, email addresses)
  before they enter structured logs. Enforced by \`skl_pci\`.
- **No \`kubectl\` / \`terraform apply\` in agent tools.** Agents edit files
  only; humans run infra commands (ADR-027 #18).
- **No auto-merge.** Humans approve every gate (ADR-027 #19). Lumen has
  never auto-merged a PR.
- **WORM audit log.** \`audit_log\` is append-only at the postgres role
  level; nothing in the application can mutate or delete a row.
- **No cross-tenant cache.** Per-tenant isolation always (ADR-027 #16).

## Compliance posture

- **SOC 2 Type II**: certified Q1 2026 (audit report in cap_platform
  resources).
- **GDPR**: customer-data residency in EU is on the FY27 roadmap; today
  we operate from us-east-1.
- **Penetration tests**: quarterly with NCC Group. Last clean report
  2026-03-12.
`,
  }),
];

const orgBrief: MockBrief = {
  toc: {
    brief_id: ORG_BRIEF_ID,
    scope_kind: "org",
    capability_id: null,
    repo_id: null,
    status: "ready",
    last_synced_at: NOW,
    sections: orgBriefSections.map((s) => ({
      section_key: s.section_key,
      title: s.title,
      summary: s.summary,
      token_count: s.token_count,
      origin: s.origin,
      editable: s.editable,
      locked: s.locked,
      protected_from_ai: s.protected_from_ai,
      current_version: s.current_version,
      has_pending_proposal: s.has_pending_proposal,
      parent_section_key: s.parent_section_key,
      ordering: s.ordering,
    })),
    pending_proposals_count: 0,
  },
  sections: Object.fromEntries(orgBriefSections.map((s) => [s.section_key, s])),
  revisions: Object.fromEntries(
    orgBriefSections.map((s) => [
      s.section_key,
      [
        makeRevision({
          section_id: s.section_key,
          version: 1,
          body: s.body_markdown ?? "",
          author_kind: "human",
          author_id: USER_ID,
          change_note: "Initial org Brief seed",
          when: "2026-05-01T08:30:00Z",
        }),
      ],
    ]),
  ),
  proposals: [
    {
      id: "prop_org_glossary_001",
      brief_section_id: "section_org_glossary",
      section_key: "glossary",
      proposed_body_markdown:
        (orgBriefSections.find((s) => s.section_key === "glossary")!.body_markdown ?? "") +
        `\n## Lifecycle terms (newly proposed)\n\n` +
        `- **Workspace snooze** — a temporary pause on a customer workspace. ` +
        `Distinct from \`cancel\`: state is preserved, billing pauses, and the ` +
        `customer can resume at any time. Lifecycle is governed by ADR-018.\n` +
        `- **Routing override** — a manual decision by a human in the inbox that ` +
        `overrides the triage worker's auto-route for a single conversation. ` +
        `Recorded in audit log for the threshold-experiment cohort.\n`,
      proposed_body_json: null,
      proposed_summary: "Add two lifecycle terms: workspace snooze, routing override",
      proposed_title: null,
      diff_summary: "+2 glossary entries sourced from tsk_002 framing + tsk_001 chat thread thr_3",
      reason: "Sync detected two new terms in active task content; queued for approval per ADR-060",
      status: "pending",
      proposed_at: "2026-05-23T08:00:00Z",
      proposed_by_run_id: "tsk_002",
    },
    {
      id: "prop_org_capability_graph_001",
      brief_section_id: "section_org_capability_graph",
      section_key: "capability_graph",
      proposed_body_markdown:
        (orgBriefSections.find((s) => s.section_key === "capability_graph")!.body_markdown ?? "") +
        `\n## Inferred new edge\n\n` +
        `- **Inbox → Billing** (direct): the per-conversation usage counter now ` +
        `writes a synchronous event to \`billing-svc/usage_events\` for ` +
        `real-time overage threshold detection (was previously only batch via Data ` +
        `Platform). Adds a soft dependency between the inbox routing path and the ` +
        `billing service's availability.\n`,
      proposed_body_json: null,
      proposed_summary: "Capture new direct Inbox → Billing edge from synchronous usage events",
      proposed_title: null,
      diff_summary: "+1 cross-capability edge inferred from billing-svc PR #487 (merged 3d ago)",
      reason: "Knowledge sync inferred new service-to-service call from recent merges",
      status: "pending",
      proposed_at: "2026-05-23T08:30:00Z",
      proposed_by_run_id: null,
    },
  ],
};

// Mark the glossary + capability_graph TOC rows + sections as having a pending
// proposal so the BriefToc + BriefSectionViewer surface the indicator. Done
// imperatively because the Brief TOC is built at module load before `proposals`
// is wired in.
{
  const glossarySection = orgBriefSections.find((s) => s.section_key === "glossary");
  if (glossarySection) glossarySection.has_pending_proposal = true;
  const graphSection = orgBriefSections.find((s) => s.section_key === "capability_graph");
  if (graphSection) graphSection.has_pending_proposal = true;
  for (const row of orgBrief.toc.sections) {
    if (row.section_key === "glossary" || row.section_key === "capability_graph") {
      row.has_pending_proposal = true;
    }
  }
  orgBrief.toc.pending_proposals_count = 2;
}

export const briefs = {
  capabilities: { cap_billing: capBillingBrief } as Record<string, MockBrief>,
  repos:        { repo_b1: repoBillingSvcBrief } as Record<string, MockBrief>,
  orgs:         { [ORG_ID]: orgBrief } as Record<string, MockBrief>,
};

/* ----------------------------------------------------------- onboarding hint */
export const onboardingState = {
  current: "complete",
  completed_at: "3 weeks ago",
  completed_by: "Owen Petrov",
  steps: [
    { id: "o1", title: "Connect source control",      status: "done", detail: "GitHub · 11 repos indexed" },
    { id: "o2", title: "Set up SSO",                   status: "done", detail: "Okta SAML 2.0 + SCIM enforced" },
    { id: "o3", title: "Invite your team",             status: "done", detail: "7 members across 4 capabilities" },
    { id: "o4", title: "Define your first capability", status: "done", detail: "4 capabilities defined" },
    { id: "o5", title: "Connect a model provider",     status: "done", detail: "Anthropic direct (5 model IDs)" },
    { id: "o6", title: "Run your first task",          status: "done", detail: "2 example tasks loaded" },
  ],
};
