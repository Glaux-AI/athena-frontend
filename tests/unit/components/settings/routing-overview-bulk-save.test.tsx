// @vitest-environment jsdom

/**
 * RoutingOverview — bulk-edit save behaviour.
 *
 * The `/settings/models` routing surface edits every role in one draft and
 * commits with a single Save. These tests pin that contract deterministically
 * (the in-browser mock can't be relied on for round-trip state):
 *
 *   - "Edit routing" turns the rows into model pickers; no Save fires until a
 *     row actually changes (the count + button label track it).
 *   - Save issues exactly one `modelRoleBindings.put` per changed role with the
 *     selected `(provider, model)`; unchanged roles are left untouched.
 *   - Resetting a custom role to its platform default issues a `delete`, not a
 *     redundant `put`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { RoutingOverview } from "@/components/settings/models/routing-overview";
import * as client from "@/lib/api/client";
import type {
  AgentRoleBinding, CatalogModel, CatalogProvider, ModelProvider,
  RoleBinding, RoleDefault,
} from "@/lib/api/client";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

function model(id: string, display: string): CatalogModel {
  return {
    id, display_name: display, description: `${display}.`,
    context_window: 131072, max_input_tokens: 131072, max_output_tokens: 32768,
    input_price: 1, output_price: 2, supports_tools: true, supports_embeddings: false,
    supports_vision: false, rate_limit: null, model_type: "chat", thinking_mode: "none",
    thinking: false, thinking_optional: false, non_thinking_variant: null,
  };
}

function provider(id: string, display: string, models: CatalogModel[]): CatalogProvider {
  return {
    id, display_name: display, tier_hint: "paid", requires_openai_compat: false,
    pricing_currency: "USD", pricing_unit: "per_1m_tokens", pricing_notes: "",
    rate_limit_notes: "", models,
  };
}

const CATALOG: CatalogProvider[] = [
  provider("anthropic", "Anthropic", [model("claude-opus-4-7-latest", "Claude Opus 4.7")]),
  provider("openai", "OpenAI", [model("gpt-4o", "GPT-4o")]),
  provider("google", "Google Gemini", [
    model("gemini-3.5-flash", "Gemini 3.5 Flash"),
    model("gemini-2.5-flash-lite", "Gemini 2.5 Flash Lite"),
  ]),
];

// openai holds a key → its models are "Your key" candidates.
const PROVIDERS: ModelProvider[] = [
  {
    id: "mp_openai", provider: "openai", via: "direct", region: "us", status: "enabled",
    enabled_models: ["gpt-4o"], request_count: 0, cost_mtd: 0, residency_note: "",
    has_api_key: true, api_key_last4: "X8K2",
  },
];

const DEFAULTS: RoleDefault[] = [
  { role: "planner", provider: "google", model: "gemini-3.5-flash" },
  { role: "heavy-reasoner", provider: "google", model: "gemini-3.5-flash" },
  { role: "chat-fast", provider: "google", model: "gemini-2.5-flash-lite" },
  { role: "long-context", provider: "google", model: "gemini-3.5-flash" },
  { role: "workhorse-cheap", provider: "google", model: "gemini-2.5-flash-lite" },
  { role: "code-editor", provider: "google", model: "gemini-3.5-flash" },
  { role: "code-editor-cheap", provider: "google", model: "gemini-2.5-flash-lite" },
  { role: "embeddings", provider: "google", model: "text-embedding-004" },
];

// One custom binding (code-editor → your openai key); everything else rides
// the platform default. No fallbacks → one <select> per role row.
const BINDINGS: RoleBinding[] = [
  { role: "code-editor", primary_provider: "openai", primary_model: "gpt-4o", fallback_chain: [] },
];

const AGENTS: AgentRoleBinding[] = [
  { agent_name: "reviewer", role: "heavy-reasoner", default_role: "heavy-reasoner", is_overridden: false },
  { agent_name: "implementer", role: "code-editor", default_role: "code-editor", is_overridden: false },
];

// CONFIGURABLE_ROLES render order (embeddings excluded).
const ROLE_ORDER = [
  "planner", "heavy-reasoner", "chat-fast", "long-context",
  "workhorse-cheap", "code-editor", "code-editor-cheap",
];

const putSpy = () => vi.mocked(client.api.modelRoleBindings.put);
const deleteSpy = () => vi.mocked(client.api.modelRoleBindings.delete);

beforeEach(() => {
  vi.spyOn(client.api.agentRoleBindings, "list").mockResolvedValue(AGENTS);
  vi.spyOn(client.api.modelRoleBindings, "list").mockResolvedValue(BINDINGS);
  vi.spyOn(client.api.llmProviders, "roleDefaults").mockResolvedValue(DEFAULTS);
  vi.spyOn(client.api.modelRoleBindings, "put").mockResolvedValue(BINDINGS[0]!);
  vi.spyOn(client.api.modelRoleBindings, "delete").mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function enterEditMode() {
  render(<RoutingOverview orgId="org_x" providers={PROVIDERS} catalog={CATALOG} />);
  const editBtn = await screen.findByRole("button", { name: /edit routing/i });
  fireEvent.click(editBtn);
  // Edit mode renders one <select> per role.
  await waitFor(() => expect(document.querySelectorAll("select").length).toBeGreaterThanOrEqual(7));
}

describe("RoutingOverview bulk save", () => {
  it("saves nothing until a row changes", async () => {
    await enterEditMode();
    // Fresh into edit mode → Save is disabled and labelled generically.
    const save = screen.getByRole("button", { name: /^save changes$/i }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getByText(/no changes yet/i)).toBeTruthy();
  });

  it("issues one put for the changed role with the selected model", async () => {
    await enterEditMode();
    const selects = document.querySelectorAll("select");
    // heavy-reasoner is the 2nd configurable role.
    const heavyIdx = ROLE_ORDER.indexOf("heavy-reasoner");
    fireEvent.change(selects[heavyIdx]!, { target: { value: "openai|gpt-4o" } });

    const save = await screen.findByRole("button", { name: /save 1 change/i });
    expect(screen.getByText(/1 role changed/i)).toBeTruthy();
    fireEvent.click(save);

    await waitFor(() => expect(putSpy()).toHaveBeenCalledTimes(1));
    expect(putSpy()).toHaveBeenCalledWith("org_x", "heavy-reasoner", {
      primary_provider: "openai",
      primary_model: "gpt-4o",
      fallback_chain: [],
    });
    expect(deleteSpy()).not.toHaveBeenCalled();
  });

  it("deletes the binding when a custom role is reset to its platform default", async () => {
    await enterEditMode();
    // code-editor currently has a custom binding (openai/gpt-4o); resetting it
    // to the google default should DELETE the override, not PUT a default row.
    const reset = screen.getByRole("button", { name: /reset code editing to platform default/i });
    fireEvent.click(reset);

    const save = await screen.findByRole("button", { name: /save 1 change/i });
    fireEvent.click(save);

    await waitFor(() => expect(deleteSpy()).toHaveBeenCalledWith("org_x", "code-editor"));
    expect(putSpy()).not.toHaveBeenCalled();
  });

  it("commits multiple changed roles in one save", async () => {
    await enterEditMode();
    const selects = document.querySelectorAll("select");
    fireEvent.change(selects[ROLE_ORDER.indexOf("heavy-reasoner")]!, { target: { value: "openai|gpt-4o" } });
    // long-context default is gemini-3.5-flash → switch to the lite model
    // (a valid shared-pool candidate) so it registers as a change.
    fireEvent.change(selects[ROLE_ORDER.indexOf("long-context")]!, { target: { value: "google|gemini-2.5-flash-lite" } });

    const save = await screen.findByRole("button", { name: /save 2 changes/i });
    fireEvent.click(save);

    await waitFor(() => expect(putSpy()).toHaveBeenCalledTimes(2));
    const roles = putSpy().mock.calls.map((c) => c[1]).sort();
    expect(roles).toEqual(["heavy-reasoner", "long-context"]);
  });
});
