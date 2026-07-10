"use client";

/**
 * SubscriptionModelsCard - the personal "Your subscriptions" rung of
 * /settings/models.
 *
 * Lists each AI subscription the CURRENT user connected on
 * /settings/integrations and offers per-model toggles
 * (`PATCH /v1/users/me/ai-subscriptions/{provider}`). Enabled models show
 * up in the chat composer's model picker under "Your plan" - chat only,
 * for this user only. When nothing is connected the card renders a quiet
 * pointer to the integrations page instead of vanishing, so users know
 * the surface exists.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { UserRound } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { Stack, Cluster } from "@/components/layout/primitives";
import { useSession } from "@/lib/session/SessionProvider";
import {
  api,
  ApiError,
  type AiSubscription,
  type CatalogProvider,
} from "@/lib/api/client";

export function SubscriptionModelsCard({
  catalog,
}: {
  catalog: CatalogProvider[];
}) {
  const { me } = useSession();
  const [rows, setRows] = useState<readonly AiSubscription[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [version, setVersion] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await api.aiSubscriptions.list();
        if (!cancelled) setRows(result);
      } catch {
        if (!cancelled) setRows([]); // quiet - the empty pointer covers it
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [version]);

  const connected = rows.filter((r) => r.status === "connected");
  const grounded = me?.features.subscriptionMcpBridge ?? false;

  return (
    <Card id="subscriptions" className="scroll-mt-20">
      <Stack gap="3">
        <Stack gap="0.5">
          <Cluster gap="2" align="center">
            <UserRound className="size-4 text-[var(--text-muted)]" aria-hidden />
            <span className="text-sm font-semibold">Your subscriptions</span>
            <Pill tone="neutral" kind="outline" size="sm">Personal</Pill>
          </Cluster>
          <p className="text-xs text-[var(--text-muted)]">
            {grounded ? (
              <>
                Models from your own Claude/ChatGPT plan. Visible only to you,
                in chat - grounded in workspace knowledge via MCP, though task
                stages still run on Athena-hosted models. Usage draws on your
                plan, never org credits.
              </>
            ) : (
              <>
                Models from your own Claude/ChatGPT plan. Visible only to you,
                in chat only - they can&apos;t browse workspace knowledge or
                run task stages. Usage draws on your plan, never org credits.
              </>
            )}
          </p>
        </Stack>

        {isLoading ? (
          <Skeleton className="h-10 rounded-md" />
        ) : connected.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">
            No subscription connected.{" "}
            <Link
              href="/settings/integrations#provider-claude-subscription"
              className="font-medium text-[var(--text)] underline underline-offset-2 hover:text-[var(--primary)]"
            >
              Connect your Claude or ChatGPT plan
            </Link>{" "}
            to use it here.
          </p>
        ) : (
          <Stack gap="3">
            {connected.map((row) => (
              <SubscriptionModelToggles
                key={row.provider}
                row={row}
                catalog={catalog}
                onChanged={() => setVersion((v) => v + 1)}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

function SubscriptionModelToggles({
  row,
  catalog,
  onChanged,
}: {
  row: AiSubscription;
  catalog: CatalogProvider[];
  onChanged: () => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const entry = catalog.find((c) => c.id === row.provider) ?? null;
  const models = entry?.models ?? [];

  const toggle = useCallback(
    async (modelId: string, on: boolean) => {
      setPending(modelId);
      try {
        const next = on
          ? [...row.enabled_models, modelId]
          : row.enabled_models.filter((m) => m !== modelId);
        await api.aiSubscriptions.setModels(row.provider, next);
        onChanged();
      } catch (e) {
        toast.error(
          e instanceof ApiError ? e.message : "Couldn't update the model.",
        );
      } finally {
        setPending(null);
      }
    },
    [row.provider, row.enabled_models, onChanged],
  );

  return (
    <Stack gap="1.5">
      <span className="text-xs font-medium text-[var(--text-muted)]">
        {entry?.display_name ?? row.provider}
      </span>
      <Cluster gap="2">
        {models.map((m) => {
          const on = row.enabled_models.includes(m.id);
          return (
            <label
              key={m.id}
              title={m.description}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs hover:bg-[var(--surface-2)]"
            >
              <input
                type="checkbox"
                checked={on}
                disabled={pending !== null}
                onChange={(e) => void toggle(m.id, e.target.checked)}
                className="size-3 accent-[var(--primary)]"
                aria-label={`${on ? "Disable" : "Enable"} ${m.display_name}`}
              />
              <span className={on ? "text-[var(--text)]" : "text-[var(--text-muted)]"}>
                {m.display_name}
              </span>
            </label>
          );
        })}
      </Cluster>
    </Stack>
  );
}
