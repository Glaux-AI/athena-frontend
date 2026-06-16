/**
 * Exact MCP-session cost metering (ADR-089) - the Claude Code usage hook.
 *
 * The coding agent's reasoning runs on the user's own subscription, invisible
 * to Athena (MCP has no usage channel). But Claude Code records the REAL,
 * API-reported token counts in its per-session transcript JSONL. This module
 * is the single source of truth for:
 *
 *   - `ATHENA_USAGE_WORKER` - a dependency-free Node script the user installs.
 *     A `Stop` / `SessionEnd` hook runs it after each turn. It:
 *       1. sums `message.usage` across the MAIN transcript AND the session's
 *          `subagents/*.jsonl` (Athena task work spawns sub-agents, whose
 *          tokens live in separate files - missing them would under-count);
 *       2. reads the task_id + stage the agent is driving from its OWN
 *          transcript's latest claim_stage/report_progress call, so usage
 *          attributes to the RIGHT task even when two sessions share a token;
 *       3. posts the running CUMULATIVE per-model totals to `report_usage`
 *          (the server records only the new increment - idempotent, so a
 *          retry or lost response never double-counts).
 *     Best-effort: it never throws to Claude Code and never blocks.
 *   - `buildUsageHookInstall(url, token)` - the copy-paste install command the
 *     wizard renders: it writes the worker + a `{url, token}` config (owner-
 *     only) and idempotently registers the two hooks in `~/.claude/settings.json`.
 *
 * Node is guaranteed present (Claude Code requires it), so a Node worker is the
 * most reliable cross-platform choice; `fetch` is built in on Node 18+.
 *
 * The worker is authored WITHOUT backticks, `${...}`, or backslashes so it
 * embeds cleanly inside this template literal and inside the shell heredoc.
 */

