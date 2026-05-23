/**
 * Mock database — the canonical demo dataset behind `NEXT_PUBLIC_API_MODE=mock`.
 *
 * Acme Robotics, a fictional autonomous-warehouse company, has been using
 * Athena for ~3 weeks. Six capabilities, fifteen repos, a handful of in-flight
 * tasks, and a complete enterprise-readiness posture (SSO, audit, integrations,
 * cost).
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
} from "@/lib/api/client";

/* ------------------------------------------------------------------ identity */
export const ORG_ID = "org_acme";
export const USER_ID = "u_maya";
export const SERVER_TIME = () => new Date().toISOString();

export const orgs: Org[] = [
  {
    id: ORG_ID,
    name: "Acme Robotics",
    display_name: "Acme Robotics",
    slug: "acme-robotics",
    edition: "enterprise",
    verified_domains: ["acme.com", "acme-robotics.io"],
    auto_join_for_verified_domain: true,
    default_role_for_invite: "engineer",
    created_at: "2026-05-01T09:00:00Z",
  },
];

export const me: Me = {
  id: USER_ID,
  email: "demo@acme.com",
  display_name: "Demo User",
  avatar_url: null,
  is_employee: false,
  org_id: ORG_ID,
  org_name: "Acme Robotics",
  role: "admin",
  server_time: SERVER_TIME(),
  memberships: [
    {
      org_id: ORG_ID,
      org_name: "Acme Robotics",
      org_slug: "acme-robotics",
      org_edition: "enterprise",
      role: "admin",
      is_owner: false,
    },
  ],
};

export const members: Member[] = [
  { user_id: USER_ID,   membership_id: "m_1", email: "demo@acme.com",     display_name: "Demo User",    avatar_url: null, role: "admin",    is_owner: false, joined_at: "2026-05-01T09:10:00Z", deactivated_at: null },
  { user_id: "u_avi",   membership_id: "m_2", email: "avi@acme.com",      display_name: "Avi Patel",   avatar_url: null, role: "engineer", is_owner: false, joined_at: "2026-05-01T09:12:00Z", deactivated_at: null },
  { user_id: "u_jordan",membership_id: "m_3", email: "jordan@acme.com",   display_name: "Jordan Chen", avatar_url: null, role: "pm",       is_owner: false, joined_at: "2026-05-02T11:30:00Z", deactivated_at: null },
  { user_id: "u_priya", membership_id: "m_4", email: "priya@acme.com",    display_name: "Priya Shah",  avatar_url: null, role: "engineer", is_owner: false, joined_at: "2026-05-03T14:20:00Z", deactivated_at: null },
  { user_id: "u_tomas", membership_id: "m_5", email: "tomas@acme.com",    display_name: "Tomas Lind",  avatar_url: null, role: "admin",    is_owner: false, joined_at: "2026-05-04T08:00:00Z", deactivated_at: null },
  { user_id: "u_jordan2",membership_id:"m_6", email: "jordan.t@acme.com", display_name: "Jordan Tate", avatar_url: null, role: "engineer", is_owner: false, joined_at: "2026-05-05T10:00:00Z", deactivated_at: null },
  { user_id: "u_dana",  membership_id: "m_7", email: "dana@acme.com",     display_name: "Dana Lin",    avatar_url: null, role: "reviewer", is_owner: false, joined_at: "2026-05-17T15:40:00Z", deactivated_at: null },
  { user_id: "u_owen",  membership_id: "m_8", email: "owen@acme.com",     display_name: "Owen Petrov", avatar_url: null, role: "owner",    is_owner: true,  joined_at: "2026-05-01T08:00:00Z", deactivated_at: null },
];

export const invitations: Invitation[] = [
  { id: "inv_1", org_id: ORG_ID, email: "rachel@acme.com",  role: "engineer", invited_by_user_id: USER_ID,  expires_at: "2026-06-22T00:00:00Z", accepted_at: null, revoked_at: null, created_at: "2026-05-20T10:00:00Z" },
  { id: "inv_2", org_id: ORG_ID, email: "kai@acme.com",     role: "pm",       invited_by_user_id: "u_owen", expires_at: "2026-06-21T00:00:00Z", accepted_at: null, revoked_at: null, created_at: "2026-05-19T15:30:00Z" },
];

export const domains: DomainVerification[] = [
  { id: "dom_1", domain: "acme.com",          dns_txt_record_name: "_athena.acme.com",          dns_txt_value: "athena-verify=ZxQ8KqM2nP",  verified_at: "2026-05-02T11:00:00Z", last_checked_at: SERVER_TIME(), last_error: null },
  { id: "dom_2", domain: "acme-robotics.io",  dns_txt_record_name: "_athena.acme-robotics.io",  dns_txt_value: "athena-verify=R8mF4tLwYe",  verified_at: "2026-05-03T09:15:00Z", last_checked_at: SERVER_TIME(), last_error: null },
];

/* ------------------------------------------------------------- capabilities */
export interface MockCapability extends Capability {
  emblem: "violet" | "cyan" | "amber" | "indigo" | "rose" | "mint";
}

export const capabilities: MockCapability[] = [
  { id: "cap_billing",  org_id: ORG_ID, slug: "billing",       name: "Billing",          description: "Subscription pricing, invoicing, revenue recognition. Owns the Stripe integration and the Snowflake → NetSuite revenue pipeline.", created_by_user_id: USER_ID,  archived_at: null, created_at: "2026-05-01T09:30:00Z", emblem: "violet", icon: "circle-dollar", repos: 3, open_tasks: 2, domain_notes: 8,  last_activity: "3h ago"   },
  { id: "cap_fleet",    org_id: ORG_ID, slug: "fleet-ops",     name: "Fleet Ops",        description: "Live coordination of warehouse robots — task assignment, charging, exception handling.",                                            created_by_user_id: "u_avi",  archived_at: null, created_at: "2026-05-01T09:35:00Z", emblem: "cyan",   icon: "git-branch",    repos: 3, open_tasks: 4, domain_notes: 14, last_activity: "12m ago"  },
  { id: "cap_identity", org_id: ORG_ID, slug: "identity",      name: "Identity & Access",description: "SSO, SCIM provisioning, RBAC. Single source of truth for who can do what across every internal product.",                          created_by_user_id: "u_tomas",archived_at: null, created_at: "2026-05-01T09:40:00Z", emblem: "amber",  icon: "shield",        repos: 2, open_tasks: 1, domain_notes: 6,  last_activity: "yesterday"},
  { id: "cap_data",     org_id: ORG_ID, slug: "data-platform", name: "Data Platform",    description: "Lake → warehouse → mart pipelines. Owns dbt models, freshness SLAs, and the metrics catalog.",                                       created_by_user_id: "u_priya",archived_at: null, created_at: "2026-05-01T09:45:00Z", emblem: "indigo", icon: "database",      repos: 2, open_tasks: 3, domain_notes: 19, last_activity: "1h ago"   },
  { id: "cap_orders",   org_id: ORG_ID, slug: "order-mgmt",    name: "Order Management", description: "Inbound orders, allocation, returns, refunds. Bridges Salesforce, the warehouse, and finance.",                                     created_by_user_id: USER_ID,  archived_at: null, created_at: "2026-05-01T09:50:00Z", emblem: "rose",   icon: "list-tree",     repos: 1, open_tasks: 2, domain_notes: 11, last_activity: "4h ago"   },
  { id: "cap_insights", org_id: ORG_ID, slug: "insights",      name: "Customer Insights",description: "Behavioural analytics, NPS, churn signals. Reads from Data Platform, writes opinionated dashboards.",                                created_by_user_id: USER_ID,  archived_at: null, created_at: "2026-05-01T09:55:00Z", emblem: "mint",   icon: "star",          repos: 1, open_tasks: 1, domain_notes: 5,  last_activity: "2d ago"   },
];

