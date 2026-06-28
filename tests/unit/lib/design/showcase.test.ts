import { describe, expect, it } from "vitest";

import { buildShowcaseHtml } from "@/lib/design/showcase";
import { parseCssTokens } from "@/lib/design/parse";

const CSS = ":root { --color-primary: #31628F; --space-4: 1rem; }";

describe("buildShowcaseHtml", () => {
  it("injects each component's css and renders its markup", () => {
    const html = buildShowcaseHtml(CSS, parseCssTokens(CSS), [
      { name: "Primary Button", css: ".btn{color:var(--color-primary)}", markup: "<button class='btn'>Go</button>" },
    ]);
    // The component css is embedded in the <style> so var(--token) resolves.
    expect(html).toContain(".btn{color:var(--color-primary)}");
    // The markup is rendered (inert; the iframe is sandbox="").
    expect(html).toContain("<button class='btn'>Go</button>");
    expect(html).toContain('class="comp-name">Primary Button');
    // The system's primary color swatch is present.
    expect(html).toContain("#31628F");
  });

  it("falls back to sample panels when a system has no components", () => {
    const html = buildShowcaseHtml(CSS, parseCssTokens(CSS), []);
    expect(html).toContain("Card title");
    expect(html).not.toContain('class="comp"');
  });
});
