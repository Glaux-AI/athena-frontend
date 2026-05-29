/**
 * Mock request handlers — the in-process backend behind `NEXT_PUBLIC_API_MODE=mock`.
 *
 * `handleMockRequest(path, init)` pattern-matches the (method, path) pair
 * against every endpoint surfaced in `lib/api/client.ts`. It returns the same
 * envelope shape a real backend would: bare arrays for short lists, paginated
 * `{ items, next_cursor }` for streams, raw resource for single GETs, updated
 * resource for mutations, and `{ error: { code, message, field? } }` for
 * failures.
 *
 * The real backend will replace this file — until then, this module is the
 * authoritative API contract.
 */

import * as db from "./db";
import type {
  BlueprintSectionProposal,
  FileDependentsEnvelope,
  FileDependentsItem,
  RepoFileContentResponse,
  RepoFileDetail,
  RepoFileRow,
  RepoFilesOut,
  RepoGrepEnvelope,
  RepoGrepResult,
  SyncStage,
} from "../client";

const LATENCY_MS = 120;  // simulate network round-trip

/**
 * §5.29.9 — flatten every scope's MockBlueprint into a single list so the
 * cross-scope `/v1/blueprint-proposals` endpoint can merge proposals across
 * orgs / capabilities / repos. Mirrors the BE join over `blueprints.scope_kind`.
 */
function collectAllBlueprintsForCrossScope(): { bp: db.MockBlueprint; scope_kind: string; scope_id: string }[] {
  const out: { bp: db.MockBlueprint; scope_kind: string; scope_id: string }[] = [];
  for (const [id, bp] of Object.entries(db.blueprints.orgs)) {
    out.push({ bp, scope_kind: "org", scope_id: id });
  }
  for (const [id, bp] of Object.entries(db.blueprints.capabilities)) {
    out.push({ bp, scope_kind: "capability", scope_id: id });
  }
  for (const [id, bp] of Object.entries(db.blueprints.repos)) {
    out.push({ bp, scope_kind: "repo", scope_id: id });
  }
  return out;
}

/**
 * §5.29.5 — mock-mode mutable state for notification routing rules.
 *
 * Kept module-local (rather than threaded through `db.ts`) because the
 * BE-side surface is a single replace-PATCH per org and we only need
 * one snapshot in the demo. Seeded with a reasonable starting set so
 * the page renders rows on first paint.
 */
let notificationRules: { event: string; channels: string[]; audience: string }[] = [
  { event: "review_requested",       channels: ["email", "slack"],             audience: "members" },
  { event: "ci_failed",              channels: ["email", "slack", "pagerduty"], audience: "members" },
  { event: "budget_alert",           channels: ["email", "in_app"],            audience: "admins" },
  { event: "mention",                channels: ["in_app", "slack"],            audience: "mentioned" },
];

export class MockResponse {
  constructor(
    public status: number,
    public body: unknown,
  ) {}
}

/**
 * §7.9.5 row 2463 — Seat-billing fixtures keyed by org id. Designers
 * exercise all three branches (solo-at-cap, pro-with-headroom,
 * pro-at-cap) by flipping the active org id in `X-Athena-Org-Id`
 * (driven by the OrgSwitcher localStorage key). The default demo
 * org `org_lumen` falls through to the `pro-with-headroom` shape
 * so the UI renders something sensible without the seeded fixtures.
 */
function seatsFixtureForOrg(orgId: string): {
  tier: string;
  included_seats: number;
  additional_seats: number;
  total_seats: number;
  active_seats: number;
  pending_invitations: number;
  available_seats: number;
  extra_seat_price_per_month_usd: number;
  pro_upgrade_quote: {
    pro_included_seats: number;
    pro_extra_seat_price_per_month_usd: number;
    breakeven_seats: number;
  } | null;
} {
  if (orgId === "solo-at-cap") {
    return {
      tier: "solo",
      included_seats: 1,
      additional_seats: 0,
      total_seats: 1,
      active_seats: 1,
      pending_invitations: 0,
      available_seats: 0,
      extra_seat_price_per_month_usd: 15,
      pro_upgrade_quote: {
        pro_included_seats: 5,
        pro_extra_seat_price_per_month_usd: 10,
        breakeven_seats: 8,
      },
    };
  }
  if (orgId === "pro-at-cap") {
    return {
      tier: "pro",
      included_seats: 5,
      additional_seats: 0,
      total_seats: 5,
      active_seats: 5,
      pending_invitations: 0,
      available_seats: 0,
      extra_seat_price_per_month_usd: 10,
      pro_upgrade_quote: null,
    };
  }
  // Default: pro-with-headroom (covers demo org `org_lumen` + any
  // unrecognised id so the UI doesn't go blank).
  return {
    tier: "pro",
    included_seats: 5,
    additional_seats: 2,
    total_seats: 7,
    active_seats: 4,
    pending_invitations: 1,
    available_seats: 3,
    extra_seat_price_per_month_usd: 10,
    pro_upgrade_quote: null,
  };
}

/**
 * §7.10.5 — Credit-balance fixtures keyed by `X-Athena-Org-Id` so
 * designers can flip between every credit-meter / halt-banner state
 * without spinning up the BE. Mirrors the seat-fixture pattern above.
 *
 * Mutations (configureOverage / setSpendCap / topup) update this
 * module-local state so the page re-renders with the new shape on
 * `refreshCredits()`.
 */
interface CreditFixture {
  credits_remaining_usd: string;
  monthly_credit_usd: number;
  period_start: string;
  period_end: string;
  overage_enabled: boolean;
  overage_cap_usd: number | null;
  hard_cap_usd: number | null;
  mtd_spend_usd: string;
  over_80_pct_threshold: boolean;
  tier: string;
}

function periodWindow(): { period_start: string; period_end: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { period_start: start.toISOString(), period_end: end.toISOString() };
}

const creditFixtures: Record<string, CreditFixture> = {
  "free-no-credit": {
    credits_remaining_usd: "0.00",
    monthly_credit_usd: 0,
    ...periodWindow(),
    overage_enabled: false,
    overage_cap_usd: null,
    hard_cap_usd: null,
    mtd_spend_usd: "0.00",
    over_80_pct_threshold: false,
    tier: "free",
  },
  "free-with-byo": {
    credits_remaining_usd: "0.00",
    monthly_credit_usd: 0,
    ...periodWindow(),
    overage_enabled: false,
    overage_cap_usd: null,
    hard_cap_usd: null,
    mtd_spend_usd: "0.00",
    over_80_pct_threshold: false,
    tier: "free",
  },
  "solo-healthy": {
    credits_remaining_usd: "25.00",
    monthly_credit_usd: 25,
    ...periodWindow(),
    overage_enabled: false,
    overage_cap_usd: null,
    hard_cap_usd: null,
    mtd_spend_usd: "0.00",
    over_80_pct_threshold: false,
    tier: "solo",
  },
  "solo-warning": {
    credits_remaining_usd: "4.00",
    monthly_credit_usd: 25,
    ...periodWindow(),
    overage_enabled: false,
    overage_cap_usd: null,
    hard_cap_usd: null,
    mtd_spend_usd: "21.00",
    over_80_pct_threshold: true,
    tier: "solo",
  },
  "solo-halted": {
    credits_remaining_usd: "0.00",
    monthly_credit_usd: 25,
    ...periodWindow(),
    overage_enabled: false,
    overage_cap_usd: null,
    hard_cap_usd: null,
    mtd_spend_usd: "25.00",
    over_80_pct_threshold: true,
    tier: "solo",
  },
  "solo-overage": {
    credits_remaining_usd: "-10.00",
    monthly_credit_usd: 25,
    ...periodWindow(),
    overage_enabled: true,
    overage_cap_usd: 50,
    hard_cap_usd: null,
    mtd_spend_usd: "35.00",
    over_80_pct_threshold: true,
    tier: "solo",
  },
  "solo-spend-cap-hit": {
    credits_remaining_usd: "5.00",
    monthly_credit_usd: 25,
    ...periodWindow(),
    overage_enabled: false,
    overage_cap_usd: null,
    hard_cap_usd: 50,
    mtd_spend_usd: "50.00",
    over_80_pct_threshold: true,
    tier: "solo",
  },
};

function creditFixtureForOrg(orgId: string): CreditFixture {
  return creditFixtures[orgId] ?? creditFixtures["solo-healthy"]!;
}

/* -------------------------------------------------------------- helpers */

async function delay(ms = LATENCY_MS): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function ok<T>(body: T, status = 200): MockResponse {
  return new MockResponse(status, body);
}

function notFound(message = "Not found"): MockResponse {
  return new MockResponse(404, { error: { code: "not_found", message } });
}

function methodNotAllowed(): MockResponse {
  return new MockResponse(405, { error: { code: "method_not_allowed", message: "Method not allowed" } });
}

function noContent(): MockResponse {
  return new MockResponse(204, undefined);
}

function parseBody<T = Record<string, unknown>>(init: RequestInit): T {
  if (!init.body) return {} as T;
  try {
    return JSON.parse(init.body as string) as T;
  } catch {
    return {} as T;
  }
}

function method(init: RequestInit): string {
  return (init.method || "GET").toUpperCase();
}

/** Re-derive the TOC's per-row metadata from the section store. Called after
 * any mutation that changes editability / lock state / version / proposal
 * status so the next GET /blueprint reflects the change. */
function recomputeBlueprintToc(blueprint: db.MockBlueprint): void {
  blueprint.toc.sections = Object.values(blueprint.sections)
    .sort((a, b) => a.ordering - b.ordering)
    .map((s) => ({
      section_key: s.section_key,
      title: s.title,
      summary: s.summary,
      token_count: s.token_count,
      origin: s.origin,
      editable: s.editable,
      locked: s.locked,
      protected_from_ai: s.protected_from_ai,
      current_version: s.current_version,
      has_pending_proposal: blueprint.proposals.some(
        (p) => p.section_key === s.section_key && p.status === "pending",
      ),
      parent_section_key: s.parent_section_key,
      ordering: s.ordering,
    }));
  blueprint.toc.pending_proposals_count = blueprint.proposals.filter((p) => p.status === "pending").length;
}

/** Split path into (pathname, searchParams). */
function splitPath(path: string): { pathname: string; query: URLSearchParams } {
  const idx = path.indexOf("?");
  if (idx < 0) return { pathname: path, query: new URLSearchParams() };
  return { pathname: path.slice(0, idx), query: new URLSearchParams(path.slice(idx + 1)) };
}

/* -------------------------------------------------------------- handler */

