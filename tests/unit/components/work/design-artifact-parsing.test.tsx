// @vitest-environment jsdom

/**
 * Design-artifact rendering/saving hardening:
 *  - `parseSegments` handles CRLF bodies (agents on Windows-ish stacks emit
 *    \r\n; the fence regex previously never matched and the whole design
 *    rendered as a wall of escaped text);
 *  - `withUnfencedPrototype` synthesizes an html segment when the agent
 *    skipped the ```html fence but shipped a whole <!doctype html> document;
 *  - `replaceFirstOccurrence` is the save splice: first occurrence ONLY, so a
 *    body with several html fences (or identical duplicates) never gets fence
 *    #1 overwritten by a save from studio #2;
 *  - `normalizeColor` bridges computed "rgb(r, g, b)" styles and hex/oklch
 *    authored tokens so matchToken / the knob active check actually match;
 *  - end-to-end: a CRLF-fenced / unfenced design body still MOUNTS a studio
 *    through the real ArtifactCard render.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { artifactMock, versionsMock, designTokensMock } = vi.hoisted(() => ({
  artifactMock: vi.fn(),
  versionsMock: vi.fn(),
  designTokensMock: vi.fn(),
}));

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client",
  );
  return {
    ...actual,
    api: {
      ...actual.api,
      tasks: {
        ...actual.api.tasks,
        artifact: artifactMock,
        artifactVersions: versionsMock,
      },
      design: {
        ...actual.api.design,
        tokens: designTokensMock,
      },
    },
  };
});

vi.mock("@/components/theme/theme-provider", () => ({
  useTheme: () => ({ theme: "light", resolvedTheme: "light", setTheme: vi.fn() }),
}));
vi.mock("mermaid", () => ({
  default: { initialize: vi.fn(), render: vi.fn(async () => ({ svg: "<svg />" })) },
}));

import {
  ArtifactCard,
  parseSegments,
  replaceFirstOccurrence,
  withUnfencedPrototype,
} from "@/components/work/artifact-card";
import { matchToken, normalizeColor } from "@/lib/design/tokens";
import type { DesignToken } from "@/lib/api/client";

const PROTO = "<!doctype html><html><body><h1>Proto</h1></body></html>";
const LF_BODY = `Intro prose.\n\n\`\`\`html\n${PROTO}\n\`\`\`\n\nOutro prose.`;

describe("parseSegments - CRLF fences", () => {
  it("parses a CRLF body identically to its LF twin", () => {
    const crlf = LF_BODY.replace(/\n/g, "\r\n");
    const segs = parseSegments(crlf);
    expect(segs).toEqual(parseSegments(LF_BODY));
    const code = segs.find((s) => s.type === "code");
    expect(code).toMatchObject({ type: "code", lang: "html" });
    expect(code && "code" in code ? code.code : "").toContain("<!doctype html>");
  });

  it("still falls through to prose on an unterminated fence", () => {
    const segs = parseSegments("```html\r\nno closing fence");
    expect(segs).toEqual([{ type: "prose", text: "```html\nno closing fence" }]);
  });
});

describe("withUnfencedPrototype - doctype fallback for design kinds", () => {
  it("synthesizes an html segment from an unfenced doctype block, keeping prose", () => {
    const body = `Here is the prototype:\n\n${PROTO}\n\nNotes after.`;
    const segs = withUnfencedPrototype(parseSegments(body), body);
    expect(segs).toEqual([
      { type: "prose", text: "Here is the prototype:\n\n" },
      { type: "code", lang: "html", code: PROTO },
      { type: "prose", text: "\n\nNotes after." },
    ]);
  });

  it("recovers the FULL document when an inline script contains a literal '</html>'", () => {
    // A '</html>' inside a <script> string must NOT truncate the synthesized
    // segment (a truncated segment breaks the preview and corrupts the
    // artifact on the next save splice) - the fallback anchors to the LAST
    // close tag.
    const proto =
      "<!doctype html><html><body><script>var tpl = '</html>';</script><h1>Full</h1></body></html>";
    const body = `Prose before.\n\n${proto}\n\nProse after.`;
    const segs = withUnfencedPrototype(parseSegments(body), body);
    expect(segs).toEqual([
      { type: "prose", text: "Prose before.\n\n" },
      { type: "code", lang: "html", code: proto },
      { type: "prose", text: "\n\nProse after." },
    ]);
  });

  it("leaves a properly fenced body untouched", () => {
    const segs = parseSegments(LF_BODY);
    expect(withUnfencedPrototype(segs, LF_BODY)).toBe(segs);
  });

  it("leaves a body with no doctype untouched", () => {
    const segs = parseSegments("just prose, no prototype");
    expect(withUnfencedPrototype(segs, "just prose, no prototype")).toBe(segs);
  });
});

describe("replaceFirstOccurrence - the save splice", () => {
  const fenceA = "<!doctype html><html><body>A</body></html>";
  const fenceB = "<!doctype html><html><body>B</body></html>";
  const body = `One\n\n\`\`\`html\n${fenceA}\n\`\`\`\n\nTwo\n\n\`\`\`html\n${fenceB}\n\`\`\``;

  it("replaces only its own fence in a multi-fence body", () => {
    const next = replaceFirstOccurrence(body, fenceB, "<html>NEW</html>");
    expect(next).toContain(fenceA); // fence #1 untouched
    expect(next).toContain("<html>NEW</html>");
    expect(next).not.toContain(fenceB);
  });

  it("replaces only the FIRST of identical duplicate fences", () => {
    const dup = `\`\`\`html\n${fenceA}\n\`\`\`\n\n\`\`\`html\n${fenceA}\n\`\`\``;
    const next = replaceFirstOccurrence(dup, fenceA, "<html>NEW</html>");
    expect(next).not.toBeNull();
    const occurrences = (next ?? "").split(fenceA).length - 1;
    expect(occurrences).toBe(1); // the second copy survives
    expect((next ?? "").indexOf("<html>NEW</html>")).toBeLessThan(
      (next ?? "").indexOf(fenceA),
    );
  });

  it("returns null when the target is absent (never corrupts)", () => {
    expect(replaceFirstOccurrence(body, "<html>missing</html>", "x")).toBeNull();
  });
});

describe("normalizeColor + matchToken", () => {
  it("normalizes hex to the computed rgb() form", () => {
    expect(normalizeColor("#fff")).toBe("rgb(255, 255, 255)");
    expect(normalizeColor("#111827")).toBe("rgb(17, 24, 39)");
    expect(normalizeColor("#111827")).toBe(normalizeColor("rgb(17, 24, 39)"));
  });

  it("normalizes rgb()/rgba() spacing and case, passes oklch through", () => {
    expect(normalizeColor("RGB(17,24,39)")).toBe("rgb(17, 24, 39)");
    expect(normalizeColor("rgba(0, 0,0, 0.5)")).toBe("rgba(0, 0, 0, 0.5)");
    expect(normalizeColor("oklch(0.7 0.1 250)")).toBe("oklch(0.7 0.1 250)");
    expect(normalizeColor("  #FFF  ")).toBe("rgb(255, 255, 255)");
    expect(normalizeColor("")).toBe("");
  });

  it("normalizes 4/8-digit hex alpha to the computed rgba() form", () => {
    expect(normalizeColor("#fff8")).toBe("rgba(255, 255, 255, 0.533)");
    expect(normalizeColor("#11182780")).toBe("rgba(17, 24, 39, 0.5)");
    // A fully-opaque alpha collapses to the rgb() form computed styles use.
    expect(normalizeColor("#111827ff")).toBe("rgb(17, 24, 39)");
  });

  it("maps transparent to the computed rgba(0, 0, 0, 0)", () => {
    expect(normalizeColor("transparent")).toBe("rgba(0, 0, 0, 0)");
    expect(normalizeColor("transparent")).toBe(normalizeColor("rgba(0, 0, 0, 0)"));
  });

  it("normalizes modern space-syntax rgb() and %-alpha to the comma rgba form", () => {
    expect(normalizeColor("rgb(255 0 0 / 50%)")).toBe("rgba(255, 0, 0, 0.5)");
    expect(normalizeColor("rgb(255 0 0)")).toBe("rgb(255, 0, 0)");
  });

  it("trims trailing-zero alphas so '0.50' and '0.5' match", () => {
    expect(normalizeColor("rgba(0, 0, 0, 0.50)")).toBe("rgba(0, 0, 0, 0.5)");
    expect(normalizeColor("rgba(0, 0, 0, 0.50)")).toBe(normalizeColor("rgba(0, 0, 0, 0.5)"));
  });

  it("matchToken matches a computed rgb() against a hex-authored token", () => {
    const ink: DesignToken = { name: "ink", value: "#111827", group: "color", source: "code" };
    expect(matchToken("rgb(17, 24, 39)", [ink])).toBe(ink);
    expect(matchToken("rgb(1, 2, 3)", [ink])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// End-to-end: the studio still MOUNTS for hostile design bodies.
// ---------------------------------------------------------------------------

function renderDesignCard() {
  return render(
    <ArtifactCard
      taskId="t1"
      artifactId="a1"
      artifactKind="design_doc"
      stageTitle="Design"
    />,
  );
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  versionsMock.mockResolvedValue([]);
  designTokensMock.mockResolvedValue({ tokens: [], origin: "empty", repo_id: null });
});

const detail = (body: string) => ({
  artifact_id: "a1",
  kind: "design_doc",
  version: 1,
  body,
  who_kind: "agent",
  created_at: "2026-06-10T00:00:00Z",
});

describe("ArtifactCard - design bodies mount a studio, not a text wall", () => {
  it("mounts the studio for a CRLF-fenced prototype", async () => {
    artifactMock.mockResolvedValue(detail(LF_BODY.replace(/\n/g, "\r\n")));
    renderDesignCard();
    expect(await screen.findByTitle("Design prototype preview")).toBeTruthy();
    expect(screen.getByText(/intro prose/i)).toBeTruthy();
  });

  it("mounts the studio for an UNFENCED doctype prototype", async () => {
    artifactMock.mockResolvedValue(
      detail(`Here is the prototype:\n\n${PROTO}\n\nNotes after.`),
    );
    renderDesignCard();
    expect(await screen.findByTitle("Design prototype preview")).toBeTruthy();
    expect(screen.getByText(/notes after/i)).toBeTruthy();
  });

  it("mounts one studio PER html fence in a multi-fence body", async () => {
    const two = `\`\`\`html\n<!doctype html><html><body>A</body></html>\n\`\`\`\n\nand\n\n\`\`\`html\n<!doctype html><html><body>B</body></html>\n\`\`\``;
    artifactMock.mockResolvedValue(detail(two));
    renderDesignCard();
    expect(await screen.findAllByTitle("Design prototype preview")).toHaveLength(2);
  });
});