export const capabilityRepos: Record<string, CapabilityRepo[]> = {
  cap_billing: [
    { id: "repo_b1", capability_id: "cap_billing",  integration_id: "int_github", repo_full_name: "acme/billing-svc",      default_branch: "main", attached_by_user_id: USER_ID,  created_at: "2026-05-02T10:00:00Z" },
    { id: "repo_b2", capability_id: "cap_billing",  integration_id: "int_github", repo_full_name: "acme/billing-web",      default_branch: "main", attached_by_user_id: USER_ID,  created_at: "2026-05-02T10:01:00Z" },
    { id: "repo_b3", capability_id: "cap_billing",  integration_id: "int_github", repo_full_name: "acme/finance-pipeline", default_branch: "main", attached_by_user_id: "u_jordan", created_at: "2026-05-02T10:02:00Z" },
  ],
  cap_fleet: [
    { id: "repo_f1", capability_id: "cap_fleet",    integration_id: "int_github", repo_full_name: "acme/fleet-scheduler",  default_branch: "main", attached_by_user_id: "u_avi", created_at: "2026-05-03T08:00:00Z" },
    { id: "repo_f2", capability_id: "cap_fleet",    integration_id: "int_github", repo_full_name: "acme/fleet-bot",         default_branch: "main", attached_by_user_id: "u_avi", created_at: "2026-05-03T08:01:00Z" },
    { id: "repo_f3", capability_id: "cap_fleet",    integration_id: "int_github", repo_full_name: "acme/fleet-ops-web",     default_branch: "main", attached_by_user_id: "u_avi", created_at: "2026-05-03T08:02:00Z" },
  ],
  cap_identity: [
    { id: "repo_i1", capability_id: "cap_identity", integration_id: "int_github", repo_full_name: "acme/identity-svc",      default_branch: "main", attached_by_user_id: "u_tomas", created_at: "2026-05-04T09:00:00Z" },
    { id: "repo_i2", capability_id: "cap_identity", integration_id: "int_github", repo_full_name: "acme/scim-bridge",       default_branch: "main", attached_by_user_id: "u_tomas", created_at: "2026-05-04T09:01:00Z" },
  ],
  cap_data: [
    { id: "repo_d1", capability_id: "cap_data",     integration_id: "int_github", repo_full_name: "acme/dbt-models",        default_branch: "main", attached_by_user_id: "u_priya", created_at: "2026-05-05T11:00:00Z" },
    { id: "repo_d2", capability_id: "cap_data",     integration_id: "int_github", repo_full_name: "acme/lake-ingest",       default_branch: "main", attached_by_user_id: "u_priya", created_at: "2026-05-05T11:01:00Z" },
  ],
  cap_orders: [
    { id: "repo_o1", capability_id: "cap_orders",   integration_id: "int_github", repo_full_name: "acme/order-svc",         default_branch: "main", attached_by_user_id: USER_ID,  created_at: "2026-05-06T10:00:00Z" },
  ],
  cap_insights: [
    { id: "repo_n1", capability_id: "cap_insights", integration_id: "int_github", repo_full_name: "acme/insights-web",      default_branch: "main", attached_by_user_id: USER_ID,  created_at: "2026-05-07T10:00:00Z" },
  ],
};

/* ----------------------------------------------------------- runs (== tasks) */
export interface MockRun extends Run {
  kind: "implement" | "prd";
  capability_id: string;
  current_phase: number;
  progress: number;
  assignee: string;
  requested_by: string;
  source: { kind: "prd" | "jira" | "raw" | "linear"; label: string };
  summary: string;
}

