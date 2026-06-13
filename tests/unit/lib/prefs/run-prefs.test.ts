// @vitest-environment jsdom

/**
 * Run-prefs persistence - the effort dial + model pick chosen next to every
 * "Run with Athena" action must survive a refresh (localStorage, scoped per
 * surface kind: chat vs task), and a stored model must only be restored when
 * it still matches a currently-enabled model on the same rung.
 */

import { beforeEach, describe, expect, it } from "vitest";

import type { EnabledModel } from "@/lib/api/client";
import {
  readStoredEffort,
  readStoredModel,
  restoreModelSelection,
  storeEffort,
  storeModel,
} from "@/lib/prefs/run-prefs";

function enabledModel(extra: Partial<EnabledModel> = {}): EnabledModel {
  return {
    id: "gemini-2.5-pro",
    provider: "google",
    display_name: "Gemini 2.5 Pro",
    source: "athena",
    supports_tools: true,
    supports_vision: true,
    thinking: true,
    thinking_optional: true,
    context_window: 1_000_000,
    input_price: 1.25,
    output_price: 10,
    model_type: "chat",
    enabled: true,
    ...extra,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("effort persistence", () => {
  it("round-trips per scope - chat and task are independent", () => {
    storeEffort("chat", "high");
    storeEffort("task", "max");
    expect(readStoredEffort("chat")).toBe("high");
    expect(readStoredEffort("task")).toBe("max");
  });

  it("returns null when nothing is stored or the stored value is not a level", () => {
    expect(readStoredEffort("chat")).toBeNull();
    window.localStorage.setItem("athena.runPrefs.chat.effort", "turbo");
    expect(readStoredEffort("chat")).toBeNull();
  });
});

describe("model persistence", () => {
  it("round-trips the full selection including the rung", () => {
    storeModel("task", { provider: "google", model: "gemini-2.5-pro", source: "byok" });
    expect(readStoredModel("task")).toEqual({
      provider: "google",
      model: "gemini-2.5-pro",
      source: "byok",
    });
  });

  it("rejects malformed or wrong-shaped stored JSON", () => {
    window.localStorage.setItem("athena.runPrefs.chat.model", "not json");
    expect(readStoredModel("chat")).toBeNull();
    window.localStorage.setItem("athena.runPrefs.chat.model", JSON.stringify({ provider: 1 }));
    expect(readStoredModel("chat")).toBeNull();
  });
});

describe("restoreModelSelection", () => {
  it("restores a pick that still matches an enabled model on the same rung", () => {
    storeModel("chat", { provider: "google", model: "gemini-2.5-pro", source: "athena" });
    expect(restoreModelSelection("chat", [enabledModel()])).toEqual({
      provider: "google",
      model: "gemini-2.5-pro",
      source: "athena",
    });
  });

  it("does NOT restore the same model offered only on a different rung", () => {
    storeModel("chat", { provider: "google", model: "gemini-2.5-pro", source: "byok" });
    expect(restoreModelSelection("chat", [enabledModel({ source: "athena" })])).toBeNull();
  });

  it("does not restore a model that is disabled or no longer offered", () => {
    storeModel("task", { provider: "google", model: "gemini-2.5-pro", source: "athena" });
    expect(restoreModelSelection("task", [enabledModel({ enabled: false })])).toBeNull();
    expect(restoreModelSelection("task", [enabledModel({ id: "gemini-2.5-flash" })])).toBeNull();
  });

  it("a pre-rung-split pick without source matches on (provider, model) and adopts the row's rung", () => {
    window.localStorage.setItem(
      "athena.runPrefs.task.model",
      JSON.stringify({ provider: "google", model: "gemini-2.5-pro" }),
    );
    expect(restoreModelSelection("task", [enabledModel({ source: "byok" })])).toEqual({
      provider: "google",
      model: "gemini-2.5-pro",
      source: "byok",
    });
  });

  it("returns null when nothing is stored", () => {
    expect(restoreModelSelection("chat", [enabledModel()])).toBeNull();
  });
});
