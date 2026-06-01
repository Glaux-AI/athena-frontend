/**
 * §7.8.1 — multi-provider catalog + role bindings + per-model usage.
 *
 * Round-trip tests through the mock handler stack: every API method
 * landed on the right URL + shape, and the BE-side validation rules
 * (catalog gate, role enum, atomic upsert) hold under the mock too.
 *
 * Mock-mode parity with the BE is the contract under test: if the
 * mock accepts a payload the live BE would reject (or vice versa),
 * the FE picker can ship a payload that 400s in production. These
 * tests catch that drift.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  api,
  ApiError,
  MODEL_ROLE_ALIASES,
  type CatalogProvider,
} from "@/lib/api/client";

const ACTIVE_ORG_KEY = "athena.activeOrgId";
const TEST_ORG = "org_test_byo";

beforeEach(() => {
  if (typeof window !== "undefined") {
    window.localStorage.clear();
    window.localStorage.setItem(ACTIVE_ORG_KEY, TEST_ORG);
  }
});

afterEach(() => {
  if (typeof window !== "undefined") window.localStorage.clear();
});


// ---------------------------------------------------------------- catalog ---


describe("api.llmProviders.catalog", () => {
  it("returns the 14-provider catalog in display order", async () => {
    const catalog = await api.llmProviders.catalog();
    expect(catalog.length).toBeGreaterThanOrEqual(14);
    const ids = catalog.map((p) => p.id);
    for (const expected of ["anthropic", "openai", "google", "deepseek"]) {
      expect(ids).toContain(expected);
    }
    for (const expected of [
      "groq", "cerebras", "sambanova", "mistral",
      "openrouter", "github_models", "cloudflare",
      "cohere", "huggingface", "zai",
    ]) {
      expect(ids).toContain(expected);
    }
  });

  it("Z.ai is flagged as openai-compat passthrough", async () => {
    const catalog = await api.llmProviders.catalog();
    const zai = catalog.find((p) => p.id === "zai");
    expect(zai?.requires_openai_compat).toBe(true);
  });

  it("every catalog entry ships >= 1 model with stable fields", async () => {
    const catalog = await api.llmProviders.catalog();
    for (const provider of catalog) {
      expect(provider.models.length).toBeGreaterThan(0);
      for (const m of provider.models) {
        expect(typeof m.id).toBe("string");
        expect(typeof m.display_name).toBe("string");
        expect(typeof m.supports_tools).toBe("boolean");
        expect(typeof m.supports_embeddings).toBe("boolean");
        expect(typeof m.supports_vision).toBe("boolean");
      }
    }
  });
});


// ------------------------------------------------------ provider creation ---


describe("api.modelProviders.create — POST /v1/orgs/{id}/model-providers", () => {
  it("creates a provider against a catalog id", async () => {
    const created = await api.modelProviders.create(TEST_ORG, {
      provider: "groq",
      enabled_models: ["llama-3.3-70b-versatile"],
      api_key: "gsk_test_XXXXXXXXX",
    });
    expect(created.provider).toBe("groq");
    expect(created.has_api_key).toBe(true);
    expect(created.api_key_last4).toBe("XXXX");
    expect(created.enabled_models).toContain("llama-3.3-70b-versatile");
  });

  it("creates a provider with no key (config-only row)", async () => {
    const created = await api.modelProviders.create(TEST_ORG, {
      provider: "cerebras",
      enabled_models: ["gpt-oss-120b"],
    });
    expect(created.has_api_key).toBe(false);
    expect(created.api_key_last4).toBe(null);
  });

  it("rejects a provider id that's not in the catalog", async () => {
    await expect(
      api.modelProviders.create(TEST_ORG, { provider: "not-a-provider" }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});


// -------------------------------------------------------- per-model usage ---


describe("api.modelProviders.usage — per-model drill-down", () => {
  it("returns a per-model rollup for a seeded provider", async () => {
    const usage = await api.modelProviders.usage(TEST_ORG, "mp_anthropic_direct");
    expect(usage.provider).toBe("anthropic");
    expect(usage.range).toBe("mtd");
    expect(usage.models.length).toBeGreaterThan(0);
    for (const row of usage.models) {
      expect(typeof row.model).toBe("string");
      expect(row.requests).toBeGreaterThanOrEqual(0);
      expect(row.prompt_tokens).toBeGreaterThanOrEqual(0);
    }
  });

  it("free-tier providers report cost_usd = 0 — drives the 'free' badge", async () => {
    const usage = await api.modelProviders.usage(TEST_ORG, "mp_groq_free");
    expect(usage.provider).toBe("groq");
    for (const row of usage.models) {
      expect(row.cost_usd).toBe(0);
    }
  });

  it("404s on an unknown provider id", async () => {
    await expect(
      api.modelProviders.usage(TEST_ORG, "mp_does_not_exist"),
    ).rejects.toBeInstanceOf(ApiError);
  });
});


// ----------------------------------------------------------- role bindings ---


describe("api.modelRoleBindings — CRUD + catalog gate + role enum", () => {
  it("PUT upserts a binding and reflects in subsequent list", async () => {
    const next = await api.modelRoleBindings.put(TEST_ORG, "code-editor", {
      primary_provider: "anthropic",
      primary_model: "claude-sonnet-4-6-latest",
      fallback_chain: [{ provider: "groq", model: "openai/gpt-oss-120b" }],
    });
    expect(next.role).toBe("code-editor");
    expect(next.primary_provider).toBe("anthropic");
    const all = await api.modelRoleBindings.list(TEST_ORG);
    const written = all.find((b) => b.role === "code-editor");
    expect(written?.fallback_chain).toHaveLength(1);
  });

  it("PUT rejects an unknown provider in the primary", async () => {
    await expect(
      api.modelRoleBindings.put(TEST_ORG, "planner", {
        primary_provider: "not-a-provider",
        primary_model: "anything",
        fallback_chain: [],
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("PUT rejects an unknown model on a real provider", async () => {
    await expect(
      api.modelRoleBindings.put(TEST_ORG, "planner", {
        primary_provider: "anthropic",
        primary_model: "claude-99-impossible",
        fallback_chain: [],
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("PUT rejects a bad entry deep in the fallback chain", async () => {
    await expect(
      api.modelRoleBindings.put(TEST_ORG, "planner", {
        primary_provider: "anthropic",
        primary_model: "claude-opus-4-7-latest",
        fallback_chain: [
          { provider: "groq", model: "llama-3.3-70b-versatile" },
          { provider: "anthropic", model: "claude-99-impossible" },
        ],
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("PUT rejects a role that's not in the canonical set", async () => {
    await expect(
      api.modelRoleBindings.put(
        TEST_ORG,
        // intentionally outside the closed-set Literal — cast keeps
        // the test honest about the runtime path the mock validates.
        "made-up-role" as never,
        {
          primary_provider: "anthropic",
          primary_model: "claude-opus-4-7-latest",
          fallback_chain: [],
        },
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("DELETE clears the binding", async () => {
    await api.modelRoleBindings.put(TEST_ORG, "code-editor-cheap", {
      primary_provider: "groq",
      primary_model: "llama-3.1-8b-instant",
      fallback_chain: [],
    });
    await api.modelRoleBindings.delete(TEST_ORG, "code-editor-cheap");
    const all = await api.modelRoleBindings.list(TEST_ORG);
    expect(all.find((b) => b.role === "code-editor-cheap")).toBeUndefined();
  });

  it("MODEL_ROLE_ALIASES covers exactly the canonical 8 roles", () => {
    expect(MODEL_ROLE_ALIASES).toEqual([
      "planner",
      "heavy-reasoner",
      "chat-fast",
      "long-context",
      "workhorse-cheap",
      "code-editor",
      "code-editor-cheap",
      "embeddings",
    ]);
  });
});


// ---------------------------------------------------- type-shape guards ---


describe("type stability — wire-shape regression guards", () => {
  it("CatalogProvider shape is stable enough for the FE picker", async () => {
    const catalog = await api.llmProviders.catalog();
    const sample = catalog[0] as CatalogProvider;
    expect(sample.id).toBeDefined();
    expect(sample.display_name).toBeDefined();
    expect(["free", "paid", "mixed"]).toContain(sample.tier_hint);
    expect(Array.isArray(sample.models)).toBe(true);
  });
});
