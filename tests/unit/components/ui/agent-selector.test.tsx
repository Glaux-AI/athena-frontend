// @vitest-environment jsdom

/**
 * <AgentSelector> - the per-turn custom-agent picker (Agent Registry, AR.1).
 *
 * Covers the trigger label (placeholder / selected), the grouped popover
 * (Yours / Shared + the "No agent" reset row), and that picking an agent or
 * the reset row reports the right value to the parent.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

import { AgentSelector } from "@/components/ui/agent-selector";
import type { Agent } from "@/lib/api/client";

afterEach(cleanup);

function agent(extra: Partial<Agent> = {}): Agent {
  return {
    id: "a1",
    slug: "writer",
    name: "Writer",
    description: "Writes things",
    icon: "bot",
    visibility: "private",
    status: "active",
    model_provider: null,
    model_id: null,
    model_source: null,
    timeout_seconds: 600,
    effort: null,
    attached_domains: [],
    tools: [],
    usage_count: 0,
    owner_user_id: "u1",
    is_owner: true,
    last_used: "never",
    updated_at: "2026-06-29T00:00:00Z",
    ...extra,
  };
}

describe("AgentSelector", () => {
  it("shows the placeholder when nothing is selected", () => {
    render(<AgentSelector agents={[agent()]} value={null} onChange={() => {}} />);
    expect(screen.getByLabelText("Select agent").textContent).toMatch(/Agent/);
  });

  it("shows the selected agent's name on the trigger", () => {
    render(<AgentSelector agents={[agent()]} value="a1" onChange={() => {}} />);
    expect(screen.getByLabelText("Agent: Writer").textContent).toMatch(/Writer/);
  });

  it("opens, groups Yours / Shared, and offers a No-agent reset row", () => {
    const onChange = vi.fn();
    render(
      <AgentSelector
        agents={[agent(), agent({ id: "a2", name: "Shared one", is_owner: false })]}
        value={null}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("Select agent"));
    expect(screen.queryByText("No agent")).not.toBeNull();
    expect(screen.queryByText("Yours")).not.toBeNull();
    expect(screen.queryByText("Shared with you")).not.toBeNull();
    fireEvent.click(screen.getByText("Writer"));
    expect(onChange).toHaveBeenCalledWith("a1");
  });

  it("clears the pick when No agent is chosen", () => {
    const onChange = vi.fn();
    render(<AgentSelector agents={[agent()]} value="a1" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Agent: Writer"));
    fireEvent.click(screen.getByText("No agent"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("hints at the settings surface when there are no agents", () => {
    render(<AgentSelector agents={[]} value={null} onChange={() => {}} />);
    fireEvent.click(screen.getByLabelText("Select agent"));
    expect(screen.queryByText(/Custom agents/)).not.toBeNull();
  });
});
