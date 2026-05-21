import { describe, expect, it } from "vitest";

import { config } from "@/lib/config";

describe("config", () => {
  it("exposes the API URL as a string", () => {
    expect(typeof config.apiUrl).toBe("string");
    expect(config.apiUrl.length).toBeGreaterThan(0);
  });

  it("trims trailing slashes off the API URL for predictable concat", () => {
    expect(config.apiUrl.endsWith("/")).toBe(false);
  });

  it("has the app name default", () => {
    expect(config.appName.length).toBeGreaterThan(0);
  });
});
