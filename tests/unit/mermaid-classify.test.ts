// @vitest-environment jsdom

/**
 * Mermaid component-type styling - the two pure mechanics behind the
 * draw.io-style differentiation in components/ui/mermaid-diagram.tsx:
 *
 *   - `injectClassDefs` registers the component classes so `:::type` tags from
 *     the backend/model parse, ONLY on flowchart/graph diagrams, idempotently.
 *   - `classifyNodes` stamps `athena-c-<type>` on each node group - respecting
 *     an explicit `:::type` (the bare class Mermaid leaves on the <g>), else
 *     inferring from the label, else leaving the node neutral.
 *
 * These are what make every existing diagram (chat, blueprint, dossier) light
 * up without a re-ingest, so they're worth pinning.
 */

import { describe, it, expect } from "vitest";

import { injectClassDefs, classifyNodes, sanitizeMermaid } from "@/components/ui/mermaid-diagram";

describe("sanitizeMermaid", () => {
  it("strips a leaked [node:<id>] citation marker out of a node label", () => {
    // Real failure mode: the apex prompt's prose citation marker leaked into a
    // diagram label, rendering a raw uuid (and nesting `]` inside `["..."]`).
    const src =
      'flowchart TB\n  a11y["Accessibility Bridge [node:5954cbca-13d6-451f-8883-3b7ef31973ee]"]:::service';
    const out = sanitizeMermaid(src);
    expect(out).not.toContain("[node:");
    expect(out).toContain('a11y["Accessibility Bridge"]:::service');
  });

  it("normalises smart quotes back to ASCII", () => {
    expect(sanitizeMermaid("flowchart LR\n  A[“Name”]")).toContain('A["Name"]');
    expect(sanitizeMermaid("flowchart LR\n  A[‘x’]")).toContain("A['x']");
  });

  it("leaves a clean diagram untouched (idempotent + safe)", () => {
    const clean = "flowchart LR\n  A[App] -->|calls| B[(Store)]";
    expect(sanitizeMermaid(clean)).toBe(clean);
    expect(sanitizeMermaid(sanitizeMermaid(clean))).toBe(clean);
  });
});

describe("injectClassDefs", () => {
  it("inserts classDef registrations after a flowchart header", () => {
    const out = injectClassDefs("flowchart LR\n  A[App] --> B[Lib]");
    const lines = out.split("\n");
    expect(lines[0]).toBe("flowchart LR");
    // The whole component vocabulary is registered, right after the header.
    for (const t of ["gateway", "service", "data", "queue", "external", "ui", "config"]) {
      expect(out).toContain(`classDef ${t} `);
    }
    expect(lines[1]!.startsWith("classDef ")).toBe(true);
    // The original body is preserved below the preamble.
    expect(out).toContain("A[App] --> B[Lib]");
  });

  it("also handles the legacy `graph` directive", () => {
    expect(injectClassDefs("graph TD\n  A --> B")).toContain("classDef data ");
  });

  it("leaves non-flowchart diagrams untouched (classDef is illegal there)", () => {
    const seq = "sequenceDiagram\n  A->>B: hi";
    expect(injectClassDefs(seq)).toBe(seq);
    const cls = "classDiagram\n  A <|-- B";
    expect(injectClassDefs(cls)).toBe(cls);
  });

  it("is idempotent - a class the source already defines is not re-added", () => {
    const src = "flowchart LR\nclassDef data fill:#abc\n  A[(Store)]:::data";
    const out = injectClassDefs(src);
    expect(out.match(/classDef data /g)).toHaveLength(1); // the source's own def is kept
    expect(out).toContain("classDef gateway "); // the rest are still added
  });
});

describe("classifyNodes", () => {
  function nodeWith(opts: { cls?: string; label?: string }): SVGGElement {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", `node default${opts.cls ? ` ${opts.cls}` : ""}`);
    if (opts.label) g.textContent = opts.label;
    return g;
  }

  function classify(nodes: SVGGElement[]): SVGGElement[] {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const n of nodes) svg.appendChild(n);
    const root = document.createElement("div");
    root.appendChild(svg);
    classifyNodes(root);
    return nodes;
  }

  it("respects an explicit `:::type` tag Mermaid left on the group", () => {
    const [n] = classify([nodeWith({ cls: "data", label: "anything" })]);
    expect(n!.classList.contains("athena-c-data")).toBe(true);
  });

  it("infers the type from the label when there is no tag", () => {
    const [db, svc, ext, ui] = classify([
      nodeWith({ label: "Postgres database" }),
      nodeWith({ label: "Checkout service" }),
      nodeWith({ label: "Stripe webhook" }),
      nodeWith({ label: "Dashboard page" }),
    ]);
    expect(db!.classList.contains("athena-c-data")).toBe(true);
    expect(svc!.classList.contains("athena-c-service")).toBe(true);
    expect(ext!.classList.contains("athena-c-external")).toBe(true);
    expect(ui!.classList.contains("athena-c-ui")).toBe(true);
  });

  it("leaves a node with no clear signal neutral", () => {
    const [n] = classify([nodeWith({ label: "Widgetizer 3000" })]);
    expect([...n!.classList].some((c) => c.startsWith("athena-c-"))).toBe(false);
  });
});
