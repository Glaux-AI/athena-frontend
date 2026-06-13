"use client";

/**
 * AiSubscriptionsSection - the personal "AI subscriptions" rung of
 * /settings/integrations.
 *
 * Closed catalog: two connectable providers today (Claude Pro/Max via the
 * Claude Code CLI, ChatGPT via the Codex CLI) plus honest "planned" cards
 * for GitHub Copilot and Cursor so users know where the lineup is going.
 * Connections are PERSONAL - they belong to the signed-in user, work in
 * chat only (no workspace tools), and draw on the user's own plan, never
 * org credits. The section says all of that up front so there is no
 * ambiguity about when a subscription applies.
 *
 * Flow: Connect → paste the CLI credential → server live-verifies through
 * the vendor binary → card flips to Connected (verified timestamp + hint)
 * → models appear under Settings → AI models → "Your subscriptions" and in
 * the chat composer's model picker.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Bot,
  Sparkles,
  SquareTerminal,
  MousePointer2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { useSession } from "@/lib/session/SessionProvider";
import { api, ApiError, type AiSubscription } from "@/lib/api/client";
import {
  AiSubscriptionConnectModal,
  type ConnectInstructions,
} from "@/components/integrations/ai-subscription-connect-modal";

interface SubscriptionProviderEntry {
  provider: string;
  name: string;
  icon: LucideIcon;
  blurb: string;
  /** Present → connectable today; absent → rendered as a planned card. */
  instructions?: ConnectInstructions;
  /** One-line reason shown on planned cards. */
  plannedNote?: string;
}

/** Closed FE catalog - mirrors the BE `subscription: True` providers plus
 *  the planned lineup. Adding a provider = one entry here + a BE adapter. */
const SUBSCRIPTION_CATALOG: readonly SubscriptionProviderEntry[] = [
  {
    provider: "claude-subscription",
    name: "Claude (Pro / Max)",
    icon: Sparkles,
    blurb:
      "Use your own Claude plan for chat. Runs through Claude Code on the server, signed in as you.",
    instructions: {
      steps: [
        "On your machine, install Claude Code and sign in with your Claude account.",
        "Run `claude setup-token` in a terminal - it prints a long-lived token.",
        "Paste the token below. Athena verifies it with a live call before saving.",
      ],
      credentialLabel: "Claude Code OAuth token",
      placeholder: "sk-ant-oat01-…",
    },
  },
  {
    provider: "codex-subscription",
    name: "ChatGPT (Codex)",
    icon: Bot,
    blurb:
      "Use your ChatGPT Plus/Pro plan for chat. Runs through the Codex CLI, signed in as you.",
    instructions: {
      steps: [
        "On your machine, install the Codex CLI and run `codex login` (sign in with ChatGPT).",
        "Open ~/.codex/auth.json and copy the FULL file contents.",
        "Paste it below. Athena verifies the sign-in before saving; tokens auto-refresh afterwards.",
      ],
      credentialLabel: "Contents of ~/.codex/auth.json",
      placeholder: '{ "openai_api_key": null, "tokens": { … } }',
    },
  },
  {
    provider: "copilot-subscription",
    name: "GitHub Copilot",
    icon: SquareTerminal,
    blurb: "Use your Copilot plan via the Copilot SDK.",
    plannedNote: "Planned - the Copilot SDK integration is on the roadmap.",
  },
  {
    provider: "cursor-subscription",
    name: "Cursor",
    icon: MousePointer2,
    blurb: "Use your Cursor plan's models.",
    plannedNote:
      "Planned - Cursor has no server-side surface; arrives with the Athena local app.",
  },
] as const;