/** The worker script written to `~/.claude/athena/athena-usage.mjs`. */
export const ATHENA_USAGE_WORKER = `#!/usr/bin/env node
// Athena usage hook (ADR-089): reads THIS Claude Code session's transcript
// (main + sub-agents) and posts EXACT, cumulative per-model token usage to
// Athena's report_usage MCP tool, attributed to the task the agent claimed.
// It runs from a Stop / SessionEnd hook. Best-effort by contract: it never
// throws to Claude Code and never blocks; problems go to usage.log.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const NL = String.fromCharCode(10);
const DIR = path.join(os.homedir(), ".claude", "athena");
const CONFIG_PATH = path.join(DIR, "usage-config.json");
const STATE_PATH = path.join(DIR, "usage-state.json");
const LOG_PATH = path.join(DIR, "usage.log");

// MCP tool names whose call arguments tell us which task/stage the agent is
// driving. Claude Code names them mcp__<server>__<tool>, so match by suffix
// to stay robust to the server alias the user chose.
const CLAIM_SUFFIXES = ["claim_stage", "report_progress", "get_stage_context"];

function logLine(msg) {
  try { fs.appendFileSync(LOG_PATH, new Date().toISOString() + " " + msg + NL); }
  catch (e) { void e; }
}

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch (e) { void e; return fallback; }
}

function readStdin() {
  return new Promise(function (resolve) {
    let data = "";
    let done = false;
    const finish = function () { if (!done) { done = true; resolve(data); } };
    try {
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", function (c) { data += c; });
      process.stdin.on("end", finish);
      process.stdin.on("error", finish);
    } catch (e) { void e; finish(); }
    setTimeout(finish, 2000);
  });
}

function blankTotals() {
  return { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
}

function endsWithAny(name, suffixes) {
  for (let i = 0; i < suffixes.length; i++) {
    if (typeof name === "string" && name.indexOf(suffixes[i]) >= 0) return true;
  }
  return false;
}

// One pass over a transcript file: fold assistant message.usage into totals
// (per model, deduped by message id) and, when main===true, track the LATEST
// claim/progress tool call's task_id + stage (the active attribution hint).
function scanFile(file, totals, seen, main, hintRef) {
  let raw;
  try { raw = fs.readFileSync(file, "utf8"); }
  catch (e) { logLine("read failed " + file + ": " + e.message); return; }
  const lines = raw.split(NL);
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    let obj;
    try { obj = JSON.parse(t); } catch (e) { void e; continue; }
    const msg = obj && obj.message;
    if (!msg || msg.role !== "assistant") continue;
    if (msg.usage) {
      const id = msg.id || obj.uuid || "";
      if (!id || !seen[id]) {
        if (id) seen[id] = true;
        const u = msg.usage;
        const model = msg.model || obj.model || "unknown";
        const cur = totals[model] || blankTotals();
        cur.input += Number(u.input_tokens || 0);
        cur.output += Number(u.output_tokens || 0);
        cur.cacheRead += Number(u.cache_read_input_tokens || 0);
        cur.cacheCreation += Number(u.cache_creation_input_tokens || 0);
        totals[model] = cur;
      }
    }
    if (main && Array.isArray(msg.content)) {
      for (let b = 0; b < msg.content.length; b++) {
        const block = msg.content[b];
        if (!block || block.type !== "tool_use") continue;
        if (!endsWithAny(block.name, CLAIM_SUFFIXES)) continue;
        const inp = block.input || {};
        if (inp.task_id && inp.stage) {
          hintRef.value = { taskId: String(inp.task_id), stage: String(inp.stage) };
        }
      }
    }
  }
}

function subagentDir(transcriptPath) {
  // Claude Code writes sub-agent turns to <project>/<session-id>/subagents/*.jsonl
  // (sibling of the main <session-id>.jsonl).
  const base = path.basename(transcriptPath, ".jsonl");
  return path.join(path.dirname(transcriptPath), base, "subagents");
}

function collect(transcriptPath) {
  const totals = {};
  const seen = {};
  const hintRef = { value: null };
  scanFile(transcriptPath, totals, seen, true, hintRef);
  const subDir = subagentDir(transcriptPath);
  try {
    if (fs.existsSync(subDir)) {
      const files = fs.readdirSync(subDir);
      for (let i = 0; i < files.length; i++) {
        if (files[i].indexOf(".jsonl") < 0) continue;
        scanFile(path.join(subDir, files[i]), totals, seen, false, hintRef);
      }
    }
  } catch (e) { logLine("subagents scan failed: " + e.message); }
  return { totals: totals, hint: hintRef.value };
}

function sameTotals(a, b) {
  return a && b && a.input === b.input && a.output === b.output &&
    a.cacheRead === b.cacheRead && a.cacheCreation === b.cacheCreation;
}

async function postUsage(cfg, sessionId, model, cumulative, hint) {
  const args = {
    model: model,
    input_tokens: cumulative.input,
    output_tokens: cumulative.output,
    cache_read_tokens: cumulative.cacheRead,
    cache_creation_tokens: cumulative.cacheCreation,
    session_id: sessionId
  };
  if (hint) { args.task_id = hint.taskId; args.stage = hint.stage; }
  const payload = {
    jsonrpc: "2.0", id: 1, method: "tools/call",
    params: { name: "report_usage", arguments: args }
  };
  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, 6000);
  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": "Bearer " + cfg.token
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    });
    if (!res.ok) { logLine("http " + res.status + " for " + model); return false; }
    const json = await res.json();
    if (json && json.error) { logLine("rpc error: " + JSON.stringify(json.error)); return false; }
    // An isError tool result is a SERVER FAILURE (scope/exception) at HTTP 200,
    // NOT one of the handled recorded:false outcomes (those are normal
    // results). Treat it as un-acked so the watermark holds and we retry.
    if (json && json.result && json.result.isError === true) {
      logLine("tool error for " + model + ": " + JSON.stringify(json.result.content || ""));
      return false;
    }
    return true;
  } catch (e) {
    logLine("post failed for " + model + ": " + e.message);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const cfg = readJson(CONFIG_PATH, null);
  if (!cfg || !cfg.url || !cfg.token) { logLine("no usage-config.json - skipping"); return; }
  const input = await readStdin();
  let hook = {};
  try { hook = JSON.parse(input || "{}"); } catch (e) { void e; }
  const transcriptPath = hook.transcript_path;
  if (!transcriptPath) { logLine("no transcript_path on stdin - skipping"); return; }
  const sessionId = hook.session_id || path.basename(transcriptPath, ".jsonl") || "unknown";

  const collected = collect(transcriptPath);
  const totals = collected.totals;
  const hint = collected.hint;
  const state = readJson(STATE_PATH, {});
  const posted = state[sessionId] || {};
  const nextPosted = Object.assign({}, posted);
  let changed = false;

  const models = Object.keys(totals);
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const cur = totals[model];
    // Skip if this model's cumulative is unchanged since the last ACKed post
    // (the server is idempotent regardless; this just avoids a no-op call).
    if (sameTotals(posted[model], cur)) continue;
    const ok = await postUsage(cfg, sessionId, model, cur, hint);
    // Advance the local mark ONLY on a genuine ack (recorded true/false both
    // mean handled). Any transport failure or isError holds the mark so the
    // next Stop/SessionEnd fire re-posts the same cumulative (server dedups).
    if (ok) { nextPosted[model] = cur; changed = true; }
  }

  if (changed) {
    state[sessionId] = nextPosted;
    try {
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(STATE_PATH, JSON.stringify(state));
    } catch (e) { logLine("state write failed: " + e.message); }
  }
}

main().then(function () { process.exit(0); })
  .catch(function (e) { logLine("fatal: " + e.message); process.exit(0); });
`;