export const runs: MockRun[] = [
  { id: "tsk_001", goal: "Add Stripe ACH support for mid-market invoices",     intent: "generate_prd", status: "running",  spent_usd: 0.47, created_at: "2026-05-22T12:32:00Z", output_summary: null, stream_url: "/v1/runs/tsk_001/events", kind: "implement", capability_id: "cap_billing",  current_phase: 5, progress: 92, assignee: "Athena", requested_by: "Demo User",   source: { kind: "prd",   label: "PRD: Mid-market payments expansion" }, summary: "Mid-market customers (ACV $25k–$250k) currently can only pay by card. Add ACH debit as a checkout option for invoices ≥ $5k." },
  { id: "tsk_002", goal: "Let customers pause their own orders",                intent: "generate_prd", status: "running",  spent_usd: 0.24, created_at: "2026-05-21T19:00:00Z", output_summary: null, stream_url: "/v1/runs/tsk_002/events", kind: "prd",       capability_id: "cap_orders",   current_phase: 3, progress: 62, assignee: "Athena", requested_by: "Demo User",   source: { kind: "raw",   label: "From hospitality customer workshop" }, summary: "Customers can pause card subscriptions but not orders. Ops absorbs ~12 manual pause requests/week. Self-serve pause unblocks Q4 hospitality push." },
  { id: "tsk_003", goal: "Fix race in robot-charging arbitration",              intent: "chat",         status: "running",  spent_usd: 0.31, created_at: "2026-05-22T09:55:00Z", output_summary: null, stream_url: "/v1/runs/tsk_003/events", kind: "implement", capability_id: "cap_fleet",    current_phase: 3, progress: 64, assignee: "Athena", requested_by: "Avi Patel",  source: { kind: "jira",  label: "FLEET-2147" }, summary: "Two bots can claim the same charger when the scheduler's lease lapses mid-arbitration. Fix: extend lease + add idempotency on claim." },
  { id: "tsk_004", goal: "Spec: Self-serve SCIM for SSO admins",                intent: "generate_prd", status: "queued",   spent_usd: 0.12, created_at: "2026-05-20T13:00:00Z", output_summary: null, stream_url: "/v1/runs/tsk_004/events", kind: "prd",       capability_id: "cap_identity", current_phase: 0, progress: 25, assignee: "Athena", requested_by: "Tomas Lind", source: { kind: "raw",   label: "From customer call" }, summary: "Today every SCIM enablement is a manual ticket. Build the self-serve flow + the admin UI to manage attribute mappings." },
  { id: "tsk_005", goal: "Migrate analytics events to v2 schema",               intent: "generate_prd", status: "completed",spent_usd: 0.42, created_at: "2026-05-22T06:00:00Z", output_summary: "Shipped — 47 event types migrated, 90 days backfilled, PR #412 merged.", stream_url: "/v1/runs/tsk_005/events", kind: "implement", capability_id: "cap_data",     current_phase: 5, progress: 100, assignee: "Athena", requested_by: "Priya Shah", source: { kind: "prd",   label: "PRD: Analytics schema rev" }, summary: "Migrate 47 event types from the v1 schema (free-form properties) to the v2 schema (typed, contract-tested). Backfill 90 days of historical events." },
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
        { id: "cap_billing", confidence: 0.94, primary: true,  why: "PRD explicitly mentions invoices, ACH, and Stripe checkout — direct ownership.", files: 14 },
        { id: "cap_data",    confidence: 0.61, primary: false, why: "Revenue mart writeback depends on the new `ach_pending` state.",                   files: 3 },
        { id: "cap_orders",  confidence: 0.34, primary: false, why: "Refund flow tangentially touches invoice state, may need follow-up.",              files: 1 },
        { id: "cap_identity",confidence: 0.12, primary: false, why: "Finance-admin permission check — minimal impact.",                                 files: 0 },
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
        { repo: "billing-svc",      branch: "athena/ach-support-tsk_001", sha: "a3f12ab", status: "open", number: 412, files: 8, additions: 313, deletions: 8,  url: "https://github.com/acme/billing-svc/pull/412" },
        { repo: "billing-web",      branch: "athena/ach-support-tsk_001", sha: "b1c9d40", status: "open", number: 218, files: 3, additions: 96,  deletions: 12, url: "https://github.com/acme/billing-web/pull/218" },
        { repo: "finance-pipeline", branch: "athena/ach-support-tsk_001", sha: "c8d2e91", status: "open", number: 88,  files: 2, additions: 78,  deletions: 3,  url: "https://github.com/acme/finance-pipeline/pull/88" },
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
export type IntegrationStatus = "connected" | "available" | "coming_soon";
export type IntegrationConnectKind = "oauth" | "token" | "key" | "saml" | "endpoint" | "keypair" | "aws" | "webhook";

export interface MockIntegration {
  id: string;
  name: string;
  category: string;
  status: IntegrationStatus;
  connect_kind?: IntegrationConnectKind;
  blurb: string;
  connected_as?: string;
  connected_at?: string;
  scope?: string;
  last_sync?: string;
  instructions?: string;
  flagship?: boolean;
  /** Publishes an MCP server — connecting auto-provisions /mcp/mcp_<slug>. */
  provides_mcp?: boolean;
}

export const integrations: MockIntegration[] = [
  /* Tier 1 — connected */
  { id: "int_github",    name: "GitHub",       category: "SCM",            status: "connected", connect_kind: "oauth", blurb: "Pull requests, branch protection, CODEOWNERS, CI status.",                  connected_as: "acme-robotics (org-admin)", connected_at: "3 weeks ago", scope: "15 repos · 4 capabilities", last_sync: "30m ago",  flagship: true, provides_mcp: true },
  { id: "int_jira",      name: "Jira Cloud",   category: "Work mgmt",      status: "connected", connect_kind: "token", blurb: "Task source. Two-way sync.",                                                connected_as: "acme.atlassian.net",         connected_at: "2 weeks ago", scope: "3 projects",                last_sync: "7m ago",   flagship: true, provides_mcp: true },
  { id: "int_slack",     name: "Slack",        category: "Comms",          status: "connected", connect_kind: "oauth", blurb: "Notifications, @athena chat-ops, approval pings, daily digest.",         connected_as: "acme-robotics.slack.com",   connected_at: "3 weeks ago", scope: "#athena, #eng-billing, +6", last_sync: "30s ago",  flagship: true, provides_mcp: true },
  { id: "int_anthropic", name: "Anthropic",    category: "Model provider", status: "connected", connect_kind: "key",   blurb: "Default model provider. Claude Opus / Sonnet / Haiku via direct API.",     connected_as: "sk-ant-...kQ8 (rotated 12d ago)", connected_at: "3 weeks ago", scope: "5 model IDs",        last_sync: "now",      flagship: true },
  /* Tier 2 — available */
  { id: "int_gitlab",       name: "GitLab",            category: "SCM",            status: "available", connect_kind: "token",   blurb: "Repos + merge requests on GitLab.com or self-managed.",        instructions: "Personal access token with api + read_repository scopes.", provides_mcp: true },
  { id: "int_bitbucket",    name: "Bitbucket",         category: "SCM",            status: "available", connect_kind: "token",   blurb: "Repos + pull requests on Bitbucket Cloud.",                    instructions: "App password with repository + pull-request:write." },
  { id: "int_linear",       name: "Linear",            category: "Work mgmt",      status: "available", connect_kind: "key",     blurb: "Issues + cycles. Modern teams' alternative to Jira.",          instructions: "API key from Linear → Settings → API.", provides_mcp: true },
  { id: "int_bedrock",      name: "AWS Bedrock",       category: "Model provider", status: "available", connect_kind: "aws",     blurb: "Claude, Llama, Cohere via your AWS account. US/EU residency.", instructions: "IAM role ARN with bedrock:InvokeModel + region." },
  { id: "int_azure_openai", name: "Azure OpenAI",      category: "Model provider", status: "available", connect_kind: "endpoint",blurb: "GPT-4o + GPT-5 via your Azure subscription.",                   instructions: "Endpoint URL + API key from your Azure deployment." },
  { id: "int_openai",       name: "OpenAI",            category: "Model provider", status: "available", connect_kind: "key",     blurb: "Direct OpenAI API for GPT-4o / GPT-5.",                        instructions: "API key from platform.openai.com." },
  { id: "int_confluence",   name: "Confluence",        category: "Knowledge",      status: "available", connect_kind: "token",   blurb: "Indexes spaces as a knowledge source for capability research.",instructions: "API token + workspace URL.", provides_mcp: true },
  { id: "int_notion",       name: "Notion",            category: "Knowledge",      status: "available", connect_kind: "token",   blurb: "Indexes pages + databases as a knowledge source.",             instructions: "Internal integration token from notion.so/integrations.", provides_mcp: true },
  { id: "int_pagerduty",    name: "PagerDuty",         category: "Incidents",      status: "available", connect_kind: "key",     blurb: "Page on-call when canary breaches SLO. Incident loop back into Athena.", instructions: "REST API key from PagerDuty → Integrations." },
  { id: "int_datadog",      name: "Datadog",           category: "Observability",  status: "available", connect_kind: "keypair", blurb: "SLO checks at deploy + post-deploy health verification.",      instructions: "API key + Application key from Organization Settings.", provides_mcp: true },
  { id: "int_launchdarkly", name: "LaunchDarkly",      category: "Feature flags",  status: "available", connect_kind: "key",     blurb: "Feature-flag rollout + canary controls in the Deploy phase.",   instructions: "SDK key + project key." },
  { id: "int_sentry",       name: "Sentry",            category: "Observability",  status: "available", connect_kind: "token",   blurb: "Error tracking + release health.",                              instructions: "Auth token with project:read + project:write.", provides_mcp: true },
  { id: "int_figma",        name: "Figma",             category: "Design",         status: "available", connect_kind: "token",   blurb: "Attach frames to specs; reviewers see linked design nodes.",   instructions: "Personal access token from Figma → Settings.", provides_mcp: true },
  { id: "int_teams",        name: "Microsoft Teams",   category: "Comms",          status: "available", connect_kind: "webhook", blurb: "Notifications + approvals for Microsoft-first teams.",         instructions: "Incoming webhook URL from a Teams channel." },
  { id: "int_salesforce",   name: "Salesforce",        category: "CRM",            status: "available", connect_kind: "oauth",   blurb: "Win/loss data + customer accounts behind PRD evidence.",       instructions: "Connected App OAuth — admin one-click consent.", provides_mcp: true },
  { id: "int_zendesk",      name: "Zendesk",           category: "Support",        status: "available", connect_kind: "token",   blurb: "Ticket evidence chain — citations into PRD Frame phase.",      instructions: "API token + subdomain from Zendesk → Admin." },
  /* Tier 3 — coming soon */
  { id: "int_azure_devops", name: "Azure DevOps",      category: "SCM",            status: "coming_soon", blurb: "Repos + Boards + Pipelines in one. Targeted for July." },
  { id: "int_vertex",       name: "Google Vertex AI",  category: "Model provider", status: "coming_soon", blurb: "Gemini + Anthropic-on-GCP. Targeted for July." },
  { id: "int_circleci",     name: "CircleCI",          category: "CI/CD",          status: "coming_soon", blurb: "CI gate provider beyond GitHub Actions. Targeted for August." },
  { id: "int_clickup",      name: "ClickUp",           category: "Work mgmt",      status: "coming_soon", blurb: "Alternative work-management source. Targeted for August." },
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
    auth: { method: "oauth", oauth_app_id: "Athena (acme-robotics)", oauth_connected_as: "acme-robotics (org-admin)", last_rotated_at: "12 days ago" },
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
    endpoint_url: "https://acme.atlassian.net/mcp",
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
    auth: { method: "oauth", oauth_app_id: "Athena · acme", oauth_connected_as: "acme.notion.so", last_rotated_at: "5 days ago" },
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
    id: "mcp_acme_warehouse",
    org_id: ORG_ID,
    slug: "acme-warehouse",
    name: "Acme Warehouse Ops",
    source: "custom",
    transport: "http",
    endpoint_url: "https://mcp-warehouse.internal.acme-robotics.io/v1",
    auth: { method: "mtls", mtls_cert_subject: "CN=athena-prod, O=acme-robotics", last_rotated_at: "3 weeks ago" },
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
      { id: "tl_wh_1", name: "query_inventory",   description: "SQL-like read over warehouse inventory by SKU / aisle.", enabled: true,  approval: "none",     risk: "read",  usage_count_30d: 64,  last_used_at: "2h ago" },
      { id: "tl_wh_2", name: "locate_robot",      description: "Get the live position + status of a fleet robot.",       enabled: true,  approval: "none",     risk: "read",  usage_count_30d: 281, last_used_at: "3m ago" },
      { id: "tl_wh_3", name: "reroute_robot",     description: "Issue a reroute command to a robot.",                    enabled: true,  approval: "per_call", risk: "write", usage_count_30d: 12,  last_used_at: "yesterday" },
      { id: "tl_wh_4", name: "emergency_stop",    description: "E-stop a robot or zone. Requires human approval per call.", enabled: false, approval: "per_call", risk: "destructive", usage_count_30d: 0, last_used_at: null },
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
    auth: { method: "oauth", oauth_app_id: "Athena", oauth_connected_as: "design@acme-robotics.io", last_rotated_at: "61 days ago" },
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
  domains: ["acme.com", "acme-robotics.io"],
  scim_enabled: true,
  scim_last_sync: "4m ago",
  scim_users_provisioned: 42,
  scim_groups_mapped: 6,
  jit_provisioning: true,
  session_timeout_hours: 8,
  group_role_map: [
    { group: "athena-admins",    role: "admin",    count: 3  },
    { group: "athena-pms",       role: "pm",       count: 7  },
    { group: "athena-engineers", role: "engineer", count: 24 },
    { group: "athena-reviewers", role: "reviewer", count: 6  },
    { group: "athena-finance",   role: "pm",       count: 2  },
  ],
  cert_expires: "2027-01-14",
  metadata_url: "https://athena.example.com/saml/acme/metadata",
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
  { id: "ib_1", kind: "review_requested",priority: "high",   when: "12m ago", task_id: "tsk_002", title: "Sign-off needed: Customer-paused workflows",  actor: "Athena",     actor_avatar: "AT", actor_kind: "agent", context: "PRD v2 ready for your final approval. Priya + Avi + Jordan have weighed in.", cta: "Open Sign-off", phase: "signoff" },
  { id: "ib_2", kind: "mention",        priority: "normal", when: "38m ago", task_id: "tsk_001", title: "@maya — Avi tagged you on the PR thread",      actor: "Avi Patel",  actor_avatar: "AP", actor_kind: "human", context: "\"Should we cut a follow-up for retroactive ACH on existing invoices, or wait for production data?\"", cta: "Reply in thread", phase: "pr" },
  { id: "ib_3", kind: "approval_needed",priority: "normal", when: "1h ago",  task_id: "tsk_001", title: "Spec approved · plan now needs your sign-off",actor: "Athena",     actor_avatar: "AT", actor_kind: "agent", context: "Engineering proposed splitting the migration + webhook into 2 subtasks.",   cta: "Review plan",     phase: "plan" },
  { id: "ib_4", kind: "ci_failed",      priority: "high",   when: "2h ago",  task_id: "tsk_001", title: "CI gate is in-flight · 1 check failed",       actor: "Athena",     actor_avatar: "AT", actor_kind: "agent", context: "billing-web visual regression. CI triager classified as deterministic.",   cta: "Open CI",          phase: "ci" },
  { id: "ib_5", kind: "comment",        priority: "normal", when: "yesterday",task_id: "tsk_002", title: "Priya left 3 comments on spec.md",            actor: "Priya Shah", actor_avatar: "PS", actor_kind: "human", context: "Re: date-picker UX. Wants calendar widget over dropdown.",                 cta: "View comments",    phase: "signoff" },
  { id: "ib_6", kind: "budget_alert",   priority: "normal", when: "yesterday",                   title: "Billing capability at 93% of monthly budget",  actor: "Athena",     actor_avatar: "AT", actor_kind: "agent", context: "Projected to exceed by May 28. Consider routing more Plan calls to Sonnet.",cta: "Open Cost",        to: "/cost" },
  { id: "ib_7", kind: "digest",         priority: "low",    when: "2d ago",                       title: "Weekly digest: 4 tasks shipped, 2 in flight",  actor: "Athena",     actor_avatar: "AT", actor_kind: "agent", context: "Lead time: 6.2 days (-12% wow). Throughput: 4 (+1 wow). 0 incidents.",      cta: "Open digest",      to: "/activity" },
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
    { id: "cap_billing",  name: "Billing",            usd: 2014, pct: 0.29, budget: 5500, trend: "+22%", top_task: "Add Stripe ACH support" },
    { id: "cap_fleet",    name: "Fleet Ops",          usd: 1438, pct: 0.21, budget: 2500, trend: "+9%",  top_task: "Fix charger-arbitration race" },
    { id: "cap_data",     name: "Data Platform",      usd: 1294, pct: 0.19, budget: 2500, trend: "+34%", top_task: "Migrate analytics events to v2" },
    { id: "cap_orders",   name: "Order Management",   usd: 947,  pct: 0.14, budget: 2000, trend: "+11%", top_task: "Customer-paused workflows" },
    { id: "cap_identity", name: "Identity & Access",  usd: 684,  pct: 0.10, budget: 1500, trend: "-3%",  top_task: "Self-serve SCIM (spec only)" },
    { id: "cap_insights", name: "Customer Insights",  usd: 465,  pct: 0.07, budget: 1000, trend: "+4%",  top_task: "NPS dashboard refresh" },
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
    { id: "tsk_001", title: "Add Stripe ACH support for mid-market invoices",  usd: 472, runs: 11, last_used: "42m ago" },
    { id: "tsk_005", title: "Migrate analytics events to v2 schema",            usd: 418, runs: 9,  last_used: "6h ago" },
    { id: "tsk_003", title: "Fix race in robot-charging arbitration",           usd: 312, runs: 7,  last_used: "5h ago" },
    { id: "tsk_002", title: "Let customers pause their own orders",             usd: 241, runs: 6,  last_used: "yesterday" },
    { id: "tsk_004", title: "Spec: Self-serve SCIM for SSO admins",             usd: 118, runs: 3,  last_used: "2d ago" },
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
    attached_capabilities: ["cap_billing","cap_orders"], usage_count: 47, last_used: "2h ago",
    author: "Demo User", last_updated: "1 week ago",
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
    attached_capabilities: ["cap_billing","cap_orders"], usage_count: 31, last_used: "6h ago",
    author: "Tomas Lind", last_updated: "3 weeks ago",
    system_prompt: "You are a payment-data sensitivity auditor. For every diff:\n1. Search for PAN / CVV / track-data patterns.\n2. Verify Stripe Elements (not our origin) handles all sensitive entry.\n3. Flag any new env var or config that looks like a key.",
    knowledge_refs: [{ kind: "ADR", id: "ADR-014", title: "Money handling" }],
  },
  skl_rls: {
    id: "skl_rls", name: "RLS / tenant-isolation checker", slug: "rls-checker", version: "v3", status: "active",
    description: "Verifies every new tenant-bearing table has RLS ENABLE + FORCE + a policy keyed on org_id. Per ADR-015 + Phase 5.3 RLS.",
    icon: "lock", phases: ["plan","review","ci"],
    attached_capabilities: ["cap_billing","cap_identity","cap_data","cap_orders"], usage_count: 142, last_used: "30m ago",
    author: "Avi Patel", last_updated: "2 weeks ago",
    system_prompt: "You are an RLS auditor. For every migration:\n1. Verify ENABLE + FORCE RLS on every new table.\n2. Verify a policy keyed on `current_setting('athena.current_org_id')`.\n3. Reject migrations that add tenant-bearing tables without policies.",
    knowledge_refs: [{ kind: "ADR", id: "ADR-015", title: "Tenancy isolation" }],
  },
};