export async function handleMockRequest(path: string, init: RequestInit = {}): Promise<MockResponse> {
  await delay();
  const m = method(init);
  const { pathname, query } = splitPath(path);

  // /v1/me
  if (pathname === "/v1/me" && m === "GET") {
    return ok({ ...db.me, server_time: new Date().toISOString() });
  }

  // /v1/auth/sync
  if (pathname === "/v1/auth/sync" && m === "POST") {
    return ok({
      user_id: db.me.id,
      email: db.me.email,
      display_name: db.me.display_name,
      avatar_url: db.me.avatar_url,
      membership_count: db.me.memberships.length,
      server_time: new Date().toISOString(),
    });
  }
  if (pathname === "/v1/auth/logout" && m === "POST") {
    return ok({ accepted: true });
  }

  // /v1/orgs
  if (pathname === "/v1/orgs" && m === "GET") return ok(db.orgs);
  if (pathname === "/v1/orgs" && m === "POST") {
    const body = parseBody<{ name: string; slug: string; display_name?: string; edition?: string }>(init);
    const newOrg = {
      id: `org_${Date.now()}`,
      name: body.name,
      display_name: body.display_name ?? body.name,
      slug: body.slug,
      edition: body.edition ?? "pro",
      verified_domains: [],
      auto_join_for_verified_domain: false,
      default_role_for_invite: "engineer",
      created_at: new Date().toISOString(),
    };
    return ok(newOrg, 201);
  }
  let mm = pathname.match(/^\/v1\/orgs\/([^/]+)$/);
  if (mm) {
    const orgId = decodeURIComponent(mm[1]!);
    const org = db.orgs.find((o) => o.id === orgId);
    if (!org) return notFound("Org not found");
    if (m === "GET") return ok(org);
    if (m === "PATCH") {
      const body = parseBody<Record<string, unknown>>(init);
      Object.assign(org, body);
      return ok(org);
    }
    if (m === "DELETE") {
      const body = parseBody<{ confirm_slug: string }>(init);
      if (body.confirm_slug !== org.slug) {
        return new MockResponse(422, { error: { code: "confirm_mismatch", message: "Slug confirmation does not match.", field: "confirm_slug" } });
      }
      return noContent();
    }
    return methodNotAllowed();
  }
  // §5.31 — org lifecycle endpoints. The new /v1/orgs/{id}/permanent DELETE
  // replaces the old DELETE /v1/orgs/{id} as the stage-2 path.
  mm = pathname.match(/^\/v1\/orgs\/([^/]+):soft-delete$/);
  if (mm && m === "POST") {
    const orgId = decodeURIComponent(mm[1]!);
    const org = db.orgs.find((o) => o.id === orgId);
    if (!org) return notFound("Org not found");
    const body = parseBody<{ confirm_slug?: string }>(init);
    if (body.confirm_slug !== org.slug) {
      return new MockResponse(400, { error: { code: "invalid_argument", message: "Slug mismatch." } });
    }
    if (!org.deleted_at) {
      org.deleted_at = new Date().toISOString();
      org.deleted_by_user_id = db.me.id;
      // Cascade to every cap.
      for (const c of db.capabilities) {
        if (!c.deleted_at) { c.deleted_at = org.deleted_at; c.deleted_by_user_id = db.me.id; }
      }
    }
    return ok(org);
  }
  mm = pathname.match(/^\/v1\/orgs\/([^/]+):restore$/);
  if (mm && m === "POST") {
    const orgId = decodeURIComponent(mm[1]!);
    const org = db.orgs.find((o) => o.id === orgId);
    if (!org) return notFound("Org not found");
    const cascadeAt = org.deleted_at;
    org.deleted_at = null;
    org.deleted_by_user_id = null;
    if (cascadeAt) {
      for (const c of db.capabilities) {
        if (c.deleted_at === cascadeAt) { c.deleted_at = null; c.deleted_by_user_id = null; }
      }
    }
    return ok(org);
  }
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/permanent$/);
  if (mm && m === "DELETE") {
    const orgId = decodeURIComponent(mm[1]!);
    const org = db.orgs.find((o) => o.id === orgId);
    if (!org) return notFound("Org not found");
    if (!org.deleted_at) {
      return new MockResponse(409, { error: { code: "must_soft_delete_first", message: "Soft-delete first." } });
    }
    const body = parseBody<{ confirm_slug?: string }>(init);
    if (body.confirm_slug !== org.slug) {
      return new MockResponse(400, { error: { code: "invalid_argument", message: "Slug mismatch." } });
    }
    return noContent();
  }

  // /v1/orgs/{id}/knowledge
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/knowledge$/);
  if (mm && m === "GET") {
    const orgId = decodeURIComponent(mm[1]!);
    const k = db.orgKnowledge[orgId];
    if (!k) return notFound("Org knowledge not found");
    return ok(k);
  }

  // §6.0 row (5) — GET /v1/capabilities/{id}/knowledge → CapabilityKnowledge
  mm = pathname.match(/^\/v1\/capabilities\/([^/]+)\/knowledge$/);
  if (mm && m === "GET") {
    const capId = decodeURIComponent(mm[1]!);
    const cap = db.capabilities.find((c) => c.id === capId);
    if (!cap) return notFound("Capability not found");
    if (cap.deleted_at) return notFound("Capability soft-deleted");
    const k = db.capabilityKnowledge[capId];
    if (!k) return notFound("Capability knowledge not found");
    return ok(k);
  }

  // §6.0 row (6) — GET /v1/capabilities/{id}/repos/{repo_id}/knowledge → RepoKnowledge
  mm = pathname.match(/^\/v1\/capabilities\/([^/]+)\/repos\/([^/]+)\/knowledge$/);
  if (mm && m === "GET") {
    const capId = decodeURIComponent(mm[1]!);
    const repoId = decodeURIComponent(mm[2]!);
    const cap = db.capabilities.find((c) => c.id === capId);
    if (!cap) return notFound("Capability not found");
    if (cap.deleted_at) return notFound("Capability soft-deleted");
    const k = db.repoKnowledge[`${capId}::${repoId}`];
    if (!k) return notFound("Repo knowledge not found");
    return ok(k);
  }

  // §5.29.14 — /v1/orgs/{id}/operations
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/operations$/);
  if (mm && m === "GET") {
    return ok(db.orgOperations);
  }

  // /v1/orgs/{id}/members
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/members$/);
  if (mm) {
    if (m === "GET") return ok(db.members);
    return methodNotAllowed();
  }
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/members\/([^/]+)\/role$/);
  if (mm && m === "PATCH") {
    const userId = decodeURIComponent(mm[1]!);
    const member = db.members.find((u) => u.user_id === userId);
    if (!member) return notFound("Member not found");
    const body = parseBody<{ role: string }>(init);
    member.role = body.role;
    return ok(member);
  }
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/members\/([^/]+)\/(deactivate|reactivate)$/);
  if (mm && m === "POST") {
    const userId = decodeURIComponent(mm[1]!);
    const action = mm[2]!;
    const member = db.members.find((u) => u.user_id === userId);
    if (!member) return notFound("Member not found");
    member.deactivated_at = action === "deactivate" ? new Date().toISOString() : null;
    return ok(member);
  }
  if (pathname.match(/^\/v1\/orgs\/[^/]+\/members\/transfer-ownership$/) && m === "POST") {
    const body = parseBody<{ new_owner_user_id: string; confirm_slug: string }>(init);
    const newOwner = db.members.find((u) => u.user_id === body.new_owner_user_id);
    if (!newOwner) return notFound("Target member not found");
    db.members.forEach((u) => { u.is_owner = u.user_id === newOwner.user_id; if (u.is_owner) u.role = "owner"; });
    return ok(newOwner);
  }

  // /v1/orgs/{id}/invitations
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/invitations$/);
  if (mm) {
    if (m === "GET") return ok(db.invitations);
    if (m === "POST") {
      const body = parseBody<{ email: string; role: string }>(init);
      const orgId = decodeURIComponent(mm[1]!);
      const inv: typeof db.invitations[number] = {
        id: `inv_${Date.now()}`,
        org_id: orgId,
        email: body.email,
        kind: "email",
        role: body.role,
        invited_by_user_id: db.me.id,
        expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        accepted_at: null,
        revoked_at: null,
        created_at: new Date().toISOString(),
      };
      db.invitations.push(inv);
      // §7.9.6 row 2471 — soft-cap warning: when adding this invitation
      // would tip the workspace over `total_seats`, BE attaches a
      // non-fatal `warning` envelope. Mock follows the contract so the
      // FE soft-cap toast renders.
      const fixture = seatsFixtureForOrg(orgId);
      const projected =
        fixture.active_seats + fixture.pending_invitations + 1;
      if (projected > fixture.total_seats) {
        const overBy = projected - fixture.total_seats;
        return ok({
          ...inv,
          warning: {
            code: "over_seat_cap",
            message: `Workspace is ${overBy} over capacity. Buy seats or upgrade to admit them.`,
            metadata: {
              active_seats: fixture.active_seats,
              total_seats: fixture.total_seats,
              pending_invitations: fixture.pending_invitations + 1,
            },
          },
        }, 201);
      }
      return ok(inv, 201);
    }
    return methodNotAllowed();
  }
  // §5.4 row-3 — link-mode mint. Stays adjacent to the email-mode mint
  // for parity. The returned `invitation_url` is the share payload.
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/invitations\/link$/);
  if (mm && m === "POST") {
    const body = parseBody<{ role: string }>(init);
    const orgId = decodeURIComponent(mm[1]!);
    const invId = `inv_${Date.now()}`;
    const inv: typeof db.invitations[number] = {
      id: invId,
      org_id: orgId,
      email: null,
      kind: "link",
      role: body.role,
      invited_by_user_id: db.me.id,
      expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      accepted_at: null,
      revoked_at: null,
      created_at: new Date().toISOString(),
    };
    db.invitations.push(inv);
    return ok({ ...inv, invitation_url: `/accept-invite/mock-${invId}` }, 201);
  }
  // §5.4 row-2 — resend an email-mode invitation. Mirrors BE: extends
  // `expires_at` and 409s on link-mode / accepted / revoked rows.
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/invitations\/([^/]+)\/resend$/);
  if (mm && m === "POST") {
    const invId = decodeURIComponent(mm[1]!);
    const inv = db.invitations.find((i) => i.id === invId);
    if (!inv) return notFound("Invitation not found");
    if (inv.kind !== "email" || inv.email === null) {
      return new MockResponse(409, {
        error: { code: "invitation_not_resendable", message: "Only email-mode invitations can be resent." },
      });
    }
    if (inv.accepted_at !== null) {
      return new MockResponse(409, {
        error: { code: "invitation_already_used", message: "This invitation has already been accepted." },
      });
    }
    if (inv.revoked_at !== null) {
      return new MockResponse(409, {
        error: { code: "invitation_revoked", message: "This invitation has been revoked. Issue a new one instead." },
      });
    }
    inv.expires_at = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    return ok(inv);
  }
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/invitations\/([^/]+)\/revoke$/);
  if (mm && m === "POST") {
    const invId = decodeURIComponent(mm[1]!);
    const inv = db.invitations.find((i) => i.id === invId);
    if (!inv) return notFound("Invitation not found");
    inv.revoked_at = new Date().toISOString();
    return ok(inv);
  }
  mm = pathname.match(/^\/v1\/invitations\/([^/]+)\/accept$/);
  if (mm && m === "POST") {
    return ok({ org_id: db.ORG_ID, role: "engineer" });
  }

  // /v1/orgs/{id}/domains
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/domains$/);
  if (mm) {
    if (m === "GET") return ok(db.domains);
    if (m === "POST") {
      const body = parseBody<{ domain: string }>(init);
      const d = {
        id: `dom_${Date.now()}`,
        domain: body.domain,
        dns_txt_record_name: `_athena.${body.domain}`,
        dns_txt_value: `athena-verify=${Math.random().toString(36).slice(2, 12)}`,
        verified_at: null,
        last_checked_at: null,
        last_error: null,
      };
      db.domains.push(d);
      return ok(d, 201);
    }
    return methodNotAllowed();
  }
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/domains\/([^/]+)\/verify$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    const d = db.domains.find((x) => x.id === id);
    if (!d) return notFound("Domain not found");
    d.verified_at = new Date().toISOString();
    d.last_checked_at = new Date().toISOString();
    d.last_error = null;
    return ok(d);
  }
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/domains\/([^/]+)$/);
  if (mm && m === "DELETE") {
    const id = decodeURIComponent(mm[1]!);
    const idx = db.domains.findIndex((x) => x.id === id);
    if (idx < 0) return notFound("Domain not found");
    db.domains.splice(idx, 1);
    return noContent();
  }

  // /v1/capabilities  — §5.31 supports ?include_deleted=false|true|only
  if (pathname === "/v1/capabilities" && m === "GET") {
    const includeDeleted = query.get("include_deleted") ?? "false";
    let list = db.capabilities;
    if (includeDeleted === "false") list = list.filter((c) => !c.deleted_at);
    else if (includeDeleted === "only") list = list.filter((c) => !!c.deleted_at);
    return ok(list.map((c) => ({ ...c, repos: (db.capabilityRepos[c.id] ?? []).length })));
  }
  if (pathname === "/v1/capabilities" && m === "POST") {
    const body = parseBody<{ slug: string; name: string; description?: string }>(init);
    const cap = {
      id: `cap_${Date.now()}`,
      org_id: db.ORG_ID,
      slug: body.slug,
      name: body.name,
      description: body.description ?? null,
      created_by_user_id: db.me.id,
      archived_at: null,
      created_at: new Date().toISOString(),
      emblem: "violet" as const,
      icon: "circle",
      repos: 0,
      open_tasks: 0,
      domain_notes: 0,
      last_activity: "just now",
    };
    db.capabilities.push(cap);
    return ok(cap, 201);
  }
  mm = pathname.match(/^\/v1\/capabilities\/([^/]+)$/);
  if (mm) {
    const id = decodeURIComponent(mm[1]!);
    const cap = db.capabilities.find((c) => c.id === id);
    if (!cap) return notFound("Capability not found");
    if (m === "GET") return ok({ ...cap, repos: (db.capabilityRepos[cap.id] ?? []).length });
    if (m === "PATCH") {
      const body = parseBody<Record<string, unknown>>(init);
      Object.assign(cap, body);
      return ok(cap);
    }
    return methodNotAllowed();
  }
  mm = pathname.match(/^\/v1\/capabilities\/([^/]+)\/archive$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    const cap = db.capabilities.find((c) => c.id === id);
    if (!cap) return notFound("Capability not found");
    cap.archived_at = new Date().toISOString();
    return ok(cap);
  }
  // §5.31 — capability soft-delete / restore / permanent-delete.
  mm = pathname.match(/^\/v1\/capabilities\/([^/]+):soft-delete$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    const cap = db.capabilities.find((c) => c.id === id);
    if (!cap) return notFound("Capability not found");
    if (!cap.deleted_at) {
      cap.deleted_at = new Date().toISOString();
      cap.deleted_by_user_id = db.me.id;
    }
    return ok({ ...cap, repos: (db.capabilityRepos[cap.id] ?? []).length });
  }
  mm = pathname.match(/^\/v1\/capabilities\/([^/]+):restore$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    const cap = db.capabilities.find((c) => c.id === id);
    if (!cap) return notFound("Capability not found");
    cap.deleted_at = null;
    cap.deleted_by_user_id = null;
    return ok({ ...cap, repos: (db.capabilityRepos[cap.id] ?? []).length });
  }
  mm = pathname.match(/^\/v1\/capabilities\/([^/]+)\/permanent$/);
  if (mm && m === "DELETE") {
    const id = decodeURIComponent(mm[1]!);
    const cap = db.capabilities.find((c) => c.id === id);
    if (!cap) return notFound("Capability not found");
    if (!cap.deleted_at) {
      return new Response(
        JSON.stringify({ error: { code: "must_soft_delete_first", message: "Soft-delete first." } }),
        { status: 409, headers: { "content-type": "application/json" } },
      );
    }
    const body = parseBody<{ confirm_slug?: string }>(init);
    if (body.confirm_slug !== cap.slug) {
      return new Response(
        JSON.stringify({ error: { code: "invalid_argument", message: "Slug mismatch." } }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }
    const idx = db.capabilities.findIndex((c) => c.id === id);
    if (idx >= 0) db.capabilities.splice(idx, 1);
    delete db.capabilityRepos[id];
    delete db.capabilityMembers[id];
    return new Response(null, { status: 204 });
  }
  // §5.30 — per-capability access control: members CRUD.
  {
    const listOrAdd = pathname.match(/^\/v1\/capabilities\/([^/]+)\/members$/);
    const itemOp = pathname.match(/^\/v1\/capabilities\/([^/]+)\/members\/([^/]+)$/);
    const capId = decodeURIComponent((listOrAdd ?? itemOp)?.[1] ?? "");
    if (capId) {
      const list = (db.capabilityMembers[capId] ??= []);
      const memberToWire = (row: db.MockCapabilityMember) => {
        const u = row.user_id === db.me.id
          ? { email: db.me.email, display_name: db.me.display_name, avatar_url: db.me.avatar_url }
          : (() => {
              const orgMember = db.members.find((mm) => mm.user_id === row.user_id);
              return {
                email: orgMember?.email ?? "unknown@example.com",
                display_name: orgMember?.display_name ?? null,
                avatar_url: orgMember?.avatar_url ?? null,
              };
            })();
        return {
          id: row.id,
          capability_id: row.capability_id,
          user_id: row.user_id,
          role: row.role,
          email: u.email,
          display_name: u.display_name,
          avatar_url: u.avatar_url,
          joined_at: row.joined_at,
          added_by_user_id: row.added_by_user_id,
        };
      };

      if (listOrAdd && m === "GET") {
        return ok(list.filter((r) => r.deactivated_at === null).map(memberToWire));
      }
      if (listOrAdd && m === "POST") {
        const body = parseBody<{ email: string; role: "admin" | "viewer" }>(init);
        const emailLc = body.email.toLowerCase();
        const orgUser = emailLc === db.me.email.toLowerCase()
          ? { user_id: db.me.id }
          : db.members.find((mm) => mm.email.toLowerCase() === emailLc && mm.deactivated_at === null);
        if (!orgUser) {
          return new MockResponse(404, {
            error: {
              code: "user_not_in_org",
              message: "No Athena user with that email is in your organization.",
            },
          });
        }
        const existing = list.find((r) => r.user_id === orgUser.user_id && r.deactivated_at === null);
        if (existing) {
          return new MockResponse(409, {
            error: {
              code: "conflict",
              field: "email",
              message: `User is already a ${existing.role} of this capability.`,
            },
          });
        }
        const row: db.MockCapabilityMember = {
          id: `cm_${Date.now().toString(36)}`,
          capability_id: capId,
          user_id: orgUser.user_id,
          role: body.role,
          joined_at: new Date().toISOString(),
          added_by_user_id: db.me.id,
          deactivated_at: null,
        };
        list.push(row);
        return ok(memberToWire(row), 201);
      }
      if (itemOp) {
        const userId = decodeURIComponent(itemOp[2]!);
        const row = list.find((r) => r.user_id === userId && r.deactivated_at === null);
        if (!row) return notFound("Capability member not found.");
        if (m === "PATCH") {
          const body = parseBody<{ role: "admin" | "viewer" }>(init);
          row.role = body.role;
          return ok(memberToWire(row));
        }
        if (m === "DELETE") {
          row.deactivated_at = new Date().toISOString();
          return new MockResponse(204, null);
        }
      }
    }
  }
  // §5.29.12 — PATCH /v1/capabilities/{id}/settings (currently just budget).
  mm = pathname.match(/^\/v1\/capabilities\/([^/]+)\/settings$/);
  if (mm && m === "PATCH") {
    const id = decodeURIComponent(mm[1]!);
    const cap = db.capabilities.find((c) => c.id === id);
    if (!cap) return notFound("Capability not found");
    const body = parseBody<{ budget_mtd_usd?: number }>(init);
    // Reflect the budget in the cost summary's per-capability budget too,
    // so the /cost page's progress bar updates without a refetch round-trip.
    if (typeof body.budget_mtd_usd === "number") {
      const summary = db.costData?.spend_by_capability?.find((c) => c.id === id);
      if (summary) summary.budget = body.budget_mtd_usd;
    }
    return ok({ id, budget_mtd_usd: body.budget_mtd_usd ?? null });
  }
  // §5.31 — /v1/repos lifecycle. We don't keep a separate org-scoped
  // `repos` store in the mock; we derive everything from the per-cap
  // attachment rows (`db.capabilityRepos`). The endpoints below mutate
  // `repo_deleted_at` on every attachment row for the given `repo_id`
  // — that's the only state the FE consumes for the per-row chip.
  if (pathname === "/v1/repos" && m === "GET") {
    const includeDeleted = query.get("include_deleted") ?? "false";
    const byRepoId = new Map<string, db.MockRepoFull>();
    for (const [capId, list] of Object.entries(db.capabilityRepos)) {
      for (const a of list) {
        const rid = a.repo_id;
        if (!rid) continue;
        const existing = byRepoId.get(rid);
        const attached = [...(existing?.attached_capability_ids ?? []), capId];
        byRepoId.set(rid, {
          id: rid,
          org_id: db.ORG_ID,
          integration_id: a.integration_id,
          full_name: a.repo_full_name,
          default_branch: a.default_branch,
          last_indexed_sha: a.last_indexed_sha ?? null,
          branch_head_sha: a.branch_head_sha ?? null,
          archived_at: null,
          deleted_at: a.repo_deleted_at ?? null,
          deleted_by_user_id: null,
          current_sync_stage: a.current_sync_stage ?? null,
          created_at: a.created_at,
          attached_capability_ids: attached,
        });
      }
    }
    let rows = [...byRepoId.values()];
    if (includeDeleted === "false") rows = rows.filter((r) => !r.deleted_at);
    else if (includeDeleted === "only") rows = rows.filter((r) => !!r.deleted_at);
    return ok(rows);
  }
  mm = pathname.match(/^\/v1\/repos\/([^/]+):soft-delete$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    const now = new Date().toISOString();
    let any = false;
    for (const list of Object.values(db.capabilityRepos)) {
      for (const a of list) {
        if (a.repo_id === id) { a.repo_deleted_at = now; any = true; }
      }
    }
    if (!any) return notFound("Repo not found");
    return ok({ id, deleted_at: now });
  }
  mm = pathname.match(/^\/v1\/repos\/([^/]+):restore$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    let any = false;
    for (const list of Object.values(db.capabilityRepos)) {
      for (const a of list) {
        if (a.repo_id === id) { a.repo_deleted_at = null; any = true; }
      }
    }
    if (!any) return notFound("Repo not found");
    return ok({ id, deleted_at: null });
  }
  // §3.13 row 1 — synthetic ingest-progress for the FE timeline
  // disclosure. Derived from whatever `current_sync_stage` the
  // attachment carries so the timeline animates in lockstep with the
  // existing chip flow (queued → cloning → … → completed).
  mm = pathname.match(/^\/v1\/repos\/([^/]+)\/ingest-progress$/);
  if (mm && m === "GET") {
    const id = decodeURIComponent(mm[1]!);
    let stage: string | null = null;
    let branchSha = "";
    let lastIndexed: string | null = null;
    for (const list of Object.values(db.capabilityRepos)) {
      for (const a of list) {
        if (a.repo_id === id) {
          stage = a.current_sync_stage ?? null;
          branchSha = a.branch_head_sha ?? a.last_indexed_sha ?? "";
          lastIndexed = a.last_indexed_sha ?? null;
        }
      }
    }
    if (!stage && !lastIndexed) return ok(null);
    const effectiveStage = stage ?? "completed";
    const startedIso = new Date(Date.now() - 30_000).toISOString();
    const completedIso = effectiveStage === "completed" || effectiveStage === "failed"
      ? new Date().toISOString()
      : null;
    const current = {
      stage: effectiveStage,
      entered_at: startedIso,
      duration_ms: completedIso ? 30_000 : Math.max(1_000, Date.now() - Date.parse(startedIso)),
      files_total: 120,
      files_processed: effectiveStage === "completed" ? 120 : effectiveStage === "indexing" ? 96 : 42,
      last_processed_path: "src/example/module.py",
      error: effectiveStage === "failed" ? "git: clone timed out (mock)" : null,
    };
    return ok({
      repo_id: id,
      current,
      history: [current],
      job_id: "mock_job_1",
      branch_sha: branchSha || "abc123def456",
      last_heartbeat_at: startedIso,
      files_total: current.files_total,
      files_processed: current.files_processed,
      last_processed_path: current.last_processed_path,
    });
  }
  // §6.0 — per-repo file browser. Generates fake file rows from the
  // existing knowledge fixtures (modules + symbols from `repoKnowledge`)
  // so the FE works end-to-end in mock mode. The detail endpoint expands
  // the synthesised lists. Repo lookup is by `repo_id` across every
  // capability's repoKnowledge keyspace (`${capId}::${repoId}`).
  mm = pathname.match(/^\/v1\/repos\/([^/]+)\/files$/);
  if (mm && m === "GET") {
    const repoId = decodeURIComponent(mm[1]!);
    return ok(mockRepoFilesList(repoId, query));
  }
  // §6.5.6 FE-mirror routes — `/dependents`, `/dependencies`, `/slice`,
  // `/content` MUST match before the generic `/files/{id}$` route below
  // so the latter doesn't gobble the segment.
  mm = pathname.match(/^\/v1\/repos\/([^/]+)\/files\/([^/]+)\/dependents$/);
  if (mm && m === "GET") {
    const repoId = decodeURIComponent(mm[1]!);
    const fileId = decodeURIComponent(mm[2]!);
    return ok(mockFileGraphWalk(repoId, fileId, "incoming", query));
  }
  mm = pathname.match(/^\/v1\/repos\/([^/]+)\/files\/([^/]+)\/dependencies$/);
  if (mm && m === "GET") {
    const repoId = decodeURIComponent(mm[1]!);
    const fileId = decodeURIComponent(mm[2]!);
    return ok(mockFileGraphWalk(repoId, fileId, "outgoing", query));
  }
  mm = pathname.match(/^\/v1\/repos\/([^/]+)\/files\/([^/]+)\/slice$/);
  if (mm && m === "GET") {
    const repoId = decodeURIComponent(mm[1]!);
    const fileId = decodeURIComponent(mm[2]!);
    return ok(mockFileGraphWalk(repoId, fileId, "slice", query));
  }
  mm = pathname.match(/^\/v1\/repos\/([^/]+)\/files\/([^/]+)\/content$/);
  if (mm && m === "GET") {
    const repoId = decodeURIComponent(mm[1]!);
    const fileId = decodeURIComponent(mm[2]!);
    const body = mockFileContent(repoId, fileId, query);
    if (!body) return notFound("File not found");
    return ok(body);
  }
  mm = pathname.match(/^\/v1\/repos\/([^/]+)\/grep$/);
  if (mm && m === "GET") {
    const repoId = decodeURIComponent(mm[1]!);
    return ok(mockRepoGrep(repoId, query));
  }
  mm = pathname.match(/^\/v1\/repos\/([^/]+)\/files\/([^/]+)$/);
  if (mm && m === "GET") {
    const repoId = decodeURIComponent(mm[1]!);
    const fileId = decodeURIComponent(mm[2]!);
    const detail = mockRepoFileDetail(repoId, fileId);
    if (!detail) return notFound("File not found");
    return ok(detail);
  }
  mm = pathname.match(/^\/v1\/repos\/([^/]+)\/permanent$/);
  if (mm && m === "DELETE") {
    const id = decodeURIComponent(mm[1]!);
    let found = false;
    for (const capId of Object.keys(db.capabilityRepos)) {
      const list = db.capabilityRepos[capId] ?? [];
      const before = list.length;
      db.capabilityRepos[capId] = list.filter((a) => a.repo_id !== id);
      if (db.capabilityRepos[capId].length < before) found = true;
    }
    if (!found) return notFound("Repo not found");
    return new Response(null, { status: 204 });
  }
  mm = pathname.match(/^\/v1\/capabilities\/([^/]+)\/repos$/);
  if (mm) {
    const id = decodeURIComponent(mm[1]!);
    if (m === "GET") return ok([...(db.capabilityRepos[id] ?? [])]);
    if (m === "POST") {
      const body = parseBody<{ integration_id: string; repo_full_name: string; default_branch?: string }>(init);
      // Auto-enqueue first ingest on attach (§5.29.11 / B7.3). Stage starts at
      // `queued` — the real BE flips `queued → cloning` only when the Arq
      // worker actually picks up the job (max-jobs=1 → repos process 1-by-1).
      // We simulate that here by stacking the pickup delays across all
      // currently-in-flight rows in this capability so the chips show the
      // serial queue behaviour even though setTimeout itself is parallel.
      const newSha = Math.random().toString(16).slice(2, 14).padEnd(40, "0");
      const list = (db.capabilityRepos[id] ??= []);
      // Count rows already queued/cloning to stagger the new one's pickup.
      const inFlight = list.filter((r) =>
        r.current_sync_stage && ["queued", "cloning", "parsing", "embedding", "indexing"].includes(r.current_sync_stage),
      ).length;
      const pickupDelay = 600 + inFlight * 5500; // each prior row needs ~5.5s to drain
      const repo = {
        id: `repo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        capability_id: id,
        integration_id: body.integration_id,
        repo_full_name: body.repo_full_name,
        default_branch: body.default_branch ?? "main",
        attached_by_user_id: db.me.id,
        created_at: new Date().toISOString(),
        branch_head_sha: newSha,
        last_indexed_sha: null as string | null,
        last_sync_attempt_at: new Date().toISOString(),
        current_sync_stage: "queued" as SyncStage | null,
        last_sync_job_id: `arq_${Date.now()}`,
      };
      list.push(repo);
      setTimeout(() => { repo.current_sync_stage = "cloning"; },   pickupDelay);
      setTimeout(() => { repo.current_sync_stage = "parsing"; },   pickupDelay + 1500);
      setTimeout(() => { repo.current_sync_stage = "embedding"; }, pickupDelay + 3000);
      setTimeout(() => { repo.current_sync_stage = "indexing"; },  pickupDelay + 4500);
      setTimeout(() => {
        repo.current_sync_stage = "completed";
        repo.last_indexed_sha = newSha;
      }, pickupDelay + 5500);
      return ok(repo, 201);
    }
    return methodNotAllowed();
  }
  mm = pathname.match(/^\/v1\/capabilities\/([^/]+)\/repos\/([^/]+)$/);
  if (mm && m === "DELETE") {
    const capId = decodeURIComponent(mm[1]!);
    const repoId = decodeURIComponent(mm[2]!);
    const list = db.capabilityRepos[capId] ?? [];
    const idx = list.findIndex((r) => r.id === repoId);
    if (idx < 0) return notFound("Repo not found on capability");
    list.splice(idx, 1);
    return noContent();
  }
  mm = pathname.match(/^\/v1\/capabilities\/([^/]+)\/resources$/);
  if (mm && m === "GET") {
    const id = decodeURIComponent(mm[1]!);
    return ok(db.capabilityResources[id] ?? []);
  }
  mm = pathname.match(/^\/v1\/capabilities\/([^/]+)\/config$/);
  if (mm && m === "GET") {
    const id = decodeURIComponent(mm[1]!);
    const cfg = db.capabilityConfigs[id];
    if (!cfg) return notFound("Capability config not found");
    return ok(cfg);
  }
  mm = pathname.match(/^\/v1\/capabilities\/([^/]+)\/notes$/);
  if (mm && m === "GET") {
    const id = decodeURIComponent(mm[1]!);
    return ok(db.domainNotes[id] ?? []);
  }
  mm = pathname.match(/^\/v1\/capabilities\/([^/]+)\/knowledge$/);
  if (mm && m === "GET") {
    const id = decodeURIComponent(mm[1]!);
    const k = db.capabilityKnowledge[id];
    if (!k) return notFound("Capability knowledge not found");
    return ok(k);
  }
  mm = pathname.match(/^\/v1\/capabilities\/([^/]+)\/repos\/([^/]+)\/knowledge$/);
  if (mm && m === "GET") {
    const capId = decodeURIComponent(mm[1]!);
    const repoId = decodeURIComponent(mm[2]!);
    const key = `${capId}::${repoId}`;
    const k = db.repoKnowledge[key];
    if (!k) return notFound("Repo knowledge not found");
    return ok(k);
  }
  // §5.27 r14 — GET /v1/capabilities/{cap_id}/repos/{repo_id}/tier-tree
  // ADR-073 §4 five-tier hierarchy for the TierExplorer on the repo
  // detail page. Returns 404 when no curated tree exists; the FE page
  // catches and renders without the tree (already does in the live API
  // contract).
  mm = pathname.match(/^\/v1\/capabilities\/([^/]+)\/repos\/([^/]+)\/tier-tree$/);
  if (mm && m === "GET") {
    const capId = decodeURIComponent(mm[1]!);
    const repoId = decodeURIComponent(mm[2]!);
    const key = `${capId}:${repoId}`;
    const tree = db.tierTrees[key];
    if (!tree) return notFound("Tier tree not found");
    return ok(tree);
  }
  // §5.29.11 / B7.2 — POST /v1/capabilities/{id}/repos/{cap_repo_id}/knowledge:sync
  // Simulates the worker by stepping through the 4 stages
  // (cloning → parsing → embedding → indexing → completed) and
  // flipping last_indexed_sha at the end. Refuses with 409 when a
  // stage is already in flight so the FE's dedup path can demo.
  mm = pathname.match(/^\/v1\/capabilities\/([^/]+)\/repos\/([^/]+)\/knowledge:sync$/);
  if (mm && m === "POST") {
    const capId = decodeURIComponent(mm[1]!);
    const capRepoId = decodeURIComponent(mm[2]!);
    const list = db.capabilityRepos[capId] ?? [];
    const repo = list.find((r) => r.id === capRepoId);
    if (!repo) return notFound("Repo attachment not found");
    const inFlight = new Set(["cloning", "parsing", "embedding", "indexing"]);
    if (repo.current_sync_stage && inFlight.has(repo.current_sync_stage)) {
      return new MockResponse(409, {
        error: {
          code: "conflict",
          message: `Sync already in progress (stage: ${repo.current_sync_stage}). Wait for it to finish.`,
        },
      });
    }
    const newSha = Math.random().toString(16).slice(2, 14).padEnd(40, "0");
    const jobId = `arq_${Date.now()}`;
    repo.branch_head_sha = newSha;
    repo.current_sync_stage = "cloning";
    repo.last_sync_attempt_at = new Date().toISOString();
    setTimeout(() => { repo.current_sync_stage = "parsing"; },   1500);
    setTimeout(() => { repo.current_sync_stage = "embedding"; }, 3000);
    setTimeout(() => { repo.current_sync_stage = "indexing"; },  4500);
    setTimeout(() => {
      repo.current_sync_stage = "completed";
      repo.last_indexed_sha = newSha;
    }, 5500);
    return ok({
      job_id: jobId,
      status: "queued",
      repo_id: capRepoId,
      branch_sha: newSha,
    });
  }
  // Batch 12k — POST /v1/capabilities/{id}/repos/{cap_repo_id}/knowledge:retry-enrichments
  // Mock simulates a successful backfill that flips the chip from
  // ``degraded`` back to ``completed`` so the FE demo path is honest.
  mm = pathname.match(
    /^\/v1\/capabilities\/([^/]+)\/repos\/([^/]+)\/knowledge:retry-enrichments$/,
  );
  if (mm && m === "POST") {
    const capId = decodeURIComponent(mm[1]!);
    const capRepoId = decodeURIComponent(mm[2]!);
    const list = db.capabilityRepos[capId] ?? [];
    const repo = list.find((r) => r.id === capRepoId);
    if (!repo) return notFound("Repo attachment not found");
    if (repo.current_sync_stage === "degraded") {
      repo.current_sync_stage = "completed";
    }
    return ok({
      retried: 3,
      succeeded: 3,
      still_failed: 0,
      by_kind: {
        embedding: { retried: 3, succeeded: 3, still_failed: 0 },
      },
    });
  }

  // /v1/audit/events
  if (pathname === "/v1/audit/events" && m === "GET") {
    const limit = Number(query.get("limit")) || 50;
    const action = query.get("action");
    const actorId = query.get("actor_id");
    let events = db.auditEvents.slice();
    if (action) events = events.filter((e) => e.action.includes(action));
    if (actorId) events = events.filter((e) => e.actor_id === actorId);
    return ok({ events: events.slice(0, limit), next_cursor: null });
  }
  if (pathname === "/v1/audit/verify" && m === "POST") {
    return ok({ verified: db.auditEvents.length });
  }

  // /v1/orgs/{id}/api-tokens
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/api-tokens$/);
  if (mm) {
    if (m === "GET") return ok(db.apiTokens);
    if (m === "POST") {
      const body = parseBody<{ name: string; scopes?: string[]; expires_at?: string | null }>(init);
      const id = `tok_${Date.now()}`;
      const raw = `ath_live_${Math.random().toString(36).slice(2, 26)}`;
      const summary = {
        id,
        name: body.name,
        prefix: `${raw.slice(0, 12)}…${raw.slice(-3)}`,
        scopes: body.scopes ?? [],
        expires_at: body.expires_at ?? null,
        last_used_at: null,
        revoked_at: null,
        created_at: new Date().toISOString(),
      };
      db.apiTokens.push(summary);
      return ok({ ...summary, token: raw }, 201);
    }
    return methodNotAllowed();
  }
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/api-tokens\/([^/]+)\/revoke$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    const tok = db.apiTokens.find((t) => t.id === id);
    if (!tok) return notFound("Token not found");
    tok.revoked_at = new Date().toISOString();
    return ok(tok);
  }

  // /v1/runs
  if (pathname === "/v1/runs" && m === "GET") return ok(db.runs);
  if (pathname === "/v1/runs" && m === "POST") {
    // Demo mode: route every "new task" submission to one of the two
    // precomputed exemplar runs (tsk_001 for implement, tsk_002 for PRD)
    // so reviewers always land in a fully-populated flow. The user's
    // input is preserved as a one-line "echo" so the demo feels personal
    // (it appears in inbox + activity below the precomputed goal).
    const body = parseBody<{ goal: string; capability_id?: string | null; intent?: "chat" | "generate_prd" }>(init);
    const isPrd = body.intent === "generate_prd";
    const exemplarId = isPrd ? "tsk_002" : "tsk_001";
    const exemplar = db.runs.find((r) => r.id === exemplarId);
    if (!exemplar) return notFound("Exemplar task missing");

    // Record the user's actual phrasing as an inbox digest so it appears
    // somewhere — without mutating the precomputed run.
    const trimmedGoal = body.goal.split("\n")[0]!.trim().slice(0, 120);
    db.inboxItems.unshift({
      id: `ib_demo_${Date.now()}`,
      kind: "digest",
      priority: "low",
      when: "just now",
      task_id: exemplarId,
      title: `Demo: loaded exemplar ${exemplarId} from your input`,
      actor: "Athena",
      actor_avatar: "AT",
      actor_kind: "agent",
      context: `Your input — "${trimmedGoal}" — routed to the precomputed ${isPrd ? "PRD" : "Implement"} flow. Every UI surface for ${exemplarId} is populated.`,
      cta: `Open ${exemplarId}`,
      to: `/runs/${exemplarId}`,
    });

    return ok(exemplar, 201);
  }
  mm = pathname.match(/^\/v1\/runs\/([^/]+)$/);
  if (mm && m === "GET") {
    const id = decodeURIComponent(mm[1]!);
    const run = db.runs.find((r) => r.id === id);
    if (!run) return notFound("Run not found");
    return ok(run);
  }
  mm = pathname.match(/^\/v1\/runs\/([^/]+)\/phases\/([^/]+)$/);
  if (mm && m === "GET") {
    const id = decodeURIComponent(mm[1]!);
    const phaseKey = decodeURIComponent(mm[2]!);
    const phaseData = (db.taskPhaseData[id] as Record<string, unknown> | undefined) ?? {};
    const phaseSlice = phaseData[phaseKey] ?? null;
    return ok({ phase: phaseKey, data: phaseSlice ?? { empty: true, message: `No data yet for phase ${phaseKey}.` } });
  }
  // §7 Replay UI GA — paginated `run_events` history for the scrubber on
  // `/runs/[id]/replay`. Returns `ReplayEventPage{events, next_cursor, has_more}`
  // keyed on monotonic seq. Mirrors the BE handler in
  // `athena/api/routers/runs.py:replay_run_events`.
  mm = pathname.match(/^\/v1\/runs\/([^/]+)\/events\/replay$/);
  if (mm && m === "GET") {
    const id = decodeURIComponent(mm[1]!);
    if (!db.runs.find((r) => r.id === id)) return notFound("Run not found");
    const cursorRaw = query.get("cursor");
    const limitRaw = query.get("limit");
    const cursor = cursorRaw !== null ? Number(cursorRaw) : null;
    const limit = limitRaw !== null
      ? Math.max(1, Math.min(500, Number(limitRaw)))
      : 100;
    const all = db.replayEventsFor(id);
    const filtered = cursor !== null ? all.filter((e) => e.seq > cursor) : all;
    const page = filtered.slice(0, limit);
    const hasMore = filtered.length > limit;
    const nextCursor = page.length > 0 ? page[page.length - 1]!.seq : null;
    return ok({ events: page, next_cursor: nextCursor, has_more: hasMore });
  }
  // Readiness §4 row 9 — per-phase document fetch backing the Implement-track
  // phase tabs (Spec/Plan/Implement/Review/CI/PR). Returns a `RunPhaseDocument`
  // shaped to `lib/api/client.ts`, or `null` when the phase agent hasn't
  // written its artifact yet. Mirrors the BE handler in
  // `athena/api/routers/run_documents.py`.
  mm = pathname.match(/^\/v1\/runs\/([^/]+)\/documents$/);
  if (mm && m === "GET") {
    const id = decodeURIComponent(mm[1]!);
    const phase = query.get("phase") ?? "";
    if (!db.runs.find((r) => r.id === id)) return notFound("Run not found");
    const fixture = (db.runPhaseDocuments[id] ?? {})[phase];
    return ok(fixture ?? null);
  }
  mm = pathname.match(/^\/v1\/runs\/([^/]+)\/pr-feedback$/);
  if (mm && m === "GET") {
    const id = decodeURIComponent(mm[1]!);
    return ok(db.prFeedback[id] ?? []);
  }
  mm = pathname.match(/^\/v1\/runs\/([^/]+)\/decisions$/);
  if (mm && m === "GET") {
    const id = decodeURIComponent(mm[1]!);
    // F-04.7 — when extended `runDecisions` exists, prefer that shape (the
    // pane consumes RunDecisionRow). The lightweight `taskDecisions` is the
    // fallback for runs that don't have rich data yet, and is still
    // backward-compatible with the strip's TaskDecision contract.
    const extended = db.runDecisions[id];
    if (extended) {
      // Apply filter query params if provided.
      const filters = {
        status: query.get("status") ?? undefined,
        scope_kind: query.get("scope_kind") ?? undefined,
        kind: query.get("kind") ?? undefined,
        who_kind: query.get("who_kind") ?? undefined,
      };
      const filtered = extended.filter((r) =>
        (!filters.status || r.status === filters.status)
        && (!filters.scope_kind || r.scope_kind === filters.scope_kind)
        && (!filters.kind || r.kind === filters.kind)
        && (!filters.who_kind || r.who_kind === filters.who_kind),
      );
      // Newest first for the pane.
      const sorted = [...filtered].sort((a, b) => b.created_at.localeCompare(a.created_at));
      return ok(sorted);
    }
    const decisions = (db.taskDecisions[id] ?? []).map((d) => ({
      id: d.id,
      when: d.when,
      who_name: d.whoName,
      who_avatar: d.whoAvatar,
      who_kind: d.whoKind,
      phase: d.phase,
      kind: d.kind,
      title: d.title,
      body: d.body,
      source: d.source,
    }));
    return ok(decisions);
  }
  // F-04.7 — manual create / patch / revert / escalate
  mm = pathname.match(/^\/v1\/runs\/([^/]+)\/decisions$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    const body = parseBody<{
      title: string; body: string; scope_kind: "global" | "section" | "selection";
      scope_doc_id?: string | null; scope_section_anchor?: string | null;
      scope_selection?: { start_anchor: string; end_anchor: string; char_offsets?: { start: number; end: number } | null } | null;
      impact?: "high" | "medium" | "low";
    }>(init);
    const list = (db.runDecisions[id] ??= []);
    const row = {
      id: `rd_${Date.now().toString(36)}`,
      who_name: db.me.display_name, who_avatar: "DU", who_kind: "human" as const,
      phase: "spec", kind: "user_decision" as const,
      title: body.title, body: body.body, source: "Added via decision pane",
      when: "just now", created_at: new Date().toISOString(),
      scope_kind: body.scope_kind, scope_doc_id: body.scope_doc_id ?? null,
      scope_section_anchor: body.scope_section_anchor ?? null,
      scope_selection: body.scope_selection ?? null,
      supersedes_decision_id: null, status: "active" as const,
      impact: body.impact ?? ("medium" as const), user_editable: true,
    };
    list.unshift(row);
    return ok(row, 201);
  }
  mm = pathname.match(/^\/v1\/runs\/([^/]+)\/decisions\/([^/]+)$/);
  if (mm && m === "PATCH") {
    const id = decodeURIComponent(mm[1]!);
    const decisionId = decodeURIComponent(mm[2]!);
    const list = db.runDecisions[id];
    if (!list) return notFound("Run not found");
    const original = list.find((d) => d.id === decisionId);
    if (!original) return notFound("Decision not found");
    if (!original.user_editable) {
      return new MockResponse(403, { error: { code: "not_editable", message: "Decision is not user-editable." } });
    }
    const body = parseBody<{
      title?: string; body?: string; scope_kind?: "global" | "section" | "selection";
      scope_doc_id?: string | null; scope_section_anchor?: string | null;
      impact?: "high" | "medium" | "low";
    }>(init);
    original.status = "superseded";
    const newRow = {
      ...original,
      id: `rd_${Date.now().toString(36)}`,
      title: body.title ?? original.title,
      body: body.body ?? original.body,
      scope_kind: body.scope_kind ?? original.scope_kind,
      scope_doc_id: body.scope_doc_id ?? original.scope_doc_id,
      scope_section_anchor: body.scope_section_anchor ?? original.scope_section_anchor,
      impact: body.impact ?? original.impact,
      supersedes_decision_id: original.id,
      status: "active" as const,
      when: "just now",
      created_at: new Date().toISOString(),
      source: "Edited",
    };
    list.unshift(newRow);
    return ok(newRow);
  }
  mm = pathname.match(/^\/v1\/runs\/([^/]+)\/decisions\/([^/]+)\/revert$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    const decisionId = decodeURIComponent(mm[2]!);
    const list = db.runDecisions[id];
    if (!list) return notFound("Run not found");
    const target = list.find((d) => d.id === decisionId);
    if (!target) return notFound("Decision not found");
    target.status = "reverted";
    return ok(target);
  }
  mm = pathname.match(/^\/v1\/runs\/([^/]+)\/decisions\/([^/]+)\/escalate$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    const decisionId = decodeURIComponent(mm[2]!);
    const list = db.runDecisions[id];
    if (!list) return notFound("Run not found");
    const target = list.find((d) => d.id === decisionId);
    if (!target) return notFound("Decision not found");
    target.impact = "high";
    return ok(target);
  }
  // §5.29.10 Item 1b — DecisionRecord CRUD for capability + org scopes.
  // GET returns only `active` rows (superseded/reverted hidden from the tab).
  {
    const capList = pathname.match(/^\/v1\/capabilities\/([^/]+)\/decisions$/);
    const capItem = pathname.match(/^\/v1\/capabilities\/([^/]+)\/decisions\/([^/]+)$/);
    const capRevert = pathname.match(/^\/v1\/capabilities\/([^/]+)\/decisions\/([^/]+)\/revert$/);
    const capEscalate = pathname.match(/^\/v1\/capabilities\/([^/]+)\/decisions\/([^/]+)\/escalate$/);
    const orgList = pathname.match(/^\/v1\/orgs\/([^/]+)\/decisions$/);
    const orgItem = pathname.match(/^\/v1\/orgs\/([^/]+)\/decisions\/([^/]+)$/);
    const orgRevert = pathname.match(/^\/v1\/orgs\/([^/]+)\/decisions\/([^/]+)\/revert$/);
    const orgEscalate = pathname.match(/^\/v1\/orgs\/([^/]+)\/decisions\/([^/]+)\/escalate$/);
    // §5.29.10 row 1c — repo-scoped governance feed. Same shape as
    // capability/org so it shares the resolveScope path.
    const repoList = pathname.match(/^\/v1\/repos\/([^/]+)\/decisions$/);
    const repoItem = pathname.match(/^\/v1\/repos\/([^/]+)\/decisions\/([^/]+)$/);
    const repoRevert = pathname.match(/^\/v1\/repos\/([^/]+)\/decisions\/([^/]+)\/revert$/);
    const repoEscalate = pathname.match(/^\/v1\/repos\/([^/]+)\/decisions\/([^/]+)\/escalate$/);

    const resolveScope = (
      capMatch: RegExpMatchArray | null,
      orgMatch: RegExpMatchArray | null,
      repoMatch: RegExpMatchArray | null,
    ) => {
      if (capMatch) {
        const id = decodeURIComponent(capMatch[1]!);
        return { id, store: db.capabilityDecisions as Record<string, db.MockDecisionRecord[]> };
      }
      if (orgMatch) {
        const id = decodeURIComponent(orgMatch[1]!);
        return { id, store: db.orgDecisions as Record<string, db.MockDecisionRecord[]> };
      }
      if (repoMatch) {
        const id = decodeURIComponent(repoMatch[1]!);
        return { id, store: db.repoDecisions as Record<string, db.MockDecisionRecord[]> };
      }
      return null;
    };

    const scope = resolveScope(
      capList ?? capItem ?? capRevert ?? capEscalate,
      orgList ?? orgItem ?? orgRevert ?? orgEscalate,
      repoList ?? repoItem ?? repoRevert ?? repoEscalate,
    );
    if (scope) {
      const list = (scope.store[scope.id] ??= []);
      const isList = capList || orgList || repoList;
      const isItem = capItem || orgItem || repoItem;
      const isRevert = capRevert || orgRevert || repoRevert;
      const isEscalate = capEscalate || orgEscalate || repoEscalate;
      const itemMatch = capItem ?? orgItem ?? repoItem;
      const revertMatch = capRevert ?? orgRevert ?? repoRevert;
      const escalateMatch = capEscalate ?? orgEscalate ?? repoEscalate;

      if (isList && m === "GET") {
        return ok(list.filter((d) => d.status === "active"));
      }
      if (isList && m === "POST") {
        const body = parseBody<{ title: string; tag: string; kind: "ADR" | "Convention" | "Domain note"; summary: string }>(init);
        const now = new Date();
        const row: db.MockDecisionRecord = {
          id: `dr_${Date.now().toString(36)}`,
          title: body.title, tag: body.tag, kind: body.kind, summary: body.summary,
          author: db.me.display_name, date: "just now",
          status: "active", created_at: now.toISOString(),
        };
        list.unshift(row);
        return ok(row, 201);
      }
      if (isItem && m === "PATCH") {
        const decisionId = decodeURIComponent(itemMatch![2]!);
        const original = list.find((d) => d.id === decisionId && d.status === "active");
        if (!original) return notFound("Decision not found");
        const body = parseBody<Partial<{ title: string; tag: string; kind: "ADR" | "Convention" | "Domain note"; summary: string }>>(init);
        original.status = "superseded";
        const replacement: db.MockDecisionRecord = {
          ...original,
          id: `dr_${Date.now().toString(36)}`,
          title: body.title ?? original.title,
          tag: body.tag ?? original.tag,
          kind: body.kind ?? original.kind,
          summary: body.summary ?? original.summary,
          status: "active",
          date: "just now",
          created_at: new Date().toISOString(),
        };
        list.unshift(replacement);
        return ok(replacement);
      }
      if (isRevert && m === "POST") {
        const decisionId = decodeURIComponent(revertMatch![2]!);
        const target = list.find((d) => d.id === decisionId);
        if (!target) return notFound("Decision not found");
        target.status = "reverted";
        return ok(target);
      }
      if (isEscalate && m === "POST") {
        const decisionId = decodeURIComponent(escalateMatch![2]!);
        const target = list.find((d) => d.id === decisionId);
        if (!target) return notFound("Decision not found");
        // Escalation on a governance record converts a Domain note → Convention
        // → ADR (one rung at a time). Capped at ADR.
        if (target.kind === "Domain note") target.kind = "Convention";
        else if (target.kind === "Convention") target.kind = "ADR";
        return ok(target);
      }
    }
  }
  // F-04.14 — clarification endpoints
  mm = pathname.match(/^\/v1\/runs\/([^/]+)\/clarifications$/);
  if (mm && m === "GET") {
    const id = decodeURIComponent(mm[1]!);
    const list = db.runClarifications[id] ?? [];
    const filters = {
      status: query.get("status") ?? undefined,
      priority: query.get("priority") ?? undefined,
      phase_key: query.get("phase_key") ?? undefined,
      origin: query.get("origin") ?? undefined,
      question_kind: query.get("question_kind") ?? undefined,
    };
    return ok(list.filter((c) =>
      (!filters.status || c.status === filters.status)
      && (!filters.priority || c.priority === filters.priority)
      && (!filters.phase_key || c.phase_key === filters.phase_key)
      && (!filters.origin || c.origin === filters.origin)
      && (!filters.question_kind || c.question_kind === filters.question_kind),
    ));
  }
  mm = pathname.match(/^\/v1\/runs\/([^/]+)\/clarifications\/pending-batches$/);
  if (mm && m === "GET") {
    const id = decodeURIComponent(mm[1]!);
    const list = (db.runClarifications[id] ?? []).filter((c) => c.status === "pending");
    const byBatch = new Map<string, db.RunClarification[]>();
    for (const c of list) {
      const key = c.batch_id ?? c.qid;
      const arr = byBatch.get(key) ?? [];
      arr.push(c);
      byBatch.set(key, arr);
    }
    // Note: byBatch keys aren't surfaced in the response shape; batch_id on
    // each row is the source of truth. `qids` lets the FE refetch by id.
    const batches = Array.from(byBatch.values()).map((items) => ({
      batch_id: items[0]!.batch_id,
      qids: items.map((i) => i.qid),
      priority: items.find((i) => i.priority === "blocker")?.priority ?? items[0]!.priority,
      origin: items[0]!.origin,
      phase_key: items[0]!.phase_key,
      blocker_count: items.filter((i) => i.priority === "blocker").length,
    }));
    return ok(batches);
  }
  mm = pathname.match(/^\/v1\/runs\/([^/]+)\/clarifications\/batch$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    const body = parseBody<{ answers: Array<{ qid: string } & Record<string, unknown>> }>(init);
    const list = db.runClarifications[id] ?? [];
    const resolved: db.RunClarification[] = [];
    for (const a of body.answers ?? []) {
      const c = list.find((x) => x.qid === a.qid);
      if (!c) continue;
      c.status = "answered";
      c.resolved_at = new Date().toISOString();
      // Pick everything except the qid into the answer payload.
      const answerPayload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(a)) {
        if (k !== "qid") answerPayload[k] = v;
      }
      c.answer = answerPayload as db.RunClarification["answer"];
      c.answered_by_user_id = db.USER_ID;
      c.answered_at = new Date().toISOString();
      resolved.push(c);
    }
    return ok(resolved);
  }
  mm = pathname.match(/^\/v1\/runs\/([^/]+)\/clarifications\/([^/]+)$/);
  if (mm && m === "GET") {
    const id = decodeURIComponent(mm[1]!);
    const qid = decodeURIComponent(mm[2]!);
    const c = (db.runClarifications[id] ?? []).find((x) => x.qid === qid);
    if (!c) return notFound("Clarification not found");
    return ok(c);
  }
  mm = pathname.match(/^\/v1\/runs\/([^/]+)\/phases\/([^/]+)\/clarify\/([^/]+)\/(skip|defer)$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    const qid = decodeURIComponent(mm[3]!);
    const action = mm[4]!;
    const c = (db.runClarifications[id] ?? []).find((x) => x.qid === qid);
    if (!c) return notFound("Clarification not found");
    if (action === "skip") {
      if (c.priority !== "optional") {
        return new MockResponse(409, { error: { code: "priority_not_optional", message: "Only optional questions can be skipped." } });
      }
      c.status = "skipped";
      c.resolved_at = new Date().toISOString();
    } else {
      if (c.defer_count >= 3) {
        return new MockResponse(409, { error: { code: "defer_cap_reached", message: "Max 3 defers per question." } });
      }
      c.defer_count += 1;
      // push expiry +24h
      if (c.expires_at) {
        c.expires_at = new Date(new Date(c.expires_at).getTime() + 24 * 60 * 60 * 1000).toISOString();
      }
    }
    return ok(c);
  }
  mm = pathname.match(/^\/v1\/runs\/([^/]+)\/phases\/([^/]+)\/clarify\/([^/]+)$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    const qid = decodeURIComponent(mm[3]!);
    const list = db.runClarifications[id];
    if (list) {
      const c = list.find((x) => x.qid === qid);
      if (c) {
        const body = parseBody<Record<string, unknown>>(init);
        c.status = "answered";
        c.resolved_at = new Date().toISOString();
        c.answer = body as db.RunClarification["answer"];
        c.answered_by_user_id = db.USER_ID;
        c.answered_at = new Date().toISOString();
        return ok(c);
      }
    }
    // Backward-compat with the older 'choice'-only endpoint.
    return ok({ accepted: true });
  }
  mm = pathname.match(/^\/v1\/runs\/([^/]+)\/phases\/([^/]+)\/regenerate$/);
  if (mm && m === "POST") {
    return ok({ accepted: true, new_version: `v${Math.floor(Math.random() * 9) + 2}` });
  }
  // F-04.13 — re-run phase endpoint
  mm = pathname.match(/^\/v1\/runs\/([^/]+)\/phases\/([^/]+):rerun$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    const phaseKey = decodeURIComponent(mm[2]!);
    const run = db.runs.find((r) => r.id === id);
    if (run?.phase_staleness?.[phaseKey]) {
      delete run.phase_staleness[phaseKey];
      if (Object.keys(run.phase_staleness).length === 0) {
        run.downstream_stale = false;
      }
    }
    return ok({ accepted: true, phase_key: phaseKey, status: "running" });
  }
  // F-04.8 — Improve endpoint
  mm = pathname.match(/^\/v1\/runs\/([^/]+)\/documents\/([^/]+):improve$/);
  if (mm && m === "POST") {
    const decisionId = `rd_${Date.now().toString(36)}`;
    return ok({
      decision_id: decisionId,
      estimated_completion_at: new Date(Date.now() + 45_000).toISOString(),
    }, 202);
  }
  // F-04.12 — comment composer (with optional as_decision)
  mm = pathname.match(/^\/v1\/runs\/([^/]+)\/documents\/([^/]+)\/comments$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    const body = parseBody<{ text: string; as_decision?: boolean; scope_section_anchor?: string | null }>(init);
    const decisionId = body.as_decision ? `rd_${Date.now().toString(36)}` : null;
    if (body.as_decision) {
      const list = (db.runDecisions[id] ??= []);
      list.unshift({
        id: decisionId!, who_name: db.me.display_name, who_avatar: "DU", who_kind: "human",
        phase: "spec", kind: "comment", title: body.text.split("\n")[0]!.slice(0, 80),
        body: body.text, source: "Comment composer · marked as decision",
        when: "just now", created_at: new Date().toISOString(),
        scope_kind: body.scope_section_anchor ? "section" : "global",
        scope_doc_id: body.scope_section_anchor ? null : null,
        scope_section_anchor: body.scope_section_anchor ?? null,
        scope_selection: null, supersedes_decision_id: null, status: "active",
        impact: "low", user_editable: true,
      });
    }
    return ok({
      id: `cmt_${Date.now().toString(36)}`,
      created_at: new Date().toISOString(),
      as_decision: !!body.as_decision,
      decision_id: decisionId,
    }, 201);
  }
  mm = pathname.match(/^\/v1\/runs\/([^/]+)\/gates\/([^/]+)\/(approve|reject)$/);
  if (mm && m === "POST") {
    return ok({ accepted: true });
  }

  // /v1/orgs/{id}/integrations
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/integrations$/);
  if (mm && m === "GET") return ok(db.integrations);

  // POST /v1/orgs/{id}/integrations/{provider}/{kind}/oauth/initiate
  // Canonical OAuth-start route (replaces the legacy
  // `/v1/integrations/{provider}/oauth/start` shape). Demo posture: read-only
  // so the FE shows a structured 403 toast rather than firing the popup.
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/integrations\/([^/]+)\/([^/]+)\/oauth\/initiate$/);
  if (mm && m === "POST") {
    return new MockResponse(403, {
      error: {
        code: "demo_mode",
        message: "OAuth flows are read-only in demo mode.",
      },
    });
  }

  // POST /v1/integrations/{id}/disconnect — FE-canonical disconnect
  // (header-scoped org). Demo posture: read-only.
  mm = pathname.match(/^\/v1\/integrations\/([^/]+)\/disconnect$/);
  if (mm && m === "POST") {
    return new MockResponse(403, {
      error: {
        code: "demo_mode",
        message: "Integrations are read-only in demo mode.",
      },
    });
  }

  // POST /v1/integrations/{id}/acknowledge-drift — FE-canonical drift ack
  // (header-scoped org). Demo posture: read-only.
  mm = pathname.match(/^\/v1\/integrations\/([^/]+)\/acknowledge-drift$/);
  if (mm && m === "POST") {
    return new MockResponse(403, {
      error: {
        code: "demo_mode",
        message: "Integrations are read-only in demo mode.",
      },
    });
  }

  // §5.14 r2 — GET /v1/orgs/{id}/integrations/{provider}/{kind}/schema
  // Mock-mode returns a synthetic JSON Schema for known providers so the
  // wizard exercises its dynamic-fields branch without the real BE. The
  // schemas mirror the live `config_schema` blocks in
  // athena-backend/athena/integrations/providers/*.py.
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/integrations\/([^/]+)\/([^/]+)\/schema$/);
  if (mm && m === "GET") {
    const provider = decodeURIComponent(mm[1]!);
    const schemas: Record<string, unknown> = {
      github: {
        type: "object",
        required: ["app_id"],
        properties: {
          app_id:           { type: "string", title: "GitHub App ID", description: "Found on your App's settings page." },
          app_slug:         { type: "string", title: "App slug", description: "Used to build the install URL." },
          installation_id:  { type: "string", title: "Installation ID", description: "Populated automatically after install.", readOnly: true },
          api_base:         { type: "string", title: "API base URL", description: "Override for GHES. Defaults to api.github.com.", format: "uri" },
        },
      },
      gitlab: {
        type: "object",
        required: ["client_id"],
        properties: {
          client_id: { type: "string", title: "OAuth Application ID", description: "Found at gitlab.com/-/profile/applications." },
          api_base:  { type: "string", title: "GitLab base URL",     description: "Default https://gitlab.com. Override for self-managed.", format: "uri" },
          group:     { type: "string", title: "Default group",       description: "Optional. Scopes the repo-listing to one group." },
        },
      },
      bitbucket: {
        type: "object",
        required: ["client_id"],
        properties: {
          client_id:    { type: "string", title: "OAuth client ID",      description: "Bitbucket Cloud workspace setting." },
          api_base:     { type: "string", title: "API base URL",         description: "Default https://api.bitbucket.org/2.0.", format: "uri" },
          workspace_id: { type: "string", title: "Workspace slug",       description: "Optional default workspace." },
        },
      },
    };
    const schema = schemas[provider];
    if (!schema) return notFound(`No integration registered for provider=${provider}.`);
    return ok(schema);
  }

  // §5.29.11 / B7.4 — GET /v1/orgs/{id}/integrations/{id}/available-repos
  // Returns a synthetic catalog so AttachRepoDialog has something to
  // render in mock mode. Mixes public/private/archived to exercise UI
  // edge cases.
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/integrations\/[^/]+\/available-repos$/);
  if (mm && m === "GET") {
    const today = new Date();
    const daysAgo = (n: number) => new Date(today.getTime() - n * 86400000).toISOString();
    return ok([
      { full_name: "lumen/inbox-web",           default_branch: "main",   private: false, description: "Customer inbox front-end (React 19, Vite).",          pushed_at: daysAgo(1),   archived: false },
      { full_name: "lumen/inbox-svc",           default_branch: "main",   private: true,  description: "Inbox routing service (Go).",                         pushed_at: daysAgo(2),   archived: false },
      { full_name: "lumen/triage-worker",       default_branch: "main",   private: true,  description: "AI triage worker (Python).",                          pushed_at: daysAgo(3),   archived: false },
      { full_name: "lumen/billing-svc",         default_branch: "main",   private: true,  description: "Stripe-backed billing service.",                      pushed_at: daysAgo(4),   archived: false },
      { full_name: "lumen/billing-web",         default_branch: "main",   private: false, description: "Billing portal SPA.",                                 pushed_at: daysAgo(5),   archived: false },
      { full_name: "lumen/finance-pipeline",    default_branch: "main",   private: true,  description: "Stripe → ledger ETL.",                                pushed_at: daysAgo(6),   archived: false },
      { full_name: "lumen/marketing-site",      default_branch: "main",   private: false, description: "Public marketing site (Next.js).",                    pushed_at: daysAgo(7),   archived: false },
      { full_name: "lumen/dbt-models",          default_branch: "main",   private: true,  description: "dbt models for the warehouse.",                       pushed_at: daysAgo(8),   archived: false },
      { full_name: "lumen/lake-ingest",         default_branch: "main",   private: true,  description: "S3 → Snowflake ingestion.",                           pushed_at: daysAgo(9),   archived: false },
      { full_name: "lumen/identity-svc",        default_branch: "main",   private: true,  description: "SSO/SCIM/JWT identity service.",                      pushed_at: daysAgo(10),  archived: false },
      { full_name: "lumen/design-tokens",       default_branch: "main",   private: false, description: "OKLCH design tokens + Tailwind preset.",              pushed_at: daysAgo(11),  archived: false },
      { full_name: "lumen/admin-web",           default_branch: "main",   private: true,  description: "Internal admin console.",                             pushed_at: daysAgo(12),  archived: false },
      { full_name: "lumen/infra",               default_branch: "main",   private: true,  description: "Terraform + Pulumi infra modules.",                   pushed_at: daysAgo(13),  archived: false },
      { full_name: "lumen/sandbox-experiments", default_branch: "main",   private: true,  description: "Internal experiments + spikes.",                      pushed_at: daysAgo(14),  archived: false },
      { full_name: "lumen/old-monolith",        default_branch: "master", private: true,  description: "Pre-2024 PHP monolith — retained read-only.",         pushed_at: daysAgo(180), archived: true },
    ]);
  }
  // DELETE /v1/orgs/{id}/integrations/{id} — disconnect via spec-compliant
  // verb (matches the BE `disconnect_integration` route). The legacy
  // POST `/disconnect` form is still handled below for back-compat.
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/integrations\/([^/]+)$/);
  if (mm && m === "DELETE") {
    const intId = decodeURIComponent(mm[1]!);
    const integ = db.integrations.find((i) => i.id === intId);
    if (!integ) return notFound("Integration not found");
    integ.status = "available";
    delete integ.connected_at;
    delete integ.last_sync;
    delete integ.connected_as;
    delete integ.scope;
    return new MockResponse(204, undefined);
  }
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/integrations\/([^/]+)\/(connect|disconnect|test)$/);
  if (mm) {
    const intId = decodeURIComponent(mm[1]!);
    const action = mm[2]!;
    const integ = db.integrations.find((i) => i.id === intId);
    if (!integ) return notFound("Integration not found");
    // Demo posture: connect / disconnect are state mutations we don't want
    // to expose in the read-only demo. `test` stays available because it's
    // a no-op read that just returns a synthetic latency.
    if ((action === "connect" || action === "disconnect") && m === "POST") {
      return new MockResponse(403, { error: { code: "demo_mode", message: "Integrations are read-only in demo mode." } });
    }
    if (action === "connect" && m === "POST") {
      integ.status = "connected";
      integ.connected_at = new Date().toISOString();
      integ.last_sync = "just now";

      // Auto-provision a paired MCP entry if this integration publishes one
      // and we don't already have a server linked to it. Status starts as
      // pending_review so a human enables the tools before agents use them.
      if (integ.provides_mcp && !db.mcpServers.find((s) => s.integration_id === integ.id)) {
        db.mcpServers.push({
          id: `mcp_${integ.id.replace("int_", "")}`,
          org_id: db.ORG_ID,
          slug: integ.id.replace("int_", ""),
          name: integ.name,
          source: "integration",
          integration_id: integ.id,
          transport: "http",
          endpoint_url: `https://mcp.${integ.id.replace("int_", "")}.com/v1`,
          auth: {
            method: integ.connect_kind === "oauth" ? "oauth" : "bearer",
            last_rotated_at: "just now",
            ...(integ.connect_kind === "oauth" ? { oauth_connected_as: integ.connected_as ?? integ.name } : { bearer_hint: "••• ending xxxx" }),
          },
          egress_policy: "any",
          version: "1.0.0",
          version_last_reviewed: new Date().toISOString().slice(0, 10),
          health: {
            status: "pending_review",
            status_message: "Auto-provisioned from a connected integration. Review and enable tools to start using it.",
            last_check_at: new Date().toISOString(),
            latency_p50_ms: 0,
            latency_p95_ms: 0,
            error_rate_24h: 0,
            uptime_30d: 1.0,
          },
          tools: [],
          created_by_user_id: db.me.id,
          created_at: new Date().toISOString(),
        });
      }
      return ok(integ);
    }
    if (action === "disconnect" && m === "POST") {
      integ.status = "available";
      delete integ.connected_at;
      delete integ.last_sync;
      delete integ.connected_as;
      delete integ.scope;
      return ok(integ);
    }
    if (action === "test" && m === "POST") {
      return ok({ ok: true, latency_ms: Math.floor(80 + Math.random() * 220), detail: `${integ.name} reachable.` });
    }
  }

  // /v1/mcp — MCP servers (org-scoped)
  if (pathname === "/v1/mcp" && m === "GET") return ok(db.mcpServers);
  if (pathname === "/v1/mcp" && m === "POST") {
    const body = parseBody<{
      name: string; source: "custom" | "integration"; integration_id?: string;
      transport: "http" | "sse" | "websocket"; endpoint_url: string;
      auth: { method: string; bearer_hint?: string; oauth_app_id?: string; oauth_connected_as?: string; mtls_cert_subject?: string; header_name?: string };
      egress_policy: "any" | "region_pinned" | "vpc_peered"; egress_region?: string;
      enabled_tools: Array<{ name: string; description?: string; approval: "none" | "per_session" | "per_call"; risk: "read" | "write" | "destructive" }>;
    }>(init);
    const id = `mcp_${body.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 24)}_${Date.now().toString(36)}`;
    const server: db.MockMcpServer = {
      id,
      org_id: db.ORG_ID,
      slug: body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32),
      name: body.name,
      source: body.source,
      ...(body.integration_id ? { integration_id: body.integration_id } : {}),
      transport: body.transport,
      endpoint_url: body.endpoint_url,
      auth: { ...body.auth, method: body.auth.method as db.MockMcpServer["auth"]["method"], last_rotated_at: "just now" },
      egress_policy: body.egress_policy,
      ...(body.egress_region ? { egress_region: body.egress_region } : {}),
      version: "1.0.0",
      version_last_reviewed: new Date().toISOString().slice(0, 10),
      health: {
        status: "connected",
        last_check_at: new Date().toISOString(),
        latency_p50_ms: Math.floor(60 + Math.random() * 180),
        latency_p95_ms: Math.floor(150 + Math.random() * 400),
        error_rate_24h: 0,
        uptime_30d: 1.0,
      },
      tools: body.enabled_tools.map((t, i) => ({
        id: `tl_${id.slice(4, 10)}_${i}`,
        name: t.name,
        description: t.description ?? `Tool ${t.name}`,
        enabled: true,
        approval: t.approval,
        risk: t.risk,
        usage_count_30d: 0,
        last_used_at: null,
      })),
      created_by_user_id: db.me.id,
      created_at: new Date().toISOString(),
    };
    db.mcpServers.push(server);
    return ok(server, 201);
  }
  mm = pathname.match(/^\/v1\/mcp\/discover$/);
  if (mm && m === "POST") {
    // Mocked introspection — returns a generic set of tools so the wizard can render.
    return ok({
      version: "1.0.0",
      tools: [
        { name: "search",        description: "Full-text search across the connected resource.",                  risk: "read" },
        { name: "get_item",      description: "Fetch a single item by id.",                                       risk: "read" },
        { name: "list_items",    description: "List items with paging + filters.",                                risk: "read" },
        { name: "create_item",   description: "Create a new item. Requires session-level approval.",              risk: "write" },
        { name: "update_item",   description: "Patch fields on an existing item.",                                risk: "write" },
        { name: "delete_item",   description: "Permanently remove an item. Requires per-call approval.",          risk: "destructive" },
      ],
    });
  }
  mm = pathname.match(/^\/v1\/mcp\/([^/]+)$/);
  if (mm) {
    const id = decodeURIComponent(mm[1]!);
    const srv = db.mcpServers.find((s) => s.id === id);
    if (!srv) return notFound("MCP server not found");
    if (m === "GET") return ok(srv);
    if (m === "PATCH") {
      const body = parseBody<Record<string, unknown>>(init);
      Object.assign(srv, body);
      return ok(srv);
    }
    if (m === "DELETE") {
      const idx = db.mcpServers.findIndex((s) => s.id === id);
      if (idx >= 0) db.mcpServers.splice(idx, 1);
      return noContent();
    }
    return methodNotAllowed();
  }
  mm = pathname.match(/^\/v1\/mcp\/([^/]+)\/test$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    const srv = db.mcpServers.find((s) => s.id === id);
    if (!srv) return notFound("MCP server not found");
    const ok_ = srv.health.status === "connected" || srv.health.status === "degraded";
    return ok({
      ok: ok_,
      latency_ms: srv.health.latency_p50_ms || Math.floor(120 + Math.random() * 280),
      tool_count: srv.tools.length,
      detail: ok_ ? `${srv.name} reachable. ${srv.tools.length} tools advertised.` : (srv.health.status_message ?? "Server unreachable."),
    });
  }
  mm = pathname.match(/^\/v1\/mcp\/([^/]+)\/acknowledge-drift$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    const srv = db.mcpServers.find((s) => s.id === id);
    if (!srv) return notFound("MCP server not found");
    srv.pending_drift = false;
    srv.version_last_reviewed = new Date().toISOString().slice(0, 10);
    srv.tools.forEach((t) => { t.added_since_review = false; });
    return ok(srv);
  }
  mm = pathname.match(/^\/v1\/mcp\/([^/]+)\/tools\/([^/]+)\/toggle$/);
  if (mm && m === "POST") {
    const match = mm;
    const srv = db.mcpServers.find((s) => s.id === decodeURIComponent(match[1]!));
    if (!srv) return notFound("MCP server not found");
    const tool = srv.tools.find((t) => t.id === decodeURIComponent(match[2]!));
    if (!tool) return notFound("Tool not found");
    const body = parseBody<{ enabled: boolean }>(init);
    tool.enabled = body.enabled;
    return ok(tool);
  }
  mm = pathname.match(/^\/v1\/mcp\/([^/]+)\/tools\/([^/]+)\/approval$/);
  if (mm && m === "POST") {
    const match = mm;
    const srv = db.mcpServers.find((s) => s.id === decodeURIComponent(match[1]!));
    if (!srv) return notFound("MCP server not found");
    const tool = srv.tools.find((t) => t.id === decodeURIComponent(match[2]!));
    if (!tool) return notFound("Tool not found");
    const body = parseBody<{ approval: "none" | "per_session" | "per_call" }>(init);
    tool.approval = body.approval;
    return ok(tool);
  }
  mm = pathname.match(/^\/v1\/mcp\/([^/]+)\/calls$/);
  if (mm && m === "GET") {
    const id = decodeURIComponent(mm[1]!);
    return ok(db.mcpRecentCalls[id] ?? []);
  }

  // §5.29.3 — /v1/billing/* — mock-mode billing surface. Returns the same
  // dev-unrestricted shape the live BE produces when the flag is on, so
  // the UI exercises the dev-mode empty state without a real backend.
  if (pathname === "/v1/billing/subscription" && m === "GET") {
    return ok({
      id: "00000000-0000-0000-0000-000000000001",
      stripe_subscription_id: "dev_mock0001",
      stripe_price_id: "dev_unrestricted",
      tier: "dev_unrestricted",
      status: "active",
      current_period_start: null,
      current_period_end: null,
      cancel_at_period_end: false,
    });
  }
  if (pathname === "/v1/billing/invoices" && m === "GET") return ok([]);
  if (pathname === "/v1/billing/payment-methods" && m === "GET") return ok([]);
  if (pathname === "/v1/billing/usage" && m === "GET") return ok([]);
  if (pathname === "/v1/billing/checkout-session" && m === "POST") {
    return new MockResponse(503, {
      error: { code: "dev_mode_active", message: "Stripe is disabled in dev mode." },
    });
  }
  if (pathname === "/v1/billing/portal-session" && m === "POST") {
    return new MockResponse(503, {
      error: { code: "dev_mode_active", message: "Stripe is disabled in dev mode." },
    });
  }
  // §7.9.5 row 2464 — price catalog fallback. FE call-sites catch a 404
  // and fall back to the constants in `lib/billing/price-catalog.ts`,
  // but in mock mode we serve the same values directly so designers
  // can verify the labels without a network round-trip.
  if (pathname === "/v1/billing/price-catalog" && m === "GET") {
    return ok({
      solo_base_usd: 19,
      solo_extra_seat_usd: 15,
      pro_base_usd: 99,
      pro_extra_seat_usd: 10,
    });
  }

  // §7.9.5 row 2463 — seat-billing fixtures keyed by org id. Three
  // fixtures the dispatcher requires: solo-at-cap, pro-with-headroom,
  // pro-at-cap. Falls back to a `pro-with-headroom`-shaped payload for
  // the demo org so the UI renders something sensible.
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/seats$/);
  if (mm && m === "GET") {
    const orgId = decodeURIComponent(mm[1]!);
    return ok(seatsFixtureForOrg(orgId));
  }
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/seats\/buy$/);
  if (mm && m === "POST") {
    const orgId = decodeURIComponent(mm[1]!);
    const body = parseBody<{ count: number }>(init);
    const count = Math.max(1, Math.min(50, Number(body.count) || 1));
    const fixture = seatsFixtureForOrg(orgId);
    return ok({
      additional_seats: fixture.additional_seats + count,
      total_seats: fixture.total_seats + count,
      stripe_invoice_url: `https://billing.stripe.com/p/mock-invoice/${orgId}/${count}`,
      tier: fixture.tier,
    });
  }
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/seats\/release$/);
  if (mm && m === "POST") {
    const orgId = decodeURIComponent(mm[1]!);
    const body = parseBody<{ count: number }>(init);
    const count = Math.max(1, Math.min(50, Number(body.count) || 1));
    const fixture = seatsFixtureForOrg(orgId);
    if (fixture.additional_seats - count < 0
        || fixture.total_seats - count < fixture.active_seats) {
      return new MockResponse(409, {
        error: {
          code: "seats_release_would_displace",
          message: "Releasing those seats would displace an active member.",
          metadata: {
            active_seats: fixture.active_seats,
            additional_seats: fixture.additional_seats,
          },
        },
      });
    }
    return ok({
      additional_seats: fixture.additional_seats - count,
      total_seats: fixture.total_seats - count,
      tier: fixture.tier,
    });
  }
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/billing\/upgrade$/);
  if (mm && m === "POST") {
    const orgId = decodeURIComponent(mm[1]!);
    return ok({
      checkout_url: `https://checkout.stripe.com/c/mock-upgrade/${orgId}`,
    });
  }
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/billing\/downgrade-to-solo$/);
  if (mm && m === "POST") {
    const orgId = decodeURIComponent(mm[1]!);
    const fixture = seatsFixtureForOrg(orgId);
    // 409 when more than one active member — matches the BE contract.
    if (fixture.active_seats > 1) {
      return new MockResponse(409, {
        error: {
          code: "downgrade_blocked_active_members",
          message: "Reduce the team to a single member before downgrading to Solo.",
          metadata: { active_seats: fixture.active_seats },
        },
      });
    }
    return ok({
      checkout_url: `https://checkout.stripe.com/c/mock-downgrade/${orgId}`,
    });
  }

  // §7.10.5 — Credit-balance fixtures keyed by org id. Returns one of
  // 7 named fixtures (free-no-credit, free-with-byo, solo-healthy,
  // solo-warning, solo-halted, solo-overage, solo-spend-cap-hit) so
  // designers exercise every meter / banner state.
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/credits$/);
  if (mm && m === "GET") {
    const orgId = decodeURIComponent(mm[1]!);
    return ok(creditFixtureForOrg(orgId));
  }
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/credits\/topup$/);
  if (mm && m === "POST") {
    const orgId = decodeURIComponent(mm[1]!);
    const body = parseBody<{ amount_usd: number }>(init);
    const amount = Math.max(10, Math.min(1000, Number(body.amount_usd) || 25));
    return ok({
      checkout_url: `https://checkout.stripe.com/c/mock_session_id/${orgId}/${amount}`,
    });
  }
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/credits\/configure-overage$/);
  if (mm && m === "POST") {
    const orgId = decodeURIComponent(mm[1]!);
    const body = parseBody<{ enabled: boolean; cap_usd: number | null }>(init);
    const fixture = creditFixtures[orgId];
    if (fixture) {
      fixture.overage_enabled = !!body.enabled;
      fixture.overage_cap_usd =
        body.cap_usd === null || body.cap_usd === undefined
          ? null
          : Number(body.cap_usd);
    }
    return noContent();
  }
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/spend-cap$/);
  if (mm && m === "POST") {
    const orgId = decodeURIComponent(mm[1]!);
    const body = parseBody<{ cap_usd: number | null }>(init);
    const fixture = creditFixtures[orgId];
    if (fixture) {
      fixture.hard_cap_usd =
        body.cap_usd === null || body.cap_usd === undefined
          ? null
          : Number(body.cap_usd);
    }
    return noContent();
  }

  // §7.9.7 — invitation preview. Token suffix drives the fixture so QA
  // can exercise both branches without a real BE: tokens ending in
  // "_full" surface `seats_available: false` (solo copy unless the
  // token includes "_pro"), everything else surfaces the open path.
  mm = pathname.match(/^\/v1\/invitations\/([^/]+)\/preview$/);
  if (mm && m === "GET") {
    const token = decodeURIComponent(mm[1]!);
    const seatsAvailable = !token.endsWith("_full");
    const isPro = token.includes("_pro");
    return ok({
      org_slug: "acme",
      org_name: "Acme Corp",
      role: "engineer",
      inviter_email: "owner@acme.com",
      seats_available: seatsAvailable,
      owner_email: "owner@acme.com",
      tier: isPro ? "pro" : "solo",
    });
  }

  // /v1/orgs/{id}/sso
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/sso$/);
  if (mm) {
    if (m === "GET") return ok(db.ssoConfig);
    if (m === "PATCH") {
      const body = parseBody<Record<string, unknown>>(init);
      Object.assign(db.ssoConfig, body);
      return ok(db.ssoConfig);
    }
    return methodNotAllowed();
  }
  if (pathname.match(/^\/v1\/orgs\/[^/]+\/sso\/scim\/sync$/) && m === "POST") {
    db.ssoConfig.scim_last_sync = "just now";
    return ok({
      users_provisioned: db.ssoConfig.scim_users_provisioned,
      groups_mapped: db.ssoConfig.scim_groups_mapped,
      last_sync: db.ssoConfig.scim_last_sync,
    });
  }

  // /v1/llm/providers/catalog (§7.8.1)
  if (pathname === "/v1/llm/providers/catalog" && m === "GET") {
    return ok(db.llmProviderCatalog);
  }

  // /v1/orgs/{id}/model-role-bindings (§7.8.1)
  // Specific paths first; PUT/DELETE on /{role} must come before the
  // catch-all model-providers/{id} matcher further down.
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/model-role-bindings$/);
  if (mm && m === "GET") return ok(db.modelRoleBindings);
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/model-role-bindings\/([^/]+)$/);
  if (mm) {
    const role = decodeURIComponent(mm[1]!);
    const canonical = new Set([
      "planner", "heavy-reasoner", "chat-fast", "long-context",
      "workhorse-cheap", "code-editor", "code-editor-cheap", "embeddings",
    ]);
    if (!canonical.has(role)) {
      return { status: 400, body: { error: { code: "invalid_argument", message: `Unknown role '${role}'.` } } };
    }
    if (m === "PUT") {
      const body = parseBody<{
        primary_provider: string; primary_model: string;
        fallback_chain: { provider: string; model: string }[];
      }>(init);
      // Catalog gate — every (provider, model) pair must resolve.
      const pairs = [
        { provider: body.primary_provider, model: body.primary_model },
        ...(body.fallback_chain ?? []),
      ];
      for (const p of pairs) {
        const provider = db.llmProviderCatalog.find((c) => c.id === p.provider);
        if (!provider) {
          return { status: 400, body: { error: { code: "invalid_argument", message: `Unknown provider '${p.provider}'.` } } };
        }
        if (!provider.models.some((mm2) => mm2.id === p.model)) {
          return { status: 400, body: { error: { code: "invalid_argument", message: `Model '${p.model}' is not exposed by '${p.provider}'.` } } };
        }
      }
      const existingIndex = db.modelRoleBindings.findIndex((b) => b.role === role);
      const next: db.MockRoleBinding = {
        role: role as db.MockRoleBinding["role"],
        primary_provider: body.primary_provider,
        primary_model: body.primary_model,
        fallback_chain: body.fallback_chain ?? [],
      };
      if (existingIndex >= 0) db.modelRoleBindings[existingIndex] = next;
      else db.modelRoleBindings.push(next);
      return ok(next);
    }
    if (m === "DELETE") {
      const index = db.modelRoleBindings.findIndex((b) => b.role === role);
      if (index < 0) return notFound(`No binding configured for role '${role}'.`);
      db.modelRoleBindings.splice(index, 1);
      return { status: 204, body: undefined };
    }
  }

  // /v1/orgs/{id}/model-providers
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/model-providers$/);
  if (mm && m === "GET") return ok(db.modelProviders);
  if (mm && m === "POST") {
    const body = parseBody<{
      provider: string; via?: string; region?: string;
      enabled_models?: string[]; residency_note?: string; api_key?: string;
    }>(init);
    const catalogEntry = db.llmProviderCatalog.find((c) => c.id === body.provider);
    if (!catalogEntry) {
      return { status: 400, body: { error: { code: "invalid_argument", message: `Unknown provider '${body.provider}'.` } } };
    }
    const nextId = `mp_${body.provider}_${Math.random().toString(36).slice(2, 8)}`;
    const created: db.MockModelProvider = {
      id: nextId,
      provider: body.provider,
      via: body.via ?? "direct",
      region: body.region ?? "us-east-1",
      status: "enabled",
      enabled_models: body.enabled_models ?? [],
      request_count: 0,
      cost_mtd: 0,
      residency_note: body.residency_note ?? "",
      has_api_key: typeof body.api_key === "string" && body.api_key.length >= 8,
      api_key_last4:
        typeof body.api_key === "string" && body.api_key.length >= 8
          ? body.api_key.slice(-4) : null,
    };
    db.modelProviders.push(created);
    return { status: 201, body: created };
  }
  // /v1/orgs/{id}/model-providers/{id}/usage (§7.8.1) — specific path
  // BEFORE the generic /{id} matcher below.
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/model-providers\/([^/]+)\/usage$/);
  if (mm && m === "GET") {
    const id = decodeURIComponent(mm[1]!);
    const provider = db.modelProviders.find((p) => p.id === id);
    if (!provider) return notFound("Provider not found");
    const seeded = db.providerUsageByModelProviderId[id];
    return ok({
      provider: provider.provider,
      range: "mtd",
      models: seeded?.models ?? [],
    });
  }
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/model-providers\/([^/]+)\/set-primary$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    const provider = db.modelProviders.find((p) => p.id === id);
    if (!provider) return notFound("Provider not found");
    db.modelProviders.forEach((p) => { p.status = p.id === id ? "primary" : (p.status === "primary" ? "available" : p.status); });
    return ok(provider);
  }
  // §7.8 — DELETE /api-key revokes the stored BYO key without
  // deleting the row. Must come BEFORE the generic /{id} matcher so
  // the more-specific path wins.
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/model-providers\/([^/]+)\/api-key$/);
  if (mm && m === "DELETE") {
    const id = decodeURIComponent(mm[1]!);
    const provider = db.modelProviders.find((p) => p.id === id);
    if (!provider) return notFound("Provider not found");
    provider.has_api_key = false;
    provider.api_key_last4 = null;
    return ok(provider);
  }
  // PATCH the provider — fields include enabled_models, residency_note,
  // status, api_key. Plaintext api_key is reduced to last4 for storage
  // (mirrors the BE: the plaintext never persists in the mock either).
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/model-providers\/([^/]+)$/);
  if (mm && m === "PATCH") {
    const id = decodeURIComponent(mm[1]!);
    const provider = db.modelProviders.find((p) => p.id === id);
    if (!provider) return notFound("Provider not found");
    const body = parseBody<Partial<{
      enabled_models: string[];
      residency_note: string;
      status: "available" | "enabled" | "disabled";
      api_key: string;
    }>>(init);
    if (Array.isArray(body.enabled_models)) provider.enabled_models = body.enabled_models;
    if (typeof body.residency_note === "string") provider.residency_note = body.residency_note;
    if (body.status === "available" || body.status === "enabled" || body.status === "disabled") {
      // The BE's `disabled` status doesn't map onto the FE's
      // narrower 3-state status enum — treat as "available" for
      // mock-mode parity.
      provider.status = body.status === "disabled" ? "available" : body.status;
    }
    if (typeof body.api_key === "string" && body.api_key.length >= 8) {
      provider.has_api_key = true;
      provider.api_key_last4 = body.api_key.slice(-4);
    }
    return ok(provider);
  }

  // /v1/orgs/{id}/privacy — partial PATCH matches the BE shape:
  // { redaction?, data_retention?, encryption?, residency? }.
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/privacy$/);
  if (mm) {
    if (m === "GET") return ok(db.privacySettings);
    if (m === "PATCH") {
      const body = parseBody<Partial<{
        redaction: typeof db.privacySettings.redaction;
        data_retention: typeof db.privacySettings.data_retention;
        encryption: typeof db.privacySettings.encryption;
        residency: typeof db.privacySettings.residency;
      }>>(init);
      if (body.redaction) db.privacySettings.redaction = { ...body.redaction, last_updated: "just now", last_updated_by: db.me.display_name };
      if (body.data_retention) db.privacySettings.data_retention = body.data_retention;
      if (body.encryption) db.privacySettings.encryption = body.encryption;
      if (body.residency) db.privacySettings.residency = body.residency;
      return ok(db.privacySettings);
    }
    return methodNotAllowed();
  }

  // /v1/inbox
  if (pathname === "/v1/inbox" && m === "GET") {
    const limit = Number(query.get("limit")) || 50;
    const unreadOnly = query.get("unread_only") === "true";
    let items = db.inboxItems.map((i) => ({
      ...i,
      created_at: new Date().toISOString(),
      read: false,
      task_id: i.task_id ?? null,
      actor_avatar: i.actor_avatar ?? null,
      phase: i.phase ?? null,
      to: i.to ?? null,
    }));
    if (unreadOnly) items = items.filter((i) => !i.read);
    return ok({ items: items.slice(0, limit), unread_count: items.filter((i) => !i.read).length, next_cursor: null });
  }
  mm = pathname.match(/^\/v1\/inbox\/([^/]+)\/read$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    const item = db.inboxItems.find((i) => i.id === id);
    if (!item) return notFound("Inbox item not found");
    return ok({ ...item, created_at: new Date().toISOString(), read: true, task_id: item.task_id ?? null, actor_avatar: item.actor_avatar ?? null, phase: item.phase ?? null, to: item.to ?? null });
  }
  if (pathname === "/v1/inbox/read-all" && m === "POST") {
    return ok({ marked: db.inboxItems.length });
  }

  // /v1/cost/summary
  if (pathname === "/v1/cost/summary" && m === "GET") return ok(db.costData);
  // §5.29.12 r1 — per-day burn-down split by model. Mock returns a
  // 7-day window for 3 models so the chart has shape in mock mode
  // even when `days` resolves to 30 or 90; the FE clamps to whatever
  // BE returns.
  if (pathname === "/v1/cost/per-model-burndown" && m === "GET") {
    const days = Math.min(Number(query.get("days")) || 30, 7);
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const range: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(today.getUTCDate() - i);
      range.push(fmt(d));
    }
    const series = [
      { model: "claude-opus-4-7",   base: 540, jitter: 70 },
      { model: "claude-sonnet-4-6", base: 210, jitter: 40 },
      { model: "claude-haiku-4-5",  base:  90, jitter: 15 },
    ];
    return ok({
      range_start: range[0]!,
      range_end: range[range.length - 1]!,
      models: series.map((s) => ({
        model: s.model,
        // Wire-shape: Decimal-as-string (Pydantic v2 default JSON
        // serialisation). The chart Number()-coerces at the call site.
        daily: range.map((day, i) => ({
          day,
          spent_usd: (s.base + Math.sin(i / 1.7) * s.jitter).toFixed(6),
        })),
      })),
    });
  }
  if (pathname.match(/^\/v1\/orgs\/[^/]+\/cost\/budget$/) && m === "PUT") {
    const body = parseBody<{ capability_id?: string; usd: number }>(init);
    if (body.capability_id) {
      const cap = db.costData.spend_by_capability.find((c) => c.id === body.capability_id);
      if (cap) cap.budget = body.usd;
    } else {
      db.costData.budget_usd = body.usd;
    }
    return ok(db.costData);
  }

  // /v1/skills
  if (pathname === "/v1/skills" && m === "GET") return ok(db.skills);
  if (pathname === "/v1/skills" && m === "POST") {
    const body = parseBody<{
      name?: string;
      slug?: string;
      description?: string | null;
      icon?: string | null;
      phases?: string[];
      version?: string;
      status?: "active" | "draft" | "archived";
      system_prompt?: string | null;
      knowledge_refs?: { kind: string; id: string; title: string }[];
    }>(init);
    if (!body.name || !body.slug) {
      return new MockResponse(400, { error: { code: "invalid_argument", message: "name and slug are required", field: "slug" } });
    }
    if (!/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(body.slug)) {
      return new MockResponse(400, { error: { code: "invalid_argument", message: "Invalid slug.", field: "slug" } });
    }
    if (db.skills.some((s) => s.slug === body.slug)) {
      return new MockResponse(409, { error: { code: "conflict", message: "Slug already exists.", field: "slug" } });
    }
    const id = `skl_${body.slug.replace(/[^a-z0-9]/g, "_")}_${Date.now().toString(36)}`;
    const created: db.MockSkill = {
      id,
      name: body.name,
      slug: body.slug,
      version: body.version ?? "0.1.0",
      status: body.status ?? "draft",
      description: body.description ?? "",
      icon: body.icon ?? "sparkles",
      phases: body.phases ?? [],
      attached_capabilities: [],
      usage_count: 0,
      last_used: "never",
    };
    db.skills.push(created);
    db.skillDetails[id] = {
      ...created,
      system_prompt: body.system_prompt ?? "",
      knowledge_refs: body.knowledge_refs ?? [],
      author: "you",
      last_updated: "just now",
    };
    return ok(created, 201);
  }
  mm = pathname.match(/^\/v1\/skills\/([^/]+)$/);
  if (mm && m === "GET") {
    const id = decodeURIComponent(mm[1]!);
    // Detail (rich) overrides list shape when available.
    const detail = db.skillDetails[id];
    if (detail) return ok(detail);
    const skill = db.skills.find((s) => s.id === id);
    if (!skill) return notFound("Skill not found");
    return ok(skill);
  }
  if (mm && m === "PATCH") {
    const id = decodeURIComponent(mm[1]!);
    const idx = db.skills.findIndex((s) => s.id === id);
    if (idx === -1) return notFound("Skill not found");
    const body = parseBody<{
      name?: string;
      description?: string | null;
      icon?: string | null;
      phases?: string[];
      version?: string;
      status?: "active" | "draft" | "archived";
      system_prompt?: string | null;
      knowledge_refs?: { kind: string; id: string; title: string }[];
    }>(init);
    const cur = db.skills[idx]!;
    const next: db.MockSkill = {
      ...cur,
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description ?? "" } : {}),
      ...(body.icon !== undefined ? { icon: body.icon ?? "sparkles" } : {}),
      ...(body.phases !== undefined ? { phases: body.phases } : {}),
      ...(body.version !== undefined ? { version: body.version } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
    };
    db.skills[idx] = next;
    const detail = db.skillDetails[id];
    if (detail) {
      db.skillDetails[id] = {
        ...detail,
        ...next,
        ...(body.system_prompt !== undefined ? { system_prompt: body.system_prompt ?? "" } : {}),
        ...(body.knowledge_refs !== undefined ? { knowledge_refs: body.knowledge_refs } : {}),
        last_updated: "just now",
      };
    }
    return ok(next);
  }
  if (mm && m === "DELETE") {
    const id = decodeURIComponent(mm[1]!);
    const idx = db.skills.findIndex((s) => s.id === id);
    if (idx === -1) return notFound("Skill not found");
    // Soft-delete: archive
    db.skills[idx] = { ...db.skills[idx]!, status: "archived" };
    return noContent();
  }
  // /v1/skills/{id}/attach/{capability_id}
  mm = pathname.match(/^\/v1\/skills\/([^/]+)\/attach\/([^/]+)$/);
  if (mm) {
    const skillId = decodeURIComponent(mm[1]!);
    const capId = decodeURIComponent(mm[2]!);
    const idx = db.skills.findIndex((s) => s.id === skillId);
    if (idx === -1) return notFound("Skill not found");
    const cur = db.skills[idx]!;
    if (m === "POST") {
      if (!cur.attached_capabilities.includes(capId)) {
        db.skills[idx] = { ...cur, attached_capabilities: [...cur.attached_capabilities, capId] };
      }
      const detail = db.skillDetails[skillId];
      if (detail && !detail.attached_capabilities.includes(capId)) {
        db.skillDetails[skillId] = { ...detail, attached_capabilities: [...detail.attached_capabilities, capId] };
      }
      return noContent();
    }
    if (m === "DELETE") {
      db.skills[idx] = { ...cur, attached_capabilities: cur.attached_capabilities.filter((c) => c !== capId) };
      const detail = db.skillDetails[skillId];
      if (detail) {
        db.skillDetails[skillId] = { ...detail, attached_capabilities: detail.attached_capabilities.filter((c) => c !== capId) };
      }
      return noContent();
    }
  }

  // /v1/activity
  if (pathname === "/v1/activity" && m === "GET") {
    const limit = Number(query.get("limit")) || 50;
    const capId = query.get("cap_id");
    let items = db.activity.map((a) => ({
      ...a,
      text_html: a.text,
      cap_id: a.cap_id ?? null,
      who_avatar: a.who_avatar ?? null,
      task_id: a.task_id ?? null,
    }));
    if (capId) items = items.filter((a) => a.cap_id === capId);
    return ok({ items: items.slice(0, limit), next_cursor: null });
  }

  // /v1/chat/threads
  if (pathname === "/v1/chat/threads" && m === "GET") {
    return ok(db.chatThreads.map((t) => ({
      id: t.id, title: t.title, scope: t.scope, preview: t.preview, updated_at: t.updated_at,
      created_task: t.created_task ?? null,
      flavour: t.flavour ?? null,
    })));
  }
  if (pathname === "/v1/chat/threads" && m === "POST") {
    // In demo mode the chat is read-only — new threads / sends are blocked at
    // the page layer, but if anything slips through we return 403 so the UI
    // doesn't pretend an unbacked thread exists.
    return new MockResponse(403, { error: { code: "demo_mode", message: "Chat is read-only in demo mode." } });
  }
  mm = pathname.match(/^\/v1\/chat\/threads\/([^/]+)$/);
  if (mm && m === "GET") {
    const id = decodeURIComponent(mm[1]!);
    const t = db.chatThreads.find((x) => x.id === id);
    if (!t) return notFound("Thread not found");
    const messages = t.messages.map((mes, i) => ({
      id: `${t.id}_${i}`,
      thread_id: t.id,
      role: mes.role,
      who: mes.who,
      avatar: mes.avatar,
      content: mes.content,
      created_at: new Date(Date.now() - (t.messages.length - i) * 60_000).toISOString(),
      citations: mes.citations ?? undefined,
    }));
    return ok({
      thread: {
        id: t.id, title: t.title, scope: t.scope, preview: t.preview, updated_at: t.updated_at,
        created_task: t.created_task ?? null,
        flavour: t.flavour ?? null,
      },
      messages,
    });
  }
  mm = pathname.match(/^\/v1\/chat\/threads\/([^/]+)\/messages$/);
  if (mm && m === "POST") {
    // Same as POST /v1/chat/threads: chat compose is disabled in demo mode.
    return new MockResponse(403, { error: { code: "demo_mode", message: "Chat compose is disabled in demo mode." } });
  }

  // /v1/knowledge/graph — supports `capability_id`, `repo_id`, `layer`, `limit`.
  // The mock has no real cap→repo attachment table, so `capability_id` is
  // accepted but unfiltered; `repo_id` + `layer` apply.
  if (pathname === "/v1/knowledge/graph" && m === "GET") {
    const repoId = query.get("repo_id");
    const layer = query.get("layer");
    const limitRaw = query.get("limit");
    const limit = limitRaw ? Math.max(10, Math.min(1000, Number(limitRaw) || 200)) : 200;
    const allNodes = db.knowledgeNodes
      .filter((n) => (repoId ? n.repo_id === repoId : true))
      .filter((n) => (layer ? n.layer === layer : true));
    const nodes = allNodes.slice(0, limit);
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = db.knowledgeEdges.filter((e) => nodeIds.has(e.source_id) && nodeIds.has(e.target_id));
    return ok({
      nodes,
      edges,
      totals: { nodes: db.knowledgeNodes.length, edges: db.knowledgeEdges.length },
      truncated: nodes.length >= limit,
    });
  }

  // /v1/knowledge/search — substring-match across mock knowledge fixtures.
  // The real BE wraps the agent retrieval tools (BM25 + cosine + RRF);
  // the mock keeps it cheap: a normalised substring filter over the
  // existing `knowledgeNodes` fixtures + `capabilityKnowledge[*].top_entities`
  // (the only entries the FE ships with a `summary`).
  if (pathname === "/v1/knowledge/search" && m === "GET") {
    const q = (query.get("q") || "").trim().toLowerCase();
    const scope = query.get("scope") || "org";
    const repoId = query.get("repo_id");
    const capId = query.get("capability_id");
    const kinds = query.getAll("kind");
    const layers = query.getAll("layer");
    const mode = (query.get("mode") || "hybrid") as "semantic" | "lexical" | "hybrid";
    const limit = Math.max(1, Math.min(50, Number(query.get("limit")) || 20));
    if (q.length < 2) {
      return new MockResponse(400, {
        error: { code: "invalid_argument", message: "q must be ≥2 chars.", field: "q" },
      });
    }
    const score_basis =
      mode === "semantic" ? "cosine_distance" : mode === "lexical" ? "ts_rank" : "rrf";
    // Build a unified pool: nodes (with synthesised summary from name+tags+layer)
    // + top_entities from capabilityKnowledge (carry real path + description).
    const nodePool = db.knowledgeNodes.map((n, i) => ({
      id: n.id,
      kind: "node" as const,
      node_kind: n.node_kind,
      overlay_kind: null,
      name: n.name,
      path: `${n.repo_id ?? "repo"}/${n.name}`,
      summary: `${n.name} (${n.node_kind}) — layer: ${n.layer ?? "—"}; tags: ${n.tags.join(", ") || "none"}.`,
      layer: n.layer,
      language: null,
      tags: n.tags,
      repo_id: n.repo_id,
      repo_full_name: n.repo_id ?? null,
      capability_id: null,
      // Deterministic per-row score; semantic = ascending distance, RRF/lexical = descending value.
      _seed: i,
    }));
    const topPool = Object.entries(db.capabilityKnowledge).flatMap(([cid, ck]) =>
      ck.top_entities.map((e) => ({
        id: e.id,
        kind: "node" as const,
        node_kind: e.kind,
        overlay_kind: null,
        name: e.name,
        path: e.path,
        summary: e.description,
        layer: null,
        language: null,
        tags: [] as string[],
        repo_id: null,
        repo_full_name: e.repo,
        capability_id: cid,
        _seed: 50, // dedup by id below; this only matters if absent from nodePool.
      })),
    );
    const seenIds = new Set(nodePool.map((p) => p.id));
    const merged = [...nodePool, ...topPool.filter((p) => !seenIds.has(p.id))];
    let matches = merged.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.summary.toLowerCase().includes(q) ||
      p.tags.some((t) => t.toLowerCase().includes(q)),
    );
    if (scope === "repo" && repoId) matches = matches.filter((p) => p.repo_id === repoId);
    if (scope === "capability" && capId) matches = matches.filter((p) => p.capability_id == null || p.capability_id === capId);
    if (kinds.length > 0)
      matches = matches.filter((p) => kinds.includes(p.node_kind));
    if (layers.length > 0)
      matches = matches.filter((p) => p.layer != null && layers.includes(p.layer));
    const matched = matches.length;
    const items = matches.slice(0, limit).map((p, i) => {
      const score =
        mode === "semantic"
          ? 0.10 + i * 0.03 // ascending distance (lower = better)
          : mode === "lexical"
          ? Math.max(0.05, 0.95 - i * 0.05) // descending rank
          : Math.max(0.005, 0.035 - i * 0.0015); // RRF — descending
      return {
        id: p.id,
        kind: p.kind,
        node_kind: p.node_kind,
        overlay_kind: p.overlay_kind,
        name: p.name,
        path: p.path,
        summary: p.summary.length > 280 ? p.summary.slice(0, 280) + "…" : p.summary,
        layer: p.layer,
        language: p.language,
        tags: p.tags,
        repo_id: p.repo_id,
        repo_full_name: p.repo_full_name,
        capability_id: p.capability_id,
        score,
        score_basis,
      };
    });
    return ok({
      query: q,
      mode,
      items,
      totals: { matched, returned: items.length },
      freshness: "fresh",
      search_quality: items.length === 0 ? "no_match" : matched > 0 && items[0]!.name.toLowerCase() === q ? "exact" : "fuzzy",
    });
  }

  // /v1/orgs/{id}/notifications/routing — GET + §5.29.5 PATCH-replace.
  if (pathname.match(/^\/v1\/orgs\/[^/]+\/notifications\/routing$/)) {
    if (m === "GET") return ok(notificationRules);
    if (m === "PATCH") {
      const body = parseBody<{ rules?: { event: string; channels: string[]; audience: string }[] }>(init);
      notificationRules = (body.rules ?? []).map((r) => ({
        event: r.event,
        channels: r.channels,
        audience: r.audience,
      }));
      return ok(notificationRules);
    }
  }

  // /v1/orgs/{id}/onboarding
  if (pathname.match(/^\/v1\/orgs\/[^/]+\/onboarding$/) && m === "GET") {
    return ok(db.onboardingState);
  }
  // §5.29.4 — POST /v1/orgs/{id}/onboarding/{step_id}/complete:
  // explicit-mark a step done (used by "Skip for now" in the wizard).
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/onboarding\/([^/]+)\/complete$/);
  if (mm && m === "POST") {
    const stepId = decodeURIComponent(mm[1]!);
    const valid = new Set(["connect_scm", "create_capability", "attach_repo", "first_run"]);
    if (!valid.has(stepId)) {
      return new MockResponse(400, { error: { code: "invalid_argument", message: `Unknown step '${stepId}'.` } });
    }
    db.onboardingState.steps = db.onboardingState.steps.map((s) =>
      s.id === stepId ? { ...s, status: "done" } : s,
    );
    const doneCount = db.onboardingState.steps.filter((s) => s.status === "done").length;
    db.onboardingState.current =
      doneCount === 0 ? "first_run" : doneCount === db.onboardingState.steps.length ? "complete" : "in_progress";
    return ok(db.onboardingState);
  }

  // §5.29.9 — cross-scope blueprint proposal queue.
  // GET /v1/blueprint-proposals?status=&scope_kind=&scope_id=
  if (pathname === "/v1/blueprint-proposals" && m === "GET") {
    const status = query.get("status") ?? "pending";
    const scopeKind = query.get("scope_kind");
    const scopeId = query.get("scope_id");
    const allBlueprints = collectAllBlueprintsForCrossScope();
    const merged: BlueprintSectionProposal[] = [];
    for (const { bp, scope_kind, scope_id } of allBlueprints) {
      if (scopeKind && scopeKind !== scope_kind) continue;
      if (scopeId && scopeId !== scope_id) continue;
      for (const p of bp.proposals) {
        if (status !== "all" && p.status !== status) continue;
        const section = bp.sections[p.section_key];
        merged.push({
          ...p,
          section_title: section?.title ?? p.section_key,
          blueprint_id: bp.toc.blueprint_id,
          scope_kind: scope_kind as "org" | "capability" | "repo",
        });
      }
    }
    merged.sort((a, b) => b.proposed_at.localeCompare(a.proposed_at));
    return ok(merged);
  }
  // POST /v1/blueprint-proposals/{id}/(accept|edit-accept|reject) — cross-scope
  mm = pathname.match(/^\/v1\/blueprint-proposals\/([^/]+)\/(accept|edit-accept|reject)$/);
  if (mm && m === "POST") {
    const pid = decodeURIComponent(mm[1]!);
    const action = mm[2]!;
    const all = collectAllBlueprintsForCrossScope();
    const hit = all.find(({ bp }) => bp.proposals.some((p) => p.id === pid));
    if (!hit) return notFound("Proposal not found");
    const proposal = hit.bp.proposals.find((p) => p.id === pid)!;
    if (proposal.status !== "pending") {
      return new MockResponse(409, { error: { code: "proposal_already_decided", message: `Proposal already ${proposal.status}.` } });
    }
    const section = hit.bp.sections[proposal.section_key];
    if (!section) return notFound("Section not found");
    if (action === "accept" || action === "edit-accept") {
      const body = action === "edit-accept"
        ? parseBody<{ body_markdown?: string; body_json?: Record<string, unknown> }>(init)
        : {};
      section.current_version += 1;
      section.body_markdown = body.body_markdown ?? proposal.proposed_body_markdown;
      section.body_json = body.body_json ?? proposal.proposed_body_json;
      if (proposal.proposed_summary) section.summary = proposal.proposed_summary;
      if (proposal.proposed_title) section.title = proposal.proposed_title;
      section.protected_from_ai = true;
      section.last_synced_at = new Date().toISOString();
      proposal.status = "accepted";
      recomputeBlueprintToc(hit.bp);
      return ok({ proposal_id: pid, section_id: proposal.blueprint_section_id, new_version: section.current_version });
    }
    if (action === "reject") {
      proposal.status = "rejected";
      recomputeBlueprintToc(hit.bp);
      const cooldown = new Date(Date.now() + 7 * 86400000).toISOString();
      return ok({ proposal_id: pid, section_id: proposal.blueprint_section_id, cooldown_until: cooldown });
    }
  }

  /* ------------------------------------------------------------ /v1/.../blueprint
   * Blueprint endpoints per knowledge-model.md §5.6. Three scopes share the same
   * route shape — we pattern-match `(capabilities|repos|orgs)` first then
   * dispatch on the trailing segment. Mutations mutate the in-memory store
   * so the FE sees changes reflected immediately. */
  {
    const blueprintMatch = pathname.match(/^\/v1\/(capabilities|repos|orgs)\/([^/]+)\/blueprint(?:(\/.+)|(:rebuild))?$/);
    if (blueprintMatch) {
      const scopeKind = blueprintMatch[1]! as "capabilities" | "repos" | "orgs";
      const scopeId = decodeURIComponent(blueprintMatch[2]!);
      const sub = blueprintMatch[3] ?? "";
      const rebuild = blueprintMatch[4] === ":rebuild";

      const store =
        scopeKind === "capabilities" ? db.blueprints.capabilities
        : scopeKind === "repos"      ? db.blueprints.repos
        :                              db.blueprints.orgs;
      const blueprint = store[scopeId];
      if (!blueprint) return notFound(`Blueprint not found for ${scopeKind}/${scopeId}`);

      // TOC: GET /v1/{scope}/{id}/blueprint
      if (sub === "" && !rebuild && m === "GET") {
        return ok(blueprint.toc);
      }

      // Force rebuild: POST /v1/{scope}/{id}/blueprint:rebuild
      if (rebuild && m === "POST") {
        const body = parseBody<{ confirm_slug: string }>(init);
        if (!body.confirm_slug) {
          return new MockResponse(422, {
            error: { code: "confirm_required", message: "confirm_slug is required for rebuild.", field: "confirm_slug" },
          });
        }
        blueprint.toc.status = "ready";
        blueprint.toc.last_synced_at = new Date().toISOString();
        return ok(blueprint.toc);
      }

      // List proposals: GET /v1/{scope}/{id}/blueprint/proposals
      if (sub === "/proposals" && m === "GET") {
        return ok(blueprint.proposals.filter((p) => p.status === "pending"));
      }

      // Proposal mutations: POST .../proposals/{pid}/(accept|edit-and-accept|reject)
      const proposalActionMatch = sub.match(/^\/proposals\/([^/]+)\/(accept|edit-and-accept|reject)$/);
      if (proposalActionMatch && m === "POST") {
        const pid = decodeURIComponent(proposalActionMatch[1]!);
        const action = proposalActionMatch[2]!;
        const proposal = blueprint.proposals.find((p) => p.id === pid);
        if (!proposal) return notFound("Proposal not found");
        if (proposal.status !== "pending") {
          return new MockResponse(409, {
            error: { code: "proposal_already_decided", message: `Proposal already ${proposal.status}.` },
          });
        }

        if (action === "accept") {
          const section = blueprint.sections[proposal.section_key];
          if (!section) return notFound("Section not found");
          section.current_version += 1;
          section.body_markdown = proposal.proposed_body_markdown;
          section.body_json = proposal.proposed_body_json;
          if (proposal.proposed_summary) section.summary = proposal.proposed_summary;
          if (proposal.proposed_title) section.title = proposal.proposed_title;
          section.protected_from_ai = true;
          section.last_synced_at = new Date().toISOString();
          proposal.status = "accepted";
          // Bump TOC mirror.
          recomputeBlueprintToc(blueprint);
          // Append revision.
          (blueprint.revisions[proposal.section_key] ??= []).push({
            id: `rev_${proposal.section_key}_${section.current_version}`,
            version: section.current_version,
            body_markdown: section.body_markdown,
            body_json: section.body_json,
            author_kind: "agent",
            author_id: "athena_blueprint_builder",
            change_note: `Accepted proposal ${proposal.id}: ${proposal.diff_summary}`,
            created_at: new Date().toISOString(),
          });
          return ok(section);
        }

        if (action === "edit-and-accept") {
          const body = parseBody<{ body_markdown?: string; body_json?: Record<string, unknown>; change_note?: string }>(init);
          const section = blueprint.sections[proposal.section_key];
          if (!section) return notFound("Section not found");
          section.current_version += 1;
          if (body.body_markdown !== undefined) section.body_markdown = body.body_markdown;
          if (body.body_json !== undefined) section.body_json = body.body_json;
          section.protected_from_ai = true;
          section.last_edited_by_user_id = db.me.id;
          section.last_synced_at = new Date().toISOString();
          proposal.status = "accepted";
          recomputeBlueprintToc(blueprint);
          (blueprint.revisions[proposal.section_key] ??= []).push({
            id: `rev_${proposal.section_key}_${section.current_version}`,
            version: section.current_version,
            body_markdown: section.body_markdown,
            body_json: section.body_json,
            author_kind: "human",
            author_id: db.me.id,
            change_note: body.change_note ?? `Edit-and-accept of proposal ${proposal.id}`,
            created_at: new Date().toISOString(),
          });
          return ok(section);
        }

        if (action === "reject") {
          proposal.status = "rejected";
          recomputeBlueprintToc(blueprint);
          return ok(proposal);
        }
      }

      // Section-scoped routes: /sections/{key}…
      const sectionMatch = sub.match(/^\/sections\/([^/]+)(.*)$/);
      if (sectionMatch) {
        const sectionKey = decodeURIComponent(sectionMatch[1]!);
        const tail = sectionMatch[2] ?? "";
        const section = blueprint.sections[sectionKey];
        if (!section) return notFound(`Section ${sectionKey} not found`);

        // GET /sections/{key}
        if (tail === "" && m === "GET") return ok(section);

        // PATCH /sections/{key} — user-edit
        if (tail === "" && m === "PATCH") {
          const body = parseBody<{
            body_markdown?: string; body_json?: Record<string, unknown>;
            title?: string; summary?: string; change_note?: string;
          }>(init);
          if (!section.editable || section.locked) {
            return new MockResponse(403, {
              error: { code: "section_not_editable", message: "This section is locked or derived and cannot be user-edited." },
            });
          }
          section.current_version += 1;
          if (body.body_markdown !== undefined) section.body_markdown = body.body_markdown;
          if (body.body_json !== undefined) section.body_json = body.body_json;
          if (body.title !== undefined) section.title = body.title;
          if (body.summary !== undefined) section.summary = body.summary;
          section.protected_from_ai = true;
          section.last_edited_by_user_id = db.me.id;
          section.last_synced_at = new Date().toISOString();
          recomputeBlueprintToc(blueprint);
          (blueprint.revisions[sectionKey] ??= []).push({
            id: `rev_${sectionKey}_${section.current_version}`,
            version: section.current_version,
            body_markdown: section.body_markdown,
            body_json: section.body_json,
            author_kind: "human",
            author_id: db.me.id,
            change_note: body.change_note ?? null,
            created_at: new Date().toISOString(),
          });
          return ok(section);
        }

        // GET /sections/{key}/revisions
        if (tail === "/revisions" && m === "GET") {
          return ok(blueprint.revisions[sectionKey] ?? []);
        }

        // POST /sections/{key}/(lock|unlock|regenerate)
        const actionMatch = tail.match(/^\/(lock|unlock|regenerate)$/);
        if (actionMatch && m === "POST") {
          const action = actionMatch[1]!;
          if (action === "lock") {
            section.locked = true;
          } else if (action === "unlock") {
            section.locked = false;
          } else {
            // Regenerate — for the mock, just bump the version and append a
            // synthetic revision. Real backend may instead create a proposal
            // if the section is `protected_from_ai`.
            section.current_version += 1;
            section.last_synced_at = new Date().toISOString();
            (blueprint.revisions[sectionKey] ??= []).push({
              id: `rev_${sectionKey}_${section.current_version}`,
              version: section.current_version,
              body_markdown: section.body_markdown,
              body_json: section.body_json,
              author_kind: "agent",
              author_id: "athena_blueprint_builder",
              change_note: "Section regenerated on user request",
              created_at: new Date().toISOString(),
            });
          }
          recomputeBlueprintToc(blueprint);
          return ok(section);
        }
      }

      return notFound(`Blueprint route not implemented: ${m} ${pathname}`);
    }
  }

  // /v1/rules
  if (pathname === "/v1/rules" && m === "GET") {
    return ok(db.rules);
  }
  mm = pathname.match(/^\/v1\/rules\/([^/]+)$/);
  if (mm && m === "GET") {
    const id = decodeURIComponent(mm[1]!);
    const rule = db.rules.find((r) => r.id === id);
    if (!rule) return notFound("Rule not found");
    return ok(rule);
  }

  // Mock auth fast-paths
  if (pathname === "/v1/mock-auth/sign-in" && m === "POST") {
    const body = parseBody<{ email: string; password?: string }>(init);
    if (!body.email) {
      return new MockResponse(422, { error: { code: "missing_field", message: "Email is required.", field: "email" } });
    }
    // Demo: accept any email; if it's the demo user's, return the demo user; otherwise create a new identity.
    return ok({
      access_token: `mock_at_${Math.random().toString(36).slice(2)}`,
      refresh_token: `mock_rt_${Math.random().toString(36).slice(2)}`,
      user_id: db.me.id,
      email: body.email,
      display_name: body.email === db.me.email ? db.me.display_name : body.email.split("@")[0]!,
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
  }
  if (pathname === "/v1/mock-auth/sign-up" && m === "POST") {
    const body = parseBody<{ email: string; password?: string; display_name: string }>(init);
    if (!body.email) {
      return new MockResponse(422, { error: { code: "missing_field", message: "Email is required.", field: "email" } });
    }
    if (!body.display_name) {
      return new MockResponse(422, { error: { code: "missing_field", message: "Name is required.", field: "display_name" } });
    }
    return ok({
      access_token: `mock_at_${Math.random().toString(36).slice(2)}`,
      refresh_token: `mock_rt_${Math.random().toString(36).slice(2)}`,
      user_id: db.me.id,
      email: body.email,
      display_name: body.display_name,
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    }, 201);
  }
  if (pathname === "/v1/mock-auth/sign-out" && m === "POST") {
    return ok({ accepted: true });
  }

  // Unhandled — log and 404
  console.warn(`[mock-server] unhandled ${m} ${pathname}`);
  return notFound(`Mock route not implemented: ${m} ${pathname}`);
}

/* ----------------------------------------------------------------------- */
/* §6.0 — repo file-browser mock helpers                                   */
/* ----------------------------------------------------------------------- */

/** Hash a string into a positive integer; deterministic across runs. Used
 *  to derive stable fake LOC / count values per file path so the mock UI
 *  doesn't flicker on re-render. */
function _hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Resolve a `repoKnowledge` fixture by `repo_id` alone. The keyspace is
 *  `${capId}::${repoId}` so we scan and return the first match. */
function _findRepoKnowledge(repoId: string): db.MockRepoKnowledge | null {
  for (const k of Object.values(db.repoKnowledge)) {
    if (k.repo_id === repoId) return k;
  }
  return null;
}

/** Synthesise a deterministic file-row list for a repo by projecting the
 *  existing `modules` + `configs` rows into the file-browser wire shape
 *  and topping up to `files_indexed` count with synthetic rows so the
 *  paging / counts feel real. */
function _buildFileRows(rk: db.MockRepoKnowledge): RepoFileRow[] {
  const language = rk.primary_language;
  const sha = rk.snapshot.indexed_sha || null;
  const seedFromModules: RepoFileRow[] = rk.modules.map((mod, i) => {
    const symbols = rk.top_symbols
      .filter((s) => s.path.startsWith(mod.path.replace(/:\d+:\d+$/, "")))
      .map((s) => s.name);
    const h = _hashStr(mod.path);
    return {
      id: `file_${rk.repo_id}_${i}`,
      path: mod.path,
      name: mod.path.split("/").pop() ?? mod.name,
      language,
      layer: mod.kind === "config" ? "Infra" : "Service",
      parser: h % 3 === 0 ? "tree_sitter" : h % 3 === 1 ? "regex" : "skipped",
      loc: 40 + (h % 480),
      symbols_count: symbols.length || (h % 12),
      imports_count: h % 22,
      todos_count: h % 7 === 0 ? 1 + (h % 3) : 0,
      summary_preview: mod.tier_summary.slice(0, 180),
      indexed_branch_sha: sha,
    };
  });
  const seedFromConfigs: RepoFileRow[] = rk.configs.map((cfg, i) => {
    const h = _hashStr(cfg.path);
    return {
      id: `file_${rk.repo_id}_cfg_${i}`,
      path: cfg.path,
      name: cfg.path.split("/").pop() ?? "",
      language: cfg.format,
      layer: "Infra",
      parser: "skipped",
      loc: 20 + (h % 120),
      symbols_count: 0,
      imports_count: 0,
      todos_count: 0,
      summary_preview: cfg.summary.slice(0, 180),
      indexed_branch_sha: sha,
    };
  });
  const all = [...seedFromModules, ...seedFromConfigs];
  // Top up to the reported `files_indexed` so the count chip lines up.
  const padCount = Math.max(0, Math.min(rk.files_indexed - all.length, 200));
  for (let i = 0; i < padCount; i++) {
    const path = `src/generated/file_${String(i + 1).padStart(3, "0")}.${language === "Python" ? "py" : "ts"}`;
    const h = _hashStr(path);
    all.push({
      id: `file_${rk.repo_id}_synth_${i}`,
      path,
      name: path.split("/").pop()!,
      language,
      layer: ["API", "Service", "Data", "UI", "Util", "Test"][h % 6] ?? "Service",
      parser: h % 3 === 0 ? "tree_sitter" : h % 3 === 1 ? "regex" : "skipped",
      loc: 20 + (h % 600),
      symbols_count: h % 18,
      imports_count: h % 30,
      todos_count: h % 11 === 0 ? 1 : 0,
      summary_preview: `Synthesised module ${i + 1} for ${rk.repo_full_name}.`,
      indexed_branch_sha: sha,
    });
  }
  return all.sort((a, b) => a.path.localeCompare(b.path));
}

function mockRepoFilesList(repoId: string, query: URLSearchParams): RepoFilesOut | MockResponse {
  const rk = _findRepoKnowledge(repoId);
  if (!rk) {
    return {
      repo_id: repoId, repo_full_name: "unknown/repo",
      items: [], next_cursor: null, has_more: false,
      totals: { files: 0, filtered: 0, by_language: {}, by_layer: {} },
    };
  }
  const all = _buildFileRows(rk);
  const pathPrefix = query.get("path_prefix");
  const language = query.get("language");
  const layer = query.get("layer");
  const q = (query.get("q") || "").toLowerCase();
  const limit = Math.min(200, Math.max(10, Number(query.get("limit") || 50)));
  const cursor = query.get("cursor");
  const cursorPath = cursor ? atob(cursor.replace(/_/g, "/").replace(/-/g, "+")) : null;
  let filtered = all;
  if (pathPrefix) filtered = filtered.filter((r) => r.path.startsWith(pathPrefix));
  if (language) filtered = filtered.filter((r) => r.language === language);
  if (layer) filtered = filtered.filter((r) => r.layer === layer);
  if (q) filtered = filtered.filter((r) => r.path.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  let windowed = filtered;
  if (cursorPath) windowed = windowed.filter((r) => r.path > cursorPath);
  const page = windowed.slice(0, limit);
  const hasMore = windowed.length > limit;
  const next = hasMore && page.length
    ? btoa(page[page.length - 1]!.path).replace(/\+/g, "-").replace(/\//g, "_")
    : null;
  const by_language: Record<string, number> = {};
  const by_layer: Record<string, number> = {};
  for (const r of all) {
    if (r.language) by_language[r.language] = (by_language[r.language] ?? 0) + 1;
    if (r.layer) by_layer[r.layer] = (by_layer[r.layer] ?? 0) + 1;
  }
  return {
    repo_id: rk.repo_id, repo_full_name: rk.repo_full_name,
    items: page, next_cursor: next, has_more: hasMore,
    totals: { files: all.length, filtered: filtered.length, by_language, by_layer },
  };
}

function mockRepoFileDetail(repoId: string, fileId: string): RepoFileDetail | null {
  const rk = _findRepoKnowledge(repoId);
  if (!rk) return null;
  const all = _buildFileRows(rk);
  const row = all.find((r) => r.id === fileId);
  if (!row) return null;
  const h = _hashStr(row.path);
  const symbolPool = rk.top_symbols.map((s) => s.name);
  const symbols = Array.from({ length: row.symbols_count }, (_, i) =>
    symbolPool[i % symbolPool.length] ?? `symbol_${i + 1}`,
  );
  const importPool = ["typing.Iterator", "datetime.datetime", "asyncio.gather",
    "fastapi.APIRouter", "sqlalchemy.select", "pydantic.BaseModel"];
  const imports = Array.from({ length: row.imports_count }, (_, i) => importPool[i % importPool.length]!);
  const todos = Array.from({ length: row.todos_count }, (_, i) =>
    `TODO: ${["tighten validation", "extract helper", "cover edge case"][(h + i) % 3]}`,
  );
  const summary =
    `${row.summary_preview}\n\nFull file body (mock). Hash=${h}. Path=${row.path}. ` +
    `This is the synthesised full summary, longer than the 180-char preview ` +
    `truncation so the drawer's Summary tab renders the unabridged text.`;
  return {
    id: row.id, repo_id: rk.repo_id, path: row.path, name: row.name,
    language: row.language, layer: row.layer, parser: row.parser, loc: row.loc,
    symbols, imports, todos, summary,
    indexed_branch_sha: row.indexed_branch_sha,
  };
}

/* ----------------------------------------------------------------------- */
/* §6.5.6 — FE-mirror mock helpers (BE tools, FE REST stubs)               */
/* ----------------------------------------------------------------------- */

/** Synthesise a deterministic graph-walk envelope so the dependents /
 *  dependencies / slice panels render real-looking data in mock mode.
 *  Pulls peer file rows from the same repo's `_buildFileRows()` set so
 *  click-through navigation works end-to-end. */
function mockFileGraphWalk(
  repoId: string,
  fileId: string,
  direction: "incoming" | "outgoing" | "slice",
  query: URLSearchParams,
): FileDependentsEnvelope {
  const rk = _findRepoKnowledge(repoId);
  if (!rk) {
    return {
      items: [], freshness: { kg_snapshot_id: null, last_indexed_at: null },
      search_quality: "empty",
    };
  }
  const all = _buildFileRows(rk);
  const seed = all.find((r) => r.id === fileId);
  if (!seed) {
    return {
      items: [], freshness: { kg_snapshot_id: null, last_indexed_at: null },
      search_quality: "empty",
    };
  }
  const maxHops = Math.max(1, Math.min(5, Number(query.get("max_hops") || (direction === "slice" ? 2 : 3))));
  const limit = Math.max(1, Math.min(100, Number(query.get("limit") || 30)));
  const peers = all.filter((r) => r.id !== fileId);
  // Deterministic hop assignment off the path hash so the same fileId
  // returns the same shape across renders. Cross-repo slot mixes in a
  // fake `repo_full_name` so the "(cross-repo)" highlight renders.
  const items: FileDependentsItem[] = [];
  for (let i = 0; i < Math.min(peers.length, limit); i++) {
    const peer = peers[i]!;
    const h = _hashStr(peer.path + fileId);
    const hop = (h % maxHops) + 1;
    const isCrossRepo = direction !== "slice" && i % 7 === 3;
    items.push({
      id: peer.id,
      node_kind: "file",
      path: peer.path,
      name: peer.name,
      summary: peer.summary_preview,
      tags: peer.language ? [peer.language] : [],
      layer: peer.layer,
      repo_full_name: isCrossRepo ? `acme/${rk.primary_language.toLowerCase()}-utils` : rk.repo_full_name,
      hops: hop,
    });
  }
  // Sort by hops then path so the tree groups predictably.
  items.sort((a, b) => (a.hops ?? 0) - (b.hops ?? 0) || a.path.localeCompare(b.path));
  return {
    items,
    total: items.length,
    freshness: {
      kg_snapshot_id: rk.snapshot.indexed_sha,
      last_indexed_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      commits_behind: 0,
      stale_but_usable: false,
    },
    search_quality: items.length >= 2 ? "exact" : items.length === 1 ? "fuzzy" : "empty",
  };
}

/** Synthesise file-content body for the content tab. The summary cache
 *  is the same string seeded into `mockRepoFileDetail`; `coverage_warning`
 *  is carried so the FE banner exercises in mock. */
function mockFileContent(
  repoId: string,
  fileId: string,
  query: URLSearchParams,
): RepoFileContentResponse | null {
  const detail = mockRepoFileDetail(repoId, fileId);
  if (!detail) return null;
  const allLines = detail.summary.split("\n");
  const total = allLines.length;
  const lineStartRaw = query.get("line_start");
  const lineEndRaw = query.get("line_end");
  let content: string;
  let citeStart = 1;
  let citeEnd = total;
  if (lineStartRaw !== null || lineEndRaw !== null) {
    const start = Math.max(1, Number(lineStartRaw || 1));
    const end = lineEndRaw ? Math.min(total, Number(lineEndRaw)) : total;
    content = allLines.slice(start - 1, end).join("\n");
    citeStart = start;
    citeEnd = end;
  } else {
    content = detail.summary;
  }
  return {
    content,
    language: detail.language,
    total_lines: total,
    indexed_branch_sha: detail.indexed_branch_sha,
    citation: `[node:${detail.id}:L${citeStart}-L${citeEnd}]`,
    truncated: false,
    coverage_warning:
      "only first 4000 chars per file scanned (partial summary)",
  };
}

/** Synthesise a grep envelope. Scans the synthesised file summaries
 *  with the Python-style regex compiled as a JS regex; bad patterns
 *  surface as a 400 via `MockResponse`. */
function mockRepoGrep(
  repoId: string,
  query: URLSearchParams,
): RepoGrepEnvelope | MockResponse {
  const pattern = query.get("pattern") || "";
  if (!pattern) {
    return new MockResponse(400, {
      error: { code: "invalid_argument", message: "pattern is required", field: "pattern" },
    });
  }
  let compiled: RegExp;
  try {
    compiled = new RegExp(pattern);
  } catch (exc) {
    return new MockResponse(400, {
      error: {
        code: "invalid_argument",
        message: `invalid regex: ${exc instanceof Error ? exc.message : String(exc)}`,
        field: "pattern",
      },
    });
  }
  const rk = _findRepoKnowledge(repoId);
  if (!rk) {
    return { items: [], total: 0, truncated: false, coverage_warning: null };
  }
  const all = _buildFileRows(rk);
  const maxResults = Math.max(1, Math.min(200, Number(query.get("max_results") || 50)));
  const pathGlob = query.get("path_glob");
  const items: RepoGrepResult[] = [];
  let truncated = false;
  for (const row of all) {
    if (pathGlob && !row.path.includes(pathGlob.replace(/%/g, ""))) continue;
    const body = row.summary_preview || "";
    const lines = body.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const match = compiled.exec(line);
      if (!match) continue;
      items.push({
        path: row.path,
        line: i + 1,
        match: match[0].slice(0, 200),
        context_before: i >= 1 ? (lines[i - 1] ?? "") : "",
        context_after: i < lines.length - 1 ? (lines[i + 1] ?? "") : "",
        citation: `[node:${row.id}:L${i + 1}-L${i + 1}]`,
      });
      if (items.length >= maxResults) {
        truncated = true;
        break;
      }
    }
    if (truncated) break;
  }
  return {
    items,
    total: items.length,
    truncated,
    coverage_warning:
      "only first 4000 chars per file scanned (partial summary)",
  };
}
