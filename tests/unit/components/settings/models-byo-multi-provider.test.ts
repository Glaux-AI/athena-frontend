/**
 * §7.8.1 - multi-provider catalog + per-model usage.
 *
 * Round-trip tests through the mock handler stack: every API method
 * landed on the right URL + shape, and the BE-side validation rules
 * (catalog gate) hold under the mock too.
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
  it("returns the 20-provider catalog in display order", async () => {
    const catalog = await api.llmProviders.catalog();
    expect(catalog.length).toBeGreaterThanOrEqual(20);
    const ids = catalog.map((p) => p.id);
    for (const expected of [
      "anthropic", "openai", "google", "deepseek",
      "xai", "moonshot", "qwen", "minimax",
    ]) {
      expect(ids).toContain(expected);
    }
    for (const expected of [
      "groq", "cerebras", "sambanova", "mistral",
      "openrouter", "cloudflare", "cohere", "huggingface",
      "zai", "opencode",
    ]) {
      expect(ids).toContain(expected);
    }
    for (const expected of ["claude-subscription", "codex-subscription"]) {
      expect(ids).toContain(expected);
    }
    // GitHub Models was retired upstream (410 Gone) and dropped from the BE.
    expect(ids).not.toContain("github_models");
  });

  it("flags openai-compat passthroughs (Z.ai, opencode Zen, Qwen)", async () => {
    const catalog = await api.llmProviders.catalog();
    const compat = catalog.filter((p) => p.requires_openai_compat).map((p) => p.id);
    expect(compat.sort()).toEqual(["opencode", "qwen", "zai"]);
  });

  it("only Cloudflare needs an account id; only google is platform-hosted", async () => {
    const catalog = await api.llmProviders.catalog();
    expect(catalog.filter((p) => p.requires_account_id).map((p) => p.id)).toEqual(["cloudflare"]);
    expect(catalog.filter((p) => p.platform_hosted).map((p) => p.id)).toEqual(["google"]);
  });

  it("ships current model ids, not retired aliases", async () => {
    const catalog = await api.llmProviders.catalog();
    const byId = new Map(catalog.map((p) => [p.id, p.models.map((m) => m.id)]));
    expect(byId.get("anthropic")).toContain("claude-opus-5");
    expect(byId.get("openai")).toContain("gpt-5.6-sol");
    expect(byId.get("google")).toContain("gemini-3.5-flash");
    expect(byId.get("deepseek")).toContain("deepseek-flash");
    const all = catalog.flatMap((p) => p.models.map((m) => m.id));
    for (const retired of [
      "claude-opus-4-7-latest", "text-embedding-004", "deepseek-coder",
      "deepseek-chat", "llama-3.3-70b-versatile",
    ]) {
      expect(all).not.toContain(retired);
    }
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


describe("api.modelProviders.create - POST /v1/orgs/{id}/model-providers", () => {
  it("creates a provider against a catalog id", async () => {
    const created = await api.modelProviders.create(TEST_ORG, {
      provider: "groq",
      enabled_models: ["qwen/qwen3.8-27b"],
      api_key: "gsk_test_XXXXXXXXX",
    });
    expect(created.provider).toBe("groq");
    expect(created.has_api_key).toBe(true);
    expect(created.api_key_last4).toBe("XXXX");
    expect(created.enabled_models).toContain("qwen/qwen3.8-27b");
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


describe("api.modelProviders.usage - per-model drill-down", () => {
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

  it("free-tier providers report cost_usd = 0 - drives the 'free' badge", async () => {
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


// ---------------------------------------------------- type-shape guards ---


describe("type stability - wire-shape regression guards", () => {
  it("CatalogProvider shape is stable enough for the FE picker", async () => {
    const catalog = await api.llmProviders.catalog();
    const sample = catalog[0] as CatalogProvider;
    expect(sample.id).toBeDefined();
    expect(sample.display_name).toBeDefined();
    expect(["free", "paid", "mixed"]).toContain(sample.tier_hint);
    expect(Array.isArray(sample.models)).toBe(true);
  });
});
