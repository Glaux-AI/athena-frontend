"use client";

/**
 * ChatMarkdown — renders an assistant message body as formatted markdown:
 * headings, bold/italic, inline + fenced code, ordered/unordered lists,
 * GFM tables, blockquotes, links, and ```mermaid``` diagrams (rendered
 * client-side to static SVG, lazy-loaded so mermaid stays out of the main
 * bundle).
 *
 * Mermaid detection rides react-markdown's own fence parser: a fenced block
 * tagged `mermaid` arrives as `<code class="language-mermaid">`, which we
 * render as a diagram instead of a code box (and unwrap its `<pre>` so it
 * isn't framed). This is robust to indentation, CRLF, and trailing
 * whitespace that a hand-rolled regex would miss. Tokens-only styling — no
 * color literals — and no `dangerouslySetInnerHTML`, so untrusted model
 * output is never an HTML-injection surface.
 */

import { isValidElement, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/cn";
import { MermaidDiagram } from "@/components/ui/mermaid-diagram";
import type { CitationSource } from "@/components/runs/citations/citation-chip";

/** Flatten a react-markdown code node back to its source text. */
function codeText(child: ReactNode): string {
  if (typeof child === "string") return child;
  if (typeof child === "number") return String(child);
  if (Array.isArray(child)) return child.map(codeText).join("");
  if (isValidElement(child)) return codeText((child.props as { children?: ReactNode }).children);
  return "";
}

/** True when a `<pre>`'s child is a fenced ```mermaid block. */
function isMermaidPre(child: ReactNode): boolean {
  return (
    isValidElement(child) &&
    typeof (child.props as { className?: string }).className === "string" &&
    /\blanguage-mermaid\b/.test((child.props as { className?: string }).className!)
  );
}

const MD_COMPONENTS: Components = {
  pre({ children }) {
    // A mermaid block renders as a diagram — drop the code frame around it.
    if (isMermaidPre(children)) return <>{children}</>;
    return <CodeBlock>{children}</CodeBlock>;
  },
  code({ className, children }) {
    const lang = /language-(\w+)/.exec(className ?? "")?.[1];
    if (lang === "mermaid") {
      return <MermaidDiagram chart={codeText(children).replace(/\n+$/, "")} />;
    }
    const isBlock = /language-/.test(className ?? "") || String(children ?? "").includes("\n");
    if (isBlock) {
      return <code className={cn("font-mono", className)}>{children}</code>;
    }
    return (
      <code className="rounded bg-[var(--code-bg)] px-1 py-0.5 font-mono text-[0.85em]">
        {children}
      </code>
    );
  },
  table({ children }) {
    return (
      <div className="my-2 overflow-x-auto">
        <table className="w-full border-collapse text-xs">{children}</table>
      </div>
    );
  },
};

// Inline knowledge citations. The chat agent writes `[node:<id>]`,
// `[convention:<id>]`, `[note:<id>]`, `[past:<id>]` markers into its prose;
// raw, they show ugly UUIDs + line ranges. We rewrite each into a markdown
// link carrying a private scheme + a clean sequential number, then render
// those as small superscript chips wired to the citation drawer — so the
// reader sees "¹" and clicks through to the real source, never the id.
const CITE_RE = /\[(node|convention|note|past):([^\]]+)\]/g;
const CITE_SCHEME = "athena-cite:";

