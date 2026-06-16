"use client";

/**
 * CodingAgentsSection - the "Coding agents (MCP)" rung of
 * /settings/integrations (third sibling under org integrations + AI
 * subscriptions).
 *
 * Lets the user connect their OWN coding agent - Claude Code, Codex CLI,
 * Cursor, Gemini CLI, Antigravity, Copilot CLI - to Athena's inbound MCP
 * server
 * so the agent can chat with org knowledge, create tasks, and execute
 * task stages end-to-end, with everything attributed and visible live in
 * the Athena UI. The agent's reasoning bills the user's existing AI
 * subscription; Athena serves data + state.
 *
 * Guided flow (one wizard, per-client):
 *   1 Pick your agent  →  2 Mint a token (scope bundle + expiry)
 *   →  3 Copy the one-time token  →  4 Run the connect snippet
 *   →  5 Install the /athena command  →  6 Verify with whoami.
 *
 * Naming: "coding agents", NEVER "mcp" in component/route names - the
 * `components/mcp/` namespace is the OUTBOUND doc-server registry.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  KeyRound,
  Plug,
  ShieldCheck,
  SquareTerminal,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { config } from "@/lib/config";
import {
  api,
  ApiError,
  type CodingAgentClient,
  type CodingAgentScopeBundle,
  type CodingAgentToken,
  type CodingAgentTokenMinted,
  type CodingAgentTokensOut,
} from "@/lib/api/client";

// ── Client catalog ────────────────────────────────────────────────────────────

interface ClientEntry {
  slug: CodingAgentClient;
  name: string;
  /** Step 1 - install + subscription prerequisites, per client. */
  prepare: readonly string[];
  /** Step 4 - the connect snippet (token + url substituted). */
  connect: (url: string, token: string) => string;
  connectNote?: string;
  /** Step 5 - the /athena command installer (or ambient stanza). */
  command: (url: string) => string;
  commandNote: string;
  /** Step 6 - how to check it works. */
  verify: string;
}

const ATHENA_COMMAND_BODY = `---
description: Work with Athena - org knowledge, tasks, and stages over MCP
allowed-tools: mcp__athena__*
---
This turn is Athena business. Fetch and follow the \`athena\` prompt from
the athena MCP server (it routes questions to the knowledge tools, "work
on ..." to the executor protocol, and "create a task ..." to create_task).
Start by calling the athena MCP tool \`whoami\` and confirming the
connection to the user. The request: $ARGUMENTS`;

const AGENTS_MD_STANZA = `## Athena (org knowledge + tasks)
Anything about this org's tasks, knowledge base, blueprints, decisions, or
work items goes through the \`athena\` MCP tools - never guess org state
from this checkout. Start with the \`whoami\` tool; to execute a task stage
follow the athena server's \`work\` prompt (claim_stage → get_stage_context
→ report_progress → submit). You can never approve gates or merge PRs -
say so when one is needed.`;

const CLAUDE_CODE_ENTRY: ClientEntry = {
  slug: "claude-code",
  name: "Claude Code",
  prepare: [
    "Install Claude Code and sign in with your Claude subscription: `npm install -g @anthropic-ai/claude-code`, then `claude` once to log in.",
    "Your plan pays for the agent's reasoning - Athena serves only data and state.",
  ],
  connect: (url, token) =>
    `claude mcp add --transport http athena ${url} --header "Authorization: Bearer ${token}"`,
  command: () =>
    `mkdir -p ~/.claude/commands && cat > ~/.claude/commands/athena.md <<'EOF'\n${ATHENA_COMMAND_BODY}\nEOF`,
  commandNote:
    "You get /athena in every session (plus the built-in /mcp__athena__… prompt commands automatically). The first /athena run also auto-installs exact token-cost tracking (a Stop/SessionEnd hook that reports your real per-stage tokens) - no setup, nothing to paste.",
  verify:
    "Run `claude`, type `/athena` (or `/mcp__athena__athena`) - it should greet you with your name, org, and ready work, and quietly enable exact cost tracking on the first run.",
};

