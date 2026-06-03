// @vitest-environment jsdom

/**
 * Dashboard-header dedup regression — the org / capability / repo Blueprint
 * dashboard headers must NOT render the architecture / portfolio Mermaid
 * diagram. That diagram (with its narrative + clickable chips) lives in the
 * matching Blueprint section below (`<BlueprintSectionViewer>`), the single,
 * richer render. Pins §5.27.Y guideline #3 (one home per KG datum) so the
 * diagram isn't duplicated on the page again.
 *
 * KnowledgeMermaid is stubbed as a `mermaid-stub` sentinel — if any header
 * re-adds the diagram, the stub appears and these assertions fail.
 */

import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { OrgDashboardHeader } from "@/components/knowledge/org-dashboard-header";
import { CapDashboardHeader } from "@/components/capabilities/cap-dashboard-header";
import { RepoDashboardHeader } from "@/components/repo/repo-dashboard-header";
import type { CapabilityRepo, OrgKnowledge, RepoKnowledge } from "@/lib/api/client";

vi.mock("@/components/knowledge/knowledge-mermaid", () => ({
  KnowledgeMermaid: ({ chart }: { chart: string }) => <pre data-testid="mermaid-stub">{chart}</pre>,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

// The org header still fetches the `portfolio` section for its capability
// links; resolve it to null so the header falls back to the OrgKnowledge
// registry (deterministic). The cap/repo headers no longer fetch anything.
vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return {
    ...actual,
    api: {
      ...actual.api,
      blueprint: {
        ...actual.api.blueprint,
        org: { ...actual.api.blueprint.org, getSection: vi.fn().mockResolvedValue({ body_json: null }) },
      },
    },
  };
});

afterEach(() => { cleanup(); });

const orgKnowledge = {
  capabilities: [{ id: "cap1", name: "Billing" }],
} as unknown as OrgKnowledge;

const repos = [
  { id: "att1", repo_id: "repo1", repo_full_name: "acme/web" },
] as unknown as CapabilityRepo[];

describe("Blueprint dashboard headers — no duplicate diagram", () => {
  it("org header renders capability links but NOT the portfolio diagram", async () => {
    render(<OrgDashboardHeader orgId="org1" orgKnowledge={orgKnowledge} />);
    expect(await screen.findByText("Billing")).toBeTruthy();
    expect(screen.queryByTestId("mermaid-stub")).toBeNull();
  });

  it("capability header renders repo links but NOT the architecture diagram", () => {
    render(<CapDashboardHeader capabilityId="cap1" repos={repos} />);
    expect(screen.getByText("acme/web")).toBeTruthy();
    expect(screen.queryByTestId("mermaid-stub")).toBeNull();
  });

  it("repo header renders summary + sync slot but NOT the architecture diagram", () => {
    render(
      <RepoDashboardHeader
        knowledge={{ summary: "Repo summary line." } as unknown as RepoKnowledge}
        syncSlot={<div data-testid="sync-slot" />}
      />,
    );
    expect(screen.getByText("Repo summary line.")).toBeTruthy();
    expect(screen.getByTestId("sync-slot")).toBeTruthy();
    expect(screen.queryByTestId("mermaid-stub")).toBeNull();
  });
});
