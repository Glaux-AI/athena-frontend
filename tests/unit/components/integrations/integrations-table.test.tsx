// @vitest-environment jsdom

/**
 * Unit tests for `<IntegrationsTable>` + `<IntegrationCard>` (Agent EEE).
 *
 * Tests cover:
 *   - renders one card for every provider in `PROVIDER_CATALOG` (8),
 *   - renders even when the API returns no rows — every card shows as
 *     `disconnected`,
 *   - cross-org isolation: the table renders whatever the hook gives it.
 *     `apiFetch` is the layer that injects `X-Athena-Org-Id` — this test
 *     asserts the table never bypasses the prop by reading any global
 *     org-scoped state itself,
 *   - per-row status reflects the matching `IntegrationOut` row,
 *   - clicking Connect calls `oauthStart` (via the ConnectButton wrapper),
 *   - clicking Disconnect opens the confirm modal.
 *
 * `oauthStart` is mocked at the module level so the popup never opens.
 * `next/navigation` is stubbed because the page-level layout pulls in
 * Next routing primitives.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

// Hoisted mocks — control oauthStart so the test never opens a popup.
const oauthStartMock = vi.fn();
const disconnectMock = vi.fn();
const acknowledgeDriftMock = vi.fn();

vi.mock("@/lib/api/integrations", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/integrations")>(
    "@/lib/api/integrations",
  );
  return {
    ...actual,
    oauthStart: (...args: Parameters<typeof actual.oauthStart>) =>
      oauthStartMock(...args),
    disconnect: (...args: Parameters<typeof actual.disconnect>) =>
      disconnectMock(...args),
    acknowledgeDrift: (...args: Parameters<typeof actual.acknowledgeDrift>) =>
      acknowledgeDriftMock(...args),
  };
});

import { IntegrationsTable } from "@/components/integrations/integrations-table";
import {
  PROVIDER_CATALOG,
  type IntegrationOut,
  type ProviderSlug,
} from "@/lib/api/integrations";

function buildRow(overrides: Partial<IntegrationOut>): IntegrationOut {
  return {
    id: "int_demo",
    org_id: "org_demo",
    provider: "github" as ProviderSlug,
    status: "active",
    last_verified_at: "2026-05-26T10:00:00Z",
    pending_drift: false,
    ...overrides,
  };
}

describe("<IntegrationsTable>", () => {
  beforeEach(() => {
    cleanup();
    oauthStartMock.mockReset();
    disconnectMock.mockReset();
    acknowledgeDriftMock.mockReset();
    // Default — popup opens but window.open returns a stub Window.
    vi.stubGlobal("open", vi.fn(() => ({ closed: false })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("renders exactly one card per provider in the closed 8-provider catalog", () => {
    render(<IntegrationsTable integrations={[]} onMutate={() => {}} />);
    for (const entry of PROVIDER_CATALOG) {
      const card = screen.getByTestId(`integration-card-${entry.provider}`);
      expect(within(card).queryByText(entry.name)).not.toBeNull();
    }
    // Total cards == catalog size.
    const allCards = screen.getAllByTestId(/integration-card-/);
    expect(allCards.length).toBe(PROVIDER_CATALOG.length);
  });

  it("renders every provider as `disconnected` when the API returns no rows", () => {
    render(<IntegrationsTable integrations={[]} onMutate={() => {}} />);
    const badges = screen.getAllByRole("status");
    // Every card has at least one status badge.
    expect(badges.length).toBeGreaterThanOrEqual(PROVIDER_CATALOG.length);
    // Every disconnected provider exposes a "Connect <Name>" button.
    for (const entry of PROVIDER_CATALOG) {
      const button = screen.getByLabelText(`Connect ${entry.name}`);
      expect(button.getAttribute("data-action")).toBe("connect");
    }
  });

  it("renders the correct status per provider when rows are passed in", () => {
    const rows: IntegrationOut[] = [
      buildRow({ provider: "github", status: "active" }),
      buildRow({
        provider: "slack",
        status: "degraded",
        pending_drift: true,
        id: "int_slack",
      }),
      buildRow({ provider: "linear", status: "pending", id: "int_linear" }),
    ];
    render(<IntegrationsTable integrations={rows} onMutate={() => {}} />);

    const githubCard = screen.getByTestId("integration-card-github");
    expect(within(githubCard).queryByText("Active")).not.toBeNull();

    const slackCard = screen.getByTestId("integration-card-slack");
    expect(within(slackCard).queryByText("Degraded")).not.toBeNull();
    // Degraded + pending drift → the Acknowledge button is rendered.
    expect(
      within(slackCard).queryByLabelText("Acknowledge drift for Slack"),
    ).not.toBeNull();

    const linearCard = screen.getByTestId("integration-card-linear");
    expect(within(linearCard).queryByText("Pending")).not.toBeNull();

    // The 5 untouched providers fall back to disconnected.
    const jiraCard = screen.getByTestId("integration-card-jira");
    expect(within(jiraCard).queryByText("Disconnected")).not.toBeNull();
  });

  it("does not bypass the `integrations` prop — only renders what is passed", () => {
    // Cross-org isolation lives at apiFetch; the table must NOT read any
    // global org-scoped state itself. Smoke test: changing the prop
    // changes the render output.
    const { rerender } = render(
      <IntegrationsTable
        integrations={[buildRow({ provider: "github", status: "active" })]}
        onMutate={() => {}}
      />,
    );
    expect(
      within(screen.getByTestId("integration-card-github")).queryByText("Active"),
    ).not.toBeNull();

    rerender(<IntegrationsTable integrations={[]} onMutate={() => {}} />);
    expect(
      within(screen.getByTestId("integration-card-github")).queryByText("Disconnected"),
    ).not.toBeNull();
  });

  it("clicking a Connect button calls oauthStart with the provider slug", async () => {
    oauthStartMock.mockResolvedValueOnce({
      authorize_url: "https://github.com/login/oauth/authorize?state=x",
      state: "x",
    });
    render(<IntegrationsTable integrations={[]} onMutate={() => {}} />);
    const githubConnect = screen.getByLabelText("Connect GitHub");
    fireEvent.click(githubConnect);
    await waitFor(() => expect(oauthStartMock).toHaveBeenCalledTimes(1));
    expect(oauthStartMock).toHaveBeenCalledWith("github");
  });

  it("clicking Disconnect opens the disconnect-confirm modal", () => {
    render(
      <IntegrationsTable
        integrations={[
          buildRow({
            provider: "github",
            status: "active",
            id: "int_gh_real",
          }),
        ]}
        onMutate={() => {}}
      />,
    );
    const disconnectButton = screen.getByLabelText("Disconnect GitHub");
    fireEvent.click(disconnectButton);
    expect(screen.queryByTestId("disconnect-confirm-modal-backdrop")).not.toBeNull();
    // Modal copy includes the provider name.
    expect(screen.queryByText("Disconnect GitHub?")).not.toBeNull();
  });
});