export const skills: MockSkill[] = [
  { id: "skl_stripe",            name: "Stripe payments expert",     slug: "stripe-expert",      version: "v4", status: "active", description: "Deep knowledge of Stripe Elements, Connect, ACH, dispute lifecycle, SCA, and webhook idempotency.",                            icon: "circle-dollar", phases: ["spec","plan","review"],   attached_capabilities: ["cap_billing","cap_orders"], usage_count: 47, last_used: "2h ago" },
  { id: "skl_pci",               name: "Payment-data sensitivity auditor", slug: "payment-data-auditor", version: "v2", status: "active", description: "Audits every diff for handling of payment instruments (PAN, CVV, account numbers). Flags any change that moves these through non-Elements paths.", icon: "shield",         phases: ["review","ci"],            attached_capabilities: ["cap_billing","cap_orders"], usage_count: 31, last_used: "6h ago" },
  { id: "skl_rls",               name: "RLS / tenant-isolation checker", slug: "rls-checker",     version: "v3", status: "active", description: "Verifies every new tenant-bearing table has RLS + a policy keyed on org_id.",                                                icon: "lock",            phases: ["plan","review","ci"],     attached_capabilities: ["cap_billing","cap_identity","cap_data","cap_orders"], usage_count: 142, last_used: "30m ago" },
  { id: "skl_migration_safety",  name: "Migration safety reviewer",  slug: "migration-safety",   version: "v1", status: "active", description: "Reviews schema migrations for locking risk, backfill behaviour, and expand-migrate-contract correctness.",                  icon: "database",        phases: ["plan","review","ci"],     attached_capabilities: ["cap_billing","cap_data","cap_orders","cap_identity"], usage_count: 18,  last_used: "yesterday" },
  { id: "skl_adr_linker",        name: "ADR linker",                  slug: "adr-linker",         version: "v2", status: "active", description: "During spec drafting, surfaces every ADR + convention + past design relevant to the change.",                                icon: "book-open",       phases: ["spec"],                    attached_capabilities: ["cap_billing","cap_fleet","cap_identity","cap_data","cap_orders","cap_insights"], usage_count: 89,  last_used: "42m ago" },
  { id: "skl_perf",              name: "p99 latency guardian",        slug: "p99-guardian",       version: "v1", status: "draft",  description: "For Fleet Ops: any change to scheduler / arbitration paths runs through a synthetic load profile.",                       icon: "zap",              phases: ["plan","review","ci"],     attached_capabilities: ["cap_fleet"],                  usage_count: 4,    last_used: "3 days ago" },
  { id: "skl_pm_voice",          name: "PM voice for spec drafts",    slug: "pm-voice",            version: "v3", status: "active", description: "Rewrites every spec draft in product voice — plain language, user-first framing, non-engineer success metrics.",          icon: "users",            phases: ["spec"],                    attached_capabilities: ["cap_billing","cap_orders","cap_identity","cap_insights"], usage_count: 28,  last_used: "5h ago" },
  { id: "skl_test_gen",          name: "Test scaffold generator",      slug: "test-scaffold",       version: "v2", status: "active", description: "Generates unit + integration test scaffolds. Refuses to skip tests on payment paths.",                                    icon: "check",            phases: ["implement"],               attached_capabilities: ["cap_billing","cap_orders","cap_data"], usage_count: 64, last_used: "1h ago" },
  { id: "skl_ci_triage",         name: "CI failure triager",          slug: "ci-triager",          version: "v1", status: "active", description: "Classifies CI failures (flake / real bug / infra / dependency) and either auto-fixes or escalates.",                       icon: "refresh-cw",      phases: ["ci"],                       attached_capabilities: ["cap_billing","cap_orders","cap_fleet","cap_data"], usage_count: 51, last_used: "20m ago" },
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
  { id: "a1", cap_id: "cap_billing",  who: "Athena",      who_avatar: "AT", who_kind: "agent",  text: "Drafted <strong>spec.md v3</strong> for Add Stripe ACH support — incorporating payment-data flow notes from Demo User.", tech: "agent.spec_builder.completed run_id=tsk_001 artifact=spec.md@v3 cost_usd=0.0142",  when: "42m ago", task_id: "tsk_001" },
  { id: "a2", cap_id: "cap_billing",  who: "Demo User",    who_avatar: "DU", who_kind: "human",  text: "Approved <strong>spec.md v3</strong>. Next gate: <em>plan</em>.",                                          tech: "gate.spec_approved task=tsk_001 actor=user:u_demo version=3",                       when: "39m ago", task_id: "tsk_001" },
  { id: "a3", cap_id: "cap_fleet",    who: "Athena",      who_avatar: "AT", who_kind: "agent",  text: "Surfaced a domain pattern worth saving: charger arbitration uses optimistic leases, not pessimistic locks.", tech: "agent.chat.tool_call name=propose_domain_note capability=cap_fleet",        when: "1h ago" },
  { id: "a4", cap_id: "cap_data",     who: "Priya Shah",  who_avatar: "PS", who_kind: "human",  text: "Opened task <strong>Migrate analytics events to v2 schema</strong> from PRD analytics-rev.",                tech: "task.created task=tsk_005 intent=execute_prd",                                       when: "2h ago", task_id: "tsk_005" },
  { id: "a5", cap_id: "cap_billing",  who: "Athena",      who_avatar: "AT", who_kind: "agent",  text: "Built the implementation <strong>plan.md</strong> — 6 sub-tasks across 3 repos. Awaiting engineering review.", tech: "agent.plan_builder.completed run_id=tsk_001 artifact=plan.md@v1",       when: "30m ago", task_id: "tsk_001" },
  { id: "a6", cap_id: "cap_identity", who: "Tomas Lind",  who_avatar: "TL", who_kind: "human",  text: "Started a chat thread: How does the SCIM token rotation work today?",                                       tech: "chat.thread_created thread=thr_8821 scope=cap_identity",                            when: "4h ago" },
  { id: "a7", cap_id: "cap_data",     who: "Athena",      who_avatar: "AT", who_kind: "agent",  text: "CI passed for Migrate analytics events to v2 schema. Draft PR <code>data-platform#412</code> opened.",   tech: "ci.gate_passed task=tsk_005 pr=412 checks=11/11",                                    when: "6h ago", task_id: "tsk_005" },
];