export function AiSubscriptionsSection() {
  const { me } = useSession();
  const [rows, setRows] = useState<readonly AiSubscription[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState<number>(0);

  const mutate = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const result = await api.aiSubscriptions.list();
        if (!cancelled) setRows(result);
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof ApiError ? e.message : "Failed to load AI subscriptions",
        );
        setRows([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [version]);

  return (
    <Stack gap="3">
      <Stack gap="0.5">
        <h2 className="text-sm font-semibold">AI subscriptions</h2>
        <p className="text-xs text-[var(--text-muted)]">
          {me?.features.subscriptionMcpBridge ? (
            <>
              Personal - these connect <em>your</em> Claude or ChatGPT plan
              and work for you alone in chat,{" "}
              <strong>grounded in workspace knowledge via MCP</strong> (task
              stages still run on Athena-hosted models). Usage draws on your
              plan, never org credits.
            </>
          ) : (
            <>
              Personal - these connect <em>your</em> Claude or ChatGPT plan,
              work for you alone, and power <strong>chat only</strong>{" "}
              (subscription models can&apos;t browse workspace knowledge).
              Usage draws on your plan, never org credits.
            </>
          )}
        </p>
      </Stack>

      {error && (
        <Card role="alert" className="border-[var(--danger)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger-ink)]">{error}</p>
        </Card>
      )}

      <Grid cols="auto-fit-280" gap="3">
        {SUBSCRIPTION_CATALOG.map((entry) =>
          isLoading ? (
            <SubscriptionCardSkeleton key={entry.provider} />
          ) : (
            <AiSubscriptionCard
              key={entry.provider}
              entry={entry}
              row={rows.find((r) => r.provider === entry.provider) ?? null}
              onMutate={mutate}
            />
          ),
        )}
      </Grid>
    </Stack>
  );
}

function AiSubscriptionCard({
  entry,
  row,
  onMutate,
}: {
  entry: SubscriptionProviderEntry;
  row: AiSubscription | null;
  onMutate: () => void;
}) {
  const [showConnect, setShowConnect] = useState<boolean>(false);
  const [showDisconnect, setShowDisconnect] = useState<boolean>(false);
  const [verifying, setVerifying] = useState<boolean>(false);
  const Icon = entry.icon;
  const planned = entry.instructions === undefined;
  const connected = row?.status === "connected";

  const handleVerify = useCallback(async () => {
    setVerifying(true);
    try {
      const updated = await api.aiSubscriptions.verify(entry.provider);
      if (updated.status === "connected") {
        toast.success(`${entry.name} verified.`);
      } else {
        toast.error(updated.last_error ?? `${entry.name} failed verification.`);
      }
      onMutate();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Verification failed.");
    } finally {
      setVerifying(false);
    }
  }, [entry.provider, entry.name, onMutate]);

  return (
    <Card
      id={`provider-${entry.provider}`}
      data-testid={`ai-subscription-card-${entry.provider}`}
      className="scroll-mt-20"
    >
      <Stack gap="3">
        <Cluster justify="between" align="start">
          <Cluster gap="2" align="center">
            <div
              className="flex size-10 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)] shadow-[var(--inner-highlight)]"
              aria-hidden
            >
              <Icon className="size-5 text-[var(--text)]" />
            </div>
            <Stack gap="0">
              <span className="text-sm font-semibold">{entry.name}</span>
              <span className="text-xs text-[var(--text-muted)]">
                {row?.last_verified_at
                  ? `Verified ${formatRelative(row.last_verified_at)}`
                  : planned
                    ? "Not available yet"
                    : "Not connected"}
              </span>
            </Stack>
          </Cluster>
          <StatusPill row={row} planned={planned} />
        </Cluster>

        <p className="line-clamp-2 text-sm text-[var(--text-muted)]">
          {entry.blurb}
        </p>

        {row?.status === "error" && row.last_error && (
          <p
            role="alert"
            className="rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger-ink)]"
          >
            {row.last_error}
          </p>
        )}

        {planned ? (
          <p className="text-xs text-[var(--text-subtle)]">{entry.plannedNote}</p>
        ) : (
          <Cluster gap="2">
            {row === null && (
              <Button
                type="button"
                size="sm"
                onClick={() => setShowConnect(true)}
                data-action="connect"
                aria-label={`Connect ${entry.name}`}
              >
                Connect
              </Button>
            )}
            {row !== null && (
              <>
                {connected && (
                  <Link
                    href="/settings/models#subscriptions"
                    className="inline-flex h-8 items-center rounded-md border border-[var(--border)] px-3 text-xs font-medium text-[var(--text)] hover:bg-[var(--surface-2)]"
                    data-action="manage-models"
                  >
                    Manage models
                  </Link>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleVerify()}
                  disabled={verifying}
                  loading={verifying}
                  data-action="reverify"
                >
                  Re-verify
                </Button>
                {row.status === "error" && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setShowConnect(true)}
                    data-action="reconnect"
                  >
                    Reconnect
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDisconnect(true)}
                  data-action="disconnect"
                  aria-label={`Disconnect ${entry.name}`}
                >
                  Disconnect
                </Button>
              </>
            )}
          </Cluster>
        )}
      </Stack>

      {showConnect && entry.instructions && (
        <AiSubscriptionConnectModal
          provider={entry.provider}
          providerName={entry.name}
          instructions={entry.instructions}
          onClose={() => setShowConnect(false)}
          onConnected={() => {
            setShowConnect(false);
            toast.success(
              `${entry.name} connected and verified. Its models are now in your chat model picker.`,
            );
            onMutate();
          }}
        />
      )}
      {showDisconnect && (
        <DisconnectSubscriptionModal
          provider={entry.provider}
          providerName={entry.name}
          onClose={() => setShowDisconnect(false)}
          onDisconnected={() => {
            setShowDisconnect(false);
            toast.success(`Disconnected ${entry.name}.`);
            onMutate();
          }}
        />
      )}
    </Card>
  );
}

function StatusPill({
  row,
  planned,
}: {
  row: AiSubscription | null;
  planned: boolean;
}) {
  if (planned) {
    return (
      <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-subtle)]">
        Planned
      </span>
    );
  }
  if (row === null) {
    return (
      <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
        Not connected
      </span>
    );
  }
  if (row.status === "connected") {
    return (
      <span className="rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--success-ink)]">
        Connected{row.credential_hint ? ` ·  ···${row.credential_hint}` : ""}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-[var(--danger-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--danger-ink)]">
      Needs attention
    </span>
  );
}