const HEREDOC = "ATHENA_USAGE_EOF";

// Idempotently registers the Stop + SessionEnd command hooks in
// ~/.claude/settings.json (only double quotes inside, so it survives the
// single-quoted shell wrapper; no backticks / no $ expansion).
const REGISTER_HOOKS =
  "node -e \"const fs=require('fs'),os=require('os'),p=require('path');" +
  "const f=p.join(os.homedir(),'.claude','settings.json');" +
  "let s={};try{s=JSON.parse(fs.readFileSync(f,'utf8'))}catch(e){}" +
  "s.hooks=s.hooks||{};" +
  "const cmd='node '+p.join(os.homedir(),'.claude','athena','athena-usage.mjs');" +
  "['Stop','SessionEnd'].forEach(function(ev){" +
  "var a=s.hooks[ev]=s.hooks[ev]||[];" +
  "if(JSON.stringify(a).indexOf('athena-usage.mjs')<0)" +
  "a.push({hooks:[{type:'command',command:cmd}]})});" +
  "fs.mkdirSync(p.dirname(f),{recursive:true});" +
  "fs.writeFileSync(f,JSON.stringify(s,null,2));" +
  "console.log('Athena usage hooks registered in '+f)\"";

/**
 * The copy-paste install command for the wizard's optional "exact token cost"
 * step. Writes the worker + a `{url, token}` config (chmod 600 - the token is
 * the same bearer PAT the connect step already stored) and registers the hooks.
 * Uses a POSIX heredoc (same shell assumption as every other wizard snippet -
 * run it in a macOS/Linux terminal or Git Bash/WSL on Windows).
 */
export function buildUsageHookInstall(url: string, token: string): string {
  const config = JSON.stringify({ url, token });
  return [
    "mkdir -p ~/.claude/athena && chmod 700 ~/.claude/athena",
    "cat > ~/.claude/athena/athena-usage.mjs <<'" + HEREDOC + "'",
    ATHENA_USAGE_WORKER,
    HEREDOC,
    "cat > ~/.claude/athena/usage-config.json <<'" + HEREDOC + "'",
    config,
    HEREDOC,
    "chmod 600 ~/.claude/athena/usage-config.json",
    REGISTER_HOOKS,
    'echo "Athena usage hook installed - exact token cost posts after each turn."',
  ].join("\n");
}