const CLIENTS: readonly ClientEntry[] = [
  CLAUDE_CODE_ENTRY,
  {
    slug: "codex-cli",
    name: "Codex CLI",
    prepare: [
      "Install Codex and sign in with your ChatGPT plan: `npm install -g @openai/codex`, then `codex login`.",
      "Your plan pays for the agent's reasoning - Athena serves only data and state.",
    ],
    connect: (url, token) =>
      `codex mcp add athena --url ${url} --bearer-token-env-var ATHENA_MCP_TOKEN\n# put the token in your shell profile:\nexport ATHENA_MCP_TOKEN="${token}"`,
    connectNote:
      "Codex reads the token from the env var, so add the export to ~/.zshrc / ~/.bashrc.",
    command: () =>
      `mkdir -p ~/.codex/prompts && cat > ~/.codex/prompts/athena.md <<'EOF'\n${ATHENA_COMMAND_BODY}\nEOF`,
    commandNote: "You get /athena inside codex sessions.",
    verify:
      "Run `codex`, type `/athena` - it should greet you with your name, org, and ready work.",
  },
  {
    slug: "cursor",
    name: "Cursor",
    prepare: [
      "Install Cursor (cursor.com) and sign in with your Cursor subscription.",
      "Your plan pays for the agent's reasoning - Athena serves only data and state.",
    ],
    connect: (url, token) =>
      `# add to ~/.cursor/mcp.json (global) or <project>/.cursor/mcp.json\n{\n  "mcpServers": {\n    "athena": {\n      "url": "${url}",\n      "headers": { "Authorization": "Bearer ${token}" }\n    }\n  }\n}`,
    connectNote:
      "Merge into the existing mcpServers object if you have one, then enable athena under Cursor Settings → MCP (green dot = connected).",
    command: () =>
      `mkdir -p ~/.cursor/commands && cat > ~/.cursor/commands/athena.md <<'EOF'\nThis turn is Athena business. Fetch and follow the 'athena' prompt from\nthe athena MCP server (it routes questions to the knowledge tools, "work\non ..." to the executor protocol, and "create a task ..." to create_task).\nStart by calling the athena MCP tool whoami and confirming the connection\nto the user, then handle my request.\nEOF`,
    commandNote:
      "You get /athena in Cursor's agent chat - type /athena, then your request in the same message (Cursor commands have no argument templating).",
    verify:
      "Open Cursor's agent chat, send `/athena` - it should greet you with your name, org, and ready work.",
  },
  {
    slug: "gemini-cli",
    name: "Gemini CLI",
    prepare: [
      "Install the Gemini CLI and sign in: `npm install -g @google/gemini-cli`, then `gemini` once to log in.",
    ],
    connect: (url, token) =>
      `# add to ~/.gemini/settings.json (note: httpUrl, NOT url - url is the legacy SSE transport)\n{\n  "mcpServers": {\n    "athena": {\n      "httpUrl": "${url}",\n      "headers": { "Authorization": "Bearer ${token}" }\n    }\n  }\n}`,
    connectNote: "Merge into the existing mcpServers object if you have one.",
    command: () =>
      `mkdir -p ~/.gemini/commands && cat > ~/.gemini/commands/athena.toml <<'EOF'\ndescription = "Work with Athena - org knowledge + tasks over MCP"\nprompt = """\nThis turn is Athena business. Fetch and follow the 'athena' prompt from\nthe athena MCP server. Start with its whoami tool and confirm the\nconnection. The request: {{args}}\n"""\nEOF`,
    commandNote: "You get /athena inside gemini sessions.",
    verify:
      "Run `gemini`, type `/athena` - it should greet you with your name, org, and ready work.",
  },
  {
    slug: "antigravity",
    name: "Antigravity",
    prepare: [
      "Install Antigravity (`agy`) and sign in with your Google AI plan.",
    ],
    connect: (url, token) =>
      `# add to the Antigravity mcp_config.json (note: serverUrl here, not httpUrl)\n{\n  "mcpServers": {\n    "athena": {\n      "serverUrl": "${url}",\n      "headers": { "Authorization": "Bearer ${token}" }\n    }\n  }\n}`,
    connectNote:
      "Antigravity renamed the field to serverUrl - pasting a Gemini-CLI config silently does nothing.",
    command: () =>
      `# Antigravity imports Gemini CLI commands:\nmkdir -p ~/.gemini/commands && cat > ~/.gemini/commands/athena.toml <<'EOF'\ndescription = "Work with Athena - org knowledge + tasks over MCP"\nprompt = """\nThis turn is Athena business. Fetch and follow the 'athena' prompt from\nthe athena MCP server. Start with its whoami tool and confirm the\nconnection. The request: {{args}}\n"""\nEOF\nagy plugin import gemini`,
    commandNote: "Imported from the Gemini command via `agy plugin import gemini`.",
    verify: "Type `/athena` in an agy session - it should greet you with your org.",
  },
  {
    slug: "copilot-cli",
    name: "Copilot CLI",
    prepare: [
      "Install the Copilot CLI and sign in with your GitHub Copilot subscription.",
    ],
    connect: (url, token) =>
      `# add to ~/.copilot/mcp-config.json\n{\n  "mcpServers": {\n    "athena": {\n      "type": "http",\n      "url": "${url}",\n      "headers": { "Authorization": "Bearer ${token}" }\n    }\n  }\n}`,
    command: () => `# Copilot CLI has no custom slash commands - add this to your repo's AGENTS.md instead:\n${AGENTS_MD_STANZA}`,
    commandNote:
      "Copilot CLI has no user-defined slash commands; the AGENTS.md stanza routes Athena asks automatically.",
    verify:
      "Ask Copilot: \"use the athena whoami tool\" - it should report your user, org, and ready work.",
  },
];

