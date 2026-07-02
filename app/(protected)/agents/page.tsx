"use client";

/**
 * /agents - the Agent + Tool Registry, a top-level surface (was two
 * `/settings/*` pages). Build custom agents (system prompt + model + tools +
 * sharing scope) and pick them per-turn in chat; the custom tools an agent can
 * call live inside the "Tools" tab of this same page.
 *
 * Both registries are a paid-tier feature and read-gated on `agents:read` - the
 * NAV row is hidden otherwise (see the sidebar's `customAgents` feature gate),
 * but we guard here too for a direct hit on the URL.
 */

import { Bot } from "lucide-react";

import { AgentsPanel } from "@/components/agents/agents-panel";
import { ToolsPanel } from "@/components/agents/tools-panel";
import { Segmented } from "@/components/cost/segmented";
import { Stack, Cluster } from "@/components/layout/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { useTabParam } from "@/hooks/use-url-state";
import { usePermissions } from "@/lib/session/use-permissions";
import { useSession } from "@/lib/session/SessionProvider";

type Tab = "agents" | "tools";
const TABS: readonly Tab[] = ["agents", "tools"];

const SUBTITLE: Record<Tab, string> = {
  agents: "Build agents with your own system prompt, model, and tools, then pick them in chat.",
  tools: "Wrap a built-in or alias an MCP tool, then add it to an agent.",
};

export default function AgentsPage() {
  const { can } = usePermissions();
  const { me } = useSession();
  const [tab, setTab] = useTabParam<Tab>("tab", "agents", TABS);

  const allowed = can("agents:read") && me?.features.customAgents === true;

  return (
    <Stack gap="6">
      <Stack gap="4" className="border-b border-[var(--border)] pb-5">
        <Cluster gap="2.5" align="center">
          <Bot className="size-5 text-[var(--primary)]" aria-hidden />
          <Stack gap="1" className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">Custom agents</h1>
            <p className="text-sm text-[var(--text-muted)]">{SUBTITLE[tab]}</p>
          </Stack>
        </Cluster>
        {allowed && (
          <Segmented<Tab>
            ariaLabel="Registry section"
            size="md"
            value={tab}
            onChange={setTab}
            options={[
              { value: "agents", label: "Agents" },
              { value: "tools", label: "Tools" },
            ]}
          />
        )}
      </Stack>

      {allowed ? (
        tab === "agents" ? <AgentsPanel /> : <ToolsPanel />
      ) : (
        <EmptyState
          icon={<Bot className="size-6" />}
          title="Custom agents aren't available"
          description="Custom agents and tools are a paid-tier feature. Ask an org admin to upgrade the plan, or check that you have access."
        />
      )}
    </Stack>
  );
}