/* ------------------------------------------------------------- chat threads */
export interface MockChatThread {
  id: string;
  title: string;
  scope: { kind: "capability" | "org"; id?: string; label: string };
  preview: string;
  updated_at: string;
  messages: { role: "user" | "assistant"; who: string; avatar: string; content: string }[];
}

export const chatThreads: MockChatThread[] = [
  {
    id: "thr_1",
    title: "How does ACH dispute handling differ from card?",
    scope: { kind: "capability", id: "cap_billing", label: "Billing" },
    preview: "ACH disputes have a much longer chargeback window (60 days)…",
    updated_at: "12m ago",
    messages: [
      { role: "user", who: "Demo User", avatar: "DU", content: "How does ACH dispute handling differ from card disputes in our codebase?" },
      { role: "assistant", who: "Athena", avatar: "AT", content: "ACH disputes flow through the same charge.dispute.created webhook as card disputes, but with two key downstream differences: longer 90-day archive window for ACH chargebacks, and no auto-retry per ADR-014. The InvoiceStateMachine applies the longer retention before archiving." },
    ],
  },
  {
    id: "thr_2",
    title: "Which capabilities touch payments?",
    scope: { kind: "org", label: "Acme Robotics · org-wide" },
    preview: "Three capabilities currently touch payments: Billing (primary)…",
    updated_at: "1h ago",
    messages: [
      { role: "user", who: "Demo User", avatar: "DU", content: "Which capabilities touch payments end-to-end?" },
      { role: "assistant", who: "Athena", avatar: "AT", content: "Three: Billing (primary — Stripe ingress + invoice state), Order Management (refund triggers + chargeback writeback), and Data Platform (revenue mart for finance)." },
    ],
  },
  {
    id: "thr_3",
    title: "What's blocking the Stripe ACH work?",
    scope: { kind: "capability", id: "cap_billing", label: "Billing" },
    preview: "The PRD is approved (spec.md v3); engineering review of plan.md is open.",
    updated_at: "1d ago",
    messages: [
      { role: "user", who: "Jordan Chen", avatar: "JC", content: "What's the status of the Stripe ACH work?" },
      { role: "assistant", who: "Athena", avatar: "AT", content: "Task tsk_001 has shipped — all 3 PRs merged, currently in 5% canary on LaunchDarkly. SLO checks green. Auto-promote to 50% in 4h if no breach." },
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
      { id: "n1", name: "billing-svc",         kind: "service",  path: "services/billing-svc",          importance: 0.96, description: "Primary subscription + invoicing service. Owns the invoice state machine.", repo: "acme/billing-svc" },
      { id: "n3", name: "InvoiceStateMachine", kind: "class",    path: "billing-svc/invoice/state.ts",  importance: 0.92, description: "Canonical invoice lifecycle: draft → issued → paid | disputed | written_off.", repo: "acme/billing-svc" },
      { id: "n6", name: "finance-pipeline",    kind: "service",  path: "services/finance-pipeline",     importance: 0.84, description: "Revenue recognition + dunning. Consumes invoice events from billing-svc.", repo: "acme/finance-pipeline" },
      { id: "n5", name: "createCheckoutSession",kind: "function", path: "billing-svc/checkout.ts:42",   importance: 0.78, description: "Stripe Checkout entry point. Most-edited function in the capability.", repo: "acme/billing-svc" },
      { id: "n8", name: "DunningWorker",       kind: "class",    path: "finance-pipeline/dunning.py:88", importance: 0.74, description: "Bot that drives ACH dispute customer-comms once a dispute is filed.", repo: "acme/finance-pipeline" },
      { id: "n7", name: "ADR-014",             kind: "document", path: "docs/adr/014.md",               importance: 0.71, description: "Money handling — fixed-point, no floats. Referenced by every numeric path.", repo: "acme/billing-svc" },
      { id: "n4", name: "stripe.webhooks.yaml",kind: "config",   path: "infra/stripe",                  importance: 0.65, description: "Stripe webhook allowlist + signing key rotations.", repo: "acme/billing-svc" },
    ],
    recent_changes: [
      { when: "12m ago", repo: "acme/billing-svc",       summary: "Refactored `InvoiceStateMachine.transitionTo` to validate target state against capability config.", nodes_affected: 6 },
      { when: "1h ago",  repo: "acme/finance-pipeline",  summary: "Added `dispute_window_extended` event handler in DunningWorker.",                                 nodes_affected: 3 },
      { when: "3h ago",  repo: "acme/billing-web",       summary: "Re-indexed UI components after pricing-display rewrite.",                                          nodes_affected: 11 },
      { when: "yesterday",repo: "acme/billing-svc",      summary: "ADR-014 promoted; new edges from 14 funcs that handle currency.",                                  nodes_affected: 14 },
      { when: "2d ago",  repo: "acme/finance-pipeline",  summary: "Imported new Snowflake → NetSuite mapping; 9 module nodes added.",                                  nodes_affected: 9 },
    ],
    ingestion_status: "fresh",
    last_ingested_at: "12m ago",
  },
  cap_fleet: {
    capability_id: "cap_fleet",
    nodes_total: 587,
    nodes_by_kind: { service: 3, module: 64, function: 312, class: 51, config: 18, document: 24, test: 115 },
    edges_total: 1893,
    repos_indexed: 3,
    decision_records: 6,
    domain_concepts: 18,
    capability_summary:
      "Fleet Ops coordinates ~120 warehouse robots: task assignment, charger arbitration, exception handling. The scheduler in `fleet-scheduler` allocates tasks to bots via an optimistic-lease protocol (ADR claim in `note:fleet/03`); `fleet-bot` is the embedded firmware loop that runs on each robot. The web console (`fleet-ops-web`) is the human override surface and the post-mortem viewer for exceptions. Public surfaces are MQTT (bot→scheduler) and HTTPS (web → scheduler).",
    top_entities: [
      { id: "fl1", name: "fleet-scheduler", kind: "service",  path: "services/fleet-scheduler",        importance: 0.94, description: "Central scheduler. Allocates tasks + arbitrates chargers.", repo: "acme/fleet-scheduler" },
      { id: "fl2", name: "ChargerArbiter",  kind: "class",    path: "fleet-scheduler/charger/arbiter.go:122", importance: 0.89, description: "Optimistic-lease arbitration for charging stations.", repo: "acme/fleet-scheduler" },
      { id: "fl3", name: "fleet-bot",       kind: "service",  path: "services/fleet-bot",              importance: 0.85, description: "Embedded firmware loop running on each robot.", repo: "acme/fleet-bot" },
      { id: "fl4", name: "TaskQueue",       kind: "class",    path: "fleet-scheduler/queue/main.go:44",importance: 0.82, description: "Priority queue of pending tasks; bot polls for next.", repo: "acme/fleet-scheduler" },
      { id: "fl5", name: "fleet-ops-web",   kind: "service",  path: "apps/fleet-ops-web",              importance: 0.71, description: "Web console for human overrides + post-mortems.", repo: "acme/fleet-ops-web" },
      { id: "fl6", name: "ADR-001 leasing", kind: "document", path: "docs/adr/001.md",                 importance: 0.67, description: "Why we picked optimistic leases over pessimistic locks.", repo: "acme/fleet-scheduler" },
    ],
    recent_changes: [
      { when: "8m ago",  repo: "acme/fleet-scheduler", summary: "ChargerArbiter retry semantics tightened; 2 new edges to TaskQueue.", nodes_affected: 5 },
      { when: "2h ago",  repo: "acme/fleet-bot",       summary: "Added battery-health telemetry node; 8 new function nodes.",            nodes_affected: 8 },
      { when: "yesterday", repo: "acme/fleet-ops-web", summary: "Re-indexed React tree after dashboard refactor.",                        nodes_affected: 22 },
    ],
    ingestion_status: "debouncing",
    last_ingested_at: "8m ago",
  },
  cap_identity: {
    capability_id: "cap_identity",
    nodes_total: 168,
    nodes_by_kind: { service: 2, module: 19, function: 84, class: 14, config: 12, document: 9, test: 28 },
    edges_total: 521,
    repos_indexed: 2,
    decision_records: 4,
    domain_concepts: 7,
    capability_summary:
      "Identity owns SSO, SCIM provisioning, and the RBAC role hierarchy. `identity-svc` issues + verifies tokens (Supabase brokered for SaaS, customer-IdP brokered for SCIM tenants); `scim-bridge` translates between SCIM 2.0 and Athena's internal user/membership tables. Every tenant-bearing table in the platform reads `identity-svc` for the current org id, enforced at the Postgres RLS layer (ADR-015).",
    top_entities: [
      { id: "id1", name: "identity-svc",       kind: "service",  path: "services/identity-svc",        importance: 0.93, description: "Token issuance + verification + RBAC checks.", repo: "acme/identity-svc" },
      { id: "id2", name: "scim-bridge",        kind: "service",  path: "services/scim-bridge",          importance: 0.86, description: "SCIM 2.0 ↔ Athena user model adapter.", repo: "acme/scim-bridge" },
      { id: "id3", name: "RoleHierarchy",      kind: "class",    path: "identity-svc/rbac/roles.go:18", importance: 0.81, description: "Role → permission map (owner/admin/engineer/reviewer/...).", repo: "acme/identity-svc" },
      { id: "id4", name: "ADR-015 RLS",        kind: "document", path: "docs/adr/015.md",               importance: 0.72, description: "Tenancy via Postgres RLS; org_id on every tenant table.", repo: "acme/identity-svc" },
    ],
    recent_changes: [
      { when: "yesterday", repo: "acme/identity-svc", summary: "RoleHierarchy expanded with `auditor` role; 3 new edges from policy.go.", nodes_affected: 3 },
      { when: "3d ago",   repo: "acme/scim-bridge",  summary: "Re-indexed SCIM filter parser after spec update.",                          nodes_affected: 7 },
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
  "cap_billing::repo_b1": {
    repo_id: "repo_b1", repo_full_name: "acme/billing-svc", primary_language: "TypeScript",
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
      { sha: "a12c4f9", author: "Jordan Chen", when: "12m ago",   nodes_affected: 6, message: "Tighten InvoiceStateMachine transition guards" },
      { sha: "31de8b1", author: "Demo User",   when: "3h ago",    nodes_affected: 2, message: "Fix Stripe webhook signature verification edge case" },
      { sha: "9f01b22", author: "Jordan Chen", when: "yesterday", nodes_affected: 14, message: "Promote ADR-014 references in money-touching code" },
    ],
  },
  "cap_billing::repo_b2": {
    repo_id: "repo_b2", repo_full_name: "acme/billing-web", primary_language: "TypeScript",
    files_indexed: 184, loc: 12_540,
    last_commit: { sha: "77b8e2c", when: "3h ago", author: "Demo User", message: "Redesign pricing card; consolidate billing-display components" },
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
      { sha: "77b8e2c", author: "Demo User",  when: "3h ago",    nodes_affected: 11, message: "Redesign pricing card; consolidate billing-display components" },
      { sha: "f2018a5", author: "Avi Patel",  when: "1d ago",    nodes_affected: 4,  message: "Add ACH disclosure to checkout flow" },
    ],
  },
  "cap_billing::repo_b3": {
    repo_id: "repo_b3", repo_full_name: "acme/finance-pipeline", primary_language: "Python",
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
      { sha: "c5d3a17", author: "Tomas Lind",   when: "1h ago",  nodes_affected: 3, message: "Handle dispute_window_extended event in DunningWorker" },
      { sha: "8a014cc", author: "Jordan Chen", when: "2d ago",  nodes_affected: 9, message: "Import new Snowflake → NetSuite mapping; 9 module nodes" },
    ],
  },
  "cap_fleet::repo_f1": {
    repo_id: "repo_f1", repo_full_name: "acme/fleet-scheduler", primary_language: "Go",
    files_indexed: 287, loc: 22_410,
    last_commit: { sha: "e84b2c1", when: "8m ago", author: "Avi Patel", message: "ChargerArbiter retry semantics tightened" },
    summary: "Central scheduler for ~120 warehouse robots. Allocates tasks via a priority queue (`TaskQueue`) and arbitrates charger access via optimistic leases (`ChargerArbiter`). Public surfaces: MQTT to bots, HTTPS to fleet-ops-web.",
    services: [
      { id: "fs1", name: "fleet-scheduler", path: "services/fleet-scheduler", description: "Task scheduler + charger arbiter.", symbols: 312 },
    ],
    modules: [
      { id: "fs_m1", name: "charger/arbiter.go", path: "fleet-scheduler/charger/arbiter.go", kind: "module", symbols: 42 },
      { id: "fs_m2", name: "queue/main.go",      path: "fleet-scheduler/queue/main.go",       kind: "module", symbols: 38 },
      { id: "fs_m3", name: "transport/mqtt.go",  path: "fleet-scheduler/transport/mqtt.go",   kind: "module", symbols: 21 },
    ],
    exports: 58,
    decision_records_referenced: 3,
    ingestion_status: "debouncing",
    last_ingested_at: "8m ago",
    recent_commits: [
      { sha: "e84b2c1", author: "Avi Patel", when: "8m ago",  nodes_affected: 5, message: "ChargerArbiter retry semantics tightened" },
      { sha: "2f60d18", author: "Avi Patel", when: "1d ago",  nodes_affected: 14, message: "Refactor TaskQueue priority into pluggable strategy" },
    ],
  },
  "cap_fleet::repo_f2": {
    repo_id: "repo_f2", repo_full_name: "acme/fleet-bot", primary_language: "Rust",
    files_indexed: 124, loc: 8_240,
    last_commit: { sha: "5511fa3", when: "2h ago", author: "Avi Patel", message: "Add battery-health telemetry" },
    summary: "Embedded firmware loop running on each warehouse robot. Polls fleet-scheduler over MQTT for tasks, drives motors via the safety-supervised wrapper, reports telemetry every 250ms.",
    services: [
      { id: "fb1", name: "fleet-bot", path: "services/fleet-bot", description: "Embedded firmware loop.", symbols: 184 },
    ],
    modules: [
      { id: "fb_m1", name: "loop/main.rs",        path: "fleet-bot/src/loop/main.rs",         kind: "module", symbols: 26 },
      { id: "fb_m2", name: "safety/supervisor.rs",path: "fleet-bot/src/safety/supervisor.rs", kind: "module", symbols: 31 },
      { id: "fb_m3", name: "telemetry/mod.rs",    path: "fleet-bot/src/telemetry/mod.rs",      kind: "module", symbols: 22 },
    ],
    exports: 24,
    decision_records_referenced: 2,
    ingestion_status: "fresh",
    last_ingested_at: "2h ago",
    recent_commits: [
      { sha: "5511fa3", author: "Avi Patel", when: "2h ago",   nodes_affected: 8, message: "Add battery-health telemetry" },
      { sha: "9bc2d50", author: "Demo User",  when: "1w ago",   nodes_affected: 4, message: "Bump safety-supervisor watchdog to 50ms" },
    ],
  },
  "cap_fleet::repo_f3": {
    repo_id: "repo_f3", repo_full_name: "acme/fleet-ops-web", primary_language: "TypeScript",
    files_indexed: 142, loc: 9_180,
    last_commit: { sha: "ba14e09", when: "yesterday", author: "Avi Patel", message: "Refactor dashboard layout into shared shells" },
    summary: "Web console for the warehouse-ops team. Live bot status, exception triage, manual override CTAs. Subscribes to scheduler events via SSE.",
    services: [
      { id: "fow1", name: "fleet-ops-web", path: "apps/fleet-ops-web", description: "Operations console.", symbols: 91 },
    ],
    modules: [
      { id: "fow_m1", name: "dashboard/page.tsx",       path: "fleet-ops-web/app/dashboard/page.tsx",       kind: "module", symbols: 18 },
      { id: "fow_m2", name: "exceptions/triage.tsx",    path: "fleet-ops-web/app/exceptions/triage.tsx",    kind: "module", symbols: 24 },
      { id: "fow_m3", name: "stream/use-bot-stream.ts", path: "fleet-ops-web/features/stream/use-bot-stream.ts", kind: "module", symbols: 9 },
    ],
    exports: 28,
    decision_records_referenced: 1,
    ingestion_status: "fresh",
    last_ingested_at: "yesterday",
    recent_commits: [
      { sha: "ba14e09", author: "Avi Patel", when: "yesterday", nodes_affected: 22, message: "Refactor dashboard layout into shared shells" },
    ],
  },
  "cap_identity::repo_i1": {
    repo_id: "repo_i1", repo_full_name: "acme/identity-svc", primary_language: "Go",
    files_indexed: 98, loc: 7_120,
    last_commit: { sha: "01fae23", when: "yesterday", author: "Tomas Lind", message: "Add auditor role + policy edges" },
    summary: "Token issuance, verification, and RBAC role-permission lookup. Brokered through Supabase for SaaS tenants; supports per-tenant IdP for SCIM customers. Every tenant-bearing table reads `identity-svc.current_org_id` for RLS enforcement.",
    services: [
      { id: "isv1", name: "identity-svc", path: "services/identity-svc", description: "Identity + RBAC + tenancy context.", symbols: 142 },
    ],
    modules: [
      { id: "is_m1", name: "rbac/roles.go",  path: "identity-svc/rbac/roles.go",   kind: "module", symbols: 24 },
      { id: "is_m2", name: "rbac/policy.go", path: "identity-svc/rbac/policy.go",  kind: "module", symbols: 18 },
      { id: "is_m3", name: "sso/oidc.go",    path: "identity-svc/sso/oidc.go",     kind: "module", symbols: 14 },
    ],
    exports: 36,
    decision_records_referenced: 3,
    ingestion_status: "fresh",
    last_ingested_at: "yesterday",
    recent_commits: [
      { sha: "01fae23", author: "Tomas Lind", when: "yesterday", nodes_affected: 3, message: "Add auditor role + policy edges" },
    ],
  },
  "cap_identity::repo_i2": {
    repo_id: "repo_i2", repo_full_name: "acme/scim-bridge", primary_language: "Go",
    files_indexed: 70, loc: 4_980,
    last_commit: { sha: "84e1f07", when: "3d ago", author: "Tomas Lind", message: "SCIM filter parser fixes" },
    summary: "SCIM 2.0 ↔ Athena user/membership adapter. Honors RFC 7644 filters; idempotent PUT/PATCH; emits audit events for every provisioning action.",
    services: [
      { id: "scb1", name: "scim-bridge", path: "services/scim-bridge", description: "SCIM 2.0 protocol adapter.", symbols: 88 },
    ],
    modules: [
      { id: "scb_m1", name: "filter/parser.go", path: "scim-bridge/filter/parser.go", kind: "module", symbols: 26 },
      { id: "scb_m2", name: "users/resource.go", path: "scim-bridge/users/resource.go",kind: "module", symbols: 19 },
    ],
    exports: 22,
    decision_records_referenced: 1,
    ingestion_status: "fresh",
    last_ingested_at: "3d ago",
    recent_commits: [
      { sha: "84e1f07", author: "Tomas Lind", when: "3d ago", nodes_affected: 7, message: "SCIM filter parser fixes" },
    ],
  },
};