/** Minimal confirm before deleting the stored credential. */
function DisconnectSubscriptionModal({
  provider,
  providerName,
  onClose,
  onDisconnected,
}: {
  provider: string;
  providerName: string;
  onClose: () => void;
  onDisconnected: () => void;
}) {
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, submitting]);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      await api.aiSubscriptions.disconnect(provider);
      onDisconnected();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't disconnect.");
    } finally {
      setSubmitting(false);
    }
  }, [provider, onDisconnected]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Disconnect ${providerName}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4 backdrop-blur-sm"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <Card
        variant="glass"
        className="w-full max-w-md shadow-[var(--shadow-3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <Stack gap="4">
          <Stack gap="1">
            <span className="text-base font-semibold">
              Disconnect {providerName}?
            </span>
            <p className="text-xs text-[var(--text-muted)]">
              The stored credential is deleted and its models disappear from
              your chat model picker. Your plan itself is untouched -
              reconnect any time.
            </p>
          </Stack>
          {error && (
            <p
              role="alert"
              className="rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger-ink)]"
            >
              {error}
            </p>
          )}
          <Cluster justify="end" gap="2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              loading={submitting}
            >
              Disconnect
            </Button>
          </Cluster>
        </Stack>
      </Card>
    </div>
  );
}

function SubscriptionCardSkeleton() {
  return (
    <Card>
      <Stack gap="3">
        <Cluster justify="between" align="start">
          <Cluster gap="2" align="center">
            <div className="size-10 animate-pulse rounded-lg bg-[var(--surface-2)]" />
            <Stack gap="1">
              <div className="h-4 w-24 animate-pulse rounded-md bg-[var(--surface-2)]" />
              <div className="h-3 w-20 animate-pulse rounded-md bg-[var(--surface-2)]" />
            </Stack>
          </Cluster>
          <div className="h-4 w-16 animate-pulse rounded-full bg-[var(--surface-2)]" />
        </Cluster>
        <div className="h-3 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
        <div className="h-7 w-24 animate-pulse rounded-md bg-[var(--surface-2)]" />
      </Stack>
    </Card>
  );
}

/** Same compact relative-time formatter the integration cards use. */
function formatRelative(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  const diffSec = Math.floor((Date.now() - parsed) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(parsed).toISOString().slice(0, 10);
}
