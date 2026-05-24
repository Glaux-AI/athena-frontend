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

const LATENCY_MS = 120;  // simulate network round-trip

export class MockResponse {
  constructor(
    public status: number,
    public body: unknown,
  ) {}
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

  // /v1/orgs/{id}/knowledge
  mm = pathname.match(/^\/v1\/orgs\/([^/]+)\/knowledge$/);
  if (mm && m === "GET") {
    const orgId = decodeURIComponent(mm[1]!);
    const k = db.orgKnowledge[orgId];
    if (!k) return notFound("Org knowledge not found");
    return ok(k);
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
      const inv: typeof db.invitations[number] = {
        id: `inv_${Date.now()}`,
        org_id: decodeURIComponent(mm[1]!),
        email: body.email,
        role: body.role,
        invited_by_user_id: db.me.id,
        expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        accepted_at: null,
        revoked_at: null,
        created_at: new Date().toISOString(),
      };
      db.invitations.push(inv);
      return ok(inv, 201);
    }
    return methodNotAllowed();
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

  // /v1/capabilities
  if (pathname === "/v1/capabilities" && m === "GET") {
    return ok(db.capabilities.map((c) => ({ ...c, repos: (db.capabilityRepos[c.id] ?? []).length })));
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
  mm = pathname.match(/^\/v1\/capabilities\/([^/]+)\/repos$/);
  if (mm) {
    const id = decodeURIComponent(mm[1]!);
    if (m === "GET") return ok(db.capabilityRepos[id] ?? []);
    if (m === "POST") {
      const body = parseBody<{ integration_id: string; repo_full_name: string; default_branch?: string }>(init);
      const repo = {
        id: `repo_${Date.now()}`,
        capability_id: id,
        integration_id: body.integration_id,
        repo_full_name: body.repo_full_name,
        default_branch: body.default_branch ?? "main",
        attached_by_user_id: db.me.id,
        created_at: new Date().toISOString(),
      };
      (db.capabilityRepos[id] ??= []).push(repo);
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

  // /v1/orgs/{id}/model-providers
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/model-providers$/);
  if (mm && m === "GET") return ok(db.modelProviders);
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/model-providers\/([^/]+)\/set-primary$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    const provider = db.modelProviders.find((p) => p.id === id);
    if (!provider) return notFound("Provider not found");
    db.modelProviders.forEach((p) => { p.status = p.id === id ? "primary" : (p.status === "primary" ? "available" : p.status); });
    return ok(provider);
  }

  // /v1/orgs/{id}/privacy
  mm = pathname.match(/^\/v1\/orgs\/[^/]+\/privacy$/);
  if (mm) {
    if (m === "GET") return ok(db.privacySettings);
    if (m === "PATCH") {
      const body = parseBody<{ redaction_class_id: string; enabled: boolean }>(init);
      const cls = db.privacySettings.redaction.classes.find((c) => c.id === body.redaction_class_id);
      if (!cls) return notFound("Redaction class not found");
      cls.enabled = body.enabled;
      db.privacySettings.redaction.last_updated = "just now";
      db.privacySettings.redaction.last_updated_by = db.me.display_name;
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

  // /v1/knowledge/graph
  if (pathname === "/v1/knowledge/graph" && m === "GET") {
    return ok({ nodes: db.knowledgeNodes, edges: db.knowledgeEdges });
  }

  // /v1/orgs/{id}/notifications/routing
  if (pathname.match(/^\/v1\/orgs\/[^/]+\/notifications\/routing$/) && m === "GET") {
    return ok([
      { event: "review_requested",       channels: ["email","slack"],            audience: "requested reviewers" },
      { event: "phase_approved",         channels: ["slack"],                    audience: "task watchers" },
      { event: "ci_failed_no_auto_heal", channels: ["email","slack","pagerduty"],audience: "task assignee + capability owners" },
      { event: "deploy_canary_breached", channels: ["slack","pagerduty"],        audience: "on-call rotation" },
      { event: "budget_threshold",       channels: ["email","slack"],            audience: "org admins" },
      { event: "@mention",               channels: ["slack","email"],            audience: "mentioned user" },
    ]);
  }

  // /v1/orgs/{id}/onboarding
  if (pathname.match(/^\/v1\/orgs\/[^/]+\/onboarding$/) && m === "GET") {
    return ok(db.onboardingState);
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