/* ----------------------------------------------------------------- rules */
export const rules = [
  { id: "ADR-006",       title: "Single LLM egress through LiteLLM",         tag: "platform",  author: "Avi Patel",   date: "12 weeks ago", kind: "ADR",         summary: "Every LLM call goes through Athena's LiteLLM client." },
  { id: "ADR-014",       title: "Money handling — fixed-point, no floats",    tag: "billing",   author: "Jordan Chen", date: "8 weeks ago",  kind: "ADR",         summary: "Currency stored as integer minor-units. ACH disputes auto-retry is forbidden." },
  { id: "ADR-015",       title: "Tenancy isolation via Postgres RLS",         tag: "platform",  author: "Avi Patel",   date: "7 weeks ago",  kind: "ADR",         summary: "Every tenant-bearing table has RLS + a policy keyed on org_id." },
  { id: "ADR-027",       title: "Athena never executes customer code",        tag: "security",  author: "Tomas Lind",  date: "5 weeks ago",  kind: "ADR",         summary: "Sandbox is for agent scratch. PRs always draft. Humans merge." },
  { id: "ATHENA.md",     title: "Contributing — coding conventions",          tag: "convention",author: "Engineering", date: "Quarterly",     kind: "Convention",  summary: "TypeScript strict mode. Postgres for tenant data; RLS is the boundary." },
  { id: "note:billing/01",title: "Stripe is the only payment processor for v1",tag: "billing", author: "Demo User",    date: "promoted",      kind: "Domain note", summary: "No fallback processor in v1; multi-processor is FY26." },
  { id: "note:fleet/03",  title: "Charger arbitration uses optimistic leases",tag: "fleet-ops",author: "Avi Patel",   date: "yesterday",     kind: "Domain note", summary: "Bots claim chargers via lease + heartbeat." },
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
  cap_billing: [
    { id: "res_b1", title: "Mid-Market Payments Playbook.pdf",       kind: "file", source: "Finance Wiki · Q1 2026",            format: "PDF",        size_kb: 1240, uploaded_by: "Jordan Chen", uploaded_at: "1 week ago",  status: "indexed",  nodes_generated: 18, summary: "12-page playbook covering customer segmentation, invoice timing, ACH vs. card economics, dispute escalation runbook. Cited 7 times this week.", tags: ["payments","playbook","ach","dispute"], last_used: "3h ago" },
    { id: "res_b2", title: "Stripe Connect → ACH onboarding (Notion)",kind: "link", source: "acme.notion.site/Stripe-ACH-Onboarding", format: "Notion page", uploaded_by: "Demo User",    uploaded_at: "3 weeks ago", status: "indexed",  nodes_generated: 9,  summary: "Step-by-step onboarding instructions for enabling ACH on a Stripe Connect account. Updated every release.", tags: ["stripe","onboarding","ach"], last_used: "yesterday" },
    { id: "res_b3", title: "ACH dispute runbook — finance ops",      kind: "note", source: "pasted by Jordan Chen",             format: "Markdown",   uploaded_by: "Jordan Chen", uploaded_at: "4 days ago",  status: "indexed",  nodes_generated: 5,  summary: "How finance ops handles an ACH dispute end-to-end: contact within 24h, file response by day 5, post-mortem day 10.", tags: ["dispute","runbook","finance-ops"], last_used: "1h ago" },
    { id: "res_b4", title: "Q1 invoicing transcript — exec review",  kind: "file", source: "Otter.ai · 2026-02-12",             format: "VTT",        size_kb: 84,   uploaded_by: "Demo User",    uploaded_at: "yesterday",   status: "indexing", nodes_generated: 0,  summary: "53-min meeting transcript where the exec team agreed to push ACH availability earlier. Athena parsing now.", tags: ["meeting","decisions","ach"], last_used: null, progress: 64 },
    { id: "res_b5", title: "ACH dispute timeline cheat-sheet",       kind: "note", source: "pasted by Tomas Lind",                format: "Markdown",   uploaded_by: "Tomas Lind",  uploaded_at: "2 weeks ago", status: "queued",   nodes_generated: 0,  summary: "Internal cheat-sheet on the ACH dispute timeline (60-day chargeback window, retention rules). Re-indexed quarterly.", tags: ["ach","dispute"], last_used: null },
  ],
  cap_fleet: [
    { id: "res_f1", title: "Charger arbitration whitepaper",         kind: "file", source: "Engineering shared drive",          format: "PDF",        size_kb: 2100, uploaded_by: "Avi Patel",   uploaded_at: "1 month ago", status: "indexed",  nodes_generated: 22, summary: "Internal whitepaper on lease-based arbitration design — why optimistic leases beat pessimistic locks.", tags: ["arbitration","leases","design"], last_used: "12m ago" },
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
  cap_billing: {
    models: { spec: "claude-opus-4-7", plan: "claude-opus-4-7", implement: "claude-sonnet-4-6", review: "claude-opus-4-7", ci: "claude-haiku-4-5", pr: "claude-haiku-4-5" },
    skills: ["skl_stripe","skl_pci","skl_rls","skl_migration_safety","skl_adr_linker","skl_pm_voice","skl_test_gen"],
    review_policy: { spec_approvers: 2, review_approvers: 1, ci_must_pass: true, auto_merge: false },
    context_repos: ["billing-svc","billing-web","finance-pipeline"],
  },
  cap_fleet: {
    models: { spec: "claude-opus-4-7", plan: "claude-opus-4-7", implement: "claude-opus-4-7", review: "claude-opus-4-7", ci: "claude-sonnet-4-6", pr: "claude-haiku-4-5" },
    skills: ["skl_perf","skl_rls","skl_adr_linker"],
    review_policy: { spec_approvers: 2, review_approvers: 2, ci_must_pass: true, auto_merge: false },
    context_repos: ["fleet-scheduler","fleet-bot","fleet-ops-web"],
  },
  cap_identity: {
    models: { spec: "claude-opus-4-7", plan: "claude-sonnet-4-6", implement: "claude-sonnet-4-6", review: "claude-opus-4-7", ci: "claude-haiku-4-5", pr: "claude-haiku-4-5" },
    skills: ["skl_rls","skl_adr_linker","skl_pm_voice"],
    review_policy: { spec_approvers: 1, review_approvers: 1, ci_must_pass: true, auto_merge: false },
    context_repos: ["identity-svc","scim-bridge"],
  },
  cap_data: {
    models: { spec: "claude-sonnet-4-6", plan: "claude-opus-4-7", implement: "claude-sonnet-4-6", review: "claude-opus-4-7", ci: "claude-haiku-4-5", pr: "claude-haiku-4-5" },
    skills: ["skl_migration_safety","skl_rls","skl_test_gen","skl_adr_linker"],
    review_policy: { spec_approvers: 1, review_approvers: 1, ci_must_pass: true, auto_merge: false },
    context_repos: ["dbt-models","lake-ingest","metrics-catalog","data-quality"],
  },
  cap_orders: {
    models: { spec: "claude-opus-4-7", plan: "claude-sonnet-4-6", implement: "claude-sonnet-4-6", review: "claude-opus-4-7", ci: "claude-haiku-4-5", pr: "claude-haiku-4-5" },
    skills: ["skl_stripe","skl_pci","skl_rls","skl_pm_voice","skl_test_gen"],
    review_policy: { spec_approvers: 2, review_approvers: 1, ci_must_pass: true, auto_merge: false },
    context_repos: ["order-svc","order-web","alloc-engine"],
  },
  cap_insights: {
    models: { spec: "claude-sonnet-4-6", plan: "claude-sonnet-4-6", implement: "claude-sonnet-4-6", review: "claude-sonnet-4-6", ci: "claude-haiku-4-5", pr: "claude-haiku-4-5" },
    skills: ["skl_pm_voice","skl_adr_linker"],
    review_policy: { spec_approvers: 1, review_approvers: 1, ci_must_pass: false, auto_merge: false },
    context_repos: ["insights-web","insights-pipeline"],
  },
};

/* ------------------------------------------------- domain notes (per-capability) */
export const domainNotes: Record<string, { id: string; title: string; body: string; promoted_from: string; author: string; date: string }[]> = {
  cap_billing: [
    { id: "note_b1", title: "Stripe is the only payment processor for v1",  body: "No fallback processor in v1; multi-processor is FY26.",                                  promoted_from: "chat thread thr_2", author: "Demo User",   date: "1 week ago" },
    { id: "note_b2", title: "ACH disputes never auto-retry",                  body: "Per ADR-014: finance handles every ACH dispute manually within 24h of webhook.",        promoted_from: "review of tsk_001", author: "Jordan Chen", date: "yesterday" },
  ],
  cap_fleet: [
    { id: "note_f1", title: "Charger arbitration uses optimistic leases",     body: "Bots claim chargers via lease + heartbeat. Lease lapses are intentional — never lock pessimistically.", promoted_from: "chat thread thr_4", author: "Avi Patel",   date: "yesterday" },
  ],
};

/* ----------------------------------------------------------- onboarding hint */
export const onboardingState = {
  current: "complete",
  completed_at: "3 weeks ago",
  completed_by: "Owen Petrov",
  steps: [
    { id: "o1", title: "Connect source control",         status: "done", detail: "GitHub · 15 repos indexed" },
    { id: "o2", title: "Set up SSO",                      status: "done", detail: "Okta SAML 2.0 + SCIM enforced" },
    { id: "o3", title: "Invite your team",                status: "done", detail: "9 members across 6 capabilities" },
    { id: "o4", title: "Define your first capability",    status: "done", detail: "6 capabilities defined" },
    { id: "o5", title: "Connect a model provider",        status: "done", detail: "Anthropic direct (5 model IDs)" },
    { id: "o6", title: "Run your first task",             status: "done", detail: "4 tasks completed, 3 in flight" },
  ],
};