const KIND_LABEL: Record<string, string> = {
  node: "source",
  convention: "decision",
  note: "note",
  past: "prior",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A short, human-readable label for a citation: the file basename for a
 *  path-style ref (what weaker models emit), else the kind word — never a
 *  bare number or a raw UUID. */
function citationLabel(kind: string, ref: string): string {
  const r = ref.replace(/:L\d+(?:-L?\d+)?$/, "").trim();
  if (!UUID_RE.test(r) && /[/.]/.test(r)) {
    const base = r.split("/").pop() || r;
    return base.length > 32 ? base.slice(0, 31) + "…" : base;
  }
  return KIND_LABEL[kind] ?? "source";
}

// A nested `kind:` prefix inside a bracket body — models sometimes pack
// several refs into one citation: `[node:<id1>, node:<id2>]`.
const INNER_KIND_RE = /^(node|convention|note|past):/;

function linkifyCitations(content: string): string {
  return content.replace(CITE_RE, (full: string, kind: string, inner: string) => {
    // One chip per comma-separated ref so each resolves on its own — a packed
    // multi-id citation rendered as a single chip could never resolve.
    const links = inner
      .split(",")
      .map((part) => {
        let ref = part.trim();
        let k = kind;
        const nested = INNER_KIND_RE.exec(ref);
        if (nested) {
          k = nested[1]!;
          ref = ref.slice(nested[0].length).trim();
        }
        if (!ref) return null;
        const label = citationLabel(k, ref).replace(/[[\]]/g, "");
        // All four kinds resolve through the knowledge ("kn") source.
        return `[${label}](${CITE_SCHEME}kn:${encodeURIComponent(ref)})`;
      })
      .filter(Boolean);
    return links.length > 0 ? links.join(" ") : full;
  });
}

function parseCitationHref(href: string): { source: CitationSource; ref: string } | null {
  if (!href.startsWith(CITE_SCHEME)) return null;
  const rest = href.slice(CITE_SCHEME.length);
  const sep = rest.indexOf(":");
  if (sep === -1) return null;
  return {
    source: rest.slice(0, sep) as CitationSource,
    ref: decodeURIComponent(rest.slice(sep + 1)),
  };
}

// Preserve our private citation scheme; defer everything else to react-markdown's
// default URL sanitiser (which would otherwise strip the unknown scheme).
const transformCitationUrl = (url: string): string =>
  url.startsWith(CITE_SCHEME) ? url : defaultUrlTransform(url);

export function ChatMarkdown({
  content,
  className,
  onCitation,
}: {
  content: string;
  className?: string;
  /** Open the citation drawer for an inline `[node:…]`/`[convention:…]` chip.
   *  `label` is the chip's visible text so the drawer can lead with it. */
  onCitation?: (source: CitationSource, ref: string, label?: string) => void;
}) {
  const components = useMemo<Components>(
    () => ({
      ...MD_COMPONENTS,
      a({ children, href }) {
        const cite = href ? parseCitationHref(href) : null;
        if (cite) {
          const label = codeText(children).trim();
          return (
            <button
              type="button"
              data-testid="inline-citation"
              title={cite.ref}
              onClick={() => onCitation?.(cite.source, cite.ref, label || undefined)}
              className="mx-0.5 inline-flex items-baseline gap-0.5 rounded border border-[var(--border)] bg-[var(--surface-2)] px-1 text-[0.82em] font-medium text-[var(--primary)] no-underline hover:bg-[var(--surface)] hover:border-[var(--border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              {children}
            </button>
          );
        }
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--primary)] underline underline-offset-2 hover:opacity-80"
          >
            {children}
          </a>
        );
      },
    }),
    [onCitation],
  );

  return (
    <div
      className={cn(
        "text-sm leading-relaxed break-words",
        "[&_p]:my-1.5 [&>:first-child]:mt-0 [&>:last-child]:mb-0",
        "[&_h1]:mb-1.5 [&_h1]:mt-3 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-[var(--text)]",
        "[&_h2]:mb-1.5 [&_h2]:mt-3 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-[var(--text)]",
        "[&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-[var(--text)]",
        "[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_li]:my-0.5 [&_li>ul]:my-0.5 [&_li>ol]:my-0.5",
        "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--border)] [&_blockquote]:pl-3 [&_blockquote]:text-[var(--text-muted)]",
        "[&_th]:border [&_th]:border-[var(--border)] [&_th]:bg-[var(--surface-2)] [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold",
        "[&_td]:border [&_td]:border-[var(--border)] [&_td]:px-2 [&_td]:py-1",
        "[&_hr]:my-3 [&_hr]:border-[var(--border)] [&_strong]:font-semibold",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={transformCitationUrl}
        components={components}
      >
        {linkifyCitations(content)}
      </ReactMarkdown>
    </div>
  );
}

/** A fenced code block with a hover copy button. */
function CodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const text = codeText(children).replace(/\n$/, "");

  const copy = () => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="group relative my-2">
      <pre className="overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--code-bg)] p-3 text-[0.8rem] leading-relaxed">
        {children}
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy code"}
        className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] opacity-0 transition-opacity hover:text-[var(--text)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] group-hover:opacity-100"
      >
        {copied ? <Check className="size-3.5 text-[var(--success)]" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}