// ── Section ───────────────────────────────────────────────────────────────────

export function CodingAgentsSection() {
  const [status, setStatus] = useState<CodingAgentTokensOut | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState<number>(0);

  const mutate = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        const result = await api.codingAgents.status();
        if (!cancelled) setStatus(result);
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof ApiError ? e.message : "Failed to load coding agents",
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [version]);

  const mcpUrl = status?.mcp_url ?? `${config.apiUrl}/mcp`;

  return (
    <Stack gap="3">
      <Stack gap="0.5">
        <h2 className="text-sm font-semibold">Coding agents (MCP)</h2>
        <p className="text-xs text-[var(--text-muted)]">
          Personal - connect <em>your</em> Claude Code, Codex, Cursor,
          Gemini, or Copilot to Athena&apos;s MCP server. Your agent can then answer
          from org knowledge, create tasks, and <strong>execute task
          stages end-to-end</strong> - attributed to it and visible live in
          the cockpit. Its reasoning runs on <em>your</em> AI subscription;
          Athena serves data and state.
        </p>
      </Stack>

      {error && (
        <Card role="alert" className="border-[var(--danger)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger-ink)]">{error}</p>
        </Card>
      )}

      {isLoading ? (
        <CodingAgentsSkeleton />
      ) : status === null ? null : !status.mcp_enabled ? (
        <Card data-testid="coding-agents-disabled">
          <Cluster gap="2" align="center">
            <Plug className="size-4 text-[var(--text-subtle)]" aria-hidden />
            <p className="text-sm text-[var(--text-muted)]">
              The MCP server is disabled on this deployment. Set{" "}
              <code className="font-mono text-xs">ATHENA_ENABLE_MCP_SERVER=true</code>{" "}
              on the API server to let coding agents connect.
            </p>
          </Cluster>
        </Card>
      ) : (
        <>
          <ConnectWizard mcpUrl={mcpUrl} onMinted={mutate} />
          <TokenTable tokens={status.tokens} onMutate={mutate} />
        </>
      )}
    </Stack>
  );
}

// ── Guided connect wizard ─────────────────────────────────────────────────────

const BUNDLES: readonly {
  value: CodingAgentScopeBundle;
  label: string;
  blurb: string;
}[] = [
  {
    value: "kb.read",
    label: "Knowledge only",
    blurb:
      "Search + read org knowledge, blueprints, decisions. Never spends org credit.",
  },
  {
    value: "work.read",
    label: "Knowledge + read tasks",
    blurb: "Also list tasks, read stage briefs, artifacts, threads.",
  },
  {
    value: "work.write",
    label: "Full agent (recommended)",
    blurb:
      "Also create tasks, claim + execute stages, and ask Athena's own agent (that one call uses org credit). Gates stay human-only, always.",
  },
];

