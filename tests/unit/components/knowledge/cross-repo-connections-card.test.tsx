// @vitest-environment jsdom

/**
 * CrossRepoConnectionsCard — renders the rolled-up `(src,dst,kind)` rows and,
 * on expand, lazy-fetches the per-route drill-down from
 * `api.orgs.crossRepoEdges` and drives the pager. Pins: no render with zero
 * connections, NO fetch until expanded (lazy), expand → page-0 fetch +
 * src→dst route render, and the pager (total > one page) → next-page offset.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { CrossRepoEdgeDetail, CrossRepoEdgesPage, OrgKnowledge } from "@/lib/api/client";

const crossRepoEdges = vi.fn();
vi.mock("@/lib/api/client", () => ({
  api: { orgs: { crossRepoEdges: (...a: unknown[]) => crossRepoEdges(...a) } },
  ApiError: class ApiError extends Error {},
}));

import { CrossRepoConnectionsCard } from "@/components/knowledge/cross-repo-connections-card";

type Connection = OrgKnowledge["cross_repo_edges"]["connections"][number];

const conn = (over: Partial<Connection> = {}): Connection => ({
  src_repo_id: "fe",
  src_repo: "Glaux-AI/athena-frontend",
  dst_repo_id: "be",
  dst_repo: "Glaux-AI/athena-backend",
  kind: "consumes_api",
  count: 218,
  ...over,
});

const edge = (route: string): CrossRepoEdgeDetail => ({
  route,
  src_symbol: "client.ts",
  dst_symbol: "get_capability",
  transport: null,
  confidence: 0.9,
});
const pageOf = (
  items: CrossRepoEdgeDetail[],
  total: number,
  offset = 0,
  limit = 20,
): CrossRepoEdgesPage => ({ items, total, offset, limit });
const fill = (n: number, base = 0) =>
  Array.from({ length: n }, (_, i) => edge(`GET /v1/x/${base + i}`));

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CrossRepoConnectionsCard", () => {
  it("renders nothing when there are no connections", () => {
    const { container } = render(<CrossRepoConnectionsCard orgId="o1" connections={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the rolled-up connection but does NOT fetch until expanded", () => {
    render(<CrossRepoConnectionsCard orgId="o1" connections={[conn()]} />);
    expect(screen.getByText("athena-frontend")).toBeTruthy();
    expect(screen.getByText("athena-backend")).toBeTruthy();
    expect(crossRepoEdges).not.toHaveBeenCalled(); // lazy — only on expand
  });

  it("lazy-loads page 0 on expand and renders src→dst route paths", async () => {
    crossRepoEdges.mockResolvedValue(pageOf([edge("GET /v1/capabilities/{capability_id}")], 1));
    render(<CrossRepoConnectionsCard orgId="o1" connections={[conn({ count: 1 })]} />);

    fireEvent.click(screen.getByTestId("cross-repo-connection"));
    await waitFor(() =>
      expect(screen.getByText("GET /v1/capabilities/{capability_id}")).toBeTruthy(),
    );
    expect(crossRepoEdges).toHaveBeenCalledWith("o1", {
      srcRepoId: "fe",
      dstRepoId: "be",
      kind: "consumes_api",
      offset: 0,
      limit: 20,
    });
    expect(screen.getByText("get_capability")).toBeTruthy();
    expect(screen.queryByTestId("pagination-summary")).toBeNull(); // total 1 ≤ 10
  });

  it("shows the pager when total exceeds one page and pages forward", async () => {
    crossRepoEdges.mockResolvedValue(pageOf(fill(20), 218));
    render(<CrossRepoConnectionsCard orgId="o1" connections={[conn()]} />);

    fireEvent.click(screen.getByTestId("cross-repo-connection"));
    await waitFor(() => expect(screen.getByTestId("pagination-summary")).toBeTruthy());
    expect(screen.getByTestId("pagination-summary").textContent).toContain("of 218");

    crossRepoEdges.mockResolvedValue(pageOf(fill(20, 20), 218));
    fireEvent.click(screen.getByTestId("pagination-next"));
    await waitFor(() =>
      expect(crossRepoEdges).toHaveBeenLastCalledWith("o1", {
        srcRepoId: "fe",
        dstRepoId: "be",
        kind: "consumes_api",
        offset: 20,
        limit: 20,
      }),
    );
  });
});
