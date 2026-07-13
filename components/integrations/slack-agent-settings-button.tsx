"use client";

/**
 * SlackAgentSettingsButton - the entry point to the @Athena Slack agent's
 * configuration, rendered on the Slack integration card (only when Slack is
 * connected). Opens a modal hosting the two Slack-agent settings cards:
 *
 *   - <SlackAgentModelCard>  - which model the bot answers with (ADR-092)
 *   - <SlackAgentAccessCard> - read-only vs read & act + the tool allowlist
 *
 * These used to live on /settings/models, but they are Slack-specific and only
 * relevant once Slack is integrated, so they belong here next to the Slack
 * connection - not taking up space on the general model-providers page.
 */

import { useEffect, useState } from "react";
import { Bot } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/skeleton";
import { Stack } from "@/components/layout/primitives";
import { api, type CatalogProvider } from "@/lib/api/client";
import { SlackAgentModelCard } from "@/components/settings/models/slack-agent-model-card";
import { SlackAgentAccessCard } from "@/components/settings/models/slack-agent-access-card";

export function SlackAgentSettingsButton() {
  const [open, setOpen] = useState(false);
  // The model picker needs the provider catalog for display names + rungs.
  // Fetched lazily on first open (the cards inside only mount when the modal
  // opens), then cached so re-opening is instant.
  const [catalog, setCatalog] = useState<CatalogProvider[] | null>(null);

  useEffect(() => {
    if (!open || catalog !== null) return;
    let cancelled = false;
    api.llmProviders
      .catalog()
      .then((c) => {
        if (!cancelled) setCatalog(c);
      })
      .catch(() => {
        // Degrade to an empty catalog - the picker still renders stored picks
        // by their raw ids rather than blocking the whole modal.
        if (!cancelled) setCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, catalog]);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label="Configure the @Athena Slack agent"
        data-action="slack-agent-settings"
      >
        <Bot className="size-3" aria-hidden />
        Agent settings
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title="Slack agent"
        description="Configure the @Athena Slack bot: which model it answers with, and what it can access."
      >
        <Stack gap="4">
          {catalog === null ? (
            <Skeleton
              className="h-48 w-full rounded-lg"
              aria-label="Loading the Slack agent settings"
            />
          ) : (
            <>
              <SlackAgentModelCard catalog={catalog} />
              <SlackAgentAccessCard />
            </>
          )}
        </Stack>
      </Modal>
    </>
  );
}