function ConnectWizard({
  mcpUrl,
  onMinted,
}: {
  mcpUrl: string;
  onMinted: () => void;
}) {
  const [client, setClient] = useState<CodingAgentClient>("claude-code");
  const [bundle, setBundle] = useState<CodingAgentScopeBundle>("work.write");
  const [expiry, setExpiry] = useState<string>("90");
  const [minting, setMinting] = useState<boolean>(false);
  const [minted, setMinted] = useState<CodingAgentTokenMinted | null>(null);

  const entry = useMemo(
    () => CLIENTS.find((c) => c.slug === client) ?? CLAUDE_CODE_ENTRY,
    [client],
  );

  const handleMint = useCallback(async () => {
    setMinting(true);
    try {
      const result = await api.codingAgents.mint({
        client,
        scope_bundle: bundle,
        expires_in_days: expiry === "never" ? null : Number(expiry),
      });
      setMinted(result);
      onMinted();
      toast.success(`${entry.name} token created - finish the setup below.`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't create the token.");
    } finally {
      setMinting(false);
    }
  }, [client, bundle, expiry, entry.name, onMinted]);

  const token = minted?.token ?? "<paste-your-token-here>";

  return (
    <Card data-testid="coding-agents-wizard">
      <Stack gap="4">
        {/* Step 1 - pick the agent */}
        <WizardStep n={1} title="Pick your coding agent">
          <Cluster gap="2">
            {CLIENTS.map((c) => (
              <button
                key={c.slug}
                type="button"
                data-action={`pick-${c.slug}`}
                onClick={() => {
                  setClient(c.slug);
                  setMinted(null);
                }}
                className={
                  "rounded-full border px-3 py-1 text-xs font-medium transition " +
                  (client === c.slug
                    ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]")
                }
              >
                <Cluster gap="1" align="center">
                  <SquareTerminal className="size-3" aria-hidden />
                  {c.name}
                </Cluster>
              </button>
            ))}
          </Cluster>
          <ul className="mt-2 list-disc pl-5 text-xs text-[var(--text-muted)]">
            {entry.prepare.map((line) => (
              <li key={line}>
                <InlineCode text={line} />
              </li>
            ))}
          </ul>
        </WizardStep>

        {/* Step 2 - scope + mint */}
        <WizardStep n={2} title="Create its access token">
          <Stack gap="2">
            <Cluster gap="2">
              {BUNDLES.map((b) => (
                <button
                  key={b.value}
                  type="button"
                  data-action={`bundle-${b.value}`}
                  onClick={() => setBundle(b.value)}
                  title={b.blurb}
                  className={
                    "rounded-md border px-3 py-2 text-left text-xs transition " +
                    (bundle === b.value
                      ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                      : "border-[var(--border)] hover:border-[var(--border-strong)]")
                  }
                >
                  <span className="block font-medium">{b.label}</span>
                  <span className="block text-[var(--text-subtle)]">{b.blurb}</span>
                </button>
              ))}
            </Cluster>
            <Cluster gap="2" align="center">
              <label
                htmlFor="coding-agent-expiry"
                className="text-xs text-[var(--text-muted)]"
              >
                Expires
              </label>
              <select
                id="coding-agent-expiry"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs"
              >
                <option value="30">in 30 days</option>
                <option value="90">in 90 days</option>
                <option value="365">in 1 year</option>
                <option value="never">never</option>
              </select>
              <Button size="sm" onClick={handleMint} loading={minting} data-action="mint">
                <KeyRound className="size-3.5" aria-hidden />
                Create token
              </Button>
            </Cluster>
            <p className="text-[10px] text-[var(--text-subtle)]">
              Bound to you in this org. Revocable any time; it dies with your
              membership. Gate approvals, merges, and sync can never be
              granted to a token.
            </p>
          </Stack>
        </WizardStep>

        {/* Step 3 - one-time reveal */}
        {minted && (
          <Card
            variant="elevated"
            className="border-[var(--success)]"
            data-testid="coding-agent-token-reveal"
          >
            <Stack gap="2">
              <Cluster gap="2" align="center">
                <ShieldCheck className="size-4 text-[var(--success)]" aria-hidden />
                <p className="text-sm font-medium">
                  Token created - it&apos;s baked into the snippets below.
                </p>
              </Cluster>
              <code className="block break-all rounded-md border border-[var(--border)] bg-[var(--surface-3)] p-3 font-mono text-sm">
                {minted.token}
              </code>
              <p className="text-xs text-[var(--text-muted)]">
                This is the only time the full token is visible. The snippets
                below already include it - run them now.
              </p>
            </Stack>
          </Card>
        )}

        {/* Step 4 - connect */}
        <WizardStep n={3} title={`Connect ${entry.name} to Athena`}>
          <SnippetBlock
            label={`connect-${entry.slug}`}
            text={entry.connect(mcpUrl, token)}
          />
          {entry.connectNote && (
            <p className="mt-1 text-[10px] text-[var(--text-subtle)]">
              {entry.connectNote}
            </p>
          )}
        </WizardStep>

        {/* Step 5 - /athena command */}
        <WizardStep n={4} title="Install the /athena command">
          <SnippetBlock label={`command-${entry.slug}`} text={entry.command(mcpUrl)} />
          <p className="mt-1 text-[10px] text-[var(--text-subtle)]">
            {entry.commandNote} The command bodies live on the server, so
            behavior improvements ship without re-installing.
          </p>
        </WizardStep>

        {/* Step 6 - verify */}
        <WizardStep n={5} title="Verify">
          <p className="text-xs text-[var(--text-muted)]">{entry.verify}</p>
          <p className="mt-1 text-[10px] text-[var(--text-subtle)]">
            When it works a stage, the cockpit shows “{entry.name} working”
            live - progress, artifacts, and diffs land in the same review
            gates as Athena&apos;s own work.
          </p>
        </WizardStep>
      </Stack>
    </Card>
  );
}

function WizardStep({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Stack gap="1.5">
      <Cluster gap="2" align="center">
        <span className="flex size-5 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[10px] font-semibold text-[var(--primary)]">
          {n}
        </span>
        <h3 className="text-xs font-semibold">{title}</h3>
      </Cluster>
      <div className="pl-7">{children}</div>
    </Stack>
  );
}

/** Renders prose that may contain `inline code` backticks. */
function InlineCode({ text }: { text: string }) {
  const parts = text.split("`");
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <code key={i} className="rounded bg-[var(--surface-3)] px-1 font-mono text-[10px]">
            {part}
          </code>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function SnippetBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState<boolean>(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => toast.error("Couldn't copy - copy it manually."));
  }, [text]);
  return (
    <div className="relative" data-testid={`snippet-${label}`}>
      <pre className="overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--surface-3)] p-3 pr-10 font-mono text-[11px] leading-relaxed">
        {text}
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy to clipboard"
        className="absolute right-2 top-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-1 text-[var(--text-muted)] transition hover:text-[var(--text)]"
      >
        {copied ? (
          <Check className="size-3.5 text-[var(--success)]" aria-hidden />
        ) : (
          <Copy className="size-3.5" aria-hidden />
        )}
      </button>
    </div>
  );
}

