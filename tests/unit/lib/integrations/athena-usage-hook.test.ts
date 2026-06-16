/**
 * The Claude Code usage hook installer (ADR-089). The worker script is
 * delivered to the user as embedded text inside a TS template literal and a
 * shell heredoc, so the highest risk is an escaping bug that makes the emitted
 * script fail to parse. These tests:
 *
 *   - assert the install command writes the worker + a {url, token} config
 *     (owner-only) and idempotently registers BOTH hooks;
 *   - assert the worker covers sub-agents, reads the task hint from its own
 *     transcript, posts cumulative totals, and treats an isError as a failure;
 *   - actually run `node --check` on the emitted worker, so an escaping
 *     regression (a stray backtick / `${` / backslash) is caught here.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ATHENA_USAGE_WORKER,
  buildUsageHookInstall,
} from "@/lib/integrations/athena-usage-hook";

const URL = "https://api.tryathena.dev/mcp";
const TOKEN = "ath_deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

describe("buildUsageHookInstall", () => {
  const snippet = buildUsageHookInstall(URL, TOKEN);

  it("writes the worker and a config carrying the url + token, owner-only", () => {
    expect(snippet).toContain("~/.claude/athena/athena-usage.mjs");
    expect(snippet).toContain("usage-config.json");
    expect(snippet).toContain(JSON.stringify({ url: URL, token: TOKEN }));
    // The secret config is locked down to the owner.
    expect(snippet).toContain("chmod 600 ~/.claude/athena/usage-config.json");
  });

  it("registers BOTH Stop and SessionEnd hooks, idempotently", () => {
    expect(snippet).toContain("settings.json");
    expect(snippet).toContain("Stop");
    expect(snippet).toContain("SessionEnd");
    expect(snippet).toContain("indexOf('athena-usage.mjs')<0");
  });

  it("targets the report_usage tool with cumulative + session + task hint", () => {
    expect(ATHENA_USAGE_WORKER).toContain('"report_usage"');
    expect(ATHENA_USAGE_WORKER).toContain("session_id");
    // The attribution hint read from the transcript's claim/progress calls.
    expect(ATHENA_USAGE_WORKER).toContain("claim_stage");
    expect(ATHENA_USAGE_WORKER).toContain("task_id");
    expect(ATHENA_USAGE_WORKER).toContain("cache_read_tokens");
  });

  it("covers sub-agent transcripts, not just the main thread", () => {
    expect(ATHENA_USAGE_WORKER).toContain("subagents");
  });

  it("treats an isError tool result as a failure (does not advance)", () => {
    expect(ATHENA_USAGE_WORKER).toContain("isError");
    expect(ATHENA_USAGE_WORKER).toContain("usage-state.json");
  });

  it("emits a syntactically valid Node script (node --check)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "athena-usage-"));
    const file = path.join(dir, "athena-usage.mjs");
    try {
      writeFileSync(file, ATHENA_USAGE_WORKER, "utf8");
      execFileSync("node", ["--check", file], { stdio: "pipe" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
