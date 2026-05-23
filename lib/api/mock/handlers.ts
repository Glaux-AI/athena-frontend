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
    const body = parseBody<{ goal: string; capability_id?: string | null; intent?: "chat" | "generate_prd" }>(init);
    const id = `tsk_${Date.now()}`;
    const run = {
      id,
      goal: body.goal,
      intent: body.intent ?? null,
      status: "queued" as const,
      spent_usd: 0,
      created_at: new Date().toISOString(),
      output_summary: null,
      stream_url: `/v1/runs/${id}/events`,
      kind: "implement" as const,
      capability_id: body.capability_id ?? db.capabilities[0]!.id,
      current_phase: 0,
      progress: 0,
      assignee: "Athena",
      requested_by: db.me.display_name,
      source: { kind: "raw" as const, label: "Manual entry" },
      summary: body.goal,
    };
    db.runs.unshift(run);
    return ok(run, 201);
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
  mm = pathname.match(/^\/v1\/runs\/([^/]+)\/phases\/([^/]+)\/clarify\/([^/]+)$/);
  if (mm && m === "POST") {
    return ok({ accepted: true });
  }
  mm = pathname.match(/^\/v1\/runs\/([^/]+)\/phases\/([^/]+)\/regenerate$/);
  if (mm && m === "POST") {
    return ok({ accepted: true, new_version: `v${Math.floor(Math.random() * 9) + 2}` });
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
    return ok(db.chatThreads.map((t) => ({ id: t.id, title: t.title, scope: t.scope, preview: t.preview, updated_at: t.updated_at })));
  }
  if (pathname === "/v1/chat/threads" && m === "POST") {
    const body = parseBody<{ title: string; scope_kind: "capability" | "org"; scope_id?: string; initial_message: string }>(init);
    const thread = {
      id: `thr_${Date.now()}`,
      title: body.title,
      scope: body.scope_kind === "capability" ? { kind: "capability" as const, id: body.scope_id!, label: body.scope_id! } : { kind: "org" as const, label: "Acme Robotics · org-wide" },
      preview: body.initial_message.slice(0, 80),
      updated_at: "just now",
      messages: [{ role: "user" as const, who: db.me.display_name, avatar: "DU", content: body.initial_message }],
    };
    db.chatThreads.unshift(thread);
    const firstMessage = {
      id: `msg_${Date.now()}`,
      thread_id: thread.id,
      role: "user" as const,
      who: db.me.display_name,
      avatar: "DU",
      content: body.initial_message,
      created_at: new Date().toISOString(),
    };
    return ok({ thread: { id: thread.id, title: thread.title, scope: thread.scope, preview: thread.preview, updated_at: thread.updated_at }, first_message: firstMessage }, 201);
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
    }));
    return ok({ thread: { id: t.id, title: t.title, scope: t.scope, preview: t.preview, updated_at: t.updated_at }, messages });
  }
  mm = pathname.match(/^\/v1\/chat\/threads\/([^/]+)\/messages$/);
  if (mm && m === "POST") {
    const id = decodeURIComponent(mm[1]!);
    const t = db.chatThreads.find((x) => x.id === id);
    if (!t) return notFound("Thread not found");
    const body = parseBody<{ content: string }>(init);
    t.messages.push({ role: "user", who: db.me.display_name, avatar: "DU", content: body.content });
    // Synthetic agent reply.
    t.messages.push({ role: "assistant", who: "Athena", avatar: "AT", content: "Got it. I'll look into that and post a citation-backed answer in a moment." });
    t.updated_at = "just now";
    const reply = {
      id: `${t.id}_${t.messages.length - 1}`,
      thread_id: t.id,
      role: "assistant" as const,
      who: "Athena",
      avatar: "AT",
      content: t.messages[t.messages.length - 1]!.content,
      created_at: new Date().toISOString(),
    };
    return ok(reply, 201);
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