// ── Token table ───────────────────────────────────────────────────────────────

function TokenTable({
  tokens,
  onMutate,
}: {
  tokens: CodingAgentToken[];
  onMutate: () => void;
}) {
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const handleRevoke = useCallback(
    async (t: CodingAgentToken) => {
      setRevokingId(t.id);
      try {
        await api.codingAgents.revoke(t.id);
        toast.success(`${t.name} token revoked.`);
        onMutate();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "Couldn't revoke.");
      } finally {
        setRevokingId(null);
      }
    },
    [onMutate],
  );

  if (tokens.length === 0) return null;
  return (
    <Card data-testid="coding-agent-token-table">
      <Stack gap="2">
        <h3 className="text-xs font-semibold">Your agent tokens</h3>
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-[var(--text-subtle)]">
              <th className="py-1 font-medium">Agent</th>
              <th className="py-1 font-medium">Token</th>
              <th className="py-1 font-medium">Access</th>
              <th className="py-1 font-medium">Last used</th>
              <th className="py-1 font-medium">Status</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => {
              const expired =
                t.expires_at !== null && new Date(t.expires_at) < new Date();
              const status = t.revoked_at
                ? "Revoked"
                : expired
                  ? "Expired"
                  : "Active";
              return (
                <tr key={t.id} className="border-t border-[var(--border)]">
                  <td className="py-1.5">{t.name}</td>
                  <td className="py-1.5 font-mono text-[var(--text-muted)]">
                    {t.prefix}…
                  </td>
                  <td className="py-1.5 text-[var(--text-muted)]">{t.scope_bundle}</td>
                  <td className="py-1.5 text-[var(--text-muted)]">
                    {t.last_used_at ? formatRelative(t.last_used_at) : "never"}
                  </td>
                  <td className="py-1.5">
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-[10px] font-medium " +
                        (status === "Active"
                          ? "bg-[var(--success-soft)] text-[var(--success-ink)]"
                          : "border border-[var(--border)] text-[var(--text-subtle)]")
                      }
                    >
                      {status}
                    </span>
                  </td>
                  <td className="py-1.5 text-right">
                    {!t.revoked_at && (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={revokingId === t.id}
                        onClick={() => void handleRevoke(t)}
                        data-action="revoke"
                      >
                        Revoke
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Stack>
    </Card>
  );
}

function CodingAgentsSkeleton() {
  return (
    <Card aria-hidden>
      <Stack gap="3">
        <div className="h-4 w-48 animate-pulse rounded bg-[var(--surface-3)]" />
        <div className="h-8 w-full animate-pulse rounded bg-[var(--surface-3)]" />
        <div className="h-20 w-full animate-pulse rounded bg-[var(--surface-3)]" />
      </Stack>
    </Card>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
