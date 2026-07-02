import { describe, expect, it } from "vitest";

import { buildComponentPreviewHtml, buildShowcaseHtml } from "@/lib/design/showcase";
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
    expect(html).toContain('class="sw-comp-name">Primary Button');
    // The system's primary color swatch is present.
    expect(html).toContain("#31628F");
  });

  it("falls back to sample panels when a system has no components", () => {
    const html = buildShowcaseHtml(CSS, parseCssTokens(CSS), []);
    expect(html).toContain("Card title");
    expect(html).not.toContain('class="sw-comp"');
  });

  it("keeps chrome selectors sw-prefixed so user component classes are never hijacked", () => {
    const html = buildShowcaseHtml(CSS, parseCssTokens(CSS), [
      { name: "Button", css: ".btn{background:red}", markup: "<button class='btn'>Go</button>" },
    ]);
    // The chrome stylesheet is emitted AFTER the user css - generic .btn/.card
    // rules there would silently override the user's own components.
    const chrome = html.slice(html.indexOf("*{box-sizing"));
    expect(chrome).not.toMatch(/\.(btn|card|chip|stage|panel|panels|type|lbl|val|h|sw|pal|comp|stages)\s*[{.:>]/);
    expect(chrome).toContain(".sw-stage");
    expect(chrome).toContain(".sw-btn");
  });

  it("skips markup that could break out of the inert preview document", () => {
    const html = buildShowcaseHtml(CSS, parseCssTokens(CSS), [
      { name: "Evil", css: "", markup: "<script>alert(1)</script>" },
      { name: "Truncator", css: "", markup: "</html><b>after</b>" },
    ]);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("</html><b>after</b>");
    // The component section still renders (with the skip notice), so one bad
    // sample doesn't blank its container.
    expect(html).toContain('class="sw-comp-name">Evil');
    expect(html).toContain("Markup skipped in the preview");
  });

  it("does not render a shadow token's rgba() as a color swatch", () => {
    const css = ":root { --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.4); --color-primary: #31628F; }";
    const html = buildShowcaseHtml(css, parseCssTokens(css), []);
    expect(html).toContain("#31628F");
    expect(html).not.toContain('style="background:0 1px 2px');
  });
});

describe("buildComponentPreviewHtml", () => {
  it("builds a single-component doc over the system css", () => {
    const html = buildComponentPreviewHtml(CSS, {
      name: "Button",
      css: ".btn{color:var(--color-primary)}",
      markup: "<button class='btn'>Go</button>",
    });
    expect(html).toContain(".btn{color:var(--color-primary)}");
    expect(html).toContain("<button class='btn'>Go</button>");
  });

  it("applies the same markup containment rule", () => {
    const html = buildComponentPreviewHtml(CSS, { name: "Evil", css: "", markup: "<script>x</script>" });
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("Markup skipped in the preview");
  });
});
